import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  CheckCircle,
  CreditCard,
  Banknote,
  QrCode,
  Building2,
  Sprout,
  Truck,
  AlertCircle,
  Tag,
  Copy,
  Check,
  Package,
  ArrowRight,
  User,
  Phone,
  MapPin,
  FileText,
  DollarSign,
  Maximize2,
  X,
  FlaskConical,
  ChevronDown,
  Clock,
} from 'lucide-react';
import { Product, CartItem, Sale, DebtPaymentRecord } from '../types/index.ts';
import { useBodyScrollLock } from '../utils/scrollLock.ts';
import {
  subscribeMaterials,
  subscribeFertilizers,
  subscribeAgriculture,
  seedInitialAgricultureOnce,
  syncCheckoutToFirestore,
  normalizeSaleRecord,
} from '../services/cloudInventoryService.ts';
import { getStoredSales, saveStoredSales, notifyDataUpdated } from '../utils/transactionSync.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { RupiahInput } from './RupiahInput.tsx';

export interface StoreBankAccount {
  id: string;
  name: string;
  accNo: string;
  holder: string;
  badgeColor?: string;
}

export const STORE_BANK_ACCOUNTS: StoreBankAccount[] = [
  { id: 'bca', name: 'BCA', accNo: '8820-3948-112', holder: 'Toko Sumber Sewu (Hendra)', badgeColor: 'bg-blue-600' },
  { id: 'bri', name: 'BRI', accNo: '0123-0100-2948-501', holder: 'Toko Sumber Sewu (Hendra)', badgeColor: 'bg-blue-700' },
  { id: 'mandiri', name: 'Mandiri', accNo: '137-00-1928374-1', holder: 'Toko Sumber Sewu (Hendra)', badgeColor: 'bg-amber-600' },
];

interface POSModuleProps {
  onSaleComplete: (sale: Sale) => void;
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
}

export const POSModule: React.FC<POSModuleProps> = ({
  onSaleComplete,
  cart,
  setCart,
}) => {
  const { operatorName } = useAuth();
  const [materials, setMaterials] = useState<Product[]>([]);
  const [fertilizers, setFertilizers] = useState<Product[]>([]);
  const [agriculture, setAgriculture] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter & Search
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileTab, setMobileTab] = useState<'catalog' | 'cart'>('catalog');

  // Checkout State
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [customerName, setCustomerName] = useState('Pelanggan Umum');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [discount, setDiscount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'qris' | 'transfer' | 'debt'>('cash');
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [dpAmount, setDpAmount] = useState<number>(0);
  const [dpMethod, setDpMethod] = useState<'cash' | 'transfer' | 'qris'>('cash');
  const [notes, setNotes] = useState('');

  // Delivery Options (Armada Toko)
  const [deliveryType, setDeliveryType] = useState<'pickup' | 'delivery'>('pickup');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryVehiclePlate, setDeliveryVehiclePlate] = useState('Truk Engkel (N 8123 AB)');
  const [deliveryDriverName, setDeliveryDriverName] = useState('Pak Joko');
  const [deliveryFee, setDeliveryFee] = useState<number>(0);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Kunci scroll body saat modal checkout terbuka
  useBodyScrollLock(checkoutModalOpen);

  // Real-time subscribers
  useEffect(() => {
    seedInitialAgricultureOnce();

    const unsubMat = subscribeMaterials(
      (items) => setMaterials(items),
      () => setMaterials([])
    );
    const unsubFert = subscribeFertilizers(
      (items) => {
        setFertilizers(items);
        setLoading(false);
      },
      () => {
        setFertilizers([]);
        setLoading(false);
      }
    );
    const unsubAgri = subscribeAgriculture(
      (items) => setAgriculture(items),
      () => setAgriculture([])
    );

    return () => {
      unsubMat();
      unsubFert();
      unsubAgri();
    };
  }, []);

  // Combine products for POS catalog (building materials, fertilizers, & agricultural medicines)
  const allProducts = useMemo(() => {
    const nonFertilizerRegex = /(insektisida|pestisida|herbisida|fungisida|benih|bibit|regent|roundup|decis|antracol|gramoxone|agristik|pioneer|ciherang)/i;
    const cleanFertilizers = fertilizers.filter((p) => !nonFertilizerRegex.test(`${p.name} ${p.code}`));
    return [...materials, ...cleanFertilizers, ...agriculture];
  }, [materials, fertilizers, agriculture]);

  // Catalog category filter buttons
  const catalogFilters = [
    { id: 'all', label: 'Semua Produk', icon: Package },
    { id: 'material', label: 'Material Bangunan', icon: Building2 },
    { id: 'pupuk', label: 'Pupuk', icon: Sprout },
    { id: 'pertanian', label: 'Pertanian', icon: FlaskConical },
  ];

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return allProducts.filter((product) => {
      // Category match
      let matchCat = true;
      if (selectedCategoryTab === 'material') {
        matchCat = product.categoryId === 1 || product.categoryCode === 'material';
      } else if (selectedCategoryTab === 'pupuk') {
        matchCat =
          product.categoryId === 2 ||
          product.categoryCode === 'pupuk' ||
          Boolean(product.categoryName?.toLowerCase().includes('pupuk'));
      } else if (selectedCategoryTab === 'pertanian') {
        matchCat =
          product.categoryId === 3 ||
          product.categoryCode === 'pertanian' ||
          Boolean(product.categoryName?.toLowerCase().includes('pertanian'));
      }

      // Search match
      const query = searchQuery.toLowerCase().trim();
      const matchSearch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        product.code.toLowerCase().includes(query) ||
        (product.brand && product.brand.toLowerCase().includes(query)) ||
        (product.variant && product.variant.toLowerCase().includes(query));

      return matchCat && matchSearch;
    });
  }, [allProducts, selectedCategoryTab, searchQuery]);

  const isKodiSheetProduct = (product: Product) =>
    product.unit === 'Lembar' && /seng|asbes/i.test(product.name);

  // Cart operations
  const addToCart = (product: Product, quantityToAdd = 1) => {
    setCart((prevCart) => {
      const existingIdx = prevCart.findIndex((item) => item.product.code === product.code);
      if (existingIdx >= 0) {
        const next = [...prevCart];
        next[existingIdx].quantity += quantityToAdd;
        return next;
      } else {
        return [...prevCart, { product, quantity: quantityToAdd }];
      }
    });
  };

  const updateQuantity = (code: string, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(code);
      return;
    }
    setCart((prev) =>
      prev.map((item) =>
        item.product.code === code ? { ...item, quantity: newQty } : item
      )
    );
  };

  const removeFromCart = (code: string) => {
    setCart((prev) => prev.filter((item) => item.product.code !== code));
  };

  const clearCart = () => {
    setCart([]);
  };

  // Totals
  const subtotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.product.sellingPrice * item.quantity, 0);
  }, [cart]);

  const totalCost = useMemo(() => {
    return cart.reduce((acc, item) => acc + (item.product.costPrice || 0) * item.quantity, 0);
  }, [cart]);

  const deliveryCostTotal = deliveryType === 'delivery' ? deliveryFee : 0;
  const grandTotal = Math.max(0, subtotal - discount + deliveryCostTotal);
  const totalProfit = Math.max(0, grandTotal - totalCost);
  const changeAmount = Math.max(0, amountPaid - grandTotal);

  // Quick Amount Buttons
  const handleSetQuickCash = (amt: number) => {
    setAmountPaid(amt);
  };

  // Open Checkout
  const handleOpenCheckout = () => {
    if (cart.length === 0) return;
    setDiscount(0);
    setAmountPaid(grandTotal);
    setDpAmount(0);
    setDpMethod('cash');
    setErrorMessage('');
    setCheckoutModalOpen(true);
  };

  // Recalculate amount paid on grand total update
  useEffect(() => {
    if (checkoutModalOpen && paymentMethod === 'cash') {
      setAmountPaid(grandTotal);
    }
    if (checkoutModalOpen && paymentMethod === 'debt' && dpAmount >= grandTotal) {
      setDpAmount(0);
    }
  }, [grandTotal, checkoutModalOpen, paymentMethod]);

  const handleSelectPaymentMethod = (method: 'cash' | 'qris' | 'transfer' | 'debt') => {
    setPaymentMethod(method);
    setErrorMessage('');
    if (method === 'debt') {
      if (customerName.trim().toLowerCase() === 'pelanggan umum') {
        setCustomerName('');
      }
      if (dpAmount >= grandTotal) {
        setDpAmount(0);
      }
    } else if (customerName.trim() === '') {
      setCustomerName('Pelanggan Umum');
    }
  };

  // Submit Checkout
  const handleProcessCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;

    if (paymentMethod === 'cash' && amountPaid < grandTotal) {
      setErrorMessage(`Uang pembayaran kurang! Kurang Rp ${(grandTotal - amountPaid).toLocaleString('id-ID')}`);
      return;
    }

    if (paymentMethod === 'debt') {
      const cleanCust = customerName.trim();
      if (!cleanCust || cleanCust.toLowerCase() === 'pelanggan umum') {
        setErrorMessage('Untuk transaksi Hutang / Tempo, wajib mengisi Nama Pelanggan asli.');
        return;
      }
      if (!customerPhone.trim()) {
        setErrorMessage('Untuk transaksi Hutang / Tempo, wajib mengisi No. HP / WhatsApp pelanggan.');
        return;
      }
      if (dpAmount < 0) {
        setErrorMessage('Nominal DP tidak boleh negatif.');
        return;
      }
      if (grandTotal > 0 && dpAmount >= grandTotal) {
        setErrorMessage('Nominal DP sama dengan atau melebihi total tagihan. Gunakan metode Tunai, Transfer, atau QRIS untuk pembayaran lunas.');
        return;
      }
    }

    setSubmitting(true);
    setErrorMessage('');

    try {
      const nowIso = new Date().toISOString();
      const dateStr = nowIso.slice(0, 10).replace(/-/g, '');
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const invoiceNumber = `INV-TSS-${dateStr}-${randomSuffix}`;

      // Build delivery note text
      let deliverySummary = '';
      if (deliveryType === 'delivery') {
        deliverySummary = `[Kirim Armada: ${deliveryVehiclePlate} | Supir: ${deliveryDriverName} | Tujuan: ${deliveryAddress}]`;
      }
      const fullNotes = [deliverySummary, notes.trim()].filter(Boolean).join(' - ');

      const isDebt = paymentMethod === 'debt';
      const effectiveDp = isDebt ? Math.max(0, Math.min(grandTotal, Math.round(dpAmount || 0))) : grandTotal;
      const remainingDebt = isDebt ? Math.max(0, grandTotal - effectiveDp) : 0;
      const paymentStatus: 'paid' | 'partial' | 'unpaid' = !isDebt
        ? 'paid'
        : remainingDebt <= 0
        ? 'paid'
        : effectiveDp > 0
        ? 'partial'
        : 'unpaid';

      const paymentHistory: DebtPaymentRecord[] = [];
      if (isDebt) {
        if (effectiveDp > 0) {
          paymentHistory.push({
            id: `dp-${Date.now()}`,
            amount: effectiveDp,
            method: dpMethod,
            paidAt: nowIso,
            receivedBy: operatorName,
            notes: 'DP Awal saat pembelian',
          });
        }
      } else {
        paymentHistory.push({
          id: `full-${Date.now()}`,
          amount: grandTotal,
          method: paymentMethod,
          paidAt: nowIso,
          receivedBy: operatorName,
          notes: 'Pembayaran Lunas',
        });
      }

      const saleData: Sale = normalizeSaleRecord({
        id: Date.now(),
        invoiceNumber,
        customerName: customerName.trim() || 'Pelanggan Umum',
        customerPhone: customerPhone.trim() || undefined,
        customerAddress:
          deliveryType === 'delivery'
            ? deliveryAddress.trim() || undefined
            : customerAddress.trim() || undefined,
        subtotal,
        discount,
        grandTotal,
        totalCost,
        totalProfit,
        paymentMethod,
        paymentStatus,
        dpAmount: isDebt ? effectiveDp : grandTotal,
        dpMethod: isDebt && effectiveDp > 0 ? dpMethod : undefined,
        paidTotal: isDebt ? effectiveDp : grandTotal,
        remainingDebt,
        paymentHistory,
        settledAt: paymentStatus === 'paid' ? nowIso : undefined,
        amountPaid: isDebt ? effectiveDp : paymentMethod === 'cash' ? amountPaid : grandTotal,
        changeAmount: isDebt ? 0 : paymentMethod === 'cash' ? changeAmount : 0,
        cashierUid: operatorName,
        status: 'completed',
        notes: fullNotes,
        deliveryType,
        deliveryAddress: deliveryType === 'delivery' ? deliveryAddress : undefined,
        deliveryVehiclePlate: deliveryType === 'delivery' ? deliveryVehiclePlate : undefined,
        deliveryDriverName: deliveryType === 'delivery' ? deliveryDriverName : undefined,
        deliveryFee: deliveryCostTotal,
        createdAt: nowIso,
        items: cart.map((item, idx) => ({
          id: idx + 1,
          saleId: 0,
          productId: Number(item.product.id) || idx + 1,
          productCode: item.product.code,
          categoryCode: item.product.categoryCode,
          productName: item.product.name,
          productCategory: item.product.categoryName || 'Material Bangunan',
          quantity: item.quantity,
          costPrice: item.product.costPrice,
          sellingPrice: item.product.sellingPrice,
          subtotal: item.product.sellingPrice * item.quantity,
          profit: (item.product.sellingPrice - item.product.costPrice) * item.quantity,
          unit: item.product.unit,
          specification: item.product.variant,
        })),
      });

      // 1. Try sync to backend PostgreSQL
      try {
        await fetch('/api/pos/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerName: saleData.customerName,
            customerPhone: saleData.customerPhone,
            discount: saleData.discount,
            paymentMethod: saleData.paymentMethod,
            amountPaid: saleData.amountPaid,
            cashierUid: saleData.cashierUid,
            notes: saleData.notes,
            items: cart.map((item) => ({
              productId: item.product.id,
              productName: item.product.name,
              productCategory: item.product.categoryName || 'Material',
              quantity: item.quantity,
              costPrice: item.product.costPrice,
              sellingPrice: item.product.sellingPrice,
              unit: item.product.unit,
            })),
          }),
        });
      } catch (backendErr) {
        console.warn('Backend PostgreSQL offline notice:', backendErr);
      }

      // 2. Sync to Firestore (Sales and Stock reduction) + update local cache
      await syncCheckoutToFirestore(saleData, cart);
      const existingSales = getStoredSales();
      saveStoredSales([saleData, ...existingSales]);
      notifyDataUpdated('pos');

      // 3. Clear cart, reset customer debt fields, and notify parent to display ThermalReceipt
      clearCart();
      setCustomerName('Pelanggan Umum');
      setCustomerPhone('');
      setCustomerAddress('');
      setPaymentMethod('cash');
      setDpAmount(0);
      setNotes('');
      setCheckoutModalOpen(false);
      onSaleComplete(saleData);
    } catch (err: any) {
      console.error('Checkout error:', err);
      setErrorMessage(err?.message || 'Gagal memproses transaksi kasir.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-4">
      {/* Mobile Toggle Catalog vs Cart */}
      <div className="lg:hidden flex rounded-xl bg-slate-200/80 p-1 mb-3">
        <button
          type="button"
          onClick={() => setMobileTab('catalog')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            mobileTab === 'catalog' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
          }`}
        >
          Katalog Produk
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('cart')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            mobileTab === 'cart' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
          }`}
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          <span>Keranjang ({cart.length})</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-start">
        {/* ========================================================
            SISI KIRI: KATALOG MATERIAL & PUPUK (COL 7 of 12)
           ======================================================== */}
        <div
          className={`lg:col-span-7 xl:col-span-8 space-y-3.5 ${
            mobileTab === 'cart' ? 'hidden lg:block' : 'block'
          }`}
        >
          {/* Search and Category Filter Bar */}
          <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200 shadow-xs">
            {/* Mobile & Tablet (< lg): Dropdown Rata Kiri & Pencarian Sejajar Rata Kanan */}
            <div className="flex lg:hidden items-center justify-between gap-2">
              <div className="relative shrink-0 max-w-[52%] sm:max-w-none">
                <select
                  aria-label="Filter Kategori Produk"
                  value={selectedCategoryTab}
                  onChange={(e) => setSelectedCategoryTab(e.target.value)}
                  className="appearance-none w-full py-1.5 pl-3 pr-8 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/80 text-xs font-bold text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer transition-colors truncate"
                >
                  {catalogFilters.map((tab) => (
                    <option key={tab.id} value={tab.id}>
                      {tab.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              <div className="relative flex-1 min-w-0 sm:flex-none sm:w-60 md:w-72">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari Produk"
                  className="w-full py-1.5 pl-8 pr-7 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Desktop (>= lg): Category Filter Pills & Search Input */}
            <div className="hidden lg:flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 max-w-full">
                {catalogFilters.map((tab) => {
                  const Icon = tab.icon;
                  const active = selectedCategoryTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSelectedCategoryTab(tab.id)}
                      className={`flex items-center gap-1.5 h-8 px-2.5 xl:px-3 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 border ${
                        active
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-slate-100 text-slate-600 border-transparent hover:bg-slate-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="relative w-48 xl:w-52 shrink-0">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari Produk"
                  className="w-full py-1.5 pl-8 pr-7 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Product Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredProducts.map((product) => {
              const isLow = Number(product.stock) <= Number(product.minStockAlert || 5);
              const isPertanian =
                product.categoryId === 3 ||
                product.categoryCode === 'pertanian' ||
                Boolean(product.categoryName?.toLowerCase().includes('pertanian'));
              const isPupuk =
                !isPertanian &&
                (product.categoryId === 2 ||
                  product.categoryCode === 'pupuk' ||
                  Boolean(product.categoryName?.toLowerCase().includes('pupuk')));
              const cartItem = cart.find((item) => item.product.code === product.code);
              const inCartQty = cartItem ? cartItem.quantity : 0;

              return (
                <div
                  key={product.code}
                  role="button"
                  tabIndex={0}
                  onClick={() => addToCart(product, 1)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      addToCart(product, 1);
                    }
                  }}
                  className={`bg-white rounded-2xl border p-3.5 shadow-xs transition-colors duration-150 flex flex-col justify-between group cursor-pointer text-left select-none relative ${
                    inCartQty > 0
                      ? 'border-indigo-400 ring-2 ring-indigo-200/70 hover:border-indigo-500 hover:bg-indigo-50/30'
                      : 'border-slate-200 hover:border-indigo-400 hover:bg-slate-50/60'
                  } active:bg-slate-100/70`}
                >
                  <div>
                    {/* Top tags: Unit & Stock */}
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                          isPertanian
                            ? 'bg-teal-50 text-teal-700 border border-teal-100'
                            : isPupuk
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                            : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                        }`}
                      >
                        {isPertanian ? (
                          <FlaskConical className="w-3 h-3" />
                        ) : isPupuk ? (
                          <Sprout className="w-3 h-3" />
                        ) : (
                          <Building2 className="w-3 h-3" />
                        )}
                        <span>{product.unit}</span>
                      </span>

                      <div className="flex items-center gap-1.5">
                        {inCartQty > 0 && (
                          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-mono">
                            {inCartQty} di keranjang
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded font-mono ${
                            isLow
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          Stok: {product.stock}
                        </span>
                      </div>
                    </div>

                    {/* Product Name */}
                    <h3 className="font-bold text-slate-900 text-sm leading-snug line-clamp-2 group-hover:text-indigo-600 transition-colors">
                      {product.name}
                    </h3>

                    {/* Specification / Variant */}
                    {product.variant && (
                      <div className="text-[11px] text-slate-500 font-medium mt-1 truncate">
                        {product.variant}
                      </div>
                    )}

                    {/* Brand & SKU */}
                    <div className="text-[10px] text-slate-400 font-mono mt-1">
                      {product.brand ? `${product.brand} • ` : ''}{product.code}
                    </div>
                  </div>

                  {/* Price & Quick +1 Kodi Action */}
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-end justify-between gap-2">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Harga Jual</div>
                      <div className="text-sm sm:text-base font-black text-indigo-700 font-mono">
                        Rp {Number(product.sellingPrice).toLocaleString('id-ID')}
                      </div>
                    </div>
                    {isKodiSheetProduct(product) && (
                      <button
                        type="button"
                        disabled={Number(product.stock || 0) - inCartQty < 20}
                        onClick={(e) => {
                          e.stopPropagation();
                          addToCart(product, 20);
                        }}
                        title={
                          Number(product.stock || 0) - inCartQty < 20
                            ? 'Stok tersisa kurang dari 1 Kodi (20 Lembar)'
                            : 'Tambah 1 Kodi (20 Lembar) langsung ke keranjang'
                        }
                        className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-indigo-50 disabled:hover:text-indigo-700 shrink-0"
                      >
                        +1 Kodi
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {filteredProducts.length === 0 && (
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 text-slate-400">
              <Package className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-700">
                {allProducts.length === 0
                  ? 'Katalog toko belum memiliki produk (0 barang)'
                  : 'Tidak ada material, pupuk, atau produk pertanian yang cocok'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {allProducts.length === 0
                  ? 'Data tabel kosong. Silakan input produk baru melalui modul Stok Material, Pupuk, atau Pertanian.'
                  : 'Coba gunakan kata kunci pencarian atau kategori yang lain.'}
              </p>
            </div>
          )}
        </div>

        {/* ========================================================
            SISI KANAN: KERANJANG KASIR & CHECKOUT (COL 5 of 12)
           ======================================================== */}
        <div
          className={`lg:col-span-5 xl:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 flex flex-col min-h-[420px] h-[calc(100dvh-11.5rem)] lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)] lg:max-h-[calc(100vh-6rem)] ${
            mobileTab === 'catalog' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* Cart Header */}
          <div className="flex-shrink-0 flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <ShoppingCart className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-extrabold text-sm sm:text-base text-slate-900">
                  Keranjang Transaksi
                </h2>
                <span className="text-[10px] text-slate-400 font-medium">
                  {cart.length} item pesanan
                </span>
              </div>
            </div>

            {cart.length > 0 && (
              <button
                type="button"
                onClick={clearCart}
                className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Kosongkan</span>
              </button>
            )}
          </div>

          {/* Cart Items List with Internal Scroll */}
          <div className="flex-1 min-h-0 overflow-y-auto my-3 divide-y divide-slate-100 pr-1">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center py-12 text-center text-slate-400">
                <ShoppingCart className="w-12 h-12 mx-auto text-slate-200 mb-2" />
                <p className="text-xs font-semibold text-slate-500">Keranjang masih kosong</p>
                <p className="text-[11px] text-slate-400 mt-0.5 max-w-[220px]">
                  Klik kartu material atau pupuk di katalog untuk menambahkan ke keranjang.
                </p>
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.product.code} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-xs text-slate-900 leading-snug line-clamp-2">
                        {item.product.name}
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <span className="font-semibold text-indigo-600">{item.product.unit}</span>
                        {item.product.variant && <span>&bull; {item.product.variant}</span>}
                      </div>
                      <div className="font-mono text-xs font-bold text-slate-800 mt-1">
                        Rp {item.product.sellingPrice.toLocaleString('id-ID')}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <div className="flex items-center gap-1.5">
                        {/* Quantity Stepper with Direct Input */}
                        <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.product.code, item.quantity - 1)}
                            className="w-6 h-6 flex items-center justify-center rounded text-slate-600 hover:bg-white hover:text-rose-600 cursor-pointer transition-colors"
                            title="Kurangi kuantitas"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            inputMode="numeric"
                            min="1"
                            value={item.quantity}
                            onWheel={(e) => e.currentTarget.blur()}
                            onChange={(e) =>
                              updateQuantity(item.product.code, Math.max(1, parseInt(e.target.value) || 1))
                            }
                            className="w-10 text-center text-xs font-bold text-slate-900 bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.product.code, item.quantity + 1)}
                            className="w-6 h-6 flex items-center justify-center rounded text-slate-600 hover:bg-white hover:text-indigo-600 cursor-pointer transition-colors"
                            title="Tambah kuantitas"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Tombol Hapus per Item Barang */}
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.product.code)}
                          title={`Hapus ${item.product.name} dari keranjang`}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {isKodiSheetProduct(item.product) && (
                          <button
                            type="button"
                            disabled={Number(item.product.stock || 0) - item.quantity < 20}
                            onClick={() => updateQuantity(item.product.code, item.quantity + 20)}
                            title={
                              Number(item.product.stock || 0) - item.quantity < 20
                                ? 'Stok tersisa kurang dari 1 Kodi (20 Lembar)'
                                : 'Tambah +1 Kodi (20 Lembar)'
                            }
                            className="px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 text-[10px] font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-indigo-50 disabled:hover:text-indigo-700"
                          >
                            +1 Kodi
                          </button>
                        )}
                        <div className="font-mono font-black text-xs text-indigo-700">
                          Rp {(item.product.sellingPrice * item.quantity).toLocaleString('id-ID')}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Quick Wholesale Add Helper */}
          {cart.length > 0 && (
            <div className="flex-shrink-0 py-2 px-3 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-slate-600 mb-2 flex items-center justify-between">
              <span>Pengiriman Proyek:</span>
              <button
                type="button"
                onClick={() => setDeliveryType(deliveryType === 'delivery' ? 'pickup' : 'delivery')}
                className={`font-bold px-2 py-0.5 rounded cursor-pointer transition-colors ${
                  deliveryType === 'delivery'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {deliveryType === 'delivery' ? '🚛 Armada Toko' : '🏪 Ambil di Toko'}
              </button>
            </div>
          )}

          {/* Cart Summary (Pinned to Bottom) */}
          <div className="flex-shrink-0 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span className="font-mono font-bold text-slate-900">
                Rp {subtotal.toLocaleString('id-ID')}
              </span>
            </div>

            {deliveryType === 'delivery' && (
              <div className="flex justify-between text-amber-700 font-semibold">
                <span>Ongkir Armada:</span>
                <span className="font-mono">
                  {deliveryFee > 0 ? `+Rp ${deliveryFee.toLocaleString('id-ID')}` : 'Gratis'}
                </span>
              </div>
            )}

            <div className="flex justify-between items-baseline pt-2 border-t border-slate-200">
              <span className="font-extrabold text-sm text-slate-900">Total Tagihan:</span>
              <span className="font-mono font-black text-lg text-indigo-700">
                Rp {grandTotal.toLocaleString('id-ID')}
              </span>
            </div>
          </div>

          {/* Checkout Button (Pinned to Bottom) */}
          <button
            type="button"
            disabled={cart.length === 0}
            onClick={handleOpenCheckout}
            className="flex-shrink-0 w-full mt-3 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            <span>Bayar & Cetak Nota</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ========================================================
          MODAL CHECKOUT LENGKAP (Pengiriman Armada & Pembayaran)
         ======================================================== */}
      {checkoutModalOpen && (
        <div
          data-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCheckoutModalOpen(false);
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
            className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            <form onSubmit={handleProcessCheckout} className="flex flex-col h-full max-h-[90vh] min-h-0">
              {/* Modal Header (Fixed / Sticky at Top) */}
              <div className="flex-shrink-0 flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-white">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-base font-extrabold text-slate-900">
                    Penyelesaian Pembayaran & Surat Jalan
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setCheckoutModalOpen(false)}
                  className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 flex items-center justify-center cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable Form Body (Internal Scroll Only) */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
                {/* Customer Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Nama Pembeli / Pemilik Proyek {paymentMethod === 'debt' && <span className="text-rose-500">*</span>}
                    </label>
                    <div className="relative">
                      <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        required
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder={paymentMethod === 'debt' ? 'Wajib nama pembeli asli' : 'Contoh: Pak Haji Samsul'}
                        className={`w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 font-medium ${
                          paymentMethod === 'debt' && (!customerName.trim() || customerName.trim().toLowerCase() === 'pelanggan umum')
                            ? 'border-amber-400 bg-amber-50/40'
                            : 'border-slate-200'
                        }`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      No. Handphone / WhatsApp {paymentMethod === 'debt' && <span className="text-rose-500">*</span>}
                    </label>
                    <div className="relative">
                      <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        required={paymentMethod === 'debt'}
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder={paymentMethod === 'debt' ? 'Wajib diisi (08xx-xxxx)' : '0812-xxxx-xxxx'}
                        className={`w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 font-medium ${
                          paymentMethod === 'debt' && !customerPhone.trim()
                            ? 'border-amber-400 bg-amber-50/40'
                            : 'border-slate-200'
                        }`}
                      />
                    </div>
                  </div>
                </div>

                {/* Alamat Pelanggan saat Hutang & Ambil Sendiri */}
                {paymentMethod === 'debt' && deliveryType === 'pickup' && (
                  <div className="animate-in fade-in">
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Alamat / Domisili Pelanggan (Opsional)
                    </label>
                    <div className="relative">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={customerAddress}
                        onChange={(e) => setCustomerAddress(e.target.value)}
                        placeholder="Contoh: Dusun Krajan RT 02 / RW 01"
                        className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-500 font-medium"
                      />
                    </div>
                  </div>
                )}

                {/* Delivery Options */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Truck className="w-4 h-4 text-amber-600" />
                      <span>Metode Penyerahan / Pengiriman</span>
                    </label>
                    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setDeliveryType('pickup')}
                        className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                          deliveryType === 'pickup'
                            ? 'bg-indigo-600 text-white font-bold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Bawa Sendiri
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeliveryType('delivery')}
                        className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                          deliveryType === 'delivery'
                            ? 'bg-amber-600 text-white font-bold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Armada Toko
                      </button>
                    </div>
                  </div>

                  {deliveryType === 'delivery' && (
                    <div className="space-y-2 pt-2 border-t border-slate-200/80 animate-in fade-in">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-0.5">
                          Alamat Tujuan / Proyek Pengiriman
                        </label>
                        <input
                          type="text"
                          required={deliveryType === 'delivery'}
                          value={deliveryAddress}
                          onChange={(e) => setDeliveryAddress(e.target.value)}
                          placeholder="Contoh: Jl. Mawar No. 12, Proyek Ruko Timur Lapangan"
                          className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-semibold text-slate-700 block mb-0.5">
                            Armada & No. Polisi
                          </label>
                          <input
                            type="text"
                            value={deliveryVehiclePlate}
                            onChange={(e) => setDeliveryVehiclePlate(e.target.value)}
                            placeholder="Truk Engkel / N 8123 AB"
                            className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-slate-700 block mb-0.5">
                            Nama Supir
                          </label>
                          <input
                            type="text"
                            value={deliveryDriverName}
                            onChange={(e) => setDeliveryDriverName(e.target.value)}
                            placeholder="Pak Joko / Mas Dedi"
                            className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-0.5">
                          Ongkos Kirim Armada (Rp) — <span className="font-normal text-slate-500">kosongkan jika gratis</span>
                        </label>
                        <RupiahInput
                          value={deliveryFee}
                          onChange={(val) => setDeliveryFee(val)}
                          className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 font-mono font-bold"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Payment Method Selector */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Metode Pembayaran
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
                    <button
                      type="button"
                      onClick={() => handleSelectPaymentMethod('cash')}
                      className={`py-2 px-1.5 sm:px-2.5 rounded-xl border text-[11px] sm:text-xs font-bold flex flex-col items-center justify-center gap-1 text-center transition-all cursor-pointer ${
                        paymentMethod === 'cash'
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-xs'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <Banknote className="w-4 h-4" />
                      <span>Tunai (Cash)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectPaymentMethod('transfer')}
                      className={`py-2 px-1.5 sm:px-2.5 rounded-xl border text-[11px] sm:text-xs font-bold flex flex-col items-center justify-center gap-1 text-center transition-all cursor-pointer ${
                        paymentMethod === 'transfer'
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-xs'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>Transfer Bank</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectPaymentMethod('qris')}
                      className={`py-2 px-1.5 sm:px-2.5 rounded-xl border text-[11px] sm:text-xs font-bold flex flex-col items-center justify-center gap-1 text-center transition-all cursor-pointer ${
                        paymentMethod === 'qris'
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-xs'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <QrCode className="w-4 h-4" />
                      <span>QRIS / E-Wallet</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectPaymentMethod('debt')}
                      className={`py-2 px-1.5 sm:px-2.5 rounded-xl border text-[11px] sm:text-xs font-bold flex flex-col items-center justify-center gap-1 text-center transition-all cursor-pointer ${
                        paymentMethod === 'debt'
                          ? 'border-amber-600 bg-amber-50 text-amber-800 shadow-xs'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <Clock className="w-4 h-4" />
                      <span>Hutang / Tempo</span>
                    </button>
                  </div>
                </div>

                {/* Bank Transfer Details */}
                {paymentMethod === 'transfer' && (
                  <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-200 text-xs space-y-2">
                    <div className="font-bold text-blue-900">Rekening Tujuan Toko Sumber Sewu:</div>
                    <div className="space-y-1">
                      {STORE_BANK_ACCOUNTS.map((b) => (
                        <div key={b.id} className="flex justify-between items-center text-blue-950">
                          <span className="font-bold">{b.name} ({b.accNo}):</span>
                          <span className="font-medium text-slate-600">{b.holder}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* QRIS details */}
                {paymentMethod === 'qris' && (
                  <div className="p-3 rounded-xl bg-purple-50/60 border border-purple-200 text-center text-xs space-y-1">
                    <div className="font-bold text-purple-900">Scan QRIS Toko Sumber Sewu</div>
                    <p className="text-slate-600 text-[11px]">Dapat discan melalui BCA, Mandiri, BRI, BNI, GoPay, OVO, ShopeePay & DANA.</p>
                  </div>
                )}

                {/* Debt / DP Options */}
                {paymentMethod === 'debt' && (
                  <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-3 animate-in fade-in">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-amber-900">
                          Pembayaran Hutang / Tempo (Boleh DP)
                        </div>
                        <p className="text-[11px] text-amber-800/90 mt-0.5">
                          Stok barang langsung berkurang. Uang DP &amp; cicilan dicatat sebagai pendapatan saat dibayarkan.
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Uang Muka / DP Sekarang (Rp) — <span className="font-normal text-slate-500">kosongkan jika hutang penuh</span>
                      </label>
                      <RupiahInput
                        value={dpAmount}
                        onChange={(val) => setDpAmount(val)}
                        className="w-full px-3 py-1.5 text-xs font-black font-mono text-amber-800 bg-white border border-amber-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setDpAmount(0)}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border cursor-pointer transition-colors ${
                          dpAmount === 0
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-100'
                        }`}
                      >
                        Tanpa DP (Rp 0)
                      </button>
                      {[0.25, 0.5].map((pct) => {
                        const val = Math.round((grandTotal * pct) / 1000) * 1000;
                        if (val <= 0 || val >= grandTotal) return null;
                        return (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => setDpAmount(val)}
                            className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border cursor-pointer font-mono transition-colors ${
                              dpAmount === val
                                ? 'bg-amber-600 text-white border-amber-600'
                                : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100'
                            }`}
                          >
                            DP {pct * 100}% (Rp {val.toLocaleString('id-ID')})
                          </button>
                        );
                      })}
                    </div>

                    {dpAmount > 0 && (
                      <div className="pt-2 border-t border-amber-200/80 space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-700 block">
                          Metode Pembayaran DP
                        </label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(
                            [
                              { id: 'cash', label: 'Tunai' },
                              { id: 'transfer', label: 'Transfer' },
                              { id: 'qris', label: 'QRIS' },
                            ] as const
                          ).map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setDpMethod(m.id)}
                              className={`py-1.5 px-2 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors ${
                                dpMethod === m.id
                                  ? 'bg-amber-600 text-white border-amber-600'
                                  : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100/70'
                              }`}
                            >
                              {m.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Cash Paid Amount & Quick Buttons */}
                {paymentMethod === 'cash' && (
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Jumlah Uang Tunai Diterima (Rp)
                      </label>
                      <RupiahInput
                        required={grandTotal > 0}
                        value={amountPaid}
                        onChange={(val) => setAmountPaid(val)}
                        className="w-full px-3 py-1.5 text-xs font-black font-mono text-indigo-700 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    {/* Quick cash pills */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleSetQuickCash(grandTotal)}
                        className="text-[11px] font-bold px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 cursor-pointer"
                      >
                        Uang Pas
                      </button>
                      {[100000, 200000, 500000, 1000000, 2000000, 5000000].map((amt) => {
                        if (amt >= grandTotal) {
                          return (
                            <button
                              key={amt}
                              type="button"
                              onClick={() => handleSetQuickCash(amt)}
                              className="text-[11px] font-medium px-2 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer font-mono"
                            >
                              {(amt / 1000).toLocaleString('id-ID')}rb
                            </button>
                          );
                        }
                        return null;
                      })}
                    </div>
                  </div>
                )}

                {/* Discount and Notes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Potongan Diskon (Rp)
                    </label>
                    <RupiahInput
                      value={discount}
                      onChange={(val) => setDiscount(val)}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Catatan Tambahan
                    </label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Misal: Titip di mandor"
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    />
                  </div>
                </div>

                {/* Total Calculation Card */}
                <div className="p-3.5 rounded-xl bg-slate-100 text-xs space-y-1 font-medium">
                  <div className="flex justify-between">
                    <span>Subtotal Belanja:</span>
                    <span className="font-mono">Rp {subtotal.toLocaleString('id-ID')}</span>
                  </div>
                  {deliveryCostTotal > 0 && (
                    <div className="flex justify-between text-amber-700">
                      <span>Biaya Kirim Armada:</span>
                      <span className="font-mono">+Rp {deliveryCostTotal.toLocaleString('id-ID')}</span>
                    </div>
                  )}
                  {discount > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Diskon Toko:</span>
                      <span className="font-mono">-Rp {discount.toLocaleString('id-ID')}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-extrabold text-sm text-slate-900 pt-1.5 border-t border-slate-200">
                    <span>Total Tagihan:</span>
                    <span className="font-mono text-indigo-700 text-base">
                      Rp {grandTotal.toLocaleString('id-ID')}
                    </span>
                  </div>
                  {paymentMethod === 'cash' && (
                    <div className="flex justify-between font-bold text-emerald-700 pt-1">
                      <span>Uang Kembalian:</span>
                      <span className="font-mono">
                        Rp {changeAmount.toLocaleString('id-ID')}
                      </span>
                    </div>
                  )}
                  {paymentMethod === 'debt' && (
                    <>
                      <div className="flex justify-between font-semibold text-slate-700 pt-1">
                        <span>DP Dibayar Sekarang ({dpAmount > 0 ? dpMethod.toUpperCase() : '-'}):</span>
                        <span className="font-mono">
                          Rp {Math.min(grandTotal, Math.max(0, dpAmount)).toLocaleString('id-ID')}
                        </span>
                      </div>
                      <div className="flex justify-between font-extrabold text-amber-800 pt-1 border-t border-slate-200">
                        <span>Sisa Hutang / Piutang:</span>
                        <span className="font-mono">
                          Rp {Math.max(0, grandTotal - Math.max(0, dpAmount)).toLocaleString('id-ID')}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {errorMessage && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}
              </div>

              {/* Modal Footer Actions (Fixed / Sticky at Bottom) */}
              <div className="flex-shrink-0 p-4 sm:p-5 border-t border-slate-100 bg-slate-50/90 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setCheckoutModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors"
                >
                  {submitting ? (
                    <span>Memproses...</span>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      <span>Selesaikan & Cetak Struk</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
