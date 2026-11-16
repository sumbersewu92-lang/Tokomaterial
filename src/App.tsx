import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { Navbar, ActiveTab } from './components/Navbar.tsx';
import { LockScreen } from './components/LockScreen.tsx';
import { POSModule } from './components/POSModule.tsx';
import { MaterialsModule } from './components/MaterialsModule.tsx';
import { FertilizerModule } from './components/FertilizerModule.tsx';
import { AgricultureModule } from './components/AgricultureModule.tsx';
import { SalesHistoryModule } from './components/SalesHistoryModule.tsx';
import { AnalyticsModule } from './components/AnalyticsModule.tsx';
import { ExpensesModule } from './components/ExpensesModule.tsx';
import { UserManagementModule } from './components/UserManagementModule.tsx';
import { ThermalReceipt } from './components/ThermalReceipt.tsx';
import { CartItem, Sale, AppUser } from './types/index.ts';
import { onTransactionDeleted, onDataUpdated } from './utils/transactionSync.ts';
import {
  subscribeMaterials,
  subscribeFertilizers,
  subscribeAgriculture,
  seedInitialAgricultureOnce,
  seedRequestedFertilizersOnce,
  seedRequestedMaterialsOnce,
} from './services/cloudInventoryService.ts';
import { initGlobalModalScrollLock, forceResetScrollLock } from './utils/scrollLock.ts';

function AppContent() {
  const { isLocked, unlockTerminal, currentRole } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('pos');
  const [cart, setCart] = useState<CartItem[]>([]);

  // Inisialisasi penguncian scroll latar belakang otomatis saat modal/pop-up manapun terbuka
  // Garansi reset scroll lock saat aplikasi pertama kali dimuat atau di-refresh
  useEffect(() => {
    forceResetScrollLock();
    const cleanup = initGlobalModalScrollLock();
    return () => {
      cleanup();
      forceResetScrollLock();
    };
  }, []);

  // Receipt Modal State
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [saleReceiptData, setSaleReceiptData] = useState<Sale | null>(null);

  // Indicators for badges
  const [materialsCount, setMaterialsCount] = useState(0);
  const [fertilizersCount, setFertilizersCount] = useState(0);
  const [agricultureCount, setAgricultureCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);

  // Role Access Guard: Kasir hanya boleh mengakses tab operasional kasir & stok
  useEffect(() => {
    if (currentRole === 'cashier') {
      const allowedCashierTabs: ActiveTab[] = [
        'pos',
        'materials',
        'fertilizers',
        'agriculture',
        'sales_history',
      ];
      if (!allowedCashierTabs.includes(activeTab)) {
        setActiveTab('pos');
      }
    }
  }, [currentRole, activeTab]);

  // Pastikan posisi scroll SELALU reset ke paling atas (top: 0) saat berpindah tab
  useEffect(() => {
    forceResetScrollLock();
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;

    // Pastikan posisi tetap di atas setelah komponen tab baru selesai me-render layout-nya
    const rafId = requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    });

    return () => cancelAnimationFrame(rafId);
  }, [activeTab]);

  // Sinkronisasi Real-Time Badge Stok Material, Pupuk & Pertanian dengan Cloud Firestore
  useEffect(() => {
    seedInitialAgricultureOnce();
    seedRequestedFertilizersOnce();
    seedRequestedMaterialsOnce();

    let matItems: any[] = [];
    let fertItems: any[] = [];
    let agriItems: any[] = [];

    const updateCounts = () => {
      setMaterialsCount(matItems.length);
      setFertilizersCount(fertItems.length);
      setAgricultureCount(agriItems.length);

      const lowMat = matItems.filter(
        (p) => Number(p.stock) <= Number(p.minStockAlert ?? 5)
      ).length;
      const lowFert = fertItems.filter(
        (p) => Number(p.stock) <= Number(p.minStockAlert ?? 5)
      ).length;
      const lowAgri = agriItems.filter(
        (p) => Number(p.stock) <= Number(p.minStockAlert ?? 5)
      ).length;
      setLowStockCount(lowMat + lowFert + lowAgri);
    };

    const unsubMat = subscribeMaterials((items) => {
      matItems = items;
      updateCounts();
    });

    const unsubFert = subscribeFertilizers((items) => {
      fertItems = items;
      updateCounts();
    });

    const unsubAgri = subscribeAgriculture((items) => {
      agriItems = items;
      updateCounts();
    });

    const unsubUpdate = onDataUpdated(() => {
      updateCounts();
    });

    const unsubDelete = onTransactionDeleted(() => {
      updateCounts();
    });

    return () => {
      unsubMat();
      unsubFert();
      unsubAgri();
      unsubUpdate();
      unsubDelete();
    };
  }, []);

  const handleSaleComplete = (sale: Sale) => {
    setSaleReceiptData(sale);
    setReceiptOpen(true);
  };

  const handleReprintSale = (sale: Sale) => {
    setSaleReceiptData(sale);
    setReceiptOpen(true);
  };

  const handleUnlockTerminal = (staff: AppUser) => {
    unlockTerminal(staff);
    // Saat pengguna berhasil login, otomatis masuk ke tab Kasir POS & reset scroll
    setActiveTab('pos');
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  };

  // If Terminal is Locked & Awaiting Cashier / Owner PIN Login
  if (isLocked) {
    return <LockScreen onUnlockSuccess={handleUnlockTerminal} />;
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col text-slate-900 antialiased selection:bg-amber-100 selection:text-amber-900 w-full max-w-full">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        cartCount={cart.reduce((acc, item) => acc + item.quantity, 0)}
        materialsCount={materialsCount}
        fertilizersCount={fertilizersCount}
        agricultureCount={agricultureCount}
        lowStockCount={lowStockCount}
      />

      {/* Main Container with compact top spacing below sticky navbar */}
      <main className="flex-1 pt-2 sm:pt-2.5 lg:pt-3 pb-16 lg:pb-12 min-h-[calc(100vh-65px)] lg:min-h-[calc(100vh-125px)] w-full max-w-full">
        <div key={activeTab} className="tab-transition w-full max-w-full">
          {activeTab === 'pos' && (
            <POSModule
              onSaleComplete={handleSaleComplete}
              cart={cart}
              setCart={setCart}
            />
          )}

          {activeTab === 'materials' && <MaterialsModule />}

          {activeTab === 'fertilizers' && <FertilizerModule />}

          {activeTab === 'agriculture' && <AgricultureModule />}

          {activeTab === 'sales_history' && (
            <SalesHistoryModule onReprintSale={handleReprintSale} />
          )}

          {activeTab === 'analytics' && <AnalyticsModule />}

          {activeTab === 'expenses' && <ExpensesModule />}

          {activeTab === 'users' && <UserManagementModule />}
        </div>
      </main>

      {/* Footer Toko Sumber Sewu */}
      <footer className="bg-white border-t border-slate-200 py-3 text-center text-xs text-slate-500 no-print">
        <p>
          Toko Sumber Sewu &bull; Ngarip, Ulubelu &bull; WA: 082281813460
        </p>
      </footer>

      {/* Thermal Receipt Modal (58mm / 80mm) */}
      {receiptOpen && saleReceiptData && (
        <ThermalReceipt
          saleData={saleReceiptData}
          onClose={() => setReceiptOpen(false)}
        />
      )}
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
