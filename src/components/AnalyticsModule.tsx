import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Calendar,
  Download,
  TrendingUp,
  DollarSign,
  Layers,
  Sprout,
  Truck,
  CreditCard,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Banknote,
  QrCode,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Fuel,
  Users2,
  Zap,
  X,
  Search,
  Receipt,
  Package,
  Wallet,
} from 'lucide-react';
import { FinancialSummary, CategoryTransactionRecord } from '../types/index.ts';
import { getCloudFinancialSummary } from '../services/analyticsCloudService.ts';
import { onDataUpdated, onTransactionDeleted } from '../utils/transactionSync.ts';
import { useBodyScrollLock } from '../utils/scrollLock.ts';
import { FinancialReportModal } from './FinancialReportModal.tsx';

const INDONESIAN_MONTHS = [
  { value: 1, label: 'Januari' },
  { value: 2, label: 'Februari' },
  { value: 3, label: 'Maret' },
  { value: 4, label: 'April' },
  { value: 5, label: 'Mei' },
  { value: 6, label: 'Juni' },
  { value: 7, label: 'Juli' },
  { value: 8, label: 'Agustus' },
  { value: 9, label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' },
  { value: 12, label: 'Desember' },
];

export const AnalyticsModule: React.FC = () => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12
  const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Filter States
  const [periodType, setPeriodType] = useState<'monthly' | 'daily' | 'yearly' | 'all'>('daily');
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedDate, setSelectedDate] = useState<string>(todayDateStr);
  const [availableYears, setAvailableYears] = useState<number[]>([
    currentYear + 1,
    currentYear,
    currentYear - 1,
    currentYear - 2,
  ]);

  const [data, setData] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal Detail Transaksi Spesifik Kategori Usaha
  const [detailCategory, setDetailCategory] = useState<'material' | 'pupuk' | null>(null);
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const [reportModalOpen, setReportModalOpen] = useState(false);

  // Lock scroll background saat modal detail terbuka
  useBodyScrollLock(detailCategory !== null);

  const handleCloseDetailModal = () => {
    setDetailCategory(null);
    setModalSearchQuery('');
  };

  const formatRupiah = (val: number) => 'Rp ' + Number(val || 0).toLocaleString('id-ID');

  const formatDateTime = (val: any) => {
    if (!val) return '-';
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return `${d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const loadSummary = async () => {
    setLoading(true);
    try {
      const summary = await getCloudFinancialSummary({
        period: periodType,
        month: selectedMonth,
        year: selectedYear,
        date: selectedDate,
      });
      setData(summary);

      if (summary.availableYears && Array.isArray(summary.availableYears)) {
        setAvailableYears((prev) => {
          const merged = Array.from(new Set([...prev, ...summary.availableYears!])).sort(
            (a, b) => b - a
          );
          return merged;
        });
      }
    } catch (err) {
      console.error('Failed to load financial summary:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadSummary();

    const unsubUpdate = onDataUpdated(() => {
      loadSummary();
    });
    const unsubDelete = onTransactionDeleted(() => {
      loadSummary();
    });

    return () => {
      unsubUpdate();
      unsubDelete();
    };
  }, [periodType, selectedMonth, selectedYear, selectedDate]);

  // Quick navigation handlers
  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear((prev) => prev - 1);
    } else {
      setSelectedMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear((prev) => prev + 1);
    } else {
      setSelectedMonth((prev) => prev + 1);
    }
  };

  const handleThisMonth = () => {
    setSelectedMonth(currentMonth);
    setSelectedYear(currentYear);
  };

  const getDefaultReportRange = () => {
    if (periodType === 'daily') {
      return { from: selectedDate, to: selectedDate };
    }
    if (periodType === 'monthly') {
      const mPad = String(selectedMonth).padStart(2, '0');
      const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
      return {
        from: `${selectedYear}-${mPad}-01`,
        to: `${selectedYear}-${mPad}-${String(lastDay).padStart(2, '0')}`,
      };
    }
    if (periodType === 'yearly') {
      return {
        from: `${selectedYear}-01-01`,
        to: `${selectedYear}-12-31`,
      };
    }
    return {
      from: `${currentYear}-01-01`,
      to: todayDateStr,
    };
  };

  const defaultReportRange = getDefaultReportRange();

  const activePeriodLabel =
    data?.selectedPeriodInfo?.label ||
    (periodType === 'monthly'
      ? `${INDONESIAN_MONTHS.find((m) => m.value === selectedMonth)?.label} ${selectedYear}`
      : periodType === 'yearly'
      ? `Tahun ${selectedYear}`
      : periodType === 'daily'
      ? selectedDate
      : 'Semua Riwayat');

  const isCurrentMonthActive = selectedMonth === currentMonth && selectedYear === currentYear;

  const matOmset = data?.summary?.materialsOmset ?? data?.pillarBreakdown?.material?.omset ?? 0;
  const matProfit = data?.summary?.materialsProfit ?? data?.pillarBreakdown?.material?.profit ?? 0;
  const fertOmset = data?.summary?.fertilizersOmset ?? data?.pillarBreakdown?.pupuk?.omset ?? 0;
  const fertProfit = data?.summary?.fertilizersProfit ?? data?.pillarBreakdown?.pupuk?.profit ?? 0;

  const activeCategoryTxList: CategoryTransactionRecord[] =
    (detailCategory === 'material'
      ? data?.categoryTransactions?.material
      : detailCategory === 'pupuk'
      ? data?.categoryTransactions?.pupuk
      : []) || [];

  const filteredCategoryTxList = activeCategoryTxList.filter((tx) => {
    if (!modalSearchQuery.trim()) return true;
    const q = modalSearchQuery.toLowerCase().trim();
    const invMatch = (tx.invoiceNumber || '').toLowerCase().includes(q);
    const custMatch = (tx.customerName || '').toLowerCase().includes(q);
    const itemMatch = (tx.items || []).some((it) =>
      (it.productName || '').toLowerCase().includes(q)
    );
    return invMatch || custMatch || itemMatch;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-1 sm:pt-1.5 pb-6 sm:pb-8 space-y-6">
      {/* Header & Controls Panel */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        {/* Title & Cloud Sync Indicator */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-amber-600 shrink-0" />
              <h2 className="font-bold text-slate-900 text-base sm:text-lg">
                Laporan Keuangan & Analitik Laba/Rugi (P&L) Toko Sumber Sewu
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Rekapitulasi kas masuk (tunai, DP & cicilan hutang), laba kotor proporsional, beban operasional toko & armada, serta piutang pelanggan aktif.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 w-full sm:w-auto shrink-0">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Database Cloud Terhubung
            </span>
            <button
              onClick={() => {
                setRefreshing(true);
                loadSummary();
              }}
              title="Segarkan data dari database"
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-amber-600' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setReportModalOpen(true)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh Laporan</span>
            </button>
          </div>
        </div>

        {/* Filter Toolbar: Tab Type & Granular Period */}
        <div className="pt-3 border-t border-slate-100 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Main Period Type Switcher */}
          <div className="grid grid-cols-4 sm:inline-flex items-center rounded-xl bg-slate-100 p-1 text-[11px] sm:text-xs font-semibold w-full lg:w-auto shrink-0">
            <button
              onClick={() => setPeriodType('daily')}
              className={`px-2 sm:px-3.5 py-1.5 rounded-lg text-center transition cursor-pointer ${
                periodType === 'daily'
                  ? 'bg-white text-amber-800 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Harian
            </button>
            <button
              onClick={() => setPeriodType('monthly')}
              className={`px-2 sm:px-3.5 py-1.5 rounded-lg text-center transition cursor-pointer ${
                periodType === 'monthly'
                  ? 'bg-white text-amber-800 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Bulanan
            </button>
            <button
              onClick={() => setPeriodType('yearly')}
              className={`px-2 sm:px-3.5 py-1.5 rounded-lg text-center transition cursor-pointer ${
                periodType === 'yearly'
                  ? 'bg-white text-amber-800 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tahunan
            </button>
            <button
              onClick={() => setPeriodType('all')}
              className={`px-2 sm:px-3.5 py-1.5 rounded-lg text-center transition cursor-pointer ${
                periodType === 'all'
                  ? 'bg-white text-amber-800 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua
            </button>
          </div>

          {/* Granular Period Selector */}
          <div className="flex flex-wrap items-center gap-2">
            {periodType === 'monthly' && (
              <>
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="text-xs text-slate-500 font-medium">Bulan:</span>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer py-1.5"
                  >
                    {INDONESIAN_MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5">
                  <span className="text-xs text-slate-500 font-medium">Tahun:</span>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer py-1.5"
                  >
                    {availableYears.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={handlePrevMonth}
                    title="Bulan Sebelumnya"
                    aria-label="Bulan Sebelumnya"
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition bg-white shadow-2xs cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleNextMonth}
                    title="Bulan Berikutnya"
                    aria-label="Bulan Berikutnya"
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition bg-white shadow-2xs cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleThisMonth}
                    disabled={isCurrentMonthActive}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition border cursor-pointer ${
                      isCurrentMonthActive
                        ? 'bg-amber-50 border-amber-200 text-amber-800 opacity-60'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Bulan Ini
                  </button>
                </div>
              </>
            )}

            {periodType === 'yearly' && (
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5">
                <Calendar className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="text-xs text-slate-500 font-medium">Tahun:</span>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer py-1.5"
                >
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {periodType === 'daily' && (
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5">
                <Calendar className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="text-xs text-slate-500 font-medium">Tanggal:</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer py-1.5"
                />
              </div>
            )}

            {periodType === 'all' && (
              <span className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1 font-medium">
                Menampilkan seluruh riwayat transaksi Toko Sumber Sewu
              </span>
            )}
          </div>
        </div>

        {/* Active Filter Summary Bar */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-50/80 -mx-4 sm:-mx-5 -mb-4 sm:-mb-5 px-4 sm:px-5 py-2.5 rounded-b-2xl border-t border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">Periode Aktif:</span>
            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-bold">
              {activePeriodLabel}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600 font-medium">
            <span>
              Total Transaksi Penjualan: <strong className="text-slate-900">{data?.indicators?.salesCount || 0}</strong>
            </span>
            <span className="text-slate-300">&bull;</span>
            <span>
              SKU Menipis: <strong className="text-amber-700">{data?.indicators?.lowStockCount || 0}</strong>
            </span>
          </div>
        </div>
      </div>

      {loading && !data ? (
        <div className="bg-white p-16 rounded-2xl border border-slate-200 text-center text-slate-400 text-sm space-y-2">
          <div className="w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="font-medium text-slate-600">Mengagregasi laporan keuangan Toko Sumber Sewu...</p>
        </div>
      ) : !data ? (
        <div className="bg-white p-16 rounded-2xl border border-slate-200 text-center text-slate-400 text-sm">
          Data laporan keuangan tidak tersedia untuk periode ini.
        </div>
      ) : (
        <>
          {/* Top 4 KPI Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Omset Bruto */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2 relative overflow-hidden">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Omset / Uang Masuk</span>
                <span className="p-1.5 rounded-lg bg-amber-50 text-amber-700">
                  <TrendingUp className="w-4 h-4" />
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums break-words">
                {formatRupiah(data.totalGrossOmset)}
              </div>
              <div className="text-[11px] text-slate-400">
                Penjualan lunas, DP & cicilan diterima
              </div>
            </div>

            {/* 2. Total Laba Kotor */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2 relative overflow-hidden">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Laba Kotor (Proporsional)</span>
                <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                  <ArrowUpRight className="w-4 h-4" />
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-extrabold text-emerald-700 tabular-nums break-words">
                +{formatRupiah(data.totalGrossProfit)}
              </div>
              <div className="text-[11px] text-slate-400">
                Profit sesuai porsi pembayaran masuk
              </div>
            </div>

            {/* 3. Beban Operasional */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2 relative overflow-hidden">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Beban Operasional Toko</span>
                <span className="p-1.5 rounded-lg bg-rose-50 text-rose-600">
                  <ArrowDownRight className="w-4 h-4" />
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-extrabold text-rose-600 tabular-nums break-words">
                -{formatRupiah(data.totalExpenses)}
              </div>
              <div className="text-[11px] text-slate-400">
                BBM solar truk, kuli bongkar, listrik gudang
              </div>
            </div>

            {/* 4. Laba Bersih (Net Profit) */}
            <div className="bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/70 border-2 border-emerald-200/90 p-5 rounded-2xl shadow-xs space-y-2 text-slate-900 relative overflow-hidden">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-800">
                <span>LABA BERSIH (NET PROFIT)</span>
                <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                  <DollarSign className="w-4 h-4" />
                </span>
              </div>
              <div
                className={`text-xl sm:text-2xl font-black tabular-nums break-words ${
                  data.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'
                }`}
              >
                {formatRupiah(data.netProfit)}
              </div>
              <div className="text-[11px] text-emerald-800/80 font-medium">
                {data.totalGrossOmset > 0
                  ? `Margin Bersih: ${((data.netProfit / data.totalGrossOmset) * 100).toFixed(1)}%`
                  : 'Siap cetak laporan'}
              </div>
            </div>
          </div>

          {/* Piutang Pelanggan Aktif (Outstanding Receivables Banner) */}
          <div className="bg-white rounded-2xl border border-rose-200/90 shadow-xs p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 shrink-0">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-slate-900 text-sm">
                    Total Piutang Pelanggan Aktif (Belum Lunas)
                  </h3>
                  <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[10px] font-bold">
                    {data.unpaidInvoiceCount || 0} Faktur Tempo
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Sisa tagihan pelanggan seluruh periode — otomatis masuk ke Omset & Laba Kotor Proporsional pada tanggal cicilan/pelunasan dibayar.
                </p>
              </div>
            </div>
            <div className="text-left sm:text-right shrink-0 pl-11 sm:pl-0">
              <div className="text-lg sm:text-2xl font-black text-rose-600 tabular-nums">
                {formatRupiah(data.totalOutstandingDebt || 0)}
              </div>
              <div className="text-[11px] text-slate-500 font-medium">
                {(data.totalOutstandingDebt || 0) > 0
                  ? 'Kelola pelunasan di menu Riwayat Penjualan'
                  : 'Tidak ada piutang tertunggak'}
              </div>
            </div>
          </div>

          {/* Breakdown 2 Kategori Utama: Material Bangunan vs Pupuk Pertanian */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <PieChart className="w-5 h-5 text-amber-600 shrink-0" />
                <h3 className="font-bold text-slate-900 text-base">
                  Breakdown Omset & Profit per Kategori Usaha
                </h3>
              </div>
              <span className="text-xs text-slate-500 shrink-0">
                Periode: <strong>{activePeriodLabel}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Kategori 1: Material Bangunan */}
              <div className="p-4 sm:p-5 rounded-2xl border border-amber-200 bg-amber-50/30 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-2.5 rounded-xl bg-amber-100 text-amber-800 shrink-0">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-900 text-sm">Material Bangunan</h4>
                      <span className="text-xs text-slate-500 block">Semen, Besi Beton, Pasir, Cat, Pipa PVC, Bata</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white text-amber-800 border border-amber-200 font-mono">
                      {data?.categoryTransactions?.material?.length || 0} Trx
                    </span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                      Konstruksi
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-amber-200/60 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Omset Material:</span>
                    <span className="font-bold text-slate-900 text-sm">
                      {formatRupiah(matOmset)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Laba Kotor Material:</span>
                    <span className="font-bold text-emerald-700 text-sm">
                      +{formatRupiah(matProfit)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-500 pt-1 border-t border-amber-200/40">
                    <span>Margin Kotor:</span>
                    <span className="font-semibold text-slate-700">
                      {matOmset > 0 ? `${((matProfit / matOmset) * 100).toFixed(1)}%` : '0%'}
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-amber-200/60">
                  <button
                    type="button"
                    onClick={() => setDetailCategory('material')}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold text-xs shadow-xs transition-all cursor-pointer group"
                    title="Lihat seluruh daftar transaksi penjualan Material Bangunan"
                  >
                    <span>Lihat Detail Transaksi</span>
                    <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </button>
                </div>
              </div>

              {/* Kategori 2: Pupuk & Pertanian */}
              <div className="p-4 sm:p-5 rounded-2xl border border-emerald-200 bg-emerald-50/30 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-800 shrink-0">
                      <Sprout className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-900 text-sm">Pupuk & Agro Pertanian</h4>
                      <span className="text-xs text-slate-500 block">Urea, NPK Mutiara, KCL, Pestisida, Bibit</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white text-emerald-800 border border-emerald-200 font-mono">
                      {data?.categoryTransactions?.pupuk?.length || 0} Trx
                    </span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      Pertanian
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-emerald-200/60 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Omset Pupuk:</span>
                    <span className="font-bold text-slate-900 text-sm">
                      {formatRupiah(fertOmset)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Laba Kotor Pupuk:</span>
                    <span className="font-bold text-emerald-700 text-sm">
                      +{formatRupiah(fertProfit)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-500 pt-1 border-t border-emerald-200/40">
                    <span>Margin Kotor:</span>
                    <span className="font-semibold text-slate-700">
                      {fertOmset > 0 ? `${((fertProfit / fertOmset) * 100).toFixed(1)}%` : '0%'}
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-emerald-200/60">
                  <button
                    type="button"
                    onClick={() => setDetailCategory('pupuk')}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs shadow-xs transition-all cursor-pointer group"
                    title="Lihat seluruh daftar transaksi penjualan Pupuk & Agro Pertanian"
                  >
                    <span>Lihat Detail Transaksi</span>
                    <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Rekapitulasi Arus Kas Metode Pembayaran Kasir */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-indigo-600 shrink-0" />
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    Rekapitulasi Penerimaan Kasir per Metode Pembayaran
                  </h3>
                  <p className="text-xs text-slate-500">
                    Distribusi arus kas masuk dari penjualan retail & grosir (Tunai, QRIS Toko, dan Transfer Bank)
                  </p>
                </div>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 shrink-0 self-start sm:self-auto">
                {activePeriodLabel}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
              {/* Tunai / Cash */}
              <div className="p-4 rounded-xl border border-emerald-200/80 bg-emerald-50/40 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
                      <Banknote className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-900 text-xs">Tunai (Cash Fisik)</h4>
                      <span className="text-[10px] text-slate-500">Penerimaan laci kasir</span>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-emerald-700 px-2 py-0.5 rounded-full bg-emerald-100 shrink-0">
                    {data.paymentMethodBreakdown?.cash?.count || 0} Trx
                  </span>
                </div>
                <div className="pt-2 border-t border-emerald-200/60 flex flex-wrap justify-between items-baseline gap-1">
                  <span className="text-xs text-slate-500">Total Diterima:</span>
                  <span className="text-base font-extrabold text-slate-900">
                    {formatRupiah(data.paymentMethodBreakdown?.cash?.total || 0)}
                  </span>
                </div>
              </div>

              {/* QRIS Toko */}
              <div className="p-4 rounded-xl border border-indigo-200/80 bg-indigo-50/40 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-2 rounded-lg bg-indigo-100 text-indigo-700 shrink-0">
                      <QrCode className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-900 text-xs">QRIS Toko (Scan QR)</h4>
                      <span className="text-[10px] text-slate-500">BCA QR, Dana, GoPay</span>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-indigo-700 px-2 py-0.5 rounded-full bg-indigo-100 shrink-0">
                    {data.paymentMethodBreakdown?.qris?.count || 0} Trx
                  </span>
                </div>
                <div className="pt-2 border-t border-indigo-200/60 flex flex-wrap justify-between items-baseline gap-1">
                  <span className="text-xs text-slate-500">Total Diterima:</span>
                  <span className="text-base font-extrabold text-slate-900">
                    {formatRupiah(data.paymentMethodBreakdown?.qris?.total || 0)}
                  </span>
                </div>
              </div>

              {/* Transfer Bank */}
              <div className="p-4 rounded-xl border border-sky-200/80 bg-sky-50/40 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-2 rounded-lg bg-sky-100 text-sky-700 shrink-0">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-900 text-xs">Transfer Bank</h4>
                      <span className="text-[10px] text-slate-500">BCA, BRI, Mandiri</span>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-sky-700 px-2 py-0.5 rounded-full bg-sky-100 shrink-0">
                    {data.paymentMethodBreakdown?.transfer?.count || 0} Trx
                  </span>
                </div>
                <div className="pt-2 border-t border-sky-200/60 flex flex-wrap justify-between items-baseline gap-1">
                  <span className="text-xs text-slate-500">Total Diterima:</span>
                  <span className="text-base font-extrabold text-slate-900">
                    {formatRupiah(data.paymentMethodBreakdown?.transfer?.total || 0)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Breakdown Beban Operasional Toko & Armada */}
          {data.expensesByCategory && Object.keys(data.expensesByCategory).length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Fuel className="w-5 h-5 text-rose-600 shrink-0" />
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">
                      Rincian Beban Operasional Toko & Armada Pengiriman
                    </h3>
                    <p className="text-xs text-slate-500">
                      BBM Solar armada truk/pick-up, upah kuli angkut/bongkar, listrik gudang, dll.
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200 shrink-0 self-start sm:self-auto">
                  Total: -{formatRupiah(data.totalExpenses)}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {Object.entries(data.expensesByCategory).map(([cat, amount]) => {
                  const labelMap: Record<string, string> = {
                    bbm_armada: 'BBM Solar Armada',
                    upah_kuli: 'Upah Kuli Bongkar',
                    gaji_karyawan: 'Gaji Karyawan',
                    listrik_gudang: 'Listrik Gudang',
                    sewa_lahan: 'Sewa Lahan & Toko',
                    operasional_toko: 'Operasional Toko',
                    lainnya: 'Lain-lain',
                  };
                  return (
                    <div key={cat} className="p-3 rounded-xl border border-slate-200 bg-slate-50/60">
                      <span className="text-xs text-slate-600 font-semibold block capitalize">
                        {labelMap[cat] || cat.replace(/_/g, ' ')}
                      </span>
                      <span className="text-sm font-extrabold text-rose-600 mt-1 block">
                        -{formatRupiah(amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal Detail Transaksi Spesifik per Kategori Usaha */}
      {detailCategory && (
        <div
          data-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in"
          onClick={handleCloseDetailModal}
        >
          <div
            className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50/70">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-xs shrink-0 ${
                    detailCategory === 'material'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {detailCategory === 'material' ? (
                    <Layers className="w-5 h-5" />
                  ) : (
                    <Sprout className="w-5 h-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                      {detailCategory === 'material'
                        ? 'Detail Transaksi Material Bangunan'
                        : 'Detail Transaksi Pupuk & Agro Pertanian'}
                    </h3>
                    <span
                      className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                        detailCategory === 'material'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}
                    >
                      {detailCategory === 'material' ? 'Konstruksi' : 'Pertanian'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Periode: <strong className="text-slate-700">{activePeriodLabel}</strong> &bull; Total{' '}
                    <strong className="text-slate-700">{activeCategoryTxList.length} Transaksi</strong> Penjualan
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseDetailModal}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                aria-label="Tutup Detail"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Summary KPI Cards */}
            <div className="p-4 sm:p-5 border-b border-slate-100 bg-white grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div
                className={`p-3 rounded-xl border ${
                  detailCategory === 'material'
                    ? 'border-amber-200 bg-amber-50/40 text-amber-900'
                    : 'border-emerald-200 bg-emerald-50/40 text-emerald-900'
                }`}
              >
                <span className="text-[11px] font-semibold text-slate-600 block">Total Omset Kategori:</span>
                <span className="text-base sm:text-lg font-black text-slate-900 mt-0.5 block">
                  {formatRupiah(detailCategory === 'material' ? matOmset : fertOmset)}
                </span>
              </div>

              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/60">
                <span className="text-[11px] font-semibold text-slate-600 block">Total Qty Terjual:</span>
                <span className="text-base sm:text-lg font-black text-slate-900 mt-0.5 block">
                  {activeCategoryTxList.reduce((acc, t) => acc + (t.totalQty || 0), 0)}{' '}
                  <span className="text-xs font-bold text-slate-500">item/sak</span>
                </span>
              </div>

              <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/30 col-span-2 sm:col-span-1">
                <span className="text-[11px] font-semibold text-slate-600 block">Estimasi Laba Kotor:</span>
                <span className="text-base sm:text-lg font-black text-emerald-700 mt-0.5 block">
                  +{formatRupiah(detailCategory === 'material' ? matProfit : fertProfit)}
                </span>
              </div>
            </div>

            {/* Search Filter Bar */}
            <div className="px-4 sm:px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari nomor faktur (INV-...), nama pembeli, atau nama barang..."
                  value={modalSearchQuery}
                  onChange={(e) => setModalSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                />
                {modalSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setModalSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Table Container */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
              {filteredCategoryTxList.length === 0 ? (
                <div className="py-12 px-4 text-center text-slate-400 space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                    <Receipt className="w-6 h-6" />
                  </div>
                  <p className="font-bold text-slate-700 text-sm">
                    {modalSearchQuery
                      ? 'Tidak ada transaksi yang cocok dengan pencarian'
                      : `Belum ada transaksi ${
                          detailCategory === 'material' ? 'Material Bangunan' : 'Pupuk & Agro Pertanian'
                        } pada periode ini`}
                  </p>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    {modalSearchQuery
                      ? 'Coba gunakan kata kunci lain seperti nomor faktur atau nama produk.'
                      : 'Transaksi penjualan yang dicatat melalui kasir POS untuk kategori ini akan otomatis terdaftar di sini.'}
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100/80 text-slate-600 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                          <th className="py-3 px-3.5 whitespace-nowrap">No. Faktur</th>
                          <th className="py-3 px-3.5 whitespace-nowrap">Waktu</th>
                          <th className="py-3 px-3.5 min-w-[240px]">Daftar Produk Kategori Terkait</th>
                          <th className="py-3 px-3.5 text-center whitespace-nowrap">Jumlah Qty</th>
                          <th className="py-3 px-3.5 text-right whitespace-nowrap">Subtotal Nilai Penjualan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {filteredCategoryTxList.map((tx) => (
                          <tr key={tx.saleId || tx.invoiceNumber} className="hover:bg-slate-50/70 transition-colors">
                            {/* 1. No. Faktur */}
                            <td className="py-3 px-3.5 align-top">
                              <div className="font-mono font-bold text-indigo-700 text-xs">
                                {tx.invoiceNumber}
                              </div>
                              <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                                {tx.customerName || 'Pelanggan Umum'}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                <span className="text-[9.5px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
                                  {tx.paymentMethod === 'debt' ? 'Hutang' : tx.paymentMethod || 'cash'}
                                </span>
                                {tx.paymentStatus === 'partial' && (
                                  <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                    Cicilan
                                  </span>
                                )}
                                {tx.paymentStatus === 'unpaid' && (
                                  <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                                    Belum Lunas
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* 2. Waktu */}
                            <td className="py-3 px-3.5 align-top whitespace-nowrap text-slate-600 font-medium text-[11px]">
                              {formatDateTime(tx.createdAt)}
                            </td>

                            {/* 3. Daftar Produk Terkait */}
                            <td className="py-3 px-3.5 align-top">
                              <div className="space-y-1.5">
                                {tx.items && tx.items.length > 0 ? (
                                  tx.items.map((it, idx) => (
                                    <div
                                      key={idx}
                                      className="flex items-start justify-between gap-2 p-1.5 rounded-lg bg-slate-50/80 border border-slate-100 text-[11px]"
                                    >
                                      <div className="font-semibold text-slate-800">
                                        <span>{it.productName}</span>
                                        <span className="text-slate-400 font-normal ml-1">
                                          (@ {formatRupiah(it.sellingPrice)})
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <span className="px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 font-bold font-mono text-[10px]">
                                          x{it.quantity}
                                        </span>
                                        <span className="font-bold text-slate-900 font-mono text-xs">
                                          {formatRupiah(it.subtotal)}
                                        </span>
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <span className="text-slate-400 italic">Item tidak tercatat spesifik</span>
                                )}
                              </div>
                            </td>

                            {/* 4. Jumlah Qty */}
                            <td className="py-3 px-3.5 align-top text-center whitespace-nowrap">
                              <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-extrabold font-mono text-xs">
                                {tx.totalQty}
                              </span>
                            </td>

                            {/* 5. Subtotal Nilai Penjualan */}
                            <td className="py-3 px-3.5 align-top text-right whitespace-nowrap">
                              <div className="font-black text-slate-900 text-sm font-mono">
                                {formatRupiah(tx.subtotal)}
                              </div>
                              {tx.profit > 0 && (
                                <div className="text-[10px] font-bold text-emerald-600 mt-0.5">
                                  Margin: +{formatRupiah(tx.profit)}
                                </div>
                              )}
                              {typeof tx.remainingDebt === 'number' && tx.remainingDebt > 0 && (
                                <div className="text-[10px] font-bold text-rose-600 mt-0.5">
                                  Sisa Hutang: {formatRupiah(tx.remainingDebt)}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 sm:p-4 border-t border-slate-100 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
              <span className="text-xs text-slate-500 font-medium">
                Menampilkan <strong>{filteredCategoryTxList.length}</strong> dari{' '}
                <strong>{activeCategoryTxList.length}</strong> transaksi pada periode ini
              </span>
              <button
                type="button"
                onClick={handleCloseDetailModal}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-200/90 hover:bg-slate-300 active:bg-slate-400 text-slate-800 font-bold text-xs transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Unduh Laporan Transaksi Finansial (PDF & CSV) */}
      <FinancialReportModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        defaultFromDate={defaultReportRange.from}
        defaultToDate={defaultReportRange.to}
      />
    </div>
  );
};
