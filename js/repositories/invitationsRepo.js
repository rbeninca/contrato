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

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function normalizeInvitationPayload(raw) {
  const createdAtIso = toIsoDate(raw?.createdAt) || toIsoDate(raw?.createdAtServer) || new Date().toISOString();
  const expiresAtIso = toIsoDate(raw?.expiresAt) || toIsoDate(raw?.expiresAtIso) || new Date().toISOString();
  const revokedAtIso = toIsoDate(raw?.revokedAt) || toIsoDate(raw?.revokedAtIso) || '';

  return {
    id: raw?.id || generateId(),
    ownerId: (raw?.ownerId || '').toString(),
    contractId: (raw?.contractId || '').toString(),
    role: (raw?.role || 'tenantId').toString(),
    invitedEmail: (raw?.invitedEmail || '').toString(),
    invitedEmailLower: (raw?.invitedEmailLower || '').toString(),
    invitedTenantUid: (raw?.invitedTenantUid || '').toString(),
    invitedTenantId: (raw?.invitedTenantId || '').toString(),
    summaryPropertyAddress: (raw?.summaryPropertyAddress || '').toString(),
    summaryLandlordName: (raw?.summaryLandlordName || '').toString(),
    summaryTenantName: (raw?.summaryTenantName || '').toString(),
    summaryMonthlyValue: (raw?.summaryMonthlyValue || '').toString(),
    summaryStartDate: (raw?.summaryStartDate || '').toString(),
    summaryEndDate: (raw?.summaryEndDate || '').toString(),
    summaryTermMonths: (raw?.summaryTermMonths || '').toString(),
    summaryForo: (raw?.summaryForo || '').toString(),
    tokenHash: (raw?.tokenHash || '').toString(),
    status: (raw?.status || 'active').toString(),
    createdAtIso,
    expiresAtIso,
    revokedAtIso
  };
}

function normalizeInvitationRole(role) {
  const safe = (role || '').toString().trim();
  const allowed = [
    'tenantId',
    'guarantor1Id',
    'guarantor1SpouseId',
    'guarantor2Id',
    'guarantor2SpouseId',
    'landlordId',
    'ownerId',
    'pixPayeeId'
  ];
  return allowed.includes(safe) ? safe : 'tenantId';
}

function normalizeFilters(rawFilters = {}) {
  return {
    contractId: (rawFilters?.contractId || '').toString().trim(),
    status: (rawFilters?.status || '').toString().trim()
  };
}

function applyFilters(invitations, filters) {
  return invitations.filter((item) => {
    if (filters.contractId && item.contractId !== filters.contractId) return false;
    if (filters.status && item.status !== filters.status) return false;
    return true;
  });
}

function toHex(buffer) {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value) {
  const input = new TextEncoder().encode(value);
  if (typeof crypto !== 'undefined' && crypto.subtle?.digest) {
    const hash = await crypto.subtle.digest('SHA-256', input);
    return toHex(hash);
  }
  throw new Error('Hash SHA-256 indisponível neste navegador.');
}

function generateToken() {
  const random = Math.random().toString(36).slice(2);
  const base = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${random}`;
  return `${base}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildTenantInviteUrl(inviteId, plainToken) {
  const base = new URL('tenant.html', window.location.href);
  base.searchParams.set('invite', inviteId);
  base.searchParams.set('token', plainToken);
  return base.toString();
}

function buildValidationResult(ok, invitation, reason) {
  return {
    ok,
    invitation: invitation ? normalizeInvitationPayload(invitation) : null,
    reason: (reason || '').toString()
  };
}

function buildContractSummaryPayload(invitation, contractRaw = {}) {
  const contract = contractRaw || {};
  const contractData = contract.data && typeof contract.data === 'object' ? contract.data : {};
  const finance = contractData.financeiro && typeof contractData.financeiro === 'object' ? contractData.financeiro : {};
  const property = contractData.imovel && typeof contractData.imovel === 'object' ? contractData.imovel : {};
  const landlord = contractData.locador && typeof contractData.locador === 'object' ? contractData.locador : {};
  const tenant = contractData.locataria && typeof contractData.locataria === 'object' ? contractData.locataria : {};

  return {
    invitationId: invitation.id,
    contractId: invitation.contractId,
    invitationRole: invitation.role,
    invitationStatus: invitation.status,
    propertyAddress: (property.endereco || '').toString(),
    landlordName: (landlord.nome || '').toString(),
    tenantName: (tenant.nome || '').toString(),
    monthlyValue: (finance.valor || '').toString(),
    startDate: (finance.inicio || '').toString(),
    endDate: (finance.termino || '').toString(),
    termMonths: (finance.prazo || '').toString(),
    foro: (contractData.foro || '').toString(),
    updatedAtIso: toIsoDate(contract.updatedAt) || ''
  };
}

async function getInvitationByToken(invitationId, plainToken) {
  const fb = await waitForFirebase();
  const inviteId = (invitationId || '').toString().trim();
  const token = (plainToken || '').toString().trim();

  if (!inviteId || !token) {
    return buildValidationResult(false, null, 'missing-params');
  }

  const ref = fb.doc(fb.db, 'invitations', inviteId);
  const snap = await fb.getDoc(ref);
  if (!snap.exists()) {
    return buildValidationResult(false, null, 'not-found');
  }

  const invitation = normalizeInvitationPayload({ ...snap.data(), id: snap.id });
  const inputTokenHash = await sha256Hex(token);
  if (inputTokenHash !== invitation.tokenHash) {
    return buildValidationResult(false, invitation, 'token-mismatch');
  }

  return buildValidationResult(true, invitation, 'ok');
}

function cloneJsonSafe(value) {
  try {
    return JSON.parse(JSON.stringify(value || {}));
  } catch {
    return {};
  }
}

function normalizeTenantFromAuth(tenantData = {}) {
  const email = (tenantData?.email || '').toString().trim();
  const address = tenantData?.address && typeof tenantData.address === 'object' ? tenantData.address : {};
  return {
    uid: (tenantData?.uid || '').toString().trim(),
    email,
    emailLower: email.toLowerCase(),
    name: (tenantData?.name || tenantData?.displayName || '').toString().trim(),
    phone: (tenantData?.phone || tenantData?.phoneNumber || '').toString().trim(),
    cpfCnpj: (tenantData?.cpfCnpj || '').toString().trim(),
    rg: (tenantData?.rg || '').toString().trim(),
    profession: (tenantData?.profession || '').toString().trim(),
    maritalStatus: (tenantData?.maritalStatus || '').toString().trim(),
    address: {
      cidade: (address?.cidade || '').toString().trim(),
      estado: (address?.estado || '').toString().trim(),
      rua: (address?.rua || '').toString().trim()
    },
    bankAccount: (tenantData?.bankAccount || '').toString().trim(),
    pixKey: (tenantData?.pixKey || '').toString().trim(),
    qualification: (tenantData?.qualification || '').toString().trim(),
    notes: (tenantData?.notes || '').toString().trim(),
    invitationRefId: (tenantData?.invitationRefId || '').toString().trim()
  };
}

async function findTenantByOwner(fb, ownerId, matcher) {
  const q = fb.query(
    fb.collection(fb.db, 'people'),
    fb.where('ownerId', '==', ownerId)
  );
  const snap = await fb.getDocs(q);
  for (const row of snap.docs) {
    const data = row.data() || {};
    if (matcher(data, row.id)) {
      return { id: row.id, ...data };
    }
  }
  return null;
}

async function upsertInvitedTenant(fb, invitation, tenantData = {}) {
  const tenantAuth = normalizeTenantFromAuth(tenantData);
  const ownerId = invitation.ownerId;
  const nowIso = new Date().toISOString();

  let existing = null;
  if (tenantAuth.uid) {
    existing = await findTenantByOwner(
      fb,
      ownerId,
      (item) => (item?.tenantAuthUid || '').toString().trim() === tenantAuth.uid
    );
  }

  if (!existing && tenantAuth.emailLower) {
    existing = await findTenantByOwner(
      fb,
      ownerId,
      (item) => {
        const emailLower = (item?.emailLower || item?.email || '').toString().trim().toLowerCase();
        return emailLower === tenantAuth.emailLower;
      }
    );
  }

  const tenantId = existing?.id || generateId();
  const tenantRef = fb.doc(fb.db, 'people', tenantId);

  const payload = {
    ownerId,
    name: tenantAuth.name || existing?.name || '',
    phone: tenantAuth.phone || existing?.phone || '',
    email: tenantAuth.email || existing?.email || '',
    emailLower: tenantAuth.emailLower || (existing?.emailLower || existing?.email || '').toString().toLowerCase(),
    cpfCnpj: tenantAuth.cpfCnpj || existing?.cpfCnpj || '',
    rg: tenantAuth.rg || existing?.rg || '',
    profession: tenantAuth.profession || existing?.profession || '',
    maritalStatus: tenantAuth.maritalStatus || existing?.maritalStatus || '',
    address: {
      cidade: tenantAuth.address?.cidade || existing?.address?.cidade || '',
      estado: tenantAuth.address?.estado || existing?.address?.estado || '',
      rua: tenantAuth.address?.rua || existing?.address?.rua || ''
    },
    bankAccount: tenantAuth.bankAccount || existing?.bankAccount || '',
    pixKey: tenantAuth.pixKey || existing?.pixKey || '',
    qualification: tenantAuth.qualification || existing?.qualification || '',
    notes: tenantAuth.notes || existing?.notes || '',
    tenantAuthUid: tenantAuth.uid || existing?.tenantAuthUid || '',
    updatedByInvitationId: tenantAuth.invitationRefId || existing?.updatedByInvitationId || '',
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
    createdAtServer: fb.serverTimestamp(),
    updatedAtServer: fb.serverTimestamp()
  };

  await fb.setDoc(tenantRef, payload, { merge: true });

  return {
    id: tenantId,
    name: payload.name,
    phone: payload.phone,
    email: payload.email,
    emailLower: payload.emailLower,
    rg: payload.rg,
    profession: payload.profession,
    maritalStatus: payload.maritalStatus,
    address: payload.address,
    bankAccount: payload.bankAccount,
    pixKey: payload.pixKey,
    tenantAuthUid: payload.tenantAuthUid
  };
}

async function saveReportedGuarantors(fb, invitation, guarantors = []) {
  const ownerId = (invitation.ownerId || '').toString().trim();
  if (!ownerId || !Array.isArray(guarantors) || !guarantors.length) {
    return [];
  }

  const ids = [];
  for (const entry of guarantors.slice(0, 2)) {
    const safe = entry && typeof entry === 'object' ? entry : {};
    if (!safe.name) continue;
    const person = await upsertInvitedTenant(fb, invitation, {
      uid: '',
      email: (safe.email || '').toString(),
      name: (safe.name || '').toString(),
      phone: (safe.phone || '').toString(),
      cpfCnpj: (safe.cpfCnpj || '').toString(),
      rg: (safe.rg || '').toString(),
      profession: (safe.profession || '').toString(),
      maritalStatus: (safe.maritalStatus || '').toString(),
      address: {
        cidade: (safe.address?.cidade || '').toString(),
        estado: (safe.address?.estado || '').toString(),
        rua: (safe.address?.rua || '').toString()
      },
      bankAccount: '',
      pixKey: '',
      invitationRefId: invitation.id
    });
    ids.push(person.id);
  }

  return ids;
}

async function bindInvitationContractParticipant(fb, invitation, person, spouse = null) {
  const contractId = (invitation.contractId || '').toString().trim();
  if (!contractId) {
    throw new Error('Convite sem referência de contrato.');
  }

  const role = normalizeInvitationRole(invitation.role);
  const contractRef = fb.doc(fb.db, 'contracts', contractId);
  const updatePayload = {
    [`participants.${role}`]: person.id,
    updatedAt: fb.serverTimestamp(),
    updatedByInvitationId: invitation.id
  };

  if (role === 'tenantId') {
    updatePayload.tenantId = person.id;
  }

  if ((role === 'guarantor1Id' || role === 'guarantor2Id') && spouse && spouse.id) {
    const spouseRole = role === 'guarantor1Id' ? 'guarantor1SpouseId' : 'guarantor2SpouseId';
    updatePayload[`participants.${spouseRole}`] = spouse.id;
  }

  await fb.updateDoc(contractRef, updatePayload);

  return {
    contractId,
    participantRole: role,
    participantId: person.id,
    spouseId: spouse?.id || ''
  };
}

async function listInvitations(ownerId, rawFilters = {}) {
  const fb = await waitForFirebase();
  const filters = normalizeFilters(rawFilters);

  try {
    const q = fb.query(
      fb.collection(fb.db, 'invitations'),
      fb.where('ownerId', '==', ownerId),
      fb.orderBy('createdAt', 'desc')
    );
    const snap = await fb.getDocs(q);
    const normalized = snap.docs.map((item) => normalizeInvitationPayload({ ...item.data(), id: item.id }));
    return applyFilters(normalized, filters);
  } catch {
    const qFallback = fb.query(
      fb.collection(fb.db, 'invitations'),
      fb.where('ownerId', '==', ownerId)
    );
    const snapFallback = await fb.getDocs(qFallback);
    const normalized = snapFallback.docs
      .map((item) => normalizeInvitationPayload({ ...item.data(), id: item.id }))
      .sort((a, b) => new Date(b.createdAtIso) - new Date(a.createdAtIso));

    return applyFilters(normalized, filters);
  }
}

async function createInvitation(ownerId, payloadOrContractId, roleArg, invitedEmailArg, expDaysArg) {
  const fb = await waitForFirebase();

  const payload = typeof payloadOrContractId === 'object' && payloadOrContractId
    ? payloadOrContractId
    : {
      contractId: payloadOrContractId,
      role: roleArg,
      invitedEmail: invitedEmailArg,
      expiresInDays: expDaysArg
    };

  const contractId = (payload?.contractId || '').toString().trim();
  if (!contractId) throw new Error('Contrato é obrigatório para gerar convite.');

  const role = normalizeInvitationRole(payload?.role || 'tenantId');

  const invitedEmail = (payload?.invitedEmail || '').toString().trim();
  const invitedEmailLower = invitedEmail.toLowerCase();
  const expiresInDaysRaw = Number.parseInt(String(payload?.expiresInDays || '7'), 10);
  const expiresInDays = Number.isNaN(expiresInDaysRaw) ? 7 : Math.min(Math.max(expiresInDaysRaw, 1), 30);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);

  const invitationId = generateId();
  const plainToken = generateToken();
  const tokenHash = await sha256Hex(plainToken);
  let storedSummary = {
    summaryPropertyAddress: '',
    summaryLandlordName: '',
    summaryTenantName: '',
    summaryMonthlyValue: '',
    summaryStartDate: '',
    summaryEndDate: '',
    summaryTermMonths: '',
    summaryForo: ''
  };

  try {
    const contractRef = fb.doc(fb.db, 'contracts', contractId);
    const contractSnap = await fb.getDoc(contractRef);
    if (contractSnap.exists()) {
      const contractData = contractSnap.data() || {};
      const contractPayload = buildContractSummaryPayload({ id: invitationId, contractId, role, status: 'active' }, contractData);
      storedSummary = {
        summaryPropertyAddress: contractPayload.propertyAddress || '',
        summaryLandlordName: contractPayload.landlordName || '',
        summaryTenantName: contractPayload.tenantName || '',
        summaryMonthlyValue: contractPayload.monthlyValue || '',
        summaryStartDate: contractPayload.startDate || '',
        summaryEndDate: contractPayload.endDate || '',
        summaryTermMonths: contractPayload.termMonths || '',
        summaryForo: contractPayload.foro || ''
      };
    }
  } catch {
    storedSummary = {
      summaryPropertyAddress: '',
      summaryLandlordName: '',
      summaryTenantName: '',
      summaryMonthlyValue: '',
      summaryStartDate: '',
      summaryEndDate: '',
      summaryTermMonths: '',
      summaryForo: ''
    };
  }

  const ref = fb.doc(fb.db, 'invitations', invitationId);
  await fb.setDoc(ref, {
    ownerId,
    contractId,
    role,
    invitedEmail,
    invitedEmailLower,
    invitedTenantUid: '',
    ...storedSummary,
    tokenHash,
    status: 'active',
    createdAt: now,
    createdAtServer: fb.serverTimestamp(),
    expiresAt,
    expiresAtIso: expiresAt.toISOString(),
    updatedAtServer: fb.serverTimestamp()
  }, { merge: true });

  const invitation = normalizeInvitationPayload({
    id: invitationId,
    ownerId,
    contractId,
    role,
    invitedEmail,
    invitedEmailLower,
    invitedTenantUid: '',
    ...storedSummary,
    tokenHash,
    status: 'active',
    createdAt: now,
    expiresAt,
    expiresAtIso: expiresAt.toISOString(),
    revokedAtIso: ''
  });

  return {
    invitation,
    inviteUrl: buildTenantInviteUrl(invitationId, plainToken)
  };
}

async function verifyInvitationLink(invitationId, plainToken) {
  const byToken = await getInvitationByToken(invitationId, plainToken);
  if (!byToken.ok || !byToken.invitation) {
    return byToken;
  }

  const invitation = byToken.invitation;
  if (invitation.status !== 'active') {
    if (invitation.status === 'revoked') {
      return buildValidationResult(false, invitation, 'revoked');
    }
    if (invitation.status === 'accepted') {
      return buildValidationResult(false, invitation, 'accepted');
    }
    return buildValidationResult(false, invitation, 'inactive');
  }

  const expiresAt = invitation.expiresAtIso ? new Date(invitation.expiresAtIso) : null;
  if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    return buildValidationResult(false, invitation, 'expired');
  }

  return buildValidationResult(true, invitation, 'ok');
}

async function getInvitationContractSummary(invitationId, plainToken) {
  const fb = await waitForFirebase();
  const byToken = await getInvitationByToken(invitationId, plainToken);
  if (!byToken.ok || !byToken.invitation) {
    throw new Error('Convite inválido para consulta de resumo.');
  }

  const invitation = byToken.invitation;
  if (
    invitation.summaryPropertyAddress ||
    invitation.summaryLandlordName ||
    invitation.summaryTenantName ||
    invitation.summaryMonthlyValue ||
    invitation.summaryStartDate ||
    invitation.summaryEndDate
  ) {
    return {
      invitationId: invitation.id,
      contractId: invitation.contractId,
      invitationRole: invitation.role,
      invitationStatus: invitation.status,
      propertyAddress: invitation.summaryPropertyAddress,
      landlordName: invitation.summaryLandlordName,
      tenantName: invitation.summaryTenantName,
      monthlyValue: invitation.summaryMonthlyValue,
      startDate: invitation.summaryStartDate,
      endDate: invitation.summaryEndDate,
      termMonths: invitation.summaryTermMonths,
      foro: invitation.summaryForo,
      updatedAtIso: ''
    };
  }
  const contractId = (invitation.contractId || '').toString().trim();
  if (!contractId) {
    throw new Error('Convite sem referência de contrato.');
  }

  const contractRef = fb.doc(fb.db, 'contracts', contractId);
  const contractSnap = await fb.getDoc(contractRef);
  if (!contractSnap.exists()) {
    throw new Error('Contrato vinculado ao convite não foi encontrado.');
  }

  const contractData = contractSnap.data() || {};
  if ((contractData.ownerId || '').toString() !== invitation.ownerId) {
    throw new Error('Sem permissão para acessar os dados do contrato.');
  }

  return buildContractSummaryPayload(invitation, contractData);
}

async function acceptInvitationLink(invitationId, plainToken, tenantData = {}) {
  const fb = await waitForFirebase();
  const tenantAuth = normalizeTenantFromAuth(tenantData);
  const tenantUid = tenantAuth.uid;
  const tenantEmail = tenantAuth.email;

  if (!tenantUid) {
    throw new Error('Usuário autenticado é obrigatório para aceitar o convite.');
  }

  const validation = await verifyInvitationLink(invitationId, plainToken);
  let invitation = null;
  if (validation.ok && validation.invitation) {
    invitation = validation.invitation;
  } else if (validation.reason === 'accepted' && validation.invitation) {
    invitation = validation.invitation;
  }

  if (!invitation) {
    throw new Error('Convite inválido ou expirado.');
  }

  if (invitation.status === 'accepted' && invitation.invitedTenantUid && invitation.invitedTenantUid !== tenantUid) {
    throw new Error('Este convite já foi aceito por outro usuário.');
  }

  const invitedEmailLower = (invitation.invitedEmailLower || '').toLowerCase();
  const currentEmailLower = tenantEmail.toLowerCase();
  if (invitedEmailLower && currentEmailLower && invitedEmailLower !== currentEmailLower) {
    throw new Error('Este convite foi emitido para outro e-mail.');
  }

  const tenant = await upsertInvitedTenant(fb, invitation, tenantAuth);
  let spouse = null;
  const role = normalizeInvitationRole(invitation.role);
  let reportedSpouseId = '';
  let reportedGuarantorIds = [];

  const spouseData = tenantData?.spouse && typeof tenantData.spouse === 'object' ? tenantData.spouse : null;
  if (spouseData?.name) {
    spouse = await upsertInvitedTenant(fb, invitation, {
      uid: role === 'guarantor1Id' || role === 'guarantor2Id' ? tenantUid : '',
      email: (spouseData.email || '').toString(),
      name: spouseData.name,
      phone: (spouseData.phone || '').toString(),
      cpfCnpj: (spouseData.cpfCnpj || '').toString(),
      rg: (spouseData.rg || '').toString(),
      profession: (spouseData.profession || '').toString(),
      maritalStatus: (spouseData.maritalStatus || '').toString(),
      address: {
        cidade: (spouseData.address?.cidade || '').toString(),
        estado: (spouseData.address?.estado || '').toString(),
        rua: (spouseData.address?.rua || '').toString()
      },
      qualification: (spouseData.qualification || '').toString(),
      notes: (spouseData.notes || '').toString(),
      invitationRefId: invitation.id
    });
    reportedSpouseId = spouse?.id || '';
  }

  if (role === 'tenantId') {
    const guarantors = Array.isArray(tenantData?.guarantors) ? tenantData.guarantors : [];
    reportedGuarantorIds = await saveReportedGuarantors(fb, invitation, guarantors);
  }

  const linkResult = await bindInvitationContractParticipant(fb, invitation, tenant, spouse);

  const now = new Date();
  const ref = fb.doc(fb.db, 'invitations', invitation.id);
  await fb.setDoc(ref, {
    status: 'accepted',
    invitedTenantUid: tenantUid,
    invitedTenantId: tenant.id,
    invitedTenantEmail: tenantEmail,
    invitedTenantEmailLower: currentEmailLower,
    linkedContractId: linkResult.contractId,
    linkedRole: linkResult.participantRole,
    linkedParticipantId: linkResult.participantId,
    linkedSpouseId: linkResult.spouseId,
    reportedSpouseId,
    reportedGuarantorIds,
    acceptedAt: now,
    acceptedAtIso: now.toISOString(),
    updatedAtServer: fb.serverTimestamp()
  }, { merge: true });

  return {
    ...invitation,
    status: 'accepted',
    invitedTenantUid: tenantUid,
    invitedTenantId: tenant.id,
    invitedTenantEmail: tenantEmail,
    invitedTenantEmailLower: currentEmailLower,
    linkedContractId: linkResult.contractId,
    linkedTenantId: role === 'tenantId' ? tenant.id : '',
    linkedRole: linkResult.participantRole,
    linkedParticipantId: linkResult.participantId,
    linkedSpouseId: linkResult.spouseId,
    reportedSpouseId,
    reportedGuarantorIds,
    acceptedAtIso: now.toISOString()
  };
}

async function revokeInvitation(ownerId, invitationId) {
  const fb = await waitForFirebase();
  const ref = fb.doc(fb.db, 'invitations', invitationId);

  const snap = await fb.getDoc(ref);
  if (!snap.exists()) return null;

  const current = normalizeInvitationPayload({ ...snap.data(), id: snap.id });
  if (current.ownerId !== ownerId) {
    throw new Error('Você não tem permissão para revogar este convite.');
  }

  const now = new Date();
  await fb.setDoc(ref, {
    status: 'revoked',
    revokedAt: now,
    revokedAtIso: now.toISOString(),
    updatedAtServer: fb.serverTimestamp()
  }, { merge: true });

  return {
    ...current,
    status: 'revoked',
    revokedAtIso: now.toISOString()
  };
}

window.InvitationsRepo = {
  listInvitations,
  createInvitation,
  revokeInvitation,
  verifyInvitationLink,
  acceptInvitationLink,
  getInvitationContractSummary
};
