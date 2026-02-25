-- Migration: Torna o campo cnpj de suppliers opcional e remove duplicidade de 'não informado'
-- Remove UNIQUE do cnpj já foi feito na 0016
-- Atualiza todos os cnpj vazios ou nulos para 'não informado'
UPDATE suppliers SET cnpj = 'não informado' WHERE cnpj IS NULL OR TRIM(cnpj) = '';
-- Remove duplicados de 'não informado', mantendo apenas o mais antigo
DELETE FROM suppliers WHERE cnpj = 'não informado' AND id NOT IN (
  SELECT MIN(id) FROM suppliers WHERE cnpj = 'não informado'
);
