function waitForFirebase(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (window.AppFirebase?.ready) {
        clearInterval(timer);
        resolve(window.AppFirebase);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error(window.AppFirebase?.error || 'Firebase indisponível.'));
      }
    }, 100);
  });
}

function toIsoDate(value) {
  if (!value) return null;

  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (typeof value?.toDate === 'function') {
    const d = value.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
  }

  return null;
}

function generateVersionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function cloneSafeData(data) {
  try {
    return JSON.parse(JSON.stringify(data || {}));
  } catch {
    return {};
  }
}

function normalizeVersionPayload(raw) {
  const isoSavedAt = toIsoDate(raw.savedAt) || new Date().toISOString();
  return {
    id: raw.id || generateVersionId(),
    name: raw.name || 'Versão',
    savedAt: isoSavedAt,
    editorName: raw.editorName || 'DESCONHECIDO',
    data: cloneSafeData(raw.data)
  };
}

async function listVersions(ownerId) {
  const fb = await waitForFirebase();
  try {
    const q = fb.query(
      fb.collection(fb.db, 'contracts'),
      fb.where('ownerId', '==', ownerId),
      fb.orderBy('savedAt', 'desc')
    );
    const snap = await fb.getDocs(q);
    return snap.docs.map((item) => {
      const data = item.data();
      return normalizeVersionPayload({ ...data, id: item.id });
    });
  } catch (error) {
    const qFallback = fb.query(
      fb.collection(fb.db, 'contracts'),
      fb.where('ownerId', '==', ownerId)
    );
    const snapFallback = await fb.getDocs(qFallback);
    return snapFallback.docs
      .map((item) => {
        const data = item.data();
        return normalizeVersionPayload({ ...data, id: item.id });
      })
      .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  }
}

async function upsertVersion(ownerId, version) {
  const fb = await waitForFirebase();
  const safeVersion = normalizeVersionPayload(version);
  const ref = fb.doc(fb.db, 'contracts', safeVersion.id);

  // Descobre se já existe
  const snap = await fb.getDoc(ref);
  const exists = snap.exists();
  const currentData = exists ? snap.data() : null;

  if (exists && currentData?.ownerId && currentData.ownerId !== ownerId) {
    throw new Error('Você não tem permissão para alterar esta versão.');
  }

  const payload = {
    ownerId,
    name: safeVersion.name,
    savedAt: safeVersion.savedAt,
    editorName: safeVersion.editorName,
    data: safeVersion.data,
    source: 'legacy-version',
    updatedAt: fb.serverTimestamp()
  };

  // Só define createdAt se for novo
  if (!exists) {
    payload.createdAt = fb.serverTimestamp();
  }

  await fb.setDoc(ref, payload, { merge: true });

  return safeVersion;
}

async function deleteVersion(ownerId, versionId) {
  const fb = await waitForFirebase();
  const ref = fb.doc(fb.db, 'contracts', versionId);

  const current = await fb.getDoc(ref);
  if (!current.exists()) return;

  const currentData = current.data();
  if (currentData?.ownerId !== ownerId) {
    throw new Error('Você não tem permissão para excluir esta versão.');
  }

  await fb.deleteDoc(ref);
}

async function upsertManyVersions(ownerId, versions) {
  const normalized = Array.isArray(versions) ? versions : [];
  for (const version of normalized) {
    await upsertVersion(ownerId, version);
  }
}

window.ContractsRepo = {
  listVersions,
  upsertVersion,
  upsertManyVersions,
  deleteVersion
};
