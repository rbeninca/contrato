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

function normalizeRefId(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function extractContractRefs(rawData, rawPayload) {
  return {
    propertyId: normalizeRefId(rawPayload?.propertyId || rawData?.selectedPropertyId || ''),
    landlordId: normalizeRefId(rawPayload?.landlordId || rawData?.selectedLandlordId || ''),
    tenantId: normalizeRefId(rawPayload?.tenantId || rawData?.selectedTenantId || '')
  };
}

function normalizeVersionFilters(rawFilters = {}) {
  return {
    propertyId: normalizeRefId(rawFilters?.propertyId || ''),
    landlordId: normalizeRefId(rawFilters?.landlordId || ''),
    tenantId: normalizeRefId(rawFilters?.tenantId || '')
  };
}

function applyVersionFilters(versions, filters) {
  return versions.filter((version) => {
    if (filters.propertyId && version.propertyId !== filters.propertyId) return false;
    if (filters.landlordId && version.landlordId !== filters.landlordId) return false;
    if (filters.tenantId && version.tenantId !== filters.tenantId) return false;
    return true;
  });
}

function normalizeVersionPayload(raw) {
  const isoSavedAt = toIsoDate(raw.savedAt) || new Date().toISOString();
  const safeData = cloneSafeData(raw.data);
  const refs = extractContractRefs(safeData, raw);

  if (refs.propertyId && !safeData.selectedPropertyId) safeData.selectedPropertyId = refs.propertyId;
  if (refs.landlordId && !safeData.selectedLandlordId) safeData.selectedLandlordId = refs.landlordId;
  if (refs.tenantId && !safeData.selectedTenantId) safeData.selectedTenantId = refs.tenantId;

  return {
    id: raw.id || generateVersionId(),
    name: raw.name || 'Versão',
    savedAt: isoSavedAt,
    editorName: raw.editorName || 'DESCONHECIDO',
    propertyId: refs.propertyId,
    landlordId: refs.landlordId,
    tenantId: refs.tenantId,
    data: safeData
  };
}

async function listVersions(ownerId, rawFilters = {}) {
  const fb = await waitForFirebase();
  const filters = normalizeVersionFilters(rawFilters);

  const queryParts = [
    fb.collection(fb.db, 'contracts'),
    fb.where('ownerId', '==', ownerId)
  ];

  if (filters.propertyId) {
    queryParts.push(fb.where('propertyId', '==', filters.propertyId));
  }
  if (filters.landlordId) {
    queryParts.push(fb.where('landlordId', '==', filters.landlordId));
  }
  if (filters.tenantId) {
    queryParts.push(fb.where('tenantId', '==', filters.tenantId));
  }

  queryParts.push(fb.orderBy('savedAt', 'desc'));

  try {
    const q = fb.query(...queryParts);
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
    const normalized = snapFallback.docs
      .map((item) => {
        const data = item.data();
        return normalizeVersionPayload({ ...data, id: item.id });
      })
      .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

    return applyVersionFilters(normalized, filters);
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
    propertyId: safeVersion.propertyId || '',
    landlordId: safeVersion.landlordId || '',
    tenantId: safeVersion.tenantId || '',
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
