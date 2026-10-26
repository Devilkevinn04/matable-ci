import { dbAll, dbGet, dbRun } from '../../db.ts';
import type { ProductRecord } from '../types.ts';

export function mapProductRow(row: Record<string, unknown>): ProductRecord {
  return {
    id: Number(row.id),
    shop_id: Number(row.shop_id),
    created_at: row.created_at == null ? null : String(row.created_at),
    title: String(row.title),
    description: row.description ? String(row.description) : null,
    price: Number(row.price),
    sale_price: row.sale_price == null ? null : Number(row.sale_price),
    sale_starts_at: row.sale_starts_at == null ? null : String(row.sale_starts_at),
    sale_ends_at: row.sale_ends_at == null ? null : String(row.sale_ends_at),
    stock: Number(row.stock),
    image_url: String(row.image_url ?? ''),
    is_available: Boolean(row.is_available),
    is_visible: row.is_visible == null ? Boolean(row.is_available) || Number(row.stock) === 0 : Boolean(row.is_visible),
    category: row.category ? String(row.category) : undefined,
    sizes: row.sizes ? (typeof row.sizes === 'string' ? JSON.parse(row.sizes) : row.sizes) : undefined,
    colors: row.colors ? (typeof row.colors === 'string' ? JSON.parse(row.colors) : row.colors) : undefined,
    lookbook_image: row.lookbook_image ? String(row.lookbook_image) : undefined,
    gallery_images: row.gallery_images ? (typeof row.gallery_images === 'string' ? JSON.parse(row.gallery_images) : row.gallery_images) : undefined,
    prep_time: row.prep_time == null ? undefined : Number(row.prep_time),
    modifier_groups: row.modifier_groups ? (typeof row.modifier_groups === 'string' ? JSON.parse(row.modifier_groups) : row.modifier_groups) : undefined,
    attributes: row.attributes ? (typeof row.attributes === 'string' ? JSON.parse(row.attributes) : row.attributes) : undefined,
  };
}

export async function loadProductsFromDatabase(): Promise<ProductRecord[]> {
  const rows = await dbAll<Record<string, unknown>>('SELECT * FROM products ORDER BY id');
  return rows.map(mapProductRow);
}

export async function getProductFromDatabase(productId: number): Promise<ProductRecord | undefined> {
  const row = await dbGet<Record<string, unknown>>('SELECT * FROM products WHERE id = ?', [productId]);
  return row ? mapProductRow(row) : undefined;
}

export async function persistProduct(product: ProductRecord): Promise<void> {
  await dbRun(`
    INSERT INTO products (id, shop_id, title, description, price, sale_price, sale_starts_at, sale_ends_at, stock, image_url, is_available, is_visible, category, sizes, colors, lookbook_image, gallery_images, prep_time, modifier_groups, attributes, created_at)
    VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      COALESCE(?, CURRENT_TIMESTAMP)
    )
    ON CONFLICT(id) DO UPDATE SET shop_id=excluded.shop_id, title=excluded.title, description=excluded.description,
      price=excluded.price, sale_price=excluded.sale_price, sale_starts_at=excluded.sale_starts_at,
      sale_ends_at=excluded.sale_ends_at, stock=excluded.stock, image_url=excluded.image_url, is_available=excluded.is_available,
      is_visible=excluded.is_visible,
      category=excluded.category, sizes=excluded.sizes, colors=excluded.colors, lookbook_image=excluded.lookbook_image, gallery_images=excluded.gallery_images, prep_time=excluded.prep_time,
      modifier_groups=excluded.modifier_groups, attributes=excluded.attributes
  `, [
    product.id, product.shop_id, product.title, product.description ?? null, product.price, product.sale_price ?? null,
    product.sale_starts_at ?? null, product.sale_ends_at ?? null, product.stock, product.image_url,
    product.is_available ? 1 : 0, product.is_visible === false ? 0 : 1, product.category ?? null, product.sizes ? JSON.stringify(product.sizes) : null, product.colors ? JSON.stringify(product.colors) : null,
    product.lookbook_image ?? null, product.gallery_images && product.gallery_images.length > 0 ? JSON.stringify(product.gallery_images) : null, product.prep_time ?? null, product.modifier_groups ? JSON.stringify(product.modifier_groups) : null,
    product.attributes && Object.keys(product.attributes).length > 0 ? JSON.stringify(product.attributes) : null,
    product.created_at ?? null,
  ]);
}