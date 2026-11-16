import React, { useState, useEffect, useMemo } from 'react';
import {
  History,
  Printer,
  Search,
  Trash2,
  AlertTriangle,
  X,
  CheckCircle2,
  ShoppingCart,
  Eye,
  RefreshCw,
  Building2,
  Sprout,
  Truck,
  CreditCard,
  Banknote,
  QrCode,
  Calendar,
  User,
  Phone,
  FileText,
  Wallet,
  Clock,
} from 'lucide-react';
import { Sale, DebtPaymentRecord } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useBodyScrollLock } from '../utils/scrollLock.ts';
import {
  getStoredSales,
  saveStoredSales,
  onTransactionDeleted,
  onDataUpdated,
  notifyTransactionDeleted,
  notifyDataUpdated,
} from '../utils/transactionSync.ts';
import { collection, getDocs, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase.ts';
import {
  SALES_COLLECTION,
  restoreStockFromSaleCloud,
  normalizeSaleRecord,
  recordDebtPaymentCloud,
} from '../services/cloudInventoryService.ts';
import { RupiahInput } from './RupiahInput.tsx';

interface SalesHistoryModuleProps {
  onReprintSale: (sale: Sale) => void;
  onReprintDigital?: (tx: any) => void;
  onReprintService?: (order: any) => void;
}

export const SalesHistoryModule: React.FC<SalesHistoryModuleProps> = ({
  onReprintSale,
}) => {
  const { currentRole, operatorName } = useAuth();
  const isOwner = currentRole === 'owner';

  const [sales, setSales] = useState<Sale[]>(() =>
    (getStoredSales() || []).map((s) => normalizeSaleRecord(s))
  );
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPayment, setFilterPayment] = useState<string>('all');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<string>('all');
  const [filterDelivery, setFilterDelivery] = useState<string>('all');

  // Detail Modal
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  // Debt Payment Modal (Bayar / Cicil Hutang)
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [saleToPay, setSaleToPay] = useState<Sale | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<'cash' | 'transfer' | 'qris'>('cash');
  const [payNotes, setPayNotes] = useState('');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');

  // Delete Modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [saleToDelete, setSaleToDelete] = useState<Sale | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Kunci scroll body saat modal aktif
  useBodyScrollLock(Boolean(detailModalOpen || deleteModalOpen || payModalOpen));

  const fetchSales = async () => {
    setLoading(true);
    try {
      // 1. Ambil data dari Cloud Firestore (koleksi penjualan terpusat Toko Sumber Sewu)
      try {
        const q = query(collection(db, SALES_COLLECTION), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        if (snap) {
          const list: Sale[] = [];
          snap.forEach((d) => list.push(normalizeSaleRecord(d.data())));
          setSales(list);
          saveStoredSales(list);
          setLoading(false);
          return;
        }
      } catch (err) {
        console.warn('Notice loading sales from Firestore:', err);
      }

      // 2. Fallback ke API backend
      try {
        const res = await fetch('/api/sales');
        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const data = await res.json();
            if (Array.isArray(data)) {
              const normalized = data.map((s) => normalizeSaleRecord(s));
              setSales(normalized);
              saveStoredSales(normalized);
              setLoading(false);
              return;
            }
          }
        }
      } catch (err) {
        console.warn('Notice loading /api/sales:', err);
      }

      // 3. Fallback ke localStorage
      const local = (getStoredSales() || []).map((s) => normalizeSaleRecord(s));
      setSales(local);
    } catch (err) {
      console.warn('Notice loading sales history:', err);
      setSales([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
    const unsubDel = onTransactionDeleted(() => fetchSales());
    const unsubUpd = onDataUpdated(() => fetchSales());
    return () => {
      unsubDel();
      unsubUpd();
    };
  }, []);

  // Filtered sales dengan normalisasi dan safe guard
  const filteredSales = useMemo(() => {
    return sales.filter((item) => {
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        Boolean(item.invoiceNumber && item.invoiceNumber.toLowerCase().includes(q)) ||
        Boolean(item.customerName && item.customerName.toLowerCase().includes(q)) ||
        Boolean(item.customerPhone && item.customerPhone.toLowerCase().includes(q)) ||
        Boolean(item.customerAddress && item.customerAddress.toLowerCase().includes(q)) ||
        Boolean(item.notes && item.notes.toLowerCase().includes(q)) ||
        Boolean(item.deliveryAddress && item.deliveryAddress.toLowerCase().includes(q));

      const payMethod = String(item.paymentMethod || 'cash').toLowerCase();
      const matchPay = filterPayment === 'all' || payMethod === filterPayment.toLowerCase();

      const rem = Math.max(0, Number(item.remainingDebt ?? 0));
      const pStatus = item.paymentStatus || (rem > 0 ? 'unpaid' : 'paid');
      const matchStatus =
        filterPaymentStatus === 'all' ||
        (filterPaymentStatus === 'unpaid_all' && rem > 0) ||
        (filterPaymentStatus === 'paid' && rem <= 0 && pStatus === 'paid');

      const isDelivery = item.deliveryType === 'delivery' || Boolean(item.deliveryAddress);
      const matchDeliv =
        filterDelivery === 'all' ||
        (filterDelivery === 'delivery' && isDelivery) ||
        (filterDelivery === 'pickup' && !isDelivery);

      return matchSearch && matchPay && matchStatus && matchDeliv;
    });
  }, [sales, search, filterPayment, filterPaymentStatus, filterDelivery]);

  // Total stats
  const totalOmset = filteredSales.reduce((acc, curr) => acc + Number(curr.grandTotal || 0), 0);
  const totalCount = filteredSales.length;
  const totalPiutangAktif = sales.reduce(
    (acc, curr) => acc + Math.max(0, Number(curr.remainingDebt ?? 0)),
    0
  );
  const unpaidInvoiceCount = sales.filter((s) => Number(s.remainingDebt ?? 0) > 0).length;

  const handleOpenDetail = (sale: Sale) => {
    setSelectedSale(normalizeSaleRecord(sale));
    setDetailModalOpen(true);
  };

  const handleOpenPayDebt = (sale: Sale) => {
    const normalized = normalizeSaleRecord(sale);
    setSaleToPay(normalized);
    setPayAmount(0);
    setPayMethod('cash');
    setPayNotes('');
    setPayError('');
    setPayModalOpen(true);
  };

  const handleSubmitDebtPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saleToPay) return;
    const rem = Math.max(0, Number(saleToPay.remainingDebt ?? 0));
    if (payAmount <= 0) {
      setPayError('Nominal pembayaran harus lebih dari Rp 0.');
      return;
    }
    if (payAmount > rem) {
      setPayError(`Nominal melebihi sisa hutang (Rp ${rem.toLocaleString('id-ID')}).`);
      return;
    }

    setPaying(true);
    setPayError('');
    try {
      const paymentRecord: DebtPaymentRecord = {
        id: `pay-${Date.now()}`,
        amount: Math.round(payAmount),
        method: payMethod,
        paidAt: new Date().toISOString(),
        receivedBy: operatorName || 'Kasir',
        notes: payNotes.trim() || (payAmount >= rem ? 'Pelunasan Hutang' : 'Cicilan Hutang'),
      };

      const updatedSale = await recordDebtPaymentCloud(
        saleToPay.invoiceNumber,
        paymentRecord,
        saleToPay
      );

      const updatedList = sales.map((s) =>
        s.invoiceNumber === updatedSale.invoiceNumber ? updatedSale : s
      );
      setSales(updatedList);
      saveStoredSales(updatedList);
      if (selectedSale?.invoiceNumber === updatedSale.invoiceNumber) {
        setSelectedSale(updatedSale);
      }
      notifyDataUpdated('pos');

      setPayModalOpen(false);
      setSaleToPay(null);
    } catch (err: any) {
      console.error('Failed to record debt payment:', err);
      setPayError(err?.message || 'Gagal mencatat pembayaran hutang.');
    } finally {
      setPaying(false);
    }
  };

  const handleOpenDelete = (sale: Sale) => {
    setSaleToDelete(sale);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!saleToDelete) return;
    setDeleting(true);

    try {
      // 1. Delete from backend if exists
      if (saleToDelete.id) {
        await fetch(`/api/sales/${saleToDelete.id}?invoice=${encodeURIComponent(saleToDelete.invoiceNumber)}`, { method: 'DELETE' }).catch(() => {});
      }

      // 2. Delete from Firestore & restore inventory stock
      try {
        await deleteDoc(doc(db, SALES_COLLECTION, saleToDelete.invoiceNumber));
      } catch {}

      if (saleToDelete.items && saleToDelete.items.length > 0) {
        await restoreStockFromSaleCloud(saleToDelete.items).catch(() => {});
      }

      // 3. Remove locally
      const updated = sales.filter((s) => s.invoiceNumber !== saleToDelete.invoiceNumber);
      setSales(updated);
      saveStoredSales(updated);
      notifyTransactionDeleted({
        category: 'pos',
        rawId: saleToDelete.id,
        invoiceNumber: saleToDelete.invoiceNumber,
        items: saleToDelete.items,
      });

      setDeleteModalOpen(false);
      setSaleToDelete(null);
    } catch (err) {
      console.error(err);
      alert('Gagal membatalkan transaksi.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs uppercase tracking-wider mb-1">
            <History className="w-4 h-4" />
            <span>Arsip Faktur & Penjualan</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Riwayat Struk & Faktur
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Catatan transaksi penjualan material bangunan & pupuk, cetak ulang struk thermal dan surat jalan armada.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchSales}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs cursor-pointer transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Segarkan Data</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">Total Transaksi Faktur</span>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {totalCount} <span className="text-xs font-normal text-slate-400">Nota</span>
          </div>
          <span className="text-[11px] text-slate-400">Sesuai filter pencarian</span>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">Total Nilai Faktur</span>
          <div className="text-xl sm:text-2xl font-black text-indigo-700 font-mono mt-1">
            Rp {totalOmset.toLocaleString('id-ID')}
          </div>
          <span className="text-[11px] text-emerald-600 font-semibold">Material, pupuk &amp; pertanian</span>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => setFilterPaymentStatus(filterPaymentStatus === 'unpaid_all' ? 'all' : 'unpaid_all')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setFilterPaymentStatus(filterPaymentStatus === 'unpaid_all' ? 'all' : 'unpaid_all');
            }
          }}
          className={`p-4 sm:p-5 rounded-2xl border shadow-xs cursor-pointer transition-all ${
            filterPaymentStatus === 'unpaid_all'
              ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-200'
              : 'bg-white border-slate-200 hover:border-amber-300'
          }`}
          title="Klik untuk filter faktur belum lunas"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500">Piutang Belum Lunas</span>
            {unpaidInvoiceCount > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                {unpaidInvoiceCount} Nota
              </span>
            )}
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-700 font-mono mt-1">
            Rp {totalPiutangAktif.toLocaleString('id-ID')}
          </div>
          <span className="text-[11px] text-amber-700/80 font-medium">
            {filterPaymentStatus === 'unpaid_all' ? 'Filter hutang aktif (klik untuk semua)' : 'Klik untuk lihat daftar hutang'}
          </span>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">Pengiriman Armada</span>
          <div className="text-2xl font-black text-slate-800 mt-1">
            {sales.filter((s) => s.deliveryType === 'delivery' || s.deliveryAddress).length}{' '}
            <span className="text-xs font-normal text-slate-400">Pengiriman</span>
          </div>
          <span className="text-[11px] text-slate-400">Diantar armada toko</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row gap-3 items-center justify-between">
        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari faktur, nama pembeli, no HP, alamat..."
            className="w-full pl-10 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:flex items-center gap-2 w-full lg:w-auto">
          <select
            value={filterPaymentStatus}
            onChange={(e) => setFilterPaymentStatus(e.target.value)}
            className="w-full lg:w-auto text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-700 focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="all">Semua Status Bayar</option>
            <option value="unpaid_all">Belum Lunas / Cicilan</option>
            <option value="paid">Lunas</option>
          </select>

          <select
            value={filterPayment}
            onChange={(e) => setFilterPayment(e.target.value)}
            className="w-full lg:w-auto text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-700 focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="all">Semua Metode Pembayaran</option>
            <option value="cash">Tunai (Cash)</option>
            <option value="transfer">Transfer Bank</option>
            <option value="qris">QRIS / E-Wallet</option>
            <option value="debt">Hutang / Tempo</option>
          </select>

          <select
            value={filterDelivery}
            onChange={(e) => setFilterDelivery(e.target.value)}
            className="w-full lg:w-auto text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-700 focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="all">Semua Metode Kirim</option>
            <option value="delivery">Armada Toko (Kirim)</option>
            <option value="pickup">Ambil Sendiri di Toko</option>
          </select>
        </div>
      </div>

      {/* Sales List Table (Desktop) & Cards (Mobile/Tablet) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Mobile & Tablet Card View */}
        <div className="lg:hidden">
          {loading ? (
            <div className="text-center py-12 px-4 text-sm text-slate-400">
              Memuat data riwayat struk penjualan...
            </div>
          ) : filteredSales.length === 0 ? (
            <div className="text-center py-12 px-4 text-slate-400">
              <p className="text-sm font-semibold text-slate-600">
                {sales.length === 0
                  ? 'Belum ada transaksi penjualan (Tabel kosong / 0 data)'
                  : 'Belum ada faktur penjualan yang sesuai filter.'}
              </p>
              {sales.length === 0 && (
                <p className="text-xs text-slate-400 mt-1">
                  Transaksi baru yang diselesaikan di Kasir POS akan otomatis tercatat di sini.
                </p>
              )}
              {(search || filterPayment !== 'all' || filterPaymentStatus !== 'all' || filterDelivery !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setFilterPayment('all');
                    setFilterPaymentStatus('all');
                    setFilterDelivery('all');
                  }}
                  className="mt-3 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Kembalikan Filter ke "Semua"</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 sm:p-4 bg-slate-50/50">
              {filteredSales.map((sale) => {
                const isDeliv = sale.deliveryType === 'delivery' || Boolean(sale.deliveryAddress);
                const remDebt = Math.max(0, Number(sale.remainingDebt ?? 0));
                const paidTot = Number(sale.paidTotal ?? sale.amountPaid ?? 0);
                const isDebt = String(sale.paymentMethod || '').toLowerCase() === 'debt';

                return (
                  <div
                    key={sale.invoiceNumber}
                    className={`bg-white rounded-xl border p-3.5 shadow-2xs flex flex-col justify-between gap-3 ${
                      remDebt > 0 ? 'border-amber-300 bg-amber-50/15' : 'border-slate-200'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-indigo-700 font-mono text-xs break-all">
                            {sale.invoiceNumber}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {new Date(sale.createdAt).toLocaleDateString('id-ID')}{' '}
                            {new Date(sale.createdAt).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="font-bold uppercase text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">
                            {isDebt ? 'HUTANG' : sale.paymentMethod || 'cash'}
                          </span>
                          {remDebt > 0 ? (
                            <span
                              className={`font-bold uppercase text-[10px] px-2 py-0.5 rounded ${
                                paidTot > 0
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-700'
                              }`}
                            >
                              {paidTot > 0 ? 'Cicilan' : 'Belum Lunas'}
                            </span>
                          ) : (
                            <span className="font-bold uppercase text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
                              Lunas
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="font-bold text-sm text-slate-900">{sale.customerName}</div>
                        {sale.customerPhone && (
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                            {sale.customerPhone}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {isDeliv ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold">
                            <Truck className="w-3.5 h-3.5" />
                            <span>Armada Toko</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-xs font-medium">
                            <span>Ambil di Toko</span>
                          </div>
                        )}
                        {(sale.deliveryAddress || sale.customerAddress) && (
                          <span className="text-[11px] text-slate-500 line-clamp-1">
                            {sale.deliveryAddress || sale.customerAddress}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-100">
                      <div>
                        <div className="text-[10px] font-semibold uppercase text-slate-400">
                          {remDebt > 0 ? 'Sisa Hutang / Total' : 'Total Transaksi'}
                        </div>
                        {remDebt > 0 ? (
                          <div className="font-mono font-bold text-sm text-amber-700">
                            Rp {remDebt.toLocaleString('id-ID')}{' '}
                            <span className="text-[11px] font-normal text-slate-400">
                              / Rp {Number(sale.grandTotal).toLocaleString('id-ID')}
                            </span>
                          </div>
                        ) : (
                          <div className="font-mono font-bold text-sm text-slate-900">
                            Rp {Number(sale.grandTotal).toLocaleString('id-ID')}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {remDebt > 0 && (
                          <button
                            type="button"
                            onClick={() => handleOpenPayDebt(sale)}
                            title="Bayar / Cicil Hutang"
                            className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Wallet className="w-3.5 h-3.5" />
                            <span>Bayar</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenDetail(sale)}
                          title="Lihat Rincian Faktur"
                          className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 cursor-pointer"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onReprintSale(sale)}
                          title="Cetak Ulang Struk Thermal"
                          className="p-2 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 cursor-pointer"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        {isOwner && (
                          <button
                            type="button"
                            onClick={() => handleOpenDelete(sale)}
                            title="Batalkan / Hapus Transaksi"
                            className="p-2 rounded-lg border border-slate-200 hover:bg-rose-50 text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700 uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4">No. Faktur & Waktu</th>
                <th className="py-3.5 px-4">Pelanggan</th>
                <th className="py-3.5 px-4">Pengiriman</th>
                <th className="py-3.5 px-4">Metode Bayar</th>
                <th className="py-3.5 px-4 text-right">Total Transaksi</th>
                <th className="py-3.5 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    Memuat data riwayat struk penjualan...
                  </td>
                </tr>
              ) : filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    <p className="text-sm font-semibold text-slate-600">
                      {sales.length === 0
                        ? 'Belum ada transaksi penjualan (Tabel kosong / 0 data)'
                        : 'Belum ada faktur penjualan yang sesuai filter.'}
                    </p>
                    {sales.length === 0 && (
                      <p className="text-xs text-slate-400 mt-1">
                        Transaksi baru yang diselesaikan di Kasir POS akan otomatis tercatat di sini.
                      </p>
                    )}
                    {(search || filterPayment !== 'all' || filterPaymentStatus !== 'all' || filterDelivery !== 'all') && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearch('');
                          setFilterPayment('all');
                          setFilterPaymentStatus('all');
                          setFilterDelivery('all');
                        }}
                        className="mt-3 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Kembalikan Filter ke "Semua"</span>
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale) => {
                  const isDeliv = sale.deliveryType === 'delivery' || Boolean(sale.deliveryAddress);
                  const remDebt = Math.max(0, Number(sale.remainingDebt ?? 0));
                  const paidTot = Number(sale.paidTotal ?? sale.amountPaid ?? 0);
                  const isDebt = String(sale.paymentMethod || '').toLowerCase() === 'debt';

                  return (
                    <tr
                      key={sale.invoiceNumber}
                      className={`transition-colors ${
                        remDebt > 0 ? 'bg-amber-50/25 hover:bg-amber-50/60' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-indigo-700 font-mono">
                          {sale.invoiceNumber}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {new Date(sale.createdAt).toLocaleDateString('id-ID')} {new Date(sale.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{sale.customerName}</div>
                        {sale.customerPhone && (
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                            {sale.customerPhone}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {isDeliv ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold">
                            <Truck className="w-3.5 h-3.5" />
                            <span>Armada Toko</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-xs font-medium">
                            <span>Ambil di Toko</span>
                          </div>
                        )}
                        {(sale.deliveryAddress || sale.customerAddress) && (
                          <div className="text-[10px] text-slate-500 truncate max-w-[200px] mt-0.5">
                            {sale.deliveryAddress || sale.customerAddress}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold uppercase text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">
                            {isDebt ? 'HUTANG' : sale.paymentMethod || 'cash'}
                          </span>
                          {remDebt > 0 ? (
                            <span
                              className={`font-bold uppercase text-[10px] px-2 py-0.5 rounded ${
                                paidTot > 0
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-700'
                              }`}
                            >
                              {paidTot > 0 ? 'Cicilan' : 'Belum Lunas'}
                            </span>
                          ) : (
                            <span className="font-bold uppercase text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
                              Lunas
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono">
                        <div className="font-bold text-slate-900">
                          Rp {Number(sale.grandTotal).toLocaleString('id-ID')}
                        </div>
                        {remDebt > 0 && (
                          <div className="text-[11px] font-bold text-amber-700 mt-0.5">
                            Sisa: Rp {remDebt.toLocaleString('id-ID')}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-center gap-1.5">
                          {remDebt > 0 && (
                            <button
                              type="button"
                              onClick={() => handleOpenPayDebt(sale)}
                              title="Bayar / Cicil Hutang"
                              className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Wallet className="w-3.5 h-3.5" />
                              <span>Bayar</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenDetail(sale)}
                            title="Lihat Rincian Faktur"
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onReprintSale(sale)}
                            title="Cetak Ulang Struk Thermal"
                            className="p-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          {isOwner && (
                            <button
                              type="button"
                              onClick={() => handleOpenDelete(sale)}
                              title="Batalkan / Hapus Transaksi"
                              className="p-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 text-slate-400 hover:text-rose-600 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {detailModalOpen && selectedSale && (
        <div
          data-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetailModalOpen(false);
          }}
          onTouchMove={(e) => {
            if (e.target === e.currentTarget && e.cancelable) e.preventDefault();
            e.stopPropagation();
          }}
          onWheel={(e) => {
            if (e.target === e.currentTarget && e.cancelable) e.preventDefault();
            e.stopPropagation();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-3 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95"
          >
            {/* Pinned Header */}
            <div className="flex-shrink-0 flex items-center justify-between gap-2 p-4 sm:p-5 pb-3.5 border-b border-slate-100 bg-white">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 break-all">
                  Rincian Faktur #{selectedSale.invoiceNumber}
                </h3>
                <p className="text-xs text-slate-500">
                  {new Date(selectedSale.createdAt).toLocaleString('id-ID')}
                </p>
              </div>
              <button
                onClick={() => setDetailModalOpen(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Pelanggan:</span>
                  <span className="font-bold text-slate-900">{selectedSale.customerName}</span>
                </div>
                {selectedSale.customerPhone && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">No. HP:</span>
                    <span className="font-mono">{selectedSale.customerPhone}</span>
                  </div>
                )}
                {selectedSale.deliveryAddress && (
                  <div className="flex justify-between pt-1 border-t border-slate-200">
                    <span className="text-slate-500">Tujuan Kirim:</span>
                    <span className="font-semibold text-slate-800 text-right">{selectedSale.deliveryAddress}</span>
                  </div>
                )}
              </div>

              {/* Items List */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-3 py-2 font-bold text-slate-700 text-[11px] uppercase">
                  Daftar Material & Pupuk
                </div>
                <div className="divide-y divide-slate-100 p-2 space-y-1">
                  {selectedSale.items && selectedSale.items.length > 0 ? (
                    selectedSale.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between items-center py-1">
                        <div>
                          <div className="font-bold text-slate-900">{it.productName}</div>
                          <div className="text-[10px] text-slate-500">
                            {it.quantity} {it.unit || ''} x Rp {it.sellingPrice.toLocaleString('id-ID')}
                          </div>
                        </div>
                        <div className="font-mono font-bold text-slate-900">
                          Rp {it.subtotal.toLocaleString('id-ID')}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-2 text-slate-400">Tidak ada rincian item</div>
                  )}
                </div>
              </div>

              {/* Totals & Debt Breakdown */}
              <div className="space-y-1 pt-1 font-medium">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-mono">Rp {selectedSale.subtotal.toLocaleString('id-ID')}</span>
                </div>
                {selectedSale.discount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Diskon:</span>
                    <span className="font-mono">-Rp {selectedSale.discount.toLocaleString('id-ID')}</span>
                  </div>
                )}
                <div className="flex justify-between font-extrabold text-sm text-slate-900 pt-1 border-t border-slate-200">
                  <span>Grand Total:</span>
                  <span className="font-mono text-indigo-700">Rp {selectedSale.grandTotal.toLocaleString('id-ID')}</span>
                </div>
                {(selectedSale.paymentMethod === 'debt' || (selectedSale.remainingDebt ?? 0) > 0 || (selectedSale.paymentHistory?.length ?? 0) > 0) && (
                  <div className="mt-2 pt-2 border-t border-dashed border-slate-200 space-y-1">
                    <div className="flex justify-between text-emerald-700 font-bold">
                      <span>Sudah Dibayar (DP / Cicilan):</span>
                      <span className="font-mono">
                        Rp {Number(selectedSale.paidTotal ?? selectedSale.amountPaid ?? 0).toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="flex justify-between font-extrabold text-sm text-amber-700">
                      <span>Sisa Hutang:</span>
                      <span className="font-mono">
                        Rp {Math.max(0, Number(selectedSale.remainingDebt ?? 0)).toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Payment / Installment History */}
              {selectedSale.paymentHistory && selectedSale.paymentHistory.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-3 py-2 font-bold text-slate-700 text-[11px] uppercase">
                    Riwayat Pembayaran &amp; Cicilan ({selectedSale.paymentHistory.length})
                  </div>
                  <div className="divide-y divide-slate-100 p-2 space-y-1">
                    {selectedSale.paymentHistory.map((pay, idx) => (
                      <div key={pay.id || idx} className="flex justify-between items-center py-1.5 px-1">
                        <div>
                          <div className="font-bold text-slate-800 uppercase text-[11px]">
                            {pay.method} &bull; <span className="font-normal text-slate-500">{pay.receivedBy}</span>
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {new Date(pay.paidAt).toLocaleString('id-ID')}
                            {pay.notes ? ` — ${pay.notes}` : ''}
                          </div>
                        </div>
                        <div className="font-mono font-bold text-emerald-700">
                          +Rp {Number(pay.amount).toLocaleString('id-ID')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Pinned Footer */}
            <div className="flex-shrink-0 p-4 border-t border-slate-100 bg-slate-50/80 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDetailModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-100 cursor-pointer"
              >
                Tutup
              </button>
              {Number(selectedSale.remainingDebt ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={() => handleOpenPayDebt(selectedSale)}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Wallet className="w-3.5 h-3.5" />
                  <span>Bayar / Cicil Hutang</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setDetailModalOpen(false);
                  onReprintSale(selectedSale);
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Struk Thermal</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Bayar / Cicil Hutang */}
      {payModalOpen && saleToPay && (
        <div
          data-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !paying) setPayModalOpen(false);
          }}
          onTouchMove={(e) => {
            if (e.target === e.currentTarget && e.cancelable) e.preventDefault();
            e.stopPropagation();
          }}
          onWheel={(e) => {
            if (e.target === e.currentTarget && e.cancelable) e.preventDefault();
            e.stopPropagation();
          }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/25 backdrop-blur-sm p-3 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95"
          >
            <form onSubmit={handleSubmitDebtPayment} className="flex flex-col max-h-[90vh] min-h-0">
              <div className="flex-shrink-0 flex items-center justify-between gap-2 p-4 sm:p-5 pb-3.5 border-b border-slate-100">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                    <Wallet className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                      Pembayaran Hutang / Cicilan
                    </h3>
                    <p className="text-[11px] text-slate-500 font-mono truncate">
                      {saleToPay.invoiceNumber} &bull; {saleToPay.customerName}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={paying}
                  onClick={() => setPayModalOpen(false)}
                  className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
                {/* Summary */}
                <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-1.5">
                  <div className="flex justify-between text-slate-600">
                    <span>Total Faktur:</span>
                    <span className="font-mono font-bold text-slate-900">
                      Rp {saleToPay.grandTotal.toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div className="flex justify-between text-emerald-700">
                    <span>Sudah Dibayar:</span>
                    <span className="font-mono font-bold">
                      Rp {Number(saleToPay.paidTotal ?? 0).toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-extrabold text-amber-800 pt-1.5 border-t border-amber-200/80">
                    <span>Sisa Hutang Saat Ini:</span>
                    <span className="font-mono">
                      Rp {Math.max(0, Number(saleToPay.remainingDebt ?? 0)).toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>

                {/* Amount Input */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 block">
                    Nominal Pembayaran / Cicilan (Rp)
                  </label>
                  <RupiahInput
                    required
                    value={payAmount}
                    onChange={(val) => setPayAmount(val)}
                    className="w-full px-3 py-1.5 text-xs font-black font-mono text-indigo-700 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-500"
                  />

                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPayAmount(Math.max(0, Number(saleToPay.remainingDebt ?? 0)))}
                      className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 font-bold text-[11px] cursor-pointer"
                    >
                      Lunasi Semua (Rp {Math.max(0, Number(saleToPay.remainingDebt ?? 0)).toLocaleString('id-ID')})
                    </button>
                    {Number(saleToPay.remainingDebt ?? 0) >= 2000 && (
                      <button
                        type="button"
                        onClick={() =>
                          setPayAmount(Math.round(Number(saleToPay.remainingDebt ?? 0) / 2))
                        }
                        className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold text-[11px] cursor-pointer"
                      >
                        Bayar 50%
                      </button>
                    )}
                  </div>
                </div>

                {/* Method */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">
                    Metode Pembayaran Diterima
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'cash', label: 'Tunai (Cash)', icon: Banknote },
                        { id: 'transfer', label: 'Transfer Bank', icon: CreditCard },
                        { id: 'qris', label: 'QRIS', icon: QrCode },
                      ] as const
                    ).map((m) => {
                      const MIcon = m.icon;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setPayMethod(m.id)}
                          className={`py-2 px-2 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1 cursor-pointer transition-colors ${
                            payMethod === m.id
                              ? 'border-amber-600 bg-amber-50 text-amber-800'
                              : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <MIcon className="w-4 h-4" />
                          <span>{m.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Catatan Pembayaran (Opsional)
                  </label>
                  <input
                    type="text"
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                    placeholder="Contoh: Cicilan ke-1, dititip ke supir"
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                  />
                </div>

                {/* Preview After Payment */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex justify-between items-center">
                  <span className="font-semibold text-slate-600">Sisa Hutang Setelah Bayar:</span>
                  <span
                    className={`font-mono font-extrabold text-sm ${
                      Math.max(0, Number(saleToPay.remainingDebt ?? 0) - payAmount) === 0
                        ? 'text-emerald-700'
                        : 'text-amber-700'
                    }`}
                  >
                    Rp {Math.max(0, Number(saleToPay.remainingDebt ?? 0) - payAmount).toLocaleString('id-ID')}
                    {Math.max(0, Number(saleToPay.remainingDebt ?? 0) - payAmount) === 0 && ' (LUNAS)'}
                  </span>
                </div>

                {payError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                    {payError}
                  </div>
                )}
              </div>

              <div className="flex-shrink-0 p-4 border-t border-slate-100 bg-slate-50/90 flex items-center gap-2">
                <button
                  type="button"
                  disabled={paying}
                  onClick={() => setPayModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={paying}
                  className="flex-2 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{paying ? 'Menyimpan...' : 'Simpan Pembayaran'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && saleToDelete && (
        <div
          data-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) setDeleteModalOpen(false);
          }}
          onTouchMove={(e) => {
            if (e.target === e.currentTarget && e.cancelable) e.preventDefault();
            e.stopPropagation();
          }}
          onWheel={(e) => {
            if (e.target === e.currentTarget && e.cancelable) e.preventDefault();
            e.stopPropagation();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200"
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-center text-slate-900">
              Batalkan Faktur #{saleToDelete.invoiceNumber}?
            </h3>
            <p className="text-xs text-slate-500 text-center mt-1">
              Tindakan ini akan membatalkan transaksi dan mengembalikan stok barang ke gudang.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                {deleting ? 'Menghapus...' : 'Ya, Batalkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
