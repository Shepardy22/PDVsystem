-- Rebuild products/sale_items to suport unit 'serv' e schema final (min_stock, imageUrl, type, códigos opcionais)
BEGIN;
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS products_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ean TEXT UNIQUE,
  internal_code TEXT UNIQUE,
  unit TEXT NOT NULL CHECK(unit IN ('cx','unit','kg','serv')),
  cost_price INTEGER NOT NULL DEFAULT 0,
  sale_price INTEGER NOT NULL DEFAULT 0,
  auto_discount_enabled INTEGER NOT NULL DEFAULT 0,
  auto_discount_value INTEGER NOT NULL DEFAULT 0,
  category_id TEXT,
  supplier_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  stock_on_hand INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  imageUrl TEXT,
  type TEXT DEFAULT 'product',
  min_stock INTEGER NOT NULL DEFAULT 20,
  FOREIGN KEY(category_id) REFERENCES categories(id) ON UPDATE CASCADE ON DELETE SET NULL,
  FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON UPDATE CASCADE ON DELETE SET NULL
);

INSERT INTO products_new (
  id, name, ean, internal_code, unit, cost_price, sale_price, auto_discount_enabled, auto_discount_value,
  category_id, supplier_id, status, stock_on_hand, created_at, updated_at, imageUrl, type, min_stock
)
SELECT
  id,
  name,
  NULLIF(ean, '') AS ean,
  NULLIF(internal_code, '') AS internal_code,
  unit,
  cost_price,
  sale_price,
  auto_discount_enabled,
  auto_discount_value,
  category_id,
  supplier_id,
  status,
  stock_on_hand,
  created_at,
  updated_at,
  imageUrl,
  COALESCE(type, 'product'),
  COALESCE(min_stock, 20)
FROM products;

DROP TABLE products;
ALTER TABLE products_new RENAME TO products;

CREATE TABLE IF NOT EXISTS sale_items_new (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name_snapshot TEXT NOT NULL,
  product_internal_code_snapshot TEXT NOT NULL,
  product_ean_snapshot TEXT NOT NULL,
  unit_snapshot TEXT NOT NULL CHECK(unit_snapshot IN ('cx','unit','kg','serv')),
  quantity INTEGER NOT NULL,
  unit_price_at_sale INTEGER NOT NULL,
  auto_discount_applied INTEGER NOT NULL DEFAULT 0,
  manual_discount_applied INTEGER NOT NULL DEFAULT 0,
  final_unit_price INTEGER NOT NULL,
  line_total INTEGER NOT NULL,
  FOREIGN KEY(sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  FOREIGN KEY(product_id) REFERENCES products(id)
);

INSERT INTO sale_items_new (
  id, sale_id, product_id, product_name_snapshot, product_internal_code_snapshot,
  product_ean_snapshot, unit_snapshot, quantity, unit_price_at_sale,
  auto_discount_applied, manual_discount_applied, final_unit_price, line_total
)
SELECT
  id, sale_id, product_id, product_name_snapshot, product_internal_code_snapshot,
  product_ean_snapshot, unit_snapshot, quantity, unit_price_at_sale,
  auto_discount_applied, manual_discount_applied, final_unit_price, line_total
FROM sale_items;

DROP TABLE sale_items;
ALTER TABLE sale_items_new RENAME TO sale_items;

PRAGMA foreign_keys = ON;
COMMIT;
