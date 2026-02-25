-- SQLite schema (NBPOS)
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cnpj TEXT UNIQUE,
  address TEXT,
  phone TEXT,
  email TEXT,
  category TEXT,
  created_at INTEGER,
  updated_at INTEGER
);


CREATE TABLE IF NOT EXISTS products (
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


CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  operator_id TEXT NOT NULL,
  cash_session_id TEXT NOT NULL,
  subtotal INTEGER NOT NULL,
  discount_total INTEGER NOT NULL,
  total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('completed')),
  created_at INTEGER NOT NULL,
  FOREIGN KEY(cash_session_id) REFERENCES cash_sessions(id)
);

CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name_snapshot TEXT NOT NULL,
  product_internal_code_snapshot TEXT NOT NULL,
  product_ean_snapshot TEXT NOT NULL,
  unit_snapshot TEXT NOT NULL CHECK(unit_snapshot IN ('cx','unit','kg')),
  quantity INTEGER NOT NULL,
  unit_price_at_sale INTEGER NOT NULL,
  auto_discount_applied INTEGER NOT NULL DEFAULT 0,
  manual_discount_applied INTEGER NOT NULL DEFAULT 0,
  final_unit_price INTEGER NOT NULL,
  line_total INTEGER NOT NULL,
  FOREIGN KEY(sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  FOREIGN KEY(product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  method TEXT NOT NULL CHECK(method IN ('cash','pix','card','other')),
  amount INTEGER NOT NULL,
  metadata_json TEXT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(sale_id) REFERENCES sales(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('sale_out','manual_in','manual_out','adjustment','import_in')),
  quantity INTEGER NOT NULL,
  reason TEXT NOT NULL,
  reference_type TEXT NOT NULL CHECK(reference_type IN ('sale','import','manual')),
  reference_id TEXT NULL,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY(product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS cash_sessions (
  id TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL,
  opened_at INTEGER NOT NULL,
  closed_at INTEGER NULL,
  initial_balance INTEGER NOT NULL DEFAULT 0,
  is_open INTEGER NOT NULL DEFAULT 1,
  physical_count_at_close INTEGER NULL,
  difference_at_close INTEGER NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cash_movements (
  id TEXT PRIMARY KEY,
  cash_session_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('sale_inflow','supply_in','withdraw_out','adjustment')),
  direction TEXT NOT NULL CHECK(direction IN ('in','out')),
  amount INTEGER NOT NULL,
  description TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  reference_type TEXT NOT NULL CHECK(reference_type IN ('sale','manual')),
  reference_id TEXT NULL,
  metadata_json TEXT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(cash_session_id) REFERENCES cash_sessions(id) ON DELETE CASCADE
);
