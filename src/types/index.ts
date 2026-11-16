export type UserRole = 'owner' | 'manager' | 'cashier' | 'technician';

export interface AppUser {
  id: number;
  uid: string;
  username?: string;
  email: string;
  name: string;
  role: UserRole;
  pin?: string;
  createdAt?: string;
}

export interface Category {
  id: number;
  name: string;
  code: string;
  description?: string;
  icon?: string;
}

export interface Product {
  id: number;
  categoryId: number;
  categoryName?: string;
  categoryCode?: string;
  code: string; // SKU / Barcode
  name: string;
  brand?: string;
  model?: string;
  variant?: string; // Spesifikasi: ukuran/bobot (misal: "50 Kg", "12 mm SNI", "500 ml")
  costPrice: number;
  sellingPrice: number;
  stock: number;
  minStockAlert: number;
  isImeiTracked?: boolean;
  unit: string; // Sak, Kg, Karung, Batang, Meter, Lembar, Dus, Botol, Pail, Galon, M3, Biji, dll.
  createdAt?: string;
  docId?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  customPrice?: number;
  notes?: string;
}

export interface SaleItem {
  id: number;
  saleId: number;
  productId: number;
  productCode?: string;
  categoryCode?: string;
  productName: string;
  productCategory: string;
  quantity: number;
  costPrice: number;
  sellingPrice: number;
  subtotal: number;
  profit: number;
  unit?: string;
  specification?: string;
  imeiOrSerial?: string;
  productSerialId?: number;
}

export interface DebtPaymentRecord {
  id: string;
  amount: number;
  method: 'cash' | 'transfer' | 'qris';
  paidAt: string;
  receivedBy: string;
  notes?: string;
}

export interface Sale {
  id: number;
  invoiceNumber: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  subtotal: number;
  discount: number;
  grandTotal: number;
  totalCost: number;
  totalProfit: number;
  paymentMethod: string; // cash, qris, transfer, debt
  paymentStatus?: 'paid' | 'partial' | 'unpaid';
  dpAmount?: number;
  dpMethod?: 'cash' | 'transfer' | 'qris';
  paidTotal?: number;
  remainingDebt?: number;
  paymentHistory?: DebtPaymentRecord[];
  settledAt?: string;
  amountPaid: number;
  changeAmount: number;
  cashierUid?: string;
  status: string;
  notes?: string;
  // Opsi Pengiriman Armada Toko
  deliveryType?: 'pickup' | 'delivery';
  deliveryAddress?: string;
  deliveryVehiclePlate?: string;
  deliveryDriverName?: string;
  deliveryFee?: number;
  createdAt: string;
  items?: SaleItem[];
}

export interface StoreExpense {
  id: number | string;
  docId?: string;
  category: string; // bbm_armada, upah_kuli, gaji_karyawan, listrik_gudang, sewa_lahan, operasional_toko, lainnya
  title: string;
  amount: number;
  expenseDate: string;
  paidBy: string;
  notes?: string;
  createdAt: string;
}

export interface FinancialSummary {
  period: string;
  selectedPeriodInfo?: {
    label: string;
    startDate?: string | null;
    endDate?: string | null;
    month?: number;
    year?: number;
  };
  availableYears?: number[];
  totalGrossOmset: number;
  totalGrossProfit: number;
  totalExpenses: number;
  netProfit: number;
  totalOutstandingDebt?: number;
  unpaidInvoiceCount?: number;
  summary: {
    salesOmset: number;
    salesTotalCost: number;
    salesTotalProfit: number;
    materialsOmset: number;
    materialsProfit: number;
    fertilizersOmset: number;
    fertilizersProfit: number;
  };
  pillarBreakdown: {
    material: { omset: number; profit: number };
    pupuk: { omset: number; profit: number };
  };
  expensesByCategory: Record<string, number>;
  paymentMethodBreakdown?: {
    cash: { count: number; total: number };
    qris: { count: number; total: number };
    transfer: { count: number; total: number };
  };
  indicators: {
    transactionCount: number;
    salesCount: number;
    lowStockCount: number;
  };
  categoryTransactions?: {
    material: CategoryTransactionRecord[];
    pupuk: CategoryTransactionRecord[];
  };
}

export interface CategoryTransactionItem {
  productName: string;
  category: string;
  quantity: number;
  sellingPrice: number;
  costPrice: number;
  subtotal: number;
  profit: number;
}

export interface CategoryTransactionRecord {
  saleId: number;
  invoiceNumber: string;
  customerName: string;
  createdAt: any;
  paymentMethod: string;
  paymentStatus?: 'paid' | 'partial' | 'unpaid';
  paidInPeriod?: number;
  remainingDebt?: number;
  items: CategoryTransactionItem[];
  totalQty: number;
  subtotal: number;
  profit: number;
}

// Deprecated type aliases kept for backward compatibility if any legacy helper refers to them
export type DigitalTransaction = any;
export type ServiceSoftwareOrder = any;
export type ProductSerial = any;
