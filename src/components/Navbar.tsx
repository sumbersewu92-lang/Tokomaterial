import React, { useState, useRef, useEffect } from 'react';
import {
  ShoppingCart,
  Building2,
  Sprout,
  BarChart3,
  History,
  Receipt,
  LogOut,
  Users,
  Menu,
  X,
  ChevronDown,
  Package,
  FlaskConical,
  User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { UserRole } from '../types/index.ts';
import { useBodyScrollLock } from '../utils/scrollLock.ts';

export type ActiveTab =
  | 'pos'
  | 'materials'
  | 'fertilizers'
  | 'agriculture'
  | 'sales_history'
  | 'analytics'
  | 'expenses'
  | 'users';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  cartCount: number;
  materialsCount?: number;
  lowStockCount?: number;
  fertilizersCount?: number;
  agricultureCount?: number;
  // Legacy props compatibility
  accessoriesCount?: number;
  activeServiceCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  cartCount,
  materialsCount = 0,
  lowStockCount = 0,
  fertilizersCount = 0,
}) => {
  const {
    operatorName,
    currentRole,
    activeStaff,
    lockTerminal,
  } = useAuth();

  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [inventoryDropdownOpen, setInventoryDropdownOpen] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const inventoryDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        profileDropdownRef.current &&
        !profileDropdownRef.current.contains(event.target as Node)
      ) {
        setProfileDropdownOpen(false);
      }
      if (
        inventoryDropdownRef.current &&
        !inventoryDropdownRef.current.contains(event.target as Node)
      ) {
        setInventoryDropdownOpen(false);
      }
    };
    if (profileDropdownOpen || inventoryDropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [profileDropdownOpen, inventoryDropdownOpen]);

  // Kunci scroll body saat mobile navigation drawer terbuka
  useBodyScrollLock(mobileDrawerOpen);

  const getCleanRoleName = (role: UserRole) => {
    switch (role) {
      case 'owner':
        return 'Owner';
      case 'manager':
        return 'Kepala Toko';
      case 'cashier':
        return 'Kasir';
      default:
        return role;
    }
  };

  const rawName = activeStaff?.name || operatorName || 'Kasir';
  const cleanName = rawName.replace(/\s*\(.*?\)\s*/g, '').trim() || 'Kasir';
  const roleName = getCleanRoleName(currentRole);
  const userHeaderDisplay = `${cleanName} (${roleName})`;

  // Menu Navigasi Baru Toko Sumber Sewu:
  // 1. Kasir POS | 2. Stok Material | 3. Pupuk | 4. Pertanian | 5. Riwayat Struk | 6. Laporan Keuangan | 7. Beban Toko | 8. Kelola Pengguna
  const allNavItems = [
    {
      id: 'pos' as ActiveTab,
      label: 'Kasir POS',
      category: 'transaksi',
      icon: ShoppingCart,
      visible: currentRole === 'owner' || currentRole === 'cashier' || currentRole === 'manager',
      badge: cartCount > 0 ? cartCount : undefined,
      description: 'Penjualan grosir & eceran, hitung muatan & cetak struk',
    },
    {
      id: 'materials' as ActiveTab,
      label: 'Stok Material',
      category: 'manajemen',
      icon: Building2,
      visible: currentRole === 'owner' || currentRole === 'cashier' || currentRole === 'manager',
      badge: lowStockCount > 0 ? lowStockCount : undefined,
      description: 'Katalog semen, pasir, besi beton, pipa, cat & bata',
    },
    {
      id: 'fertilizers' as ActiveTab,
      label: 'Pupuk',
      category: 'manajemen',
      icon: Sprout,
      visible: currentRole === 'owner' || currentRole === 'cashier' || currentRole === 'manager',
      description: 'Pupuk urea, NPK Mutiara, KCL, ZA & kompos organik',
    },
    {
      id: 'agriculture' as ActiveTab,
      label: 'Pertanian',
      category: 'manajemen',
      icon: FlaskConical,
      visible: currentRole === 'owner' || currentRole === 'cashier' || currentRole === 'manager',
      description: 'Pestisida, herbisida, insektisida, fungisida & obat hama',
    },
    {
      id: 'sales_history' as ActiveTab,
      label: 'Riwayat Struk',
      category: 'transaksi',
      icon: History,
      visible: currentRole === 'owner' || currentRole === 'cashier' || currentRole === 'manager',
      description: 'Arsip faktur penjualan & cetak ulang struk nota pengiriman',
    },
    {
      id: 'analytics' as ActiveTab,
      label: 'Laporan Keuangan',
      category: 'manajemen',
      icon: BarChart3,
      visible: currentRole === 'owner' || currentRole === 'manager',
      description: 'Analisis omset material & pupuk, laba kotor & bersih',
    },
    {
      id: 'expenses' as ActiveTab,
      label: 'Beban Toko',
      category: 'manajemen',
      icon: Receipt,
      visible: currentRole === 'owner' || currentRole === 'manager',
      description: 'Biaya solar armada truk, upah kuli bongkar muat & listrik',
    },
    {
      id: 'users' as ActiveTab,
      label: 'Kelola Pengguna',
      category: 'manajemen',
      icon: Users,
      visible: currentRole === 'owner',
      description: 'Pengaturan akun kasir, operator & hak akses PIN',
    },
  ];

  const visibleNavItems = allNavItems.filter((item) => item.visible);
  const inventoryTabIds: ActiveTab[] = ['materials', 'fertilizers', 'agriculture'];
  const inventoryNavItems = visibleNavItems.filter((item) =>
    inventoryTabIds.includes(item.id)
  );
  const activeInventoryItem = inventoryNavItems.find((item) => item.id === activeTab);
  const isInventoryActive = Boolean(activeInventoryItem);
  const InventoryTriggerIcon = activeInventoryItem?.icon || Package;

  const handleSelectTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    setMobileDrawerOpen(false);
    setInventoryDropdownOpen(false);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  };

  return (
    <>
      <header
        className="sticky top-0 z-[1000] sticky-header-navbar w-full max-w-full text-slate-800 border-b border-slate-200/90 bg-white"
        style={{
          position: 'sticky',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          backgroundColor: '#ffffff',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
        }}
      >
        {/* Top Header Bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-2 bg-white">
          {/* Left: Hamburger Button + Brand */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              className="lg:hidden flex items-center justify-center w-10 h-10 rounded-xl text-slate-700 hover:text-indigo-600 hover:bg-slate-100 active:bg-slate-200/80 border border-slate-200/90 shadow-2xs transition-colors cursor-pointer shrink-0"
              aria-label="Buka Menu Navigasi"
              title="Buka Menu Navigasi"
            >
              <Menu className="w-5 h-5 text-indigo-600" />
            </button>

            {/* Logo & Judul Toko */}
            <div className="flex items-center gap-2.5">
              <img
                src={`${import.meta.env.BASE_URL}favicon.svg`}
                alt="Logo Toko Sumber Sewu"
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl shadow-sm shadow-indigo-500/20 shrink-0"
              />

              <div className="flex flex-col items-start justify-center">
                <span className="font-extrabold text-sm sm:text-base tracking-tight text-slate-900 leading-tight">
                  Toko Sumber Sewu
                </span>
                <span className="hidden lg:block mt-0.5 text-[10.5px] font-medium text-black leading-tight">
                  Sistem Kasir dan Management Material, Pupuk dan Pertanian
                </span>
              </div>
            </div>
          </div>

          {/* Right: Operator Profile & Lock Terminal (Desktop only; on mobile/tablet moved to bottom of sidebar) */}
          <div className="hidden lg:flex items-center gap-2 sm:gap-3">
            <div className="relative inline-block" ref={profileDropdownRef}>
              <button
                type="button"
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className="flex items-center gap-2 px-2.5 py-1 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer group"
                aria-label="Profil Pengguna"
              >
                <div className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 font-extrabold flex items-center justify-center text-[11px] shrink-0">
                  {cleanName.charAt(0).toUpperCase()}
                </div>
                <div className="text-left">
                  <div className="text-xs font-bold text-slate-800 leading-tight truncate max-w-[110px] sm:max-w-[140px]">
                    {cleanName}
                  </div>
                </div>
                <ChevronDown className={`w-3 h-3 text-slate-400 group-hover:text-slate-600 transition-transform shrink-0 ${profileDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Profile Dropdown */}
              {profileDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1 w-full min-w-full max-w-full rounded-xl bg-white border border-slate-200 shadow-md py-1 z-50 overflow-hidden">
                  {/* Elemen 1: Nama User (Nama lengkap saja tanpa status role) */}
                  <div
                    className="px-2.5 py-1.5 border-b border-slate-100 text-[11px] font-bold text-slate-800 truncate"
                    title={cleanName}
                  >
                    {cleanName}
                  </div>

                  {/* Elemen 2: Tombol Logout */}
                  <button
                    type="button"
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      lockTerminal();
                    }}
                    className="w-full text-left px-2.5 py-1.5 text-[11px] font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5 shrink-0" />
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Desktop Tab Bar Navigation */}
        <div className="hidden lg:block border-t border-slate-100 bg-slate-50/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-1.5 py-1.5">
            {visibleNavItems.map((item) => {
              // Tampilkan dropdown tunggal untuk grup Stok Material, Pupuk, dan Pertanian
              if (item.id === 'materials' && inventoryNavItems.length > 0) {
                return (
                  <div
                    key="inventory-dropdown"
                    className="relative shrink-0"
                    ref={inventoryDropdownRef}
                  >
                    <button
                      type="button"
                      onClick={() => setInventoryDropdownOpen((prev) => !prev)}
                      aria-expanded={inventoryDropdownOpen}
                      aria-haspopup="menu"
                      className={`min-w-[152px] flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                        isInventoryActive
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : inventoryDropdownOpen
                          ? 'bg-slate-200/80 text-slate-900'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <InventoryTriggerIcon
                          className={`w-4 h-4 shrink-0 ${
                            isInventoryActive ? 'text-white' : 'text-slate-500'
                          }`}
                        />
                        <span>
                          {activeInventoryItem ? activeInventoryItem.label : 'Stok & Produk'}
                        </span>
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${
                          inventoryDropdownOpen ? 'rotate-180' : ''
                        } ${isInventoryActive ? 'text-white/90' : 'text-slate-400'}`}
                      />
                    </button>

                    {inventoryDropdownOpen && (
                      <div
                        role="menu"
                        className="absolute left-0 right-0 top-full mt-1 w-full min-w-full rounded-xl bg-white border border-slate-200 shadow-lg py-1 z-[1050] overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
                      >
                        {inventoryNavItems.map((subItem) => {
                          const SubIcon = subItem.icon;
                          const isSubActive = activeTab === subItem.id;
                          return (
                            <button
                              key={subItem.id}
                              type="button"
                              role="menuitem"
                              onClick={() => handleSelectTab(subItem.id)}
                              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs whitespace-nowrap transition-colors cursor-pointer ${
                                isSubActive
                                  ? 'bg-indigo-50 text-indigo-700 font-bold'
                                  : 'text-slate-700 hover:bg-slate-50 font-semibold'
                              }`}
                            >
                              <SubIcon
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  isSubActive ? 'text-indigo-600' : 'text-slate-500'
                                }`}
                              />
                              <span>{subItem.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              // Lewati fertilizers & agriculture di bar utama karena sudah masuk dropdown
              if (item.id === 'fertilizers' || item.id === 'agriculture') {
                return null;
              }

              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectTab(item.id)}
                  className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                  <span>{item.label}</span>
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span
                      title={String(item.badge)}
                      className="absolute -top-1 -right-1.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-white text-rose-600 border-[1.5px] border-rose-500 text-[10px] font-extrabold font-mono leading-none ring-2 ring-white shadow-xs pointer-events-none"
                    >
                      {item.badge > 99 ? (
                        <>
                          <span>99</span>
                          <span className="text-[7px] font-bold leading-none -mt-0.5">+</span>
                        </>
                      ) : (
                        item.badge
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Mobile Drawer Navigation (Side menu) */}
      {mobileDrawerOpen && (
        <div data-modal="true" className="fixed inset-0 z-[1100] flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileDrawerOpen(false)}
          />

          <div className="relative w-80 max-w-[85vw] bg-white h-full flex flex-col z-10 shadow-2xl">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <img
                  src={`${import.meta.env.BASE_URL}favicon.svg`}
                  alt="Logo Toko Sumber Sewu"
                  className="w-8 h-8 rounded-lg shadow-xs shrink-0"
                />
                <div>
                  <div className="font-bold text-sm text-slate-900">Toko Sumber Sewu</div>
                  <div className="text-[10px] text-slate-500 font-medium">Bahan Bangunan & Pupuk</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Menu List */}
            <div className="flex-1 overflow-y-auto px-3.5 py-4">
              <div className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                MENU UTAMA
              </div>
              <div className="space-y-1">
                {visibleNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectTab(item.id)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-indigo-600 text-white font-bold shadow-xs'
                          : 'text-slate-700 hover:bg-slate-100/80 font-semibold'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon
                          className={`w-4 h-4 shrink-0 ${
                            isActive ? 'text-white' : 'text-indigo-600'
                          }`}
                        />
                        <span className="text-xs sm:text-sm truncate">{item.label}</span>
                      </div>
                      {typeof item.badge === 'number' && item.badge > 0 && (
                        <span
                          title={String(item.badge)}
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full font-mono inline-flex items-center justify-center shrink-0 border ${
                            isActive
                              ? 'bg-transparent text-white border-white/90'
                              : 'bg-white text-rose-600 border-rose-500'
                          }`}
                        >
                          {item.badge > 99 ? (
                            <>
                              <span>99</span>
                              <span className="text-[7px] font-bold leading-none -mt-0.5">+</span>
                            </>
                          ) : (
                            item.badge
                          )}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Drawer Footer: Profil Pengguna & Keluar dari Akun */}
            <div className="p-4 border-t border-slate-200 bg-white space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-900 truncate leading-tight">
                    {cleanName}
                  </div>
                  <div className="text-xs font-medium text-slate-500 truncate mt-0.5">
                    {currentRole === 'owner' ? 'Owner (Superadmin)' : roleName}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setMobileDrawerOpen(false);
                  lockTerminal();
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span>Keluar dari Akun</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
