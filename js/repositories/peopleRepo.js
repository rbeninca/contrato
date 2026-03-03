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

function normalizePersonPayload(raw) {
  const nowIso = new Date().toISOString();
  const email = (raw?.email || '').toString().trim();
  const address = raw?.address && typeof raw.address === 'object' ? raw.address : {};

  return {
    id: raw?.id || generateId(),
    ownerId: (raw?.ownerId || '').toString(),
    name: (raw?.name || '').toString(),
    phone: (raw?.phone || '').toString(),
    email,
    emailLower: (raw?.emailLower || email).toString().trim().toLowerCase(),
    cpfCnpj: (raw?.cpfCnpj || '').toString(),
    rg: (raw?.rg || '').toString(),
    profession: (raw?.profession || '').toString(),
    maritalStatus: (raw?.maritalStatus || '').toString(),
    address: {
      cidade: (address?.cidade || '').toString(),
      estado: (address?.estado || '').toString(),
      rua: (address?.rua || '').toString()
    },
    bankAccount: (raw?.bankAccount || '').toString(),
    pixKey: (raw?.pixKey || '').toString(),
    qualification: (raw?.qualification || '').toString(),
    notes: (raw?.notes || '').toString(),
    tenantAuthUid: (raw?.tenantAuthUid || '').toString(),
    createdAt: toIsoDate(raw?.createdAt) || nowIso,
    updatedAt: toIsoDate(raw?.updatedAt) || nowIso
  };
}

async function listPeople(ownerId) {
  if (!ownerId) throw new Error('ownerId é obrigatório para listar pessoas.');
  const fb = await waitForFirebase();

  try {
    const q = fb.query(
      fb.collection(fb.db, 'people'),
      fb.where('ownerId', '==', ownerId),
      fb.orderBy('updatedAt', 'desc')
    );
    const snap = await fb.getDocs(q);
    return snap.docs.map((item) => normalizePersonPayload({ ...item.data(), id: item.id }));
  } catch {
    const qFallback = fb.query(
      fb.collection(fb.db, 'people'),
      fb.where('ownerId', '==', ownerId)
    );
    const snapFallback = await fb.getDocs(qFallback);
    return snapFallback.docs
      .map((item) => normalizePersonPayload({ ...item.data(), id: item.id }))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }
}

async function upsertPerson(ownerId, person) {
  const fb = await waitForFirebase();
  const safe = normalizePersonPayload({ ...person, ownerId });
  const ref = fb.doc(fb.db, 'people', safe.id);

  await fb.setDoc(ref, {
    ownerId,
    name: safe.name,
    phone: safe.phone,
    email: safe.email,
    emailLower: safe.emailLower,
    cpfCnpj: safe.cpfCnpj,
    rg: safe.rg,
    profession: safe.profession,
    maritalStatus: safe.maritalStatus,
    address: safe.address,
    bankAccount: safe.bankAccount,
    pixKey: safe.pixKey,
    qualification: safe.qualification,
    notes: safe.notes,
    tenantAuthUid: safe.tenantAuthUid,
    createdAt: safe.createdAt,
    updatedAt: safe.updatedAt,
    createdAtServer: fb.serverTimestamp(),
    updatedAtServer: fb.serverTimestamp()
  }, { merge: true });

  return safe;
}

async function deletePerson(ownerId, personId) {
  const fb = await waitForFirebase();
  const ref = fb.doc(fb.db, 'people', personId);

  const current = await fb.getDoc(ref);
  if (!current.exists()) return;

  const currentData = current.data();
  if (currentData?.ownerId !== ownerId) {
    throw new Error('Você não tem permissão para excluir esta pessoa.');
  }

  await fb.deleteDoc(ref);
}

window.PeopleRepo = {
  listPeople,
  upsertPerson,
  deletePerson
};
