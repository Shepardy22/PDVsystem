import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useAutoFocus } from '../hooks/useAutoFocus';
import { useAuth } from '../components/AuthContext';
import { ShoppingCart, CreditCard, DollarSign, Zap, Ticket, Command, X, ArrowRight, Minus, Plus, Trash2, Printer, CheckCircle2, ShieldCheck, Cpu, Wallet, Lock, Unlock, AlertTriangle, Calculator, BarChart3, TrendingUp, Clock, Target, Users } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import { Button, Badge, Modal, Input, InputNumber } from '../components/UI';
import { Product, CartItem, Client, CashSession } from '../types';
import { listClients } from '../services/client';
import PaymentModal from '../components/modals/PaymentModal';
import ClientModal from '../components/modals/ClientModal';
import DiscountModal from '../components/modals/DiscountModal';
import ReceiptModal from '../components/modals/ReceiptModal';
import ClosingModal from '../components/modals/ClosingModal';
import OpeningModal from '../components/modals/OpeningModal';
import SubtotalModal from '../components/modals/SubtotalModal';
import AdminPasswordModal from '../components/AdminPasswordModal';
import { calculateCashBalanceCents } from '../utils/calculateCashBalance';
import { logUiEvent } from '../services/telemetry';

import IpBlocked from '../components/IpBlocked';
import { isOperator } from '../types';


interface POSProps {

   cashOpen: boolean;
   onOpenCash: (balance: number) => void;

}

const POS_PRODUCTS_FETCH_LIMIT = 5000;

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

const upsertProductInList = (items: Product[], incoming: Product): Product[] => {
   const index = items.findIndex(item => item.id === incoming.id);
   if (index === -1) return [...items, incoming];
   const next = [...items];
   next[index] = { ...next[index], ...incoming };
   return next;
};


const POS: React.FC<POSProps> = ({ cashOpen, onOpenCash }) => {
   const CART_STORAGE_KEY = 'pdv-pos-cart-v1';
   // Estado para bloqueio de IP
   const [ipBlocked, setIpBlocked] = useState<{ ip?: string, hostname?: string } | null>(null);

   const [searchTerm, setSearchTerm] = useState('');
   const [isSearchFocused, setIsSearchFocused] = useState(false);
   const [cart, setCart] = useState<CartItem[]>([]);
   const [manualDiscount, setManualDiscount] = useState(0);
   const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
   const [multiMode, setMultiMode] = useState(false);
   const [isClientModalOpen, setIsClientModalOpen] = useState(false);
   const [clientSearch, setClientSearch] = useState('');
   const [clientResults, setClientResults] = useState<Client[]>([]);
   const [selectedClientIndex, setSelectedClientIndex] = useState(0);
   const [selectedClient, setSelectedClient] = useState<Client | null>(null);




   // Busca local de produtos (igual Products.tsx)
   const [products, setProducts] = useState<Product[]>([]);
   const [searchResults, setSearchResults] = useState<Product[]>([]);
   const [searchLoading, setSearchLoading] = useState(false);
   const [searchError, setSearchError] = useState<string | null>(null);


   // Discount Modal State
   const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
   const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
   const [lastSaleData, setLastSaleData] = useState<any>(null);
   const [selectedIndex, setSelectedIndex] = useState(0);
   const [tempDiscount, setTempDiscount] = useState('0');
   const [showConfirmClear, setShowConfirmClear] = useState(false);
   const [showConfirmCloseCash, setShowConfirmCloseCash] = useState(false);
   const confirmClearRef = useRef<HTMLDivElement>(null);
   const confirmCloseRef = useRef<HTMLDivElement>(null);

   // Cash session state
   const [cashSessionId, setCashSessionId] = useState<string | null>(null);
   const { user } = useAuth();
   const sendTelemetry = useCallback((area: string, action: string, meta?: Record<string, any>) => {
      logUiEvent({ userId: user?.id ?? null, page: 'pos', area, action, meta });
   }, [user?.id]);
   const [operatorId, setOperatorId] = useState<string>('');
   const [isLoadingSession, setIsLoadingSession] = useState(true);
   const [sessionResolved, setSessionResolved] = useState(false);
   const [availableCashCents, setAvailableCashCents] = useState<number | null>(null);

   // Modais de Estado do Caixa
   const [isOpeningModalOpen, setIsOpeningModalOpen] = useState(false);
   const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
   const [closeResult, setCloseResult] = useState<any>(null);
   const [closeLoading, setCloseLoading] = useState(false);
   const [closeError, setCloseError] = useState('');
   const [initialBalance, setInitialBalance] = useState('');
   const [physicalCashInput, setPhysicalCashInput] = useState('');


   // Notification State
   const [notification, setNotification] = useState<{ show: boolean, msg: string, sub: string } | null>(null);

   // Admin password modal state
   const [showAdminPasswordModal, setShowAdminPasswordModal] = useState<string | false>("");

   const inputRef = useAutoFocus<HTMLInputElement>();
   const searchRef = useRef<HTMLDivElement>(null);
   const suppressEnterShortcutRef = useRef(false); // evita acionar pagamento quando Enter adiciona produto
   // Guarda refs dos inputs de quantidade para focar via atalho
   const qtyInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
   // Guarda o último produto adicionado ao carrinho
   const [lastAddedProductId, setLastAddedProductId] = useState<string | null>(null);
   // Configuração: permitir estoque negativo
   const [allowNegativeStock, setAllowNegativeStock] = useState<boolean>(true);
   const isFinalizingRef = useRef(false);

   // Helpers para abrir/fechar modais com telemetria
   const openCashOpeningModal = (trigger?: string) => {
      sendTelemetry('cash', 'open-modal', trigger ? { trigger } : undefined);
      setIsOpeningModalOpen(true);
   };

   const openCashClosingModal = (trigger?: string) => {
      sendTelemetry('cash', 'open-close-modal', trigger ? { trigger } : undefined);
      setIsClosingModalOpen(true);
   };

   const openDiscountModal = (trigger: string) => {
      sendTelemetry('discount', 'open', { trigger });
      setIsDiscountModalOpen(true);
   };

   const closeDiscountModal = () => {
      sendTelemetry('discount', 'close');
      setIsDiscountModalOpen(false);
   };

   const openSubtotalModal = (trigger: string) => {
      sendTelemetry('subtotal', 'open', { trigger });
      setIsSubtotalModalOpen(true);
   };

   const closeSubtotalModal = () => {
      sendTelemetry('subtotal', 'close');
      setIsSubtotalModalOpen(false);
   };

   const handleDiscountAction = (trigger: string) => {
      if (!cart.length) return;
      if (isOperator(user)) {
         setShowAdminPasswordModal('discount');
         sendTelemetry('discount', 'require-admin', { trigger });
      } else {
         openDiscountModal(trigger);
      }
   };

   const handleSubtotalAction = (trigger: string) => {
      if (!cart.length) return;
      if (isOperator(user)) {
         setShowAdminPasswordModal('subtotal');
         sendTelemetry('subtotal', 'require-admin', { trigger });
      } else {
         openSubtotalModal(trigger);
      }
   };

   const openClientModal = (trigger: string) => {
      sendTelemetry('client', 'open-modal', { trigger });
      setIsClientModalOpen(true);
   };

   const closeClientModal = () => {
      sendTelemetry('client', 'close-modal');
      setIsClientModalOpen(false);
   };

   const handleAdminPasswordSuccess = useCallback(() => {
      if (showAdminPasswordModal === 'discount') {
         openDiscountModal('admin-approved');
      } else if (showAdminPasswordModal === 'subtotal') {
         openSubtotalModal('admin-approved');
      }
      sendTelemetry('admin-password', 'approved', { reason: showAdminPasswordModal });
      setShowAdminPasswordModal(false);
   }, [showAdminPasswordModal, openDiscountModal, openSubtotalModal, sendTelemetry]);



   const subtotal = useMemo(() => cart.reduce((acc, item) => acc + (item.product.salePrice * item.quantity), 0), [cart]);
   const autoDiscountsTotal = useMemo(() => cart.reduce((acc, item) => acc + (item.appliedDiscount * item.quantity), 0), [cart]);
   const total = useMemo(() => Math.max(0, subtotal - autoDiscountsTotal - manualDiscount), [subtotal, autoDiscountsTotal, manualDiscount]);


   // Estado para modal de ajuste de subtotal
   const [isSubtotalModalOpen, setIsSubtotalModalOpen] = useState(false);
   const [customSubtotal, setCustomSubtotal] = useState<number | null>(null);

   // Subtotal real (ajustado ou calculado)
   const effectiveSubtotal = customSubtotal !== null ? customSubtotal : subtotal;
   // Total recalculado a partir do subtotal ajustado
   const effectiveTotal = Math.max(0, effectiveSubtotal - autoDiscountsTotal - manualDiscount);



   // Fetch open cash session on mount ou quando cashOpen muda
   useEffect(() => {
      if (user && user.id) {
         setOperatorId(user.id);
      } else {
         setOperatorId('');
      }

      // Testa se IP está bloqueado ao montar
      fetch('/api/health').then(async r => {
         if (r.status === 403) {
            const data = await r.json();
            if (data.aguardando) {
               setIpBlocked({ ip: data.ip, hostname: data.hostname });
            }
         }
      }).catch(() => { });
   }, [user]);

   useEffect(() => {
      sendTelemetry('page', 'view');
   }, [sendTelemetry]);

   // Garante que modais críticos apareçam no viewport no mobile
   useEffect(() => {
      if (showConfirmClear && confirmClearRef.current) {
         confirmClearRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
   }, [showConfirmClear]);

   useEffect(() => {
      if (showConfirmCloseCash && confirmCloseRef.current) {
         confirmCloseRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
   }, [showConfirmCloseCash]);

   if (ipBlocked) {
      return <IpBlocked ip={ipBlocked.ip} hostname={ipBlocked.hostname} />;
   }




   // se cashSessionId for null, entao ao pressionar 'enter' ou 'space' abre o modal de abertura de caixa
   // se pressionar 'esc' com o modal de abertura de caixa aberto, ele será fechado
   useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
         if ((e.key === 'Enter' || e.key === ' ') && !cashSessionId && !isOpeningModalOpen && !isClosingModalOpen) {
            e.preventDefault();
            openCashOpeningModal('shortcut-enter-space');
         }
         if (e.key === 'Escape' && isOpeningModalOpen) {
            e.preventDefault();
            setIsOpeningModalOpen(false);
         }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
   }, [cashSessionId, isOpeningModalOpen, isClosingModalOpen]);

   // Função para limpar o carrinho e focar no input
   const handleClearCart = () => {
      sendTelemetry('cart', 'clear');
      setCart([]);
      localStorage.removeItem(CART_STORAGE_KEY);
      setSelectedClient(null);
      setTimeout(() => {
         if (inputRef.current) inputRef.current.focus();
      }, 50);
   };
   // Snapshot do lastro em caixa para validar troco
   const refreshAvailableCash = useCallback(async () => {
      if (!operatorId) return;
      try {
         const openRes = await fetch(`/api/cash/open?userId=${operatorId}`);
         if (!openRes.ok) return;
         const openData = await openRes.json();
         const session = openData?.session as CashSession | undefined;
         if (!session?.id) return;

         const [salesRes, movementsRes] = await Promise.all([
            fetch(`/api/pos/sales?cashSessionId=${session.id}`),
            fetch(`/api/cash/movements?operatorId=${encodeURIComponent(operatorId)}`)
         ]);

         const salesData = salesRes.ok ? await salesRes.json() : { sales: [] };
         const movementsData = movementsRes.ok ? await movementsRes.json() : { movements: [] };

         const normalizedMovements = (movementsData.movements || []).map((m: any) => ({
            ...m,
            type: m.type === 'supply_in' ? 'suprimento'
               : m.type === 'withdraw_out' ? 'sangria'
                  : m.type === 'adjustment' ? 'pagamento'
                     : m.type
         }));

         const transactions = [
            ...(salesData.sales || []),
            ...normalizedMovements
         ];

         const enrichedSession: CashSession = { ...session, transactions };
         setAvailableCashCents(calculateCashBalanceCents(enrichedSession));
      } catch (err) {
         console.error('[POS] Falha ao atualizar lastro em caixa', err);
      }
   }, [operatorId]);

   const attemptOpenCash = async (initialValue: number, trigger?: string) => {
      sendTelemetry('cash', 'open-attempt', { initialBalance: initialValue, trigger });
      try {
         const res = await fetch('/api/cash/open', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operatorId: operatorId || 'operador-1', userId: operatorId || 'operador-1', initialBalance: initialValue })
         });
         if (!res.ok) throw new Error('Erro ao abrir caixa');
         const check = await fetch(`/api/cash/open?userId=${operatorId || 'operador-1'}`);
         const data = await check.json();
         if (data && data.session && data.session.id) {
            onOpenCash(initialValue);
            setIsOpeningModalOpen(false);
            setCashSessionId(data.session.id);
            sendTelemetry('cash', 'open-success', { sessionId: data.session.id, initialBalance: initialValue, trigger });
         } else {
            throw new Error('Sessão de caixa não foi aberta.');
         }
      } catch (err) {
         sendTelemetry('cash', 'open-fail', { message: err instanceof Error ? err.message : 'erro desconhecido', trigger });
         alert('Erro ao abrir caixa. Tente novamente.');
      }
   };

   // Funções auxiliares para controle do PaymentModal
   const openPaymentModal = (trigger?: string) => {
      refreshAvailableCash();
      sendTelemetry('payment', 'open-modal', { cartItems: cart.length, total: effectiveTotal, trigger });
      setIsPaymentModalOpen(true);
   };
   const closePaymentModal = () => {
      sendTelemetry('payment', 'close-modal');
      setIsPaymentModalOpen(false);
      setMultiMode(false);
   };
   const toggleMultiMode = () => {
      setMultiMode(prev => {
         const next = !prev;
         sendTelemetry('payment', 'toggle-multi', { enabled: next });
         return next;
      });
   };





   // Buscar clientes ao digitar no mini modal
   useEffect(() => {
      if (!isClientModalOpen) return;
      if (!clientSearch.trim()) {
         setClientResults([]);
         return;
      }

      listClients().then(data => {
         const items = (data.items || data || []).filter((c: Client) =>
            c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
            (c.cpf && c.cpf.includes(clientSearch))
         );
         console.log('Client search results:', items);
         setClientResults(items);
      }).catch(() => setClientResults([]));
   }, [clientSearch, isClientModalOpen]);









   useEffect(() => {
      // Enquanto não sabemos o operador, mantemos o spinner para evitar piscar a tela de caixa fechado
      if (!operatorId) {
         setIsLoadingSession(true);
         setSessionResolved(false);
         return;
      }

      // Se o flag global indica caixa fechado, mostra diretamente a tela de bloqueio
      if (!cashOpen) {
         setCashSessionId(null);
         setIsLoadingSession(false);
         setSessionResolved(true);
         return;
      }

      setIsLoadingSession(true);
      setSessionResolved(false);
      // console.log('[PDV] Verificando se existe caixa aberto para usuário:', operatorId);
      fetch(`/api/cash/open?userId=${operatorId}`)
         .then(async res => {
            if (res.ok) {
               const data = await res.json();
               if (data && data.session && data.session.id) {
                  setCashSessionId(data.session.id);
                  setIsOpeningModalOpen(false); // Não abre modal, já existe caixa aberto
                  console.log('[PDV] Caixa aberto encontrado:', data.session.id);
               } else {
                  setCashSessionId(null);
                  // NÃO abrir modal automaticamente!
                  console.log('[PDV] Nenhum caixa aberto encontrado.');
               }
            } else {
               setCashSessionId(null);
               // NÃO abrir modal automaticamente!
               //console.log('[PDV] Erro ao consultar caixa aberto.');
            }
         })
         .catch((err) => {
            setCashSessionId(null);
            // NÃO abrir modal automaticamente!
            console.log('[PDV] Falha ao consultar caixa aberto:', err);
         })
         .finally(() => {
            setTimeout(() => {
               setIsLoadingSession(false);
               setSessionResolved(true);
               //foca  o input
               if (inputRef.current) inputRef.current.focus();
            }, 500); // Garante spinner mínimo
         });
   }, [cashOpen, operatorId]);

   useEffect(() => {
      if (cashSessionId && operatorId) {
         refreshAvailableCash();
      }
   }, [cashSessionId, operatorId, refreshAvailableCash]);


   useEffect(() => {
      if (cashOpen && !isClosingModalOpen) {
         setTimeout(() => {
            inputRef.current?.focus();
            if (inputRef.current) inputRef.current.value = '';
         }, 50);
      }
   }, [cashOpen, isClosingModalOpen]);

   // Busca configuração de estoque negativo
   useEffect(() => {
      fetch('/api/settings/Enable_Negative_Casher')
         .then(r => r.ok ? r.json() : { value: 'true' })
         .then(data => {
            const v = (data?.value ?? 'true') === 'true';
            setAllowNegativeStock(v);
         })
         .catch(() => setAllowNegativeStock(true));
   }, []);

   // Restaura carrinho persistido ao carregar a página
   useEffect(() => {
      try {
         const raw = localStorage.getItem(CART_STORAGE_KEY);
         if (!raw) return;
         const parsed = JSON.parse(raw);
         if (parsed?.cart && Array.isArray(parsed.cart)) {
            setCart(parsed.cart);
            setLastAddedProductId(parsed.lastAddedProductId ?? null);
         }
      } catch (err) {
         console.warn('[POS] Falha ao restaurar carrinho:', err);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, []);

   // Persiste carrinho sempre que mudar
   useEffect(() => {
      try {
         if (cart.length === 0) {
            localStorage.removeItem(CART_STORAGE_KEY);
            return;
         }
         localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ cart, lastAddedProductId }));
      } catch (err) {
         console.warn('[POS] Falha ao salvar carrinho:', err);
      }
   }, [cart, lastAddedProductId]);




   const triggerNotification = (msg: string, sub: string) => {
      setNotification({ show: true, msg, sub });
      setTimeout(() => {
         setNotification(null);
      }, 4000);
   };




   // Foca o input de busca ao pressionar barra de espaço (quando não estiver em modal)
   useEffect(() => {
      const handleSpaceFocus = (e: KeyboardEvent) => {
         // Não foca se algum modal importante estiver aberto
         if (
            isPaymentModalOpen ||
            isDiscountModalOpen ||
            isClientModalOpen ||
            isOpeningModalOpen ||
            isClosingModalOpen ||
            isSubtotalModalOpen
         ) return;
         // Só foca se não estiver em input/textarea já
         const active = document.activeElement;
         if (
            (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) &&
            active === inputRef.current
         ) return;
         if (e.key === ' ') {
            e.preventDefault();
            sendTelemetry('shortcut', 'focus-search', { key: 'space' });
            inputRef.current?.focus();
         }
      };
      window.addEventListener('keydown', handleSpaceFocus);
      return () => window.removeEventListener('keydown', handleSpaceFocus);
   }, [
      isPaymentModalOpen,
      isDiscountModalOpen,
      isClientModalOpen,
      isOpeningModalOpen,
      isClosingModalOpen,
      isSubtotalModalOpen,
      sendTelemetry
   ]);

   // Handler para TAB no input de pesquisa: foca o input de quantidade do último item adicionado (ou último do carrinho)
   useEffect(() => {
      const handleTab = (e: KeyboardEvent) => {
         if (
            document.activeElement === inputRef.current &&
            !searchTerm &&
            cart.length > 0 &&
            e.key === 'Tab'
         ) {
            e.preventDefault();
            const fallbackLast = cart[cart.length - 1];
            const targetItem = cart.find(i => i.product.id === lastAddedProductId) || fallbackLast;
            sendTelemetry('shortcut', 'edit-quantity-tab', { productId: targetItem.product.id });
            const targetRef = qtyInputRefs.current[targetItem.product.id];
            if (targetRef) {
               targetRef.focus();
               targetRef.select();
            }
         }
      };
      window.addEventListener('keydown', handleTab);
      return () => window.removeEventListener('keydown', handleTab);
   }, [cart, searchTerm, lastAddedProductId, sendTelemetry]);






   const handlePrint = useCallback(() => {
      sendTelemetry('receipt', 'print');
      window.print();
   }, [sendTelemetry]);






   // Função para finalizar venda real
   const finalizeSale = useCallback(async (payments: { method: string, amount: number, metadata?: any }[]) => {
      if (isFinalizingRef.current) return;
      isFinalizingRef.current = true;
      if (!cashSessionId) {
         alert('Nenhuma sessão de caixa aberta. Abra o caixa para registrar vendas.');
         isFinalizingRef.current = false;
         return;
      }
      const items = cart.map(item => ({
         productId: item.product.id,
         productName: item.product.name,
         productInternalCode: item.product.internalCode,
         productEan: item.product.gtin,
         unit: item.product.unit,
         quantity: item.quantity,
         unitPrice: Math.round(item.product.salePrice * 100),
         autoDiscountApplied: Math.round((item.product.autoDiscount || 0) * 100),
         manualDiscountApplied: 0,
         finalUnitPrice: Math.round((item.product.salePrice - (item.product.autoDiscount || 0)) * 100),
         lineTotal: Math.round((item.product.salePrice - (item.product.autoDiscount || 0)) * item.quantity * 100)
      }));
      const paymentsPayload = payments.map(p => ({
         method: p.method,
         amount: p.amount,
         metadataJson: p.metadata ? JSON.stringify(p.metadata) : null
      }));
      const totalCents = Math.round(effectiveTotal * 100);
      const payload = {
         operatorId,
         cashSessionId,
         items,
         payments: paymentsPayload,
         subtotal: Math.round(effectiveSubtotal * 100),
         discountTotal: Math.round((autoDiscountsTotal + manualDiscount) * 100),
         total: totalCents,
         clientId: selectedClient ? selectedClient.id : null
      };
      sendTelemetry('payment', 'finalize-start', { items: items.length, totalCents, payments: paymentsPayload.map(p => p.method), clientId: payload.clientId });
      try {
         const res = await fetch('/api/pos/finalizeSale', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
         });
         if (!res.ok) {
            let errorMsg = 'Erro ao registrar venda. Tente novamente.';
            try {
               const errData = await res.json();
               if (errData && (errData.message || errData.error)) {
                  errorMsg = errData.message || errData.error;
               }
            } catch { }
            sendTelemetry('payment', 'finalize-error', { message: errorMsg });
            triggerNotification('Erro ao finalizar venda', errorMsg);
            return;
         }
         const { saleId } = await res.json();
         // Adiciona dados do cliente ao recibo, se houver
         let clientName = null, clientCpf = null;
         if (selectedClient) {
            clientName = selectedClient.name;
            clientCpf = selectedClient.cpf;
         }
         // Monta array de itens para o recibo (nome, quantidade, preço unitário, subtotal)
         const receiptItems = cart.map(item => ({
            productName: item.product.name,
            quantity: item.quantity,
            unitPrice: Math.round(item.product.salePrice * 100),
            subtotal: Math.round(item.product.salePrice * item.quantity * 100),
            unit: item.product.unit
         }));
         setLastSaleData({
            ...payload,
            id: saleId,
            payments: paymentsPayload,
            clientName,
            clientCpf,
            items: receiptItems,
            discountCents: Math.round((autoDiscountsTotal + manualDiscount) * 100)
         });
         sendTelemetry('payment', 'finalize-success', { saleId, totalCents, items: items.length, payments: paymentsPayload.map(p => p.method), clientId: payload.clientId });
         // Exibe popup de venda finalizada
         triggerNotification('Venda finalizada', 'A venda foi registrada com sucesso!');
         console.log('-----', { ...payload, id: saleId, payments: paymentsPayload, clientName, clientCpf })
         setIsPaymentModalOpen(false);
         sendTelemetry('receipt', 'open', { saleId });
         setIsReceiptModalOpen(true);
         setSelectedClient(null);
         refreshAvailableCash();
      } catch (err) {
         const msg = err instanceof Error ? err.message : 'Erro desconhecido ao finalizar venda.';
         sendTelemetry('payment', 'finalize-error', { message: msg });
         triggerNotification('Erro ao finalizar venda', msg);
      } finally {
         isFinalizingRef.current = false;
      }
   }, [cart, effectiveSubtotal, autoDiscountsTotal, manualDiscount, effectiveTotal, cashSessionId, operatorId, selectedClient, refreshAvailableCash, sendTelemetry, triggerNotification]);

   const applyManualDiscount = () => {
      setManualDiscount(parseFloat(tempDiscount) || 0);
      sendTelemetry('discount', 'apply-manual', { value: parseFloat(tempDiscount) || 0 });
      closeDiscountModal();
      setTimeout(() => inputRef.current?.focus(), 10);
   };


   // Gerenciamento de atalhos de teclado
   useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
         // Se Enter acabou de ser usado para selecionar produto, não abre pagamento neste evento
         if (e.key === 'Enter' && suppressEnterShortcutRef.current) {
            suppressEnterShortcutRef.current = false;
            return;
         }

         // Bloqueia todos os atalhos do POS enquanto o modal de fechamento de caixa está aberto
         if (isClosingModalOpen) return;

         // Não executa atalhos se o modal de senha admin estiver aberto
         if (showAdminPasswordModal) return;

         // Abrir modal de desconto com Ctrl + D se houver venda no buffer
         if (e.ctrlKey && e.key.toLowerCase() === 'd') {
            if (cart && cart.length > 0) {
               e.preventDefault();
               sendTelemetry('shortcut', 'discount-modal', { key: 'ctrl+d', requireAdmin: isOperator(user) });
               if (isOperator(user)) {
                  setShowAdminPasswordModal('discount');
                  sendTelemetry('discount', 'require-admin', { trigger: 'shortcut-ctrl-d' });
               } else {
                  openDiscountModal('shortcut-ctrl-d');
               }
               return;
            }
         }

         // Abrir modal de ajuste de subtotal com Ctrl + S se houver venda no buffer
         if (e.ctrlKey && e.key.toLowerCase() === 's') {
            if (cart && cart.length > 0) {
               e.preventDefault();
               sendTelemetry('shortcut', 'subtotal-modal', { key: 'ctrl+s', requireAdmin: isOperator(user) });
               if (isOperator(user)) {
                  setShowAdminPasswordModal('subtotal');
                  sendTelemetry('subtotal', 'require-admin', { trigger: 'shortcut-ctrl-s' });
               } else {
                  openSubtotalModal('shortcut-ctrl-s');
               }
               return;
            }
         }

         // 🚨 CORREÇÃO PRINCIPAL:
         // Se o PaymentModal está aberto E está no multipagamento,
         // nada do pai pode capturar teclas.
         if (isPaymentModalOpen && multiMode) {
            // Não deixa o POS capturar nada, inclusive atalhos de pagamento integral
            return;
         }

         // Atalho para abrir modal de cliente
         if (isPaymentModalOpen && e.key.toLowerCase() === 'c') {
            console.log('[POS] Abrindo modal de cliente via tecla c');
            sendTelemetry('shortcut', 'client-modal', { key: 'c' });
            openClientModal('shortcut-c');
            return;
         }

         // Atalho para abrir pagamentos com Enter; permite quando o input principal está focado e há itens no carrinho
         const active = document.activeElement as HTMLElement | null;
         const isSearchInput = active && inputRef.current && active === inputRef.current;
         const hasActiveSearch = isSearchInput && searchTerm.trim() && searchResults.length > 0;
         const isFormField = active && (
            active.tagName === 'INPUT' ||
            active.tagName === 'TEXTAREA' ||
            active.tagName === 'SELECT' ||
            active.getAttribute('contenteditable') === 'true'
         );
         if (e.key === 'Enter' && !isPaymentModalOpen) {
            // Se estiver em outro campo de formulário que não o input de busca, não aciona
            if (isFormField && !isSearchInput) return;
            // Se está navegando na lista de resultados, deixa o enter só adicionar produto
            if (hasActiveSearch) return;
            if (cart.length === 0) return;
            e.preventDefault();
            sendTelemetry('shortcut', 'open-payment', { key: 'Enter' });
            openPaymentModal('shortcut-enter');
            return;
         }

         // Alternar modo multi pagamento (caso exista)
         if (e.key === 'm' && isPaymentModalOpen) {
            e.preventDefault();
            sendTelemetry('shortcut', 'toggle-multi', { key: 'm' });
            toggleMultiMode();
            return;
         }

         // Escape fecha modal
         if (e.key === 'Escape' && isPaymentModalOpen) {
            e.preventDefault();
            sendTelemetry('shortcut', 'close-payment', { key: 'Escape' });
            closePaymentModal();
            return;
         }

         // Focar input principal se apertar qualquer número (exceto quando já está em um input de quantidade)
         if (!isPaymentModalOpen && /^[0-9]$/.test(e.key)) {
            const activeEl = document.activeElement as HTMLElement | null;
            if (activeEl?.dataset?.role === 'qty-input') return;
            inputRef.current?.focus();
         }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
   }, [
      isPaymentModalOpen,
      multiMode,
      finalizeSale,
      openPaymentModal,
      closePaymentModal,
      toggleMultiMode,
      isClosingModalOpen,
      cart.length,
      searchResults.length,
      searchTerm,
      sendTelemetry,
      openClientModal,
      openDiscountModal,
      openSubtotalModal,
      user
   ]);



   // Carrega todos os produtos ao iniciar
   useEffect(() => {
      setSearchLoading(true);
      fetch(`/api/products?limit=${POS_PRODUCTS_FETCH_LIMIT}`)
         .then(res => {
            if (!res.ok) throw new Error('Erro ao buscar produtos');
            return res.json();
         })
         .then(data => {
            const items = (data.items || data.products || []).map((product: any) => mapApiProductToUi(product));
            setProducts(items);
            setSearchError(null);
         })
         .catch(() => {
            setSearchError('Erro ao carregar produtos da API.');
            setProducts([]);
         })
         .finally(() => setSearchLoading(false));
   }, []);

   // Atualização em tempo real via SSE
   useEffect(() => {
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

   // Filtra localmente conforme o termo de busca
   useEffect(() => {
      if (!searchTerm.trim()) {
         setSearchResults([]);
         return;
      }
      const filtered = products.filter(p =>
         p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
         (p.gtin || '').includes(searchTerm) ||
         (p.internalCode || '').includes(searchTerm)
      );
      setSearchResults(filtered.slice(0, 6));
   }, [searchTerm, products]);

   // Sempre mantém a primeira opção selecionada ao obter novos resultados
   useEffect(() => {
      if (searchResults.length > 0) {
         setSelectedIndex(0);
      }
   }, [searchResults]);

   const addToCart = (product: Product) => {
      sendTelemetry('cart', 'add-item', { productId: product.id, name: product.name, salePrice: product.salePrice });
      setCart(prev => {
         const existing = prev.find(item => item.product.id === product.id);
         const discount = product.autoDiscount || 0;
         let nextCart: CartItem[];
         if (product.type === 'service') {
            if (existing) return prev;
            nextCart = [...prev, { product, quantity: 1, appliedDiscount: discount }];
         } else if (existing) {
            const currentQty = existing.quantity;
            const desired = currentQty + 1;
            if (!allowNegativeStock && desired > (product.stock ?? 0)) {
               triggerNotification('Estoque insuficiente', 'Quantidade excede o estoque disponível');
               return prev;
            }
            nextCart = prev.map(item => item.product.id === product.id ? { ...item, quantity: desired } : item);
         } else {
            if (!allowNegativeStock && 1 > (product.stock ?? 0)) {
               triggerNotification('Estoque insuficiente', 'Quantidade excede o estoque disponível');
               return prev;
            }
            nextCart = [...prev, { product, quantity: 1, appliedDiscount: discount }];
         }
         setLastAddedProductId(product.id);
         return nextCart;
      });
      setSearchTerm('');
      setSelectedIndex(0);
      setTimeout(() => {
         inputRef.current?.focus();
         if (inputRef.current) inputRef.current.value = '';
      }, 50);
   };

   const updateQuantity = (productId: string, delta: number) => {
      let nextQty: number | null = null;
      setCart(prev => prev.map(item => {
         if (item.product.id === productId) {
            let desired = Math.max(1, item.quantity + delta);
            // Serviços não têm validação de estoque
            if (!allowNegativeStock && item.product.type !== 'service') {
               const limit = item.product.stock ?? 0;
               desired = Math.min(desired, limit);
               if (desired === item.quantity && delta > 0) {
                  triggerNotification('Estoque insuficiente', 'Quantidade excede o estoque disponível');
               }
            }
            const newQty = desired;
            nextQty = newQty;
            return { ...item, quantity: newQty };
         }
         return item;
      }));
      if (nextQty !== null) {
         sendTelemetry('cart', 'update-qty', { productId, delta, quantity: nextQty });
      }
   };

   // Atualiza quantidade manualmente (input)
   const setQuantity = (productId: string, qty: number) => {
      let appliedQty: number | null = null;
      setCart(prev => prev.map(item => {
         if (item.product.id === productId) {
            let desired = Math.max(1, qty);
            // Serviços não têm validação de estoque
            if (!allowNegativeStock && item.product.type !== 'service') {
               const limit = item.product.stock ?? 0;
               desired = Math.min(desired, limit);
               if (desired < qty) {
                  triggerNotification('Estoque insuficiente', 'Quantidade excede o estoque disponível');
               }
            }
            appliedQty = desired;
            return { ...item, quantity: desired };
         }
         return item;
      }));
      if (appliedQty !== null) {
         sendTelemetry('cart', 'set-qty', { productId, quantity: appliedQty });
      }
   };

   const removeFromCart = (productId: string) => {
      sendTelemetry('cart', 'remove-item', { productId });
      setCart(prev => prev.filter(item => item.product.id !== productId));
   };

   const handleSearchKeyDown = (e: React.KeyboardEvent) => {
      if (searchResults.length === 0) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(prev => (prev + 1) % searchResults.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(prev => (prev - 1 + searchResults.length) % searchResults.length); }
      else if (e.key === 'Enter') {
         e.preventDefault();
         if (searchResults[selectedIndex]) {
            suppressEnterShortcutRef.current = true; // evita acionar modal nesta tecla
            addToCart(searchResults[selectedIndex]);
         }
      }
   };

   // Mostra loading enquanto está carregando status do caixa
   if (isLoadingSession) {
      return (
         <div className="flex-1 min-h-0 w-full flex flex-col items-center justify-center bg-dark-950 p-0 sm:p-6 relative overflow-hidden assemble-view">
            <div className="absolute inset-0 bg-cyber-grid opacity-80" />
            <div className="absolute inset-0 bg-gradient-to-b from-dark-900/60 via-dark-950 to-dark-900/70" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] bg-accent/8 rounded-full blur-[120px] animate-pulse" />
            <div className="relative z-10 flex flex-col items-center text-center space-y-8 max-w-lg px-6">
               <div className="flex flex-col items-center gap-6">
                  <div className="animate-spin rounded-full h-20 w-20 border-t-4 border-b-4 border-accent border-solid" style={{ borderLeft: '4px solid #222', borderRight: '4px solid #222' }} />
                  <span className="text-slate-400 text-xs sm:text-sm font-bold tracking-widest uppercase">Aguardando status do terminal...</span>
               </div>
            </div>
         </div>
      );
   }
   // Se o caixa está realmente fechado (após resolver a verificação)
   if (!cashOpen || (!cashSessionId && sessionResolved)) {
      return (
         <div className="flex-1 min-h-0 flex flex-col items-center justify-center bg-dark-950 bg-cyber-grid p-6 relative overflow-hidden assemble-view">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[100px] animate-pulse" />

            <div className="relative z-10 flex flex-col items-center text-center space-y-8 max-w-lg">
               <div className="w-24 h-24 rounded-3xl bg-dark-900 border-2 border-white/5 flex items-center justify-center shadow-glass relative group transition-all duration-500 hover:border-accent/30">
                  <Lock size={40} className="text-slate-700 group-hover:text-accent transition-colors duration-500" />
                  <div className="absolute inset-0 border border-accent/20 rounded-3xl animate-ping opacity-20" />
               </div>

               <div className="space-y-3">
                  <h2 className="text-2xl font-bold text-white tracking-widest uppercase assemble-text">Terminal Fechado</h2>
                  <p className="text-slate-500 text-sm font-medium tracking-tight">
                     Caixa encerrado. Realize a abertura para começar o atendimento.                     </p>
               </div>

               <div className="flex flex-col items-center gap-2">
                  <Button
                     onClick={() => openCashOpeningModal('button-open-terminal')}
                     size="lg"
                     className="px-12 py-5 text-xs font-bold tracking-[0.4em] uppercase shadow-accent-glow"
                     icon={<Unlock size={18} />}
                  >
                     Abrir Terminal
                  </Button>
                  <p className="text-[9px] text-slate-600 font-mono uppercase tracking-widest">
                     Pressione [ENTER] ou [ESPAÇO]
                  </p>
               </div>

               <div className="flex items-center gap-6 pt-8 opacity-40">
                  <div className="flex flex-col items-center">
                     <span className="text-[10px] font-bold text-slate-500 uppercase">Aguardando...</span>
                     <div className="h-1 w-12 bg-accent/20 rounded-full mt-1 overflow-hidden">
                        <div className="h-full bg-accent w-1/3 animate-ping" />
                     </div>
                  </div>
               </div>
            </div>

            {/* Modal de Abertura */}
            {isOpeningModalOpen && (
               <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                  <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-xl" onClick={() => setIsOpeningModalOpen(false)} />
                  <div className="relative w-full max-w-md cyber-modal-container bg-dark-900/95 rounded-2xl border border-accent/30 shadow-2xl flex flex-col overflow-hidden">
                     <div className="p-6 border-b border-white/10 flex items-center justify-between bg-dark-950/80">
                        <div className="flex items-center gap-4">
                           <div className="w-10 h-10 rounded bg-accent/10 border border-accent/30 flex items-center justify-center">
                              <Unlock className="text-accent" size={20} />
                           </div>
                           <h2 className="text-lg font-bold text-white uppercase tracking-[0.2em] assemble-text">Abertura de Caixa</h2>
                        </div>
                        <button onClick={() => setIsOpeningModalOpen(false)} className="text-slate-500 hover:text-accent p-2"><X size={20} /></button>
                     </div>
                     <div className="p-8 space-y-6">
                        <InputNumber
                           label="Saldo Inicial (R$)"
                           autoFocus={true}
                           value={initialBalance}
                           onChange={(e) => setInitialBalance(e.target.value)}
                           placeholder="0.00"
                           className="text-center text-3xl font-num text-accent bg-dark-950/50"
                           onKeyDown={async (e) => {
                              if (e.key === 'Enter') {
                                 const value = parseFloat(initialBalance.replace(',', '.')) || 0;
                                 await attemptOpenCash(value, 'enter-open-modal');
                              }
                           }}
                        />

                        <Button
                           onClick={async () => {
                              const value = parseFloat(initialBalance) || 0;
                              await attemptOpenCash(value, 'button-open-modal');
                           }}
                           className="w-full py-5 text-xs font-bold tracking-[0.2em] uppercase shadow-accent-glow"
                        >
                           Liberar Acesso
                        </Button>
                     </div>
                  </div>
               </div>
            )}
         </div>
      );
   }

   if (searchError) {
      return (
         <div className="flex-1 flex flex-col items-center justify-center bg-dark-950 bg-cyber-grid p-6 relative overflow-hidden assemble-view">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[100px] animate-pulse" />
            <div className="relative z-10 flex flex-col items-center text-center space-y-8 max-w-lg">
               <div className="flex flex-col items-center gap-6">
                  <AlertTriangle size={48} className="text-red-500" />
                  <span className="text-red-400 text-sm font-bold tracking-widest uppercase">Erro ao buscar produtos</span>
                  <p className="text-slate-500 text-xs">Verifique sua conexão com a internet e tente novamente.</p>
               </div>
            </div>
         </div>
      );
   }




   return (
      <div className="flex-1 flex flex-col min-h-0 max-h-[calc(100vh-0px)] overflow-y-auto assemble-view bg-dark-950 bg-cyber-grid p-4 sm:p-6  gap-4 sm:gap-6 relative">
         {/* Search Header */}
         <div className="relative z-50 max-w-3xl mx-auto w-full" ref={searchRef}>
            <div className={`gradient-border-wrapper flex items-center gap-4 transition-all duration-300 rounded-2xl p-2 bg-dark-900/60 backdrop-blur-xl border border-white/10 ${isSearchFocused ? 'border-accent/50 shadow-accent-glow' : ''
               }`}>
               <div className="pl-4 text-slate-500">
                  <Command size={20} className={isSearchFocused ? 'text-accent' : ''} />
               </div>
               <input
                  ref={inputRef}
                  type="text"
                  placeholder={
                     window.innerWidth <= 640
                        ? "Buscar produto"
                        : isSearchFocused
                           ? "Digite o código ou nome do produto..."
                           : "Pressione '[SPACE]' para buscar produto ou EAN..."
                  }
                  className="flex-1 bg-transparent border-none outline-none py-3 text-lg text-white placeholder-slate-600 font-medium"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value.replace(/^\s+/, ''))}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setIsSearchFocused(false)}
                  onKeyDown={handleSearchKeyDown}
               />
               {searchTerm && (
                  <button onClick={() => { setSearchTerm(''); inputRef.current?.focus(); }} className="p-2 text-slate-500 hover:text-white">
                     <X size={18} />
                  </button>
               )}
            </div>

            {isSearchFocused && searchResults.length > 0 && (
               <div className="absolute top-full left-0 right-0 mt-2 bg-dark-900/95 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 max-h-72 sm:max-h-96 overflow-y-auto">
                  {searchResults.map((product, index) => (
                     <button
                        key={product.id}
                        onMouseDown={(e) => { e.preventDefault(); addToCart(product); }}
                        onMouseEnter={() => setSelectedIndex(index)}
                        className={`w-full flex items-center justify-between p-4 transition-all ${selectedIndex === index ? 'bg-accent/10 border-l-4 border-accent' : 'hover:bg-white/5 border-l-4 border-transparent'
                           }`}
                     >
                        <div className="flex items-center gap-4 text-left">
                           <div className="w-10 h-10 rounded-lg bg-dark-800 border border-white/5 overflow-hidden flex items-center justify-center">
                              {product.imageUrl ? (
                                 <img src={product.imageUrl} className="w-full h-full object-cover opacity-60" />
                              ) : (
                                 <Cpu size={22} className="text-slate-700 opacity-60" />
                              )}
                           </div>
                           <div>
                              <p className={`text-sm font-bold ${selectedIndex === index ? 'text-accent' : 'text-slate-200'}`}>{product.name}</p>
                              <p className="text-[10px] text-slate-500 font-pdv">{product.gtin}</p>
                           </div>
                        </div>
                        <div className="text-right">
                           <p className="text-sm font-pdv font-bold text-accent">R$ {product.salePrice.toFixed(2)}</p>
                        </div>
                     </button>
                  ))}
               </div>
            )}
         </div>

         <div className="flex-1 grid grid-cols-12 gap-4 sm:gap-6 lg:gap-8 min-h-0 relative z-10">
            {/* Cart Area */}
            <div className="col-span-12 xl:col-span-8 flex flex-col min-h-0 gap-4 sm:gap-6">
               <div className="flex items-center justify-between  px-2">
                  <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                     <ShoppingCart size={16} className="text-accent" /> Buffer de Venda
                  </h2>
                  <div className="flex items-center gap-3">
                     <div className="flex items-center gap-2">
                        <Badge variant="info">{cart.length} Ativos</Badge>
                        <button
                           title="Limpar carrinho"
                           onClick={() => setShowConfirmClear(true)}
                           className="ml-1 p-1  rounded hover:bg-red-900/30 focus:outline-none focus:ring-2 focus:ring-accent/50 transition-colors text-slate-400 hover:text-red-400"
                           style={{ display: cart.length > 0 ? 'inline-flex' : 'none', alignItems: 'center', justifyContent: 'center' }}
                        >
                           <span className='mr-1'>Limpar</span> <Trash2 size={14} />
                        </button>
                     </div>
                  </div>
               </div>

               {/* Cart Items List */}
               <div className="flex-1 glass-panel rounded-3xl overflow-hidden flex flex-col border-white/5 shadow-2xl">
                  <div className="flex-1 min-h-0 max-h-[calc(100vh-320px)] overflow-y-auto p-3 sm:p-6 custom-scrollbar">
                     {cart.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-700 opacity-20">
                           <div className="p-12 border-2 border-dashed border-white/5 rounded-full mb-6">
                              <ShoppingCart size={80} strokeWidth={1} />
                           </div>
                           <p className="text-xl font-bold tracking-widest uppercase">Sistema em Standby</p>
                        </div>
                     ) : (
                        <div className="space-y-1 sm:space-y-2">
                           <div className="grid grid-cols-[1fr_auto_auto_auto] sm:grid-cols-[auto,1fr,auto,auto,auto] gap-2 items-center px-2 py-1 text-[10px] text-slate-500 uppercase tracking-[0.15em]">
                              <span className="truncate">Item</span>
                              <span className="text-right">Qtd</span>
                              <span className="text-right">Total</span>
                              <span className="text-right">&nbsp;</span>
                           </div>
                           {cart.map(item => (
                              <div
                                 key={item.product.id}
                                 className="grid grid-cols-[1fr_auto_auto_auto] sm:grid-cols-[auto,1fr,auto,auto,auto] items-center gap-2 sm:gap-3 bg-dark-900/70 p-2.5 sm:p-4 rounded-2xl border border-white/5 hover:border-accent/20 transition-all animate-in slide-in-from-left-4 duration-300"
                              >
                                 <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                    <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-lg bg-dark-950 border border-white/5 overflow-hidden shrink-0 flex items-center justify-center">
                                       {item.product.imageUrl ? (
                                          <img src={item.product.imageUrl} className="w-full h-full object-cover opacity-50" />
                                       ) : (
                                          <Cpu size={18} className="text-slate-700 opacity-60" />
                                       )}
                                    </div>
                                    <div className="min-w-0 space-y-0.5">
                                       <h4 className="text-xs sm:text-sm font-bold text-slate-100 truncate uppercase tracking-tight leading-tight">{item.product.name}</h4>
                                       <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-slate-400 flex-wrap">
                                          <span className="font-pdv text-accent">R$ {item.product.salePrice.toFixed(2)}</span>
                                          {item.appliedDiscount > 0 && <Badge variant="success">-R$ {item.appliedDiscount.toFixed(2)}</Badge>}
                                       </div>
                                    </div>
                                 </div>

                                 <div className="text-right whitespace-nowrap text-sm sm:text-base font-pdv font-bold text-white leading-tight">
                                    R$ {((item.product.salePrice - item.appliedDiscount) * item.quantity).toFixed(2)}
                                 </div>

                                 <div className="flex items-center bg-dark-950/80 rounded-lg px-2 py-1 border border-white/10">
                                    <input
                                       ref={el => { qtyInputRefs.current[item.product.id] = el; }}
                                       data-role="qty-input"
                                       type="number"
                                       min={1}
                                       max={!allowNegativeStock ? (item.product.stock ?? undefined) : undefined}
                                       className="w-11 sm:w-14 text-center text-[11px] sm:text-xs font-num font-bold text-slate-200 bg-dark-900 border border-accent/30 rounded px-1 py-0.5 outline-none"
                                       value={item.quantity === 0 ? '' : item.quantity}
                                       inputMode="numeric"
                                       pattern="[0-9]*"
                                       onChange={e => {
                                          // Permite campo vazio temporariamente
                                          const val = e.target.value;
                                          if (val === '' || val === '0') {
                                             setQuantity(item.product.id, 0);
                                          } else {
                                             const next = parseInt(val, 10);
                                             setQuantity(item.product.id, Number.isNaN(next) ? 1 : next);
                                          }
                                       }}
                                       onBlur={e => {
                                          // Se sair vazio ou zero, volta para 1
                                          if (!e.target.value || e.target.value === '0') {
                                             setQuantity(item.product.id, 1);
                                          }
                                       }}
                                       onKeyDown={e => {
                                          e.stopPropagation();
                                          if (e.key === 'Enter') {
                                             e.preventDefault();
                                             inputRef.current?.focus();
                                             inputRef.current?.select();
                                          }
                                       }}
                                       onFocus={e => {
                                          e.stopPropagation();
                                          e.target.select();
                                       }}
                                    />
                                 </div>



                                 <button
                                    onClick={() => removeFromCart(item.product.id)}
                                    className="p-2 text-slate-600 hover:text-red-500 opacity-90 sm:opacity-100 transition-opacity justify-self-end"
                                    title="Remover item [Del]"
                                 >
                                    <Trash2 size={14} />
                                 </button>
                              </div>
                           ))}
                        </div>
                     )}
                  </div>
               </div>
            </div>

            {/* Totals Section */}
            <div className="col-span-12 xl:col-span-4 flex flex-col gap-6 h-full min-h-0 ">
               <div className="p-4 flex-1 glass-panel rounded-3xl sm:p-8 flex flex-col border-white/5 bg-dark-900/40 shadow-2xl relative overflow-y-auto min-h-0 custom-scrollbar ">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] sm:tracking-[0.35em] text-slate-600 mb-6 sm:mb-10">Consolidação Fiscal</h3>

                  <div className="flex-1 space-y-6">
                     <div className="flex justify-between items-center text-slate-500">
                        <span className="text-[10px] font-bold uppercase tracking-widest">Soma Bruta</span>
                        <span className="font-num text-sm tracking-tight">R$ {effectiveSubtotal.toFixed(2)}</span>
                     </div>

                     {autoDiscountsTotal + manualDiscount > 0 && (
                        <div className="flex justify-between items-center text-emerald-500/60">
                           <span className="text-[10px] font-bold uppercase tracking-widest">Deduções Totais</span>
                           <span className="font-pdv text-sm tracking-tight">- R$ {(autoDiscountsTotal + manualDiscount).toFixed(2)}</span>
                        </div>
                     )}

                     {/* Ajustes */}
                     {customSubtotal !== null && Math.abs(customSubtotal - subtotal) > 0.009 && (
                        <div className="flex justify-between items-center text-blue-400/80">
                           <span className="text-[10px] font-bold uppercase tracking-widest">Ajustes</span>
                           <span className="font-pdv text-sm tracking-tight">
                              {customSubtotal - subtotal > 0 ? '+' : '-'}
                              R$ {Math.abs(customSubtotal - subtotal).toFixed(2)}
                           </span>
                        </div>
                     )}
                  </div>


                  {/**  */}
                  <div className="pt-8 border-t border-white/5 space-y-8 shrink-0 relative z-10">
                     <div className="flex justify-between items-end gap-3 flex-wrap sm:flex-nowrap">
                        <div>
                           <p className="text-[9px] font-bold uppercase tracking-[0.2em] sm:tracking-[0.25em] text-slate-600 mb-2">Montante Líquido</p>
                           <div className="flex items-baseline gap-2 flex-wrap sm:flex-nowrap">
                              <span className="text-sm text-slate-400">R$</span>
                              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-pdv font-bold text-accent whitespace-nowrap">{effectiveTotal.toFixed(2)}</h2>
                           </div>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-accent/5 border border-accent/20 flex items-center justify-center animate-pulse shrink-0">
                           <ArrowRight className="text-accent" />
                        </div>
                     </div>

                     <Button
                        className="w-full py-4 sm:py-6 text-[11px] sm:text-xs font-bold tracking-[0.2em] sm:tracking-[0.3em] uppercase shadow-accent-glow transition-all active:scale-95"
                        disabled={cart.length === 0}
                        onClick={() => openPaymentModal('button-processar')}
                     >
                        PROCESSAR [ENTER]
                     </Button>


                     <div className="sm:hidden grid grid-cols-1 gap-3">
                        <Button
                           className="w-full py-3 text-[11px] sm:text-[11px] font-bold tracking-[0.2em] uppercase bg-dark-800/60 border border-accent/30 hover:border-accent/60 hover:bg-accent/5"
                           disabled={cart.length === 0}
                           onClick={() => handleDiscountAction('button-discount')}
                        >
                           Aplicar Desconto
                        </Button>
                        <Button
                           className="w-full py-3 text-[11px] sm:text-[11px] font-bold tracking-[0.2em] uppercase bg-dark-800/60 border border-accent/30 hover:border-accent/60 hover:bg-accent/5"
                           disabled={cart.length === 0}
                           onClick={() => handleSubtotalAction('button-subtotal')}
                        >
                           Ajustar Subtotal
                        </Button>
                     </div>

                     <Button
                        className="w-full py-3 text-[11px] sm:text-[11px] font-bold tracking-[0.2em] uppercase bg-red-500/5 border border-red-400/20 text-red-100 hover:border-red-300/60 hover:bg-red-500/10 transition-all"
                        onClick={() => setShowConfirmCloseCash(true)}
                     >
                        Fechar Caixa
                     </Button>


                     <div className="hidden sm:block space-y-1">
                        <p className="text-[8px] text-center text-slate-600 font-bold uppercase tracking-[0.25em]">
                           Ctrl + D = Aplicar Desconto
                        </p>
                        <p className="text-[8px] text-center text-slate-600 font-bold uppercase tracking-[0.25em]">
                           Ctrl + S = Ajustar Subtotal
                        </p>
                     </div>
                  </div>
               </div>
            </div>
         </div>

         {/* PAYMENT MODAL */}
         {showConfirmClear && (
            <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
               <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={() => setShowConfirmClear(false)} />
               <div ref={confirmClearRef} className="relative w-full max-w-sm bg-dark-900/95 border border-accent/15 rounded-2xl shadow-[0_10px_40px_rgba(0,224,255,0.12)] cyber-modal-container overflow-hidden">
                  <div className="p-6 border-b border-white/10 flex items-center justify-between bg-dark-950/60">
                     <h3 className="text-sm font-bold text-white uppercase tracking-[0.25em]">Limpar Carrinho</h3>
                     <button onClick={() => setShowConfirmClear(false)} className="text-slate-500 hover:text-accent p-2"><X size={18} /></button>
                  </div>
                  <div className="p-6 space-y-4">
                     <p className="text-slate-300 text-sm">Deseja remover todos os itens do carrinho? Esta ação não pode ser desfeita.</p>
                     <div className="grid grid-cols-2 gap-3">
                        <Button
                           className="w-full py-3 text-[11px] font-bold tracking-[0.2em] uppercase bg-dark-800/60 border border-white/10 hover:border-white/30"
                           onClick={() => setShowConfirmClear(false)}
                        >
                           Cancelar
                        </Button>
                        <Button
                           className="w-full py-3 text-[11px] font-bold tracking-[0.2em] uppercase bg-red-500/5 border border-red-400/25 text-red-200 hover:border-red-300/70 hover:bg-red-500/10"
                           onClick={() => { handleClearCart(); setShowConfirmClear(false); }}
                        >
                           Limpar
                        </Button>
                     </div>
                  </div>
               </div>
            </div>
         )}

         {showConfirmCloseCash && (
            <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
               <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={() => setShowConfirmCloseCash(false)} />
               <div ref={confirmCloseRef} className="relative w-full max-w-sm bg-dark-900/95 border border-accent/15 rounded-2xl shadow-[0_10px_40px_rgba(0,224,255,0.12)] cyber-modal-container overflow-hidden">
                  <div className="p-6 border-b border-white/10 flex items-center justify-between bg-dark-950/60">
                     <h3 className="text-sm font-bold text-white uppercase tracking-[0.25em]">Fechar Caixa</h3>
                     <button onClick={() => setShowConfirmCloseCash(false)} className="text-slate-500 hover:text-accent p-2"><X size={18} /></button>
                  </div>
                  <div className="p-6 space-y-4">
                     <p className="text-slate-300 text-sm">Confirma o encerramento do caixa atual?</p>
                     <div className="grid grid-cols-2 gap-3">
                        <Button
                           className="w-full py-3 text-[11px] font-bold tracking-[0.2em] uppercase bg-dark-800/60   hover:border-white/30"
                           onClick={() => setShowConfirmCloseCash(false)}
                        >
                           Cancelar
                        </Button>
                        <Button
                           className="w-full py-3 text-[11px] font-bold tracking-[0.2em] uppercase bg-red-500/5 border border-red-400/25 text-red-200 hover:border-red-300/70 hover:bg-red-500/10"
                           onClick={() => { setShowConfirmCloseCash(false); openCashClosingModal('confirm-fechar-caixa'); }}
                        >
                           Confirmar
                        </Button>
                     </div>
                  </div>
               </div>
            </div>
         )}

         <PaymentModal
            isOpen={isPaymentModalOpen}
            total={effectiveTotal}
            multiMode={multiMode}
            setMultiMode={setMultiMode}
            availableCashCents={availableCashCents ?? undefined}
            onClose={closePaymentModal}
            onFinalize={payments => finalizeSale(payments)}
            selectedClient={selectedClient}
         />

         <ClientModal
            isOpen={isClientModalOpen}
            clientSearch={clientSearch}
            clientResults={clientResults}
            selectedClientIndex={selectedClientIndex}
            setSelectedClientIndex={setSelectedClientIndex}
            onClose={closeClientModal}
            onSearch={setClientSearch}
            onSelect={client => {
               setSelectedClient(client);
               closeClientModal();
               sendTelemetry('client', 'select', { clientId: client.id, name: client.name });
            }}
         />


         {/* DISCOUNT MODAL */}
         <DiscountModal
            isOpen={isDiscountModalOpen}
            tempDiscount={tempDiscount}
            onClose={closeDiscountModal}
            onChange={setTempDiscount}
            onApply={applyManualDiscount}
         />

         {/* RECEIPT MODAL */}
         <ReceiptModal
            isOpen={isReceiptModalOpen}
            lastSaleData={lastSaleData}
            onClose={() => {
               sendTelemetry('receipt', 'close');
               setIsReceiptModalOpen(false);
               setCart([]);
               localStorage.removeItem(CART_STORAGE_KEY);
               setLastSaleData(null);
               setSearchTerm('');
               setManualDiscount(0);
               setTempDiscount('0');
               setSelectedClient(null);
               //focar input de busca após fechar o recibo
               setTimeout(() => {
                  inputRef.current?.focus();
               }, 100);
            }}
            onPrint={handlePrint}
         />

         {/* CLOSING MODAL */}
         <ClosingModal
            isOpen={isClosingModalOpen}
            physicalCashInput={physicalCashInput}
            closeError={closeError}
            closeLoading={closeLoading}
            closeResult={closeResult}
            onClose={() => {
               sendTelemetry('cash', 'close-modal');
               setIsClosingModalOpen(false);
               setPhysicalCashInput('');
               setCloseError('');
               // Só setar cashSessionId como null se o modal está mostrando o resumo (closeResult existe)
               if (closeResult) {
                  setCashSessionId(null);
                  setCloseResult(null);
                  setInitialBalance('');
               } else {
                  setCloseResult(null);
               }
            }}
            onInputChange={setPhysicalCashInput}
            onConfirm={async () => {
               setCloseLoading(true);
               setCloseError('');
               try {
                  // Corrige vírgula para ponto para aceitar 9,90 e 9.90
                  const value = parseFloat(physicalCashInput.replace(',', '.')) || 0;
                  const res = await fetch('/api/cash/close', {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({ sessionId: cashSessionId, physicalCount: Math.round(value * 100) })
                  });
                  if (!res.ok) throw new Error('Erro ao fechar caixa');
                  const data = await res.json();
                  setCloseResult(data.closeResult);
                  sendTelemetry('cash', 'close-success', { sessionId: cashSessionId, physicalCount: value, difference: data?.closeResult?.difference });
                  // NÃO setar cashSessionId(null) aqui! Só depois que fechar o modal de resumo.
               } catch (err) {
                  setCloseError('Erro ao fechar caixa. Tente novamente.');
                  sendTelemetry('cash', 'close-fail', { sessionId: cashSessionId, message: err instanceof Error ? err.message : 'erro desconhecido' });
               } finally {
                  setCloseLoading(false);
               }
            }}
         />

         {/* SUBTOTAL MODAL */}
         <SubtotalModal
            isOpen={isSubtotalModalOpen}
            initialValue={customSubtotal !== null ? customSubtotal : subtotal}
            onClose={closeSubtotalModal}
            onConfirm={newSubtotal => {
               setCustomSubtotal(newSubtotal);
               sendTelemetry('subtotal', 'apply', { value: newSubtotal });
               closeSubtotalModal();
            }}
         />


         {/* NOTIFICATION TOAST (SALE PROCESSED FEEDBACK) */}
         {notification && notification.show && (
            <div className="fixed bottom-8 right-8 z-[200] cyber-toast bg-dark-900/90 border border-accent/40 rounded-2xl p-6 shadow-accent-glow max-w-sm backdrop-blur-xl animate-in slide-in-from-right-10 duration-500">
               <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                     <CheckCircle2 size={24} />
                  </div>
                  <div>
                     <h4 className="text-sm font-bold text-white uppercase tracking-widest assemble-text">{notification.msg}</h4>
                     <p className="text-[10px] text-slate-500 font-mono mt-1 uppercase tracking-tight">{notification.sub}</p>
                  </div>
               </div>
               <div className="absolute bottom-0 left-0 h-1 bg-accent/40 border-animation" />
            </div>
         )}

         <AdminPasswordModal
            isOpen={!!showAdminPasswordModal}
            onClose={() => setShowAdminPasswordModal("")}
            onSuccess={handleAdminPasswordSuccess}
         />
      </div>
   );
};

export default POS;
