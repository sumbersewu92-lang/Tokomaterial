import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  writeBatch,
  onSnapshot,
  query,
  where,
  orderBy,
  runTransaction,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../lib/firebase.ts';
import { handleFirestoreError, OperationType } from '../lib/firestoreError.ts';
import { Product, Sale, DebtPaymentRecord, StoreExpense } from '../types/index.ts';
import {
  INITIAL_MOCK_AGRICULTURE,
} from '../lib/mockData.ts';

// Koleksi Firestore Toko Sumber Sewu
export const MATERIALS_COLLECTION = 'stok_material';
export const FERTILIZERS_COLLECTION = 'stok_pupuk';
export const AGRICULTURE_COLLECTION = 'stok_pertanian';
export const SALES_COLLECTION = 'penjualan';
export const EXPENSES_COLLECTION = 'pengeluaran';
const APP_META_COLLECTION = '_app_meta';
const AGRICULTURE_SEED_DOC_ID = 'pertanian_seed_v1';
const AGRICULTURE_SEED_LOCAL_KEY = 'tss_pertanian_seeded_v1';
const CUSTOM_FERTILIZER_SEED_DOC_ID = 'pupuk_custom_batch_20261116';
const CUSTOM_FERTILIZER_SEED_LOCAL_KEY = 'tss_pupuk_custom_batch_20261116';
const CUSTOM_FERTILIZER_UNIT_DOC_ID = 'pupuk_custom_batch_sak50kg_v1';
const CUSTOM_FERTILIZER_UNIT_LOCAL_KEY = 'tss_pupuk_custom_batch_sak50kg_v1';
const CUSTOM_MATERIAL_SEED_DOC_ID = 'material_custom_batch_20261116';
const CUSTOM_MATERIAL_SEED_LOCAL_KEY = 'tss_material_custom_batch_20261116';
const CUSTOM_MATERIAL_LEMBAR_DOC_ID = 'material_seng_asbes_lembar_v1';
const CUSTOM_MATERIAL_LEMBAR_LOCAL_KEY = 'tss_material_seng_asbes_lembar_v1';

export function sanitizeForFirestore<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      if (v !== undefined) {
        cleaned[k] = sanitizeForFirestore(v);
      }
    }
    return cleaned as T;
  }
  return value;
}

export function normalizeSaleRecord(raw: any): Sale {
  const grandTotal = Number(raw?.grandTotal || 0);
  const method = String(raw?.paymentMethod || 'cash').toLowerCase();
  const isDebt = method === 'debt';

  const rawHistory: DebtPaymentRecord[] = Array.isArray(raw?.paymentHistory)
    ? raw.paymentHistory.map((p: any, idx: number) => ({
        id: String(p?.id || `pay-${idx}-${Date.now()}`),
        amount: Number(p?.amount || 0),
        method: (p?.method === 'transfer' || p?.method === 'qris' ? p.method : 'cash') as
          | 'cash'
          | 'transfer'
          | 'qris',
        paidAt: String(p?.paidAt || raw?.createdAt || new Date().toISOString()),
        receivedBy: String(p?.receivedBy || raw?.cashierUid || 'Kasir'),
        notes: p?.notes ? String(p.notes) : undefined,
      }))
    : [];

  let paidTotal: number;
  if (typeof raw?.paidTotal === 'number') {
    paidTotal = raw.paidTotal;
  } else if (isDebt) {
    paidTotal =
      rawHistory.length > 0
        ? rawHistory.reduce((sum, p) => sum + Number(p.amount || 0), 0)
        : Number(raw?.dpAmount ?? raw?.amountPaid ?? 0);
  } else {
    paidTotal = grandTotal;
  }

  paidTotal = Math.max(0, Math.min(grandTotal, paidTotal));
  const remainingDebt =
    typeof raw?.remainingDebt === 'number'
      ? Math.max(0, raw.remainingDebt)
      : Math.max(0, grandTotal - paidTotal);

  let paymentStatus: 'paid' | 'partial' | 'unpaid';
  if (raw?.paymentStatus === 'paid' || raw?.paymentStatus === 'partial' || raw?.paymentStatus === 'unpaid') {
    paymentStatus = remainingDebt <= 0 ? 'paid' : paidTotal > 0 ? 'partial' : 'unpaid';
  } else if (!isDebt || remainingDebt <= 0) {
    paymentStatus = 'paid';
  } else if (paidTotal > 0) {
    paymentStatus = 'partial';
  } else {
    paymentStatus = 'unpaid';
  }

  return {
    ...raw,
    grandTotal,
    subtotal: Number(raw?.subtotal || grandTotal),
    discount: Number(raw?.discount || 0),
    totalCost: Number(raw?.totalCost || 0),
    totalProfit: Number(raw?.totalProfit ?? Math.max(0, grandTotal - Number(raw?.totalCost || 0))),
    paymentMethod: raw?.paymentMethod || 'cash',
    paymentStatus,
    dpAmount: Number(raw?.dpAmount ?? (isDebt ? paidTotal : grandTotal)),
    paidTotal,
    remainingDebt,
    paymentHistory: rawHistory,
    amountPaid: Number(raw?.amountPaid ?? paidTotal),
    changeAmount: Number(raw?.changeAmount || 0),
    createdAt: raw?.createdAt || new Date().toISOString(),
  } as Sale;
}

// Legacy alias compatibility
export const ACCESSORIES_COLLECTION = MATERIALS_COLLECTION;
export const HP_IMEI_COLLECTION = FERTILIZERS_COLLECTION;

let isSeedingAgriculture = false;
let isSeedingCustomFertilizers = false;
let isSeedingCustomMaterials = false;

// ==========================================
// 1. MODUL STOK MATERIAL BANGUNAN (CLOUD FIRESTORE)
// ==========================================

export async function seedInitialMaterialsIfEmpty(): Promise<void> {
  // Auto-seeding mock massal dinonaktifkan: Jika tabel kosong atau user menghapus semua data,
  // data tidak diisi ulang secara otomatis dari mockData.
  return;
}

const REQUESTED_MATERIAL_BATCH: Array<Omit<Product, 'createdAt'>> = [
  {
    id: 1101,
    categoryId: 1,
    categoryName: 'Material Bangunan',
    categoryCode: 'material',
    code: 'MAT-SMN-TR50',
    name: 'Semen Tiga Roda PCC (50 Kg)',
    brand: 'Tiga Roda (Indocement)',
    model: 'Portland Composite Cement',
    variant: 'Sak 50 Kg',
    costPrice: 70000,
    sellingPrice: 80000,
    stock: 1,
    minStockAlert: 10,
    isImeiTracked: false,
    unit: 'Sak',
  },
  {
    id: 1102,
    categoryId: 1,
    categoryName: 'Material Bangunan',
    categoryCode: 'material',
    code: 'MAT-BSI-06MM',
    name: 'Besi Beton Polos Ø6 mm / 5,5 mm (12m)',
    brand: 'SNI',
    model: 'Besi Beton Polos Ø6 mm',
    variant: 'Batang 12 Meter',
    costPrice: 18000,
    sellingPrice: 30000,
    stock: 1,
    minStockAlert: 10,
    isImeiTracked: false,
    unit: 'Batang',
  },
  {
    id: 1103,
    categoryId: 1,
    categoryName: 'Material Bangunan',
    categoryCode: 'material',
    code: 'MAT-BSI-08MM',
    name: 'Besi Beton Polos Ø8 mm SNI (12m)',
    brand: 'SNI',
    model: 'Besi Beton Polos Ø8 mm',
    variant: 'Batang 12 Meter',
    costPrice: 45000,
    sellingPrice: 65000,
    stock: 1,
    minStockAlert: 10,
    isImeiTracked: false,
    unit: 'Batang',
  },
  {
    id: 1104,
    categoryId: 1,
    categoryName: 'Material Bangunan',
    categoryCode: 'material',
    code: 'MAT-BSI-10MM',
    name: 'Besi Beton Polos Ø10 mm SNI (12m)',
    brand: 'SNI',
    model: 'Besi Beton Polos Ø10 mm',
    variant: 'Batang 12 Meter',
    costPrice: 70000,
    sellingPrice: 90000,
    stock: 1,
    minStockAlert: 10,
    isImeiTracked: false,
    unit: 'Batang',
  },
  {
    id: 1105,
    categoryId: 1,
    categoryName: 'Material Bangunan',
    categoryCode: 'material',
    code: 'MAT-BNDR-1KG',
    name: 'Kawat Bendrat Hitam Ikat Besi (1 Kg)',
    brand: 'SNI',
    model: 'Kawat Bendrat BWG 21',
    variant: '1 Kg',
    costPrice: 17000,
    sellingPrice: 25000,
    stock: 1,
    minStockAlert: 10,
    isImeiTracked: false,
    unit: 'Kg',
  },
  {
    id: 1106,
    categoryId: 1,
    categoryName: 'Material Bangunan',
    categoryCode: 'material',
    code: 'MAT-BNG-BGN',
    name: 'Benang Nilon Bangunan / Benang Tukang',
    brand: 'Lokal',
    model: 'Benang Lot Tukang',
    variant: '1 Roll',
    costPrice: 3000,
    sellingPrice: 5000,
    stock: 1,
    minStockAlert: 10,
    isImeiTracked: false,
    unit: 'Roll',
  },
  {
    id: 1107,
    categoryId: 1,
    categoryName: 'Material Bangunan',
    categoryCode: 'material',
    code: 'MAT-BAK-ORN',
    name: 'Bak Adukan Cor Plastik Oranye',
    brand: 'Lokal Anti Pecah',
    model: 'Bak Adukan Semen',
    variant: '1 Pcs',
    costPrice: 15000,
    sellingPrice: 20000,
    stock: 1,
    minStockAlert: 5,
    isImeiTracked: false,
    unit: 'Biji',
  },
  {
    id: 1108,
    categoryId: 1,
    categoryName: 'Material Bangunan',
    categoryCode: 'material',
    code: 'MAT-EMB-ORN',
    name: 'Ember Cor Plastik Oranye Anti Pecah',
    brand: 'Lokal Anti Pecah',
    model: 'Ember Cor Bangunan',
    variant: '1 Pcs',
    costPrice: 6000,
    sellingPrice: 10000,
    stock: 1,
    minStockAlert: 10,
    isImeiTracked: false,
    unit: 'Biji',
  },
  {
    id: 1109,
    categoryId: 1,
    categoryName: 'Material Bangunan',
    categoryCode: 'material',
    code: 'MAT-TRP-3MM',
    name: 'Triplek Tipis 3 mm (122 x 244 cm)',
    brand: 'Sengon / Meranti',
    model: 'Triplek / Plywood 3 mm',
    variant: 'Lembar 122 x 244 cm',
    costPrice: 40000,
    sellingPrice: 50000,
    stock: 1,
    minStockAlert: 5,
    isImeiTracked: false,
    unit: 'Lembar',
  },
  {
    id: 1110,
    categoryId: 1,
    categoryName: 'Material Bangunan',
    categoryCode: 'material',
    code: 'MAT-TRP-12MM',
    name: 'Triplek / Multiplek 12 mm (122 x 244 cm)',
    brand: 'Sengon / Meranti',
    model: 'Multiplek / Plywood 12 mm',
    variant: 'Lembar 122 x 244 cm',
    costPrice: 90000,
    sellingPrice: 110000,
    stock: 1,
    minStockAlert: 5,
    isImeiTracked: false,
    unit: 'Lembar',
  },
  {
    id: 1111,
    categoryId: 1,
    categoryName: 'Material Bangunan',
    categoryCode: 'material',
    code: 'MAT-SNG-GM20',
    name: 'Seng Gelombang Gajah Mas',
    brand: 'Gajah Mas',
    model: 'Seng Gelombang BJLS',
    variant: 'Per Lembar (1 Kodi = 20 Lbr)',
    costPrice: 50000,
    sellingPrice: 75000,
    stock: 20,
    minStockAlert: 10,
    isImeiTracked: false,
    unit: 'Lembar',
  },
  {
    id: 1112,
    categoryId: 1,
    categoryName: 'Material Bangunan',
    categoryCode: 'material',
    code: 'MAT-ASB-KD20',
    name: 'Asbes Gelombang Kecil',
    brand: 'Djabesmen / Harflex',
    model: 'Asbes Gelombang',
    variant: 'Per Lembar (1 Kodi = 20 Lbr)',
    costPrice: 35000,
    sellingPrice: 50000,
    stock: 20,
    minStockAlert: 10,
    isImeiTracked: false,
    unit: 'Lembar',
  },
  {
    id: 1113,
    categoryId: 1,
    categoryName: 'Material Bangunan',
    categoryCode: 'material',
    code: 'MAT-PKU-2IN',
    name: 'Paku Kayu 2 Inch / 5 cm (1 Kg)',
    brand: 'Lokal SNI',
    model: 'Paku Kayu 2 Inch',
    variant: 'Kemasan 1 Kg',
    costPrice: 13000,
    sellingPrice: 20000,
    stock: 1,
    minStockAlert: 10,
    isImeiTracked: false,
    unit: 'Kg',
  },
  {
    id: 1114,
    categoryId: 1,
    categoryName: 'Material Bangunan',
    categoryCode: 'material',
    code: 'MAT-PKU-3IN',
    name: 'Paku Kayu 3 Inch / 7 cm (1 Kg)',
    brand: 'Lokal SNI',
    model: 'Paku Kayu 3 Inch',
    variant: 'Kemasan 1 Kg',
    costPrice: 13000,
    sellingPrice: 20000,
    stock: 1,
    minStockAlert: 10,
    isImeiTracked: false,
    unit: 'Kg',
  },
  {
    id: 1115,
    categoryId: 1,
    categoryName: 'Material Bangunan',
    categoryCode: 'material',
    code: 'MAT-PKU-4IN',
    name: 'Paku Kayu 4 Inch / 10 cm (1 Kg)',
    brand: 'Lokal SNI',
    model: 'Paku Kayu 4 Inch',
    variant: 'Kemasan 1 Kg',
    costPrice: 13000,
    sellingPrice: 20000,
    stock: 1,
    minStockAlert: 10,
    isImeiTracked: false,
    unit: 'Kg',
  },
  {
    id: 1116,
    categoryId: 1,
    categoryName: 'Material Bangunan',
    categoryCode: 'material',
    code: 'MAT-PKU-5IN',
    name: 'Paku Kayu 5 Inch / 12 cm (1 Kg)',
    brand: 'Lokal SNI',
    model: 'Paku Kayu 5 Inch',
    variant: 'Kemasan 1 Kg',
    costPrice: 13000,
    sellingPrice: 20000,
    stock: 1,
    minStockAlert: 10,
    isImeiTracked: false,
    unit: 'Kg',
  },
  {
    id: 1117,
    categoryId: 1,
    categoryName: 'Material Bangunan',
    categoryCode: 'material',
    code: 'MAT-PKU-SENG',
    name: 'Paku Seng / Paku Payung (1 Kotak)',
    brand: 'Lokal SNI',
    model: 'Paku Payung Seng',
    variant: '1 Kotak',
    costPrice: 17000,
    sellingPrice: 30000,
    stock: 1,
    minStockAlert: 10,
    isImeiTracked: false,
    unit: 'Kotak',
  },
  {
    id: 1118,
    categoryId: 1,
    categoryName: 'Material Bangunan',
    categoryCode: 'material',
    code: 'MAT-PKU-TRPLK',
    name: 'Paku Triplek / Paku Halus (1 Kotak)',
    brand: 'Lokal SNI',
    model: 'Paku Triplek',
    variant: '1 Kotak',
    costPrice: 17000,
    sellingPrice: 30000,
    stock: 1,
    minStockAlert: 10,
    isImeiTracked: false,
    unit: 'Kotak',
  },
];

export async function seedRequestedMaterialsOnce(): Promise<void> {
  if (isSeedingCustomMaterials) return;
  if (
    typeof window !== 'undefined' &&
    window.localStorage?.getItem(CUSTOM_MATERIAL_SEED_LOCAL_KEY) === '1' &&
    window.localStorage?.getItem(CUSTOM_MATERIAL_LEMBAR_LOCAL_KEY) === '1'
  ) {
    return;
  }

  isSeedingCustomMaterials = true;
  try {
    const metaRef = doc(db, APP_META_COLLECTION, CUSTOM_MATERIAL_SEED_DOC_ID);
    const lembarMetaRef = doc(db, APP_META_COLLECTION, CUSTOM_MATERIAL_LEMBAR_DOC_ID);
    const [metaSnap, lembarMetaSnap] = await Promise.all([
      getDoc(metaRef),
      getDoc(lembarMetaRef),
    ]);

    if (metaSnap.exists() && lembarMetaSnap.exists()) {
      if (typeof window !== 'undefined') {
        window.localStorage?.setItem(CUSTOM_MATERIAL_SEED_LOCAL_KEY, '1');
        window.localStorage?.setItem(CUSTOM_MATERIAL_LEMBAR_LOCAL_KEY, '1');
      }
      return;
    }

    const colRef = collection(db, MATERIALS_COLLECTION);
    const existingSnap = await getDocs(colRef);
    const docsByCode = new Map<string, (typeof existingSnap.docs)[number]>();
    const existingNames = new Set<string>();
    existingSnap.docs.forEach((d) => {
      const codeKey = String(d.data().code || '').trim().toUpperCase();
      if (codeKey) docsByCode.set(codeKey, d);
      const nameKey = String(d.data().name || '').trim().toLowerCase();
      if (nameKey) existingNames.add(nameKey);
    });

    const now = new Date().toISOString();
    const batch = writeBatch(db);
    let insertedCount = 0;

    if (!metaSnap.exists()) {
      REQUESTED_MATERIAL_BATCH.forEach((item) => {
        const codeKey = item.code.trim().toUpperCase();
        const nameKey = item.name.trim().toLowerCase();
        if (docsByCode.has(codeKey) || existingNames.has(nameKey)) {
          return;
        }
        const targetDocRef = doc(colRef, item.code);
        batch.set(targetDocRef, {
          ...item,
          numericId: item.id,
          createdAt: now,
          updatedAt: now,
        });
        insertedCount++;
      });

      batch.set(metaRef, {
        seeded: true,
        seededAt: now,
        insertedCount,
      });
    }

    if (!lembarMetaSnap.exists()) {
      const targetConversions: Array<{
        code: string;
        name: string;
        variant: string;
        costPrice: number;
        sellingPrice: number;
        minStockAlert: number;
      }> = [
        {
          code: 'MAT-SNG-GM20',
          name: 'Seng Gelombang Gajah Mas',
          variant: 'Per Lembar (1 Kodi = 20 Lbr)',
          costPrice: 50000,
          sellingPrice: 75000,
          minStockAlert: 10,
        },
        {
          code: 'MAT-ASB-KD20',
          name: 'Asbes Gelombang Kecil',
          variant: 'Per Lembar (1 Kodi = 20 Lbr)',
          costPrice: 35000,
          sellingPrice: 50000,
          minStockAlert: 10,
        },
      ];

      targetConversions.forEach((target) => {
        const existingDoc = docsByCode.get(target.code);
        if (existingDoc) {
          const data = existingDoc.data();
          const currentUnit = String(data.unit || '').trim().toLowerCase();
          const currentStock = Number(data.stock || 0);
          const convertedStock = currentUnit === 'kodi' ? currentStock * 20 : currentStock;

          batch.update(existingDoc.ref, {
            name: target.name,
            variant: target.variant,
            unit: 'Lembar',
            costPrice: target.costPrice,
            sellingPrice: target.sellingPrice,
            stock: convertedStock,
            minStockAlert: target.minStockAlert,
            updatedAt: now,
          });
        }
      });

      batch.set(lembarMetaRef, {
        migrated: true,
        migratedAt: now,
        unit: 'Lembar',
      });
    }

    await batch.commit();

    if (typeof window !== 'undefined') {
      window.localStorage?.setItem(CUSTOM_MATERIAL_SEED_LOCAL_KEY, '1');
      window.localStorage?.setItem(CUSTOM_MATERIAL_LEMBAR_LOCAL_KEY, '1');
    }
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.WRITE, MATERIALS_COLLECTION);
    }
    console.warn('Notice one-time seeding custom stok_material:', err);
  } finally {
    isSeedingCustomMaterials = false;
  }
}

export function subscribeMaterials(
  onSuccess: (items: Product[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const colRef = collection(db, MATERIALS_COLLECTION);

  return onSnapshot(
    colRef,
    (snapshot) => {
      if (snapshot.empty) {
        // Jangan pernah melakukan auto-seeding ulang jika kosong.
        // Kirim array kosong agar tabel benar-benar 0 / kosong.
        onSuccess([]);
        return;
      }

      const items: Product[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: data.numericId || docSnap.id,
          docId: docSnap.id,
          categoryId: 1,
          categoryName: data.categoryName || 'Material Bangunan',
          categoryCode: 'material',
          code: data.code || '',
          name: data.name || '',
          brand: data.brand || '',
          model: data.model || '',
          variant: data.variant || '',
          costPrice: Number(data.costPrice || 0),
          sellingPrice: Number(data.sellingPrice || 0),
          stock: Number(data.stock || 0),
          minStockAlert: Number(data.minStockAlert || 10),
          isImeiTracked: false,
          unit: data.unit || 'Sak',
          createdAt: data.createdAt || new Date().toISOString(),
        };
      });

      items.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
      onSuccess(items);
    },
    (err) => {
      console.warn('Notice listening to stok_material Firestore:', err);
      // Jangan fallback ke data mock saat terjadi error / offline
      onSuccess([]);
      if (onError) onError(err);
    }
  );
}

export async function createMaterialCloud(
  item: Omit<Product, 'id' | 'createdAt'>
): Promise<string> {
  const createdAt = new Date().toISOString();
  const numericId = Date.now();

  try {
    const docRef = await addDoc(
      collection(db, MATERIALS_COLLECTION),
      sanitizeForFirestore({
        ...item,
        categoryId: 1,
        categoryName: 'Material Bangunan',
        categoryCode: 'material',
        numericId,
        createdAt,
        updatedAt: createdAt,
      })
    );

    return docRef.id;
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.CREATE, MATERIALS_COLLECTION);
    }
    throw err;
  }
}

export async function updateMaterialStockCloud(
  docId: string,
  newStock: number
): Promise<void> {
  try {
    const itemDoc = doc(db, MATERIALS_COLLECTION, docId);
    await updateDoc(itemDoc, {
      stock: newStock,
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.UPDATE, `${MATERIALS_COLLECTION}/${docId}`);
    }
    throw err;
  }
}

export async function updateMaterialCloud(
  docId: string,
  item: Partial<Product>
): Promise<void> {
  try {
    const itemDoc = doc(db, MATERIALS_COLLECTION, docId);
    await updateDoc(
      itemDoc,
      sanitizeForFirestore({
        ...item,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.UPDATE, `${MATERIALS_COLLECTION}/${docId}`);
    }
    throw err;
  }
}

export async function deleteMaterialCloud(docId: string): Promise<void> {
  try {
    const itemDoc = doc(db, MATERIALS_COLLECTION, docId);
    await deleteDoc(itemDoc);
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.DELETE, `${MATERIALS_COLLECTION}/${docId}`);
    }
    throw err;
  }
}

// ==========================================
// 2. MODUL PUPUK & PRODUK PERTANIAN (CLOUD FIRESTORE)
// ==========================================

export async function seedInitialFertilizersIfEmpty(): Promise<void> {
  // Auto-seeding mock massal dinonaktifkan: Jika tabel kosong atau user menghapus semua data,
  // data tidak diisi ulang secara otomatis dari mockData.
  return;
}

const REQUESTED_FERTILIZER_BATCH: Array<Omit<Product, 'createdAt'>> = [
  {
    id: 2101,
    categoryId: 2,
    categoryName: 'Pupuk',
    categoryCode: 'pupuk',
    code: 'PPK-PHONSKA50',
    name: 'Pupuk NPK Phonska 15-15-15 (50 Kg)',
    brand: 'Petrokimia Gresik',
    model: 'NPK Phonska Majemuk 15-15-15',
    variant: 'Sak 50 Kg',
    costPrice: 180000,
    sellingPrice: 200000,
    stock: 1,
    minStockAlert: 5,
    isImeiTracked: false,
    unit: 'Sak 50 Kg',
  },
  {
    id: 2102,
    categoryId: 2,
    categoryName: 'Pupuk',
    categoryCode: 'pupuk',
    code: 'PPK-UREA50',
    name: 'Pupuk Urea Prill 46% N (50 Kg)',
    brand: 'Petrokimia Gresik / Pusri',
    model: 'Urea Prill 46% N',
    variant: 'Sak 50 Kg',
    costPrice: 205000,
    sellingPrice: 225000,
    stock: 1,
    minStockAlert: 5,
    isImeiTracked: false,
    unit: 'Sak 50 Kg',
  },
  {
    id: 2103,
    categoryId: 2,
    categoryName: 'Pupuk',
    categoryCode: 'pupuk',
    code: 'PPK-KCL-MRK',
    name: 'Pupuk KCl Meroke MOP (50 Kg)',
    brand: 'Meroke Tetap Jaya',
    model: 'MerokeMOP (KCl 60% K2O)',
    variant: 'Sak 50 Kg',
    costPrice: 425000,
    sellingPrice: 445000,
    stock: 1,
    minStockAlert: 5,
    isImeiTracked: false,
    unit: 'Sak 50 Kg',
  },
  {
    id: 2104,
    categoryId: 2,
    categoryName: 'Pupuk',
    categoryCode: 'pupuk',
    code: 'PPK-MTR-MRK',
    name: 'Pupuk NPK Mutiara 16-16-16 Meroke (50 Kg)',
    brand: 'Meroke Tetap Jaya',
    model: 'NPK Mutiara 16-16-16 Biru',
    variant: 'Sak 50 Kg',
    costPrice: 855000,
    sellingPrice: 875000,
    stock: 1,
    minStockAlert: 5,
    isImeiTracked: false,
    unit: 'Sak 50 Kg',
  },
  {
    id: 2105,
    categoryId: 2,
    categoryName: 'Pupuk',
    categoryCode: 'pupuk',
    code: 'PPK-LAOYING50',
    name: 'Pupuk NPK Lao Ying 16-16-16 (50 Kg)',
    brand: 'Lao Ying (Mestindo)',
    model: 'NPK Mutiara Lao Ying 16-16-16',
    variant: 'Sak 50 Kg',
    costPrice: 730000,
    sellingPrice: 750000,
    stock: 1,
    minStockAlert: 5,
    isImeiTracked: false,
    unit: 'Sak 50 Kg',
  },
  {
    id: 2106,
    categoryId: 2,
    categoryName: 'Pupuk',
    categoryCode: 'pupuk',
    code: 'PPK-DLMT-KBM',
    name: 'Pupuk Kapur Pertanian Dolomit Kebomas (50 Kg)',
    brand: 'Petrokimia Gresik (Kebomas)',
    model: 'Dolomit Super Kebomas',
    variant: 'Sak 50 Kg',
    costPrice: 40000,
    sellingPrice: 60000,
    stock: 1,
    minStockAlert: 5,
    isImeiTracked: false,
    unit: 'Sak 50 Kg',
  },
];

export async function seedRequestedFertilizersOnce(): Promise<void> {
  if (isSeedingCustomFertilizers) return;
  if (
    typeof window !== 'undefined' &&
    window.localStorage?.getItem(CUSTOM_FERTILIZER_SEED_LOCAL_KEY) === '1' &&
    window.localStorage?.getItem(CUSTOM_FERTILIZER_UNIT_LOCAL_KEY) === '1'
  ) {
    return;
  }

  isSeedingCustomFertilizers = true;
  try {
    const metaRef = doc(db, APP_META_COLLECTION, CUSTOM_FERTILIZER_SEED_DOC_ID);
    const unitMetaRef = doc(db, APP_META_COLLECTION, CUSTOM_FERTILIZER_UNIT_DOC_ID);
    const [metaSnap, unitMetaSnap] = await Promise.all([
      getDoc(metaRef),
      getDoc(unitMetaRef),
    ]);

    if (metaSnap.exists() && unitMetaSnap.exists()) {
      if (typeof window !== 'undefined') {
        window.localStorage?.setItem(CUSTOM_FERTILIZER_SEED_LOCAL_KEY, '1');
        window.localStorage?.setItem(CUSTOM_FERTILIZER_UNIT_LOCAL_KEY, '1');
      }
      return;
    }

    const colRef = collection(db, FERTILIZERS_COLLECTION);
    const existingSnap = await getDocs(colRef);
    const docsByCode = new Map<string, (typeof existingSnap.docs)[number]>();
    const existingNames = new Set<string>();
    existingSnap.docs.forEach((d) => {
      const codeKey = String(d.data().code || '').trim().toUpperCase();
      if (codeKey) docsByCode.set(codeKey, d);
      const nameKey = String(d.data().name || '').trim().toLowerCase();
      if (nameKey) existingNames.add(nameKey);
    });

    const now = new Date().toISOString();
    const batch = writeBatch(db);
    let insertedCount = 0;

    if (!metaSnap.exists()) {
      REQUESTED_FERTILIZER_BATCH.forEach((item) => {
        const codeKey = item.code.trim().toUpperCase();
        const nameKey = item.name.trim().toLowerCase();
        if (docsByCode.has(codeKey) || existingNames.has(nameKey)) {
          return;
        }
        const targetDocRef = doc(colRef, item.code);
        batch.set(targetDocRef, {
          ...item,
          numericId: item.id,
          createdAt: now,
          updatedAt: now,
        });
        insertedCount++;
      });

      batch.set(metaRef, {
        seeded: true,
        seededAt: now,
        insertedCount,
      });
    }

    if (!unitMetaSnap.exists()) {
      REQUESTED_FERTILIZER_BATCH.forEach((item) => {
        const codeKey = item.code.trim().toUpperCase();
        const existingDoc = docsByCode.get(codeKey);
        if (existingDoc) {
          batch.update(existingDoc.ref, {
            unit: 'Sak 50 Kg',
            variant: 'Sak 50 Kg',
            updatedAt: now,
          });
        }
      });

      batch.set(unitMetaRef, {
        migrated: true,
        migratedAt: now,
        unit: 'Sak 50 Kg',
      });
    }

    await batch.commit();

    if (typeof window !== 'undefined') {
      window.localStorage?.setItem(CUSTOM_FERTILIZER_SEED_LOCAL_KEY, '1');
      window.localStorage?.setItem(CUSTOM_FERTILIZER_UNIT_LOCAL_KEY, '1');
    }
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.WRITE, FERTILIZERS_COLLECTION);
    }
    console.warn('Notice one-time seeding custom stok_pupuk:', err);
  } finally {
    isSeedingCustomFertilizers = false;
  }
}

export function normalizeFertilizerCode(code: string): string {
  const trimmed = (code || '').trim();
  if (!trimmed) return '';
  const withoutAgr = trimmed.replace(/^AGR-?/i, '').trim();
  if (/^PPK(?:-|$)/i.test(withoutAgr)) {
    return withoutAgr.replace(/^ppk/i, 'PPK');
  }
  if (/^AGR-?/i.test(trimmed)) {
    return withoutAgr ? `PPK-${withoutAgr}` : 'PPK';
  }
  return trimmed;
}

export function subscribeFertilizers(
  onSuccess: (items: Product[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const colRef = collection(db, FERTILIZERS_COLLECTION);

  return onSnapshot(
    colRef,
    (snapshot) => {
      if (snapshot.empty) {
        // Jangan pernah melakukan auto-seeding ulang jika kosong.
        // Kirim array kosong agar tabel benar-benar 0 / kosong.
        onSuccess([]);
        return;
      }

      const nonFertilizerRegex = /(insektisida|pestisida|herbisida|fungisida|benih|bibit|regent|roundup|decis|antracol|gramoxone|agristik|pioneer|ciherang)/i;
      const legacyCodeUpdates: Array<{ ref: ReturnType<typeof doc>; code: string }> = [];

      const items: Product[] = snapshot.docs
        .filter((docSnap) => {
          const data = docSnap.data();
          const str = `${data.name || ''} ${data.code || ''} ${data.categoryName || ''}`;
          if (nonFertilizerRegex.test(str)) {
            // Delete legacy non-fertilizer item asynchronously if permission allows
            deleteDoc(doc(db, FERTILIZERS_COLLECTION, docSnap.id)).catch(() => {});
            return false;
          }
          return true;
        })
        .map((docSnap) => {
          const data = docSnap.data();
          const rawCode = String(data.code || '');
          const normalizedCode = normalizeFertilizerCode(rawCode);

          if (rawCode && normalizedCode && rawCode !== normalizedCode) {
            legacyCodeUpdates.push({
              ref: doc(db, FERTILIZERS_COLLECTION, docSnap.id),
              code: normalizedCode,
            });
          }

          return {
            id: data.numericId || docSnap.id,
            docId: docSnap.id,
            categoryId: 2,
            categoryName: 'Pupuk',
            categoryCode: 'pupuk',
            code: normalizedCode,
            name: data.name || '',
            brand: data.brand || '',
            model: data.model || '',
            variant: data.variant || '',
            costPrice: Number(data.costPrice || 0),
            sellingPrice: Number(data.sellingPrice || 0),
            stock: Number(data.stock || 0),
            minStockAlert: Number(data.minStockAlert || 5),
            isImeiTracked: false,
            unit: data.unit || 'Karung',
            createdAt: data.createdAt || new Date().toISOString(),
          };
        });

      if (legacyCodeUpdates.length > 0) {
        const batch = writeBatch(db);
        const now = new Date().toISOString();
        legacyCodeUpdates.forEach((entry) => {
          batch.update(entry.ref, { code: entry.code, updatedAt: now });
        });
        batch.commit().catch((err) => {
          console.warn('Notice normalizing legacy fertilizer SKU in Firestore:', err);
        });
      }

      items.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
      onSuccess(items);
    },
    (err) => {
      console.warn('Notice listening to stok_pupuk Firestore:', err);
      // Jangan fallback ke data mock saat terjadi error / offline
      onSuccess([]);
      if (onError) onError(err);
    }
  );
}

export async function createFertilizerCloud(
  item: Omit<Product, 'id' | 'createdAt'>
): Promise<string> {
  const createdAt = new Date().toISOString();
  const numericId = Date.now();
  const normalizedCode = normalizeFertilizerCode(item.code) || `PPK-${numericId.toString().slice(-4)}`;

  try {
    const docRef = await addDoc(
      collection(db, FERTILIZERS_COLLECTION),
      sanitizeForFirestore({
        ...item,
        code: normalizedCode,
        categoryId: 2,
        categoryName: 'Pupuk',
        categoryCode: 'pupuk',
        numericId,
        createdAt,
        updatedAt: createdAt,
      })
    );

    return docRef.id;
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.CREATE, FERTILIZERS_COLLECTION);
    }
    throw err;
  }
}

export async function updateFertilizerStockCloud(
  docId: string,
  newStock: number
): Promise<void> {
  try {
    const itemDoc = doc(db, FERTILIZERS_COLLECTION, docId);
    await updateDoc(itemDoc, {
      stock: newStock,
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.UPDATE, `${FERTILIZERS_COLLECTION}/${docId}`);
    }
    throw err;
  }
}

export async function updateFertilizerCloud(
  docId: string,
  item: Partial<Product>
): Promise<void> {
  try {
    const itemDoc = doc(db, FERTILIZERS_COLLECTION, docId);
    const payload: Partial<Product> & { updatedAt: string } = {
      ...item,
      updatedAt: new Date().toISOString(),
    };
    if (typeof item.code === 'string') {
      payload.code = normalizeFertilizerCode(item.code);
    }
    await updateDoc(itemDoc, sanitizeForFirestore(payload));
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.UPDATE, `${FERTILIZERS_COLLECTION}/${docId}`);
    }
    throw err;
  }
}

export async function deleteFertilizerCloud(docId: string): Promise<void> {
  try {
    const itemDoc = doc(db, FERTILIZERS_COLLECTION, docId);
    await deleteDoc(itemDoc);
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.DELETE, `${FERTILIZERS_COLLECTION}/${docId}`);
    }
    throw err;
  }
}

// ==========================================
// 3. MODUL PERTANIAN / OBAT HAMA (CLOUD FIRESTORE)
// ==========================================

export async function seedInitialAgricultureOnce(): Promise<void> {
  if (isSeedingAgriculture) return;
  if (typeof window !== 'undefined' && localStorage.getItem(AGRICULTURE_SEED_LOCAL_KEY) === '1') {
    return;
  }

  isSeedingAgriculture = true;
  try {
    const metaRef = doc(db, APP_META_COLLECTION, AGRICULTURE_SEED_DOC_ID);
    const metaSnap = await getDoc(metaRef);
    if (metaSnap.exists()) {
      if (typeof window !== 'undefined') {
        localStorage.setItem(AGRICULTURE_SEED_LOCAL_KEY, '1');
      }
      return;
    }

    const colRef = collection(db, AGRICULTURE_COLLECTION);
    const existingSnap = await getDocs(colRef);
    const now = new Date().toISOString();

    if (existingSnap.empty) {
      const batch = writeBatch(db);
      INITIAL_MOCK_AGRICULTURE.forEach((item) => {
        const newDocRef = doc(colRef);
        batch.set(newDocRef, {
          ...item,
          categoryId: 3,
          categoryName: 'Pertanian',
          categoryCode: 'pertanian',
          numericId: item.id,
          createdAt: now,
          updatedAt: now,
        });
      });
      batch.set(metaRef, { seeded: true, seededAt: now });
      await batch.commit();
    } else {
      await setDoc(metaRef, { seeded: true, seededAt: now });
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem(AGRICULTURE_SEED_LOCAL_KEY, '1');
    }
  } catch (err) {
    console.warn('Notice one-time seeding stok_pertanian:', err);
  } finally {
    isSeedingAgriculture = false;
  }
}

export async function seedSampleAgricultureManually(): Promise<void> {
  try {
    const colRef = collection(db, AGRICULTURE_COLLECTION);
    const metaRef = doc(db, APP_META_COLLECTION, AGRICULTURE_SEED_DOC_ID);
    const now = new Date().toISOString();
    const batch = writeBatch(db);

    INITIAL_MOCK_AGRICULTURE.forEach((item) => {
      const newDocRef = doc(colRef);
      batch.set(newDocRef, {
        ...item,
        categoryId: 3,
        categoryName: 'Pertanian',
        categoryCode: 'pertanian',
        numericId: Date.now() + item.id,
        createdAt: now,
        updatedAt: now,
      });
    });
    batch.set(metaRef, { seeded: true, seededAt: now });
    await batch.commit();

    if (typeof window !== 'undefined') {
      localStorage.setItem(AGRICULTURE_SEED_LOCAL_KEY, '1');
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, AGRICULTURE_COLLECTION);
  }
}

export function subscribeAgriculture(
  onSuccess: (items: Product[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const colRef = collection(db, AGRICULTURE_COLLECTION);

  return onSnapshot(
    colRef,
    (snapshot) => {
      if (snapshot.empty) {
        onSuccess([]);
        return;
      }

      const items: Product[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: data.numericId || docSnap.id,
          docId: docSnap.id,
          categoryId: 3,
          categoryName: data.categoryName || 'Pertanian',
          categoryCode: 'pertanian',
          code: data.code || '',
          name: data.name || '',
          brand: data.brand || '',
          model: data.model || '',
          variant: data.variant || '',
          costPrice: Number(data.costPrice || 0),
          sellingPrice: Number(data.sellingPrice || 0),
          stock: Number(data.stock || 0),
          minStockAlert: Number(data.minStockAlert || 5),
          isImeiTracked: false,
          unit: data.unit || 'Botol',
          createdAt: data.createdAt || new Date().toISOString(),
        };
      });

      items.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
      onSuccess(items);
    },
    (err) => {
      console.warn('Notice listening to stok_pertanian Firestore:', err);
      onSuccess([]);
      if (onError) onError(err);
    }
  );
}

export async function createAgricultureCloud(
  item: Omit<Product, 'id' | 'createdAt'>
): Promise<string> {
  const createdAt = new Date().toISOString();
  const numericId = Date.now();

  try {
    const docRef = await addDoc(collection(db, AGRICULTURE_COLLECTION), {
      ...item,
      categoryId: 3,
      categoryName: 'Pertanian',
      categoryCode: 'pertanian',
      numericId,
      createdAt,
      updatedAt: createdAt,
    });

    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, AGRICULTURE_COLLECTION);
  }
}

export async function updateAgricultureStockCloud(
  docId: string,
  newStock: number
): Promise<void> {
  try {
    const itemDoc = doc(db, AGRICULTURE_COLLECTION, docId);
    await updateDoc(itemDoc, {
      stock: newStock,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `${AGRICULTURE_COLLECTION}/${docId}`);
  }
}

export async function updateAgricultureCloud(
  docId: string,
  item: Partial<Product>
): Promise<void> {
  try {
    const itemDoc = doc(db, AGRICULTURE_COLLECTION, docId);
    await updateDoc(itemDoc, {
      ...item,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `${AGRICULTURE_COLLECTION}/${docId}`);
  }
}

export async function deleteAgricultureCloud(docId: string): Promise<void> {
  try {
    const itemDoc = doc(db, AGRICULTURE_COLLECTION, docId);
    await deleteDoc(itemDoc);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${AGRICULTURE_COLLECTION}/${docId}`);
  }
}

export async function bulkDeleteAgricultureCloud(docIds: string[]): Promise<void> {
  if (docIds.length === 0) return;
  try {
    const chunkSize = 450;
    for (let i = 0; i < docIds.length; i += chunkSize) {
      const chunk = docIds.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach((id) => {
        batch.delete(doc(db, AGRICULTURE_COLLECTION, id));
      });
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, AGRICULTURE_COLLECTION);
  }
}

// ==========================================
// 4. CHECKOUT & TRANSAKSI DI CLOUD FIRESTORE
// ==========================================

export async function syncCheckoutToFirestore(
  sale: Sale,
  cartItems: Array<{ product: Product; quantity: number }>
): Promise<void> {
  try {
    // 1. Simpan nota penjualan ke Firestore (sanitasi field undefined agar setDoc aman)
    const saleDocRef = doc(db, SALES_COLLECTION, sale.invoiceNumber);
    const cleanedSale = sanitizeForFirestore({
      ...sale,
      syncedAt: new Date().toISOString(),
    });
    await setDoc(saleDocRef, cleanedSale);

    // 2. Kurangi stok material, pupuk, atau obat pertanian di Firestore
    for (const item of cartItems) {
      const prod = item.product;
      const qty = item.quantity;
      const isPertanian =
        prod.categoryId === 3 ||
        prod.categoryCode === 'pertanian' ||
        Boolean(prod.categoryName?.toLowerCase().includes('pertanian'));
      const isPupuk =
        !isPertanian &&
        (prod.categoryId === 2 ||
          prod.categoryCode === 'pupuk' ||
          Boolean(prod.categoryName?.toLowerCase().includes('pupuk')));

      const targetCol = isPertanian
        ? AGRICULTURE_COLLECTION
        : isPupuk
        ? FERTILIZERS_COLLECTION
        : MATERIALS_COLLECTION;

      if (prod.docId) {
        const itemRef = doc(db, targetCol, prod.docId);
        const newStock = Math.max(0, prod.stock - qty);
        await updateDoc(itemRef, {
          stock: newStock,
          updatedAt: new Date().toISOString(),
        }).catch(() => {});
      }
    }
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.WRITE, `${SALES_COLLECTION}/${sale.invoiceNumber}`);
    }
    console.warn('Notice syncing checkout to Firestore:', err);
  }
}

export async function recordDebtPaymentCloud(
  invoiceNumber: string,
  payment: DebtPaymentRecord,
  fallbackSale?: Sale
): Promise<Sale> {
  const saleDocRef = doc(db, SALES_COLLECTION, invoiceNumber);
  try {
    const updatedSale = await runTransaction(db, async (tx) => {
      const snap = await tx.get(saleDocRef);
      const baseRaw = snap.exists() ? snap.data() : fallbackSale;
      if (!baseRaw) {
        throw new Error(`Faktur ${invoiceNumber} tidak ditemukan di database.`);
      }

      const currentSale = normalizeSaleRecord(baseRaw);
      const currentRemaining = Math.max(0, currentSale.remainingDebt ?? 0);
      if (currentRemaining <= 0) {
        throw new Error('Faktur ini sudah berstatus Lunas.');
      }

      const appliedAmount = Math.min(Math.max(0, Math.round(payment.amount)), currentRemaining);
      if (appliedAmount <= 0) {
        throw new Error('Nominal pembayaran harus lebih dari Rp 0.');
      }

      const cleanPayment = sanitizeForFirestore({
        ...payment,
        amount: appliedAmount,
      });

      const nextHistory = [...(currentSale.paymentHistory || []), cleanPayment];
      const nextPaidTotal = Math.min(
        currentSale.grandTotal,
        (currentSale.paidTotal || 0) + appliedAmount
      );
      const nextRemaining = Math.max(0, currentSale.grandTotal - nextPaidTotal);
      const nextStatus: 'paid' | 'partial' | 'unpaid' =
        nextRemaining <= 0 ? 'paid' : nextPaidTotal > 0 ? 'partial' : 'unpaid';
      const nowIso = new Date().toISOString();

      const merged: Sale = {
        ...currentSale,
        paidTotal: nextPaidTotal,
        remainingDebt: nextRemaining,
        amountPaid: nextPaidTotal,
        paymentStatus: nextStatus,
        paymentHistory: nextHistory,
        settledAt: nextRemaining <= 0 ? cleanPayment.paidAt || nowIso : currentSale.settledAt,
      };

      tx.set(
        saleDocRef,
        sanitizeForFirestore({
          ...merged,
          updatedAt: nowIso,
        }),
        { merge: true }
      );

      return merged;
    });

    return updatedSale;
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.UPDATE, `${SALES_COLLECTION}/${invoiceNumber}`);
    }
    throw err;
  }
}

export async function fetchAllSalesCloud(): Promise<Sale[]> {
  try {
    const q = query(collection(db, SALES_COLLECTION), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    const list: Sale[] = [];
    snap.forEach((d) => {
      list.push(normalizeSaleRecord(d.data()));
    });
    return list;
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.LIST, SALES_COLLECTION);
    }
    throw err;
  }
}

export async function fetchAllExpensesCloud(): Promise<StoreExpense[]> {
  try {
    const q = query(collection(db, EXPENSES_COLLECTION), orderBy('expenseDate', 'desc'));
    const snap = await getDocs(q);
    const list: StoreExpense[] = [];
    snap.forEach((d) => {
      const data = d.data();
      list.push({
        id: data.numericId || d.id,
        docId: d.id,
        category: data.category || 'lainnya',
        title: data.title || '',
        amount: Number(data.amount || 0),
        expenseDate: data.expenseDate || new Date().toISOString().slice(0, 10),
        paidBy: data.paidBy || 'cash',
        notes: data.notes,
        createdAt: data.createdAt || new Date().toISOString(),
      });
    });
    return list;
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.LIST, EXPENSES_COLLECTION);
    }
    console.warn('Notice fetching expenses from Firestore:', err);
    return [];
  }
}

export async function createExpenseCloud(
  payload: Omit<StoreExpense, 'id' | 'createdAt' | 'docId'>
): Promise<StoreExpense> {
  const now = new Date().toISOString();
  const numericId = Date.now();
  try {
    const docRef = await addDoc(
      collection(db, EXPENSES_COLLECTION),
      sanitizeForFirestore({
        ...payload,
        numericId,
        createdAt: now,
        updatedAt: now,
      })
    );
    return {
      id: numericId,
      docId: docRef.id,
      ...payload,
      createdAt: now,
    };
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.CREATE, EXPENSES_COLLECTION);
    }
    throw err;
  }
}

export async function deleteExpenseCloud(docId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, EXPENSES_COLLECTION, docId));
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.DELETE, `${EXPENSES_COLLECTION}/${docId}`);
    }
    throw err;
  }
}

export async function ensureCloudInventorySeeded(): Promise<void> {
  // Auto-seeding material & pupuk dinonaktifkan agar tabel kosong tetap kosong.
  return;
}

export async function restoreStockFromSaleCloud(items: any[]): Promise<void> {
  try {
    for (const item of items) {
      const code = item.productCode || item.code || '';
      const qty = Number(item.quantity || 1);
      const catLower = (item.categoryCode || item.productCategory || '').toLowerCase();
      const nameLower = (item.productName || item.name || '').toLowerCase();

      const isPertanian =
        catLower === 'pertanian' ||
        catLower.includes('pertanian') ||
        code.toUpperCase().startsWith('PRT-');

      const isPupuk =
        !isPertanian &&
        (catLower === 'pupuk' ||
          catLower.includes('pupuk') ||
          nameLower.includes('pupuk') ||
          code.toUpperCase().includes('PPK-'));

      const colName = isPertanian
        ? AGRICULTURE_COLLECTION
        : isPupuk
        ? FERTILIZERS_COLLECTION
        : MATERIALS_COLLECTION;

      const colRef = collection(db, colName);
      const lookupCode = isPupuk ? normalizeFertilizerCode(code) : code;
      let snap = lookupCode ? await getDocs(query(colRef, where('code', '==', lookupCode))) : null;
      if ((!snap || snap.empty) && code && code !== lookupCode) {
        snap = await getDocs(query(colRef, where('code', '==', code)));
      }
      if ((!snap || snap.empty) && item.productName) {
        snap = await getDocs(query(colRef, where('name', '==', item.productName)));
      }

      if (snap && !snap.empty) {
        const docSnap = snap.docs[0];
        const currentStock = Number(docSnap.data().stock || 0);
        await updateDoc(docSnap.ref, {
          stock: currentStock + qty,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  } catch (err) {
    console.warn('Notice restoring stock to Cloud Firestore:', err);
  }
}

// Backward-compatibility aliases for existing modules
export const subscribeAccessories = subscribeMaterials;
export const subscribePhones = subscribeFertilizers;
export const fetchAvailableSerialsCloud = async () => [];
export const updateAccessoryStockCloud = updateMaterialStockCloud;
export const updatePhoneStockCloud = updateFertilizerStockCloud;

