import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase.ts';
import {
  FinancialSummary,
  CategoryTransactionRecord,
  Sale,
  StoreExpense,
  DebtPaymentRecord,
} from '../types/index.ts';
import {
  MATERIALS_COLLECTION,
  FERTILIZERS_COLLECTION,
  AGRICULTURE_COLLECTION,
  SALES_COLLECTION,
  EXPENSES_COLLECTION,
  normalizeSaleRecord,
} from './cloudInventoryService.ts';
import { getStoredSales } from '../utils/transactionSync.ts';

const INDONESIAN_MONTH_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

function extractLocalDateStr(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    // Plain date string YYYY-MM-DD (no time component)
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
  }
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) {
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
      return val.slice(0, 10);
    }
    return null;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function matchesPeriod(dateVal: any, start: string | null, end: string | null): boolean {
  if (!start && !end) return true;
  if (!dateVal) return false;
  const dStr = extractLocalDateStr(dateVal);
  if (!dStr) return false;
  if (start && dStr < start) return false;
  if (end && dStr > end) return false;
  return true;
}

export interface CloudAnalyticsQuery {
  period: 'daily' | 'monthly' | 'yearly' | 'all';
  month?: number;
  year?: number;
  date?: string;
}

export async function getCloudFinancialSummary(
  opts: CloudAnalyticsQuery
): Promise<FinancialSummary> {
  const now = new Date();
  const todayStr = extractLocalDateStr(now) || now.toISOString().slice(0, 10);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  let startFilter: string | null = null;
  let endFilter: string | null = null;
  let periodLabel = '';
  let activeMonth: number | undefined;
  let activeYear: number | undefined;

  if (opts.period === 'daily') {
    const targetDate = opts.date ? extractLocalDateStr(opts.date) || opts.date : todayStr;
    startFilter = targetDate;
    endFilter = targetDate;
    const [y, m, d] = targetDate.split('-');
    periodLabel = `${parseInt(d, 10)} ${INDONESIAN_MONTH_NAMES[parseInt(m, 10) - 1] || m} ${y}`;
  } else if (opts.period === 'monthly') {
    const m = opts.month ?? currentMonth;
    const y = opts.year ?? currentYear;
    activeMonth = m;
    activeYear = y;
    const mPadded = String(m).padStart(2, '0');
    const lastDay = new Date(y, m, 0).getDate();
    startFilter = `${y}-${mPadded}-01`;
    endFilter = `${y}-${mPadded}-${String(lastDay).padStart(2, '0')}`;
    periodLabel = `${INDONESIAN_MONTH_NAMES[m - 1] || m} ${y}`;
  } else if (opts.period === 'yearly') {
    const y = opts.year ?? currentYear;
    activeYear = y;
    startFilter = `${y}-01-01`;
    endFilter = `${y}-12-31`;
    periodLabel = `Tahun ${y}`;
  } else {
    periodLabel = 'Semua Riwayat (All Time)';
  }

  // 1. Fetch sales from Cloud Firestore (with localStorage fallback if offline)
  let allSales: Sale[] = [];
  try {
    const snap = await getDocs(collection(db, SALES_COLLECTION));
    snap.forEach((d) => {
      allSales.push(normalizeSaleRecord(d.data()));
    });
  } catch {
    allSales = (getStoredSales() || []).map((s) => normalizeSaleRecord(s));
  }

  // 2. Fetch expenses from Cloud Firestore + /api/expenses (deduped)
  let allExpenses: StoreExpense[] = [];
  try {
    const expSnap = await getDocs(collection(db, EXPENSES_COLLECTION));
    expSnap.forEach((d) => {
      const data = d.data();
      allExpenses.push({
        id: data.numericId || d.id,
        docId: d.id,
        category: data.category || 'lainnya',
        title: data.title || '',
        amount: Number(data.amount || 0),
        expenseDate: data.expenseDate || todayStr,
        paidBy: data.paidBy || 'cash',
        notes: data.notes,
        createdAt: data.createdAt || now.toISOString(),
      });
    });
  } catch {
    // ignore
  }

  if (allExpenses.length === 0) {
    try {
      const res = await fetch('/api/expenses');
      if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
        const apiExp = await res.json();
        if (Array.isArray(apiExp)) {
          allExpenses = apiExp;
        }
      }
    } catch {
      // ignore
    }
  }

  // 3. Low stock count across 3 inventory collections
  let lowStockCount = 0;
  try {
    const [matSnap, fertSnap, agriSnap] = await Promise.all([
      getDocs(collection(db, MATERIALS_COLLECTION)),
      getDocs(collection(db, FERTILIZERS_COLLECTION)),
      getDocs(collection(db, AGRICULTURE_COLLECTION)),
    ]);
    const countLow = (snap: typeof matSnap, defaultAlert: number) => {
      snap.forEach((d) => {
        const data = d.data();
        const stock = Number(data.stock || 0);
        const minAlert = Number(data.minStockAlert ?? defaultAlert);
        if (stock <= minAlert) lowStockCount += 1;
      });
    };
    countLow(matSnap, 10);
    countLow(fertSnap, 5);
    countLow(agriSnap, 5);
  } catch {
    // ignore
  }

  // 4. Cash-Basis + Proportional Profit (Opsi A) aggregation
  let salesOmset = 0;
  let salesTotalCost = 0;
  let salesTotalProfit = 0;
  let omsetMaterial = 0;
  let profitMaterial = 0;
  let omsetPupuk = 0;
  let profitPupuk = 0;
  let totalOutstandingDebt = 0;
  let unpaidInvoiceCount = 0;
  let activeSalesCount = 0;

  const paymentMethodBreakdown = {
    cash: { count: 0, total: 0 },
    qris: { count: 0, total: 0 },
    transfer: { count: 0, total: 0 },
  };

  const materialTransactions: CategoryTransactionRecord[] = [];
  const pupukTransactions: CategoryTransactionRecord[] = [];

  const yearSet = new Set<number>([currentYear + 1, currentYear, currentYear - 1]);

  for (const sale of allSales) {
    const createdDate = extractLocalDateStr(sale.createdAt);
    if (createdDate) yearSet.add(parseInt(createdDate.slice(0, 4), 10));

    // Active receivables across all time
    const remDebt = Math.max(0, Number(sale.remainingDebt || 0));
    if (remDebt > 0) {
      totalOutstandingDebt += remDebt;
      unpaidInvoiceCount += 1;
    }

    // Build chronological cash-inflow payments for this sale
    const isDebt = String(sale.paymentMethod || '').toLowerCase() === 'debt';
    let payments: DebtPaymentRecord[] = Array.isArray(sale.paymentHistory)
      ? sale.paymentHistory
      : [];

    if (!isDebt && payments.length === 0) {
      const m = String(sale.paymentMethod || 'cash').toLowerCase();
      const normalizedMethod: 'cash' | 'transfer' | 'qris' =
        m === 'transfer' || m === 'qris' ? m : 'cash';
      payments = [
        {
          id: `full-${sale.invoiceNumber}`,
          amount: Number(sale.grandTotal || 0),
          method: normalizedMethod,
          paidAt: sale.createdAt,
          receivedBy: sale.cashierUid || 'Kasir',
        },
      ];
    } else if (isDebt && payments.length === 0 && Number(sale.paidTotal || 0) > 0) {
      payments = [
        {
          id: `dp-${sale.invoiceNumber}`,
          amount: Number(sale.paidTotal || 0),
          method: sale.dpMethod || 'cash',
          paidAt: sale.createdAt,
          receivedBy: sale.cashierUid || 'Kasir',
        },
      ];
    }

    for (const p of payments) {
      const pDate = extractLocalDateStr(p.paidAt);
      if (pDate) yearSet.add(parseInt(pDate.slice(0, 4), 10));
    }

    const paymentsInPeriod = payments.filter((p) =>
      matchesPeriod(p.paidAt, startFilter, endFilter)
    );
    const paidInPeriod = paymentsInPeriod.reduce((sum, p) => sum + Number(p.amount || 0), 0);

    if (paidInPeriod <= 0) {
      continue;
    }

    activeSalesCount += 1;

    // Count cash received per actual payment method
    const seenMethodForSale = new Set<string>();
    for (const p of paymentsInPeriod) {
      const m = p.method === 'transfer' || p.method === 'qris' ? p.method : 'cash';
      paymentMethodBreakdown[m].total += Number(p.amount || 0);
      if (!seenMethodForSale.has(m)) {
        paymentMethodBreakdown[m].count += 1;
        seenMethodForSale.add(m);
      }
    }

    const saleGrandTotal = Number(sale.grandTotal || 0);
    const saleTotalCost = Number(sale.totalCost || 0);
    const saleTotalProfit = Math.max(
      0,
      typeof sale.totalProfit === 'number' ? sale.totalProfit : saleGrandTotal - saleTotalCost
    );
    const ratio = saleGrandTotal > 0 ? Math.min(1, paidInPeriod / saleGrandTotal) : 1;

    const profitInPeriod = Math.round(saleTotalProfit * ratio);
    const costInPeriod = Math.round(saleTotalCost * ratio);

    salesOmset += paidInPeriod;
    salesTotalProfit += profitInPeriod;
    salesTotalCost += costInPeriod;

    // Category split (Material vs Pupuk & Pertanian)
    const items = Array.isArray(sale.items) ? sale.items : [];
    const matItems: typeof items = [];
    const pupukItems: typeof items = [];
    let matRawSubtotal = 0;
    let pupukRawSubtotal = 0;
    let matRawProfit = 0;
    let pupukRawProfit = 0;

    for (const it of items) {
      const cat = String(it.productCategory || it.categoryCode || '').toLowerCase();
      const isPupuk = cat.includes('pupuk') || cat.includes('pertanian');
      if (isPupuk) {
        pupukItems.push(it);
        pupukRawSubtotal += Number(it.subtotal || 0);
        pupukRawProfit += Number(it.profit || 0);
      } else {
        matItems.push(it);
        matRawSubtotal += Number(it.subtotal || 0);
        matRawProfit += Number(it.profit || 0);
      }
    }

    const totalItemsSub = matRawSubtotal + pupukRawSubtotal;
    const matWeight = totalItemsSub > 0 ? matRawSubtotal / totalItemsSub : 1;
    const matOmsetShare = Math.round(paidInPeriod * matWeight);
    const pupukOmsetShare = paidInPeriod - matOmsetShare;

    const totalItemsProfit = matRawProfit + pupukRawProfit;
    const matProfitWeight = totalItemsProfit > 0 ? matRawProfit / totalItemsProfit : matWeight;
    const matProfitShare = Math.round(profitInPeriod * matProfitWeight);
    const pupukProfitShare = profitInPeriod - matProfitShare;

    if (matItems.length > 0 || pupukItems.length === 0) {
      omsetMaterial += matOmsetShare;
      profitMaterial += matProfitShare;
      materialTransactions.push({
        saleId: Number(sale.id) || 0,
        invoiceNumber: sale.invoiceNumber,
        customerName: sale.customerName || 'Pelanggan Umum',
        createdAt: paymentsInPeriod[paymentsInPeriod.length - 1]?.paidAt || sale.createdAt,
        paymentMethod: sale.paymentMethod || 'cash',
        paymentStatus: sale.paymentStatus,
        paidInPeriod: matOmsetShare,
        remainingDebt: sale.remainingDebt,
        items: (matItems.length > 0 ? matItems : items).map((it) => ({
          productName: it.productName,
          category: it.productCategory || 'Material Bangunan',
          quantity: Number(it.quantity || 0),
          sellingPrice: Number(it.sellingPrice || 0),
          costPrice: Number(it.costPrice || 0),
          subtotal: Number(it.subtotal || 0),
          profit: Number(it.profit || 0),
        })),
        totalQty: (matItems.length > 0 ? matItems : items).reduce(
          (sum, it) => sum + Number(it.quantity || 0),
          0
        ),
        subtotal: matOmsetShare,
        profit: matProfitShare,
      });
    }

    if (pupukItems.length > 0) {
      omsetPupuk += pupukOmsetShare;
      profitPupuk += pupukProfitShare;
      pupukTransactions.push({
        saleId: Number(sale.id) || 0,
        invoiceNumber: sale.invoiceNumber,
        customerName: sale.customerName || 'Pelanggan Umum',
        createdAt: paymentsInPeriod[paymentsInPeriod.length - 1]?.paidAt || sale.createdAt,
        paymentMethod: sale.paymentMethod || 'cash',
        paymentStatus: sale.paymentStatus,
        paidInPeriod: pupukOmsetShare,
        remainingDebt: sale.remainingDebt,
        items: pupukItems.map((it) => ({
          productName: it.productName,
          category: it.productCategory || 'Pupuk & Pertanian',
          quantity: Number(it.quantity || 0),
          sellingPrice: Number(it.sellingPrice || 0),
          costPrice: Number(it.costPrice || 0),
          subtotal: Number(it.subtotal || 0),
          profit: Number(it.profit || 0),
        })),
        totalQty: pupukItems.reduce((sum, it) => sum + Number(it.quantity || 0), 0),
        subtotal: pupukOmsetShare,
        profit: pupukProfitShare,
      });
    }
  }

  // Sort detail transactions newest first
  const sortDesc = (a: CategoryTransactionRecord, b: CategoryTransactionRecord) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  materialTransactions.sort(sortDesc);
  pupukTransactions.sort(sortDesc);

  // 5. Expenses aggregation
  const filteredExpenses = allExpenses.filter((e) =>
    matchesPeriod(e.expenseDate, startFilter, endFilter)
  );
  const totalExpenses = filteredExpenses.reduce((acc, cur) => acc + Number(cur.amount || 0), 0);
  const expensesByCategory: Record<string, number> = {};
  for (const exp of filteredExpenses) {
    expensesByCategory[exp.category] =
      (expensesByCategory[exp.category] || 0) + Number(exp.amount || 0);
    if (exp.expenseDate && /^\d{4}/.test(exp.expenseDate)) {
      yearSet.add(parseInt(exp.expenseDate.slice(0, 4), 10));
    }
  }

  const netProfit = salesTotalProfit - totalExpenses;
  const availableYears = Array.from(yearSet).sort((a, b) => b - a);

  return {
    period: opts.period,
    selectedPeriodInfo: {
      label: periodLabel,
      startDate: startFilter,
      endDate: endFilter,
      month: activeMonth,
      year: activeYear,
    },
    availableYears,
    totalGrossOmset: salesOmset,
    totalGrossProfit: salesTotalProfit,
    totalExpenses,
    netProfit,
    totalOutstandingDebt,
    unpaidInvoiceCount,
    summary: {
      salesOmset,
      salesTotalCost,
      salesTotalProfit,
      materialsOmset: omsetMaterial,
      materialsProfit: profitMaterial,
      fertilizersOmset: omsetPupuk,
      fertilizersProfit: profitPupuk,
    },
    pillarBreakdown: {
      material: { omset: omsetMaterial, profit: profitMaterial },
      pupuk: { omset: omsetPupuk, profit: profitPupuk },
    },
    expensesByCategory,
    paymentMethodBreakdown,
    indicators: {
      transactionCount: activeSalesCount,
      salesCount: activeSalesCount,
      lowStockCount,
    },
    categoryTransactions: {
      material: materialTransactions,
      pupuk: pupukTransactions,
    },
  };
}
