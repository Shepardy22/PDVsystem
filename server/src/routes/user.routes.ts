import { Router } from 'express';
import { createUser, listUsers, updateUser, deleteUser, findUserByEmail } from '../repositories/user.repo';


import { createClient, listClients, updateClient, deleteClient } from '../repositories/client.repo';
import { createSupplier, updateSupplier, deleteSupplier, listSuppliers } from '../repositories/supplier.repo';
import db from '../db/database';
import { logEvent } from '../utils/audit';

export const userRouter = Router();
export const clientRouter = Router();
export const supplierRouter = Router();
// Buscar nome do operador pelo ID
userRouter.get('/operator/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const row = db.prepare('SELECT name FROM users WHERE id = ?').get(id);
    if (!row) {
      return res.status(404).json({ error: 'Operador não encontrado' });
    }
    console.log('response operator name:', row);
    res.json({ name: (row as { name: string }).name });
  } catch (e: any) {
    res.status(500).json({ error: 'Erro ao buscar operador', details: e && e.message ? e.message : e });
  }
});


// Login simples
userRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha obrigatórios' });
    }
    const user = await findUserByEmail(email) as { id: string, name: string, email: string, password: string, role?: string, status?: string } | undefined;
    if (user) {
      console.log('[LOGIN] Senha salva no banco:', user.password);
    } else {
      console.log('[LOGIN] Usuário não encontrado para o email:', email);
    }
    if (!user || user.password !== password) {
      console.log('[LOGIN] Falha na autenticação.');
      logEvent('Login falhou', 'warn', { email, reason: 'invalid_credentials' });
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }
    if (user.status && user.status.toLowerCase() === 'inactive') {
      console.warn('[LOGIN] Tentativa de login com usuário inativo:', email);
      logEvent('Login bloqueado - usuário inativo', 'warn', { email, userId: user.id });
      return res.status(403).json({ error: 'USER_INACTIVE', message: 'Usuário inativo. Contate o administrador.' });
    }
    // Retorna dados básicos do usuário
    console.log('[LOGIN] Autenticação bem-sucedida para:', email);
    logEvent('Login bem-sucedido', 'info', { userId: user.id, email, role: user.role, status: user.status });
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role, status: user.status });
  } catch (e: any) {
    res.status(500).json({ error: 'Erro ao autenticar', details: e?.message || String(e) });
  }
});

userRouter.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, status } = req.body;
    if (!name || !email || !role) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
    }
    const ok = await updateUser(id, { name, email, role, status });
    if (ok) {
      logEvent('Usuário atualizado', 'info', { userId: id, name, email, role, status });
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Usuário não encontrado' });
    }
  } catch (e: any) {
    logEvent('Erro ao atualizar usuário', 'error', {
      userId: req.params?.id,
      message: e?.message || String(e),
      stack: e?.stack
    });
    res.status(500).json({ error: 'Erro ao atualizar usuário', details: e && e.message ? e.message : e });
  }
});

userRouter.get('/', async (req, res) => {
  try {
    const users = await listUsers();
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao listar usuários' });
  }
});

userRouter.post('/', async (req, res) => {
  try {
    const { name, email, role, status, password } = req.body;
    console.log('[POST /api/users] body:', req.body);
    if (!name || !email || !role || !password) {
      console.warn('[POST /api/users] Campos obrigatórios ausentes:', req.body);
      return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
    }
    try {
      const user = await createUser({ name, email, role, status, password });
      console.log('[POST /api/users] Usuário criado:', user);
      logEvent('Usuário criado', 'info', { userId: user.id, name: user.name, email: user.email, role: user.role, status: user.status });
      res.status(201).json(user);
    } catch (err: any) {
      if (err && err.code === 'EMAIL_DUPLICATE') {
        logEvent('Erro ao criar usuário', 'warn', { payload: req.body, message: err.message });
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }
  } catch (e: any) {
    logEvent('Erro ao criar usuário', 'error', {
      payload: req.body,
      message: e?.message || String(e),
      stack: e?.stack
    });
    res.status(500).json({ error: 'Erro ao criar usuário', details: e && e.message ? e.message : e });
  }
});

userRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const ok = await deleteUser(id);
    if (ok) {
      logEvent('Usuário deletado', 'warn', { userId: id });
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Usuário não encontrado' });
    }
  } catch (e: any) {
    logEvent('Erro ao deletar usuário', 'error', {
      userId: req.params?.id,
      message: e?.message || String(e),
      stack: e?.stack
    });
    res.status(500).json({ error: 'Erro ao deletar usuário', details: e && e.message ? e.message : e });
  }
});

clientRouter.get('/', async (req, res) => {
  try {
    // Retorna clientes com totalSpent
    const { listClientsWithTotalSpent } = require('../repositories/client.repo');
    const clients = await listClientsWithTotalSpent();
    res.json(clients);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao listar clientes' });
  }
});

clientRouter.post('/', async (req, res) => {
  try {
    const { name, cpf, address, phone, email } = req.body;
    if (!name || !cpf) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
    }
    const client = await createClient({ name, cpf, address, phone, email });
    logEvent('Cliente criado', 'info', { clientId: client.id, name: client.name, cpf: client.cpf });
    res.status(201).json(client);
  } catch (e: any) {
    if (e?.code === 'CPF_DUPLICATE') {
      logEvent('Erro ao criar cliente', 'warn', { payload: req.body, message: e?.message || 'CPF_DUPLICATE' });
      return res.status(400).json({ error: e?.message || 'Já existe um cliente com este CPF.' });
    }
    logEvent('Erro ao criar cliente', 'error', { message: e?.message || String(e), stack: e?.stack, payload: req.body });
    res.status(500).json({ error: 'Erro ao criar cliente', details: e && e.message ? e.message : e });
  }
});

clientRouter.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, cpf, address, phone, email } = req.body;
    if (!name || !cpf) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
    }
    const ok = await updateClient(id, { name, cpf, address, phone, email });
    if (ok) {
      logEvent('Cliente atualizado', 'info', { clientId: id, name, cpf, email, phone });
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Cliente não encontrado' });
    }
  } catch (e: any) {
    if (e?.code === 'CPF_DUPLICATE') {
      logEvent('Erro ao atualizar cliente', 'warn', { clientId: req.params?.id, message: e?.message || 'CPF_DUPLICATE' });
      return res.status(400).json({ error: e?.message || 'Já existe um cliente com este CPF.' });
    }
    logEvent('Erro ao atualizar cliente', 'error', { clientId: req.params?.id, message: e?.message || String(e), stack: e?.stack, payload: req.body });
    res.status(500).json({ error: 'Erro ao atualizar cliente', details: e && e.message ? e.message : e });
  }
});

clientRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const ok = await deleteClient(id);
    if (ok) {
      logEvent('Cliente deletado', 'warn', { clientId: id });
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Cliente não encontrado' });
    }
  } catch (e: any) {
    logEvent('Erro ao deletar cliente', 'error', {
      clientId: req.params?.id,
      message: e?.message || String(e),
      stack: e?.stack
    });
    res.status(500).json({ error: 'Erro ao deletar cliente', details: e && e.message ? e.message : e });
  }
});

supplierRouter.get('/', async (req, res) => {
  try {
    const suppliers = await listSuppliers();
    res.json(suppliers);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao listar fornecedores' });
  }
});

supplierRouter.post('/', async (req, res) => {
  try {
    const { name, cnpj, address, phone, email, category } = req.body;
    if (!name || !category) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
    }
    const supplier = await createSupplier({ name, cnpj, address, phone, email, category });
    logEvent('Fornecedor criado', 'info', { supplierId: supplier.id, name: supplier.name, cnpj: supplier.cnpj });
    res.status(201).json(supplier);
  } catch (e: any) {
    res.status(500).json({ error: 'Erro ao criar fornecedor', details: e && e.message ? e.message : e });
  }
});

supplierRouter.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, cnpj, address, phone, email, category } = req.body;
    if (!name || !category) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
    }
    const ok = await updateSupplier(id, { name, cnpj, address, phone, email, category });
    if (ok) {
      logEvent('Fornecedor atualizado', 'info', { supplierId: id, name, cnpj, email, phone, category });
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Fornecedor não encontrado' });
    }
  } catch (e: any) {
    res.status(500).json({ error: 'Erro ao atualizar fornecedor', details: e && e.message ? e.message : e });
  }
});

supplierRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const ok = await deleteSupplier(id);
    if (ok) {
      logEvent('Fornecedor deletado', 'warn', { supplierId: id });
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Fornecedor não encontrado' });
    }
  } catch (e: any) {
    res.status(500).json({ error: 'Erro ao deletar fornecedor', details: e && e.message ? e.message : e });
  }
});
