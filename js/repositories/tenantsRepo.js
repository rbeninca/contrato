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

function normalizeTenantPayload(raw) {
  const nowIso = new Date().toISOString();
  return {
    id: raw?.id || generateId(),
    name: raw?.name || '',
    phone: raw?.phone || '',
    email: raw?.email || '',
    cpfCnpj: raw?.cpfCnpj || '',
    qualification: raw?.qualification || '',
    notes: raw?.notes || '',
    createdAt: toIsoDate(raw?.createdAt) || nowIso,
    updatedAt: toIsoDate(raw?.updatedAt) || nowIso
  };
}

async function listTenants(ownerId) {
  const fb = await waitForFirebase();

  try {
    const q = fb.query(
      fb.collection(fb.db, 'tenants'),
      fb.where('ownerId', '==', ownerId),
      fb.orderBy('updatedAt', 'desc')
    );
    const snap = await fb.getDocs(q);
    return snap.docs.map((item) => normalizeTenantPayload({ ...item.data(), id: item.id }));
  } catch {
    const qFallback = fb.query(
      fb.collection(fb.db, 'tenants'),
      fb.where('ownerId', '==', ownerId)
    );
    const snapFallback = await fb.getDocs(qFallback);
    return snapFallback.docs
      .map((item) => normalizeTenantPayload({ ...item.data(), id: item.id }))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }
}

async function upsertTenant(ownerId, tenant) {
  const fb = await waitForFirebase();
  const safe = normalizeTenantPayload(tenant);
  const ref = fb.doc(fb.db, 'tenants', safe.id);

  const payload = {
    ownerId,
    name: safe.name,
    phone: safe.phone,
    email: safe.email,
    cpfCnpj: safe.cpfCnpj,
    qualification: safe.qualification,
    notes: safe.notes,
    createdAt: safe.createdAt,
    updatedAt: safe.updatedAt,
    createdAtServer: fb.serverTimestamp(),
    updatedAtServer: fb.serverTimestamp()
  };

  await fb.setDoc(ref, payload, { merge: true });
  return safe;
}

async function deleteTenant(ownerId, tenantId) {
  const fb = await waitForFirebase();
  const ref = fb.doc(fb.db, 'tenants', tenantId);

  const current = await fb.getDoc(ref);
  if (!current.exists()) return;

  const currentData = current.data();
  if (currentData?.ownerId !== ownerId) {
    throw new Error('Você não tem permissão para excluir este locatário.');
  }

  await fb.deleteDoc(ref);
}

window.TenantsRepo = {
  listTenants,
  upsertTenant,
  deleteTenant
};
