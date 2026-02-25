-- Criação da tabela users para o PDV
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('admin','operator','manager')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','blocked')),
  password TEXT NOT NULL,
  lastLogin INTEGER
);
