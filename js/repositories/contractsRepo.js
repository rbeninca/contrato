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

function normalizeVersionPayload(raw) {
  return {
    id: raw.id,
    name: raw.name || 'Versão',
    savedAt: raw.savedAt || new Date().toISOString(),
    editorName: raw.editorName || 'DESCONHECIDO',
    data: raw.data || {}
  };
}

async function listVersions(ownerId) {
  const fb = await waitForFirebase();
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
}

async function upsertVersion(ownerId, version) {
  const fb = await waitForFirebase();
  const safeVersion = normalizeVersionPayload(version);
  const ref = fb.doc(fb.db, 'contracts', safeVersion.id);

  const payload = {
    ownerId,
    name: safeVersion.name,
    savedAt: safeVersion.savedAt,
    editorName: safeVersion.editorName,
    data: safeVersion.data,
    source: 'legacy-version',
    updatedAt: fb.serverTimestamp()
  };

  if (!version?.createdAt) {
    payload.createdAt = fb.serverTimestamp();
  }

  await fb.setDoc(ref, payload, { merge: true });
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

window.ContractsRepo = {
  listVersions,
  upsertVersion,
  deleteVersion
};
