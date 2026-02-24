import React, { useMemo, useState } from 'react';
import { User, ChevronDown, ChevronUp, DollarSign, ShoppingBag, Package, TrendingUp, Info, Settings, Percent } from 'lucide-react';
import { getOperatorNameById } from '../services/user';
import { SaleTransaction } from '@/types';
import { useAuth } from '../components/AuthContext';

interface OperatorSalesBreakdownProps {
  sales: SaleTransaction[];
  onTelemetry?: (area: string, action: string, meta?: Record<string, any>) => void;
}

interface ProductSummary {
  productId: string;
  productName: string;
  quantity: number;
  totalRevenue: number;
}

interface OperatorSales {
  operatorId: string;
  operatorName: string;
  totalSales: number;
  salesCount: number;
  products: ProductSummary[];
  commission: number;
}

const COMMISSION_RATE = 0.02; // 2% de comissão padrão
const COMMISSION_STORAGE_KEY = 'operator-commission-config';

const OperatorSalesBreakdown: React.FC<OperatorSalesBreakdownProps> = ({ sales, onTelemetry }) => {
  const { user } = useAuth();
  const [expandedOperator, setExpandedOperator] = useState<string | null>(null);
  const [operatorNames, setOperatorNames] = useState<Record<string, string>>({});
  
  // Configuração de comissão
  const [commissionEnabled, setCommissionEnabled] = useState(false);
  const [commissionRate, setCommissionRate] = useState(2); // Porcentagem padrão
  const [showSettings, setShowSettings] = useState(false);
  
  // Carregar configurações do localStorage
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(COMMISSION_STORAGE_KEY);
      if (stored) {
        const config = JSON.parse(stored);
        setCommissionEnabled(config.enabled ?? false);
        setCommissionRate(config.rate ?? 2);
      }
    } catch (err) {
      console.error('[OperatorSalesBreakdown] Erro ao carregar config de comissão:', err);
    }
  }, []);
  
  // Salvar configurações no localStorage
  const saveCommissionConfig = React.useCallback((enabled: boolean, rate: number) => {
    try {
      const config = { enabled, rate };
      localStorage.setItem(COMMISSION_STORAGE_KEY, JSON.stringify(config));
      console.log('[OperatorSalesBreakdown] Configuração salva:', config);
    } catch (err) {
      console.error('[OperatorSalesBreakdown] Erro ao salvar config de comissão:', err);
    }
  }, []);
  
  // Handlers para mudanças
  const handleToggleCommission = (enabled: boolean) => {
    setCommissionEnabled(enabled);
    saveCommissionConfig(enabled, commissionRate);
    onTelemetry?.('commission-config', 'toggle', { enabled });
  };
  
  const handleCommissionRateChange = (value: string) => {
    const rate = parseFloat(value) || 0;
    if (rate >= 0 && rate <= 100) {
      setCommissionRate(rate);
      saveCommissionConfig(commissionEnabled, rate);
      onTelemetry?.('commission-config', 'rate-change', { rate });
    }
  };

  // Verificar se está mostrando todas as vendas ou apenas do operador
  const isShowingAllSales = useMemo(() => {
    return user?.role === 'admin' || user?.role === 'manager';
  }, [user]);

  // Debug: verificar vendas recebidas
  React.useEffect(() => {
    console.log('[OperatorSalesBreakdown] Vendas recebidas:', sales);
    console.log('[OperatorSalesBreakdown] Quantidade de vendas:', sales?.length || 0);
    console.log('[OperatorSalesBreakdown] Usuário:', user?.name, '| Role:', user?.role);
  }, [sales, user]);

  // Processar dados de vendas por operador
  const operatorSalesData = useMemo(() => {
    const operatorMap = new Map<string, OperatorSales>();

    sales.forEach(sale => {
      const operatorId = sale.operator_id;
      if (!operatorId) return;

      if (!operatorMap.has(operatorId)) {
        operatorMap.set(operatorId, {
          operatorId,
          operatorName: operatorId,
          totalSales: 0,
          salesCount: 0,
          products: [],
          commission: 0,
        });
      }

      const operatorData = operatorMap.get(operatorId)!;
      operatorData.totalSales += sale.total || 0;
      operatorData.salesCount += 1;

      // Processar produtos
      if (Array.isArray(sale.items)) {
        sale.items.forEach(item => {
          const existingProduct = operatorData.products.find(p => p.productId === item.product_id);
          if (existingProduct) {
            existingProduct.quantity += item.quantity || 0;
            existingProduct.totalRevenue += item.line_total || 0;
          } else {
            operatorData.products.push({
              productId: item.product_id,
              productName: item.product_name_snapshot || 'Produto sem nome',
              quantity: item.quantity || 0,
              totalRevenue: item.line_total || 0,
            });
          }
        });
      }
    });

    // Calcular comissão e ordenar produtos
    return Array.from(operatorMap.values()).map(operator => ({
      ...operator,
      commission: operator.totalSales * (commissionRate / 100),
      products: operator.products.sort((a, b) => b.totalRevenue - a.totalRevenue),
    })).sort((a, b) => b.totalSales - a.totalSales);
  }, [sales, commissionRate]);

  // Buscar nomes dos operadores
  React.useEffect(() => {
    const fetchOperatorNames = async () => {
      const names: Record<string, string> = {};
      for (const operator of operatorSalesData) {
        if (!operatorNames[operator.operatorId]) {
          const name = await getOperatorNameById(operator.operatorId);
          names[operator.operatorId] = name || operator.operatorId;
        }
      }
      setOperatorNames(prev => ({ ...prev, ...names }));
    };
    fetchOperatorNames();
  }, [operatorSalesData]);

  const handleToggleOperator = (operatorId: string) => {
    const newExpanded = expandedOperator === operatorId ? null : operatorId;
    setExpandedOperator(newExpanded);
    onTelemetry?.('operator-sales', 'toggle', { operatorId, expanded: !!newExpanded });
  };

  const totalAllSales = useMemo(() => 
    operatorSalesData.reduce((sum, op) => sum + op.totalSales, 0), 
    [operatorSalesData]
  );

  const totalAllCommissions = useMemo(() => 
    operatorSalesData.reduce((sum, op) => sum + op.commission, 0), 
    [operatorSalesData]
  );

  if (!sales || sales.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-12 text-center">
        <div className="p-6 rounded-full bg-dark-900/60 border border-white/5 mb-6">
          <User size={48} className="text-slate-600" />
        </div>
        <h3 className="text-xl font-bold text-slate-400 mb-2">Nenhuma venda registrada</h3>
        <p className="text-sm text-slate-600">
          As vendas realizadas aparecerão aqui para análise de desempenho por operador.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Banner Informativo */}
      {isShowingAllSales && (
        <div className="p-4 bg-accent/5 border border-accent/20 rounded-xl">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-accent/10 text-accent mt-0.5">
              <Info size={16} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-accent mb-1">Visualização de Administrador</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Você está visualizando vendas de <strong className="text-accent">todos os operadores</strong> das sessões abertas atualmente.
                Esta visão permite análise completa de comissões e desempenho da equipe.
              </p>
            </div>
          </div>
        </div>
      )}

      {!isShowingAllSales && (
        <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 mt-0.5">
              <User size={16} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-blue-400 mb-1">Suas Vendas</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Você está visualizando apenas <strong className="text-blue-400">suas próprias vendas</strong> da sessão de caixa atual.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Configuração de Comissão */}
      <div className="p-4 bg-dark-900/40 border border-white/5 rounded-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
              <Settings size={16} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Configuração de Comissões</h4>
              <p className="text-xs text-slate-500">Ajuste a porcentagem e visibilidade</p>
            </div>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="text-xs text-accent hover:text-accent/80 transition-colors font-medium"
          >
            {showSettings ? 'Ocultar' : 'Configurar'}
          </button>
        </div>

        {showSettings && (
          <div className="pt-3 border-t border-white/5 space-y-4 animate-in slide-in-from-top-2 duration-200">
            {/* Switch para habilitar/desabilitar comissão */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Percent size={14} className="text-slate-500" />
                <span className="text-sm text-slate-300">Exibir Comissões</span>
              </div>
              <button
                onClick={() => handleToggleCommission(!commissionEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  commissionEnabled ? 'bg-accent' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    commissionEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Input para porcentagem de comissão */}
            {commissionEnabled && (
              <div className="flex items-center gap-3 animate-in fade-in duration-200">
                <label className="text-sm text-slate-400 shrink-0">
                  Taxa de Comissão:
                </label>
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={commissionRate}
                    onChange={(e) => handleCommissionRateChange(e.target.value)}
                    className="flex-1 px-3 py-2 bg-dark-950/60 border border-white/10 rounded-lg text-white text-sm focus:border-accent focus:outline-none transition-colors"
                  />
                  <span className="text-sm text-slate-400 font-medium">%</span>
                </div>
                <span className="text-xs text-slate-600 ml-2">
                  ({commissionRate}% sobre vendas)
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Header com Resumo Geral */}
      <div className="space-y-4">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-xl bg-accent/10 border border-accent/20">
            <User size={24} className="text-accent" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Vendas por Operador</h2>
            <p className="text-sm text-slate-500">
              {commissionEnabled 
                ? 'Análise de desempenho e cálculo de comissões' 
                : 'Análise de desempenho de vendas'}
            </p>
          </div>
        </div>

        {/* Cards de Resumo */}
        <div className={`grid grid-cols-1 gap-4 ${commissionEnabled ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
          <div className="p-4 bg-dark-900/60 border border-white/5 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <User size={14} className="text-blue-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Operadores</span>
            </div>
            <p className="text-2xl font-bold text-blue-400 font-num">{operatorSalesData.length}</p>
          </div>

          <div className="p-4 bg-dark-900/60 border border-white/5 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <ShoppingBag size={14} className="text-emerald-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Total Vendas</span>
            </div>
            <p className="text-2xl font-bold text-emerald-400 font-num">{sales.length}</p>
          </div>

          <div className="p-4 bg-dark-900/60 border border-white/5 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={14} className="text-accent" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Receita Total</span>
            </div>
            <p className="text-2xl font-bold text-accent font-num">
              R$ {(totalAllSales / 100).toFixed(2)}
            </p>
          </div>

          {commissionEnabled && (
            <div className="p-4 bg-dark-900/60 border border-white/5 rounded-xl animate-in fade-in duration-200">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={14} className="text-purple-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Comissões</span>
              </div>
              <p className="text-2xl font-bold text-purple-400 font-num">
                R$ {(totalAllCommissions / 100).toFixed(2)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Cards de Operadores */}
      <div className="space-y-4">
        {operatorSalesData.map((operator, index) => (
          <div
            key={operator.operatorId}
            className="bg-dark-900/40 border border-white/5 rounded-2xl overflow-hidden transition-all duration-300 hover:border-accent/20"
          >
            {/* Header do Card */}
            <div
              className="p-6 cursor-pointer hover:bg-white/[0.02] transition-colors"
              onClick={() => handleToggleOperator(operator.operatorId)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {/* Ranking Badge */}
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm
                    ${index === 0 ? 'bg-yellow-500/20 text-yellow-400 border-2 border-yellow-500/40' : 
                      index === 1 ? 'bg-slate-400/20 text-slate-300 border-2 border-slate-400/40' :
                      index === 2 ? 'bg-orange-600/20 text-orange-400 border-2 border-orange-600/40' :
                      'bg-dark-950/60 text-slate-500 border border-white/5'}
                  `}>
                    #{index + 1}
                  </div>

                  {/* Info do Operador */}
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      {operatorNames[operator.operatorId] || operator.operatorId}
                      {index === 0 && <span className="text-xs">🏆</span>}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      {operator.salesCount} {operator.salesCount === 1 ? 'venda' : 'vendas'} • {operator.products.length} produtos diferentes
                    </p>
                  </div>
                </div>

                {/* Métricas */}
                <div className="flex items-center gap-8">
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                      Total Vendido
                    </p>
                    <p className="text-2xl font-bold text-accent font-num">
                      R$ {(operator.totalSales / 100).toFixed(2)}
                    </p>
                  </div>

                  {commissionEnabled && (
                    <div className="text-right animate-in fade-in duration-200">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                        Comissão ({commissionRate}%)
                      </p>
                      <p className="text-2xl font-bold text-emerald-400 font-num">
                        R$ {(operator.commission / 100).toFixed(2)}
                      </p>
                    </div>
                  )}

                  {/* Indicador de Expansão */}
                  <div className="ml-4">
                    {expandedOperator === operator.operatorId ? (
                      <ChevronUp size={20} className="text-accent" />
                    ) : (
                      <ChevronDown size={20} className="text-slate-500" />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Detalhes Expandidos */}
            {expandedOperator === operator.operatorId && (
              <div className="border-t border-white/5 animate-in slide-in-from-top-2 duration-300">
                <div className="p-6 bg-dark-950/40">
                  <div className="flex items-center gap-2 mb-4">
                    <Package size={16} className="text-accent" />
                    <h4 className="text-sm font-bold uppercase tracking-widest text-slate-400">
                      Produtos Vendidos
                    </h4>
                  </div>

                  {operator.products.length > 0 ? (
                    <div className="space-y-2">
                      {/* Header da Tabela */}
                      <div className={`grid gap-4 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-600 border-b border-white/5 ${
                        commissionEnabled ? 'grid-cols-12' : 'grid-cols-11'
                      }`}>
                        <div className="col-span-5">Produto</div>
                        <div className="col-span-2 text-center">Quantidade</div>
                        <div className="col-span-2 text-right">Unit. Médio</div>
                        <div className="col-span-2 text-right">Receita</div>
                        {commissionEnabled && <div className="col-span-1 text-right">Comissão</div>}
                      </div>

                      {/* Linhas de Produtos */}
                      {operator.products.map((product) => (
                        <div
                          key={product.productId}
                          className={`grid gap-4 px-4 py-3 bg-dark-900/40 rounded-lg hover:bg-dark-900/60 transition-colors ${
                            commissionEnabled ? 'grid-cols-12' : 'grid-cols-11'
                          }`}
                        >
                          <div className="col-span-5 text-sm text-slate-300 font-medium truncate">
                            {product.productName}
                          </div>
                          <div className="col-span-2 text-center text-sm font-bold text-blue-400 font-num">
                            {product.quantity}x
                          </div>
                          <div className="col-span-2 text-right text-sm text-slate-400 font-num">
                            R$ {(product.totalRevenue / product.quantity / 100).toFixed(2)}
                          </div>
                          <div className="col-span-2 text-right text-sm font-bold text-accent font-num">
                            R$ {(product.totalRevenue / 100).toFixed(2)}
                          </div>
                          {commissionEnabled && (
                            <div className="col-span-1 text-right text-sm font-bold text-emerald-400 font-num animate-in fade-in duration-200">
                              R$ {(product.totalRevenue * (commissionRate / 100) / 100).toFixed(2)}
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Totalizador */}
                      <div className={`grid gap-4 px-4 py-3 mt-2 border-t border-white/5 bg-dark-950/60 rounded-lg ${
                        commissionEnabled ? 'grid-cols-12' : 'grid-cols-11'
                      }`}>
                        <div className="col-span-7 text-sm font-bold uppercase tracking-widest text-slate-400">
                          Total
                        </div>
                        <div className="col-span-2 text-right text-base font-bold text-accent font-num">
                          R$ {(operator.totalSales / 100).toFixed(2)}
                        </div>
                        {commissionEnabled && (
                          <div className="col-span-3 text-right text-base font-bold text-emerald-400 font-num animate-in fade-in duration-200">
                            R$ {(operator.commission / 100).toFixed(2)}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-600 text-sm">
                      Nenhum produto vendido
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Nota sobre Comissões */}
      {commissionEnabled && (
        <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 mt-0.5">
              <TrendingUp size={16} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-blue-400 mb-1">Sistema de Comissões</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                A comissão configurada é de <strong className="text-blue-400">{commissionRate}%</strong> sobre o total de vendas. 
                Você pode ajustar este valor e desabilitar a exibição nas configurações acima.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OperatorSalesBreakdown;
