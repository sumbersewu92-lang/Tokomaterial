import React, { useState, useEffect } from 'react';
import { Receipt, Plus, Trash2, Calendar, DollarSign, Tag } from 'lucide-react';
import { StoreExpense } from '../types/index.ts';
import {
  fetchAllExpensesCloud,
  createExpenseCloud,
  deleteExpenseCloud,
} from '../services/cloudInventoryService.ts';
import { notifyDataUpdated } from '../utils/transactionSync.ts';
import { RupiahInput } from './RupiahInput.tsx';

export const ExpensesModule: React.FC = () => {
  const [expenses, setExpenses] = useState<StoreExpense[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [category, setCategory] = useState('listrik_air');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [expenseDate, setExpenseDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [paidBy, setPaidBy] = useState('cash');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const formatRupiah = (val: number) => 'Rp ' + Number(val || 0).toLocaleString('id-ID');

  const loadExpenses = async () => {
    setLoading(true);
    try {
      const cloudList = await fetchAllExpensesCloud();
      if (cloudList.length > 0) {
        setExpenses(cloudList);
        setLoading(false);
        return;
      }
      const res = await fetch('/api/expenses');
      if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
        const data = await res.json();
        setExpenses(Array.isArray(data) ? data : []);
      } else {
        setExpenses([]);
      }
    } catch (err) {
      console.error('Failed to load expenses:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExpenses();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || amount <= 0) {
      alert('Keterangan pengeluaran dan jumlah biaya wajib diisi');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        category,
        title: title.trim(),
        amount,
        expenseDate,
        paidBy,
        notes: notes.trim() || undefined,
      };

      await createExpenseCloud(payload);
      await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});

      setTitle('');
      setAmount(0);
      setNotes('');
      notifyDataUpdated('all');
      loadExpenses();
    } catch (err: any) {
      alert(err.message || 'Gagal menyimpan pengeluaran');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (exp: StoreExpense) => {
    if (!confirm('Hapus pencatatan pengeluaran ini?')) return;
    try {
      if (exp.docId) {
        await deleteExpenseCloud(exp.docId);
      }
      if (typeof exp.id === 'number') {
        await fetch(`/api/expenses/${exp.id}`, { method: 'DELETE' }).catch(() => {});
      }
      setExpenses((prev) => prev.filter((e) => e.id !== exp.id && e.docId !== exp.docId));
      notifyDataUpdated('all');
    } catch (err) {
      console.error('Failed to delete expense:', err);
    }
  };

  const totalExpenses = expenses.reduce((acc, cur) => acc + cur.amount, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-1 sm:pt-1.5 pb-6 sm:pb-8 space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-indigo-600" />
            <h2 className="font-bold text-slate-900 text-lg">Pencatatan Rekap Beban & Pengeluaran Toko</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Mencatat pengeluaran solar armada truk, upah kuli bongkar semen & pasir, listrik gudang, dan operasional toko.
          </p>
        </div>

        <div className="w-full sm:w-auto px-4 py-2 rounded-xl bg-rose-50 border border-rose-200 flex sm:block items-center justify-between sm:text-right shrink-0">
          <div className="text-[10px] text-rose-600 font-medium">Total Beban Operasional</div>
          <div className="font-bold text-rose-800 text-sm">-{formatRupiah(totalExpenses)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Input Form (5 cols) */}
        <div className="lg:col-span-5">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
            <h3 className="font-bold text-slate-900 text-sm pb-2 border-b border-slate-100">
              Input Pengeluaran Kas Toko
            </h3>

            <form onSubmit={handleSave} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Kategori Pengeluaran
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full text-xs py-1.5 px-3 rounded-xl border border-slate-200 bg-white font-semibold cursor-pointer"
                >
                  <option value="bbm_armada">BBM Solar & Servis Armada (Truk / Pick-Up)</option>
                  <option value="upah_kuli">Upah Kuli Bongkar Muat Semen / Pasir</option>
                  <option value="gaji_karyawan">Gaji Karyawan, Supir & Kasir</option>
                  <option value="listrik_air">Listrik Gudang & Air</option>
                  <option value="sewa_tempat">Sewa Lahan Gudang / Tempat Toko</option>
                  <option value="atk_nota_kertas">ATK, Kertas Roll Kasir Thermal</option>
                  <option value="operasional_harian">Konsumsi & Operasional Harian</option>
                  <option value="lainnya">Pengeluaran Lainnya</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Keterangan / Judul Pengeluaran
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Contoh: Isi solar Truk Engkel pengiriman pasir..."
                  className="w-full text-xs py-1.5 px-3 rounded-xl border border-slate-200"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Nominal Biaya (Rp)
                  </label>
                  <RupiahInput
                    required
                    value={amount}
                    onChange={(val) => setAmount(val)}
                    className="w-full text-xs py-1.5 px-3 rounded-xl border border-slate-200 font-mono font-bold text-rose-600"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Tanggal Pengeluaran
                  </label>
                  <input
                    type="date"
                    required
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full text-xs py-1.5 px-3 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Sumber Dana Pembayaran
                </label>
                <select
                  value={paidBy}
                  onChange={(e) => setPaidBy(e.target.value)}
                  className="w-full text-xs py-1.5 px-3 rounded-xl border border-slate-200 bg-white"
                >
                  <option value="cash">Kas Tunai Toko (Laci Kasir)</option>
                  <option value="transfer">Rekening Bank Operasional</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Catatan Tambahan (Opsional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Nomor nota toko, supplier..."
                  className="w-full text-xs py-1.5 px-3 rounded-xl border border-slate-200"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm transition disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>Simpan Pengeluaran</span>
              </button>
            </form>
          </div>
        </div>

        {/* Expenses List Table (7 cols) */}
        <div className="lg:col-span-7">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-4">
            <h3 className="font-bold text-slate-900 text-sm">Riwayat Rekap Kas Keluar</h3>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-2.5">
              {loading ? (
                <div className="text-center py-8 text-xs text-slate-400 border border-slate-200 rounded-xl">
                  Memuat data pengeluaran...
                </div>
              ) : expenses.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400 border border-slate-200 rounded-xl">
                  Belum ada catatan pengeluaran
                </div>
              ) : (
                expenses.map((exp) => (
                  <div
                    key={exp.id}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50/40 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-[10px] font-semibold uppercase text-slate-700">
                          {exp.category.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[11px] font-medium text-slate-500">
                          {exp.expenseDate}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(exp)}
                        className="text-slate-400 hover:text-rose-600 p-1 transition cursor-pointer shrink-0"
                        title="Hapus"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div>
                      <div className="font-semibold text-xs text-slate-900">{exp.title}</div>
                      {exp.notes && (
                        <div className="text-[11px] text-slate-400 mt-0.5">{exp.notes}</div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/70 text-xs">
                      <span className="uppercase text-[10px] font-semibold text-slate-500">
                        Dana: {exp.paidBy}
                      </span>
                      <span className="font-bold text-rose-600 font-mono">
                        -{formatRupiah(exp.amount)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop & Tablet Table View */}
            <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full min-w-[600px] text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-2.5 py-2.5 whitespace-nowrap">Tanggal</th>
                    <th className="px-2 py-2.5 whitespace-nowrap">Kategori</th>
                    <th className="px-2 py-2.5">Keterangan</th>
                    <th className="px-2 py-2.5 whitespace-nowrap">Sumber Dana</th>
                    <th className="px-2 py-2.5 whitespace-nowrap">Jumlah Biaya</th>
                    <th className="px-2.5 py-2.5 text-right whitespace-nowrap">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-normal">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400">
                        Memuat data pengeluaran...
                      </td>
                    </tr>
                  ) : expenses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400">
                        Belum ada catatan pengeluaran
                      </td>
                    </tr>
                  ) : (
                    expenses.map((exp) => (
                      <tr key={exp.id} className="hover:bg-slate-50/70 transition">
                        <td className="px-2.5 py-2 font-medium text-slate-700 truncate">{exp.expenseDate}</td>
                        <td className="px-2 py-2 overflow-hidden">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-[10px] font-semibold uppercase text-slate-700 truncate inline-block max-w-full">
                            {exp.category.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-2 py-2 overflow-hidden">
                          <div className="font-semibold text-slate-900 truncate" title={exp.title}>{exp.title}</div>
                          {exp.notes && (
                            <div className="text-[10px] text-slate-400 truncate" title={exp.notes}>{exp.notes}</div>
                          )}
                        </td>
                        <td className="px-2 py-2 uppercase text-[11px] text-slate-500 truncate">
                          {exp.paidBy}
                        </td>
                        <td className="px-2 py-2 font-bold text-rose-600 whitespace-nowrap">
                          -{formatRupiah(exp.amount)}
                        </td>
                        <td className="px-2.5 py-2 text-right whitespace-nowrap">
                          <button
                            onClick={() => handleDelete(exp)}
                            className="text-slate-400 hover:text-rose-600 p-1 transition cursor-pointer"
                            title="Hapus"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
