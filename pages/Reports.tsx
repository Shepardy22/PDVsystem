// Função utilitária para agrupar todos os produtos vendidos e somar as quantidades
function getAllSoldProducts(sales: any[]): any[] {
  const productMap: Record<string, { product_id: string, product_name: string, quantidade: number }> = {};
  sales.forEach((sale: any) => {
    const items = Array.isArray(sale.items) ? sale.items : (Array.isArray(sale.itens) ? sale.itens : []);
    items.forEach((item: any) => {
      if (!item.product_id) return;
      if (!productMap[item.product_id]) {
        productMap[item.product_id] = {
          product_id: item.product_id,
          product_name: item.product_name || item.product_name_snapshot || item.nome || '-',
          quantidade: 0
        };
      }
      productMap[item.product_id].quantidade += item.quantity || 0;
    });
  });
  return Object.values(productMap);
}


// Componente para exibir todos os produtos do banco de dados em JSON
const AllProductsJsonViewer: React.FC = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/products?limit=1000')
      .then(res => res.json())
      .then(data => setProducts(data.items || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-xs text-slate-400">Carregando produtos do banco...</div>;
  if (error) return <div className="text-xs text-red-400">Erro: {error}</div>;
  return (
    <div className="bg-dark-900/60 rounded-xl p-4 mb-8 overflow-x-auto border border-white/10">
      <div className="text-xs text-slate-400 font-mono mb-2">Todos Produtos (JSON):</div>
      <pre className="text-xs text-white whitespace-pre-wrap break-all max-h-96 overflow-y-auto">{JSON.stringify(products, null, 2)}</pre>
    </div>
  );
};

// Componente para exibir produtos vendidos em JSON
const ProductsSoldJsonViewer: React.FC = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/report/sold-products')
      .then(res => res.json())
      .then(data => {
        setProducts(data.products || []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-xs text-slate-400">Carregando produtos vendidos...</div>;
  if (error) return <div className="text-xs text-red-400">Erro: {error}</div>;
  return (
    <div className="bg-dark-900/60 rounded-xl p-4 mb-8 overflow-x-auto border border-white/10">
      <div className="text-xs text-slate-400 font-mono mb-2">Produtos Vendidos (JSON):</div>
      <pre className="text-xs text-white whitespace-pre-wrap break-all max-h-96 overflow-y-auto">{JSON.stringify(products, null, 2)}</pre>
    </div>
  );
};
// Componente para exibir vendas em JSON
const SalesJsonViewer: React.FC = () => {
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/cash/sessions-movements')
      .then(res => res.json())
      .then(data => setSales(data.sales || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-xs text-slate-400">Carregando vendas...</div>;
  if (error) return <div className="text-xs text-red-400">Erro: {error}</div>;
  return (
    <div className="bg-dark-900/60 rounded-xl p-4 mb-8 overflow-x-auto border border-white/10">
      <div className="text-xs text-slate-400 font-mono mb-2">Vendas (JSON):</div>
      <pre className="text-xs text-white whitespace-pre-wrap break-all max-h-96 overflow-y-auto">{JSON.stringify(sales, null, 2)}</pre>
    </div>
  );
};

import { Button } from '@/components/UI';
import { Calendar, Download, Filter, Layers } from 'lucide-react';
import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../components/AuthContext';


import ProductMixQuadrantsTab from '@/components/reports/ProductMixQuadrantsTab';
import SoldProductsDetailedTable from '@/components/reports/SoldProductsDetailedTable';
import SoldProductsResumoTable from '@/components/reports/SoldProductsResumoTable';
import { logUiEvent } from '../services/telemetry';





const Reports: React.FC = () => {
  const { user } = useAuth();
  const sendTelemetry = React.useCallback((area: string, action: string, meta?: Record<string, any>) => {
    logUiEvent({ userId: user?.id ?? null, page: 'reports', area, action, meta });
  }, [user?.id]);
  const [activeReport, setActiveReport] = useState<any | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [dateRange, setDateRange] = useState('Últimos 30 dias');


  // Estado para alternar entre os componentes
  const [selectedViewer, setSelectedViewer] = useState<'mixQuadrants' | 'soldProductsDetailed' | 'soldProductsResumo'>('mixQuadrants');

  useEffect(() => {
    sendTelemetry('page', 'view');
  }, [sendTelemetry]);

  useEffect(() => {
    sendTelemetry('viewer', 'switch', { viewer: selectedViewer });
  }, [selectedViewer, sendTelemetry]);

  return (
    <div className="p-2 flex flex-col h-full overflow-hidden assemble-view bg-dark-950 bg-cyber-grid relative">

      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 shrink-0 mb-8 relative z-10">
        <div>
         <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
           <Layers className="text-accent" /> Inteligência de Dados
         </h1>
         <p className="text-slate-500 text-sm font-medium uppercase tracking-widest text-[10px]">// {import.meta.env.VITE_APP_NAME || 'MV Chaveiro'} Analytics</p>
        </div>
      <div>
        {/* Indicador discreto de inteligência de dados */}
        <div className="flex items-center gap-2 bg-transparent px-2 py-1">
          <span className="w-2 h-2 rounded-full bg-cyan-400/70" />
          <span className="text-[11px] text-cyan-300 font-mono tracking-tight opacity-70">Analytics ativo</span>
        </div>
      </div>
      </div>




      {/* Menu de seleção responsivo: dropdown no mobile, botões no desktop */}
      {/* Mobile: Dropdown estilizado */}
      <div className="mb-6 relative z-10 animate-in fade-in slide-in-from-top-2 duration-400 shrink-0 w-full block sm:hidden">
        <select
          className="w-full bg-dark-900/40 border border-accent/30 text-accent rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-accent/30 transition-all"
          value={selectedViewer}
          onChange={e => setSelectedViewer(e.target.value as any)}
        >
          <option value="mixQuadrants">Mix (Quadrantes)</option>
          <option value="soldProductsDetailed">Produtos Vendidos Detalhado</option>
          <option value="soldProductsResumo">Resumo Produtos Vendidos</option>
        </select>
      </div>
      {/* Desktop: Botões */}
      <div className="flex items-center gap-2 mb-6 relative z-10 animate-in fade-in slide-in-from-top-2 duration-400 shrink-0 flex-wrap overflow-x-auto scrollbar-thin scrollbar-thumb-cyan-900/40 scrollbar-track-transparent max-w-full hidden sm:flex">
        <button
          onClick={() => setSelectedViewer('mixQuadrants')}
          className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all duration-300 ${
         selectedViewer === 'mixQuadrants'
           ? 'bg-accent/10 border-accent/40 text-accent shadow-accent-glow'
           : 'bg-dark-900/40 border-white/5 text-slate-500 hover:text-slate-300'
          }`}
        >
          <Layers size={14} />
          <span className="text-[9px] font-bold uppercase tracking-widest">Mix (Quadrantes)</span>
        </button>
        <button
          onClick={() => setSelectedViewer('soldProductsDetailed')}
          className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all duration-300 ${
         selectedViewer === 'soldProductsDetailed'
           ? 'bg-accent/10 border-accent/40 text-accent shadow-accent-glow'
           : 'bg-dark-900/40 border-white/5 text-slate-500 hover:text-slate-300'
          }`}
        >
          <Download size={14} />
          <span className="text-[9px] font-bold uppercase tracking-widest">Produtos Vendidos Detalhado</span>
        </button>
        <button
          onClick={() => setSelectedViewer('soldProductsResumo')}
          className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all duration-300 ${
         selectedViewer === 'soldProductsResumo'
           ? 'bg-accent/10 border-accent/40 text-accent shadow-accent-glow'
           : 'bg-dark-900/40 border-white/5 text-slate-500 hover:text-slate-300'
          }`}
        >
          <Filter size={14} />
          <span className="text-[9px] font-bold uppercase tracking-widest">Resumo Produtos Vendidos</span>
        </button>
      </div>

      {/* Renderização condicional do componente selecionado */}
      <div className=" flex-1 overflow-hidden ">
        {selectedViewer === 'mixQuadrants' && <ProductMixQuadrantsTab onTelemetry={sendTelemetry} />}
        {selectedViewer === 'soldProductsDetailed' && <SoldProductsDetailedTable onTelemetry={sendTelemetry} />}
        {selectedViewer === 'soldProductsResumo' && <SoldProductsResumoTable onTelemetry={sendTelemetry} />}
      </div>



    </div>
  );
};

export default Reports;
