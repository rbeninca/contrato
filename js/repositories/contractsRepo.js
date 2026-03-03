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

function generateContractId() {
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

function normalizeParticipants(raw = {}) {
  return {
    landlordId: normalizeRefId(raw?.landlordId || ''),
    tenantId: normalizeRefId(raw?.tenantId || ''),
    ownerId: normalizeRefId(raw?.ownerId || ''),
    pixPayeeId: normalizeRefId(raw?.pixPayeeId || ''),
    guarantor1Id: normalizeRefId(raw?.guarantor1Id || ''),
    guarantor1SpouseId: normalizeRefId(raw?.guarantor1SpouseId || ''),
    guarantor2Id: normalizeRefId(raw?.guarantor2Id || ''),
    guarantor2SpouseId: normalizeRefId(raw?.guarantor2SpouseId || '')
  };
}

function extractContractRefs(rawData, rawPayload) {
  const participantsRaw = rawPayload?.participants && typeof rawPayload.participants === 'object'
    ? rawPayload.participants
    : {};

  const dataParticipants = rawData?.participants && typeof rawData.participants === 'object'
    ? rawData.participants
    : {};

  const selectedPeople = rawData?.selectedPeople && typeof rawData.selectedPeople === 'object'
    ? rawData.selectedPeople
    : {};

  const legacyParticipants = {
    landlordId: rawPayload?.landlordId || rawData?.selectedLandlordId || selectedPeople.landlordId || dataParticipants.landlordId || '',
    tenantId: rawPayload?.tenantId || rawData?.selectedTenantId || selectedPeople.tenantId || dataParticipants.tenantId || '',
    ownerId: participantsRaw.ownerId || dataParticipants.ownerId || '',
    pixPayeeId: participantsRaw.pixPayeeId || dataParticipants.pixPayeeId || '',
    guarantor1Id: participantsRaw.guarantor1Id || dataParticipants.guarantor1Id || '',
    guarantor1SpouseId: participantsRaw.guarantor1SpouseId || dataParticipants.guarantor1SpouseId || '',
    guarantor2Id: participantsRaw.guarantor2Id || dataParticipants.guarantor2Id || '',
    guarantor2SpouseId: participantsRaw.guarantor2SpouseId || dataParticipants.guarantor2SpouseId || ''
  };

  const participants = normalizeParticipants(legacyParticipants);

  return {
    propertyId: normalizeRefId(rawPayload?.propertyId || rawData?.selectedPropertyId || ''),
    participants
  };
}

function normalizeContractFilters(rawFilters = {}) {
  return {
    propertyId: normalizeRefId(rawFilters?.propertyId || ''),
    participantRole: normalizeRefId(rawFilters?.participantRole || ''),
    participantId: normalizeRefId(rawFilters?.participantId || ''),
    status: normalizeRefId(rawFilters?.status || ''),
    landlordId: normalizeRefId(rawFilters?.landlordId || ''),
    tenantId: normalizeRefId(rawFilters?.tenantId || '')
  };
}

function getParticipantValue(contract, role) {
  if (!role) return '';
  return normalizeRefId(contract?.participants?.[role] || '');
}

function applyContractFilters(contracts, filters) {
  return contracts.filter((contract) => {
    if (filters.propertyId && contract.propertyId !== filters.propertyId) return false;
    if (filters.status && contract.status !== filters.status) return false;

    if (filters.participantRole && filters.participantId) {
      const value = getParticipantValue(contract, filters.participantRole);
      if (value !== filters.participantId) return false;
    }

    if (filters.landlordId && contract.participants.landlordId !== filters.landlordId) return false;
    if (filters.tenantId && contract.participants.tenantId !== filters.tenantId) return false;

    return true;
  });
}

function normalizeContractPayload(raw) {
  const safeData = cloneSafeData(raw.data);
  const refs = extractContractRefs(safeData, raw);

  safeData.selectedPropertyId = refs.propertyId || '';
  safeData.selectedLandlordId = refs.participants.landlordId || '';
  safeData.selectedTenantId = refs.participants.tenantId || '';
  safeData.participants = cloneSafeData(refs.participants);

  const status = (raw.status || 'draft').toString();

  const createdAtIso = toIsoDate(raw.createdAt) || new Date().toISOString();
  const updatedAtIso = toIsoDate(raw.updatedAt) || toIsoDate(raw.savedAt) || createdAtIso;

  return {
    id: raw.id || generateContractId(),
    ownerId: (raw.ownerId || '').toString(),
    name: (raw.name || 'Contrato').toString(),
    editorName: (raw.editorName || 'DESCONHECIDO').toString(),
    propertyId: refs.propertyId,
    participants: refs.participants,
    data: safeData,
    status,
    createdAt: createdAtIso,
    updatedAt: updatedAtIso,
    savedAt: updatedAtIso,
    source: (raw.source || 'contract').toString()
  };
}

function buildContractQueryParts(fb, ownerId, filters) {
  const queryParts = [
    fb.collection(fb.db, 'contracts'),
    fb.where('ownerId', '==', ownerId)
  ];

  if (filters.propertyId) {
    queryParts.push(fb.where('propertyId', '==', filters.propertyId));
  }
  if (filters.status) {
    queryParts.push(fb.where('status', '==', filters.status));
  }

  if (filters.participantRole && filters.participantId) {
    queryParts.push(fb.where(`participants.${filters.participantRole}`, '==', filters.participantId));
  }

  if (filters.landlordId) {
    queryParts.push(fb.where('participants.landlordId', '==', filters.landlordId));
  }
  if (filters.tenantId) {
    queryParts.push(fb.where('participants.tenantId', '==', filters.tenantId));
  }

  queryParts.push(fb.orderBy('updatedAt', 'desc'));

  return queryParts;
}

async function listContracts(ownerId, rawFilters = {}) {
  if (!ownerId) throw new Error('ownerId é obrigatório para listar contratos.');
  const fb = await waitForFirebase();
  const filters = normalizeContractFilters(rawFilters);

  try {
    const qParts = buildContractQueryParts(fb, ownerId, filters);
    const q = fb.query(...qParts);
    const snap = await fb.getDocs(q);
    return snap.docs.map((item) => normalizeContractPayload({ ...item.data(), id: item.id }));
  } catch {
    const qFallback = fb.query(
      fb.collection(fb.db, 'contracts'),
      fb.where('ownerId', '==', ownerId)
    );
    const snapFallback = await fb.getDocs(qFallback);
    const normalized = snapFallback.docs
      .map((item) => normalizeContractPayload({ ...item.data(), id: item.id }))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    return applyContractFilters(normalized, filters);
  }
}

async function upsertContract(ownerId, contract) {
  const fb = await waitForFirebase();
  const safeContract = normalizeContractPayload(contract);
  const ref = fb.doc(fb.db, 'contracts', safeContract.id);

  const payload = {
    ownerId,
    name: safeContract.name,
    editorName: safeContract.editorName,
    propertyId: safeContract.propertyId || '',
    participants: safeContract.participants,
    data: safeContract.data,
    status: safeContract.status,
    source: safeContract.source || 'contract',
    createdAt: safeContract.createdAt,
    updatedAt: safeContract.updatedAt || new Date().toISOString(),
    updatedAtServer: fb.serverTimestamp()
  };

  await fb.setDoc(ref, payload, { merge: true });
  return safeContract;
}

async function deleteContract(ownerId, contractId) {
  const fb = await waitForFirebase();
  const ref = fb.doc(fb.db, 'contracts', contractId);

  const current = await fb.getDoc(ref);
  if (!current.exists()) return;

  const currentData = current.data();
  if (currentData?.ownerId !== ownerId) {
    throw new Error('Você não tem permissão para excluir este contrato.');
  }

  await fb.deleteDoc(ref);
}

async function upsertManyContracts(ownerId, contracts) {
  const normalized = Array.isArray(contracts) ? contracts : [];
  for (const contract of normalized) {
    await upsertContract(ownerId, contract);
  }
}

// Compatibilidade com o código legado
async function listVersions(ownerId, filters = {}) {
  return listContracts(ownerId, filters);
}

async function upsertVersion(ownerId, version) {
  return upsertContract(ownerId, version);
}

async function upsertManyVersions(ownerId, versions) {
  return upsertManyContracts(ownerId, versions);
}

async function deleteVersion(ownerId, versionId) {
  return deleteContract(ownerId, versionId);
}

window.ContractsRepo = {
  listContracts,
  upsertContract,
  upsertManyContracts,
  deleteContract,
  listVersions,
  upsertVersion,
  upsertManyVersions,
  deleteVersion
};
