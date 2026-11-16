import React, { useState, useEffect, useMemo } from 'react';
import {
  FlaskConical,
  Plus,
  Search,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Trash2,
  X,
  Warehouse,
  Loader2,
  Package,
  AlertCircle,
} from 'lucide-react';
import { Product } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useBodyScrollLock } from '../utils/scrollLock.ts';
import { notifyDataUpdated } from '../utils/transactionSync.ts';
import {
  subscribeAgriculture,
  seedInitialAgricultureOnce,
  seedSampleAgricultureManually,
  createAgricultureCloud,
  updateAgricultureCloud,
  deleteAgricultureCloud,
} from '../services/cloudInventoryService.ts';
import { RupiahInput } from './RupiahInput.tsx';

const AGRICULTURE_UNITS = [
  'Botol',
  'Liter',
  'ml',
  'Bungkus',
  'Gram',
  'Sachet',
  'Dus',
  'Kg',
  'Kotak',
  'Pail',
];

export const AgricultureModule: React.FC = () => {
  const { canViewCostPrice } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [unitFilter, setUnitFilter] = useState<string>('all');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'low' | 'safe'>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentDocId, setCurrentDocId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    brand: '',
    variant: '',
    costPrice: 0,
    sellingPrice: 0,
    stock: 0,
    minStockAlert: 10,
    unit: 'Botol',
  });

  // Restock State
  const [restockItem, setRestockItem] = useState<Product | null>(null);
  const [restockAmount, setRestockAmount] = useState<number>(0);
  const [restockCostPrice, setRestockCostPrice] = useState<number>(0);
  const [restockSellingPrice, setRestockSellingPrice] = useState<number>(0);
  const [isRestocking, setIsRestocking] = useState(false);

  // Delete Confirmation State
  const [deleteItem, setDeleteItem] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSeedingSample, setIsSeedingSample] = useState(false);

  // Kunci scroll body saat modal aktif
  useBodyScrollLock(Boolean(isModalOpen || restockItem || deleteItem));

  useEffect(() => {
    seedInitialAgricultureOnce();

    const unsub = subscribeAgriculture(
      (items) => {
        setProducts(items);
        setLoading(false);
      },
      (err) => {
        console.warn('Notice loading agriculture products:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const getItemKey = (item: Product) => String(item.docId || item.id);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((item) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        (item.brand && item.brand.toLowerCase().includes(q)) ||
        (item.variant && item.variant.toLowerCase().includes(q));

      const matchUnit = unitFilter === 'all' || item.unit === unitFilter;

      const isLow = Number(item.stock) <= Number(item.minStockAlert || 10);
      const matchStock =
        stockStatusFilter === 'all' ||
        (stockStatusFilter === 'low' && isLow) ||
        (stockStatusFilter === 'safe' && !isLow);

      return matchSearch && matchUnit && matchStock;
    });
  }, [products, searchQuery, unitFilter, stockStatusFilter]);

  // Statistics
  const totalSku = products.length;
  const totalStock = products.reduce((acc, curr) => acc + Number(curr.stock || 0), 0);
  const totalCostValue = products.reduce(
    (acc, curr) => acc + Number(curr.costPrice || 0) * Number(curr.stock || 0),
    0
  );
  const totalSellingValue = products.reduce(
    (acc, curr) => acc + Number(curr.sellingPrice || 0) * Number(curr.stock || 0),
    0
  );
  const lowStockCount = products.filter(
    (i) => Number(i.stock) <= Number(i.minStockAlert || 10)
  ).length;

  const handleOpenAddModal = () => {
    setIsEditing(false);
    setCurrentDocId(null);
    setFormError(null);
    setFormData({
      code: `PRT-${Date.now().toString().slice(-4)}`,
      name: '',
      brand: '',
      variant: '',
      costPrice: 0,
      sellingPrice: 0,
      stock: 0,
      minStockAlert: 10,
      unit: 'Botol',
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: Product) => {
    setIsEditing(true);
    setCurrentDocId(item.docId || null);
    setFormError(null);
    setFormData({
      code: item.code,
      name: item.name,
      brand: item.brand || '',
      variant: item.variant || '',
      costPrice: item.costPrice,
      sellingPrice: item.sellingPrice,
      stock: item.stock,
      minStockAlert: item.minStockAlert || 10,
      unit: item.unit || 'Botol',
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.code.trim() || !formData.name.trim() || formData.sellingPrice <= 0) {
      setFormError('Kode SKU, nama produk pertanian, dan harga jual (> 0) wajib diisi dengan benar.');
      return;
    }

    setIsSaving(true);
    try {
      if (isEditing && currentDocId) {
        await updateAgricultureCloud(currentDocId, {
          code: formData.code.trim(),
          name: formData.name.trim(),
          brand: formData.brand.trim(),
          variant: formData.variant.trim(),
          costPrice: Number(formData.costPrice),
          sellingPrice: Number(formData.sellingPrice),
          stock: Number(formData.stock),
          minStockAlert: Number(formData.minStockAlert),
          unit: formData.unit,
        });
      } else {
        await createAgricultureCloud({
          categoryId: 3,
          categoryName: 'Pertanian',
          categoryCode: 'pertanian',
          code: formData.code.trim(),
          name: formData.name.trim(),
          brand: formData.brand.trim(),
          variant: formData.variant.trim(),
          costPrice: Number(formData.costPrice),
          sellingPrice: Number(formData.sellingPrice),
          stock: Number(formData.stock),
          minStockAlert: Number(formData.minStockAlert),
          isImeiTracked: false,
          unit: formData.unit,
        });
      }
      notifyDataUpdated('pos');
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      setFormError('Gagal menyimpan data produk pertanian ke database.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenRestock = (item: Product) => {
    setRestockItem(item);
    setRestockAmount(0);
    setRestockCostPrice(Number(item.costPrice || 0));
    setRestockSellingPrice(Number(item.sellingPrice || 0));
  };

  const handleConfirmRestock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockItem || restockAmount < 0) return;

    setIsRestocking(true);
    try {
      const newStock = Number(restockItem.stock || 0) + Number(restockAmount || 0);
      const newCost = Number(restockCostPrice || 0);
      const newSelling = Number(restockSellingPrice || 0);

      if (restockItem.docId) {
        await updateAgricultureCloud(restockItem.docId, {
          stock: newStock,
          costPrice: newCost,
          sellingPrice: newSelling,
        });
        notifyDataUpdated('pos');
      }
      setRestockItem(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsRestocking(false);
    }
  };

  const handleDelete = (item: Product) => {
    setDeleteItem(item);
  };

  const handleConfirmDelete = async () => {
    if (!deleteItem) return;
    setIsDeleting(true);
    try {
      if (deleteItem.docId) {
        await deleteAgricultureCloud(deleteItem.docId);
      }

      setProducts((prev) =>
        prev.filter((p) =>
          deleteItem.docId ? p.docId !== deleteItem.docId : p.id !== deleteItem.id
        )
      );

      notifyDataUpdated('pos');
      setDeleteItem(null);
    } catch (err) {
      console.error('Gagal menghapus produk pertanian:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleLoadSampleData = async () => {
    setIsSeedingSample(true);
    try {
      await seedSampleAgricultureManually();
      notifyDataUpdated('pos');
    } catch (err) {
      console.error('Gagal memuat data contoh pertanian:', err);
    } finally {
      setIsSeedingSample(false);
    }
  };

  const colSpanCount = canViewCostPrice ? 9 : 8;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-emerald-600 font-bold text-xs uppercase tracking-wider mb-1">
            <FlaskConical className="w-4 h-4" />
            <span>KATALOG & INVENTARIS PERTANIAN</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Pertanian
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manajemen inventaris stok obat pertanian (Pestisida, Insektisida, Herbisida, Fungisida) dan sejenisnya.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAddModal}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-sm hover:shadow-md transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Produk Pertanian</span>
        </button>
      </div>

      {/* 4 Summary Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">Total Jenis Produk</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">
            {totalSku} <span className="text-xs font-normal text-slate-400">SKU</span>
          </div>
          <div className="text-xs text-slate-500 mt-1 font-medium">
            {totalStock.toLocaleString('id-ID')} kuantitas unit
          </div>
        </div>

        {canViewCostPrice && (
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500">Nilai Aset Pertanian</span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-base sm:text-xl lg:text-2xl font-black text-slate-900 truncate">
              Rp {totalCostValue.toLocaleString('id-ID')}
            </div>
            <div className="text-xs text-blue-600 font-semibold mt-1">Modal stok pertanian</div>
          </div>
        )}

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">Estimasi Nilai Jual</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-base sm:text-xl lg:text-2xl font-black text-slate-900 truncate">
            Rp {totalSellingValue.toLocaleString('id-ID')}
          </div>
          <div className="text-xs text-purple-600 font-semibold mt-1">Potensi omset pertanian</div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">Perlu Kulak / Menipis</span>
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                lowStockCount > 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-400'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-black ${lowStockCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
            {lowStockCount} <span className="text-xs font-normal text-slate-400">Item</span>
          </div>
          <div className="text-xs text-slate-500 mt-1 font-medium">Di bawah batas minimum</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari produk pertanian (Pestisida, RoundUp, Gramoxone, Antracol, SKU)..."
            className="w-full pl-10 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
          />
        </div>

        <div className="grid grid-cols-2 md:flex items-center gap-2 w-full md:w-auto">
          {/* Unit Filter */}
          <select
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            className="w-full md:w-auto text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 sm:px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            <option value="all">Semua Satuan / Kemasan</option>
            {AGRICULTURE_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>

          {/* Stock Status Filter */}
          <select
            value={stockStatusFilter}
            onChange={(e) => setStockStatusFilter(e.target.value as 'all' | 'low' | 'safe')}
            className="w-full md:w-auto text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 sm:px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            <option value="all">Semua Status Stok</option>
            <option value="low">Menipis / Perlu Kulak</option>
            <option value="safe">Stok Aman</option>
          </select>
        </div>
      </div>

      {/* Inventory Table (Desktop) & Cards (Mobile/Tablet) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Mobile & Tablet Card View */}
        <div className="lg:hidden">
          {loading ? (
            <div className="text-center py-12 px-4 text-sm text-slate-400">
              Memuat inventaris stok obat pertanian...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-12 px-4 text-slate-400">
              <div className="flex flex-col items-center justify-center space-y-2">
                <FlaskConical className="w-8 h-8 text-slate-300" />
                <span className="font-semibold text-sm text-slate-600">
                  {products.length === 0
                    ? 'Belum ada data produk pertanian (Tabel kosong / 0 data)'
                    : 'Tidak ada produk pertanian yang sesuai filter / pencarian'}
                </span>
                <span className="text-xs text-slate-400">
                  {products.length === 0
                    ? 'Klik tombol "Tambah Produk Pertanian" di atas untuk menambahkan produk obat hama & pestisida.'
                    : 'Coba ubah kata kunci pencarian atau reset filter satuan.'}
                </span>
                {products.length === 0 && (
                  <button
                    type="button"
                    disabled={isSeedingSample}
                    onClick={handleLoadSampleData}
                    className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isSeedingSample ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FlaskConical className="w-3.5 h-3.5" />
                    )}
                    <span>Muat 7 Contoh Produk Pertanian</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 sm:p-4 bg-slate-50/50">
              {filteredProducts.map((item) => {
                const key = getItemKey(item);
                const isLow = Number(item.stock) <= Number(item.minStockAlert || 10);
                const margin = item.sellingPrice - item.costPrice;

                return (
                  <div
                    key={key}
                    className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="inline-block font-mono text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                            {item.code}
                          </span>
                          <span className="ml-2 text-[11px] font-medium text-slate-500">
                            {item.brand || '-'}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md font-bold font-mono tabular-nums text-xs ${
                              isLow
                                ? 'bg-rose-50 text-rose-600 border border-rose-200'
                                : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {item.stock} {item.unit}
                          </span>
                          {isLow && (
                            <div className="text-[10px] text-rose-500 font-semibold mt-0.5 tabular-nums">
                              Min: {item.minStockAlert}
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <h3 className="font-bold text-sm text-slate-900 leading-snug">
                          {item.name}
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {item.variant || '-'} &bull; Kemasan: <span className="font-semibold text-slate-700">{item.unit}</span>
                        </p>
                      </div>
                    </div>

                    <div
                      className={`grid ${
                        canViewCostPrice ? 'grid-cols-3' : 'grid-cols-2'
                      } gap-2 pt-2.5 border-t border-slate-100 text-xs`}
                    >
                      {canViewCostPrice && (
                        <div className="min-w-0">
                          <div className="text-[10px] font-semibold uppercase text-slate-400">Modal</div>
                          <div className="font-mono font-semibold text-slate-600 truncate tabular-nums">
                            Rp {Number(item.costPrice).toLocaleString('id-ID')}
                          </div>
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase text-slate-400">Harga Jual</div>
                        <div className="font-mono font-bold text-slate-900 truncate tabular-nums">
                          Rp {Number(item.sellingPrice).toLocaleString('id-ID')}
                        </div>
                      </div>
                      {canViewCostPrice ? (
                        <div className="min-w-0 text-right">
                          <div className="text-[10px] font-semibold uppercase text-slate-400">Fee</div>
                          <div
                            className={`font-mono font-bold truncate tabular-nums ${
                              margin >= 0 ? 'text-emerald-600' : 'text-rose-600'
                            }`}
                          >
                            {margin >= 0 ? '+' : '-'}Rp {Math.abs(margin).toLocaleString('id-ID')}
                          </div>
                        </div>
                      ) : (
                        <div className="min-w-0 text-right">
                          <div className="text-[10px] font-semibold uppercase text-slate-400">Satuan</div>
                          <div className="font-semibold text-slate-700 truncate">{item.unit}</div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => handleOpenRestock(item)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition-all cursor-pointer"
                        title="Restock Tambah Stok Produk Pertanian"
                      >
                        <Warehouse className="w-3.5 h-3.5" />
                        <span>Restock</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        title="Hapus Produk Pertanian"
                        className="p-2 rounded-xl border border-slate-200 hover:bg-rose-50 hover:border-rose-200 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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
                <th className="py-3.5 px-4 w-[125px]">KODE / SKU</th>
                <th className="py-3.5 px-4 min-w-[260px]">NAMA PRODUK & VARIAN</th>
                <th className="py-3.5 px-2.5 w-[86px]">KEMASAN / SATUAN</th>
                <th className="py-3.5 px-3 w-[115px]">MEREK</th>
                {canViewCostPrice && <th className="py-3.5 px-2.5 w-[98px] text-right">MODAL</th>}
                <th className="py-3.5 px-2.5 w-[98px] text-right">HARGA JUAL</th>
                <th className="py-3.5 px-2.5 w-[98px] text-right">FEE</th>
                <th className="py-3.5 px-3 w-[105px] text-center">STOK FISIK</th>
                <th className="py-3.5 px-3 w-[145px] text-center">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={colSpanCount} className="text-center py-12 text-slate-400">
                    Memuat inventaris stok obat pertanian...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={colSpanCount} className="text-center py-12 text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <FlaskConical className="w-8 h-8 text-slate-300" />
                      <span className="font-semibold text-slate-600">
                        {products.length === 0
                          ? 'Belum ada data produk pertanian (Tabel kosong / 0 data)'
                          : 'Tidak ada produk pertanian yang sesuai filter / pencarian'}
                      </span>
                      <span className="text-xs text-slate-400">
                        {products.length === 0
                          ? 'Klik tombol "Tambah Produk Pertanian" di atas untuk menambahkan produk obat hama & pestisida.'
                          : 'Coba ubah kata kunci pencarian atau reset filter satuan.'}
                      </span>
                      {products.length === 0 && (
                        <button
                          type="button"
                          disabled={isSeedingSample}
                          onClick={handleLoadSampleData}
                          className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {isSeedingSample ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <FlaskConical className="w-3.5 h-3.5" />
                          )}
                          <span>Muat 7 Contoh Produk Pertanian</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((item) => {
                  const key = getItemKey(item);
                  const isLow = Number(item.stock) <= Number(item.minStockAlert || 10);
                  const margin = item.sellingPrice - item.costPrice;

                  return (
                    <tr key={key} className="hover:bg-slate-50/80 transition-colors">
                      {/* KODE / SKU */}
                      <td className="py-3.5 px-4 font-mono text-xs font-bold text-slate-700 whitespace-nowrap">
                        {item.code}
                      </td>

                      {/* NAMA PRODUK & VARIAN */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{item.name}</div>
                        {item.variant ? (
                          <div className="text-xs text-slate-500 font-medium mt-0.5">{item.variant}</div>
                        ) : (
                          <div className="text-xs text-slate-400 mt-0.5">-</div>
                        )}
                      </td>

                      {/* KEMASAN / SATUAN */}
                      <td className="py-3.5 px-2.5 text-xs font-medium text-slate-700 whitespace-nowrap">
                        {item.unit}
                      </td>

                      {/* MEREK */}
                      <td className="py-3.5 px-3 text-slate-700 text-xs">
                        {item.brand || '-'}
                      </td>

                      {/* HARGA MODAL */}
                      {canViewCostPrice && (
                        <td className="py-3.5 px-2.5 text-right text-slate-500 font-mono tabular-nums text-xs whitespace-nowrap">
                          Rp {Number(item.costPrice).toLocaleString('id-ID')}
                        </td>
                      )}

                      {/* HARGA JUAL */}
                      <td className="py-3.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                        <span className="font-bold text-slate-900 text-sm">
                          Rp {Number(item.sellingPrice).toLocaleString('id-ID')}
                        </span>
                      </td>

                      {/* MARGIN LABA */}
                      <td className="py-3.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                        {canViewCostPrice ? (
                          margin >= 0 ? (
                            <span className="text-xs font-bold text-emerald-600">
                              +Rp {margin.toLocaleString('id-ID')}
                            </span>
                          ) : (
                            <span className="text-xs font-bold text-rose-600">
                              -Rp {Math.abs(margin).toLocaleString('id-ID')}
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>

                      {/* STOK FISIK */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span
                          className={`font-bold font-mono tabular-nums text-xs ${
                            isLow ? 'text-rose-600' : 'text-slate-800'
                          }`}
                        >
                          {item.stock} {item.unit}
                        </span>
                        {isLow && (
                          <div className="text-[10px] text-rose-500 font-semibold mt-0.5 tabular-nums">
                            Min: {item.minStockAlert}
                          </div>
                        )}
                      </td>

                      {/* AKSI */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenRestock(item)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition-all shadow-2xs hover:shadow-xs cursor-pointer"
                            title="Restock Tambah Stok Produk Pertanian"
                          >
                            <Warehouse className="w-3.5 h-3.5" />
                            <span>Restock</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item)}
                            title="Hapus Produk Pertanian"
                            className="p-1.5 rounded-xl border border-slate-200 hover:bg-rose-50 hover:border-rose-200 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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

      {/* Modal Add / Edit Produk Pertanian */}
      {isModalOpen && (
        <div
          data-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSaving) setIsModalOpen(false);
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
            <div className="flex-shrink-0 flex items-center justify-between p-4 sm:p-5 pb-3 border-b border-slate-100 bg-white">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FlaskConical className="w-5 h-5 text-emerald-600" />
                <span>{isEditing ? 'Edit Produk Pertanian' : 'Tambah Produk Pertanian'}</span>
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Kode SKU / Barcode</label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Satuan / Kemasan</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    {AGRICULTURE_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nama Produk Pertanian</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Roundup 486 SL 1L (Herbisida Pembasmi Gulma)"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Merek / Produsen</label>
                  <input
                    type="text"
                    placeholder="Contoh: Bayer, Syngenta, BASF"
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Varian / Ukuran Kemasan</label>
                  <input
                    type="text"
                    placeholder="Contoh: Botol 1 Liter, Bungkus 250 Gram"
                    value={formData.variant}
                    onChange={(e) => setFormData({ ...formData, variant: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Harga Modal Pokok (Rp)</label>
                  <RupiahInput
                    value={formData.costPrice}
                    onChange={(val) => setFormData({ ...formData, costPrice: val })}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Harga Jual Toko (Rp)</label>
                  <RupiahInput
                    required
                    value={formData.sellingPrice}
                    onChange={(val) => setFormData({ ...formData, sellingPrice: val })}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 font-mono font-bold text-emerald-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Jumlah Stok Fisik</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Batas Minimum Peringatan</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.minStockAlert}
                    onChange={(e) => setFormData({ ...formData, minStockAlert: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-sm cursor-pointer disabled:opacity-60 inline-flex items-center gap-1.5"
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{isEditing ? 'Simpan Perubahan' : 'Simpan Produk'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Restock Produk Pertanian */}
      {restockItem &&
        (() => {
          const totalRestockCost = Number(restockAmount || 0) * Number(restockCostPrice || 0);
          const unitMargin = Number(restockSellingPrice || 0) - Number(restockCostPrice || 0);
          const marginPercent =
            restockCostPrice > 0 ? ((unitMargin / restockCostPrice) * 100).toFixed(1) : '0';
          const estimatedNewStock = Number(restockItem.stock || 0) + Number(restockAmount || 0);

          return (
            <div
              data-modal="true"
              onClick={(e) => {
                if (e.target === e.currentTarget && !isRestocking) setRestockItem(null);
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
                className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95"
              >
                <div className="flex-shrink-0 flex items-center justify-between p-5 pb-3 border-b border-slate-100 bg-white">
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Warehouse className="w-5 h-5 text-emerald-600" />
                    <span>Restock Produk Pertanian</span>
                  </h2>
                  <button
                    type="button"
                    onClick={() => setRestockItem(null)}
                    className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleConfirmRestock} className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
                  {/* Ringkasan Status Produk */}
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs text-slate-500 font-mono mb-0.5">{restockItem.code}</div>
                        <div className="font-extrabold text-slate-900 text-sm">{restockItem.name}</div>
                        {restockItem.variant && (
                          <div className="text-xs text-slate-500 mt-0.5">{restockItem.variant}</div>
                        )}
                      </div>
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                        {restockItem.unit}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-200/80 text-center">
                      <div className="bg-white p-2 rounded-lg border border-slate-200/80">
                        <div className="text-[10px] text-slate-500 font-semibold uppercase">Stok Saat Ini</div>
                        <div className="font-black text-slate-900 text-xs sm:text-sm font-mono mt-0.5">
                          {restockItem.stock}{' '}
                          <span className="text-[10px] font-medium text-slate-500">{restockItem.unit}</span>
                        </div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-200/80">
                        <div className="text-[10px] text-slate-500 font-semibold uppercase">Modal Lama</div>
                        <div className="font-black text-slate-700 text-xs sm:text-sm font-mono mt-0.5">
                          Rp {Number(restockItem.costPrice || 0).toLocaleString('id-ID')}
                        </div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-200/80">
                        <div className="text-[10px] text-slate-500 font-semibold uppercase">Jual Saat Ini</div>
                        <div className="font-black text-emerald-700 text-xs sm:text-sm font-mono mt-0.5">
                          Rp {Number(restockItem.sellingPrice || 0).toLocaleString('id-ID')}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Jumlah Penambahan Stok */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700 block">
                        Jumlah Penambahan Stok ({restockItem.unit})
                      </label>
                      <span className="text-[11px] text-slate-500 font-medium">
                        Estimasi Baru:{' '}
                        <strong className="font-mono text-slate-800">
                          {estimatedNewStock} {restockItem.unit}
                        </strong>
                      </span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={restockAmount === 0 ? '' : restockAmount}
                      onChange={(e) =>
                        setRestockAmount(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))
                      }
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 font-mono font-bold placeholder:text-slate-400"
                    />
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {[5, 10, 25, 50, 100].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setRestockAmount(preset)}
                          className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
                            restockAmount === preset
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          +{preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Harga Modal Baru & Harga Jual Toko */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Harga Modal Baru (Kulakan)
                      </label>
                      <RupiahInput
                        value={restockCostPrice}
                        onChange={(val) => setRestockCostPrice(val)}
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 font-mono font-bold"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        Harga beli per {restockItem.unit} dari distributor
                      </span>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Harga Jual Toko
                      </label>
                      <RupiahInput
                        required
                        value={restockSellingPrice}
                        onChange={(val) => setRestockSellingPrice(val)}
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 font-mono font-bold text-emerald-700"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        Harga jual eceran ke petani / pembeli
                      </span>
                    </div>
                  </div>

                  {/* Ringkasan Kalkulasi Otomatis */}
                  <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 font-medium">Total Biaya Kulakan:</span>
                      <span className="font-black font-mono text-slate-900 text-sm">
                        Rp {totalRestockCost.toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-1.5 border-t border-emerald-100">
                      <span className="text-slate-600 font-medium">Estimasi Margin Baru / Unit:</span>
                      <div className="text-right">
                        <span
                          className={`font-black font-mono text-sm ${
                            unitMargin >= 0 ? 'text-emerald-700' : 'text-rose-600'
                          }`}
                        >
                          {unitMargin >= 0 ? '+' : ''}Rp {unitMargin.toLocaleString('id-ID')}
                        </span>
                        <span
                          className={`ml-1.5 text-[11px] font-bold ${
                            unitMargin >= 0 ? 'text-emerald-600' : 'text-rose-500'
                          }`}
                        >
                          ({marginPercent}%)
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-1.5 border-t border-emerald-100">
                      <span className="text-slate-600 font-medium">Stok Setelah Restock:</span>
                      <span className="font-bold font-mono text-emerald-700">
                        {estimatedNewStock} {restockItem.unit}
                      </span>
                    </div>
                  </div>

                  {/* Aksi Modal */}
                  <div className="pt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={isRestocking}
                      onClick={() => setRestockItem(null)}
                      className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={isRestocking}
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
                    >
                      {isRestocking ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Warehouse className="w-3.5 h-3.5" />
                      )}
                      <span>Konfirmasi Restock & Update Harga</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          );
        })()}

      {/* Modal Konfirmasi Hapus Tunggal */}
      {deleteItem && (
        <div
          data-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeleting) setDeleteItem(null);
          }}
          onTouchMove={(e) => {
            if (e.target === e.currentTarget && e.cancelable) e.preventDefault();
            e.stopPropagation();
          }}
          onWheel={(e) => {
            if (e.target === e.currentTarget && e.cancelable) e.preventDefault();
            e.stopPropagation();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 flex flex-col overflow-hidden animate-in fade-in zoom-in-95"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
                  Konfirmasi Hapus Produk
                </h3>
                <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                  Apakah Anda yakin ingin menghapus{' '}
                  <span className="font-bold text-slate-900">{deleteItem.name}</span> dari inventaris?
                  Tindakan ini tidak dapat dibatalkan.
                </p>
              </div>
            </div>

            <div className="mt-4 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Kode / SKU:</span>
                <span className="font-mono font-bold text-slate-800">{deleteItem.code}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Stok Fisik:</span>
                <span className="font-bold text-slate-800">
                  {deleteItem.stock} {deleteItem.unit}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Harga Jual Toko:</span>
                <span className="font-mono font-bold text-emerald-700">
                  Rp {Number(deleteItem.sellingPrice || 0).toLocaleString('id-ID')}
                </span>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteItem(null)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs sm:text-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Ya, Hapus</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
