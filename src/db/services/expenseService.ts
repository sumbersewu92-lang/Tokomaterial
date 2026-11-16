import { db, isSqlConfigured } from '../index.ts';
import { storeExpenses } from '../schema.ts';
import { desc, eq, and, gte, lte } from 'drizzle-orm';

export interface CreateExpensePayload {
  category: string; // 'sewa_tempat' | 'listrik_air' | 'koneksi_internet' | 'gaji_karyawan' | 'atk_nota_kertas' | 'kredit_tool_server' | 'operasional_harian' | 'lainnya'
  title: string;
  amount: number;
  expenseDate: string; // YYYY-MM-DD
  paidBy?: string;
  notes?: string;
}

let _inMemoryExpenses: any[] = [];

export async function createExpense(payload: CreateExpensePayload) {
  if (!isSqlConfigured) {
    const newExp = {
      id: Date.now(),
      category: payload.category,
      title: payload.title,
      amount: payload.amount,
      expenseDate: payload.expenseDate,
      paidBy: payload.paidBy || 'cash',
      notes: payload.notes || null,
      createdAt: new Date(),
    };
    _inMemoryExpenses.unshift(newExp);
    return newExp;
  }
  try {
    const [expense] = await db
      .insert(storeExpenses)
      .values({
        category: payload.category,
        title: payload.title,
        amount: payload.amount,
        expenseDate: payload.expenseDate,
        paidBy: payload.paidBy || 'cash',
        notes: payload.notes || null,
      })
      .returning();

    return expense;
  } catch (error) {
    console.error('Failed to create store expense:', error);
    throw new Error('Gagal mencatat pengeluaran operasional toko', { cause: error });
  }
}

export async function getExpenses(filter?: {
  startDate?: string;
  endDate?: string;
  category?: string;
}) {
  if (!isSqlConfigured) {
    let result = [..._inMemoryExpenses];
    if (filter?.category && filter.category !== 'all') {
      result = result.filter((e) => e.category === filter.category);
    }
    if (filter?.startDate) {
      result = result.filter((e) => e.expenseDate >= filter.startDate!);
    }
    if (filter?.endDate) {
      result = result.filter((e) => e.expenseDate <= filter.endDate!);
    }
    return result;
  }
  try {
    const conditions = [];

    if (filter?.category && filter.category !== 'all') {
      conditions.push(eq(storeExpenses.category, filter.category));
    }
    if (filter?.startDate) {
      conditions.push(gte(storeExpenses.expenseDate, filter.startDate));
    }
    if (filter?.endDate) {
      conditions.push(lte(storeExpenses.expenseDate, filter.endDate));
    }

    const query = db
      .select()
      .from(storeExpenses)
      .orderBy(desc(storeExpenses.expenseDate), desc(storeExpenses.id));

    return conditions.length > 0 ? await query.where(and(...conditions)) : await query;
  } catch (error) {
    console.error('Failed to get expenses:', error);
    return [];
  }
}

export async function deleteExpense(id: number) {
  if (!isSqlConfigured) {
    _inMemoryExpenses = _inMemoryExpenses.filter((e) => e.id !== id);
    return true;
  }
  try {
    await db.delete(storeExpenses).where(eq(storeExpenses.id, id));
    return true;
  } catch (error) {
    console.error('Failed to delete expense:', error);
    return false;
  }
}
