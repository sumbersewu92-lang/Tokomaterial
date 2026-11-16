import React, { useState, useEffect, useMemo } from 'react';
import {
  Boxes,
  Plus,
  Search,
  AlertTriangle,
  Package,
  TrendingUp,
  DollarSign,
  Trash2,
  X,
  Filter,
  Layers,
  ArrowUpDown,
  Building2,
  Tag,
  Hammer,
  Warehouse,
  Loader2,
} from 'lucide-react';
import { Product } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useBodyScrollLock } from '../utils/scrollLock.ts';
import { notifyDataUpdated } from '../utils/transactionSync.ts';
import {
  subscribeMaterials,
  createMaterialCloud,
  updateMaterialCloud,
  deleteMaterialCloud,
} from '../services/cloudInventoryService.ts';
import { RupiahInput } from './RupiahInput.tsx';

export const MaterialsModule: React.FC = () => {
  const { canViewCostPrice } = useAuth();
  const [materials, setMaterials] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [unitFilter, setUnitFilter] = useState<string>('all');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'low' | 'safe'>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<number | string | null>(null);
  const [currentDocId, setCurrentDocId] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    brand: '',
    variant: '', // Spesifikasi e.g. "Sak 50 Kg", "10mm SNI"
    costPrice: 0,
    sellingPrice: 0,
    stock: 0,
    minStockAlert: 10,
    unit: 'Sak',
  });

  // Restock State
  const [restockItem, setRestockItem] = useState<Product | null>(null);
  const [restockAmount, setRestockAmount] = useState<number>(0);
  const [restockCostPrice, setRestockCostPrice] = useState<number>(0);
  const [restockSellingPrice, setRestockSellingPrice] = useState<number>(0);

  // Delete Confirmation State
  const [deleteItem, setDeleteItem] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Kunci scroll body saat modal tambah/edit, modal restock, atau modal konfirmasi hapus terbuka
  useBodyScrollLock(Boolean(isModalOpen || restockItem || deleteItem));

  useEffect(() => {
    const unsub = subscribeMaterials(
      (items) => {
        setMaterials(items);
        setLoading(false);
      },
      (err) => {
        console.warn('Fallback loading materials:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Filtered materials
  const filteredMaterials = useMemo(() => {
    return materials.filter((item) => {
      const matchSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.brand && item.brand.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.variant && item.variant.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchUnit = unitFilter === 'all' || item.unit === unitFilter;

      const isLow = Number(item.stock) <= Number(item.minStockAlert || 10);
      const matchStock =
        stockStatusFilter === 'all' ||
        (stockStatusFilter === 'low' && isLow) ||
        (stockStatusFilter === 'safe' && !isLow);

      return matchSearch && matchUnit && matchStock;
    });
  }, [materials, searchQuery, unitFilter, stockStatusFilter]);

  // Statistics
  const totalSku = materials.length;
  const totalStock = materials.reduce((acc, curr) => acc + Number(curr.stock || 0), 0);
  const totalCostValue = materials.reduce(
    (acc, curr) => acc + Number(curr.costPrice || 0) * Number(curr.stock || 0),
    0
  );
  const totalSellingValue = materials.reduce(
    (acc, curr) => acc + Number(curr.sellingPrice || 0) * Number(curr.stock || 0),
    0
  );
  const lowStockCount = materials.filter(
    (i) => Number(i.stock) <= Number(i.minStockAlert || 10)
  ).length;

  const handleOpenAddModal = () => {
    setIsEditing(false);
    setCurrentId(null);
    setCurrentDocId(null);
    setFormData({
      code: `MAT-${Date.now().toString().slice(-4)}`,
      name: '',
      brand: '',
      variant: '',
      costPrice: 0,
      sellingPrice: 0,
      stock: 0,
      minStockAlert: 10,
      unit: 'Sak',
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: Product) => {
    setIsEditing(true);
    setCurrentId(item.id);
    setCurrentDocId(item.docId || null);
    setFormData({
      code: item.code,
      name: item.name,
      brand: item.brand || '',
      variant: item.variant || '',
      costPrice: item.costPrice,
      sellingPrice: item.sellingPrice,
      stock: item.stock,
      minStockAlert: item.minStockAlert || 10,
      unit: item.unit || 'Sak',
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || formData.sellingPrice <= 0) {
      alert('Nama material dan harga jual wajib diisi dengan benar');
      return;
    }

    try {
      if (isEditing && currentDocId) {
        await updateMaterialCloud(currentDocId, {
          code: formData.code,
          name: formData.name,
          brand: formData.brand,
          variant: formData.variant,
          costPrice: Number(formData.costPrice),
          sellingPrice: Number(formData.sellingPrice),
          stock: Number(formData.stock),
          minStockAlert: Number(formData.minStockAlert),
          unit: formData.unit,
        });
      } else {
        await createMaterialCloud({
          categoryId: 1,
          categoryName: 'Material Bangunan',
          categoryCode: 'material',
          code: formData.code,
          name: formData.name,
          brand: formData.brand,
          variant: formData.variant,
          costPrice: Number(formData.costPrice),
          sellingPrice: Number(formData.sellingPrice),
          stock: Number(formData.stock),
          minStockAlert: Number(formData.minStockAlert),
          isImeiTracked: false,
          unit: formData.unit,
        });
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      alert('Gagal menyimpan data material');
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
    try {
      const newStock = Number(restockItem.stock || 0) + Number(restockAmount || 0);
      const newCost = Number(restockCostPrice || 0);
      const newSelling = Number(restockSellingPrice || 0);

      if (restockItem.docId) {
        await updateMaterialCloud(restockItem.docId, {
          stock: newStock,
          costPrice: newCost,
          sellingPrice: newSelling,
        });
      }
      notifyDataUpdated('pos');
      setRestockItem(null);
    } catch (err) {
      console.error(err);
      alert('Gagal memperbarui stok restock dan harga');
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
        await deleteMaterialCloud(deleteItem.docId);
      }

      // Hapus langsung dari tabel secara reaktif tanpa perlu refresh
      setMaterials((prev) =>
        prev.filter((m) =>
          deleteItem.docId ? m.docId !== deleteItem.docId : m.id !== deleteItem.id
        )
      );

      notifyDataUpdated('pos');
      setDeleteItem(null);
    } catch (err) {
      console.error('Gagal menghapus material:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const units = ['Sak', 'Batang', 'Lembar', 'Kodi', 'Kotak', 'Roll', 'Kg', 'Biji', 'Dus', 'Pail', 'Galon', 'Meter', 'M3', 'Pick-Up', 'Truk'];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs uppercase tracking-wider mb-1">
            <Building2 className="w-4 h-4" />
            <span>Manajemen Gudang & Logistik</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Stok Material Bangunan
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Katalog semen, pasir, besi beton, pipa PVC, bata merah, cat tembok, dan bahan bangunan lainnya.
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-sm hover:shadow-md transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Material Baru</span>
        </button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">Total Jenis Barang</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">{totalSku} <span className="text-xs font-normal text-slate-400">SKU</span></div>
          <div className="text-xs text-slate-500 mt-1 font-medium">{totalStock.toLocaleString('id-ID')} total kuantitas stok</div>
        </div>

        {canViewCostPrice && (
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500">Nilai Aset Modal</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-base sm:text-xl lg:text-2xl font-black text-slate-900 truncate">
              Rp {totalCostValue.toLocaleString('id-ID')}
            </div>
            <div className="text-xs text-emerald-600 font-semibold mt-1">Modal pokok fisik gudang</div>
          </div>
        )}

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">Estimasi Nilai Jual</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-base sm:text-xl lg:text-2xl font-black text-slate-900 truncate">
            Rp {totalSellingValue.toLocaleString('id-ID')}
          </div>
          <div className="text-xs text-blue-600 font-semibold mt-1">Potensi omset inventaris</div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">Perlu Kulak / Menipis</span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${lowStockCount > 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-400'}`}>
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
            placeholder="Cari material (Semen, Besi, Cat, Pipa, SKU)..."
            className="w-full pl-10 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
          />
        </div>

        <div className="grid grid-cols-2 md:flex items-center gap-2 w-full md:w-auto">
          {/* Unit Filter */}
          <select
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            className="w-full md:w-auto text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 sm:px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="all">Semua Satuan</option>
            {units.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>

          {/* Stock Filter */}
          <select
            value={stockStatusFilter}
            onChange={(e) => setStockStatusFilter(e.target.value as any)}
            className="w-full md:w-auto text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 sm:px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="all">Semua Status Stok</option>
            <option value="low">Menipis / Perlu Kulak</option>
            <option value="safe">Stok Aman</option>
          </select>
        </div>
      </div>

      {/* Materials Table (Desktop) & Cards (Mobile/Tablet) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Mobile & Tablet Card View */}
        <div className="lg:hidden">
          {loading ? (
            <div className="text-center py-12 px-4 text-sm text-slate-400">
              Memuat inventaris material bangunan...
            </div>
          ) : filteredMaterials.length === 0 ? (
            <div className="text-center py-12 px-4 text-slate-400">
              <div className="flex flex-col items-center justify-center space-y-1.5">
                <Boxes className="w-8 h-8 text-slate-300" />
                <span className="font-semibold text-sm text-slate-600">
                  {materials.length === 0
                    ? 'Belum ada data material bangunan (Tabel kosong / 0 data)'
                    : 'Tidak ada material bangunan yang sesuai filter / pencarian'}
                </span>
                <span className="text-xs text-slate-400">
                  {materials.length === 0
                    ? 'Klik tombol "Tambah Material Baru" di atas untuk menambahkan data barang.'
                    : 'Coba ubah kata kunci pencarian atau reset filter satuan.'}
                </span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 sm:p-4 bg-slate-50/50">
              {filteredMaterials.map((item) => {
                const isLow = Number(item.stock) <= Number(item.minStockAlert || 10);
                const margin = item.sellingPrice - item.costPrice;

                return (
                  <div
                    key={item.id}
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
                          {item.variant || '-'} &bull; Satuan: <span className="font-semibold text-slate-700">{item.unit}</span>
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
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition-all cursor-pointer"
                        title="Restock Tambah Stok Barang"
                      >
                        <Warehouse className="w-3.5 h-3.5" />
                        <span>Restock</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        title="Hapus Material"
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
                <th className="py-3.5 px-2.5 w-[80px]">SATUAN</th>
                <th className="py-3.5 px-3 w-[130px]">MEREK</th>
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
                  <td colSpan={canViewCostPrice ? 9 : 8} className="text-center py-12 text-slate-400">
                    Memuat inventaris material bangunan...
                  </td>
                </tr>
              ) : filteredMaterials.length === 0 ? (
                <tr>
                  <td colSpan={canViewCostPrice ? 9 : 8} className="text-center py-12 text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-1.5">
                      <Boxes className="w-8 h-8 text-slate-300" />
                      <span className="font-semibold text-slate-600">
                        {materials.length === 0
                          ? 'Belum ada data material bangunan (Tabel kosong / 0 data)'
                          : 'Tidak ada material bangunan yang sesuai filter / pencarian'}
                      </span>
                      <span className="text-xs text-slate-400">
                        {materials.length === 0
                          ? 'Klik tombol "Tambah Material Baru" di atas untuk menambahkan data barang.'
                          : 'Coba ubah kata kunci pencarian atau reset filter satuan.'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredMaterials.map((item) => {
                  const isLow = Number(item.stock) <= Number(item.minStockAlert || 10);
                  const margin = item.sellingPrice - item.costPrice;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Kolom 1: KODE / SKU */}
                      <td className="py-3.5 px-4 font-mono text-xs font-bold text-slate-700 whitespace-nowrap">
                        {item.code}
                      </td>

                      {/* Kolom 2: NAMA PRODUK & VARIAN */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{item.name}</div>
                        {item.variant ? (
                          <div className="text-xs text-slate-500 font-medium mt-0.5">
                            {item.variant}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-400 mt-0.5">-</div>
                        )}
                      </td>

                      {/* Kolom 3: SATUAN */}
                      <td className="py-3.5 px-2.5 text-xs font-medium text-slate-700 whitespace-nowrap">
                        {item.unit}
                      </td>

                      {/* Kolom 4: MEREK */}
                      <td className="py-3.5 px-3 text-slate-700 text-xs">
                        {item.brand || '-'}
                      </td>

                      {/* Kolom 5: HARGA MODAL (Optional) */}
                      {canViewCostPrice && (
                        <td className="py-3.5 px-2.5 text-right text-slate-500 font-mono tabular-nums text-xs whitespace-nowrap">
                          Rp {Number(item.costPrice).toLocaleString('id-ID')}
                        </td>
                      )}

                      {/* Kolom 6: HARGA JUAL */}
                      <td className="py-3.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                        <span className="font-bold text-slate-900 text-sm">
                          Rp {Number(item.sellingPrice).toLocaleString('id-ID')}
                        </span>
                      </td>

                      {/* Kolom 7: MARGIN LABA (Nominal Keuntungan) */}
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

                      {/* Kolom 8: STOK FISIK */}
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

                      {/* Kolom 9: AKSI (Restock & Hapus) */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenRestock(item)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition-all shadow-2xs hover:shadow-xs cursor-pointer"
                            title="Restock Tambah Stok Barang"
                          >
                            <Warehouse className="w-3.5 h-3.5" />
                            <span>Restock</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item)}
                            title="Hapus Material"
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

      {/* Modal Add / Edit Material */}
      {isModalOpen && (
        <div
          data-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false);
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
            <div className="flex-shrink-0 flex items-center justify-between p-5 pb-3 border-b border-slate-100 bg-white">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Hammer className="w-5 h-5 text-indigo-600" />
                <span>{isEditing ? 'Edit Data Material' : 'Tambah Material Baru'}</span>
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Kode SKU / Barcode</label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Satuan</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    {units.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nama Material</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Semen Gresik PPC 50 Kg"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Merek / Pabrik</label>
                  <input
                    type="text"
                    placeholder="Contoh: Semen Gresik, Rucika"
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Spesifikasi / Ukuran</label>
                  <input
                    type="text"
                    placeholder="Contoh: Sak 50 Kg, 10mm SNI"
                    value={formData.variant}
                    onChange={(e) => setFormData({ ...formData, variant: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Harga Modal Pokok (Rp)</label>
                  <RupiahInput
                    value={formData.costPrice}
                    onChange={(val) => setFormData({ ...formData, costPrice: val })}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Harga Jual Toko (Rp)</label>
                  <RupiahInput
                    required
                    value={formData.sellingPrice}
                    onChange={(val) => setFormData({ ...formData, sellingPrice: val })}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 font-mono font-bold text-indigo-700"
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
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Batas Minimum Peringatan</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.minStockAlert}
                    onChange={(e) => setFormData({ ...formData, minStockAlert: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-sm cursor-pointer"
                >
                  Simpan Material
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Restock Material */}
      {restockItem && (() => {
        const totalRestockCost = Number(restockAmount || 0) * Number(restockCostPrice || 0);
        const unitMargin = Number(restockSellingPrice || 0) - Number(restockCostPrice || 0);
        const marginPercent = restockCostPrice > 0 ? ((unitMargin / restockCostPrice) * 100).toFixed(1) : '0';
        const estimatedNewStock = Number(restockItem.stock || 0) + Number(restockAmount || 0);

        return (
          <div
            data-modal="true"
            onClick={(e) => {
              if (e.target === e.currentTarget) setRestockItem(null);
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
                  <Warehouse className="w-5 h-5 text-indigo-600" />
                  <span>Restock Material Bangunan</span>
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
                {/* 1. Ringkasan Status Produk: Info, Stok Saat Ini, Modal Lama, Jual Saat Ini */}
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs text-slate-500 font-mono mb-0.5">{restockItem.code}</div>
                      <div className="font-extrabold text-slate-900 text-sm">{restockItem.name}</div>
                      {restockItem.variant && (
                        <div className="text-xs text-slate-500 mt-0.5">{restockItem.variant}</div>
                      )}
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {restockItem.unit}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-200/80 text-center">
                    <div className="bg-white p-2 rounded-lg border border-slate-200/80">
                      <div className="text-[10px] text-slate-500 font-semibold uppercase">Stok Saat Ini</div>
                      <div className="font-black text-slate-900 text-xs sm:text-sm font-mono mt-0.5">
                        {restockItem.stock} <span className="text-[10px] font-medium text-slate-500">{restockItem.unit}</span>
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
                      <div className="font-black text-indigo-700 text-xs sm:text-sm font-mono mt-0.5">
                        Rp {Number(restockItem.sellingPrice || 0).toLocaleString('id-ID')}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Jumlah Penambahan Stok */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700 block">
                      Jumlah Penambahan Stok ({restockItem.unit})
                    </label>
                    <span className="text-[11px] text-slate-500 font-medium">
                      Estimasi Baru: <strong className="font-mono text-slate-800">{estimatedNewStock} {restockItem.unit}</strong>
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
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 font-mono font-bold placeholder:text-slate-400"
                  />
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {[5, 10, 20, 50, 100].map((preset) => {
                      const isOneKodi =
                        preset === 20 &&
                        restockItem.unit === 'Lembar' &&
                        /seng|asbes/i.test(restockItem.name);
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setRestockAmount(preset)}
                          className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
                            restockAmount === preset
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          +{preset}
                          {isOneKodi ? ' (1 Kodi)' : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Field Input Harga: Harga Modal Baru (Kulakan) & Harga Jual Toko */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Harga Modal Baru (Kulakan)
                    </label>
                    <RupiahInput
                      value={restockCostPrice}
                      onChange={(val) => setRestockCostPrice(val)}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 font-mono font-bold"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">Harga beli per {restockItem.unit} dari supplier</span>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Harga Jual Toko
                    </label>
                    <RupiahInput
                      required
                      value={restockSellingPrice}
                      onChange={(val) => setRestockSellingPrice(val)}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 font-mono font-bold text-indigo-700"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">Harga jual eceran ke pelanggan</span>
                  </div>
                </div>

                {/* 4. Ringkasan Kalkulasi Otomatis */}
                <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 font-medium">Total Biaya Kulakan:</span>
                    <span className="font-black font-mono text-slate-900 text-sm">
                      Rp {totalRestockCost.toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1.5 border-t border-indigo-100">
                    <span className="text-slate-600 font-medium">Estimasi Margin Baru / Unit:</span>
                    <div className="text-right">
                      <span className={`font-black font-mono text-sm ${unitMargin >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                        {unitMargin >= 0 ? '+' : ''}Rp {unitMargin.toLocaleString('id-ID')}
                      </span>
                      <span className={`ml-1.5 text-[11px] font-bold ${unitMargin >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                        ({marginPercent}%)
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1.5 border-t border-indigo-100">
                    <span className="text-slate-600 font-medium">Stok Setelah Restock:</span>
                    <span className="font-bold font-mono text-indigo-700">
                      {estimatedNewStock} {restockItem.unit}
                    </span>
                  </div>
                </div>

                {/* 5. Aksi Modal */}
                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setRestockItem(null)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Warehouse className="w-3.5 h-3.5" />
                    <span>Konfirmasi Restock & Update Harga</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Modal Konfirmasi Hapus Produk (Safety Confirmation) */}
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
                  Apakah Anda yakin ingin menghapus <span className="font-bold text-slate-900">{deleteItem.name}</span> dari inventaris? Tindakan ini tidak dapat dibatalkan.
                </p>
              </div>
            </div>

            {/* Ringkasan Item */}
            <div className="mt-4 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Kode / SKU:</span>
                <span className="font-mono font-bold text-slate-800">{deleteItem.code}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Stok Fisik:</span>
                <span className="font-bold text-slate-800">{deleteItem.stock} {deleteItem.unit}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Harga Jual Toko:</span>
                <span className="font-mono font-bold text-indigo-700">
                  Rp {Number(deleteItem.sellingPrice || 0).toLocaleString('id-ID')}
                </span>
              </div>
            </div>

            {/* Tombol Aksi */}
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
