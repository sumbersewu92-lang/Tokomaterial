import { db, isSqlConfigured } from '../index.ts';
import { sales, saleItems, storeExpenses, products } from '../schema.ts';
import { eq } from 'drizzle-orm';

export const INDONESIAN_MONTH_NAMES = [
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

export interface AnalyticsPeriodOptions {
  period?: 'today' | 'this_week' | 'this_month' | 'this_year' | 'monthly' | 'yearly' | 'custom' | 'all';
  month?: number;
  year?: number;
  date?: string;
  startDate?: string;
  endDate?: string;
}

function extractDateStr(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
      return val.slice(0, 10);
    }
    const dmyMatch = val.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmyMatch) {
      const d = dmyMatch[1].padStart(2, '0');
      const m = dmyMatch[2].padStart(2, '0');
      const y = dmyMatch[3];
      return `${y}-${m}-${d}`;
    }
  }
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function matchesPeriod(dateVal: any, start: string | null, end: string | null): boolean {
  if (!start && !end) return true;
  if (!dateVal) return false;

  const dStr = extractDateStr(dateVal);
  if (!dStr) return false;

  if (start && end && start === end) {
    if (dStr === start) return true;
    const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
    if (!isNaN(d.getTime())) {
      const isoStr = d.toISOString().slice(0, 10);
      if (isoStr === start) return true;
    }
    return false;
  }

  if (start && dStr < start) return false;
  if (end && dStr > end) return false;
  return true;
}

export async function getFinancialSummary(
  periodOption: string = 'this_month',
  options: AnalyticsPeriodOptions = {}
) {
  const normalizedPeriod = (periodOption || options.period || 'this_month').toLowerCase();
  try {
    const now = new Date();
    const todayStr = extractDateStr(now) || now.toISOString().slice(0, 10);
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12

    let startFilter: string | null = null;
    let endFilter: string | null = null;
    let periodLabel = '';
    let activeMonth: number | undefined = undefined;
    let activeYear: number | undefined = undefined;

    if (
      normalizedPeriod === 'daily' ||
      normalizedPeriod === 'today' ||
      (options.date && normalizedPeriod !== 'monthly' && normalizedPeriod !== 'yearly' && normalizedPeriod !== 'all')
    ) {
      const targetDate = options.date ? (extractDateStr(options.date) || options.date) : todayStr;
      startFilter = targetDate;
      endFilter = targetDate;
      const [y, m, d] = targetDate.split('-');
      periodLabel = `${parseInt(d, 10)} ${INDONESIAN_MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
    } else if (normalizedPeriod === 'monthly' || normalizedPeriod === 'this_month') {
      const m = options.month !== undefined ? Number(options.month) : currentMonth;
      const y = options.year !== undefined ? Number(options.year) : currentYear;
      activeMonth = m;
      activeYear = y;

      const mPadded = String(m).padStart(2, '0');
      const lastDay = new Date(y, m, 0).getDate();
      startFilter = `${y}-${mPadded}-01`;
      endFilter = `${y}-${mPadded}-${String(lastDay).padStart(2, '0')}`;
      periodLabel = `${INDONESIAN_MONTH_NAMES[m - 1]} ${y}`;
    } else if (normalizedPeriod === 'yearly' || normalizedPeriod === 'this_year') {
      const y = options.year !== undefined ? Number(options.year) : currentYear;
      activeYear = y;
      startFilter = `${y}-01-01`;
      endFilter = `${y}-12-31`;
      periodLabel = `Tahun ${y}`;
    } else if (normalizedPeriod === 'all') {
      startFilter = null;
      endFilter = null;
      periodLabel = 'Semua Riwayat (All Time)';
    } else {
      const mPadded = String(currentMonth).padStart(2, '0');
      const lastDay = new Date(currentYear, currentMonth, 0).getDate();
      startFilter = `${currentYear}-${mPadded}-01`;
      endFilter = `${currentYear}-${mPadded}-${String(lastDay).padStart(2, '0')}`;
      periodLabel = `${INDONESIAN_MONTH_NAMES[currentMonth - 1]} ${currentYear}`;
      activeMonth = currentMonth;
      activeYear = currentYear;
    }

    if (!isSqlConfigured) {
      return {
        period: normalizedPeriod,
        periodLabel,
        activeMonth,
        activeYear,
        totalOmset: 0,
        totalGrossProfit: 0,
        totalExpenses: 0,
        netProfit: 0,
        summary: {
          salesOmset: 0,
          salesTotalCost: 0,
          salesTotalProfit: 0,
          materialsOmset: 0,
          materialsProfit: 0,
          fertilizersOmset: 0,
          fertilizersProfit: 0,
        },
        pillarBreakdown: {
          material: { omset: 0, profit: 0 },
          pupuk: { omset: 0, profit: 0 },
          hp: { omset: 0, profit: 0 },
          aksesoris: { omset: 0, profit: 0 },
          brilinkBank: { profit: 0 },
          ewallet: { profit: 0 },
          ppobPulsa: { profit: 0 },
          serviceSoftware: { omset: 0, toolCost: 0, profit: 0 },
        },
        expensesByCategory: {},
        paymentMethodBreakdown: {
          cash: { count: 0, total: 0 },
          qris: { count: 0, total: 0 },
          transfer: { count: 0, total: 0 },
        },
        indicators: {
          transactionCount: 0,
          salesCount: 0,
          lowStockCount: 0,
        },
        categoryTransactions: {
          material: [],
          pupuk: [],
        },
        availableYears: [currentYear, currentYear - 1],
      };
    }

    // 1. Fetch Sales and calculate Payment Methods breakdown
    const allSales = await db.select().from(sales);
    const filteredSales = allSales.filter(s => matchesPeriod(s.createdAt, startFilter, endFilter));

    let salesOmset = 0;
    let salesTotalCost = 0;
    let salesTotalProfit = 0;

    const paymentMethodBreakdown: Record<string, { count: number; total: number }> = {
      cash: { count: 0, total: 0 },
      qris: { count: 0, total: 0 },
      transfer: { count: 0, total: 0 },
    };

    for (const s of filteredSales) {
      salesOmset += s.grandTotal;
      salesTotalCost += s.totalCost;
      salesTotalProfit += s.totalProfit;

      const method = (s.paymentMethod || 'cash').toLowerCase();
      if (!paymentMethodBreakdown[method]) {
        paymentMethodBreakdown[method] = { count: 0, total: 0 };
      }
      paymentMethodBreakdown[method].count += 1;
      paymentMethodBreakdown[method].total += s.grandTotal;
    }

    // 2. Breakdown by Material Bangunan vs Pupuk & Pertanian
    const allSaleItems = await db.select().from(saleItems);
    const filteredSaleIds = new Set(filteredSales.map(s => s.id));
    const itemsInPeriod = allSaleItems.filter(item => item.saleId && filteredSaleIds.has(item.saleId));

    const salesById = new Map<number, typeof sales.$inferSelect>();
    for (const s of filteredSales) {
      salesById.set(s.id, s);
    }

    const materialTxMap = new Map<number, {
      saleId: number;
      invoiceNumber: string;
      customerName: string;
      createdAt: any;
      paymentMethod: string;
      items: Array<{
        productName: string;
        category: string;
        quantity: number;
        sellingPrice: number;
        costPrice: number;
        subtotal: number;
        profit: number;
      }>;
      totalQty: number;
      subtotal: number;
      profit: number;
    }>();

    const pupukTxMap = new Map<number, {
      saleId: number;
      invoiceNumber: string;
      customerName: string;
      createdAt: any;
      paymentMethod: string;
      items: Array<{
        productName: string;
        category: string;
        quantity: number;
        sellingPrice: number;
        costPrice: number;
        subtotal: number;
        profit: number;
      }>;
      totalQty: number;
      subtotal: number;
      profit: number;
    }>();

    let omsetMaterial = 0;
    let profitMaterial = 0;
    let omsetPupuk = 0;
    let profitPupuk = 0;

    for (const item of itemsInPeriod) {
      const cat = (item.productCategory || '').toLowerCase();
      const isPupuk = cat.includes('pupuk') || cat === 'pupuk' || cat.includes('pertanian');

      if (isPupuk) {
        omsetPupuk += item.subtotal;
        profitPupuk += item.profit;
      } else {
        omsetMaterial += item.subtotal;
        profitMaterial += item.profit;
      }

      if (item.saleId) {
        const sale = salesById.get(item.saleId);
        if (sale) {
          const targetMap = isPupuk ? pupukTxMap : materialTxMap;
          let record = targetMap.get(item.saleId);
          if (!record) {
            record = {
              saleId: sale.id,
              invoiceNumber: sale.invoiceNumber,
              customerName: sale.customerName || 'Pelanggan Umum',
              createdAt: sale.createdAt,
              paymentMethod: sale.paymentMethod || 'cash',
              items: [],
              totalQty: 0,
              subtotal: 0,
              profit: 0,
            };
            targetMap.set(item.saleId, record);
          }
          record.items.push({
            productName: item.productName,
            category: item.productCategory,
            quantity: item.quantity,
            sellingPrice: item.sellingPrice,
            costPrice: item.costPrice,
            subtotal: item.subtotal,
            profit: item.profit,
          });
          record.totalQty += item.quantity;
          record.subtotal += item.subtotal;
          record.profit += item.profit;
        }
      }
    }

    // If no line items detail yet, divide proportionally based on sales totals
    if (itemsInPeriod.length === 0 && salesOmset > 0) {
      omsetMaterial = Math.round(salesOmset * 0.65);
      profitMaterial = Math.round(salesTotalProfit * 0.65);
      omsetPupuk = salesOmset - omsetMaterial;
      profitPupuk = salesTotalProfit - profitMaterial;

      for (const s of filteredSales) {
        materialTxMap.set(s.id, {
          saleId: s.id,
          invoiceNumber: s.invoiceNumber,
          customerName: s.customerName || 'Pelanggan Umum',
          createdAt: s.createdAt,
          paymentMethod: s.paymentMethod || 'cash',
          items: [{
            productName: 'Material Bangunan (Semen/Besi/Pasir)',
            category: 'material',
            quantity: 1,
            sellingPrice: s.grandTotal,
            costPrice: s.totalCost,
            subtotal: s.grandTotal,
            profit: s.totalProfit,
          }],
          totalQty: 1,
          subtotal: s.grandTotal,
          profit: s.totalProfit,
        });
      }
    }

    const materialTransactions = Array.from(materialTxMap.values()).sort((a, b) => b.saleId - a.saleId);
    const pupukTransactions = Array.from(pupukTxMap.values()).sort((a, b) => b.saleId - a.saleId);

    // 3. Store Expenses
    const allExpenses = await db.select().from(storeExpenses);
    const filteredExpenses = allExpenses.filter(e => matchesPeriod(e.expenseDate, startFilter, endFilter));
    const totalExpenses = filteredExpenses.reduce((acc, cur) => acc + cur.amount, 0);

    const expensesByCategory: Record<string, number> = {};
    for (const exp of filteredExpenses) {
      expensesByCategory[exp.category] = (expensesByCategory[exp.category] || 0) + exp.amount;
    }

    // 4. Aggregate Totals
    const totalGrossOmset = salesOmset;
    const totalGrossProfit = salesTotalProfit;
    const netProfit = totalGrossProfit - totalExpenses;

    // 5. Low stock products alert count
    const allProds = await db.select().from(products);
    const lowStockCount = allProds.filter(p => p.stock <= p.minStockAlert).length;

    // Available Years
    const yearSet = new Set<number>();
    yearSet.add(currentYear);
    yearSet.add(currentYear - 1);
    yearSet.add(currentYear + 1);

    for (const s of allSales) {
      const d = extractDateStr(s.createdAt);
      if (d) yearSet.add(parseInt(d.slice(0, 4), 10));
    }
    for (const exp of allExpenses) {
      if (exp.expenseDate) yearSet.add(parseInt(exp.expenseDate.slice(0, 4), 10));
    }

    const availableYears = Array.from(yearSet).sort((a, b) => b - a);

    return {
      period: periodOption,
      selectedPeriodInfo: {
        label: periodLabel,
        startDate: startFilter,
        endDate: endFilter,
        month: activeMonth,
        year: activeYear,
      },
      availableYears,
      totalGrossOmset,
      totalGrossProfit,
      totalExpenses,
      netProfit,
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
        hp: { omset: omsetMaterial, profit: profitMaterial }, // legacy compatibility
        aksesoris: { omset: omsetPupuk, profit: profitPupuk }, // legacy compatibility
        brilinkBank: { profit: 0 },
        ewallet: { profit: 0 },
        ppobPulsa: { profit: 0 },
        serviceSoftware: { omset: 0, toolCost: 0, profit: 0 },
      },
      expensesByCategory,
      paymentMethodBreakdown,
      indicators: {
        transactionCount: filteredSales.length,
        salesCount: filteredSales.length,
        lowStockCount,
      },
      categoryTransactions: {
        material: materialTransactions,
        pupuk: pupukTransactions,
      },
    };
  } catch (error) {
    console.error('Failed to get financial summary:', error);
    throw new Error('Database analytics query failed', { cause: error });
  }
}
