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

function normalizePropertyPayload(raw) {
  const nowIso = new Date().toISOString();
  return {
    id: raw.id,
    label: raw.label || '',
    owner: raw.owner || '',
    address: {
      cidade: raw.address?.cidade || '',
      estado: raw.address?.estado || '',
      bairro: raw.address?.bairro || '',
      rua: raw.address?.rua || '',
      numero: raw.address?.numero || '',
      complemento: raw.address?.complemento || '',
      cep: raw.address?.cep || ''
    },
    memorial: {
      enabled: raw.memorial?.enabled ?? true,
      pageBreakBefore: raw.memorial?.pageBreakBefore ?? false,
      title: raw.memorial?.title || 'MEMORIAL DESCRITIVO',
      text: raw.memorial?.text || '',
      attachmentsNote: raw.memorial?.attachmentsNote || ''
    },
    createdAt: raw.createdAt || nowIso,
    updatedAt: raw.updatedAt || nowIso
  };
}

async function listProperties(ownerId) {
  if (!ownerId) throw new Error('ownerId é obrigatório para listar imóveis.');
  const fb = await waitForFirebase();
  const q = fb.query(
    fb.collection(fb.db, 'properties'),
    fb.where('ownerId', '==', ownerId),
    fb.orderBy('updatedAt', 'desc')
  );
  const snap = await fb.getDocs(q);
  return snap.docs.map((item) => {
    const data = item.data();
    return normalizePropertyPayload({ ...data, id: item.id });
  });
}

async function upsertProperty(ownerId, property) {
  const fb = await waitForFirebase();
  const safeProperty = normalizePropertyPayload(property);
  const ref = fb.doc(fb.db, 'properties', safeProperty.id);

  const payload = {
    ownerId,
    label: safeProperty.label,
    owner: safeProperty.owner,
    address: safeProperty.address,
    memorial: safeProperty.memorial,
    updatedAt: safeProperty.updatedAt,
    updatedAtServer: fb.serverTimestamp()
  };

  if (!property?.createdAt) {
    payload.createdAt = safeProperty.createdAt;
    payload.createdAtServer = fb.serverTimestamp();
  }

  await fb.setDoc(ref, payload, { merge: true });
}

async function deleteProperty(ownerId, propertyId) {
  const fb = await waitForFirebase();
  const ref = fb.doc(fb.db, 'properties', propertyId);

  const current = await fb.getDoc(ref);
  if (!current.exists()) return;

  const currentData = current.data();
  if (currentData?.ownerId !== ownerId) {
    throw new Error('Você não tem permissão para excluir este imóvel.');
  }

  await fb.deleteDoc(ref);
}

window.PropertiesRepo = {
  listProperties,
  upsertProperty,
  deleteProperty
};
