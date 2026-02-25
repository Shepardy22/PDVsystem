-- Migration: Adiciona coluna user_id à tabela cash_sessions
ALTER TABLE cash_sessions ADD COLUMN user_id TEXT;
-- Opcional: criar índice para user_id
-- CREATE INDEX IF NOT EXISTS idx_cash_sessions_user_id ON cash_sessions(user_id);
