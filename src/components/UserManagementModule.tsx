import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserPlus,
  User,
  UserCheck,
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  Search,
  Pencil,
  Trash2,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  X,
  Save,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { AppUser, UserRole } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useBodyScrollLock } from '../utils/scrollLock.ts';
import {
  ensureDefaultUsersSeededOnce,
  subscribeCloudUsers,
  createUserCloud,
  updateUserCloud,
  deleteUserFromFirestore,
} from '../services/cloudUserService.ts';

export const UserManagementModule: React.FC = () => {
  const { activeStaff, unlockTerminal } = useAuth();
  const [usersList, setUsersList] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Form Tambah Pengguna Baru
  const [username, setUsername] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('cashier');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Filter & Pencarian Daftar Pengguna
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'owner' | 'cashier'>('all');

  // Modal Ubah Pengguna
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [editUsername, setEditUsername] = useState<string>('');
  const [editName, setEditName] = useState<string>('');
  const [editRole, setEditRole] = useState<UserRole>('cashier');
  const [editPassword, setEditPassword] = useState<string>('');
  const [editConfirmPassword, setEditConfirmPassword] = useState<string>('');
  const [showEditPassword, setShowEditPassword] = useState<boolean>(false);
  const [editError, setEditError] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  // Modal Konfirmasi Hapus
  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
  const [deletingUserTarget, setDeletingUserTarget] = useState<AppUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<boolean>(false);

  useBodyScrollLock(Boolean(editModalOpen || deleteModalOpen));

  useEffect(() => {
    let active = true;
    let unsub: (() => void) | undefined;

    const init = async () => {
      setLoading(true);
      await ensureDefaultUsersSeededOnce();
      if (!active) return;

      unsub = subscribeCloudUsers(
        (cloudUsers) => {
          if (!active) return;
          setUsersList(cloudUsers);
          setLoading(false);
        },
        () => {
          if (!active) return;
          setLoading(false);
        }
      );
    };

    init();

    return () => {
      active = false;
      if (unsub) unsub();
    };
  }, []);

  // Statistik Ringkas
  const stats = useMemo(() => {
    const total = usersList.length;
    const owners = usersList.filter((u) => u.role === 'owner').length;
    const cashiers = usersList.filter((u) => u.role !== 'owner').length;
    return { total, owners, cashiers };
  }, [usersList]);

  // Daftar Tersaring
  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return usersList.filter((usr) => {
      const displayId = (usr.username || usr.email.split('@')[0] || String(usr.id)).toLowerCase();
      const displayName = (usr.name || '').toLowerCase();
      const matchesSearch = !q || displayId.includes(q) || displayName.includes(q);
      const matchesRole =
        roleFilter === 'all' ||
        (roleFilter === 'owner' && usr.role === 'owner') ||
        (roleFilter === 'cashier' && usr.role !== 'owner');
      return matchesSearch && matchesRole;
    });
  }, [usersList, searchQuery, roleFilter]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const cleanUsername = username.trim().replace(/\s+/g, '');
    const cleanName = fullName.trim();
    const cleanPass = password.trim();
    const cleanConfirm = confirmPassword.trim();

    if (!cleanUsername) {
      setFormError('Username / ID Pengguna wajib diisi.');
      return;
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(cleanUsername)) {
      setFormError('Username hanya boleh berisi huruf, angka, titik, garis bawah, atau tanda hubung tanpa spasi.');
      return;
    }
    if (!cleanName) {
      setFormError('Nama Lengkap wajib diisi.');
      return;
    }
    if (cleanPass.length < 4) {
      setFormError('Password minimal 4 karakter.');
      return;
    }
    if (cleanPass !== cleanConfirm) {
      setFormError('Konfirmasi password tidak cocok dengan password.');
      return;
    }

    setSubmitting(true);
    try {
      await createUserCloud({
        username: cleanUsername,
        name: cleanName,
        role: selectedRole,
        pin: cleanPass,
      });

      setUsername('');
      setFullName('');
      setSelectedRole('cashier');
      setPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setShowConfirmPassword(false);
    } catch (err: any) {
      setFormError(err?.message || 'Gagal menyimpan pengguna baru.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEditModal = (usr: AppUser) => {
    setEditingUser(usr);
    setEditUsername(usr.username || usr.email.split('@')[0] || String(usr.id));
    setEditName(usr.name);
    setEditRole(usr.role === 'owner' ? 'owner' : 'cashier');
    setEditPassword('');
    setEditConfirmPassword('');
    setShowEditPassword(false);
    setEditError('');
    setEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditError('');

    const cleanUsername = editUsername.trim().replace(/\s+/g, '');
    const cleanName = editName.trim();
    const cleanPass = editPassword.trim();
    const cleanConfirm = editConfirmPassword.trim();

    if (!cleanUsername) {
      setEditError('Username / ID Pengguna wajib diisi.');
      return;
    }
    if (!cleanName) {
      setEditError('Nama Lengkap tidak boleh kosong.');
      return;
    }
    if (cleanPass !== '') {
      if (cleanPass.length < 4) {
        setEditError('Password baru minimal 4 karakter.');
        return;
      }
      if (cleanPass !== cleanConfirm) {
        setEditError('Konfirmasi password baru tidak cocok.');
        return;
      }
    }

    // Cegah penurunan role Owner terakhir
    if (editingUser.role === 'owner' && editRole !== 'owner' && stats.owners <= 1) {
      setEditError('Minimal harus ada 1 akun Owner (Superadmin) aktif di sistem.');
      return;
    }

    setSavingEdit(true);
    try {
      await updateUserCloud(editingUser.id, {
        username: cleanUsername,
        name: cleanName,
        role: editRole,
        ...(cleanPass ? { pin: cleanPass } : {}),
      });

      // Perbarui sesi aktif jika akun yang sedang login diubah
      if (activeStaff && activeStaff.id === editingUser.id) {
        unlockTerminal({
          ...activeStaff,
          username: cleanUsername,
          email: `${cleanUsername.toLowerCase()}@sumbersewu.id`,
          name: cleanName,
          role: editRole,
          ...(cleanPass ? { pin: cleanPass } : {}),
        });
      }

      setEditModalOpen(false);
    } catch (err: any) {
      setEditError(err?.message || 'Gagal memperbarui data pengguna.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleOpenDeleteModal = (usr: AppUser) => {
    setDeletingUserTarget(usr);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingUserTarget) return;
    setDeletingUser(true);
    try {
      await deleteUserFromFirestore(deletingUserTarget.id);
      setDeleteModalOpen(false);
    } catch (err: any) {
      console.error('Gagal menghapus pengguna:', err);
    } finally {
      setDeletingUser(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6 animate-in fade-in duration-200">
      {/* 1. HEADER BANNER CARD */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-emerald-600 font-bold text-xs uppercase tracking-wider mb-1">
            <Sparkles className="w-4 h-4" />
            <span>MANAJEMEN AKUN & HAK AKSES TOKO</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Kelola Pengguna
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Tambahkan akun kasir atau pengelola baru, atur peran akses, dan pantau daftar pengguna di database.
          </p>
        </div>

        {/* 3 Kotak Statistik Ringkas */}
        <div className="grid grid-cols-3 sm:flex items-center gap-2 sm:gap-3 w-full sm:w-auto shrink-0">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-2.5 sm:px-3.5 py-2 sm:min-w-[88px] text-center">
            <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
              TOTAL USER
            </div>
            <div className="text-lg sm:text-xl font-black text-slate-900 mt-0.5 tabular-nums leading-tight">
              {stats.total}
            </div>
          </div>

          <div className="rounded-xl border border-amber-300/90 bg-amber-50/70 px-2.5 sm:px-3.5 py-2 sm:min-w-[88px] text-center">
            <div className="text-[10px] font-bold tracking-wider text-amber-700 uppercase">
              OWNER
            </div>
            <div className="text-lg sm:text-xl font-black text-amber-800 mt-0.5 tabular-nums leading-tight">
              {stats.owners}
            </div>
          </div>

          <div className="rounded-xl border border-emerald-300/90 bg-emerald-50/70 px-2.5 sm:px-3.5 py-2 sm:min-w-[88px] text-center">
            <div className="text-[10px] font-bold tracking-wider text-emerald-700 uppercase">
              KASIR
            </div>
            <div className="text-lg sm:text-xl font-black text-emerald-800 mt-0.5 tabular-nums leading-tight">
              {stats.cashiers}
            </div>
          </div>
        </div>
      </div>

      {/* 2. KONTEN UTAMA 2 KOLOM */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* KOLOM KIRI: FORM TAMBAH PENGGUNA BARU */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6">
          {/* Card Header */}
          <div className="flex items-center gap-3 pb-4 border-b border-slate-200">
            <div className="w-10 h-10 rounded-xl bg-emerald-800 text-white flex items-center justify-center shrink-0 shadow-xs">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                Tambah Pengguna Baru
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Akun baru langsung tersimpan ke database &amp; dapat login.
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateUser} className="space-y-4 mt-4">
            {/* Username / ID Pengguna */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Username / ID Pengguna <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value.replace(/\s+/g, ''));
                    setFormError('');
                  }}
                  placeholder="Contoh: 252502 atau kasir2"
                  className="w-full py-1.5 pl-10 pr-3.5 rounded-xl bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Gunakan angka/huruf tanpa spasi (dipakai untuk login).
              </p>
            </div>

            {/* Nama Lengkap */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nama Lengkap <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  setFormError('');
                }}
                placeholder="Contoh: Pak Budi / Kasir Pagi"
                className="w-full py-1.5 px-3.5 rounded-xl bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
              />
            </div>

            {/* Role / Hak Akses (2 Kartu Pilihan Visual) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Role / Hak Akses <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedRole('cashier')}
                  className={`p-3 rounded-xl text-left transition cursor-pointer ${
                    selectedRole === 'cashier'
                      ? 'border-2 border-emerald-500 bg-emerald-50/60 shadow-2xs'
                      : 'border border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <UserCheck
                      className={`w-4 h-4 shrink-0 ${
                        selectedRole === 'cashier' ? 'text-emerald-700' : 'text-slate-500'
                      }`}
                    />
                    <span className="text-xs sm:text-sm font-bold text-slate-900">Kasir</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-snug">
                    Input penjualan POS, stok material, pupuk &amp; pertanian
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedRole('owner')}
                  className={`p-3 rounded-xl text-left transition cursor-pointer ${
                    selectedRole === 'owner'
                      ? 'border-2 border-emerald-500 bg-emerald-50/60 shadow-2xs'
                      : 'border border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck
                      className={`w-4 h-4 shrink-0 ${
                        selectedRole === 'owner' ? 'text-amber-600' : 'text-slate-500'
                      }`}
                    />
                    <span className="text-xs sm:text-sm font-bold text-slate-900">Owner</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-snug">
                    Superadmin, laporan laba rugi &amp; kelola pengguna
                  </p>
                </button>
              </div>
            </div>

            {/* Password & Konfirmasi Password */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setFormError('');
                    }}
                    placeholder="Min. 4 karakter"
                    className="w-full py-1.5 pl-9 pr-9 rounded-xl bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer p-0.5"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Konfirmasi Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setFormError('');
                    }}
                    placeholder="Ulangi password"
                    className="w-full py-1.5 pl-3.5 pr-9 rounded-xl bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer p-0.5"
                    tabIndex={-1}
                    aria-label={showConfirmPassword ? 'Sembunyikan konfirmasi password' : 'Lihat konfirmasi password'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Pesan Error Form */}
            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                <span>{formError}</span>
              </div>
            )}

            {/* Tombol Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full h-11 rounded-xl bg-emerald-800 hover:bg-emerald-900 active:bg-emerald-950 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xs transition cursor-pointer disabled:cursor-not-allowed mt-1"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyimpan Akun...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Simpan Pengguna Baru</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* KOLOM KANAN: DAFTAR PENGGUNA TERDAFTAR */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Header Pencarian & Filter */}
          <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Users className="w-4 h-4 text-emerald-600 shrink-0" />
              <h2 className="text-xs font-bold text-slate-900">
                Daftar Pengguna Terdaftar
              </h2>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
              <div className="relative flex-1 min-w-[140px] sm:w-48">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari ID atau nama..."
                  className="w-full py-1.5 pl-9 pr-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
                />
              </div>

              <div className="relative shrink-0">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as 'all' | 'owner' | 'cashier')}
                  className="appearance-none py-1.5 pl-3 pr-8 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 cursor-pointer"
                >
                  <option value="all">Semua Role</option>
                  <option value="owner">Owner</option>
                  <option value="cashier">Kasir</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Konten Tabel / State Kosong */}
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              <span className="text-sm font-medium">Memuat daftar pengguna dari database...</span>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-12 px-4 text-center text-slate-400">
              <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-semibold text-slate-600">
                Tidak ada pengguna ditemukan
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Coba ubah kata kunci pencarian atau filter role.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="sm:hidden divide-y divide-slate-100">
                {filteredUsers.map((usr) => {
                  const displayId = usr.username || usr.email.split('@')[0] || String(usr.id);
                  const isOwner = usr.role === 'owner';

                  return (
                    <div key={usr.id} className="p-3.5 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-lg border border-slate-200 bg-slate-50 font-mono text-[10px] font-bold text-slate-700">
                            {displayId}
                          </span>
                          <div className="font-normal text-[11px] text-slate-900">
                            {usr.name}
                          </div>
                        </div>

                        {isOwner ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-300/80 text-amber-800 text-[11px] font-normal shrink-0">
                            <ShieldCheck className="w-3 h-3 text-amber-600 shrink-0" />
                            <span>Owner (Superadmin)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-sky-50 border border-sky-200 text-sky-700 text-[11px] font-normal shrink-0">
                            <UserCheck className="w-3 h-3 text-sky-600 shrink-0" />
                            <span>{usr.role === 'manager' ? 'Kepala Toko' : 'Kasir'}</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(usr)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-normal transition cursor-pointer shadow-2xs"
                        >
                          <Pencil className="w-3.5 h-3.5 text-slate-500" />
                          <span>Ubah</span>
                        </button>

                        {!isOwner && (
                          <button
                            type="button"
                            onClick={() => handleOpenDeleteModal(usr)}
                            title="Hapus pengguna"
                            className="w-8 h-8 rounded-lg border border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-rose-600 flex items-center justify-center transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Tablet & Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left text-[10px] text-slate-600">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <tr>
                      <th className="py-3.5 px-4 sm:px-5 w-[108px]">ID</th>
                      <th className="py-3.5 px-4">NAMA LENGKAP</th>
                      <th className="py-3.5 px-4 w-[176px]">ROLE</th>
                      <th className="py-3.5 px-4 sm:px-5 w-[124px] text-right">AKSI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredUsers.map((usr) => {
                      const displayId = usr.username || usr.email.split('@')[0] || String(usr.id);
                      const isOwner = usr.role === 'owner';

                      return (
                        <tr
                          key={usr.id}
                          className="hover:bg-slate-50/80 transition-colors"
                        >
                          <td className="py-3.5 px-4 sm:px-5 whitespace-nowrap">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 font-mono text-[10px] font-bold text-slate-700">
                              {displayId}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="font-normal text-[11px] text-slate-900">
                              {usr.name}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {isOwner ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-300/80 text-amber-800 text-[11px] font-normal">
                                <ShieldCheck className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span>Owner (Superadmin)</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 border border-sky-200 text-sky-700 text-[11px] font-normal">
                                <UserCheck className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                                <span>{usr.role === 'manager' ? 'Kepala Toko' : 'Kasir'}</span>
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 sm:px-5 whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(usr)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-normal transition cursor-pointer shadow-2xs"
                              >
                                <Pencil className="w-3.5 h-3.5 text-slate-500" />
                                <span>Ubah</span>
                              </button>

                              {!isOwner && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenDeleteModal(usr)}
                                  title="Hapus pengguna"
                                  className="w-8 h-8 rounded-lg border border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-rose-600 flex items-center justify-center transition cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* MODAL UBAH PENGGUNA */}
      {editModalOpen && editingUser && (
        <div
          data-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !savingEdit) setEditModalOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 backdrop-blur-xs p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 sm:p-6 border border-slate-200 text-slate-900 animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-800 text-white flex items-center justify-center">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-slate-900">
                    Ubah Data Pengguna
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Perbarui profil, peran akses, atau password login.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                disabled={savingEdit}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Username / ID Pengguna <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => {
                    setEditUsername(e.target.value.replace(/\s+/g, ''));
                    setEditError('');
                  }}
                  className="w-full py-1.5 px-3.5 rounded-xl bg-slate-50/70 focus:bg-white border border-slate-200 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Nama Lengkap <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => {
                    setEditName(e.target.value);
                    setEditError('');
                  }}
                  className="w-full py-1.5 px-3.5 rounded-xl bg-slate-50/70 focus:bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Role / Hak Akses
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setEditRole('cashier')}
                    className={`p-2.5 rounded-xl text-left transition cursor-pointer ${
                      editRole === 'cashier'
                        ? 'border-2 border-emerald-500 bg-emerald-50/60'
                        : 'border border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <UserCheck className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Kasir</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditRole('owner')}
                    className={`p-2.5 rounded-xl text-left transition cursor-pointer ${
                      editRole === 'owner'
                        ? 'border-2 border-emerald-500 bg-emerald-50/60'
                        : 'border border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                      <span>Owner</span>
                    </div>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Password Baru (Opsional)
                  </label>
                  <div className="relative">
                    <input
                      type={showEditPassword ? 'text' : 'password'}
                      value={editPassword}
                      onChange={(e) => {
                        setEditPassword(e.target.value);
                        setEditError('');
                      }}
                      placeholder="Kosongkan jika tetap"
                      className="w-full py-1.5 pl-3 pr-9 rounded-xl bg-slate-50/70 focus:bg-white border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditPassword((prev) => !prev)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                      tabIndex={-1}
                    >
                      {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Konfirmasi Password Baru
                  </label>
                  <input
                    type={showEditPassword ? 'text' : 'password'}
                    value={editConfirmPassword}
                    onChange={(e) => {
                      setEditConfirmPassword(e.target.value);
                      setEditError('');
                    }}
                    placeholder="Ulangi password baru"
                    className="w-full py-1.5 px-3 rounded-xl bg-slate-50/70 focus:bg-white border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                  />
                </div>
              </div>

              {editError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{editError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  disabled={savingEdit}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white flex items-center gap-1.5 cursor-pointer shadow-xs transition disabled:opacity-50"
                >
                  {savingEdit ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Simpan Perubahan</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI HAPUS PENGGUNA */}
      {deleteModalOpen && deletingUserTarget && (
        <div
          data-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deletingUser) setDeleteModalOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 backdrop-blur-xs p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 border border-slate-200 text-slate-900 animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">
                  Hapus Akun Pengguna?
                </h3>
                <p className="text-xs text-slate-500">
                  Konfirmasi penghapusan akses staf toko
                </p>
              </div>
            </div>

            <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">ID Pengguna:</span>
                <span className="font-mono font-bold text-slate-800">
                  {deletingUserTarget.username || deletingUserTarget.email.split('@')[0]}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Nama Lengkap:</span>
                <span className="font-semibold text-slate-800">{deletingUserTarget.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Role:</span>
                <span className="font-semibold text-sky-700">
                  {deletingUserTarget.role === 'owner' ? 'Owner (Superadmin)' : 'Kasir'}
                </span>
              </div>
            </div>

            <p className="text-xs text-rose-600 mt-3 leading-relaxed">
              Tindakan ini permanen. Akun ini tidak akan dapat login ke terminal kasir lagi.
            </p>

            <div className="flex justify-end gap-2 pt-3 mt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                disabled={deletingUser}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deletingUser}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5 cursor-pointer shadow-xs transition disabled:opacity-50"
              >
                {deletingUser ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Akun</span>
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
