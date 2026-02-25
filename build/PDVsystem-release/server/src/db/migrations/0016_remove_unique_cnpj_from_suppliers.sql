-- Migration: Remove UNIQUE constraint do campo cnpj em suppliers
CREATE TABLE suppliers_temp AS SELECT * FROM suppliers;
DROP TABLE suppliers;
CREATE TABLE suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cnpj TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  category TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  fantasy TEXT
);
INSERT INTO suppliers SELECT * FROM suppliers_temp;
DROP TABLE suppliers_temp;
