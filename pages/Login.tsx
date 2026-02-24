import React, { useState } from 'react';
import { useAuth } from '../components/AuthContext';
import { Button, Input } from '../components/UI';
import { LogIn, Key, Unlock } from 'lucide-react';

interface LoginProps {
  onOpenCash: (initialBalance: number) => void;
}

const Login: React.FC<LoginProps> = ({ onOpenCash }) => {
  const [step, setStep] = useState<'login' | 'cashier'>('login');
  const [initialBalance, setInitialBalance] = useState('0.00');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const result = await login(email, password);
    if (result.ok) {
      setStep('cashier');
    } else {
      setError(result.message || 'Usuário ou senha inválidos');
    }
  };

  const handleOpenCash = (e: React.FormEvent) => {
    e.preventDefault();
    onOpenCash(parseFloat(initialBalance) || 0);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-950 relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-neon/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-md p-8 relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-dark-900 border border-slate-800 shadow-neon mb-4 overflow-hidden">
            <img
              src="/uploads/logo.png"
              alt="Logo"
              className="object-contain w-full h-full"
              style={{ maxWidth: '100%', maxHeight: '100%' }}
            />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">{import.meta.env.VITE_APP_NAME || 'Chaveiro Mega Chave'} </h1>
          <p className="text-slate-400 mt-2">Login de Acesso</p>
        </div>

        <div className="bg-dark-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl">
          {step === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-6" autoComplete="off">
              <Input 
                label="Usuário" 
                placeholder="root" 
                icon={<LogIn size={18} />} 
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
              <Input 
                label="Senha" 
                type="password" 
                placeholder="root" 
                icon={<Key size={18} />} 
                value={password}
                name="new-password"
                autoComplete="new-password"
                onChange={e => setPassword(e.target.value)}
              />
              {error && <div className="text-red-500 text-sm text-center">{error}</div>}
              <Button type="submit" className="w-full py-3" icon={<Unlock size={18} />}>
                Entrar no Sistema
              </Button>
            </form>
          ) : (
            // Fixed typo: handleOpenCash_ -> handleOpenCash
            <form onSubmit={handleOpenCash} className="space-y-6">
              <h2 className="text-xl font-semibold text-center mb-4">Abertura de Caixa</h2>
              <Input 
                label="Saldo Inicial (R$)" 
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                placeholder="0.00" 
                className="text-center text-2xl font-mono"
              />
              <div className="grid grid-cols-2 gap-3 mt-4">
                 {['50.00', '100.00', '150.00', '200.00'].map(val => (
                   <button 
                    key={val}
                    type="button"
                    onClick={() => setInitialBalance(val)}
                    className="p-2 border border-slate-800 rounded-lg text-sm hover:border-neon transition-colors"
                   >
                     R$ {val}
                   </button>
                 ))}
              </div>
              <Button onClick={handleOpenCash} type="button" className="w-full py-3">
                Abrir Caixa Agora
              </Button>
            </form>
          )}
        </div>

        <div className="mt-8 flex justify-center gap-4 text-xs text-slate-500">
           <span>Versão demonstração</span>
           
        </div>
      </div>
    </div>
  );
};

export default Login;
