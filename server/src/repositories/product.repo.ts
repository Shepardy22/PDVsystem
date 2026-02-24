import db from '../db/database';
import { v4 as uuidv4 } from 'uuid';
// Remove todos os produtos do banco
export function deleteAllProducts() {
  db.prepare('DELETE FROM products').run();
}


export function deleteProduct(id: string) {
  console.log(`[deleteProduct] Buscando produto id=${id}`);
  const existing = getProductById(id);
  if (!existing) {
    console.error(`[deleteProduct] Produto não encontrado id=${id}`);
    throw { code: 'NOT_FOUND', message: 'Produto não encontrado.' };
  }
  try {
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    console.log(`[deleteProduct] Produto removido id=${id}`);
  } catch (err) {
    console.error(`[deleteProduct] Erro ao remover produto id=${id}:`, err);
    throw err;
  }
}

export interface Product {
  id: string;
  name: string;
  ean: string | null;
  internal_code: string | null;
  unit: 'cx' | 'unit' | 'kg' | 'serv';
  cost_price: number;
  sale_price: number;
  auto_discount_enabled: number;
  auto_discount_value: number;
  category_id?: string;
  supplier_id?: string;
  status: 'active' | 'inactive';
  stock_on_hand: number;
  created_at: number;
  updated_at: number;
  imageUrl: string;
  type: 'product' | 'service';
  min_stock: number;
}

export function listProducts(limit = 50, offset = 0) {
  const items = db.prepare('SELECT * FROM products ORDER BY name LIMIT ? OFFSET ?').all(limit, offset);
  const totalRow = db.prepare('SELECT COUNT(*) as total FROM products').get() as { total: number };
  const total = totalRow.total;
  return { items, total };
}

export function searchProducts(q: string) {
  if (!q) return { items: [] };
  // Busca por nome, ean e internal_code ao mesmo tempo
  const items = db.prepare(`
    SELECT * FROM products
    WHERE name LIKE ? OR ean = ? OR internal_code = ?
    ORDER BY name LIMIT 50
  `).all(`%${q}%`, q, q) as Product[];
  return { items };
}

export function getProductById(id: string) {
  return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
}

export function getProductByEAN(ean: string): Product | undefined {
  return db.prepare('SELECT * FROM products WHERE ean = ?').get(ean) as Product | undefined;
}

export function getProductByInternalCode(internal_code: string): Product | undefined {
  return db.prepare('SELECT * FROM products WHERE internal_code = ?').get(internal_code) as Product | undefined;
}

export function createProduct(data: any) {
  // Validação
  console.log('[createProduct] Dados recebidos:', JSON.stringify(data, null, 2));
  const isService = data.type === 'service';
  // Converte string vazia para null em campos opcionais
  const normalize = (v: any) => (v === '' ? null : v);
  if (!data.name || !data.unit || (!isService && (!data.ean || !data.internalCode))) {
    console.error('[createProduct] Campos obrigatórios ausentes:', {
      name: data.name || 'FALTANDO',
      unit: data.unit || 'FALTANDO',
      type: data.type || 'product',
      ean: data.ean || 'FALTANDO',
      internalCode: data.internalCode || 'FALTANDO',
      isService
    });
    throw { code: 'VALIDATION_ERROR', message: 'Campos obrigatórios ausentes.' };
  }
  if (!['cx', 'unit', 'kg', 'serv'].includes(data.unit)) {
    console.error('[createProduct] Unidade inválida:', data.unit);
    throw { code: 'VALIDATION_ERROR', message: 'Unidade inválida.' };
  }
  if (!isService && getProductByEAN(data.ean)) {
    console.error('[createProduct] EAN já cadastrado:', data.ean);
    throw { code: 'DUPLICATE_EAN', message: 'EAN já cadastrado.' };
  }
  if (!isService && getProductByInternalCode(data.internalCode)) {
    console.error('[createProduct] Código interno já cadastrado:', data.internalCode);
    throw { code: 'DUPLICATE_INTERNAL_CODE', message: 'Código interno já cadastrado.' };
  }
  const now = Date.now();
  const product: Product = {
    id: uuidv4(),
    name: data.name,
    ean: isService ? null : normalize(data.ean),
    internal_code: isService ? null : normalize(data.internalCode),
    unit: data.unit,
    cost_price: Math.round((data.costPrice || 0) * 100),
    sale_price: Math.round((data.salePrice || 0) * 100),
    auto_discount_enabled: data.autoDiscountEnabled ? 1 : 0,
    auto_discount_value: Math.round((data.autoDiscountValue || 0) * 100),
    category_id: normalize(data.categoryId),
    supplier_id: isService ? null : normalize(data.supplierId),
    status: data.status || 'active',
    stock_on_hand: isService ? 0 : (data.stockOnHand || 0),
    min_stock: typeof data.minStock === 'number' ? data.minStock : (typeof data.min_stock === 'number' ? data.min_stock : 20),
    imageUrl: data.imageUrl || '',
    created_at: now,
    updated_at: now,
    type: data.type === 'service' ? 'service' : 'product',
  };
  try {
    db.prepare(`INSERT INTO products (
      id, name, ean, internal_code, unit, cost_price, sale_price, auto_discount_enabled, auto_discount_value, category_id, supplier_id, status, stock_on_hand, min_stock, imageUrl, created_at, updated_at, type
    ) VALUES (
      @id, @name, @ean, @internal_code, @unit, @cost_price, @sale_price, @auto_discount_enabled, @auto_discount_value, @category_id, @supplier_id, @status, @stock_on_hand, @min_stock, @imageUrl, @created_at, @updated_at, @type
    )`).run(product);
    console.log('[createProduct] Produto/Serviço inserido com sucesso:', product);
    return product;
  } catch (err) {
    console.error('[createProduct] Erro ao inserir produto/serviço:', err, product);
    throw err;
  }
}

export function updateProduct(id: string, data: any) {
  const existing = getProductById(id) as Product | undefined;
  if (!existing) throw { code: 'NOT_FOUND', message: 'Produto não encontrado.' };
  const isService = data.type === 'service' || existing.type === 'service';
  if (!data.name || !data.unit || (!isService && (!data.ean || !data.internalCode))) {
    throw { code: 'VALIDATION_ERROR', message: 'Campos obrigatórios ausentes.' };
  }
  if (!['cx', 'unit', 'kg', 'serv'].includes(data.unit)) {
    throw { code: 'VALIDATION_ERROR', message: 'Unidade inválida.' };
  }
  if (!isService) {
    const eanOwner = getProductByEAN(data.ean);
    if (eanOwner && eanOwner.id !== id) {
      throw { code: 'DUPLICATE_EAN', message: 'EAN já cadastrado.' };
    }
    const codeOwner = getProductByInternalCode(data.internalCode);
    if (codeOwner && codeOwner.id !== id) {
      throw { code: 'DUPLICATE_INTERNAL_CODE', message: 'Código interno já cadastrado.' };
    }
  }
  const now = Date.now();
  // Só atualiza imageUrl se vier definido no payload, senão mantém o valor existente
  const updated: Product = {
    ...existing,
    name: data.name,
    ean: isService ? null : data.ean,
    internal_code: isService ? null : data.internalCode,
    unit: data.unit,
    cost_price: Math.round((data.costPrice || 0) * 100),
    sale_price: Math.round((data.salePrice || 0) * 100),
    auto_discount_enabled: data.autoDiscountEnabled ? 1 : 0,
    auto_discount_value: Math.round((data.autoDiscountValue || 0) * 100),
    category_id: data.categoryId || null,
    supplier_id: isService ? null : (data.supplierId || null),
    status: data.status || 'active',
    stock_on_hand: isService ? 0 : (data.stockOnHand || 0),
    min_stock: typeof data.minStock === 'number' ? data.minStock : (typeof data.min_stock === 'number' ? data.min_stock : existing.min_stock ?? 20),
    imageUrl: (typeof data.imageUrl !== 'undefined') ? data.imageUrl : existing.imageUrl,
    updated_at: now,
    type: data.type === 'service' ? 'service' : (existing.type || 'product'),
  };
  db.prepare(`UPDATE products SET
    name=@name, ean=@ean, internal_code=@internal_code, unit=@unit, cost_price=@cost_price, sale_price=@sale_price, auto_discount_enabled=@auto_discount_enabled, auto_discount_value=@auto_discount_value, category_id=@category_id, supplier_id=@supplier_id, status=@status, stock_on_hand=@stock_on_hand, min_stock=@min_stock, imageUrl=@imageUrl, updated_at=@updated_at, type=@type
    WHERE id=@id
  `).run({ ...updated, id });
  return updated;
}

export function updateProductImage(id: string, imageUrl: string) {
  const existing = getProductById(id) as Product | undefined;
  if (!existing) throw { code: 'NOT_FOUND', message: 'Produto não encontrado.' };
  const now = Date.now();
  db.prepare('UPDATE products SET imageUrl = ?, updated_at = ? WHERE id = ?').run(imageUrl, now, id);
  return { ...existing, imageUrl, updated_at: now };
}
