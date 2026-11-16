import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Calendar,
  FileText,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ListChecks,
} from 'lucide-react';
import { Sale } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { fetchAllSalesCloud, normalizeSaleRecord } from '../services/cloudInventoryService.ts';
import { getStoredSales } from '../utils/transactionSync.ts';
import { useBodyScrollLock } from '../utils/scrollLock.ts';
import {
  buildFinancialReportDataset,
  buildReportFilename,
  formatFeeSigned,
  formatIndonesianDateLong,
  formatRupiahPlain,
  generateFinancialReportCSV,
  generateFinancialReportPDF,
} from '../utils/financialReportExport.ts';

interface FinancialReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultFromDate: string;
  defaultToDate: string;
}

export const FinancialReportModal: React.FC<FinancialReportModalProps> = ({
  isOpen,
  onClose,
  defaultFromDate,
  defaultToDate,
}) => {
  const { operatorName, activeStaff, currentRole } = useAuth();
  const recipientName =
    (activeStaff?.name || operatorName || 'Pimpinan Toko').replace(/\s*\(.*?\)\s*/g, '').trim() ||
    'Pimpinan Toko';

  useBodyScrollLock(isOpen);

  const [fromDate, setFromDate] = useState<string>(defaultFromDate);
  const [toDate, setToDate] = useState<string>(defaultToDate);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'csv'>('pdf');

  const [allSales, setAllSales] = useState<Sale[]>([]);
  const [loadingSales, setLoadingSales] = useState<boolean>(false);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [downloadError, setDownloadError] = useState<string>('');

  // Sync default range and load fresh sales whenever modal opens
  useEffect(() => {
    if (!isOpen) return;
    setFromDate(defaultFromDate);
    setToDate(defaultToDate);
    setDownloadError('');

    let cancelled = false;
    const loadSales = async () => {
      setLoadingSales(true);
      try {
        const cloudSales = await fetchAllSalesCloud();
        if (!cancelled) {
          setAllSales(cloudSales);
        }
      } catch {
        if (!cancelled) {
          const localSales = (getStoredSales() || []).map((s) => normalizeSaleRecord(s));
          setAllSales(localSales);
        }
      } finally {
        if (!cancelled) {
          setLoadingSales(false);
        }
      }
    };

    loadSales();
    return () => {
      cancelled = true;
    };
  }, [isOpen, defaultFromDate, defaultToDate]);

  const isInvalidRange = Boolean(fromDate && toDate && fromDate > toDate);

  const dataset = useMemo(() => {
    if (!fromDate || !toDate || isInvalidRange) {
      return {
        fromDate,
        toDate,
        rows: [],
        totalTransactions: 0,
        totalNominalTrx: 0,
        totalPaid: 0,
        totalRemainingDebt: 0,
        totalFee: 0,
      };
    }
    return buildFinancialReportDataset(allSales, fromDate, toDate);
  }, [allSales, fromDate, toDate, isInvalidRange]);

  if (!isOpen) return null;

  const previewFilename =
    fromDate && toDate && !isInvalidRange
      ? buildReportFilename(fromDate, toDate, exportFormat)
      : `Laporan_Transaksi_Finansial.${exportFormat}`;

  const handleConfirmDownload = async () => {
    if (!fromDate || !toDate || isInvalidRange || loadingSales) return;
    setDownloading(true);
    setDownloadError('');
    try {
      const meta = {
        recipientName,
        recipientRole: currentRole,
        printedAt: new Date(),
      };
      if (exportFormat === 'pdf') {
        generateFinancialReportPDF(dataset, meta);
      } else {
        generateFinancialReportCSV(dataset, meta);
      }
      onClose();
    } catch (err: any) {
      console.error('Gagal mengunduh laporan:', err);
      setDownloadError(err?.message || 'Gagal membuat dokumen laporan. Silakan coba lagi.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      data-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <Download className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-tight truncate">
                Unduh Laporan Transaksi Finansial
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                Toko Sumber Sewu &bull; Dokumen Resmi Keuangan
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 flex items-center justify-center transition cursor-pointer shrink-0"
            aria-label="Tutup modal unduh laporan"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Modal */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* 1. Pemilih Rentang Tanggal */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-600" />
                <span>Rentang Tanggal Transaksi</span>
              </label>
              {fromDate && toDate && !isInvalidRange && (
                <span className="text-[11px] text-slate-500 font-medium">
                  {fromDate === toDate
                    ? formatIndonesianDateLong(fromDate)
                    : `${formatIndonesianDateLong(fromDate)} – ${formatIndonesianDateLong(toDate)}`}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Dari Tanggal
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Sampai Tanggal
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
                />
              </div>
            </div>

            {/* Indikator Jumlah Transaksi */}
            {isInvalidRange ? (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>Tanggal awal tidak boleh lebih besar dari tanggal akhir.</span>
              </div>
            ) : loadingSales ? (
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600 shrink-0" />
                <span>Memuat dan menghitung transaksi pada rentang tanggal...</span>
              </div>
            ) : (
              <div
                className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                  dataset.totalTransactions > 0
                    ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50/70 border-amber-200 text-amber-900'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold flex items-center gap-1.5">
                    <CheckCircle2
                      className={`w-3.5 h-3.5 shrink-0 ${
                        dataset.totalTransactions > 0 ? 'text-emerald-600' : 'text-amber-600'
                      }`}
                    />
                    <span>
                      Ditemukan <strong className="font-extrabold">{dataset.totalTransactions}</strong> transaksi
                    </span>
                  </span>
                  <span className="font-mono text-[11px] font-bold">
                    {formatRupiahPlain(dataset.totalPaid)}
                  </span>
                </div>
                {dataset.totalTransactions > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-slate-600 pt-1 border-t border-emerald-200/60">
                    <span>Nominal Trx: <strong className="text-slate-800">{formatRupiahPlain(dataset.totalNominalTrx)}</strong></span>
                    <span>
                      Total Fee:{' '}
                      <strong className={dataset.totalFee >= 0 ? 'text-emerald-700' : 'text-rose-600'}>
                        {formatFeeSigned(dataset.totalFee)}
                      </strong>
                    </span>
                    <span>
                      Piutang:{' '}
                      <strong className={dataset.totalRemainingDebt > 0 ? 'text-rose-600' : 'text-slate-700'}>
                        {formatRupiahPlain(dataset.totalRemainingDebt)}
                      </strong>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. Pilihan Format Unduh Sebagai */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 block">
              Unduh Sebagai
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setExportFormat('pdf')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5 ${
                  exportFormat === 'pdf'
                    ? 'bg-indigo-50/70 border-indigo-500 ring-2 ring-indigo-500/15'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div
                  className={`p-2 rounded-lg shrink-0 ${
                    exportFormat === 'pdf'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900">
                    PDF (.pdf)
                  </div>
                  <div className="text-[11px] text-slate-500 leading-snug mt-0.5">
                    Format Laporan Finansial Resmi A4
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setExportFormat('csv')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5 ${
                  exportFormat === 'csv'
                    ? 'bg-emerald-50/70 border-emerald-600 ring-2 ring-emerald-600/15'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div
                  className={`p-2 rounded-lg shrink-0 ${
                    exportFormat === 'csv'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900">
                    CSV (.csv)
                  </div>
                  <div className="text-[11px] text-slate-500 leading-snug mt-0.5">
                    Data Tabel Spreadsheet (UTF-8 BOM)
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* 3. Ringkasan Struktur Dokumen */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <ListChecks className="w-3.5 h-3.5 text-indigo-600" />
              <span>Ringkasan Struktur Dokumen</span>
            </div>
            <ul className="space-y-1 text-[11px] text-slate-600 pl-1">
              <li className="flex items-start gap-1.5">
                <span className="text-indigo-600 font-bold">&bull;</span>
                <span>Kop &amp; Identitas Resmi Toko Sumber Sewu + Penomoran Halaman (diulang tiap halaman pada PDF)</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-indigo-600 font-bold">&bull;</span>
                <span>Kotak Metadata (Penerima, Tanggal Cetak WIB, Periode) &amp; Ringkasan Nominal Trx, Total Bayar, Total Fee, serta Total Piutang</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-indigo-600 font-bold">&bull;</span>
                <span>Tabel Rincian Mutasi &amp; Riwayat Transaksi lengkap hingga baris <strong>TOTAL KESELURUHAN</strong></span>
              </li>
            </ul>
            <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between gap-2 text-[10.5px]">
              <span className="text-slate-500 font-medium shrink-0">Nama File:</span>
              <span className="font-mono font-bold text-slate-700 truncate" title={previewFilename}>
                {previewFilename}
              </span>
            </div>
          </div>

          {downloadError && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{downloadError}</span>
            </div>
          )}
        </div>

        {/* Footer Modal */}
        <div className="px-4 sm:px-5 py-3.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleConfirmDownload}
            disabled={downloading || loadingSales || isInvalidRange || !fromDate || !toDate}
            className={`px-4 py-2 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              exportFormat === 'pdf'
                ? 'bg-indigo-600 hover:bg-indigo-700'
                : 'bg-emerald-700 hover:bg-emerald-800'
            }`}
          >
            {downloading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Menyiapkan...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Konfirmasi Unduh ({exportFormat.toUpperCase()})</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
