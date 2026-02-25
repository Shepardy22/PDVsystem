-- Migration: Criação da tabela de configurações gerais do sistema
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Inserir senha admin padrão (hash simples, para produção use hash seguro)
INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_password', 'admin123');

-- Exemplo de permissão extra
INSERT OR IGNORE INTO settings (key, value) VALUES ('can_approve_movements', 'true');
