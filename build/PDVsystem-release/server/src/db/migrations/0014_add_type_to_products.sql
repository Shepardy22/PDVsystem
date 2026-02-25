-- Migration: Adiciona coluna type à tabela products
ALTER TABLE products ADD COLUMN type TEXT DEFAULT 'product';
