import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { useAuth } from './components/AuthContext';
import { ShoppingCart, Package, Users, Wallet, BarChart3, LogOut, Settings as SettingsIcon, Bell, Menu, X, Command } from 'lucide-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AppView } from './types';
import FuturisticSpinner from './components/FuturisticSpinner';
import Login from './pages/Login';

// Lazy loading das páginas principais para otimizar bundle
const POS = lazy(() => import('./pages/POS'));
const Products = lazy(() => import('./pages/Products'));
const CashManagement = lazy(() => import('./pages/CashManagement'));
const Reports = lazy(() => import('./pages/Reports'));
const Entities = lazy(() => import('./pages/Entities'));
const Settings = lazy(() => import('./pages/Settings'));

// Declaração global para suportar import.meta.env no Vite/TypeScript
declare global {
  interface ImportMetaEnv {
    readonly VITE_APP_NAME: string;
    // outras variáveis VITE_*
  }
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('login');
  // Responsivo: sidebar aberta em desktop, fechada em mobile
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth >= 1024);
  const [cashOpen, setCashOpen] = useState(false);
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const dragActiveRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartYRef = useRef(0);
  const dragStartTimeRef = useRef(0);
  const dragPointerIdRef = useRef<number | null>(null);
  // Ref para aside da sidebar
  const sidebarRef = useRef<HTMLDivElement>(null);

  const sidebarWidth = 256; // match lg sidebar width (w-64)
  const canUseGestures = useMemo(() => isMobile, [isMobile]);

  // Restaurar sessão do usuário e caixa aberto ao recarregar
  useEffect(() => {
    setLoading(true);
    // Responsivo: fecha sidebar em mobile ao redimensionar
    const handleResize = () => {
      const mobile = window.innerWidth < 1024 || window.matchMedia('(pointer: coarse)').matches;
      setIsMobile(mobile);
      if (mobile) setIsSidebarOpen(false);
      else setIsSidebarOpen(true);
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    setTimeout(() => {
      if (user && user.id) {
        setView('pos');
        setCashOpen(true);
      } else {
        setView('login');
        setCashOpen(false);
      }
      setLoading(false);
    }, 600);
    return () => window.removeEventListener('resize', handleResize);
  }, [user]);

  const handleOpenCash = (balance: number) => {
    setCashOpen(true);
    setView('pos');
  };


  const handleLogout = () => {
    //limpar chave auth_user
    localStorage.removeItem('auth_user');
    setView('login');
    
    setCashOpen(false);
  };

  // Gestos de swipe lateral (mobile)
  const resetDrag = () => {
    dragActiveRef.current = false;
    dragPointerIdRef.current = null;
    setDragOffset(0);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!canUseGestures) return;
    if (e.pointerType !== 'touch') return;
    const isOpen = isSidebarOpen;
    const startFromEdge = e.clientX <= 16; // hotzone esquerda
    const startFromSidebar = isOpen && e.clientX <= sidebarWidth + 40; // deslizar para fechar
    if (!startFromEdge && !startFromSidebar) return;
    dragActiveRef.current = true;
    dragPointerIdRef.current = e.pointerId;
    dragStartXRef.current = e.clientX;
    dragStartYRef.current = e.clientY;
    dragStartTimeRef.current = performance.now();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!canUseGestures) return;
    if (!dragActiveRef.current) return;
    if (dragPointerIdRef.current !== e.pointerId) return;
    const dx = e.clientX - dragStartXRef.current;
    const dy = e.clientY - dragStartYRef.current;
    if (Math.abs(dx) < 6 || Math.abs(dx) <= Math.abs(dy)) return;
    e.preventDefault();
    const isOpen = isSidebarOpen;
    let offset = dx;
    if (isOpen) {
      // arrastar para fechar (dx negativo)
      offset = Math.min(0, dx);
    } else {
      // arrastar para abrir (dx positivo)
      offset = Math.max(0, dx);
    }
    const clamped = Math.max(-sidebarWidth, Math.min(sidebarWidth, offset));
    setDragOffset(clamped);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!canUseGestures) return;
    if (!dragActiveRef.current) return;
    if (dragPointerIdRef.current !== null && dragPointerIdRef.current !== e.pointerId) return;
    const dx = e.clientX - dragStartXRef.current;
    const duration = performance.now() - dragStartTimeRef.current;
    const velocity = Math.abs(dx) / Math.max(duration, 1);
    const isOpen = isSidebarOpen;
    const threshold = 45;
    const shouldOpen = (!isOpen && (dx > threshold || velocity > 0.35)) || (isOpen && dx > threshold * 1.2);
    const shouldClose = (isOpen && (dx < -threshold || velocity > 0.35)) || (!isOpen && dx < -threshold * 1.2);

    if (shouldOpen) {
      setIsSidebarOpen(true);
    } else if (shouldClose) {
      setIsSidebarOpen(false);
    }
    resetDrag();
  };

  const handlePointerCancel = () => {
    if (!canUseGestures) return;
    if (!dragActiveRef.current) return;
    resetDrag();
  };

  useEffect(() => {
    resetDrag();
  }, [isSidebarOpen]);

  // Delay para exibir/ocultar o nome da empresa ao expandir/recolher a sidebar
  const [showCompanyName, setShowCompanyName] = useState(false);
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (isSidebarOpen) {
      timeout = setTimeout(() => setShowCompanyName(true), 200);
    } else {
      timeout = setTimeout(() => setShowCompanyName(false), 200);
    }
    return () => clearTimeout(timeout);
  }, [isSidebarOpen]);

  // Removido: expansão/recolhimento automático da sidebar ao passar mouse

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-950">
        <div className="flex flex-col items-center gap-6">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-accent" />
          <span className="text-slate-400 text-lg font-bold tracking-tight">Carregando sistema...</span>
        </div>
      </div>
    );
  }

  if (view === 'login') {
    return <Login onOpenCash={handleOpenCash} />;
  }

  const NavItem = ({ target, icon: Icon, label }: { target: AppView, icon: any, label: string }) => {
    const isActive = view === target;
    return (
      <button
        onClick={() => {
          setView(target);
          if (isMobile) setIsSidebarOpen(false);
        }}
        className={`w-full flex items-center ${isSidebarOpen ? 'gap-4 px-5 justify-start' : 'gap-0 px-0 justify-center'} py-4 rounded-xl transition-all duration-300 group relative ${
          isActive 
            ? 'bg-accent/10 text-accent shadow-accent-glow' 
            : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
        }`}
      >
        <Icon size={22} className={`${isActive ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'} transition-opacity`} />
        <span className={`text-[11px] font-bold uppercase tracking-[0.15em] transition-all duration-200 ${!isSidebarOpen ? 'sr-only' : ''}`}>{label}</span>
        {isActive && isSidebarOpen && (
          <div className="absolute left-0 w-1 h-6 bg-accent rounded-r-full" />
        )}
      </button>
    );
  };

  const sidebarStyle: React.CSSProperties = {
    transform: isSidebarOpen
      ? dragOffset < 0
        ? `translateX(${dragOffset}px) scale(1)`
        : 'translateX(0) scale(1)'
      : dragOffset > 0
        ? `translateX(calc(-100% + ${Math.min(dragOffset, sidebarWidth)}px)) scale(0.94)`
        : 'translateX(-100%) scale(0.94)',
    transition: dragActiveRef.current ? 'none' : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
    transformOrigin: 'left center',
    minWidth: 0
  };

  const overlayOpacity = isSidebarOpen
    ? dragActiveRef.current && dragOffset < 0
      ? Math.max(0, 1 + dragOffset / sidebarWidth)
      : 1
    : dragActiveRef.current && dragOffset > 0
      ? Math.min(1, dragOffset / sidebarWidth)
      : 0;

  return (
    <div
      className="flex w-screen h-screen bg-dark-950 text-slate-100 overflow-x-hidden font-sans selection:bg-accent/30"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {/* Hotzone esquerda para iniciar gesto em mobile */}
      {canUseGestures && !isSidebarOpen && (
        <div className="fixed inset-y-0 left-0 w-4 z-50" aria-hidden />
      )}
      {/* Overlay para mobile */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${overlayOpacity > 0 ? 'pointer-events-auto' : 'pointer-events-none'} lg:hidden`}
        style={{ opacity: overlayOpacity }}
        onClick={() => setIsSidebarOpen(false)}
        aria-hidden="true"
      />
      {/* Floating Glass Sidebar */}
      <aside
        ref={sidebarRef}
        className={
          `h-screen flex flex-col bg-dark-900/40 backdrop-blur-xl border-r border-white/5 transition-all duration-500 ease-in-out z-50 ` +
          // Mobile: fixed, animado
          `fixed top-0 left-0 ` +
          (isSidebarOpen ? 'w-64 translate-x-0 ' : 'w-16 -translate-x-0 ') +
          // Desktop: static, só alterna largura
          'lg:static lg:top-auto lg:left-auto lg:translate-x-0 ' +
          (isSidebarOpen ? 'lg:w-64 ' : 'lg:w-16 ')
        }
        aria-label="Navegação lateral"
        style={!isMobile ? undefined : sidebarStyle}
      >
        {/* Botão para recolher/expandir sidebar manualmente */}
        <button
          onClick={() => setIsSidebarOpen(v => !v)}
          className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:text-accent transition-all z-50"
          aria-label={isSidebarOpen ? 'Recolher menu' : 'Expandir menu'}
        >
          {isSidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>

        {/* Botão para recolher/expandir sidebar (removido, logo permanece) */}
        <div className={`p-8 flex flex-col items-center ${isSidebarOpen ? 'gap-4' : 'gap-2'} ${isSidebarOpen ? 'items-center' : 'items-center justify-center'}`}>
          
          <div className="w-10 h-10 rounded-xl  flex items-center justify-center overflow-hidden">
            <img
              src="/uploads/logo.png"
              alt="Logo"
              className="object-cover w-full h-full"
              draggable={false}
            />
          </div>



          {isSidebarOpen && (
            <div
              className={`flex flex-col items-center justify-center transition-all duration-200 ${
                !showCompanyName ? 'opacity-0 w-0 overflow-hidden' : ''
              }`}
            >
              <span className="text-lg font-bold tracking-tight text-white leading-tight">
                {(import.meta.env.VITE_APP_NAME || 'Chaveiro Mega Chave').split(' ')[0]}
              </span>
              <span className="text-xl font-bold tracking-tight text-accent opacity-80 leading-tight">
                {(import.meta.env.VITE_APP_NAME || 'Chaveiro Mega Chave').split(' ').slice(1).join(' ')}
              </span>
            </div>
          )}


        </div>

      
        <nav className={`flex-1 ${isSidebarOpen ? 'px-4' : 'px-1'} space-y-2 py-6 overflow-y-auto`}>
          <NavItem target="pos" icon={ShoppingCart} label="Terminal" />
          <NavItem target="products" icon={Package} label="Inventário" />
          <NavItem target="entities" icon={Users} label="Entidades" />
          <NavItem target="cash" icon={Wallet} label="Financeiro" />
          <NavItem target="reports" icon={BarChart3} label="Analíticos" />
        </nav>

        <div className="p-6 border-t border-white/5 space-y-3 bg-white/2">
          <button
            onClick={() => {
              if (user.role === 'operador') {
                // Aqui você deve abrir o modal de solicitação de senha admin
                // Exemplo: setShowAdminPasswordModal(true)
              } else {
                setView('settings');
              }
            }}
            className={`w-full flex items-center ${isSidebarOpen ? 'gap-4 px-5 justify-start' : 'gap-0 px-0 justify-center'} py-3 rounded-xl transition-all duration-300 ${
              view === 'settings'
                ? 'bg-accent/10 text-accent border border-accent/20'
                : 'text-slate-500 hover:text-slate-200'
            }`}
          >
            <SettingsIcon size={22} />
            <span className={`text-[10px] font-bold uppercase tracking-widest transition-all duration-200 ${!isSidebarOpen ? 'sr-only' : ''}`}>Painel de Controle</span>
          </button>
          <button
            onClick={handleLogout}
            className={`w-full flex items-center ${isSidebarOpen ? 'gap-4 px-5 justify-start' : 'gap-0 px-0 justify-center'} py-3 text-red-400/60 hover:text-red-400 hover:bg-red-400/5 rounded-xl transition-all`}
          >
            <LogOut size={22} />
            <span className={`text-[10px] font-bold uppercase tracking-widest transition-all duration-200 ${!isSidebarOpen ? 'sr-only' : ''}`}>Encerrar</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-x-hidden h-full min-h-0">
        {/* Minimalist Top Nav */}
        <header className="h-20 bg-dark-950/20 backdrop-blur-md border-b border-white/5 px-4 sm:px-10 flex items-center justify-between shrink-0 z-20">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2.5 bg-white/2 border border-white/5 hover:border-accent/40 rounded-lg text-slate-500 hover:text-accent transition-all lg:hidden"
              aria-label="Abrir menu"
            >
              <Menu size={18} />
            </button>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/5">
               <div className="w-2 h-2 rounded-full bg-accent animate-pulse shadow-[0_0_8px_#00e0ff]" />
               <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400">Canal Ativo: {view}</span>
            </div>
          </div>

          <div className="flex items-center gap-6">
             
             <div className="flex items-center gap-4 pl-6 border-l border-white/5">
                <div className="text-right ">
                   <p className="text-xs font-bold text-slate-200 tracking-tight">{user.name}</p>
                   <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{user.role}</p>
                </div>
               
             </div>
          </div>
        </header>

        {/* View Layout Container */}
        <div className="flex-1 min-h-0 h-full relative overflow-y-auto overflow-x-hidden bg-dark-950">
          <div className="flex flex-col min-h-full h-full relative z-10">
            <Suspense fallback={
              <div className="flex-1 flex items-center justify-center">
                <FuturisticSpinner />
              </div>
            }>
              {view === 'pos' && (
                <div className="flex-1 flex flex-col min-h-0 h-full">
                  <POS 
                    cashOpen={cashOpen}
                    onOpenCash={handleOpenCash}
                  />
                </div>
              )}
              {view === 'products' && (
                <div className="flex-1 flex flex-col min-h-0 h-full">
                  <Products />
                </div>
              )}
              {view === 'entities' && (
                <div className="flex-1 flex flex-col min-h-0 h-full">
                  <Entities />
                </div>
              )}
              {view === 'cash' && (
                <div className="flex-1 flex flex-col min-h-0 h-full">
                  <CashManagement />
                </div>
              )}
              {view === 'reports' && (
                <div className="flex-1 flex flex-col min-h-0 h-full">
                  <Reports />
                </div>
              )}
              {view === 'settings' && (
                <div className="flex-1 flex flex-col min-h-0 h-full">
                  <Settings />
                </div>
              )}
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
