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
  await fb.setDoc(ref, {
    ownerId,
    name: safeVersion.name,
    savedAt: safeVersion.savedAt,
    editorName: safeVersion.editorName,
    data: safeVersion.data,
    source: 'legacy-version',
    updatedAt: fb.serverTimestamp(),
    createdAt: fb.serverTimestamp()
  }, { merge: true });
}

async function deleteVersion(ownerId, versionId) {
  const fb = await waitForFirebase();
  const ref = fb.doc(fb.db, 'contracts', versionId);
  await fb.deleteDoc(ref);
}

window.ContractsRepo = {
  listVersions,
  upsertVersion,
  deleteVersion
};
