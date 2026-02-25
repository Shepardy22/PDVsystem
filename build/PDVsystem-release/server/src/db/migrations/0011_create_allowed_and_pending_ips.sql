-- 0011_create_allowed_and_pending_ips.sql
CREATE TABLE IF NOT EXISTS allowed_ips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL UNIQUE,
    hostname TEXT,
    autorizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    autorizado_por TEXT
);

CREATE TABLE IF NOT EXISTS pending_ips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL UNIQUE,
    hostname TEXT,
    tentado_em DATETIME DEFAULT CURRENT_TIMESTAMP
);
