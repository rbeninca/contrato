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

// Redireciona para PeopleRepo, pois landlords é uma coleção legada bloqueada
async function listLandlords(ownerId) {
  if (!ownerId) throw new Error('ownerId é obrigatório para listar locadores.');
  const allPeople = await window.PeopleRepo.listPeople(ownerId);
  // Filtra pessoas que tem qualificação de locador ou proprietário, ou simplesmente todas para compatibilidade
  return allPeople.filter(p => {
    const qual = (p.qualification || '').toLowerCase();
    return qual.includes('locador') || qual.includes('proprietário') || qual.includes('locadora') || qual.includes('proprietária');
  });
}

async function upsertLandlord(ownerId, landlord) {
  // Garante que a qualificação inclua Locador ao salvar via este repo
  const person = {
    ...landlord,
    qualification: landlord.qualification || 'Locador'
  };
  return window.PeopleRepo.upsertPerson(ownerId, person);
}

async function deleteLandlord(ownerId, landlordId) {
  return window.PeopleRepo.deletePerson(ownerId, landlordId);
}

window.LandlordsRepo = {
  listLandlords,
  upsertLandlord,
  deleteLandlord
};
