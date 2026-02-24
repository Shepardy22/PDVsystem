
import React from 'react';
import { Modal, Button } from '../UI';
import { Printer, CheckCircle2 } from 'lucide-react';
import { generateReceiptPDF } from '../../utils/pdfUtils';

export interface ReceiptModalProps {
  isOpen: boolean;
  lastSaleData: any;
  onClose: () => void;
  onPrint: () => void;
}

const ReceiptModal: React.FC<ReceiptModalProps> = ({ isOpen, lastSaleData, onClose, onPrint }) => {
  // Dados fictícios da empresa (pode ser ajustado para vir do backend/config)
  const company = {
    name: import.meta.env.VITE_APP_NAME || 'Chaveiro Mega Chave',
    cnpj: import.meta.env.VITE_APP_CNPJ || '00.000.000/0000-00',
    address: import.meta.env.VITE_APP_ADDRESS || 'Endereço Exemplo, 123',
    phone: import.meta.env.VITE_APP_PHONE || '(00) 0000-0000',
  };

// Detecta mobile
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            const printButtonText = isMobile ? 'Compartilhar' : 'Imprimir PDF [I]';

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onClose();
      } else if (e.key.toLowerCase() === 'i') {
        e.preventDefault();
        handlePrintPDF();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handlePrintPDF = React.useCallback(() => {
    if (!lastSaleData) return;
    generateReceiptPDF({ company, sale: lastSaleData });
  }, [lastSaleData, company]);
  if (!isOpen) return null;
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Recibo de Transação">
      <div className="flex flex-col items-center gap-6" >
        {/* Visualização mini do recibo */}
        <div className="bg-white text-black p-8 rounded shadow-2xl w-full max-w-[80mm] font-mono receipt-assemble" id="thermal-receipt">
          <div className="text-center mb-4">
            <h2 className="text-lg font-bold">{company.name}</h2>
            <p className="text-[10px]">OBRIGADO PELA PREFERÊNCIA</p>
            <div className="border-b border-black border-dashed my-2"></div>
            <p className="text-[10px] font-bold">CUPOM FISCAL VIRTUAL</p>
            <p className="text-[9px]">{new Date().toLocaleString()}</p>
          </div>
          {/* Produtos vendidos */}
          <div className="text-[9px] space-y-1 mb-4 border-b border-black border-dashed pb-2">
            <div className="flex justify-between font-bold">
              <span>ITEM</span>
              <span>QTD</span>
              <span>UN</span>
              <span>SUBTOTAL</span>
            </div>
            {lastSaleData?.items?.map((item: any, idx: number) => (
              <div key={idx} className="flex justify-between">
                <span className="truncate max-w-[60px]">{item.productName}</span>
                <span>{item.quantity}</span>
                <span>R$ {(item.unitPrice / 100).toFixed(2)}</span>
                <span>R$ {((item.unitPrice * item.quantity) / 100).toFixed(2)}</span>
              </div>
            ))}
          </div>
          {/* Totais e descontos */}
          <div className="text-[10px] mt-2 mb-1">
            {lastSaleData?.discountCents > 0 && (
              <div className="flex justify-between">
                <span>Desconto:</span>
                <span>- R$ {(lastSaleData.discountCents / 100).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold border-t border-black border-dashed pt-1 mt-1">
              <span>Total:</span>
              <span>R$ {lastSaleData?.total ? (lastSaleData.total / 100).toFixed(2) : '0.00'}</span>
            </div>
          </div>
          {/* Pagamentos */}
          {lastSaleData?.payments && lastSaleData.payments.length > 0 && (
            <div className="text-[9px] mt-2 mb-1">
              <div className="font-bold mb-1">Pagamentos:</div>
              {lastSaleData.payments.map((p: any, idx: number) => (
                <div key={idx} className="flex justify-between">
                  <span>{p.method}</span>
                  <span>R$ {(p.amount / 100).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
          {/* Cliente */}
          {lastSaleData?.clientName && (
            <div className="mt-2 text-[9px] text-right text-black/80 opacity-80">
              <span>Cliente: {lastSaleData.clientName}</span><br />
              {lastSaleData?.clientCpf && <span>CPF: {lastSaleData.clientCpf}</span>}
            </div>
          )}
        </div>
        <div className="w-full flex flex-col sm:flex-row gap-3 sm:gap-4 no-print">
            
            <Button variant="secondary" className="flex-1 py-4" icon={<Printer size={18} />} onClick={handlePrintPDF}>{printButtonText}</Button>
          <Button autoFocus className="flex-1 py-4 shadow-accent-glow" icon={<CheckCircle2 size={18} />} onClick={onClose}>Finalizar [ENTER]</Button>
        </div>
      </div>
    </Modal>
  );
};

export default ReceiptModal;
