import { randomUUID } from 'crypto';
import db from '../db/database';

// Retorna todos os clientes, incluindo o total gasto (soma das vendas)
export async function listClientsWithTotalSpent() {
  // LEFT JOIN para garantir clientes sem vendas
  const sql = `
    SELECT c.*, COALESCE(SUM(s.total), 0) as totalSpent
    FROM clients c
    LEFT JOIN sales s ON s.client_id = c.id
    GROUP BY c.id
    ORDER BY c.name COLLATE NOCASE
  `;
  return db.prepare(sql).all();
}

// Mantém a função antiga para compatibilidade
export async function listClients() {
  return db.prepare('SELECT * FROM clients').all();
}
export async function createClient({ name, cpf, address, phone, email }: any) {
  const id = randomUUID();
  const now = Date.now();
  const stmt = db.prepare('INSERT INTO clients (id, name, cpf, address, phone, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  try {
    stmt.run(id, name, cpf, address, phone, email, now, now);
  } catch (e: any) {
    if (e && typeof e.message === 'string' && e.message.includes('UNIQUE constraint failed: clients.cpf')) {
      const err: any = new Error('Já existe um cliente com este CPF.');
      err.code = 'CPF_DUPLICATE';
      throw err;
    }
    throw e;
  }
  return { id, name, cpf, address, phone, email, created_at: now, updated_at: now };
}

export async function updateClient(id: string, { name, cpf, address, phone, email }: any) {
  const now = Date.now();
  const stmt = db.prepare('UPDATE clients SET name = ?, cpf = ?, address = ?, phone = ?, email = ?, updated_at = ? WHERE id = ?');
  try {
    const info = stmt.run(name, cpf, address, phone, email, now, id);
    return info.changes > 0;
  } catch (e: any) {
    if (e && typeof e.message === 'string' && e.message.includes('UNIQUE constraint failed: clients.cpf')) {
      const err: any = new Error('Já existe um cliente com este CPF.');
      err.code = 'CPF_DUPLICATE';
      throw err;
    }
    throw e;
  }
}

export async function deleteClient(id: string) {
  const stmt = db.prepare('DELETE FROM clients WHERE id = ?');
  const info = stmt.run(id);
  return info.changes > 0;
}
