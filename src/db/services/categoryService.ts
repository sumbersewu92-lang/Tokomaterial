import { db, isSqlConfigured } from '../index.ts';
import { categories } from '../schema.ts';
import { asc } from 'drizzle-orm';

export const DEFAULT_CATEGORIES = [
  { id: 1, name: 'Material Bangunan', code: 'material' },
  { id: 2, name: 'Pupuk', code: 'pupuk' },
];

export async function getAllCategories() {
  if (!isSqlConfigured) {
    return DEFAULT_CATEGORIES;
  }
  try {
    const list = await db.select().from(categories).orderBy(asc(categories.id));
    return list.length > 0 ? list : DEFAULT_CATEGORIES;
  } catch (error) {
    console.error('Failed to get categories:', error);
    return DEFAULT_CATEGORIES;
  }
}
