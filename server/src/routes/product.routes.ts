
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import {
  listProducts,
  searchProducts,
  createProduct,
  updateProduct,
  getProductById,
  deleteProduct,
  deleteAllProducts
} from '../repositories/product.repo';
import { logEvent } from '../utils/audit';

export const productRouter = Router();

import fs from 'fs';


// SSE: lista de conexões
import { Response } from 'express';
const sseClients: Response[] = [];

type IdempotencyOutcome = {
  status: number;
  body: any;
  createdAt: number;
  bodyFingerprint: string;
};

type InflightIdempotency = {
  bodyFingerprint: string;
  promise: Promise<IdempotencyOutcome>;
  createdAt: number;
};

const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const productCreateIdempotencyCache = new Map<string, IdempotencyOutcome>();
const productCreateIdempotencyInflight = new Map<string, InflightIdempotency>();

function getBodyFingerprint(body: unknown): string {
  return JSON.stringify(body ?? {});
}

function cleanupIdempotencyMaps(now = Date.now()) {
  for (const [key, value] of productCreateIdempotencyCache.entries()) {
    if (now - value.createdAt > IDEMPOTENCY_TTL_MS) {
      productCreateIdempotencyCache.delete(key);
    }
  }
  for (const [key, value] of productCreateIdempotencyInflight.entries()) {
    if (now - value.createdAt > IDEMPOTENCY_TTL_MS) {
      productCreateIdempotencyInflight.delete(key);
    }
  }
}

function mapCreateProductError(err: unknown, payload: unknown) {
  logEvent('Erro ao criar produto', 'error', {
    message: (err as any)?.message || String(err),
    stack: (err as any)?.stack,
    payload
  });
  if (typeof err === 'object' && err !== null && 'code' in err && 'message' in err) {
    const code = (err as { code: string; message: string }).code;
    const message = (err as { code: string; message: string }).message;
    if (code === 'VALIDATION_ERROR') {
      return { status: 400, body: { error: { code, message } } };
    }
    if (code === 'DUPLICATE_EAN') {
      return { status: 409, body: { error: { code, message } } };
    }
    if (code === 'DUPLICATE_INTERNAL_CODE') {
      return { status: 409, body: { error: { code, message } } };
    }
  }
  return { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'Erro ao criar produto.' } } };
}


// Log de todas as requisições recebidas neste router
productRouter.use((req, res, next) => {
  console.log(`[API][${new Date().toISOString()}] ${req.method} ${req.originalUrl} | Query:`, req.query, '| Body:', req.body);
  next();
});

// Rota SSE para eventos de produtos
productRouter.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();
  sseClients.push(res);
  req.on('close', () => {
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

function emitProductEvent(eventType: string, payload: unknown) {
  const data = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
  sseClients.forEach(client => {
    try { client.write(data); } catch {}
  });
}
// Rota para remover imagem de produto
// --- mover para depois da declaração do productRouter ---


productRouter.post('/delete-image', async (req, res) => {
  const { imageUrl, productId } = req.body;
  if (!imageUrl || !productId) return res.status(400).json({ error: 'Dados insuficientes.' });
  try {
    // Remove arquivo físico
    const filePath = path.resolve(__dirname, '../../../', imageUrl.replace(/^\//, ''));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    // Limpa campo imageUrl no banco
    updateProduct(productId, { imageUrl: '' });
    logEvent('Imagem de produto removida', 'info', { productId, imageUrl });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover imagem.' });
  }
});

// Configuração do multer para salvar imagens
const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, path.resolve(__dirname, '../../../public/uploads'));
  },
  filename: function (req, file, cb) {
    // Usa id do produto e descrição para nome do arquivo
    const { ean, description } = req.body;
    const ext = path.extname(file.originalname);
    const safeDesc = description ? description.replace(/[^a-zA-Z0-9-_]/g, '_') : '';
    const safeEan = ean ? String(ean).replace(/[^a-zA-Z0-9-_]/g, '_') : 'new';
    cb(null, `${safeEan}_${safeDesc}_${Date.now()}${ext}`);
  }
});
const upload = multer({ storage });

// Rota para upload de imagem
productRouter.post('/upload-image', upload.single('image'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    // Caminho relativo para salvar no banco
    const relativePath = `/uploads/${req.file.filename}`;
    res.json({ imageUrl: relativePath });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar imagem.' });
  }
});

// Deletar TODOS os produtos
productRouter.delete('/', (_req, res) => {
  try {
    deleteAllProducts();
    logEvent('Todos os produtos removidos', 'warn');
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro ao deletar todos os produtos.' } });
  }
});

// Buscar produto por ID (deve ficar após a declaração de productRouter)
productRouter.get('/:id', (req, res) => {
  const { id } = req.params;
  try {
    const product = getProductById(id);
    if (!product) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Produto não encontrado.' } });
    }
    logEvent('Produto consultado', 'info', { productId: id });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro ao buscar produto.' } });
  }
});

productRouter.get('/', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;
  try {
    const { items, total } = listProducts(limit, offset);
    logEvent('Produtos listados', 'info', { limit, offset, total });
    res.json({ items, total });
  } catch (err) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro ao listar produtos.' } });
  }
});

productRouter.get('/search', (req, res) => {
  const q = (req.query.q as string) || '';
  console.log(`[API] /api/products/search chamada. Query recebida: '${q}'`);
  try {
    const { items } = searchProducts(q);
    console.log(`[API] /api/products/search resultado: ${items.length} itens encontrados.`);
    logEvent('Produtos buscados', 'info', { query: q, count: items.length });
    res.json({ items });
  } catch (err) {
    logEvent('Erro na busca de produtos', 'error', {
      message: (err as any)?.message || String(err),
      stack: (err as any)?.stack,
      query: q
    });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro na busca.' } });
  }
});

productRouter.post('/', async (req, res) => {
  const idempotencyKey = req.get('Idempotency-Key')?.trim() || '';
  const bodyFingerprint = getBodyFingerprint(req.body);
  cleanupIdempotencyMaps();

  const createAction = async (): Promise<IdempotencyOutcome> => {
    try {
      console.log('[POST /api/products] Recebido:', req.body);
      const product = createProduct({
        ...req.body,
        type: req.body.type || 'product',
      });
      console.log('[POST /api/products] Produto criado com sucesso:', product);
      logEvent('Produto criado', 'info', { productId: product.id, name: product.name, ean: product.ean, internalCode: product.internal_code });
      emitProductEvent('created', product);
      return { status: 201, body: { product }, createdAt: Date.now(), bodyFingerprint };
    } catch (err) {
      const mapped = mapCreateProductError(err, req.body);
      return { status: mapped.status, body: mapped.body, createdAt: Date.now(), bodyFingerprint };
    }
  };

  if (!idempotencyKey) {
    const outcome = await createAction();
    return res.status(outcome.status).json(outcome.body);
  }

  const cached = productCreateIdempotencyCache.get(idempotencyKey);
  if (cached) {
    if (cached.bodyFingerprint !== bodyFingerprint) {
      return res.status(409).json({ error: { code: 'IDEMPOTENCY_KEY_REUSED', message: 'A mesma Idempotency-Key foi reutilizada com payload diferente.' } });
    }
    res.setHeader('Idempotency-Replayed', 'true');
    return res.status(cached.status).json(cached.body);
  }

  const inflight = productCreateIdempotencyInflight.get(idempotencyKey);
  if (inflight) {
    if (inflight.bodyFingerprint !== bodyFingerprint) {
      return res.status(409).json({ error: { code: 'IDEMPOTENCY_KEY_REUSED', message: 'A mesma Idempotency-Key foi reutilizada com payload diferente.' } });
    }
    const outcome = await inflight.promise;
    res.setHeader('Idempotency-Replayed', 'true');
    return res.status(outcome.status).json(outcome.body);
  }

  const pending = createAction();
  productCreateIdempotencyInflight.set(idempotencyKey, {
    bodyFingerprint,
    promise: pending,
    createdAt: Date.now(),
  });

  const outcome = await pending;
  productCreateIdempotencyInflight.delete(idempotencyKey);
  productCreateIdempotencyCache.set(idempotencyKey, outcome);
  return res.status(outcome.status).json(outcome.body);
});

productRouter.put('/:id', (req, res) => {
  const { id } = req.params;
  try {
    const product = updateProduct(id, {
      ...req.body,
      type: req.body.type,
    });
    logEvent('Produto atualizado', 'info', { productId: product.id, name: product.name, ean: product.ean, internalCode: product.internal_code });
    emitProductEvent('updated', product);
    res.json({ product });
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'code' in err && 'message' in err) {
      const code = (err as { code: string; message: string }).code;
      const message = (err as { code: string; message: string }).message;
      if (code === 'NOT_FOUND') {
        res.status(404).json({ error: { code, message } });
      } else if (code === 'VALIDATION_ERROR') {
        res.status(400).json({ error: { code, message } });
      } else if (code === 'DUPLICATE_EAN') {
        res.status(409).json({ error: { code, message } });
      } else if (code === 'DUPLICATE_INTERNAL_CODE') {
        res.status(409).json({ error: { code, message } });
      } else {
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro ao atualizar produto.' } });
      }
    } else {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro ao atualizar produto.' } });
    }
  }
});

// Deletar produto individual (emitir evento SSE)
productRouter.delete('/:id', (req, res) => {
  const { id } = req.params;
  try {
    deleteProduct(id);
    logEvent('Produto deletado', 'warn', { productId: id });
    emitProductEvent('deleted', { id });
    res.status(204).end();
  } catch (err) {
    // Se for erro de constraint de chave estrangeira, retorna código específico
    if (err && typeof err === 'object' && 'code' in err && (err as any).code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      res.status(400).json({ error: { code: 'SQLITE_CONSTRAINT_FOREIGNKEY', message: 'FOREIGN KEY constraint failed' } });
    } else {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro ao deletar produto.' } });
    }
  }
});
