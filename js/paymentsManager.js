(function () {
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

  function nowIso() {
    return new Date().toISOString();
  }

  function parseCurrencyToNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const text = String(value || '').trim();
    if (!text) return 0;
    const normalized = text.replace(/\s/g, '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
    const num = Number(normalized);
    return Number.isFinite(num) ? num : 0;
  }

  function formatCurrencyBR(amount) {
    const number = Number(amount || 0);
    return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function toIsoDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function parseDateAny(value) {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

    const text = String(value).trim().toLowerCase();
    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));

    const brMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (brMatch) return new Date(Number(brMatch[3]), Number(brMatch[2]) - 1, Number(brMatch[1]));

    const monthMap = {
      janeiro: 0,
      fevereiro: 1,
      marco: 2,
      'março': 2,
      abril: 3,
      maio: 4,
      junho: 5,
      julho: 6,
      agosto: 7,
      setembro: 8,
      outubro: 9,
      novembro: 10,
      dezembro: 11
    };

    const extensoMatch = text.match(/^(\d{1,2})\s+de\s+([a-zçãéíóúâêô]+)\s+de\s+(\d{4})$/i);
    if (extensoMatch) {
      const day = Number(extensoMatch[1]);
      const month = monthMap[extensoMatch[2]];
      const year = Number(extensoMatch[3]);
      if (month !== undefined) return new Date(year, month, day);
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function addMonthsSafe(date, months) {
    const result = new Date(date);
    const day = result.getDate();
    result.setDate(1);
    result.setMonth(result.getMonth() + months);
    const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
    result.setDate(Math.min(day, lastDay));
    return result;
  }

  function normalizeDueDay(value, fallback = 10) {
    const parsed = Number.parseInt(String(value ?? '').trim(), 10);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 31) return parsed;
    const fb = Number.parseInt(String(fallback ?? '').trim(), 10);
    if (Number.isFinite(fb) && fb >= 1 && fb <= 31) return fb;
    return 10;
  }

  function applyDueDay(date, dueDay) {
    const result = new Date(date);
    const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
    result.setDate(Math.min(Math.max(1, dueDay), lastDay));
    return result;
  }

  function paymentDocId(monthIndex, suffix = '') {
    const base = `m${String(monthIndex).padStart(3, '0')}`;
    return suffix ? `${base}-${suffix}` : base;
  }

  function normalizeContractStatus(status) {
    const value = String(status || 'draft').toLowerCase();
    if (value === 'active' || value === 'closed') return value;
    return 'draft';
  }

  function createPaymentDoc({
    monthIndex,
    dueDate,
    amount,
    type = 'rent',
    description = null
  }) {
    return {
      monthIndex,
      dueDate,
      amount,
      status: 'pending',
      paidDate: null,
      paidAmount: null,
      lateDays: 0,
      lateFineAmount: 0,
      lateInterestAmount: 0,
      lateCorrectionAmount: 0,
      type,
      description,
      createdAt: nowIso(),
      updatedAt: null,
      editedAt: null,
      editedFromAmount: null,
      editedToAmount: null,
      deletedAt: null,
      deletedReason: null,
      canceledAt: null,
      cancelReason: null,
      undoAt: null,
      undoReason: null
    };
  }

  function calculateLatePaymentBreakdown(amountInput, dueDateInput, paidDateInput, correctionInput = 0) {
    const baseAmount = parseCurrencyToNumber(amountInput);
    const dueDate = parseDateAny(dueDateInput);
    const paidDate = parseDateAny(paidDateInput);
    const correctionAmount = Math.max(0, parseCurrencyToNumber(correctionInput));

    if (!Number.isFinite(baseAmount) || baseAmount <= 0 || !dueDate || !paidDate) {
      return {
        lateDays: 0,
        fineAmount: 0,
        interestAmount: 0,
        correctionAmount,
        totalAmount: Number((Math.max(0, baseAmount || 0) + correctionAmount).toFixed(2))
      };
    }

    const msPerDay = 1000 * 60 * 60 * 24;
    const dueTs = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime();
    const paidTs = new Date(paidDate.getFullYear(), paidDate.getMonth(), paidDate.getDate()).getTime();
    const lateDays = Math.max(0, Math.ceil((paidTs - dueTs) / msPerDay));
    const fineAmount = lateDays > 0 ? baseAmount * 0.02 : 0;
    const interestAmount = lateDays > 0 ? baseAmount * 0.01 * (lateDays / 30) : 0;
    const totalAmount = Number((baseAmount + fineAmount + interestAmount + correctionAmount).toFixed(2));

    return {
      lateDays,
      fineAmount: Number(fineAmount.toFixed(2)),
      interestAmount: Number(interestAmount.toFixed(2)),
      correctionAmount: Number(correctionAmount.toFixed(2)),
      totalAmount
    };
  }

  async function getContractDoc(contractId) {
    const fb = await waitForFirebase();
    const ref = fb.doc(fb.db, 'contracts', contractId);
    const snap = await fb.getDoc(ref);
    if (!snap.exists()) {
      throw new Error('Contrato não encontrado.');
    }
    return { fb, ref, snap, data: snap.data() };
  }

  async function listPayments(contractId) {
    const { fb } = await getContractDoc(contractId);
    const colRef = fb.collection(fb.db, 'contracts', contractId, 'payments');
    let docs = [];

    try {
      const q = fb.query(colRef, fb.orderBy('monthIndex', 'asc'));
      const snap = await fb.getDocs(q);
      docs = snap.docs;
    } catch {
      const snap = await fb.getDocs(colRef);
      docs = snap.docs.sort((a, b) => Number(a.data()?.monthIndex || 0) - Number(b.data()?.monthIndex || 0));
    }

    return docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
  }

  async function getPaymentDoc(contractId, paymentId) {
    const { fb } = await getContractDoc(contractId);
    const ref = fb.doc(fb.db, 'contracts', contractId, 'payments', paymentId);
    const snap = await fb.getDoc(ref);
    if (!snap.exists()) {
      throw new Error('Parcela não encontrada.');
    }
    return { fb, ref, data: snap.data() };
  }

  function getRentPayments(payments) {
    return (payments || []).filter((item) => item.type !== 'penalty');
  }

  function getLatestRentAmount(payments, fallbackAmount = 0) {
    const rentPayments = getRentPayments(payments)
      .filter((item) => item.status !== 'deleted')
      .sort((a, b) => Number(a.monthIndex || 0) - Number(b.monthIndex || 0));

    const latest = rentPayments.length ? rentPayments[rentPayments.length - 1] : null;
    const latestAmount = parseCurrencyToNumber(latest?.amount);
    if (latestAmount > 0) return latestAmount;
    return parseCurrencyToNumber(fallbackAmount);
  }

  function getCurrentCycle(payments) {
    const rents = getRentPayments(payments).filter((item) => item.status !== 'deleted');
    if (!rents.length) return { cycleNumber: 1, items: [], startIndex: 1, endIndex: 12 };

    const maxMonthIndex = Math.max(...rents.map((item) => Number(item.monthIndex || 0)));
    const cycleNumber = Math.max(1, Math.ceil(maxMonthIndex / 12));
    const startIndex = (cycleNumber - 1) * 12 + 1;
    const endIndex = startIndex + 11;
    const items = (payments || []).filter((item) => Number(item.monthIndex || 0) >= startIndex && Number(item.monthIndex || 0) <= endIndex)
      .sort((a, b) => Number(a.monthIndex || 0) - Number(b.monthIndex || 0));

    return { cycleNumber, items, startIndex, endIndex };
  }

  function isNearDueDate(dueDate, thresholdDays = 30) {
    const due = parseDateAny(dueDate);
    if (!due) return false;
    const now = new Date();
    const ms = due.getTime() - now.getTime();
    const days = ms / (1000 * 60 * 60 * 24);
    return days >= -thresholdDays && days <= thresholdDays;
  }

  function buildRentPayments(startDate, amount, monthStart, count, dueDayInput = null) {
    const baseDate = parseDateAny(startDate);
    if (!baseDate) throw new Error('Data de início do contrato inválida.');
    const dueDay = normalizeDueDay(dueDayInput, baseDate.getDate());

    const generated = [];
    for (let i = 0; i < count; i += 1) {
      const monthIndex = monthStart + i;
      const dueBase = addMonthsSafe(baseDate, monthIndex - 1);
      const due = applyDueDay(dueBase, dueDay);
      generated.push({
        id: paymentDocId(monthIndex),
        data: createPaymentDoc({
          monthIndex,
          dueDate: toIsoDate(due),
          amount,
          type: 'rent',
          description: null
        })
      });
    }
    return generated;
  }

  function calculateRescisoryPenalty(contractData, closeDateIso, payments = []) {
    const finance = contractData?.data?.financeiro || {};
    const currentRent = getLatestRentAmount(payments, finance.valor);
    if (!Number.isFinite(currentRent) || currentRent <= 0) {
      return { penaltyAmount: 0, proportion: 0, remainingDays: 0, totalDays: 0, currentRent: 0 };
    }

    const closeDate = parseDateAny(closeDateIso);
    const startDate = parseDateAny(finance.inicio);
    let endDate = parseDateAny(finance.termino);

    if ((!endDate || Number.isNaN(endDate.getTime())) && startDate) {
      const termMonths = Number.parseInt(String(finance.prazo || '').trim(), 10);
      if (Number.isFinite(termMonths) && termMonths > 0) {
        endDate = addMonthsSafe(startDate, termMonths);
      }
    }

    if (!closeDate || !startDate || !endDate || Number.isNaN(closeDate.getTime()) || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return { penaltyAmount: 0, proportion: 0, remainingDays: 0, totalDays: 0, currentRent };
    }

    const closeTs = closeDate.getTime();
    const startTs = startDate.getTime();
    const endTs = endDate.getTime();
    if (endTs <= startTs) {
      return { penaltyAmount: 0, proportion: 0, remainingDays: 0, totalDays: 0, currentRent };
    }

    const msPerDay = 1000 * 60 * 60 * 24;
    const totalDays = Math.max(1, Math.ceil((endTs - startTs) / msPerDay));
    const boundedCloseTs = Math.min(Math.max(closeTs, startTs), endTs);
    const remainingDays = Math.max(0, Math.ceil((endTs - boundedCloseTs) / msPerDay));
    const proportion = Math.max(0, Math.min(1, remainingDays / totalDays));
    const baseAmount = currentRent * 3;
    const penaltyAmount = Number((baseAmount * proportion).toFixed(2));

    return {
      penaltyAmount,
      proportion,
      remainingDays,
      totalDays,
      currentRent
    };
  }

  async function activateContract(contractId, contractData) {
    const { fb, ref, data } = await getContractDoc(contractId);
    const snapshot = contractData || data;
    const status = normalizeContractStatus(snapshot.status);

    if (status === 'closed') {
      throw new Error('Contrato encerrado. Reabra o contrato para ativar.');
    }

    const startDate = snapshot?.data?.financeiro?.inicio;
    const rentValue = parseCurrencyToNumber(snapshot?.data?.financeiro?.valor);
    const dueDay = normalizeDueDay(snapshot?.data?.financeiro?.vencimentoDia ?? snapshot?.data?.financeiro?.vencimento_dia, 10);
    const termMonthsRaw = Number.parseInt(String(snapshot?.data?.financeiro?.prazo || '').trim(), 10);
    const termMonths = Number.isFinite(termMonthsRaw) && termMonthsRaw > 0 ? termMonthsRaw : 12;
    const firstCycleMonths = Math.max(1, Math.min(12, termMonths));
    if (!startDate || rentValue <= 0) {
      throw new Error('Preencha data de início e valor do aluguel antes de ativar.');
    }

    const existingPayments = await listPayments(contractId);
    const paymentsCol = fb.collection(fb.db, 'contracts', contractId, 'payments');

    let generatedCount = 0;
    if (!existingPayments.length) {
      const firstCycle = buildRentPayments(startDate, rentValue, 1, firstCycleMonths, dueDay);
      generatedCount = firstCycle.length;
      await Promise.all(firstCycle.map((payment) => {
        const paymentRef = fb.doc(paymentsCol, payment.id);
        return fb.setDoc(paymentRef, payment.data, { merge: true });
      }));
    }

    const updatedData = {
      ...(snapshot.data || {}),
      status: 'active'
    };

    await fb.setDoc(ref, {
      status: 'active',
      activatedAt: snapshot.activatedAt || nowIso(),
      updatedAt: nowIso(),
      data: updatedData
    }, { merge: true });

    return { activated: true, generated: generatedCount };
  }

  async function loadPaymentDashboard(contractId) {
    const { data } = await getContractDoc(contractId);
    const payments = await listPayments(contractId);
    const cycle = getCurrentCycle(payments);
    const lastRentPayment = getRentPayments(cycle.items).sort((a, b) => Number(a.monthIndex || 0) - Number(b.monthIndex || 0)).pop() || null;
    const cycleLastPaid = lastRentPayment?.status === 'paid';
    const cycleNearDue = lastRentPayment ? isNearDueDate(lastRentPayment.dueDate, 30) : false;

    return {
      contract: data,
      payments,
      currentCyclePayments: cycle.items,
      cycleNumber: cycle.cycleNumber,
      cycleStartIndex: cycle.startIndex,
      cycleEndIndex: cycle.endIndex,
      canRenewCycle: cycleLastPaid || cycleNearDue
    };
  }

  async function markAsPaid(contractId, paymentId, paidDateInput, paidAmountInput) {
    const { fb, ref, data } = await getPaymentDoc(contractId, paymentId);
    if (data.status === 'deleted' || data.status === 'canceled') {
      throw new Error('Esta parcela não pode receber baixa.');
    }

    const paidDate = toIsoDate(parseDateAny(paidDateInput) || new Date());
    const paidAmount = parseCurrencyToNumber(paidAmountInput || data.amount || 0);
    if (!paidDate || paidAmount <= 0) {
      throw new Error('Data e valor de pagamento inválidos.');
    }

    const breakdown = calculateLatePaymentBreakdown(data.amount || 0, data.dueDate, paidDate, 0);

    await fb.setDoc(ref, {
      status: 'paid',
      paidDate,
      paidAmount,
      lateDays: breakdown.lateDays,
      lateFineAmount: breakdown.fineAmount,
      lateInterestAmount: breakdown.interestAmount,
      lateCorrectionAmount: Math.max(0, Number((paidAmount - (parseCurrencyToNumber(data.amount || 0) + breakdown.fineAmount + breakdown.interestAmount)).toFixed(2))),
      updatedAt: nowIso(),
      undoAt: null,
      undoReason: null
    }, { merge: true });

    return { paid: true };
  }

  async function undoPayment(contractId, paymentId, reason = null) {
    const { fb, ref, data } = await getPaymentDoc(contractId, paymentId);
    if (data.status !== 'paid') {
      throw new Error('Somente parcelas pagas podem ser estornadas.');
    }

    await fb.setDoc(ref, {
      status: 'pending',
      paidDate: null,
      paidAmount: null,
      lateDays: 0,
      lateFineAmount: 0,
      lateInterestAmount: 0,
      lateCorrectionAmount: 0,
      updatedAt: nowIso(),
      undoAt: nowIso(),
      undoReason: reason || 'Estorno manual'
    }, { merge: true });

    return { undone: true };
  }

  async function editPayment(contractId, paymentId, newAmountInput) {
    const { fb, ref, data } = await getPaymentDoc(contractId, paymentId);
    if (data.status !== 'pending') {
      throw new Error('Somente parcelas pendentes podem ser editadas.');
    }

    const newAmount = parseCurrencyToNumber(newAmountInput);
    if (!Number.isFinite(newAmount) || newAmount <= 0) {
      throw new Error('Novo valor inválido.');
    }

    const oldAmount = parseCurrencyToNumber(data.amount);
    await fb.setDoc(ref, {
      amount: newAmount,
      updatedAt: nowIso(),
      editedAt: nowIso(),
      editedFromAmount: oldAmount,
      editedToAmount: newAmount
    }, { merge: true });

    return { edited: true, from: oldAmount, to: newAmount };
  }

  async function deletePayment(contractId, paymentId, reason = null) {
    const { fb, ref, data } = await getPaymentDoc(contractId, paymentId);
    if (data.status === 'deleted') {
      return { deleted: true };
    }

    await fb.setDoc(ref, {
      status: 'deleted',
      updatedAt: nowIso(),
      deletedAt: nowIso(),
      deletedReason: reason || 'Exclusão lógica manual'
    }, { merge: true });

    return { deleted: true };
  }

  async function applyIGPMReadjustment(contractId, adjustmentPercentInput) {
    const { fb, ref, data } = await getContractDoc(contractId);
    const current = await loadPaymentDashboard(contractId);
    const allPayments = current.payments;
    if (!allPayments.length) {
      throw new Error('Não há parcelas para renovar. Ative o contrato primeiro.');
    }

    const adjustmentPercent = Number(adjustmentPercentInput);
    if (!Number.isFinite(adjustmentPercent) || adjustmentPercent < 0) {
      throw new Error('Índice de reajuste inválido.');
    }

    const rentPayments = getRentPayments(allPayments).filter((item) => item.status !== 'deleted');
    const maxMonthIndex = Math.max(...rentPayments.map((item) => Number(item.monthIndex || 0)));
    const nextStartMonthIndex = maxMonthIndex + 1;
    const nextCycleCount = 12;
    const nextEndMonthIndex = nextStartMonthIndex + nextCycleCount - 1;

    const currentRent = getLatestRentAmount(rentPayments, data?.data?.financeiro?.valor);
    if (currentRent <= 0) {
      throw new Error('Valor atual do aluguel inválido no contrato.');
    }

    const newRent = Number((currentRent * (1 + (adjustmentPercent / 100))).toFixed(2));
    const lastPayment = rentPayments.find((item) => Number(item.monthIndex || 0) === maxMonthIndex);
    const lastDueDate = parseDateAny(lastPayment?.dueDate);
    if (!lastDueDate) {
      throw new Error('Não foi possível calcular o próximo ciclo.');
    }
    const dueDay = normalizeDueDay(data?.data?.financeiro?.vencimentoDia ?? data?.data?.financeiro?.vencimento_dia, lastDueDate.getDate());

    const cycleStartDate = addMonthsSafe(lastDueDate, 1);
    const generated = buildRentPayments(cycleStartDate, newRent, nextStartMonthIndex, nextCycleCount, dueDay);
    const paymentsCol = fb.collection(fb.db, 'contracts', contractId, 'payments');

    await Promise.all(generated.map((payment) => {
      const paymentRef = fb.doc(paymentsCol, payment.id);
      return fb.setDoc(paymentRef, payment.data, { merge: true });
    }));

    const contractData = { ...(data.data || {}) };
    contractData.status = 'active';

    await fb.setDoc(ref, {
      status: 'active',
      data: contractData,
      updatedAt: nowIso(),
      paymentCycle: {
        currentRent: newRent,
        previousRent: currentRent,
        cycleStartIndex: nextStartMonthIndex,
        cycleEndIndex: nextEndMonthIndex,
        appliedAt: nowIso()
      },
      lastAdjustment: {
        percentage: adjustmentPercent,
        previousRent: currentRent,
        newRent,
        cycleStartIndex: nextStartMonthIndex,
        cycleEndIndex: nextEndMonthIndex,
        appliedAt: nowIso()
      }
    }, { merge: true });

    return {
      adjusted: true,
      adjustmentPercent,
      previousRent: currentRent,
      newRent,
      generatedCount: generated.length,
      cycleStartIndex: nextStartMonthIndex,
      cycleEndIndex: nextEndMonthIndex
    };
  }

  async function closeContract(contractId, closeDateInput, closeReasonInput) {
    const { fb, ref, data } = await getContractDoc(contractId);
    const status = normalizeContractStatus(data.status);
    if (status !== 'active') {
      throw new Error('Somente contratos ativos podem ser encerrados.');
    }

    const closeDate = toIsoDate(parseDateAny(closeDateInput) || new Date());
    if (!closeDate) {
      throw new Error('Data de encerramento inválida.');
    }

    const closeReason = String(closeReasonInput || '').trim() || 'Encerramento manual';
    const closeDateObj = new Date(`${closeDate}T00:00:00`);
    const payments = await listPayments(contractId);

    const remainingUnpaidRents = payments.filter((item) => {
      if (item.type !== 'rent') return false;
      if (item.status !== 'pending') return false;
      const due = item.dueDate ? new Date(`${item.dueDate}T00:00:00`) : null;
      if (!due || Number.isNaN(due.getTime())) return false;
      return due.getTime() > closeDateObj.getTime();
    });

    const penaltyCalc = calculateRescisoryPenalty(data, closeDate, payments);
    const penaltyAmount = penaltyCalc.penaltyAmount;
    const paymentsCol = fb.collection(fb.db, 'contracts', contractId, 'payments');

    if (penaltyAmount > 0) {
      const maxMonthIndex = Math.max(0, ...payments.map((item) => Number(item.monthIndex || 0)));
      const penaltyMonth = maxMonthIndex + 1;
      const penaltyId = paymentDocId(penaltyMonth, 'penalty');
      const penaltyRef = fb.doc(paymentsCol, penaltyId);
      await fb.setDoc(penaltyRef, createPaymentDoc({
        monthIndex: penaltyMonth,
        dueDate: closeDate,
        amount: penaltyAmount,
        type: 'penalty',
        description: `Multa rescisória proporcional: 3 aluguéis vigentes x ${(penaltyCalc.proportion * 100).toFixed(2)}% do período não cumprido`
      }), { merge: true });
    }

    await Promise.all(remainingUnpaidRents.map((payment) => {
      const paymentRef = fb.doc(paymentsCol, payment.id);
      return fb.setDoc(paymentRef, {
        status: 'canceled',
        updatedAt: nowIso(),
        canceledAt: nowIso(),
        cancelReason: closeReason
      }, { merge: true });
    }));

    const contractData = {
      ...(data.data || {}),
      status: 'closed'
    };

    await fb.setDoc(ref, {
      status: 'closed',
      closedAt: nowIso(),
      closeDate,
      closeReason,
      updatedAt: nowIso(),
      data: contractData
    }, { merge: true });

    return {
      closed: true,
      penaltyAmount,
      canceledCount: remainingUnpaidRents.length
    };
  }

  async function reopenContract(contractId, targetStatusInput) {
    const { fb, ref, data } = await getContractDoc(contractId);
    const status = normalizeContractStatus(data.status);
    if (status !== 'closed') {
      throw new Error('Somente contratos encerrados podem ser reabertos.');
    }

    const targetStatus = normalizeContractStatus(targetStatusInput);
    if (targetStatus !== 'draft' && targetStatus !== 'active') {
      throw new Error('Status de reabertura inválido.');
    }

    const contractData = {
      ...(data.data || {}),
      status: targetStatus
    };

    await fb.setDoc(ref, {
      status: targetStatus,
      reopenedAt: nowIso(),
      updatedAt: nowIso(),
      data: contractData
    }, { merge: true });

    return { reopened: true, status: targetStatus };
  }

  async function returnToDraft(contractId, reasonInput) {
    const { fb, ref, data } = await getContractDoc(contractId);
    const reason = String(reasonInput || '').trim() || 'Retorno manual para rascunho';

    const contractData = {
      ...(data.data || {}),
      status: 'draft'
    };

    await fb.setDoc(ref, {
      status: 'draft',
      updatedAt: nowIso(),
      returnedToDraftAt: nowIso(),
      returnedToDraftReason: reason,
      data: contractData
    }, { merge: true });

    return { returned: true, status: 'draft' };
  }

  async function createManualPayment(contractId, payload = {}) {
    const { fb, ref, data } = await getContractDoc(contractId);
    const contractStatus = normalizeContractStatus(data.status);
    if (contractStatus !== 'active' && contractStatus !== 'closed') {
      throw new Error('Somente contratos ativos/encerrados permitem lançamento manual de parcela.');
    }

    const payments = await listPayments(contractId);
    const maxMonthIndex = Math.max(0, ...payments.map((item) => Number(item.monthIndex || 0)));
    const monthIndex = Number(payload.monthIndex);
    const finalMonthIndex = Number.isFinite(monthIndex) && monthIndex > 0
      ? Math.floor(monthIndex)
      : maxMonthIndex + 1;

    const dueDate = toIsoDate(parseDateAny(payload.dueDate) || new Date());
    const amount = parseCurrencyToNumber(payload.amount);
    const type = ['rent', 'penalty', 'other'].includes(String(payload.type || '').toLowerCase())
      ? String(payload.type).toLowerCase()
      : 'other';
    const description = payload.description ? String(payload.description).trim() : null;

    if (!dueDate || !Number.isFinite(amount) || amount <= 0) {
      throw new Error('Dados inválidos para lançamento manual.');
    }

    const customSuffix = `manual-${Date.now()}`;
    const paymentId = paymentDocId(finalMonthIndex, customSuffix);
    const paymentRef = fb.doc(fb.db, 'contracts', contractId, 'payments', paymentId);

    await fb.setDoc(paymentRef, createPaymentDoc({
      monthIndex: finalMonthIndex,
      dueDate,
      amount,
      type,
      description
    }), { merge: true });

    await fb.setDoc(ref, {
      updatedAt: nowIso(),
      lastManualPaymentAt: nowIso()
    }, { merge: true });

    return { created: true, id: paymentId, monthIndex: finalMonthIndex };
  }

  async function clearAllPayments(contractId) {
    const { fb, ref } = await getContractDoc(contractId);
    const payments = await listPayments(contractId);

    if (!payments.length) {
      return { cleared: true, deletedCount: 0 };
    }

    for (const payment of payments) {
      const paymentRef = fb.doc(fb.db, 'contracts', contractId, 'payments', payment.id);
      await fb.deleteDoc(paymentRef);
    }

    await fb.setDoc(ref, {
      updatedAt: nowIso(),
      lastPaymentsClearedAt: nowIso(),
      lastPaymentsClearedCount: payments.length
    }, { merge: true });

    return { cleared: true, deletedCount: payments.length };
  }

  window.PaymentsManager = {
    activateContract,
    loadPaymentDashboard,
    markAsPaid,
    undoPayment,
    editPayment,
    deletePayment,
    applyIGPMReadjustment,
    applyIndexReadjustment: applyIGPMReadjustment,
    closeContract,
    reopenContract,
    returnToDraft,
    createManualPayment,
    clearAllPayments,
    calculateLatePaymentBreakdown,
    parseCurrencyToNumber,
    formatCurrencyBR,
    toIsoDate
  };
})();
