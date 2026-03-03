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

// Redireciona para PeopleRepo, pois tenants é uma coleção legada bloqueada
async function listTenants(ownerId) {
  if (!ownerId) throw new Error('ownerId é obrigatório para listar locatários.');
  const allPeople = await window.PeopleRepo.listPeople(ownerId);
  // Filtra pessoas que tem qualificação de locatário ou inquilino
  return allPeople.filter(p => {
    const qual = (p.qualification || '').toLowerCase();
    return qual.includes('locatário') || qual.includes('inquilino') || qual.includes('locatária') || qual.includes('inquilina');
  });
}

async function upsertTenant(ownerId, tenant) {
  // Garante que a qualificação inclua Locatário ao salvar via este repo
  const person = {
    ...tenant,
    qualification: tenant.qualification || 'Locatário'
  };
  return window.PeopleRepo.upsertPerson(ownerId, person);
}

async function deleteTenant(ownerId, tenantId) {
  return window.PeopleRepo.deletePerson(ownerId, tenantId);
}

window.TenantsRepo = {
  listTenants,
  upsertTenant,
  deleteTenant
};
