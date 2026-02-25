-- Migration: Adiciona coluna client_id à tabela sales
ALTER TABLE sales ADD COLUMN client_id TEXT;
