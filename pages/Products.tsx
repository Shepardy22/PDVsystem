// @ts-ignore
import React, { useState, useMemo, useRef, useEffect } from 'react';
// Utilitários para geração de códigos
function generateEan() {
   // Gera EAN-13 começando com 789 e 10 dígitos aleatórios
   let ean = '789';
   for (let i = 0; i < 10; i++) {
      ean += Math.floor(Math.random() * 10);
   }
   return ean.slice(0, 13);
}

function generateInternalCode() {
   // Gera código interno de 6 dígitos
   let code = '';
   for (let i = 0; i < 6; i++) {
      code += Math.floor(Math.random() * 10);
   }
   return code;
}
import { createPortal } from 'react-dom';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Search, Plus, Filter, Edit2, Grid2X2, List, Info, ChevronRight, ChevronUp, ChevronDown, Package, DollarSign, Tag, TrendingUp, X, Check, Image as ImageIcon, Archive, Cpu, Zap, ShieldAlert, UploadCloud, FileSpreadsheet, FileText, AlertCircle, RefreshCcw, Layers, Hash, Activity, FolderPlus, Trash2 } from 'lucide-react';
import { Input, Button, Badge, Modal, Switch } from '../components/UI';
import ColumnMappingModal from '../components/modals/ColumnMappingModal';
import { Product, Category } from '../types';
import { FeedbackPopup } from '@/components/FeedbackPopup';
import { useAuth } from '../components/AuthContext';
import { isOperator } from '../types';
import { logUiEvent } from '../services/telemetry';

const ALLOWED_UNITS = ['cx', 'unit', 'kg', 'serv'] as const;
type ImportField = 'internalCode' | 'gtin' | 'name' | 'costPrice' | 'salePrice' | 'stock' | 'supplier' | 'category' | 'type' | 'unit' | 'status';

const REQUIRED_IMPORT_FIELDS: ImportField[] = ['name', 'salePrice'];
const IMPORT_FIELDS: Array<{ key: ImportField; label: string; required: boolean }> = [
   { key: 'internalCode', label: 'Codigo Interno', required: false },
   { key: 'gtin', label: 'GTIN (EAN)', required: false },
   { key: 'name', label: 'Nome', required: true },
   { key: 'costPrice', label: 'Preco de Custo', required: false },
   { key: 'salePrice', label: 'Preco de Venda', required: true },
   { key: 'stock', label: 'Estoque', required: false },
   { key: 'supplier', label: 'Fornecedor', required: false },
   { key: 'category', label: 'Categoria', required: false },
   { key: 'type', label: 'Tipo', required: false },
   { key: 'unit', label: 'Unidade', required: false },
   { key: 'status', label: 'Status', required: false },
];

const IMPORT_FIELD_ALIASES: Record<ImportField, string[]> = {
   internalCode: ['internalcode', 'codigointerno', 'codigointerno', 'codigo', 'cod'],
   gtin: ['gtin', 'ean', 'ean13', 'codigodebarras', 'codbarras', 'barcode'],
   name: ['name', 'nome', 'descricao', 'desc', 'produto'],
   costPrice: ['costprice', 'precocusto', 'custo', 'valorcusto'],
   salePrice: ['saleprice', 'precovenda', 'venda', 'valorvenda', 'preco'],
   stock: ['stock', 'estoque', 'quantidade', 'qtd', 'saldo'],
   supplier: ['supplier', 'fornecedor', 'marca'],
   category: ['category', 'categoria', 'grupo', 'departamento'],
   type: ['type', 'tipo'],
   unit: ['unit', 'unidade', 'und'],
   status: ['status', 'situacao', 'ativo', 'estado'],
};

type ProductFormPayload = {
   name: string;
   unit: 'cx' | 'unit' | 'kg' | 'serv';
   status: 'active' | 'inactive';
   costPrice: number;
   salePrice: number;
   stockOnHand: number;
   minStock: number;
   autoDiscountEnabled: boolean;
   autoDiscountValue: number;
   imageUrl: string;
   categoryId: string | null;
   supplierId: string | null;
   type: 'product' | 'service';
   ean: string | null;
   internalCode: string | null;
};

const createEmptyColumnMapping = (): Record<ImportField, string> => ({
   internalCode: '',
   gtin: '',
   name: '',
   costPrice: '',
   salePrice: '',
   stock: '',
   supplier: '',
   category: '',
   type: '',
   unit: '',
   status: '',
});

const normalizeImportHeader = (value: string) =>
   String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

const suggestColumnMapping = (headers: string[]): Record<ImportField, string> => {
   const suggestion = createEmptyColumnMapping();
   const normalizedHeaders = headers.map(header => ({
      original: header,
      normalized: normalizeImportHeader(header),
   }));

   IMPORT_FIELDS.forEach(({ key }) => {
      const aliases = IMPORT_FIELD_ALIASES[key];
      const match = normalizedHeaders.find(({ normalized }) => aliases.includes(normalized));
      if (match) suggestion[key] = match.original;
   });

   return suggestion;
};

const parseImportedNumber = (raw: unknown): number => {
   if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;
   const input = String(raw ?? '').trim();
   if (!input) return NaN;
   let normalized = input.replace(/\s+/g, '');
   const comma = normalized.lastIndexOf(',');
   const dot = normalized.lastIndexOf('.');
   if (comma >= 0 && dot >= 0) {
      if (comma > dot) {
         normalized = normalized.replace(/\./g, '').replace(',', '.');
      } else {
         normalized = normalized.replace(/,/g, '');
      }
   } else if (comma >= 0) {
      normalized = normalized.replace(',', '.');
   }
   return Number(normalized);
};

const parseImportType = (raw: unknown, unitRaw: unknown): 'product' | 'service' => {
   const typeText = normalizeImportHeader(String(raw ?? ''));
   const unitText = normalizeImportHeader(String(unitRaw ?? ''));
   if (typeText.includes('serv')) return 'service';
   if (unitText.startsWith('serv')) return 'service';
   return 'product';
};

const parseImportUnit = (raw: unknown, type: 'product' | 'service'): 'cx' | 'unit' | 'kg' | 'serv' => {
   const normalized = normalizeImportHeader(String(raw ?? ''));
   if (type === 'service') return 'serv';
   if (normalized === 'cx' || normalized === 'caixa') return 'cx';
   if (normalized === 'kg' || normalized === 'quilo' || normalized === 'quilos') return 'kg';
   if (normalized === 'serv') return 'serv';
   return 'unit';
};

const parseImportStatus = (raw: unknown): 'active' | 'inactive' => {
   const normalized = normalizeImportHeader(String(raw ?? ''));
   if (normalized === 'inactive' || normalized === 'inativo') return 'inactive';
   return 'active';
};

const mapApiProductToUi = (product: any): Product => ({
   id: product.id,
   name: product.name,
   gtin: product.ean || product.gtin,
   internalCode: product.internal_code || product.internalCode,
   unit: product.unit,
   costPrice: typeof product.cost_price === 'number' ? product.cost_price / 100 : product.costPrice,
   salePrice: typeof product.sale_price === 'number' ? product.sale_price / 100 : product.salePrice,
   stock: product.stock_on_hand ?? product.stock ?? 0,
   minStock: product.min_stock ?? 20,
   category: product.category_id || product.category,
   supplier: product.supplier_id || product.supplier || '',
   status: product.status,
   imageUrl: product.imageUrl || '',
   autoDiscount: typeof product.auto_discount_value === 'number' ? product.auto_discount_value / 100 : product.autoDiscount,
   type: product.type || 'product',
} as Product);

const validateProductPayload = (payload: ProductFormPayload): string | null => {
   if (!payload.name.trim()) return 'Informe o nome do produto/serviço.';
   if (!ALLOWED_UNITS.includes(payload.unit)) return 'Unidade inválida.';
   if (payload.salePrice < 0 || payload.costPrice < 0) return 'Preços não podem ser negativos.';
   if (payload.stockOnHand < 0 || payload.minStock < 0) return 'Estoque e estoque mínimo não podem ser negativos.';
   if (payload.autoDiscountValue < 0) return 'O desconto automático não pode ser negativo.';
   if (payload.type === 'product') {
      if (!payload.ean || payload.ean.trim().length !== 13) return 'EAN obrigatório com 13 dígitos.';
      if (!payload.internalCode || payload.internalCode.trim().length < 1) return 'Código interno é obrigatório.';
   }
   return null;
};

const upsertProductInList = (items: Product[], incoming: Product): Product[] => {
   const index = items.findIndex(item => item.id === incoming.id);
   if (index === -1) return [...items, incoming];
   const next = [...items];
   next[index] = { ...next[index], ...incoming };
   return next;
};

const PRODUCTS_FETCH_LIMIT = 5000;

const Products: React.FC = () => {
   // Estado para imagem selecionada antes da criação
   const [imageFile, setImageFile] = useState<File | null>(null);

   const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
   // Estado para auto-ativação do produto
   const [autoActive, setAutoActive] = useState(true);
   // Estados de Categoria
   const [categories, setCategories] = useState<Category[]>([]);
   const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
   const [newCategoryName, setNewCategoryName] = useState('');
   // Estados de Fornecedor
   const [suppliers, setSuppliers] = useState<{ id: string, name: string }[]>([]);
   const [isSupplierLoading, setIsSupplierLoading] = useState(false);
   // Estados de Importação
   const [isImportModalOpen, setIsImportModalOpen] = useState(false);
   const [isColumnMappingModalOpen, setIsColumnMappingModalOpen] = useState(false);
   const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
   const [isUploading, setIsUploading] = useState(false);
   const [importResults, setImportResults] = useState<any[]>([]);
   const [rawImportRows, setRawImportRows] = useState<any[]>([]);
   const [importHeaders, setImportHeaders] = useState<string[]>([]);
   const [columnMapping, setColumnMapping] = useState<Record<ImportField, string>>(createEmptyColumnMapping());
   // Estados de Filtro
   const [selectedCategory, setSelectedCategory] = useState<string>('all');
   const [stockStatus, setStockStatus] = useState<'all' | 'low' | 'normal'>('all');
    const [showCategoryList, setShowCategoryList] = useState(false);
    const [showStockList, setShowStockList] = useState(false);
    const [isSavingProduct, setIsSavingProduct] = useState(false);
    type SortKey = 'name' | 'costPrice' | 'salePrice' | 'stock';
   const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });

   // SSE: Atualização em tempo real dos produtos
   React.useEffect(() => {
      const evtSource = new EventSource('/api/products/events');
      evtSource.addEventListener('created', (e: any) => {
         try {
            const product = JSON.parse(e.data);
            const mapped = mapApiProductToUi(product);
            setProducts(prev => upsertProductInList(prev, mapped));
         } catch { }
      });
      evtSource.addEventListener('updated', (e: any) => {
         try {
            const product = JSON.parse(e.data);
            const mapped = mapApiProductToUi(product);
            setProducts(prev => upsertProductInList(prev, mapped));
         } catch { }
      });
      evtSource.addEventListener('deleted', (e: any) => {
         try {
            const { id } = JSON.parse(e.data);
            setProducts(prev => prev.filter(p => p.id !== id));
         } catch { }
      });
      return () => { evtSource.close(); };
   }, []);
   const { user } = useAuth();
   const isOperatorUser = isOperator(user);
   const sendTelemetry = React.useCallback((area: string, action: string, meta?: Record<string, any>) => {
      logUiEvent({ userId: user?.id ?? null, page: 'products', area, action, meta });
   }, [user?.id]);

   React.useEffect(() => {
      sendTelemetry('page', 'view');
   }, [sendTelemetry]);

   const [searchTerm, setSearchTerm] = useState('');
   const [showImages, setShowImages] = useState(false);
   const [showFilters, setShowFilters] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    // Estado local para EAN e código interno
    const [eanValue, setEanValue] = useState('');
    const [internalCodeValue, setInternalCodeValue] = useState('');
    const internalCodeRef = useRef<HTMLInputElement>(null);

    // Preenche os campos ao abrir para edição
    useEffect(() => {
       if (selectedProduct) {
          setEanValue(selectedProduct.gtin || selectedProduct.ean || '');
          setInternalCodeValue(selectedProduct.internalCode || '');
       } else {
          setEanValue('');
          setInternalCodeValue('');
       }
    }, [selectedProduct, isCreateModalOpen]);
   
   const toggleSort = (key: SortKey) => {
      setSortConfig(prev => {
         const next = prev.key === key ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' };
         sendTelemetry('sort', 'toggle', { key, direction: next.direction });
         return next;
      });
   };

   const renderSortIcon = (key: SortKey) => {
      const isActive = sortConfig.key === key;
      if (!isActive) {
         return <ChevronUp size={12} className="opacity-0 group-hover:opacity-60 transition-all duration-150" strokeWidth={3} />;
      }
      if (sortConfig.direction === 'asc') {
         return <ChevronUp size={12} className="text-accent transition-transform duration-150 -translate-y-0.5" strokeWidth={3} />;
      }
      return <ChevronDown size={12} className="text-accent transition-transform duration-150 translate-y-0.5" strokeWidth={3} />;
   };

   // Estado do popup de feedback
   const [popup, setPopup] = useState<{ open: boolean; type: 'success' | 'error' | 'info' | 'loading'; title: string; message: string }>(
      { open: false, type: 'info', title: '', message: '' }
   );

   // Estado local para o tipo selecionado no modal
   const [modalType, setModalType] = useState<'product' | 'service'>('product');

   // Função para exibir o popup
   function showPopup(type: 'success' | 'error' | 'info' | 'loading', title: string, message: string) {
      setPopup({ open: true, type, title, message });
   }

   // Fecha dropdowns ao clicar fora
   React.useEffect(() => {
      function handleClickOutside(e: MouseEvent) {
         const catMenu = document.getElementById('category-filter-menu');
         const stockMenu = document.getElementById('stock-filter-menu');
         if (showCategoryList && catMenu && !catMenu.contains(e.target as Node)) {
            setShowCategoryList(false);
         }
         if (showStockList && stockMenu && !stockMenu.contains(e.target as Node)) {
            setShowStockList(false);
         }
      }
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
   }, [showCategoryList, showStockList]);
   const fileInputRef = useRef<HTMLInputElement>(null);


   // Fecha modais com ESC
   React.useEffect(() => {
      function handleKeyDown(e: KeyboardEvent) {
         if (e.key === 'Escape') {
            setIsCreateModalOpen(false);
            setIsImportModalOpen(false);
            setIsColumnMappingModalOpen(false);
            setIsPreviewModalOpen(false);
         }
      }
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
   }, []);


   // --- NOVO: Produtos da API ---
   const [products, setProducts] = useState<Product[]>([]);
   const [loading, setLoading] = useState(false);
   const [error, setError] = useState<string | null>(null);

   // Buscar categorias, fornecedores e produtos apenas uma vez ao iniciar
   React.useEffect(() => {
      setLoading(true);
      fetch('/api/categories')
         .then(res => res.json())
         .then(data => setCategories(data.items || []));
      setIsSupplierLoading(true);
      fetch('/api/suppliers')
         .then(res => res.json())
         .then(data => setSuppliers(data.items || []))
         .catch(() => setSuppliers([]))
         .finally(() => setIsSupplierLoading(false));
      // Buscar todos os produtos uma vez
      fetch(`/api/products?limit=${PRODUCTS_FETCH_LIMIT}`)
         .then(res => {
            if (!res.ok) throw new Error('Erro ao buscar produtos');
            return res.json();
         })
         .then(data => {
            const items = (data.items || data.products || []).map((product: any) => mapApiProductToUi(product));
            setProducts(items);
            setError(null);
         })
         .catch(() => {
            setError('Erro ao carregar produtos da API.');
            setProducts([]);
         })
         .finally(() => setLoading(false));
   }, []);

   const filtered = useMemo(() => {
      const base = products.filter(p => {
         const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || (p.gtin || '').includes(searchTerm);
         const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
         const matchesStock = stockStatus === 'all' || (stockStatus === 'low' ? p.stock < (p.minStock || 20) : p.stock >= (p.minStock || 20));
         return matchesSearch && matchesCategory && matchesStock;
      });

      const sorted = [...base].sort((a, b) => {
         const dir = sortConfig.direction === 'asc' ? 1 : -1;
         const getVal = (p: Product) => {
            switch (sortConfig.key) {
               case 'costPrice': return p.costPrice ?? 0;
               case 'salePrice': return p.salePrice ?? 0;
               case 'stock': return p.stock ?? 0;
               default: return (p.name || '').toLowerCase();
            }
         };

         const va = getVal(a);
         const vb = getVal(b);

         if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * dir;
         const na = typeof va === 'number' ? va : 0;
         const nb = typeof vb === 'number' ? vb : 0;
         if (na > nb) return 1 * dir;
         if (na < nb) return -1 * dir;
         return 0;
      });

      return sorted;
   }, [products, searchTerm, selectedCategory, stockStatus, sortConfig]);
   // Função para deletar produto
   async function handleDeleteProduct(productId: string) {
      if (!window.confirm('Tem certeza que deseja remover este produto?')) return;
      try {
         sendTelemetry('product', 'delete-start', { productId });
         const res = await fetch(`/api/products/${productId}`, { method: 'DELETE' });
         if (!res.ok && res.status !== 204) {
            let msg = 'Erro ao remover produto';
            try {
               const errData = await res.json();
               if (errData?.error?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || (errData?.error?.message && errData.error.message.includes('FOREIGN KEY'))) {
                  msg = 'Não é possível remover este produto/serviço porque ele está vinculado a vendas ou movimentações. Considere inativar o item em vez de deletar.';
               }
            } catch {}
            showPopup('error', 'Erro ao remover produto/serviço', msg);
            sendTelemetry('product', 'delete-error', { productId, message: msg });
            return;
         }
         setProducts(prev => prev.filter(p => p.id !== productId));
         setSelectedProduct(null);
         showPopup('success', 'Produto removido', 'O produto foi removido com sucesso.');
         sendTelemetry('product', 'delete-success', { productId });
      } catch (err) {
         showPopup('error', 'Erro ao remover produto/serviço', 'Tente novamente.');
         sendTelemetry('product', 'delete-error', { productId, message: err instanceof Error ? err.message : 'unknown' });
      }
   }

   // --- Adicionar no início do componente Products ---
   // Função para submit do novo produto

   async function handleProductSubmit(e: React.FormEvent<HTMLFormElement>) {
      e.preventDefault();
      if (isSavingProduct) return;
      const form = e.currentTarget;
      const formData = new FormData(form);
      const type = formData.get('type') as string || 'product';
      const isService = type === 'service';
      const payload: ProductFormPayload = {
         name: String(formData.get('name') || '').trim(),
         unit: isService ? 'serv' : (String(formData.get('unit') || 'unit') as ProductFormPayload['unit']),
         status: autoActive ? 'active' : 'inactive',
         costPrice: Number(formData.get('costPrice')) || 0,
         salePrice: Number(formData.get('salePrice')) || 0,
         stockOnHand: isService ? 0 : (Number(formData.get('stockOnHand')) || 0),
         minStock: Number(formData.get('minStock')) || 0,
         autoDiscountEnabled: formData.get('autoDiscountEnabled') === 'on' ? true : false,
         autoDiscountValue: Number(formData.get('autoDiscountValue')) || 0,
         imageUrl: selectedProduct?.imageUrl || formData.get('imageUrl') || '',
         categoryId: String(formData.get('categoryId') || '') || null,
         supplierId: isService ? null : (String(formData.get('supplier') || '') || null),
         type: type === 'service' ? 'service' : 'product',
         ean: null,
         internalCode: null,
      };
      if (!isService) {
         payload.ean = String(eanValue || formData.get('gtin') || '').trim();
         payload.internalCode = String(internalCodeValue || formData.get('internalCode') || '').trim();
         // Validação frontend antes de enviar
         if (!payload.ean || !payload.internalCode) {
            showPopup('error', 'Campos obrigatórios', 'Para produtos, o EAN e Código Interno são obrigatórios.');
            return;
         }
      } else {
         payload.ean = null;
         payload.internalCode = null;
      }
      const validationError = validateProductPayload(payload);
      if (validationError) {
         showPopup('error', 'Validação de cadastro', validationError);
         return;
      }
      setIsSavingProduct(true);
      try {
         sendTelemetry('product', 'submit-start', { mode: selectedProduct ? 'update' : 'create', type, status: payload.status });
         let res;
         let product;
         const createIdempotencyKey = !selectedProduct
            ? (`prd-create-${Date.now()}-${Math.random().toString(36).slice(2)}`)
            : null;
         if (selectedProduct) {
            res = await fetch(`/api/products/${selectedProduct.id}`, {
               method: 'PUT',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify(payload)
            });
         } else {
            res = await fetch('/api/products', {
               method: 'POST',
               headers: {
                  'Content-Type': 'application/json',
                  'Idempotency-Key': createIdempotencyKey || '',
               },
               body: JSON.stringify(payload)
            });
         }
         if (!res.ok) {
            let errMsg = 'Erro ao salvar produto';
            let errData: any = {};
            try {
               errData = await res.json();
               if (errData && errData.error && errData.error.message) {
                  errMsg = errData.error.message;
               }
            } catch {}
            console.error('[Produto/Serviço][ERRO]', errMsg, errData, payload);
            showPopup('error', 'Erro ao salvar produto/serviço', errMsg);
            // Impede reload automático
            return;
         }
         ({ product } = await res.json());

         // Se houver imagem selecionada e for criação, faz upload agora
         if (!selectedProduct && imageFile && product?.id) {
            const formData = new FormData();
            formData.append('image', imageFile);
            formData.append('ean', product.ean || product.gtin || '');
            formData.append('description', product.name || '');
            sendTelemetry('image', 'upload-create', { productId: product.id, name: imageFile.name });
            try {
               const imgRes = await fetch('/api/products/upload-image', {
                  method: 'POST',
                  body: formData
               });
               const imgData = await imgRes.json();
               if (imgData.imageUrl) {
                  // Atualiza produto com todos os campos obrigatórios + imageUrl
                  const updatePayload = {
                     name: product.name,
                     ean: product.ean,
                     internalCode: product.internal_code || product.internalCode,
                     unit: product.unit,
                     costPrice: typeof product.cost_price === 'number' ? product.cost_price / 100 : product.costPrice,
                     salePrice: typeof product.sale_price === 'number' ? product.sale_price / 100 : product.salePrice,
                     autoDiscountEnabled: product.auto_discount_enabled === 1 || product.autoDiscountEnabled === true,
                     autoDiscountValue: typeof product.auto_discount_value === 'number' ? product.auto_discount_value / 100 : product.autoDiscount,
                     status: product.status,
                     stockOnHand: product.stock_on_hand ?? product.stock ?? 0,
                     minStock: product.min_stock ?? 20,
                     categoryId: product.category_id || product.category,
                     supplierId: product.supplier_id || product.supplier || '',
                     imageUrl: imgData.imageUrl,
                     type: product.type || 'product',
                  };
                  await fetch(`/api/products/${product.id}`, {
                     method: 'PUT',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify(updatePayload)
                  });
                  product.imageUrl = imgData.imageUrl;
               }
            } catch (err) {
               // Não bloqueia criação se upload falhar
               sendTelemetry('image', 'upload-create-error', { productId: product.id, message: err instanceof Error ? err.message : 'unknown' });
            }
         }

         const mappedProduct = mapApiProductToUi(product);
         setProducts(prev => upsertProductInList(prev, mappedProduct));
         setIsCreateModalOpen(false);
         setSelectedProduct(null);
         setImageFile(null);
         // Buscar produtos atualizados para garantir sincronia
         setLoading(true);
         fetch(`/api/products?limit=${PRODUCTS_FETCH_LIMIT}`)
            .then(res => res.json())
            .then(data => {
               const items = (data.items || data.products || []).map((product: any) => mapApiProductToUi(product));
               setProducts(items);
               setError(null);
            })
            .catch(() => {
               setError('Erro ao carregar produtos da API.');
               setProducts([]);
            })
            .finally(() => setLoading(false));
         showPopup('success', selectedProduct ? 'Produto/Serviço atualizado' : 'Produto/Serviço criado', selectedProduct ? 'O item foi atualizado com sucesso.' : 'O item foi criado com sucesso.');
         sendTelemetry('product', 'submit-success', {
            mode: selectedProduct ? 'update' : 'create',
            productId: mappedProduct.id,
            type: mappedProduct.type,
            status: mappedProduct.status,
            salePriceCents: Math.round((payload.salePrice || 0) * 100),
            stock: mappedProduct.stock
         });
      } catch (err) {
         let msg = 'Verifique os campos e tente novamente.';
         if (err instanceof Error && err.message) {
            msg = err.message;
         }
         showPopup('error', 'Erro ao salvar produto/serviço', msg);
         sendTelemetry('product', 'submit-error', { mode: selectedProduct ? 'update' : 'create', message: err instanceof Error ? err.message : 'unknown' });
      } finally {
         setIsSavingProduct(false);
      }
   }


   // Simulação de Importação

   const handleMappingChange = (field: string, column: string) => {
      setColumnMapping(prev => ({ ...prev, [field]: column }));
   };

   function openColumnMappingForRows(data: any[]) {
      if (!Array.isArray(data) || data.length === 0) {
         setIsUploading(false);
         showPopup('error', 'Arquivo vazio', 'Nenhum registro encontrado no arquivo importado.');
         sendTelemetry('import', 'parse-empty');
         return;
      }

      const headers = Array.from<string>(
         data.reduce((set, row) => {
            Object.keys(row || {}).forEach(key => set.add(String(key)));
            return set;
         }, new Set<string>())
      );

      if (headers.length === 0) {
         setIsUploading(false);
         showPopup('error', 'Arquivo invalido', 'Nao foi possivel identificar cabecalhos para mapeamento.');
         sendTelemetry('import', 'parse-empty-headers');
         return;
      }

      setRawImportRows(data);
      setImportHeaders(headers);
      setColumnMapping(suggestColumnMapping(headers));
      setIsUploading(false);
      setIsImportModalOpen(false);
      setIsColumnMappingModalOpen(true);
      sendTelemetry('modal', 'open', { entity: 'product-import-mapping', total: data.length, headers: headers.length });
   }

   const handleConfirmColumnMapping = () => {
      const missingRequired = REQUIRED_IMPORT_FIELDS.filter(field => !columnMapping[field]);
      if (missingRequired.length > 0) {
         const missingLabels = IMPORT_FIELDS.filter(field => missingRequired.includes(field.key)).map(field => field.label).join(', ');
         showPopup('error', 'Mapeamento incompleto', `Mapeie as colunas obrigatorias: ${missingLabels}.`);
         return;
      }

      const selectedColumns = Object.values(columnMapping).filter(Boolean);
      const hasDuplicates = new Set(selectedColumns).size !== selectedColumns.length;
      if (hasDuplicates) {
         showPopup('error', 'Mapeamento invalido', 'Cada campo deve usar uma coluna diferente.');
         return;
      }

      setIsColumnMappingModalOpen(false);
      processImportRows(rawImportRows, columnMapping);
   };

   // Função para importar CSV ou XLSX
   const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setIsUploading(true);
      const ext = file.name.split('.').pop()?.toLowerCase();
      sendTelemetry('import', 'file-select', { name: file.name, size: file.size, ext });
      if (ext === 'csv' || ext === 'txt') {
         Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results: any) => openColumnMappingForRows(results.data),
            error: () => {
               setIsUploading(false);
               alert('Erro ao ler arquivo.');
               sendTelemetry('import', 'file-parse-error', { ext, reason: 'papa-parse' });
            }
         });
      } else if (ext === 'xlsx') {
         const reader = new FileReader();
         reader.onload = (evt) => {
            const data = new Uint8Array(evt.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
            openColumnMappingForRows(json as any[]);
         };
         reader.onerror = () => {
            setIsUploading(false);
            alert('Erro ao ler arquivo XLSX.');
            sendTelemetry('import', 'file-parse-error', { ext, reason: 'xlsx-read' });
         };
         reader.readAsArrayBuffer(file);
      } else {
         setIsUploading(false);
         alert('Formato de arquivo não suportado. Use .csv, .txt ou .xlsx');
         sendTelemetry('import', 'file-unsupported', { ext });
      }
   };

   // Função para processar linhas importadas
   function processImportRows(data: any[], mapping: Record<ImportField, string>) {
      // Esperado: internalCode, gtin, name, costPrice, salePrice, stock, [supplier], [category]
      const rows = data.map((row: any, idx: number) => {
         const errors = [];
         const getFieldValue = (field: ImportField) => {
            const mappedColumn = mapping[field];
            return mappedColumn ? row?.[mappedColumn] : '';
         };
         // Sempre tratar códigos como string
         const internalCode = String(getFieldValue('internalCode') ?? '').trim();
         const gtin = String(getFieldValue('gtin') ?? '').trim();
         const name = String(getFieldValue('name') ?? '').trim();
         const costRaw = getFieldValue('costPrice');
         const saleRaw = getFieldValue('salePrice');
         const stockRaw = getFieldValue('stock');
         const supplier = String(getFieldValue('supplier') ?? '').trim();
         const category = String(getFieldValue('category') ?? '').trim();
         const rawType = getFieldValue('type');
         const rawUnit = getFieldValue('unit');
         const rawStatus = getFieldValue('status');
         let itemType = parseImportType(rawType, rawUnit);
         const itemStatus = parseImportStatus(rawStatus);
         const hasTypeValue = String(rawType ?? '').trim() !== '';
         const hasUnitValue = String(rawUnit ?? '').trim() !== '';
         const hasGtinValue = gtin.length > 0;
         const hasInternalCodeValue = internalCode.length > 0;
         const shouldInferService = !hasTypeValue && !hasUnitValue && !hasGtinValue && !hasInternalCodeValue;
         if (itemType === 'product' && shouldInferService) {
            itemType = 'service';
         }
         const isService = itemType === 'service';
         const itemUnit = parseImportUnit(rawUnit, itemType);

         const hasCost = String(costRaw ?? '').trim() !== '';
         const hasSale = String(saleRaw ?? '').trim() !== '';
         const hasStock = String(stockRaw ?? '').trim() !== '';
         const costPrice = parseImportedNumber(costRaw);
         const salePrice = parseImportedNumber(saleRaw);
         const stockValue = parseImportedNumber(stockRaw);

         if (!isService && !internalCode) errors.push('Código interno obrigatório');
         if (!isService && !gtin) errors.push('EAN obrigatório');
         if (!name) errors.push('Descrição obrigatória');
         if (!hasSale) errors.push('Preço de venda obrigatório');
         if (!isService && !hasCost) errors.push('Preço de custo obrigatório');
         if (!isService && !hasStock) errors.push('Quantidade obrigatória');
         if (!isService && hasCost && Number.isNaN(costPrice)) errors.push('Preço de custo inválido');
         if (hasSale && Number.isNaN(salePrice)) errors.push('Preço de venda inválido');
         if (!isService && hasStock && Number.isNaN(stockValue)) errors.push('Quantidade inválida');

         // Verifica duplicidade no banco atual
         const eanExists = !!gtin && products.some(p => p.gtin === gtin);
         const codeExists = !!internalCode && products.some(p => p.internalCode === internalCode);
         if (!isService && eanExists) errors.push('EAN já existe');
         if (!isService && codeExists) errors.push('Código interno já existe');

         return {
            id: `import-${idx}`,
            internalCode,
            gtin,
            name,
            costPrice: Number.isNaN(costPrice) ? 0 : costPrice,
            salePrice: Number.isNaN(salePrice) ? 0 : salePrice,
            stock: isService ? 0 : (Number.isNaN(stockValue) ? 0 : Math.max(0, Math.trunc(stockValue))),
            supplier,
            category,
            type: itemType,
            unit: itemUnit,
            statusValue: itemStatus,
            status: errors.length ? 'error' : 'valid',
            message: errors.join(', ')
         };
      });
      setImportResults(rows);
      setIsUploading(false);
      setIsImportModalOpen(false);
      setIsPreviewModalOpen(true);
      const valid = rows.filter(r => r.status === 'valid').length;
      const invalid = rows.length - valid;
      sendTelemetry('modal', 'open', { entity: 'product-import-preview', total: rows.length });
      sendTelemetry('import', 'parse', { rows: rows.length, valid, invalid, mappedColumns: Object.values(mapping).filter(Boolean).length });
   }

   const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
         sendTelemetry('import', 'drop', { files: e.dataTransfer.files.length });
         // Cria um evento fake para reutilizar handleImportFile
         const fakeEvent = {
            target: { files: e.dataTransfer.files }
         } as unknown as React.ChangeEvent<HTMLInputElement>;
         handleImportFile(fakeEvent);
         e.dataTransfer.clearData();
      }
   };

   const handleCreateCategory = async () => {
      if (!newCategoryName.trim()) return;
      try {
         const res = await fetch('/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newCategoryName.trim() })
         });
         if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert(err?.error?.message || 'Erro ao criar categoria');
            return;
         }
         setNewCategoryName('');
         setIsCategoryModalOpen(false);
         // Atualizar lista de categorias do backend
         const cats = await fetch('/api/categories').then(r => r.json());
         setCategories(cats.items || []);
         sendTelemetry('category', 'create-success', { name: newCategoryName.trim() });
      } catch (e) {
         alert('Erro ao criar categoria');
         sendTelemetry('category', 'create-error', { name: newCategoryName.trim() });
      }
   };

   // Função para exportar os produtos para XLSX
   const handleExportFile = () => {
      try {
         sendTelemetry('export', 'start', { count: filtered.length });

         const dataToExport = filtered.map(p => ({
            'Código Interno': p.internalCode || '',
            'GTIN (EAN)': p.gtin || '',
            'Nome': p.name || '',
            'Unidade': p.unit || '',
            'Preço Custo': p.costPrice || 0,
            'Preço Venda': p.salePrice || 0,
            'Estoque': p.stock || 0,
            'Categoria': categories.find(c => c.id === p.category)?.name || '',
            'Fornecedor': suppliers.find(s => s.id === p.supplier)?.name || p.supplier || '',
            'Status': p.status === 'active' ? 'Ativo' : 'Inativo',
            'Tipo': p.type === 'service' ? 'Serviço' : 'Produto'
         }));

         const worksheet = XLSX.utils.json_to_sheet(dataToExport);
         const workbook = XLSX.utils.book_new();
         XLSX.utils.book_append_sheet(workbook, worksheet, "Produtos");

         // Gerar arquivo e baixar
         XLSX.writeFile(workbook, `exportacao_produtos_${new Date().toISOString().split('T')[0]}.xlsx`);

         sendTelemetry('export', 'success', { count: filtered.length });
         showPopup('success', 'Sucesso!', 'Os dados foram exportados com sucesso.');
      } catch (error) {
         console.error('Erro ao exportar:', error);
         sendTelemetry('export', 'error', { message: error instanceof Error ? error.message : 'unknown' });
         showPopup('error', 'Erro na Exportação', 'Não foi possível gerar o arquivo Excel.');
      }
   };

   React.useEffect(() => {
      // Reset autoActive e tipo do modal ao abrir/fechar
      if (isCreateModalOpen && !selectedProduct) {
         setAutoActive(true);
         setModalType('product');
      }
      if (selectedProduct) {
         setModalType(selectedProduct.type || 'product');
      }
      if (!isCreateModalOpen) setAutoActive(true);
   }, [isCreateModalOpen, selectedProduct]);

   return (


      <div className="p-4 flex flex-col h-full overflow-hidden assemble-view bg-dark-950 bg-cyber-grid">
         {/* Header Section */}
         <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 shrink-0 mb-8 relative z-10">
            <div>
               <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                  <Package className="text-accent" /> Gestão de Ativos
               </h1>
               <p className="text-slate-500 text-sm font-medium">Controle do inventário e precificação.</p>
            </div>




            <div className="flex items-center gap-3">
               <div className="flex items-center bg-dark-900/50 p-1 rounded-xl border border-white/5 mr-2">
                  <button
                     onClick={() => { setShowImages(false); sendTelemetry('view', 'switch', { mode: 'list' }); }}
                     className={`p-2 rounded-lg transition-all ${!showImages ? 'bg-accent/20 text-accent' : 'text-slate-500 hover:text-slate-300'}`}
                     title="Visualização em Lista"
                  >
                     <List size={18} />
                  </button>
                  <button
                     onClick={() => { setShowImages(true); sendTelemetry('view', 'switch', { mode: 'cards' }); }}
                     className={`p-2 rounded-lg transition-all ${showImages ? 'bg-accent/20 text-accent' : 'text-slate-500 hover:text-slate-300'}`}
                     title="Visualização em Cards"
                  >
                     <Grid2X2 size={18} />
                  </button>
               </div>
               <Button variant="secondary" onClick={() => { const next = !showFilters; setShowFilters(next); sendTelemetry('filters', next ? 'open' : 'close'); }} icon={<Filter size={18} />} className={showFilters ? 'border-accent text-accent' : ''}>Filtros</Button>
               {!isOperatorUser && (
                  <>
                     <Button variant="secondary" onClick={() => { setIsImportModalOpen(true); sendTelemetry('modal', 'open', { entity: 'product-import' }); }} icon={<UploadCloud size={18} />}>
                        Importar
                     </Button>
                     <Button variant="secondary" onClick={handleExportFile} icon={<FileSpreadsheet size={18} />}>
                        Exportar
                     </Button>
                     <Button
                        className="hidden sm:inline-flex"
                        onClick={() => { setIsCreateModalOpen(true); setSelectedProduct(null); sendTelemetry('modal', 'open', { entity: 'product', mode: 'create' }); }}
                        icon={<Plus size={18} />}
                     >Novo Produto</Button>
                  </>
               )}

            </div>
         </div>

         {showFilters && (
            <div className="mb-8 p-6 bg-dark-900/40 border border-accent/10 rounded-3xl grid grid-cols-1 md:grid-cols-12 gap-6 animate-in slide-in-from-top-4 duration-300 relative z-10 items-end">
               <div className="md:col-span-4">
                  <Input label="Pesquisa Global" placeholder="Busca por nome ou GTIN..." icon={<Search size={18} />} value={searchTerm} onChange={e => { const value = e.target.value; setSearchTerm(value); sendTelemetry('search', 'type', { length: value.length, hasDigits: /\d/.test(value) }); }} />
               </div>
               <div className="md:col-span-3 space-y-2">
                  <label className="block text-[10px] uppercase tracking-widest font-semibold text-slate-500 ml-1">Filtro por Categoria</label>
                  <div className="relative" id="category-filter-menu">
                     <button
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all ${selectedCategory === 'all' ? 'bg-accent/20 border-accent text-accent' : 'bg-dark-950/50 border-white/10 text-slate-300 hover:bg-accent/10 hover:text-accent'}`}
                        onClick={() => { setShowCategoryList(prev => { const next = !prev; if (next) sendTelemetry('filters', 'open-category'); return next; }); }}
                        style={{ minWidth: 180 }}
                     >
                        {selectedCategory === 'all' ? 'Todas Categorias' : (categories.find(c => c.id === selectedCategory)?.name || 'Categoria')}
                        <ChevronRight size={16} className={`ml-2 transition-transform ${showCategoryList ? 'rotate-90' : ''}`} />
                     </button>
                     {showCategoryList && (
                        <div
                           className="absolute left-0 mt-2 w-full bg-dark-950 border border-white/10 rounded-xl shadow-2xl z-50"
                           style={{ maxHeight: 320, overflowY: 'auto' }}
                        >
                           {categories.length === 0 && (
                              <div className="px-4 py-2 text-slate-500 text-xs">Nenhuma categoria cadastrada</div>
                           )}
                           <button
                              className={`w-full text-left px-4 py-2 text-xs font-semibold ${selectedCategory === 'all' ? 'text-accent bg-accent/10' : 'text-slate-300 hover:bg-accent/10 hover:text-accent'}`}
                              onClick={() => { setSelectedCategory('all'); setShowCategoryList(false); sendTelemetry('filters', 'select-category', { category: 'all' }); }}
                           >
                              Todas Categorias
                           </button>
                           {categories.map(c => (
                              <div key={c.id} className="flex items-center justify-between px-4 py-2 hover:bg-accent/10">
                                 <button
                                    className={`truncate text-left flex-1 ${selectedCategory === c.id ? 'text-accent' : 'text-slate-300 hover:text-accent'}`}
                                    onClick={() => { setSelectedCategory(c.id); setShowCategoryList(false); sendTelemetry('filters', 'select-category', { category: c.id }); }}
                                    title={c.name}
                                 >
                                    {c.name}
                                 </button>
                                 {!isOperatorUser && (
                                    <button
                                       className="ml-2 p-1 text-red-500 hover:bg-red-500/10 rounded"
                                       title="Excluir categoria"
                                       onClick={async (e) => {
                                          e.stopPropagation();
                                          if (!window.confirm(`Excluir categoria \"${c.name}\"?`)) return;
                                          sendTelemetry('category', 'delete-start', { categoryId: c.id });
                                          try {
                                             const res = await fetch(`/api/categories/${c.id}`, { method: 'DELETE' });
                                             if (res.ok) {
                                                setCategories(prev => prev.filter(cat => cat.id !== c.id));
                                                if (selectedCategory === c.id) setSelectedCategory('all');
                                                sendTelemetry('category', 'delete-success', { categoryId: c.id });
                                             } else {
                                                alert('Erro ao excluir categoria.');
                                                sendTelemetry('category', 'delete-error', { categoryId: c.id, reason: 'response' });
                                             }
                                          } catch {
                                             alert('Erro ao excluir categoria.');
                                             sendTelemetry('category', 'delete-error', { categoryId: c.id, reason: 'exception' });
                                          }
                                       }}
                                    >
                                       <Trash2 size={14} />
                                    </button>
                                 )}
                              </div>
                           ))}
                           {!isOperatorUser && (
                              <button
                                 onClick={() => { setIsCategoryModalOpen(true); setShowCategoryList(false); }}
                                 className="w-full flex items-center gap-2 px-4 py-2 text-accent hover:bg-accent/10 text-xs font-semibold border-t border-white/10"
                              >
                                 <FolderPlus size={16} /> Nova Categoria
                              </button>
                           )}
                        </div>
                     )}
                  </div>
               </div>
               <div className="md:col-span-3">
                  <label className="block text-[10px] uppercase tracking-widest font-semibold text-slate-500 ml-1 mb-2">Estado do Estoque</label>
                  <div className="relative" id="stock-filter-menu">
                     <button
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all ${stockStatus === 'all' ? 'bg-accent/20 border-accent text-accent' : 'bg-dark-950/50 border-white/10 text-slate-300 hover:bg-accent/10 hover:text-accent'}`}
                        onClick={() => { setShowStockList(prev => { const next = !prev; if (next) sendTelemetry('filters', 'open-stock'); return next; }); }}
                        style={{ minWidth: 180 }}
                     >
                        {stockStatus === 'all' ? 'Todo Estoque' : stockStatus === 'low' ? 'Estoque Crítico' : 'Estoque Normal'}
                        <ChevronRight size={16} className={`ml-2 transition-transform ${showStockList ? 'rotate-90' : ''}`} />
                     </button>
                     {showStockList && (
                        <div className="absolute left-0 mt-2 w-full bg-dark-950 border border-white/10 rounded-xl shadow-2xl z-50">
                           <button
                              className={`w-full text-left px-4 py-2 text-xs font-semibold ${stockStatus === 'all' ? 'text-accent bg-accent/10' : 'text-slate-300 hover:bg-accent/10 hover:text-accent'}`}
                              onClick={() => { setStockStatus('all'); setShowStockList(false); sendTelemetry('filters', 'select-stock', { stock: 'all' }); }}
                           >
                              Todo Estoque
                           </button>
                           <button
                              className={`w-full text-left px-4 py-2 text-xs font-semibold ${stockStatus === 'low' ? 'text-accent bg-accent/10' : 'text-slate-300 hover:bg-accent/10 hover:text-accent'}`}
                              onClick={() => { setStockStatus('low'); setShowStockList(false); sendTelemetry('filters', 'select-stock', { stock: 'low' }); }}
                           >
                              Estoque Crítico
                           </button>
                           <button
                              className={`w-full text-left px-4 py-2 text-xs font-semibold ${stockStatus === 'normal' ? 'text-accent bg-accent/10' : 'text-slate-300 hover:bg-accent/10 hover:text-accent'}`}
                              onClick={() => { setStockStatus('normal'); setShowStockList(false); sendTelemetry('filters', 'select-stock', { stock: 'normal' }); }}
                           >
                              Estoque Normal
                           </button>
                        </div>
                     )}
                  </div>
               </div>
               <div className="md:col-span-2">
                  <Button variant="ghost" className="w-full py-3 h-[46px] text-[10px] tracking-[0.2em]" onClick={() => { setSearchTerm(''); setSelectedCategory('all'); setStockStatus('all'); sendTelemetry('filters', 'clear'); }}>Limpar Filtros</Button>
               </div>
            </div>
         )}

         {/* Main Content Area */}
         <div className="flex-1 overflow-hidden flex flex-col min-h-0 relative z-0">
            <div className="flex-1 min-h-0 max-h-[calc(100vh-160px)] overflow-y-auto pr-2 custom-scrollbar">
               {!showImages ? (
                  /* LIST VIEW */
                  <section className="relative rounded-3xl border border-white/10 bg-dark-950/40 backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.45)] overflow-hidden animate-in fade-in duration-500 mb-8">
                     <div className="pointer-events-none absolute inset-0 opacity-[0.22]">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.18),transparent_45%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(168,85,247,0.14),transparent_55%)]" />
                        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[length:100%_12px]" />
                        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[length:22px_100%] opacity-[0.35]" />
                     </div>
                     <div className="relative rounded-2xl border border-white/10 bg-dark-900/30 overflow-hidden">
                        <div
                           className={[
                              "w-full overflow-x-auto overflow-y-auto",
                              "max-h-[calc(92vh-180px)] min-h-[420px]",
                              "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
                           ].join(" ")}
                        >
                           <table className="min-w-[900px] w-full text-xs text-left text-slate-100 border-separate border-spacing-0">
                              <thead className="sticky top-0 z-20 bg-dark-950/80 backdrop-blur-xl">
                                 <tr>
                                    <th
                                       className="group py-4 px-5 border-b border-white/10 bg-dark-950/80 backdrop-blur-xl text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400 min-w-[220px] max-w-[420px] cursor-pointer hover:text-accent transition-all"
                                       onClick={() => toggleSort('name')}
                                    >
                                       <span className="flex items-center gap-2">
                                          Identificação
                                          {renderSortIcon('name')}
                                       </span>
                                    </th>
                                    {/* Desktop only columns */}
                                    <th
                                       className="group py-4 px-3 border-b border-white/10 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400 cursor-pointer hover:text-accent transition-all hidden md:table-cell"
                                       onClick={() => toggleSort('costPrice')}
                                    >
                                       <span className="flex items-center gap-2">
                                          Preço Custo
                                          {renderSortIcon('costPrice')}
                                       </span>
                                    </th>
                                    <th
                                       className="group py-4 px-3 border-b border-white/10 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400 cursor-pointer hover:text-accent transition-all hidden md:table-cell"
                                       onClick={() => toggleSort('salePrice')}
                                    >
                                       <span className="flex items-center gap-2">
                                          Preço Venda
                                          {renderSortIcon('salePrice')}
                                       </span>
                                    </th>
                                    {/* Estoque column always visible */}
                                    <th
                                       className="group py-4 px-3 border-b border-white/10 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400 cursor-pointer hover:text-accent transition-all"
                                       onClick={() => toggleSort('stock')}
                                    >
                                       <span className="flex items-center gap-2">
                                          Estoque
                                          {renderSortIcon('stock')}
                                       </span>
                                    </th>
                                    {/* Desktop only actions */}
                                    {!isOperatorUser && (
                                       <th className="py-4 px-3 border-b border-white/10 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400 text-right hidden md:table-cell">
                                          Ações
                                       </th>
                                    )}
                                 </tr>
                              </thead>
                              <tbody>
                                 {filtered.length === 0 ? (
                                    <tr>
                                       <td colSpan={isOperatorUser ? 2 : 3} className="py-8 px-4 text-slate-400 text-center">
                                          Nenhum produto encontrado.
                                       </td>
                                    </tr>
                                 ) : (
                                    filtered.map((product, i) => {
                                       const isOdd = i % 2 === 1;
                                       const isLowStock = product.stock < (product.minStock || 20) && product.unit !== 'serv';
                                       return (
                                          <tr
                                             key={product.id}
                                             className={[
                                                "group transition-colors",
                                                isOdd ? "bg-white/[0.02]" : "bg-transparent",
                                                "hover:bg-cyan-500/5",
                                                "border-b border-white/5"
                                             ].join(" ")}
                                             onClick={() => {
                                                setSelectedProduct(product);
                                                sendTelemetry('modal', 'open', { entity: 'product', mode: 'edit', id: product.id });
                                             }}
                                             style={{ cursor: 'pointer' }}
                                          >
                                             {/* Identificação */}
                                             <td className={[
                                                "py-4 px-5 whitespace-nowrap bg-inherit border-r border-white/5 text-slate-100 min-w-[220px] max-w-[420px] overflow-hidden text-ellipsis flex items-center gap-4"
                                             ].join(" ")}>
                                                <div className="w-8 h-8 rounded bg-dark-800 border border-white/5 flex items-center justify-center overflow-hidden">
                                                   {product.imageUrl ? (
                                                      <img
                                                         src={product.imageUrl?.startsWith('/uploads/') ? product.imageUrl : `/uploads/${product.imageUrl}`}
                                                         className="w-full h-full object-cover opacity-50 group-hover:opacity-100 transition-opacity"
                                                         alt={product.name}
                                                      />
                                                   ) : (
                                                      <Cpu className="text-accent opacity-40" size={20} />
                                                   )}
                                                </div>
                                                <span className="truncate block font-bold text-slate-100 text-xs sm:text-sm">{product.name}</span>
                                             </td>
                                             {/* Preço Custo - desktop only */}
                                             <td className="py-4 px-3 whitespace-nowrap font-num text-slate-100 hidden md:table-cell">
                                                {product.costPrice ? product.costPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-'}
                                             </td>
                                             {/* Preço Venda - desktop only */}
                                             <td className="py-4 px-3 whitespace-nowrap font-num text-slate-100 hidden md:table-cell">
                                                {product.salePrice ? product.salePrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-'}
                                             </td>
                                             {/* Estoque - always visible */}
                                             <td className={[
                                                "py-4 px-3 whitespace-nowrap font-num",
                                                isLowStock ? "text-rose-300" : "text-emerald-300"
                                             ].join(" ")}>
                                                {product.unit === 'serv' ? '-' : `${product.stock} ${product.unit}`}
                                             </td>
                                             {/* Ações - desktop only */}
                                             {!isOperatorUser && (
                                                <td className="py-4 px-3 whitespace-nowrap text-right flex gap-2 justify-end hidden md:table-cell">
                                                   <button
                                                      className="p-2 text-slate-500 hover:text-accent transition-colors"
                                                      onClick={e => {
                                                         e.stopPropagation();
                                                         setSelectedProduct(product);
                                                         sendTelemetry('modal', 'open', { entity: 'product', mode: 'edit', id: product.id });
                                                      }}
                                                      title="Editar"
                                                   >
                                                      <Edit2 size={14} />
                                                   </button>
                                                   <button
                                                      className="p-2 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                                                      onClick={e => {
                                                         e.stopPropagation();
                                                         handleDeleteProduct(product.id);
                                                      }}
                                                      title="Remover"
                                                   >
                                                      <Trash2 size={14} />
                                                   </button>
                                                </td>
                                             )}
                                          </tr>
                                       );
                                    })
                                 )}
                              </tbody>
                           </table>
                        </div>
                     </div>
                  </section>
               ) : (
                  /* CARD GRID VIEW */
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                     {filtered.map(product => (
                        <div
                           key={product.id}
                           onClick={() => { setSelectedProduct(product); sendTelemetry('modal', 'open', { entity: 'product', mode: 'edit', id: product.id }); }}
                           className="glass-card group relative p-5 rounded-3xl border border-white/5 hover:border-accent/40 hover:bg-accent/5 transition-all cursor-pointer overflow-hidden flex flex-col gap-4 shadow-xl"
                        >
                           <div className="absolute top-3 right-3 z-10">
                              <Badge variant={product.stock < (product.minStock || 20) ? 'danger' : 'info'}>
                                 {product.stock < (product.minStock || 20) ? 'Crítico' : 'Estoque'}
                              </Badge>
                           </div>

                           <div className="relative h-40 w-full rounded-2xl bg-dark-950 border border-white/5 overflow-hidden flex items-center justify-center">
                              {product.imageUrl ? (
                                 <img src={product.imageUrl?.startsWith('/uploads/') ? product.imageUrl : `/uploads/${product.imageUrl}`} className="w-full h-full object-cover opacity-40 group-hover:opacity-80 group-hover:scale-110 transition-all duration-700" />
                              ) : (
                                 <Cpu className="text-accent opacity-40" size={40} />
                              )}
                              <div className="absolute inset-0 bg-gradient-to-t from-dark-900 to-transparent opacity-60" />
                           </div>

                           <div className="space-y-1">
                              <h4 className="text-sm font-bold text-slate-200 group-hover:text-accent transition-colors line-clamp-1 uppercase tracking-tight">{product.name}</h4>
                              <p className="text-[9px] font-num text-slate-500 tracking-widest uppercase">{product.gtin}</p>
                           </div>

                           <div className="mt-auto flex items-center justify-between border-t border-white/5 pt-4">
                              <div>
                                 <p className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">Preço Sugerido</p>
                                 <p className="text-lg font-num font-bold text-accent">R$ {(Number(product.salePrice) || 0).toFixed(2)}</p>
                              </div>
                              <div className="text-right">
                                 <p className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">Saldo Atual</p>
                                 <p className={`text-sm font-bold ${product.stock < (product.minStock || 20) ? 'text-red-400' : 'text-slate-300'}`}>
                                    {product.stock} <span className="text-[10px] uppercase">{product.unit}</span>
                                 </p>
                              </div>
                           </div>

                           <div className="absolute bottom-0 left-0 h-0.5 bg-accent/40 w-0 group-hover:w-full transition-all duration-500" />
                        </div>
                     ))}
                  </div>
               )}
            </div>
         </div>

         {/* MODAL CRIAR CATEGORIA */}
         <Modal
            isOpen={isCategoryModalOpen}
            onClose={() => setIsCategoryModalOpen(false)}
            title="Nova Categoria de Ativos"
            size="md"
         >
            <div className="space-y-8 animate-in zoom-in-95 duration-200">
               <div className="p-6 bg-accent/5 rounded-2xl border border-accent/20 flex items-center gap-4">
                  <div className="p-3 bg-accent/10 rounded-xl text-accent">
                     <FolderPlus size={24} />
                  </div>
                  <div>
                     <h4 className="text-xs font-bold text-white uppercase tracking-widest">Estrutura de Catálogo</h4>
                     <p className="text-[10px] text-slate-500">Defina uma nova classificação lógica para seus produtos.</p>
                  </div>
               </div>

               <div className="space-y-4">
                  <Input
                     label="Nome da Categoria"
                     placeholder="Ex: Destilados Premium"
                     value={newCategoryName}
                     onChange={e => setNewCategoryName(e.target.value)}
                     icon={<Tag size={18} className="text-accent" />}
                     className="bg-dark-950/50 border-accent/10 text-lg font-bold text-slate-100"
                     autoFocus
                     onKeyDown={(e) => e.key === 'Enter' && handleCreateCategory()}
                  />
               </div>

               <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                  <Button variant="secondary" className="py-4 uppercase text-[10px] font-bold tracking-widest" onClick={() => setIsCategoryModalOpen(false)}>Cancelar</Button>
                  <Button className="py-4 uppercase text-[10px] font-bold tracking-widest shadow-accent-glow" icon={<Check size={18} />} onClick={handleCreateCategory} disabled={!newCategoryName.trim()}>Salvar Categoria</Button>
               </div>
            </div>
         </Modal>

         {/* MODAL DETALHADO: NOVO/EDITAR PRODUTO (CYBER-INJECTION) */}
         {(isCreateModalOpen || !!selectedProduct) && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
               <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-xl" onClick={() => { setIsCreateModalOpen(false); setSelectedProduct(null); }} />
               <div className="relative w-full max-w-2xl cyber-modal-container bg-dark-900/95 rounded-2xl border border-accent/30 shadow-2xl flex flex-col max-h-[70vh]">
                  {/* Modal Header */}
                  <div className="p-2 border-b border-white/10 flex items-center justify-between relative z-10 bg-dark-950/80 rounded-t-2xl">
                     <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded bg-accent/10 border border-accent/30 flex items-center justify-center">
                           <Cpu className="text-accent animate-pulse" size={20} />
                        </div>
                        <div>
                           <h2 className="text-lg font-bold text-white uppercase tracking-[0.2em] assemble-text">
                              {selectedProduct ? 'Sincronizar Ativo' : ' Novo Ativo no'} <span className="text-accent">PDV</span>
                           </h2>
                           <p className="text-[9px] font-mono text-slate-500 uppercase flex items-center gap-2">
                              <Zap size={10} className="text-accent" /> Kernel Version 3.1.0-A // {'UPDATE_SEQ'}
                           </p>
                        </div>
                     </div>

                  </div>

                  {/* Modal Content */}
                  <div className="p-2 overflow-y-auto custom-scrollbar space-y-8 relative z-10">
                                                      <form id="product-form" onSubmit={handleProductSubmit}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <div className="space-y-2 md:col-span-1">
                              <label className="text-[10px] font-bold uppercase tracking-widest text-accent/70 assemble-text">Nomenclatura do Produto/Serviço</label>
                              <Input
                                 name="name"
                                 defaultValue={selectedProduct?.name}
                                 placeholder="Ex: Cerveja Black IPA 473ml ou Serviço de Entrega"
                                 className="bg-dark-950/50 border-accent/20 focus:border-accent"
                                 required
                                 readOnly={isOperatorUser}
                                 disabled={isOperatorUser}
                              />
                              <label className="text-[10px] font-bold uppercase tracking-widest text-accent/70 assemble-text mt-4">Tipo</label>
                              {isOperatorUser ? (
                                 <div className="w-full bg-dark-950/50 border border-accent/20 rounded-xl p-3 text-sm text-slate-200 h-[46px] flex items-center">
                                    {modalType === 'product' ? 'Produto' : 'Serviço'}
                                 </div>
                              ) : (
                                 <select
                                    name="type"
                                    value={modalType}
                                    onChange={e => { const nextType = e.target.value as 'product' | 'service'; setModalType(nextType); sendTelemetry('product', 'change-type', { type: nextType }); }}
                                    className="w-full bg-dark-950/50 border border-accent/20 rounded-xl p-3 text-sm text-slate-200 focus:border-accent outline-none transition-all h-[46px]"
                                 >
                                    <option value="product">Produto</option>
                                    <option value="service">Serviço</option>
                                 </select>
                              )}
                              {/* Campos específicos para produto */}
                              {modalType === 'product' && (
                                 <>
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 assemble-text mt-4">GTIN / EAN *</label>
                                    <div className="flex gap-2 items-center">
                                       <Input
                                          name="gtin"
                                          value={eanValue}
                                          onChange={e => setEanValue(e.target.value.replace(/\D/g, '').slice(0, 13))}
                                          placeholder="7890000000000"
                                          icon={<ShieldAlert size={14} className="text-accent/40" />}
                                          className="bg-dark-950/50 flex-1"
                                          required={modalType === 'product'}
                                          readOnly={isOperatorUser}
                                          disabled={isOperatorUser}
                                          autoFocus
                                          onKeyDown={e => {
                                             if (e.key === 'Enter') {
                                                internalCodeRef.current?.focus();
                                                e.preventDefault();
                                             }
                                          }}
                                       />
                                       {!isOperatorUser && (
                                          <Button
                                             type="button"
                                             variant="secondary"
                                             className="px-2 py-1 text-[10px] font-bold"
                                             title="Gerar EAN automaticamente [ALT+E]"
                                             onClick={() => setEanValue(generateEan())}
                                             tabIndex={0}
                                             onKeyDown={e => {
                                                if (e.key === 'Enter' || e.key === ' ') setEanValue(generateEan());
                                             }}
                                          >
                                             Gerar
                                          </Button>
                                       )}
                                    </div>
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 assemble-text mt-4">Código Interno *</label>
                                    <div className="flex gap-2 items-center">
                                       <Input
                                          name="internalCode"
                                          value={internalCodeValue}
                                          onChange={e => setInternalCodeValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                          placeholder="000000"
                                          icon={<Hash size={14} className="text-accent/40" />}
                                          className="bg-dark-950/50 flex-1"
                                          required={modalType === 'product'}
                                          readOnly={isOperatorUser}
                                          disabled={isOperatorUser}
                                          ref={internalCodeRef}
                                          onKeyDown={e => {
                                             if (e.key === 'Enter') {
                                                // Avança para o próximo campo relevante
                                                const categorySelect = document.querySelector('select[name="categoryId"]') as HTMLSelectElement | null;
                                                categorySelect?.focus();
                                                e.preventDefault();
                                             }
                                          }}
                                       />
                                       {!isOperatorUser && (
                                          <Button
                                             type="button"
                                             variant="secondary"
                                             className="px-2 py-1 text-[10px] font-bold"
                                             title="Gerar código interno automaticamente [ALT+I]"
                                             onClick={() => setInternalCodeValue(generateInternalCode())}
                                             tabIndex={0}
                                             onKeyDown={e => {
                                                if (e.key === 'Enter' || e.key === ' ') setInternalCodeValue(generateInternalCode());
                                             }}
                                          >
                                             Gerar
                                          </Button>
                                       )}
                                    </div>
                                 </>
                              )}
                           </div>
                           <div className="space-y-2 md:col-span-1">
                              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 assemble-text">Categoria</label>
                              {isOperatorUser ? (
                                 <div className="w-full bg-dark-950/50 border border-white/10 rounded-xl p-3 text-sm text-slate-200 h-[46px] flex items-center">
                                    {categories.find(c => c.id === selectedProduct?.category)?.name || 'Sem categoria'}
                                 </div>
                              ) : (
                                 <select
                                    name="categoryId"
                                    defaultValue={selectedProduct?.category}
                                    onChange={e => sendTelemetry('product', 'change-category', { categoryId: e.target.value || null })}
                                    className="w-full bg-dark-950/50 border border-white/10 rounded-xl p-3 text-sm text-slate-200 focus:border-accent outline-none transition-all h-[46px]"
                                 >
                                    <option value="">Selecione...</option>
                                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                 </select>
                              )}
                              {/* Campos específicos para produto */}
                              {modalType === 'product' && (
                                 <>
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 assemble-text mt-4">Fornecedor</label>
                                    {isOperatorUser ? (
                                       <div className="w-full bg-dark-950/50 border border-white/10 rounded-xl p-3 text-sm text-slate-200 h-[46px] flex items-center">
                                          {suppliers.find(s => s.id === selectedProduct?.supplier)?.name || 'Sem fornecedor'}
                                       </div>
                                    ) : (
                                       <select
                                          name="supplier"
                                          defaultValue={selectedProduct?.supplier || ''}
                                          onChange={e => sendTelemetry('product', 'change-supplier', { supplierId: e.target.value || null })}
                                          className="w-full bg-dark-950/50 border border-white/10 rounded-xl p-3 text-sm text-slate-200 focus:border-accent outline-none transition-all h-[46px]"
                                       >
                                          <option value="">Selecione...</option>
                                          {isSupplierLoading ? <option value="" disabled>Carregando...</option> : suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                       </select>
                                    )}
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 assemble-text mt-4">Unidade</label>
                                    {isOperatorUser ? (
                                       <div className="w-full bg-dark-950/50 border border-white/10 rounded-xl p-3 text-sm text-slate-200 h-[46px] flex items-center">
                                          {selectedProduct?.unit?.toUpperCase() || 'UN'}
                                       </div>
                                    ) : (
                                       <select
                                          name="unit"
                                          defaultValue={selectedProduct?.unit || 'unit'}
                                          onChange={e => sendTelemetry('product', 'change-unit', { unit: e.target.value })}
                                          className="w-full bg-dark-950/50 border border-white/10 rounded-xl p-3 text-sm text-slate-200 focus:border-accent outline-none transition-all h-[46px]"
                                       >
                                          <option value="unit">UN</option>
                                          <option value="kg">KG</option>
                                          <option value="cx">CX</option>
                                          <option value="serv">SERVIÇO</option>
                                       </select>
                                    )}
                                 </>
                              )}
                           </div>
                        </div>
                        {/* Campos de preço e imagem aparecem para ambos, mas estoque, desconto e custo só para produto */}
                        <div className="p-6 bg-accent/5 rounded-2xl border border-accent/10 space-y-6 mt-6">
                           <div className="flex items-center gap-2 border-b border-accent/10 pb-3">
                              <DollarSign size={14} className="text-accent" />
                              <h4 className="text-[10px] font-bold uppercase tracking-widest text-accent assemble-text" style={{ animationDelay: '0.4s' }}>Algoritmo de Precificação</h4>
                           </div>
                           <div className="grid grid-cols-3 gap-4">
                              {modalType === 'product' && (
                                 <div className="space-y-1">
                                    <label className="text-[8px] font-bold text-slate-500 uppercase">Custo Médio</label>
                                    <Input
                                       name="costPrice"
                                       defaultValue={selectedProduct?.costPrice}
                                       placeholder="0.00"
                                       type="number"
                                       className="bg-dark-950/80 border-white/5"
                                       step="0.01"
                                       min="0"
                                       readOnly={isOperatorUser}
                                       disabled={isOperatorUser}
                                    />
                                 </div>
                              )}
                              <div className="space-y-1">
                                 <label className="text-[8px] font-bold text-slate-500 uppercase">Venda Público</label>
                                 <Input
                                    name="salePrice"
                                    defaultValue={selectedProduct?.salePrice}
                                    placeholder="0.00"
                                    type="number"
                                    className="bg-dark-950/80 border-accent/10"
                                    step="0.01"
                                    min="0"
                                    readOnly={isOperatorUser}
                                    disabled={isOperatorUser}
                                 />
                              </div>
                              {modalType === 'product' && (
                                 <div className="space-y-1">
                                    <label className="text-[8px] font-bold text-slate-500 uppercase">Auto-Discount</label>
                                    <Input
                                       name="autoDiscountValue"
                                       defaultValue={selectedProduct?.autoDiscount}
                                       placeholder="0.00"
                                       type="number"
                                       className="bg-dark-950/80 border-emerald-500/10"
                                       step="0.01"
                                       min="0"
                                       readOnly={isOperatorUser}
                                       disabled={isOperatorUser}
                                    />
                                    <input type="hidden" name="autoDiscountEnabled" value="on" />
                                 </div>
                              )}
                           </div>
                        </div>
                        {/* Estoque e mínimo só para produto */}
                        {modalType === 'product' && (
                           <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                              <div className="p-4 bg-white/2 rounded-xl border border-white/5 space-y-4">
                                 <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 assemble-text" style={{ animationDelay: '0.5s' }}>Inventário Atual</label>
                                 <div className="flex items-center gap-4">
                                    <Input
                                       name="stockOnHand"
                                       defaultValue={selectedProduct?.stock}
                                       placeholder="0"
                                       type="number"
                                       className="flex-1"
                                       min="0"
                                       readOnly={isOperatorUser}
                                       disabled={isOperatorUser}
                                    />
                                    <Badge variant="info">{selectedProduct?.unit || 'UN'}</Badge>
                                 </div>
                              </div>
                              <div className="p-4 bg-white/2 rounded-xl border border-white/5 space-y-4">
                                 <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 assemble-text" style={{ animationDelay: '0.55s' }}>Estoque Mínimo</label>
                                 <div className="flex items-center gap-4">
                                    <Input
                                       name="minStock"
                                       defaultValue={selectedProduct?.minStock !== undefined ? selectedProduct.minStock : 20}
                                       placeholder="20"
                                       type="number"
                                       icon={<Activity size={14} className="text-red-400/60" />}
                                       className="flex-1"
                                       min="0"
                                       readOnly={isOperatorUser}
                                       disabled={isOperatorUser}
                                    />
                                 </div>
                              </div>
                              <div className="p-4 bg-white/2 rounded-xl border border-white/5 flex items-center justify-between">
                                 <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Auto-Ativação</label>
                                    <p className="text-[8px] text-slate-600 uppercase">Status no PDV: {selectedProduct?.status || (autoActive ? 'active' : 'inactive')}</p>
                                 </div>
                                 {!isOperatorUser && (
                                    <>
                                       <input type="checkbox" name="status" checked={autoActive} onChange={e => setAutoActive(e.target.checked)} style={{ display: 'none' }} readOnly />
                                       <Switch enabled={autoActive} onChange={(val) => { setAutoActive(val); sendTelemetry('status', 'toggle-auto-active', { value: val }); }} />
                                    </>
                                 )}
                                 {isOperatorUser && (
                                    <Switch enabled={autoActive} onChange={() => { }} disabled />
                                 )}
                              </div>
                           </div>
                        )}

                        {modalType === 'product' && (
                           <div className="space-y-4 pb-4 mt-6">
                              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 assemble-text" style={{ animationDelay: '0.6s' }}>Mídia Visual</label>
                              <div className="flex gap-4 items-center">
                                 <div className="flex-1">
                                    <Input
                                       name="imageUrl"
                                       value={selectedProduct?.imageUrl || ''}
                                       onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSelectedProduct(p => p ? { ...p, imageUrl: e.target.value } : null)}
                                       placeholder="Selecione ou faça upload..."
                                       icon={<ImageIcon size={14} />}
                                       readOnly
                                       disabled
                                    />
                                    {!isOperatorUser && (
                                       <>
                                          <input
                                             type="file"
                                             accept="image/*"
                                             style={{ display: 'none' }}
                                             id="product-image-upload"
                                             onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                setImageFile(file);
                                                sendTelemetry('image', 'select', { name: file.name, size: file.size, type: file.type });
                                             }}
                                          />
                                          <Button
                                             type="button"
                                             variant="secondary"
                                             size="sm"
                                             style={{ marginTop: 8 }}
                                             onClick={() => document.getElementById('product-image-upload')?.click()}
                                             icon={<UploadCloud size={16} />}
                                          >
                                             Selecionar Foto
                                          </Button>
                                       </>
                                    )}
                                 </div>
                                 <div className="w-14 h-14 rounded-lg bg-dark-950 border border-white/10 flex items-center justify-center overflow-hidden relative">
                                    {selectedProduct?.imageUrl ? (
                                       <>
                                          <img src={selectedProduct.imageUrl?.startsWith('/uploads/') ? selectedProduct.imageUrl : `/uploads/${selectedProduct.imageUrl}`} className="w-full h-full object-cover opacity-50" />
                                          {!isOperatorUser && (
                                             <button
                                                type="button"
                                                className="absolute top-1 right-1 bg-red-600/80 text-white rounded-full p-1 hover:bg-red-700 transition-all"
                                                title="Remover imagem"
                                                onClick={async () => {
                                                   const imagePath = selectedProduct.imageUrl;
                                                   try {
                                                      await fetch('/api/products/delete-image', {
                                                         method: 'POST',
                                                         headers: { 'Content-Type': 'application/json' },
                                                         body: JSON.stringify({ imageUrl: imagePath, productId: selectedProduct.id })
                                                      });
                                                      setSelectedProduct(p => p ? { ...p, imageUrl: '' } : null);
                                                      showPopup('success', 'Imagem removida', 'A imagem foi excluída com sucesso!');
                                                      sendTelemetry('image', 'remove-success', { productId: selectedProduct.id });
                                                   } catch {
                                                      showPopup('error', 'Erro ao remover', 'Não foi possível excluir a imagem.');
                                                      sendTelemetry('image', 'remove-error', { productId: selectedProduct.id });
                                                   }
                                                }}
                                             >
                                                <Trash2 size={12} />
                                             </button>
                                          )}
                                       </>
                                    ) : imageFile ? (
                                       <img src={URL.createObjectURL(imageFile)} className="w-full h-full object-cover opacity-50" alt="Preview" />
                                    ) : <ImageIcon size={20} className="opacity-40" />}
                                 </div>
                              </div>
                           </div>
                        )}
                     </form>





                  </div>

                  {/* Modal Footer */}
                  <div className="p-6 border-t border-white/10 bg-dark-950/80 flex gap-4 relative z-10 rounded-b-2xl">
                     <Button variant="secondary" className="flex-1 py-4 text-xs font-bold uppercase tracking-widest" onClick={() => { setIsCreateModalOpen(false); setSelectedProduct(null); }}>
                        Abortar Sincronia
                     </Button>
                     <Button
                        form="product-form"
                        type="submit"
                        className="flex-1 py-4 text-xs font-bold uppercase tracking-widest shadow-accent-glow"
                        icon={<Check size={18} />}
                        disabled={isOperatorUser || isSavingProduct}
                     >
                        {isSavingProduct ? 'Salvando...' : `Confirmar ${selectedProduct ? 'Atualização' : 'Adição'}`}
                     </Button>

                  </div>
                  <div className="border-animation absolute bottom-0 left-0 w-full z-20"></div>
               </div>
            </div>
         )}

         {/* MODAL IMPORTAÇÃO (DRAG & DROP) */}
         {isImportModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4">
               <div className="absolute inset-0 bg-dark-950/90 backdrop-blur-xl" onClick={() => !isUploading && setIsImportModalOpen(false)} />
               <div className="relative w-full max-w-xl cyber-modal-container bg-dark-900/95 rounded-2xl border border-accent/30 shadow-2xl flex flex-col overflow-hidden max-h-[95vh]">
                  <div className="p-6 border-b border-white/10 flex items-center justify-between bg-dark-950/50">
                     <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded bg-accent/10 border border-accent/30 flex items-center justify-center">
                           <UploadCloud className="text-accent" size={20} />
                        </div>
                        <h2 className="text-lg font-bold text-white uppercase tracking-[0.2em] assemble-text">Importar Dados</h2>
                     </div>
                     {!isUploading && (
                        <button onClick={() => setIsImportModalOpen(false)} className="text-slate-500 hover:text-accent p-2"><X size={20} /></button>
                     )}
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 sm:p-10 flex flex-col items-center justify-center text-center space-y-8">
                     {isUploading ? (
                        <div className="flex flex-col items-center space-y-6 py-12">
                           <div className="relative w-16 h-16">
                              <div className="absolute inset-0 border-4 border-accent/20 rounded-full"></div>
                              <div className="absolute inset-0 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
                           </div>
                           <p className="text-accent font-mono text-xs font-bold tracking-[0.2em] uppercase">Processando Arquivo...</p>
                        </div>
                     ) : (
                        <div
                           onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                           onDrop={handleDrop}
                           className="w-full p-8 sm:p-12 border-2 border-dashed border-white/5 rounded-3xl cyber-upload-zone bg-dark-950/30 group hover:border-accent/40 transition-all cursor-pointer flex flex-col items-center gap-4"
                           onClick={() => fileInputRef.current?.click()}
                        >
                           <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.txt,.xlsx" onChange={handleImportFile} />
                           <FileSpreadsheet className="text-accent opacity-50 group-hover:opacity-100 transition-all" size={48} />
                           <div>
                              <p className="text-sm font-bold text-slate-300">Solte o arquivo aqui ou clique</p>
                              <p className="text-[10px] text-slate-500 uppercase mt-2">Suporta .TXT, .CSV, .XLSX</p>
                           </div>
                        </div>
                     )}
                  </div>
               </div>
            </div>
         )}

         {/* MODAL PREVIEW DE IMPORTAÇÃO */}
         {isPreviewModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
               <div className="absolute inset-0 bg-dark-950/90 backdrop-blur-xl" onClick={() => setIsPreviewModalOpen(false)} />
               <div className="relative w-full max-w-4xl cyber-modal-container bg-dark-900/95 rounded-2xl border border-accent/30 shadow-2xl flex flex-col max-h-[85vh]">
                  <div className="p-6 border-b border-white/10 flex items-center justify-between bg-dark-950/80">
                     <div className="flex items-center gap-4">
                        <FileSpreadsheet className="text-emerald-500" size={24} />
                        <h2 className="text-lg font-bold text-white uppercase tracking-[0.2em]">Preview de Importação</h2>
                     </div>
                     <button onClick={() => setIsPreviewModalOpen(false)} className="text-slate-500 hover:text-accent p-2"><X size={20} /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                     <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-dark-950 z-10 border-b border-white/10 text-[10px] uppercase font-bold text-slate-500">
                           <tr>
                              <th className="px-6 py-4">Status</th>
                              <th className="px-6 py-4">Produto</th>
                              <th className="px-6 py-4">GTIN</th>
                              <th className="px-6 py-4 text-right">Preço</th>
                              <th className="px-6 py-4 text-right">Estoque</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                           {importResults.map((item, idx) => (
                              <tr key={idx} className="hover:bg-white/5 transition-all text-xs">
                                 <td className="px-6 py-4">{item.status === 'valid' ? <div className="w-2 h-2 rounded-full bg-emerald-500" /> : <AlertCircle size={14} className="text-amber-500" />}</td>
                                 <td className="px-6 py-4 text-slate-200 font-bold">{item.name}</td>
                                 <td className="px-6 py-4 text-slate-500 font-mono">{item.gtin}</td>
                                 <td className="px-6 py-4 text-right font-mono text-accent">R$ {(Number(item.salePrice) || 0).toFixed(2)}</td>
                                 <td className="px-6 py-4 text-right text-slate-400">{item.stock} UN</td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
                  <div className="p-6 border-t border-white/10 bg-dark-950/80 flex justify-end gap-4">
                     <Button variant="secondary" onClick={() => setIsPreviewModalOpen(false)}>Cancelar</Button>
                     <Button
                        icon={isUploading ? <span className="animate-spin inline-block mr-2 align-middle"><RefreshCcw size={18} /></span> : <Check size={18} />}
                        disabled={isUploading}
                        onClick={async () => {
                           if (isUploading) return;
                           setIsUploading(true);
                           try {
                              // Filtra apenas produtos válidos e não duplicados
                              const validProducts = importResults.filter((item: any) => item.status === 'valid');
                              if (validProducts.length === 0) {
                                 showPopup('error', 'Importação inválida', 'Nenhum item válido para importar.');
                                 sendTelemetry('import', 'preview-empty');
                                 setIsUploading(false);
                                 return;
                              }
                              sendTelemetry('import', 'preview-confirm', { validCount: validProducts.length, invalidCount: importResults.length - validProducts.length });
                              let importedCount = 0;
                              const normalize = (val: string) => (val || '').trim().toLowerCase();

                              // Buscar categorias e fornecedores existentes do backend
                              let allCategories = [...categories];
                              let allSuppliers: { id: string, name: string, category?: string }[] = [];
                              try {
                                 const res = await fetch('/api/suppliers');
                                 if (res.ok) {
                                    const data = await res.json();
                                    allSuppliers = data.items || [];
                                 }
                              } catch { }

                              // 1) Criar categorias faltantes (se coluna existir e tiver dados)
                              const categorySet = new Map<string, string>(); // normalized -> original
                              validProducts.forEach((item: any) => {
                                 if (item.category && item.category !== 'sem categoria') {
                                    const norm = normalize(item.category);
                                    if (norm) categorySet.set(norm, item.category.trim());
                                 }
                              });

                              // Mapa de categorias existentes (normalized -> id)
                              const categoryIdMap = new Map<string, string>();
                              allCategories.forEach(c => {
                                 categoryIdMap.set(normalize(c.name), c.id);
                              });

                              for (const [normName, originalName] of categorySet.entries()) {
                                 if (categoryIdMap.has(normName)) continue;
                                 try {
                                    const res = await fetch('/api/categories', {
                                       method: 'POST',
                                       headers: { 'Content-Type': 'application/json' },
                                       body: JSON.stringify({ name: originalName })
                                    });
                                    if (res.ok) {
                                       const data = await res.json();
                                       const catId = data.category?.id;
                                       if (catId) {
                                          categoryIdMap.set(normName, catId);
                                          allCategories.push(data.category);
                                          setCategories(prev => [...prev, data.category]);
                                       }
                                    }
                                 } catch { }
                              }

                              // 2) Criar fornecedores faltantes e associar texto de categoria se houver
                              const supplierMap = new Map<string, { name: string, category?: string }>(); // normalized -> payload
                              validProducts.forEach((item: any) => {
                                 if (item.supplier && item.supplier !== 'sem fornecedor') {
                                    const normSup = normalize(item.supplier);
                                    if (!normSup) return;
                                    // prioriza categoria do próprio item, se existir
                                    const catText = item.category && item.category !== 'sem categoria' ? item.category.trim() : undefined;
                                    if (!supplierMap.has(normSup)) {
                                       supplierMap.set(normSup, { name: item.supplier.trim(), category: catText });
                                    } else {
                                       const current = supplierMap.get(normSup);
                                       if (!current?.category && catText) {
                                          supplierMap.set(normSup, { name: current?.name || item.supplier.trim(), category: catText });
                                       }
                                    }
                                 }
                              });

                              const supplierIdMap = new Map<string, string>();
                              allSuppliers.forEach(s => supplierIdMap.set(normalize(s.name), s.id));

                              for (const [normSup, payload] of supplierMap.entries()) {
                                 if (supplierIdMap.has(normSup)) continue;
                                 try {
                                    const res = await fetch('/api/suppliers', {
                                       method: 'POST',
                                       headers: { 'Content-Type': 'application/json' },
                                       body: JSON.stringify({ name: payload.name, category: payload.category || '' })
                                    });
                                    if (res.ok) {
                                       const data = await res.json();
                                       const supId = data.supplier?.id;
                                       if (supId) {
                                          supplierIdMap.set(normSup, supId);
                                          allSuppliers.push(data.supplier);
                                       }
                                    }
                                 } catch { }
                              }

                              // 3) Criar produtos usando os mapas resolvidos
                              for (const item of validProducts) {
                                 let categoryId = null;
                                 if (item.category && item.category !== 'sem categoria') {
                                    const cid = categoryIdMap.get(normalize(item.category));
                                    if (cid) categoryId = cid;
                                 }

                                 let supplierId = null;
                                 if (item.supplier && item.supplier !== 'sem fornecedor') {
                                    const sid = supplierIdMap.get(normalize(item.supplier));
                                    if (sid) supplierId = sid;
                                 }

                                  const isService = item.type === 'service';
                                  const payload = {
                                     name: item.name,
                                     ean: isService ? null : item.gtin,
                                     internalCode: isService ? null : item.internalCode,
                                     unit: item.unit || (isService ? 'serv' : 'unit'),
                                     status: item.statusValue || 'active',
                                     costPrice: item.costPrice,
                                     salePrice: item.salePrice,
                                     stockOnHand: isService ? 0 : item.stock,
                                     minStock: 0,
                                     autoDiscountEnabled: false,
                                     autoDiscountValue: 0,
                                     imageUrl: '',
                                     categoryId,
                                     supplierId: isService ? null : supplierId,
                                     type: isService ? 'service' : 'product',
                                  };
                                 try {
                                    const res = await fetch('/api/products', {
                                       method: 'POST',
                                       headers: { 'Content-Type': 'application/json' },
                                       body: JSON.stringify(payload)
                                    });
                                    if (res.ok) importedCount++;
                                 } catch { }
                              }
                              sendTelemetry('import', 'run', { importedCount, total: validProducts.length });
                              showPopup('success', 'Importação concluída!', `${importedCount} itens importados com sucesso!`);
                              setIsPreviewModalOpen(false);
                              // Atualiza lista de produtos
                              setLoading(true);
                              fetch(`/api/products?limit=${PRODUCTS_FETCH_LIMIT}`)
                                 .then(res => res.json())
                                 .then(data => {
                                    const items = (data.items || data.products || []).map((product: any) => mapApiProductToUi(product));
                                    setProducts(items);
                                    setError(null);
                                 })
                                 .catch(() => {
                                    setError('Erro ao carregar produtos da API.');
                                    setProducts([]);
                                 })
                                 .finally(() => setLoading(false));
                           } catch (err) {
                              // Em caso de erro inesperado, libera o botão
                              showPopup('error', 'Erro na importação', 'Ocorreu um erro inesperado.');
                           } finally {
                              setIsUploading(false);
                           }
                        }}
                     >Confirmar Importação</Button>
                  </div>
               </div>
            </div>
         )}

         <ColumnMappingModal
            isOpen={isColumnMappingModalOpen}
            onClose={() => setIsColumnMappingModalOpen(false)}
            onConfirm={handleConfirmColumnMapping}
            headers={importHeaders}
            fields={IMPORT_FIELDS}
            mapping={columnMapping}
            onMappingChange={handleMappingChange}
         />


         <FeedbackPopup
            open={popup.open}
            type={popup.type}
            title={popup.title}
            message={popup.message}
            onClose={() => setPopup(p => ({ ...p, open: false }))}
         />

         {/* Botão flutuante de novo produto (mobile) */}
         {!isOperatorUser && typeof window !== 'undefined' && !isCreateModalOpen && createPortal(
            <button
               className="fixed bottom-4 right-4 sm:hidden bg-accent text-white rounded-full shadow-lg w-12 h-12 flex items-center justify-center hover:bg-accent/90 active:scale-95 transition-all border-2 border-white/10 z-[100]"
               title="Novo Produto"
               onClick={() => { setIsCreateModalOpen(true); setSelectedProduct(null); sendTelemetry('modal', 'open', { entity: 'product', mode: 'create' }); }}
            >
               <Plus size={28} />
            </button>,
            document.body
         )}
      </div>
   );
};

export default Products;
