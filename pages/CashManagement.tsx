import CashPerformanceTrends from '../components/CashPerformanceTrends';
import FuturisticSpinner from '../components/FuturisticSpinner';
import CashSalesBreakdown from '../components/CashSalesBreakdown';
import OperatorSalesBreakdown from '../components/OperatorSalesBreakdown';
import { fetchSessionTransactions } from '../utils/transactions';
import PagamentoModal from '../components/modals/PagamentoModal';
import SangriaModal from '../components/modals/SangriaModal';
import AdminPasswordModal from '../components/AdminPasswordModal';
import { useAuth } from '../components/AuthContext';
import { logUiEvent } from '../services/telemetry';


import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { getUserById, getOperatorNameById } from '../services/user';
import { DollarSign, ArrowUpRight, ArrowDownLeft, Clock, Info, CheckCircle2, Receipt, User, Tag, Calendar, FileText, CreditCard, Printer, X, Check, Zap, AlertTriangle, History, Search, ChevronRight, Calculator, Archive, ShoppingBag, Eye, Shield, MessageSquare, FolderPlus, TrendingUp, ArrowUpDown, } from 'lucide-react';
import { Button, Input, Card, Badge, Modal } from '../components/UI';
import { generateReceiptPDF } from '../utils/pdfUtils';
import SuprimentoModal from '../components/modals/SuprimentoModal';
import { CashSession, MovementTransaction, SaleTransaction } from '@/types';
import { calculateCashBalance, calculateCashBalanceCents, calculateSessionSalesTotalCents } from '@/utils/calculateCashBalance';





// Função para buscar histórico real de caixas
async function fetchCashHistory() {
   const res = await fetch('/api/cash/history');
   if (!res.ok) throw new Error('Erro ao buscar histórico de caixas');
   const data = await res.json();
   console.log('Cash history data:', data);
   return data.sessions || [];
}

const INITIAL_TX_CATEGORIES = ['Logística', 'Infraestrutura', 'Retirada Lucro', 'Despesas Gerais', 'Marketing', 'Manutenção'];

const CashManagement: React.FC = () => {
   const { user } = useAuth();
   const sendTelemetry = React.useCallback((area: string, action: string, meta?: Record<string, any>) => {
      logUiEvent({ userId: user?.id ?? null, page: 'cash', area, action, meta });
   }, [user?.id]);
   React.useEffect(() => {
      sendTelemetry('page', 'view');
   }, [sendTelemetry]);
   const [historySearch, setHistorySearch] = useState<string>('');
   const [activeTab, setActiveTab] = useState<'current' | 'history' | 'performance' | 'operators'>('current');
   const [cashHistory, setCashHistory] = useState([]);
   const [cashHistoryLoading, setCashHistoryLoading] = useState(false);
   const [cashHistoryError, setCashHistoryError] = useState('');

   const [sales, setSales] = useState<SaleTransaction[]>([]);
   const [movements, setMovements] = useState<MovementTransaction[]>([]);
   const [allOpenSales, setAllOpenSales] = useState<SaleTransaction[]>([]);


   const [historyModalTab, setHistoryModalTab] = useState<'resumo' | 'movimentacoes'>('resumo');
   const [refreshFlag, setRefreshFlag] = useState(0);

   // Categorias de Transação
   const [txCategories, setTxCategories] = useState<string[]>(INITIAL_TX_CATEGORIES);
   const [isTxCategoryModalOpen, setIsTxCategoryModalOpen] = useState(false);
   const [newTxCategoryName, setNewTxCategoryName] = useState('');

   const [session, setSession] = useState<CashSession | null>(null);
   const [sessionLoading, setSessionLoading] = useState(true);
   const [sessionError, setSessionError] = useState('');

   const [isSuprimentoModalOpen, setIsSuprimentoModalOpen] = useState(false);
   const [isSangriaModalOpen, setIsSangriaModalOpen] = useState(false);
   const [isPagamentoModalOpen, setIsPagamentoModalOpen] = useState(false);
   const [isClosureModalOpen, setIsClosureModalOpen] = useState(false);
   const [selectedTx, setSelectedTx] = useState<SaleTransaction | MovementTransaction | null>(null);
   const [operatorName, setOperatorName] = useState<string>('');
   const [selectedHistory, setSelectedHistory] = useState<any | null>(null);
   const [isReceiptPreviewOpen, setIsReceiptPreviewOpen] = useState(false);
   const [operatorNameHistory, setOperatorNameHistory] = useState('');

   const [sessionActive, setSessionActive] = useState(false)


   const [error, setError] = useState<string>('');

   const [showAdminPasswordModal, setShowAdminPasswordModal] = useState<'' | 'suprimento' | 'sangria' | 'pagamento'>("");

   React.useEffect(() => {
      sendTelemetry('tab', 'change', { tab: activeTab });
   }, [activeTab, sendTelemetry]);

   React.useEffect(() => {
      sendTelemetry('modal-tab', 'change', { tab: historyModalTab, historyId: selectedHistory?.id ?? null });
   }, [historyModalTab, selectedHistory?.id, sendTelemetry]);

   const cashBalanceCents = useMemo(() => calculateCashBalanceCents(session), [session]);
   const sessionSalesCents = useMemo(() => calculateSessionSalesTotalCents(session), [session]);
   const paymentLimitCents = useMemo(
      () => (sessionSalesCents > 0 ? sessionSalesCents : cashBalanceCents),
      [sessionSalesCents, cashBalanceCents]
   );

   // Extrair vendas da sessão atual para análise por operador
   const currentSessionSales = useMemo(() => {
      if (!session || !Array.isArray(session.transactions)) return [];
      return session.transactions.filter(
         (tx): tx is SaleTransaction => 'items' in tx && Array.isArray((tx as any).items) && (tx as any).items.length > 0
      );
   }, [session]);

   // Determinar quais vendas mostrar (todas para admin/manager, apenas do operador para operator)
   const salesForOperatorView = useMemo(() => {
      if (!user) return [];
      // Se for admin ou manager, mostrar todas as vendas abertas
      if (user.role === 'admin' || user.role === 'manager') {
         return allOpenSales;
      }
      // Se for operador, mostrar apenas suas vendas
      return currentSessionSales;
   }, [user, allOpenSales, currentSessionSales]);

   // Buscar vendas e movimentações da sessão de caixa aberta
   const fetchAndSetSessionTransactions = useCallback(async () => {
      if (selectedHistory) {
         try {
            const { sales, movements } = await fetchSessionTransactions(selectedHistory.id);
            setSales(sales);
            setMovements(movements);
            console.log('Vendas da sessão:', sales);
            console.log('Movimentações da sessão:', movements);
         } catch (error: any) {
            setSales([]);
            setMovements([]);
            setError('Erro ao buscar vendas e movimentações da sessão de caixa.' + (error?.message ? ` ${error.message}` : ''));
         }
      }
   }, [selectedHistory]);

   useEffect(() => {
      fetchAndSetSessionTransactions();
   }, [fetchAndSetSessionTransactions]);


   // Buscar histórico de caixas e nomes dos operadores ao mudar para a aba de histórico
   useEffect(() => {
      if (activeTab === 'history') {
         setCashHistoryLoading(true);
         setCashHistoryError('');
         (async () => {
            try {
               const sessions = await fetchCashHistory();
               // Buscar nomes dos operadores antes de setar o histórico
               const ids = Array.from(new Set(sessions.map((h: any) => h.operator_id).filter(Boolean)));
               const entries = await Promise.all(
                  ids.map(async (id: string) => [id, await getOperatorNameById(id) || id])
               );
               setOperatorNames(Object.fromEntries(entries));
               setCashHistory(sessions);
            } catch {
               setCashHistoryError('Erro ao buscar histórico de caixas');
            } finally {
               setCashHistoryLoading(false);
            }
         })();
      }
   }, [activeTab]);







   // Buscar sessão de caixa aberta e suas transações
   useEffect(() => {
      if (!user?.id) return;
      setSessionLoading(true);
      (async () => {
         try {
            const res = await fetch(`/api/cash/open?userId=${user.id}`);
            if (!res.ok) {
               setSessionActive(false);
               setSession({
                  id: 'N/A',
                  transactions: [],
                  message: 'Nenhuma sessão ativa no momento.'
               });
               console.log('[CashManagement] Nenhuma sessão ativa encontrada para o usuário.', res.status);
               return;
            }

            const data = await res.json();
            const sessionId = data.session?.id;
            const isOpen = data.session?.is_open === 1;
            if (!sessionId || !isOpen) {
               setSessionActive(false);
               setSession({
                  id: sessionId || 'N/A',
                  transactions: data.session?.transactions || [],
                  message: 'Nenhuma sessão ativa no momento.'
               });
               return;
            }

            // Há sessão ativa e aberta
            setSessionActive(true);

            const salesRes = await fetch(`/api/pos/sales?cashSessionId=${sessionId}`);
            const salesData = salesRes.ok ? await salesRes.json() : { sales: [] };
            const suprimentosRes = await fetch(`/api/cash/movements?operatorId=${encodeURIComponent(user.id)}`);
            const suprimentosData = suprimentosRes.ok ? await suprimentosRes.json() : { movements: [] };

            const allMovements = [
               ...(salesData.sales || []),
               ...(suprimentosData.movements || []).map((m: any) => ({
                  ...m,
                  type:
                     m.type === 'supply_in' ? 'suprimento'
                        : m.type === 'withdraw_out' ? 'sangria'
                           : m.type === 'adjustment' ? 'pagamento'
                              : m.type
               }))
            ];
            allMovements.sort((a, b) => (b.timestamp || b.created_at) - (a.timestamp || a.created_at));

            setSession({
               ...data.session,
               transactions: allMovements
            });
         } catch (err) {
            console.error('Erro ao carregar sessão:', err);
            setSessionActive(false);
            setSessionError('Nenhum caixa aberto ou erro ao buscar vendas/suprimentos.');
            setSession({
               id: 'N/A',
               transactions: [],
               message: 'Erro ao carregar a sessão atual.'
            });
         } finally {
            setSessionLoading(false);
         }
      })();
   }, [refreshFlag, user?.id]);

   // Buscar todas as vendas das sessões abertas (para admin/manager)
   useEffect(() => {
      if (!user) return;
      if (user.role !== 'admin' && user.role !== 'manager') {
         setAllOpenSales([]);
         return;
      }

      // Admin/Manager: buscar todas as vendas abertas
      (async () => {
         try {
            console.log('[CashManagement] Buscando todas vendas abertas (admin/manager)...');
            const res = await fetch('/api/pos/sales/all-open');
            if (res.ok) {
               const data = await res.json();
               console.log('[CashManagement] Vendas abertas encontradas:', data.sales?.length || 0);
               setAllOpenSales(data.sales || []);
            } else {
               console.warn('[CashManagement] Erro ao buscar vendas abertas:', res.status);
               setAllOpenSales([]);
            }
         } catch (err) {
            console.error('[CashManagement] Erro ao buscar vendas abertas:', err);
            setAllOpenSales([]);
         }
      })();
   }, [user, refreshFlag]);



   // Fecha o modal de auditoria de movimentação ao pressionar ESC
   useEffect(() => {
      if (!selectedTx) return;
      const handleEsc = (e: KeyboardEvent) => {
         if (e.key === 'Escape') {
            closeTxDetail('escape');
         }
      };
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
   }, [selectedTx]);



   // Buscar nome do operador ao abrir modal de venda
   useEffect(() => {
      async function fetchOperatorName() {
         if (selectedTx && selectedTx.operator_id) {
            const name = await getOperatorNameById(selectedTx.operator_id);
            setOperatorName(name || '');
         } else {
            setOperatorName('');
         }
      }
      fetchOperatorName();
   }, [selectedTx]);






   // Buscar nome do operador ao abrir modal de histórico
   useEffect(() => {
      async function fetchOperatorNameHistory() {
         if (selectedHistory && selectedHistory.operator_id) {
            const name = await getOperatorNameById(selectedHistory.operator_id);
            setOperatorNameHistory(name || selectedHistory.operator_id);
         } else {
            setOperatorNameHistory('');
         }
      }
      fetchOperatorNameHistory();
   }, [selectedHistory]);

   const getStatusColor = (type: string) => {
      switch (type) {
         case 'sale': return 'text-emerald-500';
         case 'suprimento': return 'text-blue-400';
         case 'sangria': return 'text-red-400';
         case 'pagamento': return 'text-amber-500';
         default: return 'text-slate-400';
      }
   };

   const getStatusIcon = (type: string) => {
      switch (type) {
         case 'sale': return <ShoppingBag size={16} />;
         case 'suprimento': return <ArrowDownLeft size={16} />;
         case 'sangria': return <ArrowUpRight size={16} />;
         case 'pagamento': return <FileText size={16} />;
         default: return <Info size={16} />;
      }
   };

   const handleHistorySearchChange = (value: string) => {
      setHistorySearch(value);
      sendTelemetry('history', 'search', { term: value });
   };

   const handleSelectTx = (tx: SaleTransaction | MovementTransaction, origin: string) => {
      setSelectedTx(tx);
      sendTelemetry('tx-detail', 'open', {
         id: (tx as any)?.id ?? null,
         type: (tx as any)?.type || (Array.isArray((tx as any)?.items) ? 'sale' : 'unknown'),
         origin,
      });
   };

   const closeTxDetail = (reason: string = 'close') => {
      setSelectedTx(null);
      setIsReceiptPreviewOpen(false);
      sendTelemetry('tx-detail', 'close', { reason });
   };

   const handleHistoryModalClose = (reason: string = 'close') => {
      setSelectedHistory(null);
      sendTelemetry('modal', 'close', { modal: 'cash-history', reason });
   };

   const handlePrintWithTelemetry = (context: string) => {
      sendTelemetry('print', 'click', { context });
      window.print();
   };

   const openTxCategoryModal = () => {
      setIsTxCategoryModalOpen(true);
      sendTelemetry('tx-category', 'open');
   };

   const closeTxCategoryModal = (reason: string = 'close') => {
      setIsTxCategoryModalOpen(false);
      sendTelemetry('tx-category', 'close', { reason });
   };

   const closeSuprimentoModal = (reason: string = 'close') => {
      setIsSuprimentoModalOpen(false);
      setRefreshFlag(f => f + 1);
      sendTelemetry('modal', 'close', { modal: 'suprimento', reason });
   };

   const closeSangriaModal = (reason: string = 'close') => {
      setIsSangriaModalOpen(false);
      setRefreshFlag(f => f + 1);
      sendTelemetry('modal', 'close', { modal: 'sangria', reason });
   };

   const closePagamentoModal = (reason: string = 'close') => {
      setIsPagamentoModalOpen(false);
      setRefreshFlag(f => f + 1);
      sendTelemetry('modal', 'close', { modal: 'pagamento', reason });
   };

   const handleCreateTxCategory = () => {
      if (newTxCategoryName.trim()) {
         setTxCategories(prev => [...prev, newTxCategoryName.trim()]);
         setNewTxCategoryName('');
         setIsTxCategoryModalOpen(false);
         sendTelemetry('tx-category', 'create', { name: newTxCategoryName.trim() });
      }
   };

   // Fecha o modal de visualização de recibo ao pressionar ESC
   useEffect(() => {
      const handleEsc = (e: KeyboardEvent) => {
         if (e.key === 'Escape') {
            setIsReceiptPreviewOpen(false);
         }
      };
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
   }, [isReceiptPreviewOpen]);

   const [operatorNames, setOperatorNames] = useState<{ [id: string]: string }>({});

   // Removido: busca de nomes dos operadores após cashHistory, pois agora é feito junto com o fetch

   // if (sessionError) {
   //    return (
   //       <div className="min-h-screen flex items-center justify-center bg-dark-950">
   //          <div className="flex flex-col items-center gap-4">
   //             <AlertTriangle size={48} className="text-red-500" />
   //             <h1 className="text-2xl font-bold text-white">Erro na Sessão</h1>
   //             <p className="text-slate-400 text-center max-w-md">{sessionError}</p>
   //          </div>
   //       </div>
   //    );
   // }

   if (error) {
      return (
         <div className="min-h-screen flex items-center justify-center bg-dark-950">
            <div className="flex flex-col items-center gap-4">
               <AlertTriangle size={48} className="text-red-500" />
               <h1 className="text-2xl font-bold text-white">Erro</h1>
               <p className="text-slate-400 text-center max-w-md">{error}</p>
            </div>
         </div>
      );
   }

   function handleOpenProtectedModal(type: 'suprimento' | 'sangria' | 'pagamento') {
      setShowAdminPasswordModal(type);
      sendTelemetry('modal', 'open', { modal: type, guarded: true });
   }
   function handleAdminPasswordSuccess() {
      if (showAdminPasswordModal === 'suprimento') { setIsSuprimentoModalOpen(true); sendTelemetry('modal', 'open', { modal: 'suprimento', guarded: false }); }
      if (showAdminPasswordModal === 'sangria') { setIsSangriaModalOpen(true); sendTelemetry('modal', 'open', { modal: 'sangria', guarded: false }); }
      if (showAdminPasswordModal === 'pagamento') { setIsPagamentoModalOpen(true); sendTelemetry('modal', 'open', { modal: 'pagamento', guarded: false }); }
      setShowAdminPasswordModal("");
   }

   return (
      <div className="flex-1 flex flex-col min-h-0 max-h-[calc(100vh-0px)] overflow-y-auto assemble-view bg-dark-950 bg-cyber-grid p-4 md:p-8 relative">
         <div className="flex items-center justify-between shrink-0 mb-6 relative z-10">
            <div>
               <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                  <DollarSign className="text-accent" /> Gestão Financeira
               </h1>
               <p className="text-slate-500 text-xs md:text-sm font-medium">Auditoria em tempo real do fluxo de caixa e sangrias.</p>
            </div>

         </div>

         {/* Tabs Principais */}
         <div className="flex items-center gap-2 mb-6 relative z-10 animate-in fade-in slide-in-from-top-2 duration-400 shrink-0">
            <button
               onClick={() => setActiveTab('current')}
               className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all duration-300 ${activeTab === 'current'
                  ? 'bg-accent/10 border-accent/40 text-accent shadow-accent-glow'
                  : 'bg-dark-900/40 border-white/5 text-slate-500 hover:text-slate-300'
                  }`}
            >
               <Zap size={14} />
               <span className="text-[9px] font-bold uppercase tracking-widest">Sessão Atual</span>
            </button>
            <button
               onClick={() => setActiveTab('history')}
               className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all duration-300 ${activeTab === 'history'
                  ? 'bg-accent/10 border-accent/40 text-accent shadow-accent-glow'
                  : 'bg-dark-900/40 border-white/5 text-slate-500 hover:text-slate-300'
                  }`}
            >
               <History size={14} />
               <span className="text-[9px] font-bold uppercase tracking-widest">Histórico</span>
            </button>
            <button
               onClick={() => setActiveTab('performance')}
               className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all duration-300 ${activeTab === 'performance'
                  ? 'bg-accent/10 border-accent/40 text-accent shadow-accent-glow'
                  : 'bg-dark-900/40 border-white/5 text-slate-500 hover:text-slate-300'
                  }`}
            >
               <TrendingUp size={14} />
               <span className="text-[9px] font-bold uppercase tracking-widest">Desempenho</span>
            </button>
            <button
               onClick={() => setActiveTab('operators')}
               className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all duration-300 ${activeTab === 'operators'
                  ? 'bg-accent/10 border-accent/40 text-accent shadow-accent-glow'
                  : 'bg-dark-900/40 border-white/5 text-slate-500 hover:text-slate-300'
                  }`}
            >
               <User size={14} />
               <span className="text-[9px] font-bold uppercase tracking-widest">Vendas por Operador</span>
            </button>
         </div>

         {activeTab === 'current' ? (
            sessionLoading ? (
               <div className="flex-1 flex items-center justify-center h-full">
                  <FuturisticSpinner />
               </div>
            ) : (

               <>

                  {sessionActive ? (

                     <div>


                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 shrink-0 mb-4 sm:mb-6 relative z-10 animate-in fade-in slide-in-from-top-4 duration-500">
                           <Card className="bg-dark-900/60 border-accent/20 shadow-accent-glow/10 p-2 sm:p-3">
                              <div className="flex items-center justify-between gap-3">
                                 <div className="p-1.5 rounded-lg bg-accent/10 text-accent border border-accent/20">
                                    <ShoppingBag size={14} />
                                 </div>
                                 <div className="text-right">
                                    <p className="text-slate-500 text-[8px] font-bold uppercase tracking-widest mb-1">Total de vendas</p>
                                    <h3 className="text-base sm:text-lg font-num font-bold text-accent leading-tight">
                                       R$ {
                                          (() => {
                                             if (!session || !Array.isArray(session.transactions)) return '0.00';
                                             const vendas = session.transactions.filter(
                                                (tx): tx is SaleTransaction => 'status' in tx && Array.isArray((tx as SaleTransaction).items)
                                             );
                                             const totalVendas = vendas.reduce((acc: number, venda: SaleTransaction) => {
                                                if (typeof venda.total === 'number') return acc + venda.total;
                                                if (Array.isArray(venda.items)) {
                                                   return acc + venda.items.reduce(
                                                      (sum: number, item: SaleTransaction['items'][number]) =>
                                                         sum + (typeof item?.line_total === 'number'
                                                            ? item.line_total
                                                            : (item as any)?.lineTotal || 0),
                                                      0
                                                   );
                                                }
                                                return acc;
                                             }, 0);
                                             return (totalVendas / 100).toFixed(2);
                                          })()
                                       }
                                    </h3>
                                 </div>
                              </div>
                           </Card>

                           <Card className="bg-dark-900/60 border-white/5 p-2 sm:p-3">
                              <div className="flex items-center justify-between gap-3">
                                 <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/30">
                                    <ArrowDownLeft size={14} />
                                 </div>
                                 <div className="text-right">
                                    <p className="text-slate-500 text-[8px] font-bold uppercase tracking-widest mb-1">Injeções</p>
                                    <h3 className="text-sm sm:text-base font-num font-bold text-blue-400 leading-tight">
                                       + R$ {
                                          (() => {
                                             if (!session || !Array.isArray(session.transactions)) return '0.00';
                                             const totalSuprimentos = (session.transactions as Array<SaleTransaction | MovementTransaction>).reduce(
                                                (sum: number, tx: SaleTransaction | MovementTransaction) =>
                                                   'type' in tx && tx.type === 'suprimento' && typeof tx.amount === 'number'
                                                      ? sum + tx.amount
                                                      : sum,
                                                0
                                             );
                                             return (totalSuprimentos / 100).toFixed(2);
                                          })()
                                       }
                                    </h3>
                                 </div>
                              </div>
                           </Card>

                           <Card className="bg-dark-900/60 border-white/5 p-2 sm:p-3">
                              <div className="flex items-center justify-between gap-3">

                                 <div className="p-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30">
                                    <ArrowUpRight size={14} />
                                 </div>
                                 <div className="text-right">
                                    <p className="text-slate-500 text-[8px] font-bold uppercase tracking-widest mb-1">Deduções</p>
                                    <h3 className="text-sm sm:text-base font-num font-bold text-red-400 leading-tight">
                                       - R$ {
                                          (() => {
                                             if (!session || !Array.isArray(session.transactions)) return '0.00';
                                             const totalDeducoes = (session.transactions as Array<SaleTransaction | MovementTransaction>).reduce(
                                                (sum: number, tx: SaleTransaction | MovementTransaction) =>
                                                   'type' in tx && (tx.type === 'sangria' || tx.type === 'pagamento') && typeof tx.amount === 'number'
                                                      ? sum + tx.amount
                                                      : sum,
                                                0
                                             );
                                             return (totalDeducoes / 100).toFixed(2);
                                          })()
                                       }
                                    </h3>
                                 </div>
                              </div>
                           </Card>

                           <Card className="bg-dark-900/60 border-white/5 p-2 sm:p-3">
                              <div className="flex items-center justify-between gap-3">
                                 <div className="p-1.5 rounded-lg bg-slate-500/10 text-slate-300 border border-white/10">
                                    <Calculator size={14} />
                                 </div>
                                 <div className="text-right">
                                    <p className="text-slate-500 text-[8px] font-bold uppercase tracking-widest mb-1">Dinheiro em Caixa</p>
                                    <h3 className="text-sm sm:text-base font-num font-bold text-slate-200 leading-tight">
                                       R$ {calculateCashBalance(session)}
                                    </h3>
                                 </div>
                              </div>
                           </Card>
                        </div>


                        {/* Tabela de Movimentações */}
                        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden min-h-0 relative z-10">
                           <div className="lg:col-span-8 flex flex-col overflow-hidden animate-in fade-in slide-in-from-left-4 duration-700">
                              <div className="flex items-center justify-between mb-3 shrink-0 px-2">
                                 <h2 className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">Fluxo Transacional</h2>
                              </div>

                              {/* Tabela de Movimentações */}
                              <div className="flex-1 bg-dark-900/40 border border-white/5 rounded-2xl overflow-hidden flex flex-col min-h-0 shadow-2xl backdrop-blur-md">
                                 <div className="overflow-y-auto flex-1 custom-scrollbar max-h-[40vh]">
                                    <table className="w-full text-left border-collapse">
                                       <thead className="sticky top-0 bg-dark-950/90 backdrop-blur-md z-20 border-b border-white/5">
                                          <tr className="text-slate-600 text-[9px] uppercase font-bold tracking-[0.2em]">
                                             <th className="px-6 py-4">Movimento</th>
                                             <th className="px-6 py-4">Evento</th>
                                             <th className="px-6 py-4">Valor</th>
                                             <th className="px-6 py-4 text-right">Hora</th>
                                          </tr>
                                       </thead>
                                       <tbody className="divide-y divide-white/5">
                                          {(session && Array.isArray(session.transactions))
                                             ? (session.transactions as Array<SaleTransaction | MovementTransaction>)
                                                .filter((tx: SaleTransaction | MovementTransaction) => {
                                                   // Exibir apenas vendas, suprimentos, sangrias e pagamentos
                                                   if ('status' in tx && Array.isArray(tx.items)) return true; // SaleTransaction
                                                   if ('type' in tx && ['suprimento', 'sangria', 'pagamento'].includes(tx.type)) return true; // MovementTransaction
                                                   return false;
                                                })
                                                .map((tx: SaleTransaction | MovementTransaction) => {
                                                   if ('status' in tx && Array.isArray(tx.items)) {
                                                      // SaleTransaction
                                                      const total = typeof tx.total === 'number'
                                                         ? tx.total
                                                         : tx.items.reduce(
                                                            (sum: number, item: SaleTransaction['items'][number]) =>
                                                               sum + (typeof item?.line_total === 'number' ? item.line_total : 0),
                                                            0
                                                         );
                                                      const description = `Venda #${tx.id}`;
                                                      return (
                                                         <tr key={tx.id} onClick={() => handleSelectTx(tx, 'current-transactions')} className="group hover:bg-white/5 transition-all cursor-pointer active:scale-[0.99]">
                                                            <td className="px-6 py-4">
                                                               <div className="flex items-center gap-3">
                                                                  <div className={`p-1.5 rounded-lg bg-white/2 border border-white/5 ${getStatusColor('sale')}`}>{getStatusIcon('sale')}</div>
                                                                  <span className="text-[10px] font-bold uppercase tracking-tighter text-slate-300">sale</span>
                                                               </div>
                                                            </td>
                                                            <td className="px-6 py-4 text-[11px] text-slate-500 group-hover:text-slate-300 transition-colors font-medium truncate max-w-[150px]">{description.toString().slice(0, 15)}</td>
                                                            <td className={`px-6 py-4 font-num text-[11px] font-bold text-accent`}>+ R$ {total ? (total / 100).toFixed(2) : '0.00'}</td>
                                                            <td className="px-6 py-4 text-right text-slate-600 font-num text-[9px] group-hover:text-slate-400">{new Date(tx.timestamp || tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                                         </tr>
                                                      );
                                                   } else if ('type' in tx) {
                                                      // MovementTransaction
                                                      const type = tx.type;
                                                      const total = typeof tx.amount === 'number' ? tx.amount : 0;
                                                      const description = tx.description;
                                                      return (
                                                         <tr key={tx.id} onClick={() => handleSelectTx(tx, 'current-transactions')} className="group hover:bg-white/5 transition-all cursor-pointer active:scale-[0.99]">
                                                            <td className="px-6 py-4">
                                                               <div className="flex items-center gap-3">
                                                                  <div className={`p-1.5 rounded-lg bg-white/2 border border-white/5 ${getStatusColor(type)}`}>{getStatusIcon(type)}</div>
                                                                  <span className="text-[10px] font-bold uppercase tracking-tighter text-slate-300">{type}</span>
                                                               </div>
                                                            </td>
                                                            <td className="px-6 py-4 text-[11px] text-slate-500 group-hover:text-slate-300 transition-colors font-medium truncate max-w-[150px]">{description}</td>
                                                            <td className={`px-6 py-4 font-num text-[11px] font-bold ${type === 'sangria' || type === 'pagamento' ? 'text-red-400' : 'text-accent'}`}>{type === 'sangria' || type === 'pagamento' ? '-' : '+'} R$ {total ? (total / 100).toFixed(2) : '0.00'}</td>
                                                            <td className="px-6 py-4 text-right text-slate-600 font-num text-[9px] group-hover:text-slate-400">{new Date(tx.timestamp || tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                                         </tr>
                                                      );
                                                   }
                                                   return null;
                                                })
                                             : null}
                                       </tbody>
                                    </table>
                                 </div>
                              </div>
                           </div>
                           {/* Painel de Comandos */}
                           <div className="lg:col-span-4 flex flex-col gap-4 min-h-0 animate-in fade-in slide-in-from-right-4 duration-700 overflow-y-auto lg:overflow-visible custom-scrollbar">
                              <h2 className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 px-2 shrink-0">Comandos</h2>
                              <div className="flex flex-col gap-3 shrink-0">
                                 <Button variant="secondary" onClick={() => handleOpenProtectedModal('suprimento')} className="justify-start py-4 px-5 border-white/5 hover:border-blue-500/30 group bg-dark-900/40 backdrop-blur-md" icon={<ArrowDownLeft className="text-blue-400 group-hover:-translate-y-1 transition-transform" size={18} />}>
                                    <div className="text-left"><p className="text-[10px] font-bold uppercase tracking-widest">Suprimento</p></div>
                                 </Button>
                                 <Button variant="secondary" onClick={() => handleOpenProtectedModal('sangria')} className="justify-start py-4 px-5 border-white/5 hover:border-red-500/30 group bg-dark-900/40 backdrop-blur-md" icon={<ArrowUpRight className="text-red-400 group-hover:translate-y-1 transition-transform" size={18} />}>
                                    <div className="text-left"><p className="text-[10px] font-bold uppercase tracking-widest">Sangria</p></div>
                                 </Button>
                                 <Button variant="secondary" onClick={() => handleOpenProtectedModal('pagamento')} className="justify-start py-4 px-5 border-white/5 hover:border-amber-500/30 group bg-dark-900/40 backdrop-blur-md" icon={<FileText className="text-amber-500 group-hover:scale-110 transition-transform" size={18} />}>
                                    <div className="text-left"><p className="text-[10px] font-bold uppercase tracking-widest">Pagamento</p></div>
                                 </Button>
                              </div>
                              <div className="mt-auto lg:mt-6 pt-4 border-t border-white/5 shrink-0">
                                 <div className="bg-dark-900/40 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center shadow-inner">
                                    <p className="text-slate-500 text-[8px] font-bold uppercase tracking-widest mb-1">Abertura do Caixa</p>
                                    <h3 className="text-lg md:text-xl font-num font-bold text-accent">
                                       {session && session.opened_at
                                          ? new Date(session.opened_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                                          : '--'}
                                    </h3>
                                 </div>
                              </div>
                           </div>
                        </div>
                     </div>
                  ) : (
                     <div>
                        <div className="flex-1 flex items-center justify-center relative overflow-visible py-4">
                           {/* Animated background grid */}
                           <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,var(--tw-gradient-stops))] from-accent/5 via-transparent to-transparent animate-pulse"></div>

                           {/* Animated scan lines */}
                           <div className="absolute inset-0 bg-[linear-gradient(0deg,transparent_0%,rgba(6,182,212,0.03)_50%,transparent_100%)] bg-size-[100%_4px] animate-scan"></div>

                           <div className="relative z-10 flex flex-col items-center gap-6 text-center max-w-2xl px-6 animate-in fade-in zoom-in-95 duration-700">
                              {/* Holographic icon container */}
                              <div className="relative pt-4">
                                 <div className="absolute inset-0 bg-accent/20 blur-3xl animate-pulse"></div>
                                 <div className="relative p-6 rounded-3xl bg-dark-900/60 border-2 border-accent/30 backdrop-blur-xl shadow-[0_0_50px_rgba(6,182,212,0.3)] animate-float">
                                    <div className="relative">
                                       <DollarSign size={72} className="text-accent animate-pulse" strokeWidth={1.5} />
                                       <div className="absolute inset-0 bg-accent/20 blur-2xl animate-ping"></div>
                                    </div>
                                 </div>
                                 {/* Corner accents */}
                                 <div className="absolute -top-2 -left-2 w-6 h-6 border-l-2 border-t-2 border-accent/50 rounded-tl-lg"></div>
                                 <div className="absolute -top-2 -right-2 w-6 h-6 border-r-2 border-t-2 border-accent/50 rounded-tr-lg"></div>
                                 <div className="absolute -bottom-2 -left-2 w-6 h-6 border-l-2 border-b-2 border-accent/50 rounded-bl-lg"></div>
                                 <div className="absolute -bottom-2 -right-2 w-6 h-6 border-r-2 border-b-2 border-accent/50 rounded-br-lg"></div>
                              </div>

                              {/* Status message */}
                              <div className="space-y-3">
                                 

                                 <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight animate-in slide-in-from-top-6 duration-700">
                                    Nenhum Caixa Aberto
                                 </h2>

                                 <p className="text-slate-400 text-sm md:text-base max-w-md leading-relaxed animate-in slide-in-from-top-8 duration-900">
                                    Não há sessões de caixa ativas no momento. Inicie uma nova sessão para começar as operações financeiras.
                                 </p>
                              </div>



                              {/* Action hint */}
                              <div className="mt-6 p-5 bg-accent/5 border border-accent/20 rounded-2xl backdrop-blur-sm animate-in slide-in-from-bottom-6 duration-1100">
                                 <div className="flex items-start gap-4">
                                    <div className="p-2 bg-accent/10 rounded-lg shrink-0">
                                       <Info size={20} className="text-accent" />
                                    </div>
                                    <div className="text-left space-y-2">
                                       <h4 className="text-xs font-bold uppercase tracking-widest text-accent">Como Iniciar</h4>
                                       <p className="text-[11px] text-slate-400 leading-relaxed">
                                          Para abrir uma nova sessão de caixa, navegue até a tela do <span className="text-accent font-bold">Terminal</span>.
                                       </p>
                                    </div>
                                 </div>
                              </div>
                           </div>
                        </div>
                     </div>
                  )}


               </>

            )
         ) : activeTab === 'history' ? (
            /* ABA DE HISTÓRICO */
            <div className="flex-1 flex flex-col min-h-0 relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-600">
               <div className="flex items-center justify-between mb-4 px-2">
                  <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Auditoria Retroativa</h2>
                  <div className="bg-dark-900/60 border border-white/5 rounded-xl px-4 py-1.5 flex items-center gap-3">
                     <Search size={14} className="text-slate-600" />
                     <input
                        placeholder="Busca rápida..."
                        className="bg-transparent text-[10px] font-bold uppercase tracking-widest text-slate-400 outline-none w-32 md:w-40"
                        value={historySearch}
                        onChange={e => handleHistorySearchChange(e.target.value)}
                        type="text"
                     />
                  </div>
               </div>
               {cashHistoryLoading ? (
                  <div className="flex-1 flex items-center justify-center h-full">
                     <FuturisticSpinner />
                  </div>
               ) : (
                  <div className="flex-1 bg-dark-900/40 border border-white/5 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md flex flex-col min-h-0">
                     {console.log('Histórico de caixas:', cashHistory)}
                     <div className="overflow-y-auto flex-1 custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                           <thead className="sticky top-0 bg-dark-950/90 backdrop-blur-md z-20 border-b border-white/5">
                              <tr className="text-slate-600 text-[9px] uppercase font-bold tracking-[0.2em]">
                                 <th className="px-6 py-4">Operação</th>
                                 <th className="px-6 py-4">Operador</th>
                                 <th className="px-6 py-4">Saldo Inicial</th>
                                 <th className="px-6 py-4">Diferença</th>
                                 <th className="px-6 py-4">Saldo Fechamento</th>
                                 <th className="px-6 py-4">Status</th>
                                 <th className="px-6 py-4 text-right">Ações</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-white/5">
                              {cashHistoryError ? (
                                 <tr><td colSpan={7} className="text-center text-red-500 py-8">{cashHistoryError}</td></tr>
                              ) : (
                                 cashHistory
                                    .filter((history: any) => {
                                       if (!historySearch) return true;
                                       // Permitir busca por data no formato dd/mm/yyyy, dd-mm-yyyy ou yyyy-mm-dd
                                       const search = historySearch.trim().replace(/\//g, '-');
                                       const date = history.opened_at ? new Date(history.opened_at) : null;
                                       if (!date) return false;
                                       const day = String(date.getDate()).padStart(2, '0');
                                       const month = String(date.getMonth() + 1).padStart(2, '0');
                                       const year = date.getFullYear();
                                       const dateStrings = [
                                          `${day}-${month}-${year}`,
                                          `${day}/${month}/${year}`,
                                          `${year}-${month}-${day}`,
                                          date.toLocaleDateString('pt-BR'),
                                          date.toLocaleDateString('en-CA'),
                                       ];
                                       return dateStrings.some(ds => ds.includes(search));
                                    })
                                    .map((history: any) => (
                                       <tr
                                          key={history.id}
                                          className="group hover:bg-white/5 transition-all cursor-pointer"
                                          onClick={() => { setSelectedHistory(history); setHistoryModalTab('resumo'); sendTelemetry('modal', 'open', { modal: 'cash-history', id: history.id }); }}
                                       >
                                          <td className="px-6 py-4">
                                             <div className="flex items-center gap-3">
                                                <div className="p-1.5 rounded bg-accent/10 border border-accent/20">
                                                   <Archive size={12} className="text-accent" />
                                                </div>
                                                <span className="text-[10px] font-bold text-slate-300">{history.opened_at ? new Date(history.opened_at).toLocaleDateString() : '-'}</span>
                                             </div>
                                          </td>
                                          <td className="px-6 py-4">
                                             <span className="text-[11px] font-medium text-slate-400">{operatorNames[history.operator_id] || history.operator_id || '-'}</span>
                                          </td>
                                          <td className="px-6 py-4">
                                             <span className="text-[11px] font-num font-bold text-slate-200">R$ {typeof history.initial_balance === 'number' ? (history.initial_balance / 100).toFixed(2) : '0,00'}</span>
                                          </td>
                                          <td className="px-6 py-4">
                                             <span className="text-[11px] font-num font-bold text-slate-200">R$ {typeof history.difference_at_close === 'number' ? (history.difference_at_close / 100).toFixed(2) : '0,00'}</span>
                                          </td>
                                          <td className="px-6 py-4">
                                             <span className="text-[11px] font-num font-bold text-slate-200">R$ {typeof history.sales_total === 'number' ? (history.sales_total / 100).toFixed(2) : '0,00'}</span>
                                          </td>
                                          <td className="px-6 py-4">
                                             {history.closed_at ? (
                                                <Badge variant="success">Consolidado</Badge>
                                             ) : (
                                                <Badge variant="warning">Aberto</Badge>
                                             )}
                                          </td>
                                          <td className="px-6 py-4 text-right">
                                             <Button size="sm" variant="ghost" icon={<Eye size={14} />} onClick={e => { e.stopPropagation(); setSelectedHistory(history); setHistoryModalTab('resumo'); sendTelemetry('modal', 'open', { modal: 'cash-history', id: history.id }); }}>Ver</Button>
                                          </td>
                                       </tr>
                                    ))
                              )}
                           </tbody>
                        </table>
                     </div>
                  </div>
               )}
            </div>
         ) : activeTab === 'performance' ? (
            <div className="flex-1 animate-in fade-in duration-300 min-h-0 flex flex-col">
               {/* Componente externo para desempenho ao longo do tempo */}
               <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar rounded-2xl border border-white/5 bg-dark-900/40">
                  <CashPerformanceTrends onTelemetry={(area, action, meta) => sendTelemetry(area, action, meta)} />
               </div>
            </div>
         ) : activeTab === 'operators' ? (
            <div className="flex-1 animate-in fade-in duration-300 min-h-0 flex flex-col">
               {/* Componente de vendas por operador */}
               <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar rounded-2xl border border-white/5 bg-dark-900/40">
                  <OperatorSalesBreakdown 
                     sales={selectedHistory ? sales : salesForOperatorView} 
                     onTelemetry={(area, action, meta) => sendTelemetry(area, action, meta)} 
                  />
               </div>
            </div>
         ) : null}

         {/* MODAL DETALHADO DE HISTÓRICO (AUDITORIA RETROATIVA) */}
         <Modal
            isOpen={!!selectedHistory}
            onClose={() => handleHistoryModalClose('overlay')}
            title={`Relatório de Caixa: ${selectedHistory ? (selectedHistory.opened_at ? new Date(selectedHistory.opened_at).toLocaleDateString() : '-') : ''}`}
            size="5xl"
         >
            {selectedHistory && (
               <div className="flex flex-col h-full space-y-2">
                  {/* Navegação Interna do Modal (Abas) */}
                  <div className="flex items-center gap-1 border-b border-white/5 shrink-0 px-2 -mx-8 -mt-8  bg-dark-950/40">
                     <button
                        onClick={() => setHistoryModalTab('resumo')}
                        className={`px-3 py-6 text-[10px] font-bold uppercase tracking-widest transition-all relative ${historyModalTab === 'resumo' ? 'text-accent' : 'text-slate-500 hover:text-slate-300'
                           }`}
                     >
                        Consolidado Financeiro
                        {historyModalTab === 'resumo' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent shadow-accent-glow" />}
                     </button>
                     <button
                        onClick={() => setHistoryModalTab('movimentacoes')}
                        className={`px-3 py-6 text-[10px] font-bold uppercase tracking-widest transition-all relative ${historyModalTab === 'movimentacoes' ? 'text-accent' : 'text-slate-500 hover:text-slate-300'
                           }`}
                     >
                        Relatório de Caixa
                        {historyModalTab === 'movimentacoes' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent shadow-accent-glow" />}
                     </button>
                     <button
                        onClick={() => setHistoryModalTab('vendas')}
                        className={`px-3 py-6 text-[10px] font-bold uppercase tracking-widest transition-all relative ${historyModalTab === 'vendas' ? 'text-accent' : 'text-slate-500 hover:text-slate-300'
                           }`}
                     >
                        Desempenho do Dia
                        {historyModalTab === 'vendas' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent shadow-accent-glow" />}
                     </button>
                  </div>

                  {historyModalTab === 'resumo' ? (
                     <div className="space-y-8 animate-in fade-in duration-300">
                        {console.log('Selected history for resumo tab:', selectedHistory)}
                        <div className="flex flex-col md:flex-row items-center justify-between p-6 bg-dark-950/80 rounded-2xl border border-white/5 relative overflow-hidden gap-6">
                           <div className="flex items-center gap-5 relative z-10 w-full md:w-auto">
                              <div className={`p-4 rounded-2xl shrink-0 ${selectedHistory.status === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                 {selectedHistory.status === 'success' ? <CheckCircle2 size={32} /> : <Shield size={32} />}
                              </div>
                              <div>
                                 <h3 className="text-xl font-bold text-slate-100 font-num tracking-tighter uppercase">{selectedHistory.is_open === 0 ? 'Caixa Fechado' : 'Caixa Aberto'}</h3>
                                 <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Operador: {operatorNameHistory || '-'}</p>


                              </div>
                           </div>
                           <div className="text-right relative z-10 w-full md:w-auto">
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Fechamento</p>
                              <h3 className="text-3xl font-num font-bold text-accent ">
                                 R$ {
                                    typeof selectedHistory.initial_balance === 'number' &&
                                       typeof selectedHistory.sales_total === 'number' &&
                                       typeof selectedHistory.sangrias_total === 'number'
                                       ? (
                                          (selectedHistory.initial_balance + selectedHistory.sales_total - selectedHistory.sangrias_total) / 100
                                       ).toFixed(2)
                                       : '0.00'
                                 }
                              </h3>
                           </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                           <div className="p-4 bg-dark-950/50 rounded-xl border border-white/5 space-y-1">
                              <p className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">Abertura</p>
                              <p className="text-xs font-num font-bold text-slate-300">{selectedHistory.opened_at ? new Date(selectedHistory.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</p>
                           </div>
                           <div className="p-4 bg-dark-950/50 rounded-xl border border-white/5 space-y-1">
                              <p className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">Encerramento</p>
                              <p className="text-xs font-num font-bold text-slate-300">{selectedHistory.closed_at ? new Date(selectedHistory.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</p>
                           </div>
                           <div className="p-4 bg-dark-950/50 rounded-xl border border-white/5 space-y-1 text-emerald-500/80">
                              <p className="text-[8px] font-bold uppercase tracking-widest">Vendas Totais</p>
                              <p className="text-xs font-num font-bold">R$ {typeof selectedHistory.sales_total === 'number' ? (selectedHistory.sales_total / 100).toFixed(2) : '0.00'}</p>
                           </div>
                           <div className="p-4 bg-dark-950/50 rounded-xl border border-white/5 space-y-1 text-red-500/80">
                              <p className="text-[8px] font-bold uppercase tracking-widest">Sangrias</p>
                              <p className="text-xs font-num font-bold">R$ {typeof selectedHistory.sangrias_total === 'number' ? (selectedHistory.sangrias_total / 100).toFixed(2) : '0.00'}</p>
                           </div>
                        </div>
                        {/* Exibe valor contado apenas se caixa estiver fechado e houver valor, como card destacado abaixo */}
                        {selectedHistory.is_open === 0 && typeof selectedHistory.physical_count_at_close === 'number' && (
                           <div className="mt-4 p-4 bg-dark-950/50 border border-white/5 rounded-xl flex flex-col items-start">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-1">Valor Contado no Fechamento</p>
                              <span className="text-lg font-num font-bold text-slate-400">R$ {(selectedHistory.physical_count_at_close / 100).toFixed(2)}</span>
                           </div>
                        )}

                        <div className="p-6 bg-dark-900/40 rounded-3xl border border-white/5 shadow-2xl space-y-4">
                           <div className="flex items-center justify-between border-b border-white/5 pb-4">
                              <div className="flex items-center gap-3">
                                 <Calculator size={18} className="text-accent" />
                                 <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Auditoria de Lastro Esperado</span>
                              </div>
                              <span className="font-num text-sm font-bold text-slate-100">

                                 {
                                    (() => {
                                       // Se estiver visualizando um histórico fechado, usar selectedHistory
                                       if (selectedHistory && selectedHistory.is_open === 0) {
                                          const initial = typeof selectedHistory.initial_balance === 'number' ? selectedHistory.initial_balance : 0;
                                          const vendas = typeof selectedHistory.sales_total === 'number' ? selectedHistory.sales_total : 0;
                                          const sangrias = typeof selectedHistory.sangrias_total === 'number' ? selectedHistory.sangrias_total : 0;
                                          return ((initial + vendas - sangrias) / 100).toFixed(2);
                                       }
                                       // Caso contrário, usar sessão atual
                                       if (!session || !Array.isArray(session.transactions)) return '0.00';
                                       let initialBalanceCents = session.initial_balance ?? 0;
                                       if (initialBalanceCents < 100 && initialBalanceCents % 1 !== 0) {
                                          initialBalanceCents = Math.round(initialBalanceCents * 100);
                                       }
                                       let totalVendasCash = 0;
                                       let totalSangrias = 0;
                                       session.transactions.forEach(tx => {
                                          if (Array.isArray(tx.payments)) {
                                             tx.payments.forEach(pay => {
                                                if (pay.method === 'cash' && typeof pay.amount === 'number') {
                                                   totalVendasCash += pay.amount;
                                                }
                                             });
                                          }
                                          if (tx.type === 'sangria' && typeof tx.amount === 'number') {
                                             totalSangrias += tx.amount;
                                          }
                                       });
                                       const lastro = initialBalanceCents + totalVendasCash - totalSangrias;
                                       return (lastro / 100).toFixed(2);
                                    })()
                                 }
                              </span>
                              <div>
                                 <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-1">Diferença de Caixa</p>
                                 <h5 className={`text-xl font-num font-bold ${selectedHistory.status === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {selectedHistory.difference_at_close ? `R$ ${(selectedHistory.difference_at_close / 100).toFixed(2)}` : 'R$ 0.00'}
                                 </h5>
                              </div>
                              <Badge variant={selectedHistory.status === 'success' ? 'success' : 'danger'}>
                                 {selectedHistory.status === 'success' ? 'Sessão Íntegra' : 'Quebra Identificada'}
                              </Badge>
                           </div>
                        </div>
                     </div>
                  ) : historyModalTab === 'movimentacoes' ? (
                     <div className="flex-1 flex flex-col min-h-0 animate-in fade-in duration-300">
                        <div className="bg-dark-900/40 border border-white/5 rounded-2xl overflow-hidden flex flex-col flex-1 shadow-inner">
                           <div className="overflow-y-auto flex-1 custom-scrollbar">
                              <table className="w-full text-left border-collapse">
                                 <thead className="sticky top-0 bg-dark-950/90 backdrop-blur-md z-20 border-b border-white/5">
                                    <tr className="text-slate-600 text-[8px] uppercase font-bold tracking-[0.2em]">
                                       <th className="px-4 py-3">Evento</th>
                                       <th className="px-4 py-3">Descrição</th>
                                       <th className="px-4 py-3">Operador</th>
                                       <th className="px-4 py-3">Valor</th>
                                       <th className="px-4 py-3">Horário</th>
                                    </tr>
                                 </thead>
                                 <tbody className="divide-y divide-white/10">
                                    {/* Caixa inicial */}
                                    <tr className="bg-dark-950/60">
                                       <td className="px-4 py-3 font-bold text-slate-400">Abertura</td>
                                       <td className="px-4 py-3 text-slate-300">Caixa inicial</td>
                                       <td className="px-4 py-3 text-slate-400">{operatorNameHistory || selectedHistory?.operator_id || '-'}</td>
                                       <td className="px-4 py-3 font-mono font-bold text-blue-400">R$ {selectedHistory?.initial_balance ? (selectedHistory.initial_balance / 100).toFixed(2) : '0,00'}</td>
                                       <td className="px-4 py-3 text-slate-400">{selectedHistory?.opened_at ? new Date(selectedHistory.opened_at).toLocaleString() : '-'}</td>
                                    </tr>
                                    {/* Vendas principais */}
                                    {sales.map((tx: any) => (
                                       <tr key={tx.id} onClick={() => handleSelectTx(tx, 'history-movements-sales')} className="group hover:bg-white/5 transition-all cursor-pointer">
                                          <td className="px-4 py-3">
                                             <div className="flex items-center gap-2">
                                                <div className={`p-1 rounded bg-white/2 border border-white/5 text-accent`}>{getStatusIcon('sale')}</div>
                                                <span className="text-[9px] font-bold uppercase tracking-widest text-accent">Venda</span>
                                             </div>
                                          </td>
                                          <td className="px-4 py-3 text-[10px] text-slate-300 truncate max-w-[200px]">{`Venda #${tx.id?.toString().slice(0, 8)}`}</td>
                                          <td className="px-4 py-3 text-slate-400">{operatorNameHistory || '-'}</td>
                                          <td className="px-4 py-3 text-right font-mono font-bold text-accent">+ R$ {typeof tx.total === 'number' ? (tx.total / 100).toFixed(2) : (tx.items ? (tx.items.reduce((sum: number, item: any) => sum + (item.line_total || 0), 0) / 100).toFixed(2) : '0.00')}</td>
                                          <td className="px-4 py-3 text-right text-[9px] font-mono text-slate-600">{tx.timestamp ? new Date(tx.timestamp).toLocaleString() : '-'}</td>
                                       </tr>
                                    ))}
                                    {/* Movimentações principais (suprimento, sangria, pagamento, ajuste) */}
                                    {movements.filter((tx: any) => ['suprimento', 'sangria', 'pagamento', 'supply_in', 'withdraw_out', 'adjustment'].includes(tx.type)).map((tx: any) => {
                                       let color = '';
                                       let label = '';
                                       if (tx.type === 'suprimento' || tx.type === 'supply_in') {
                                          color = 'text-blue-400';
                                          label = 'Suprimento';
                                       } else if (tx.type === 'sangria' || tx.type === 'withdraw_out') {
                                          color = 'text-red-400';
                                          label = 'Sangria';
                                       } else if (tx.type === 'pagamento' || tx.type === 'adjustment') {
                                          color = 'text-amber-400';
                                          label = 'Pagamento';
                                       } else {
                                          color = 'text-slate-400';
                                          label = tx.type;
                                       }
                                       return (
                                          <tr key={tx.id} onClick={() => handleSelectTx(tx, 'history-movements')} className="group hover:bg-white/5 transition-all cursor-pointer">
                                             <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                   <div className={`p-1 rounded bg-white/2 border border-white/5 ${color}`}>{getStatusIcon(tx.type)}</div>
                                                   <span className={`text-[9px] font-bold uppercase tracking-widest ${color}`}>{label}</span>
                                                </div>
                                             </td>
                                             <td className="px-4 py-3 text-[10px] text-slate-300 truncate max-w-[200px]">{tx.description}</td>
                                             <td className="px-4 py-3 text-slate-400">{operatorNameHistory || '-'}</td>
                                             <td className={`px-4 py-3 text-right font-mono font-bold ${color}`}>{(tx.type === 'sangria' || tx.type === 'withdraw_out' || tx.type === 'pagamento' || tx.type === 'adjustment') ? '- ' : '+ '}R$ {typeof tx.amount === 'number' ? (tx.amount / 100).toFixed(2) : '0.00'}</td>
                                             <td className="px-4 py-3 text-right text-[9px] font-mono text-slate-600">{tx.timestamp ? new Date(tx.timestamp).toLocaleString() : '-'}</td>
                                          </tr>
                                       );
                                    })}
                                    {/* Linha de total de vendas consolidado */}
                                    <tr className="bg-dark-950/80 font-bold">
                                       <td className="px-4 py-3 text-accent">Total de Vendas</td>
                                       <td className="px-4 py-3 text-slate-300">—</td>
                                       <td className="px-4 py-3 text-slate-400">—</td>
                                       <td className="px-4 py-3 text-right font-mono text-accent">
                                          {(() => {
                                             let totalVendas = 0;
                                             sales.forEach((tx: any) => {
                                                if (typeof tx.total === 'number') {
                                                   totalVendas += tx.total;
                                                } else if (Array.isArray(tx.items)) {
                                                   totalVendas += tx.items.reduce((sum: number, item: any) => sum + (item.line_total || item.lineTotal || 0), 0);
                                                }
                                             });
                                             return `R$ ${(totalVendas / 100).toFixed(2)}`;
                                          })()}
                                       </td>
                                       <td className="px-4 py-3">—</td>
                                    </tr>
                                    {/* Fechamento do caixa */}
                                    {selectedHistory.closed_at && (
                                       <tr className="bg-dark-950/60">
                                          <td className="px-4 py-3 font-bold text-slate-400">Fechamento</td>
                                          <td className="px-4 py-3 text-slate-300">Caixa fechado</td>
                                          <td className="px-4 py-3 text-slate-400">{operatorNameHistory || selectedHistory.operator_id || '-'}</td>
                                          <td className="px-4 py-3 font-mono font-bold text-green-400">R$ {selectedHistory.physical_count_at_close ? (selectedHistory.physical_count_at_close / 100).toFixed(2) : '-'}</td>
                                          <td className="px-4 py-3 text-slate-400">{selectedHistory.closed_at ? new Date(selectedHistory.closed_at).toLocaleString() : '-'}</td>
                                       </tr>
                                    )}
                                 </tbody>
                              </table>
                           </div>
                        </div>
                     </div>
                  ) : historyModalTab === 'vendas' ? (
                     <div className="flex-1  animate-in fade-in duration-300 min-h-0 flex flex-col">
                        {/* Componente externo para detalhamento de vendas */}
                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar rounded-2xl border border-white/5 bg-dark-900/40">
                           <CashSalesBreakdown sales={sales} movements={movements} />
                        </div>
                     </div>
                  ) : null}

                  <div className="flex flex-col sm:flex-row gap-4 pt-4 shrink-0">
                     <Button variant="secondary" className="flex-1 py-4 text-[10px] font-bold uppercase tracking-widest" onClick={() => handleHistoryModalClose('button')}>Fechar Auditoria</Button>
                  </div>
               </div>
            )}
         </Modal>

         {/* TRANSACTION DETAIL MODAL */}
         <Modal
            isOpen={!!selectedTx && !isReceiptPreviewOpen}
            onClose={() => closeTxDetail('modal-close')}
            title="Auditoria de Movimentação Transacional"
            size="lg"
         >
            {selectedTx && (
               <div className="space-y-8 animate-in zoom-in-95 duration-200">
                  {console.log('Selected transaction for detail modal:', selectedTx)}

                  {/* Card de Cabeçalho com Valor e Tipo */}
                  <div className="flex items-center justify-between p-6 bg-dark-950/80 rounded-2xl border border-white/5 shadow-inner">
                     <div className="flex items-center gap-4">
                        <div className="p-4 rounded-2xl bg-white/2 text-accent border border-white/5 flex items-center gap-1">
                           <ArrowUpDown size={16} />

                        </div>
                        <div>
                           <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Natureza</p>
                           <h3 className="text-xl font-bold text-slate-100 uppercase tracking-tighter">
                              {Array.isArray(selectedTx.payments) && selectedTx.payments.length > 0
                                 ? 'Venda'
                                 : selectedTx.type}
                           </h3>
                        </div>
                     </div>
                     <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Vlr Líquido</p>
                        <h3 className={`text-3xl font-mono font-bold ${selectedTx.type === 'sangria' || selectedTx.type === 'pagamento' ? 'text-red-400' : 'text-accent'}`}>
                           {(() => {
                              if (selectedTx.type === 'sale' || (selectedTx.items && Array.isArray(selectedTx.items) && selectedTx.items.length > 0)) {
                                 // Para vendas, mostrar total - desconto
                                 const total = typeof selectedTx.total === 'number' ? selectedTx.total : 0;
                                 return `+ R$ ${((total) / 100).toFixed(2)}`;
                              }
                              else if (selectedTx.type === 'suprimento') {
                                 return `+ R$ ${typeof selectedTx.amount === 'number' ? (selectedTx.amount / 100).toFixed(2) : '0.00'}`;
                              }
                              else if (selectedTx.type === 'sangria' || selectedTx.type === 'pagamento') {
                                 return `- R$ ${typeof selectedTx.amount === 'number' ? selectedTx.amount.toFixed(2) : '0.00'}`;
                              }
                              return `+ R$ ${typeof selectedTx.amount === 'number' ? selectedTx.amount.toFixed(2) : '0.00'}`;
                           })()}
                        </h3>
                     </div>
                  </div>

                  {/* Seção completa de venda */}
                  {selectedTx.items && selectedTx.items.length > 0 && selectedTx.payments.length > 0 ? (
                     <div className="space-y-6">
                        <div className="p-6 bg-dark-950/80 rounded-2xl border-2 border-dashed border-white/5 space-y-4">
                           <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500 border-b border-white/5 pb-2">Produtos Vendidos</h4>
                           {selectedTx.items && Array.isArray(selectedTx.items) && selectedTx.items.length > 0 ? (
                              <div className="space-y-1">
                                 {selectedTx.items.map((item: any, idx: number) => (
                                    <div key={idx} className="flex justify-between items-center text-sm font-mono">
                                       <span className="text-slate-400"><span className="text-accent">{item.quantity}x</span> {item.product_name_snapshot}</span>
                                       <span className="text-slate-200">R$ {typeof item.line_total === 'number' ? (item.line_total / 100).toFixed(2) : '0.00'}</span>
                                    </div>
                                 ))}
                              </div>
                           ) : (
                              <p className="text-[10px] text-slate-600 uppercase italic">Nenhum produto vinculado a esta venda.</p>
                           )}
                           <div className="pt-4 border-t border-white/5 flex flex-col gap-2 font-bold">

                              <div className="flex justify-between text-xs">
                                 <span>Descontos Aplicados:</span>
                                 <span className="text-red-400">- R$ {typeof selectedTx.discount_total === 'number' ? (selectedTx.discount_total / 100).toFixed(2) : '0.00'}</span>
                              </div>
                              <div className="flex flex-col gap-1 mt-2">
                                 <span className="text-xs font-bold text-slate-400">Método de Pagamento:</span>
                                 {selectedTx.payments && Array.isArray(selectedTx.payments) && selectedTx.payments.length > 0 ? (
                                    selectedTx.payments.map((pay: any, idx: number) => (
                                       <span key={idx} className="text-xs text-slate-300">{pay.method}: R$ {typeof pay.amount === 'number' ? (pay.amount / 100).toFixed(2) : '0.00'}</span>
                                    ))
                                 ) : (
                                    <span className="text-xs text-slate-300">Não informado</span>
                                 )}
                              </div>
                              <div className="flex flex-col gap-1 mt-2">
                                 <span className="text-xs font-bold text-slate-400">Operador Responsável:</span>
                                 <span className="text-xs text-slate-300">
                                    {selectedTx.metadata?.operator
                                       || operatorName
                                       || session?.operator
                                       || 'Não informado'}
                                 </span>
                              </div>
                           </div>
                        </div>
                     </div>
                  ) : (
                     /* Seção para Outras Movimentações (Sangria, Suprimento, Pagamento) */
                     <div className="space-y-6">
                        <div className="p-6 bg-dark-950/50 rounded-2xl border border-white/5 space-y-3">
                           <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Justificativa Operacional</p>
                           <p className="text-xs text-slate-300 leading-relaxed italic">"{selectedTx.description}"</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                           <div className="p-4 bg-white/2 rounded-xl border border-white/5">
                              <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Autorizado por</p>
                              <p className="text-xs font-bold text-slate-300 flex items-center gap-2">
                                 <Shield size={12} className="text-accent" /> {selectedTx.metadata?.operator || 'Admin'}
                              </p>
                           </div>
                           <div className="p-4 bg-white/2 rounded-xl border border-white/5">
                              <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Alocação / Categoria</p>
                              <p className="text-xs font-bold text-slate-300 flex items-center gap-2 uppercase tracking-tighter">
                                 <Tag size={12} className="text-accent" /> {selectedTx.category || 'Operacional'}
                              </p>
                           </div>
                        </div>
                     </div>
                  )}

                           {/* Rodapé do Modal */}
                           <div className="flex gap-4 pt-4 border-t border-white/5">
                               <Button
                                    variant="secondary"
                                    className="flex-1 py-4 text-xs font-bold uppercase tracking-widest"
                                    onClick={() => closeTxDetail('close-button')}
                               >Fechar Auditoria</Button>
                               {selectedTx && selectedTx.items && selectedTx.items.length > 0 && selectedTx.payments && selectedTx.payments.length > 0 && (
                                  <Button
                                     variant="primary"
                                     className="flex-1 py-4 text-xs font-bold uppercase tracking-widest"
                                     icon={<Printer size={18} />}
                                     onClick={async () => {
                                        // Monta objeto company (usa dados do .env via pdfUtils)
                                        const company = {
                                           name: import.meta.env.VITE_APP_NAME,
                                           cnpj: import.meta.env.VITE_APP_CNPJ || '',
                                           address: import.meta.env.VITE_APP_ADDRESS || '',
                                           phone: import.meta.env.VITE_APP_PHONE || ''
                                        };
                                        // Adapta selectedTx para o formato esperado por generateReceiptPDF
                                        const sale = {
                                           ...selectedTx,
                                           createdAt: selectedTx.created_at || selectedTx.createdAt || Date.now(),
                                           clientName: selectedTx.client_name || selectedTx.clientName || '',
                                           clientCpf: selectedTx.client_cpf || selectedTx.clientCpf || '',
                                           items: (selectedTx.items || []).map((item: any) => ({
                                              productName: item.product_name_snapshot || item.productName || item.name,
                                              quantity: item.quantity,
                                              unitPrice: item.unit_price_at_sale || item.unitPrice || item.unit_price || 0,
                                           })),
                                           discountCents: selectedTx.discount_total || selectedTx.discountCents || 0,
                                           adjustmentCents: selectedTx.adjustmentCents || 0,
                                           total: selectedTx.total,
                                           payments: (selectedTx.payments || []).map((p: any) => ({
                                              method: p.method,
                                              amount: p.amount,
                                           })),
                                           id: selectedTx.id,
                                        };
                                        await generateReceiptPDF({ company, sale });
                                     }}
                                     title="Imprimir Recibo [I]"
                                  >Imprimir Recibo</Button>
                               )}
                           </div>
               </div>
            )}
         </Modal>

         {/* TRANSACTION DETAIL MODAL */}
         <Modal
            isOpen={!!selectedTx && !isReceiptPreviewOpen}
            onClose={() => closeTxDetail('modal-close')}
            title="Auditoria de Movimentação Transacional"
            size="lg"
         >
            {selectedTx && (
               <div className="space-y-8 animate-in zoom-in-95 duration-200">
                  {console.log('Selected transaction for detail modal:', selectedTx)}

                  {/* Card de Cabeçalho com Valor e Tipo */}
                  <div className="flex items-center justify-between p-6 bg-dark-950/80 rounded-2xl border border-white/5 shadow-inner">
                     <div className="flex items-center gap-4">
                        <div className="p-4 rounded-2xl bg-white/2 text-accent border border-white/5 flex items-center gap-1">
                           <ArrowUpDown size={16} />

                        </div>
                        <div>
                           <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Natureza</p>
                           <h3 className="text-xl font-bold text-slate-100 uppercase tracking-tighter">
                              {Array.isArray(selectedTx.payments) && selectedTx.payments.length > 0
                                 ? 'Venda'
                                 : selectedTx.type}
                           </h3>
                        </div>
                     </div>
                     <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Vlr Líquido</p>
                        <h3 className={`text-3xl font-mono font-bold ${selectedTx.type === 'sangria' || selectedTx.type === 'pagamento' ? 'text-red-400' : 'text-accent'}`}>
                           {(() => {
                              if (selectedTx.type === 'sale' || (selectedTx.items && Array.isArray(selectedTx.items) && selectedTx.items.length > 0)) {
                                 // Para vendas, mostrar total - desconto
                                 const total = typeof selectedTx.total === 'number' ? selectedTx.total : 0;
                                 return `+ R$ ${((total) / 100).toFixed(2)}`;
                              }
                              else if (selectedTx.type === 'suprimento') {
                                 return `+ R$ ${typeof selectedTx.amount === 'number' ? (selectedTx.amount / 100).toFixed(2) : '0.00'}`;
                              }
                              else if (selectedTx.type === 'sangria' || selectedTx.type === 'pagamento') {
                                 return `- R$ ${typeof selectedTx.amount === 'number' ? selectedTx.amount.toFixed(2) : '0.00'}`;
                              }
                              return `+ R$ ${typeof selectedTx.amount === 'number' ? selectedTx.amount.toFixed(2) : '0.00'}`;
                           })()}
                        </h3>
                     </div>
                  </div>

                  {/* Seção completa de venda */}
                  {selectedTx.items && selectedTx.items.length > 0 && selectedTx.payments.length > 0 ? (
                     <div className="space-y-6">
                        <div className="p-6 bg-dark-950/80 rounded-2xl border-2 border-dashed border-white/5 space-y-4">
                           <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500 border-b border-white/5 pb-2">Produtos Vendidos</h4>
                           {selectedTx.items && Array.isArray(selectedTx.items) && selectedTx.items.length > 0 ? (
                              <div className="space-y-1">
                                 {selectedTx.items.map((item: any, idx: number) => (
                                    <div key={idx} className="flex justify-between items-center text-sm font-mono">
                                       <span className="text-slate-400"><span className="text-accent">{item.quantity}x</span> {item.product_name_snapshot}</span>
                                       <span className="text-slate-200">R$ {typeof item.line_total === 'number' ? (item.line_total / 100).toFixed(2) : '0.00'}</span>
                                    </div>
                                 ))}
                              </div>
                           ) : (
                              <p className="text-[10px] text-slate-600 uppercase italic">Nenhum produto vinculado a esta venda.</p>
                           )}
                           <div className="pt-4 border-t border-white/5 flex flex-col gap-2 font-bold">

                              <div className="flex justify-between text-xs">
                                 <span>Descontos Aplicados:</span>
                                 <span className="text-red-400">- R$ {typeof selectedTx.discount_total === 'number' ? (selectedTx.discount_total / 100).toFixed(2) : '0.00'}</span>
                              </div>
                              <div className="flex flex-col gap-1 mt-2">
                                 <span className="text-xs font-bold text-slate-400">Método de Pagamento:</span>
                                 {selectedTx.payments && Array.isArray(selectedTx.payments) && selectedTx.payments.length > 0 ? (
                                    selectedTx.payments.map((pay: any, idx: number) => (
                                       <span key={idx} className="text-xs text-slate-300">{pay.method}: R$ {typeof pay.amount === 'number' ? (pay.amount / 100).toFixed(2) : '0.00'}</span>
                                    ))
                                 ) : (
                                    <span className="text-xs text-slate-300">Não informado</span>
                                 )}
                              </div>
                              <div className="flex flex-col gap-1 mt-2">
                                 <span className="text-xs font-bold text-slate-400">Operador Responsável:</span>
                                 <span className="text-xs text-slate-300">
                                    {selectedTx.metadata?.operator
                                       || operatorName
                                       || session?.operator
                                       || 'Não informado'}
                                 </span>
                              </div>
                           </div>
                        </div>
                     </div>
                  ) : (
                     /* Seção para Outras Movimentações (Sangria, Suprimento, Pagamento) */
                     <div className="space-y-6">
                        <div className="p-6 bg-dark-950/50 rounded-2xl border border-white/5 space-y-3">
                           <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Justificativa Operacional</p>
                           <p className="text-xs text-slate-300 leading-relaxed italic">"{selectedTx.description}"</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                           <div className="p-4 bg-white/2 rounded-xl border border-white/5">
                              <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Autorizado por</p>
                              <p className="text-xs font-bold text-slate-300 flex items-center gap-2">
                                 <Shield size={12} className="text-accent" /> {selectedTx.metadata?.operator || 'Admin'}
                              </p>
                           </div>
                           <div className="p-4 bg-white/2 rounded-xl border border-white/5">
                              <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Alocação / Categoria</p>
                              <p className="text-xs font-bold text-slate-300 flex items-center gap-2 uppercase tracking-tighter">
                                 <Tag size={12} className="text-accent" /> {selectedTx.category || 'Operacional'}
                              </p>
                           </div>
                        </div>
                     </div>
                  )}

                           {/* Rodapé do Modal */}
                           <div className="flex gap-4 pt-4 border-t border-white/5">
                               <Button
                                    variant="secondary"
                                    className="flex-1 py-4 text-xs font-bold uppercase tracking-widest"
                                    onClick={() => closeTxDetail('close-button')}
                               >Fechar Auditoria</Button>
                               {selectedTx && selectedTx.items && selectedTx.items.length > 0 && selectedTx.payments && selectedTx.payments.length > 0 && (
                                  <Button
                                     variant="primary"
                                     className="flex-1 py-4 text-xs font-bold uppercase tracking-widest"
                                     icon={<Printer size={18} />}
                                     onClick={async () => {
                                        const company = {
                                           name: import.meta.env.VITE_APP_NAME ,
                                           cnpj: import.meta.env.VITE_APP_CNPJ || '',
                                           address: import.meta.env.VITE_APP_ADDRESS || '',
                                           phone: import.meta.env.VITE_APP_PHONE || ''
                                        };
                                        const sale = {
                                           ...selectedTx,
                                           createdAt: selectedTx.created_at || selectedTx.createdAt || Date.now(),
                                           clientName: selectedTx.client_name || selectedTx.clientName || '',
                                           clientCpf: selectedTx.client_cpf || selectedTx.clientCpf || '',
                                           items: (selectedTx.items || []).map((item: any) => ({
                                              productName: item.product_name_snapshot || item.productName || item.name,
                                              quantity: item.quantity,
                                              unitPrice: item.unit_price_at_sale || item.unitPrice || item.unit_price || 0,
                                           })),
                                           discountCents: selectedTx.discount_total || selectedTx.discountCents || 0,
                                           adjustmentCents: selectedTx.adjustmentCents || 0,
                                           total: selectedTx.total,
                                           payments: (selectedTx.payments || []).map((p: any) => ({
                                              method: p.method,
                                              amount: p.amount,
                                           })),
                                           id: selectedTx.id,
                                        };
                                        await generateReceiptPDF({ company, sale });
                                     }}
                                     title="Imprimir Recibo [I]"
                                  >Imprimir Recibo</Button>
                               )}
                           </div>
               </div>
            )}
         </Modal>

         {/* Modal Virtual Receipt */}
         <Modal isOpen={isReceiptPreviewOpen} onClose={() => { setIsReceiptPreviewOpen(false); sendTelemetry('receipt-preview', 'close', { reason: 'overlay' }); }} title="Visualização de Comprovante">
            <div className="flex flex-col items-center gap-6">
               <div className="bg-white text-black p-8 rounded shadow-2xl w-full max-w-[80mm] font-mono receipt-assemble" id="thermal-receipt">
                  {selectedTx && (
                     <>
                        {console.log('selectedTx:', selectedTx)}
                        <div className="text-center mb-4">
                           <h2 className="text-lg font-bold tracking-tighter">{import.meta.env.VITE_APP_NAME || 'MV Chaveiro'}</h2>
                           <p className="text-[10px]">OBRIGADO PELA PREFERÊNCIA</p>
                           <div className="border-b border-black border-dashed my-2"></div>
                           <p className="text-[10px] font-bold uppercase">{selectedTx.type === 'sale' ? 'CUPOM FISCAL VIRTUAL' : 'VALE DE CAIXA'}</p>
                           <p className="text-[9px]">{new Date(selectedTx.timestamp).toLocaleString()}</p>
                        </div>
                        {selectedTx.items && Array.isArray(selectedTx.items) && selectedTx.items.length > 0 && (
                           <div className="text-[9px] space-y-1 mb-4">
                              {selectedTx.items.map((item: any, idx: number) => (
                                 <div key={idx} className="flex justify-between">
                                    <span>{item.quantity}x {item.product_name_snapshot}</span>
                                    <span>{typeof item.line_total === 'number' ? (item.line_total / 100).toFixed(2) : '0.00'}</span>
                                 </div>
                              ))}
                           </div>
                        )}
                        <div className="text-[9px] border-t border-black border-dashed pt-2 space-y-1 font-bold">
                           <div className="flex justify-between text-xs">
                              <span>TOTAL:</span>
                              <span>
                                 R$ {
                                    selectedTx.type === 'suprimento'
                                       ? ((selectedTx.amount || 0) / 100).toFixed(2)
                                       : selectedTx.items && Array.isArray(selectedTx.items)
                                          ? (selectedTx.items.reduce((sum: number, item: any) => sum + (item.line_total || 0), 0) / 100).toFixed(2)
                                          : '0.00'
                                 }
                              </span>
                           </div>
                        </div>
                     </>
                  )}
               </div>
               <div className="w-full flex gap-4 no-print">
                  <Button variant="secondary" className="flex-1 py-4" icon={<X size={18} />} onClick={() => { setIsReceiptPreviewOpen(false); sendTelemetry('receipt-preview', 'close', { reason: 'button' }); }}>Fechar</Button>
                  <Button className="flex-1 py-4 shadow-accent-glow" icon={<Printer size={18} />} onClick={() => handlePrintWithTelemetry('receipt-preview')}>Imprimir Agora</Button>
               </div>
            </div>
         </Modal>

         {/* Modal de Suprimento componentizado */}
         <SuprimentoModal
            isOpen={isSuprimentoModalOpen}
            onClose={(reason) => closeSuprimentoModal(reason || 'close')}
            txCategories={txCategories}
            onCategoryModalOpen={openTxCategoryModal}
            operatorId={user?.id || ''}
            cashSessionId={session?.id || ''}
            telemetry={sendTelemetry}
         />

         <SangriaModal
            isOpen={isSangriaModalOpen}
            onClose={(reason) => closeSangriaModal(reason || 'close')}
            txCategories={txCategories}
            onCategoryModalOpen={openTxCategoryModal}
            operatorId={user?.id || ''}
            cashSessionId={session?.id || ''}
            availableCashCents={cashBalanceCents}
            telemetry={sendTelemetry}
         />

         <PagamentoModal
            isOpen={isPagamentoModalOpen}
            onClose={(reason) => closePagamentoModal(reason || 'close')}
            txCategories={txCategories}
            onCategoryModalOpen={openTxCategoryModal}
            operatorId={user?.id || ''}
            cashSessionId={session?.id || ''}
            paymentLimitCents={paymentLimitCents}
            telemetry={sendTelemetry}
         />

         {/* MODAL CRIAR CATEGORIA DE TRANSAÇÃO */}
         <Modal
            isOpen={isTxCategoryModalOpen}
            onClose={() => closeTxCategoryModal('overlay')}
            title="Nova Classificação Financeira"
            size="md"
         >
            <div className="space-y-8 animate-in zoom-in-95 duration-200">
               <div className="p-6 bg-accent/5 rounded-2xl border border-accent/20 flex items-center gap-4">
                  <div className="p-3 bg-accent/10 rounded-xl text-accent">
                     <Tag size={24} />
                  </div>
                  <div>
                     <h4 className="text-xs font-bold text-white uppercase tracking-widest">Centro de Custo</h4>
                     <p className="text-[10px] text-slate-500">Adicione uma nova alocação para auditoria de caixa.</p>
                  </div>
               </div>

               <div className="space-y-4">
                  <Input
                     label="Nome da Categoria"
                     placeholder="Ex: Manutenção de Equipamentos"
                     value={newTxCategoryName}
                     onChange={e => setNewTxCategoryName(e.target.value)}
                     icon={<FolderPlus size={18} className="text-accent" />}
                     className="bg-dark-950/50 border-accent/10 text-lg font-bold text-slate-100"
                     autoFocus
                     onKeyDown={(e) => e.key === 'Enter' && handleCreateTxCategory()}
                  />
               </div>

               <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                  <Button variant="secondary" className="py-4 uppercase text-[10px] font-bold tracking-widest" onClick={() => closeTxCategoryModal('cancel')}>Cancelar</Button>
                  <Button className="py-4 uppercase text-[10px] font-bold tracking-widest shadow-accent-glow" icon={<Check size={18} />} onClick={handleCreateTxCategory} disabled={!newTxCategoryName.trim()}>Salvar Alocação</Button>
               </div>
            </div>
         </Modal>

         <Modal isOpen={isClosureModalOpen} onClose={() => setIsClosureModalOpen(false)} title="Protocolo de Fechamento">
            <div className="space-y-8 animate-in zoom-in-95 duration-200">
               <div className="p-5 bg-dark-950/80 rounded-2xl border border-white/5 space-y-4 shadow-inner">
                  <div className="flex justify-between items-center"><span className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">Saldo Sistema</span><span className="font-mono text-accent font-bold text-lg">R$ 1.250,45</span></div>
               </div>
               <Input label="Conferência Física" placeholder="0.00" className="text-center text-xl bg-dark-950/50 font-mono text-white" />
               <div className="grid grid-cols-2 gap-4">
                  <Button variant="secondary" className="flex-1 py-4 uppercase text-[10px] font-bold tracking-widest" onClick={() => setIsClosureModalOpen(false)}>Voltar</Button>
                  <Button className="flex-1 py-4 uppercase text-[10px] font-bold tracking-widest shadow-red-500/20" variant="danger" icon={<Zap size={18} />}>Confirmar Fechamento</Button>
               </div>
            </div>
         </Modal>

         <AdminPasswordModal
            isOpen={!!showAdminPasswordModal}
            onClose={() => setShowAdminPasswordModal("")}
            onSuccess={handleAdminPasswordSuccess}
         />
      </div>
   );
};

export default CashManagement;
