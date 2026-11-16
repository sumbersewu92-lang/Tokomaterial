import { db } from '../src/db/index.ts';
import { categories, products } from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';
import {
  INITIAL_MOCK_MATERIALS,
  INITIAL_MOCK_FERTILIZERS,
} from '../src/lib/mockData.ts';

async function seed() {
  console.log('--- Starting Toko Sumber Sewu Realistic Data Seeding ---');

  // 1. Ensure Categories: Material Bangunan & Pupuk Pertanian
  const existingCats = await db.select().from(categories);
  const catMap: Record<string, number> = {};
  for (const c of existingCats) {
    catMap[c.code] = c.id;
  }

  const matCatId = catMap['material'] || catMap['aksesoris'] || 1;
  const pupukCatId = catMap['pupuk'] || catMap['hp'] || 2;

  // 2. Seed Materials
  console.log(`Seeding ${INITIAL_MOCK_MATERIALS.length} Building Materials SKUs...`);
  for (const item of INITIAL_MOCK_MATERIALS) {
    const existing = await db
      .select()
      .from(products)
      .where(eq(products.code, item.code));

    if (existing.length === 0) {
      await db.insert(products).values({
        categoryId: matCatId,
        code: item.code,
        name: item.name,
        brand: item.brand,
        model: item.model,
        variant: item.variant,
        costPrice: item.costPrice,
        sellingPrice: item.sellingPrice,
        stock: item.stock,
        minStockAlert: item.minStockAlert,
        isImeiTracked: false,
        unit: item.unit,
      });
      console.log(`+ Inserted Material: ${item.code} - ${item.name} (${item.unit})`);
    } else {
      await db
        .update(products)
        .set({
          name: item.name,
          brand: item.brand,
          model: item.model,
          variant: item.variant,
          costPrice: item.costPrice,
          sellingPrice: item.sellingPrice,
          stock: item.stock,
          minStockAlert: item.minStockAlert,
          unit: item.unit,
        })
        .where(eq(products.code, item.code));
    }
  }

  // 3. Seed Fertilizers
  console.log(`Seeding ${INITIAL_MOCK_FERTILIZERS.length} Fertilizers & Agro Products...`);
  for (const item of INITIAL_MOCK_FERTILIZERS) {
    const existing = await db
      .select()
      .from(products)
      .where(eq(products.code, item.code));

    if (existing.length === 0) {
      await db.insert(products).values({
        categoryId: pupukCatId,
        code: item.code,
        name: item.name,
        brand: item.brand,
        model: item.model,
        variant: item.variant,
        costPrice: item.costPrice,
        sellingPrice: item.sellingPrice,
        stock: item.stock,
        minStockAlert: item.minStockAlert,
        isImeiTracked: false,
        unit: item.unit,
      });
      console.log(`+ Inserted Pupuk: ${item.code} - ${item.name} (${item.unit})`);
    } else {
      await db
        .update(products)
        .set({
          name: item.name,
          brand: item.brand,
          model: item.model,
          variant: item.variant,
          costPrice: item.costPrice,
          sellingPrice: item.sellingPrice,
          stock: item.stock,
          minStockAlert: item.minStockAlert,
          unit: item.unit,
        })
        .where(eq(products.code, item.code));
    }
  }

  console.log('--- Toko Sumber Sewu Seeding Completed Successfully! ---');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding error:', err);
  process.exit(1);
});
