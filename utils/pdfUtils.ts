import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface CompanyData {
  name: string;
  cnpj?: string;
  address?: string;
  phone?: string;
}

export interface ReceiptPDFOptions {
  company: CompanyData;
  sale: any;
}




export async function generateReceiptPDF({ company, sale }: ReceiptPDFOptions) {
  // Busca dados do .env (Vite)
  const envCompany = {
    name: import.meta.env.VITE_APP_NAME || company.name || 'MV Chaveiro',
    cnpj: import.meta.env.VITE_APP_CNPJ || company.cnpj || '',
    address: import.meta.env.VITE_APP_ADDRESS || company.address || '',
    phone: import.meta.env.VITE_APP_PHONE || company.phone || '',
  };
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 18;

  // Cabeçalho empresa moderno
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(envCompany.name, pageWidth / 2, y, { align: 'center' });
  y += 7;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  if (envCompany.cnpj) { doc.text(`CNPJ: ${envCompany.cnpj}`, pageWidth / 2, y, { align: 'center' }); y += 5; }
  if (envCompany.address) { doc.text(envCompany.address, pageWidth / 2, y, { align: 'center' }); y += 5; }
  if (envCompany.phone) { doc.text(`Fone: ${envCompany.phone}`, pageWidth / 2, y, { align: 'center' }); y += 5; }
  y += 2;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40, 40, 40);
  doc.text('COMPROVANTE DE VENDA / ORDEM DE SERVIÇO', pageWidth / 2, y, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 10;

  // Dados da venda
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Data: ${new Date(sale?.createdAt || Date.now()).toLocaleString()}`, 20, y);
  y += 5;
  if (sale?.clientName) {
    doc.text(`Cliente: ${sale.clientName}`, 20, y);
    if (sale.clientCpf) doc.text(`CPF: ${sale.clientCpf}`, pageWidth - 20, y, { align: 'right' });
    y += 5;
  }
  y += 2;

  // Itens vendidos (tabela moderna, cabeçalho escuro)

  // Ajuste: garantir que a coluna Subtotal fique alinhada à borda direita
  const tableMargin = 20;
  const colWidths = [70, 20, 30, pageWidth - (tableMargin * 2) - 70 - 20 - 30];
  autoTable(doc, {
    startY: y,
    head: [["Item", "Qtd", "Unitário", "Subtotal"]],
    body: sale?.items?.map((item: any) => [
      item.productName,
      String(item.quantity),
      `R$ ${(item.unitPrice / 100).toFixed(2)}`,
      `R$ ${((item.unitPrice * item.quantity) / 100).toFixed(2)}`
    ]) || [],
    styles: { fontSize: 11, cellPadding: 2 },
    headStyles: { fillColor: [30, 30, 30], textColor: [255,255,255], halign: 'center', fontStyle: 'bold' },
    bodyStyles: { textColor: [30,30,30] },
    columnStyles: {
      0: { cellWidth: colWidths[0], halign: 'left' },
      1: { cellWidth: colWidths[1], halign: 'center' },
      2: { cellWidth: colWidths[2], halign: 'right' },
      3: { cellWidth: colWidths[3], halign: 'right' },
    },
    margin: { left: tableMargin, right: tableMargin },
    theme: 'grid',
    tableLineColor: [200,200,200],
    tableLineWidth: 0.2,
  });
  y = (doc as any).lastAutoTable.finalY + 10;


  // Totais, descontos e pagamentos estilizados
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  let labelY = y;
  if (sale?.discountCents > 0) {
    doc.setTextColor(200, 60, 60);
    doc.text('Desconto:', 120, labelY);
    doc.text(`- R$ ${(sale.discountCents / 100).toFixed(2)}`, pageWidth - 20, labelY, { align: 'right' });
    labelY += 7;
    doc.setTextColor(0,0,0);
  }
  if (sale?.adjustmentCents > 0) {
    doc.setTextColor(60, 120, 200);
    doc.text('Ajuste:', 120, labelY);
    doc.text(`R$ ${(sale.adjustmentCents / 100).toFixed(2)}`, pageWidth - 20, labelY, { align: 'right' });
    labelY += 7;
    doc.setTextColor(0,0,0);
  }
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Total:', 120, labelY);
  doc.text(`R$ ${(sale?.total ? sale.total / 100 : 0).toFixed(2)}`, pageWidth - 20, labelY, { align: 'right' });
  labelY += 10;

  // Pagamentos com labels em português
  if (sale?.payments?.length) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Pagamentos:', 20, labelY);
    labelY += 5;
    const paymentLabels: Record<string, string> = {
      cash: 'Dinheiro',
      card: 'Cartão',
      pix: 'Pix',
      credit: 'Crédito',
      debit: 'Débito',
      other: 'Outro',
    };
    sale.payments.forEach((p: any) => {
      const label = paymentLabels[p.method] || p.method;
      doc.setFont('helvetica', 'bold');
      doc.text(`• ${label}:`, 30, labelY);
      doc.setFont('helvetica', 'normal');
      doc.text(`R$ ${(p.amount / 100).toFixed(2)}`, pageWidth - 20, labelY, { align: 'right' });
      labelY += 5;
    });
    labelY += 2;
  }

  // Observações/rodapé
  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(120,120,120);

  doc.setTextColor(80,80,80);
  if (sale?.id) {
    doc.setFontSize(8);
    doc.text(`Venda Nº: ${sale.id}`, pageWidth / 2, 292, { align: 'center' });
  }
  doc.setTextColor(0,0,0);

  // Geração do PDF como Blob
  const pdfBlob = doc.output('blob');
  const fileName = `comprovante_${sale?.id || Date.now()}.pdf`;

  // Detecta se é mobile (user agent simples)
  const isMobile = /android|iphone|ipad|ipod|opera mini|iemobile|mobile/i.test(navigator.userAgent);

  // Web Share API (apenas mobile)
  if (isMobile && navigator.canShare && navigator.canShare({ files: [new File([pdfBlob], fileName, { type: 'application/pdf' })] })) {
    try {
      // @ts-ignore
      await navigator.share({
        files: [new File([pdfBlob], fileName, { type: 'application/pdf' })],
        title: 'Comprovante de Venda',
        text: 'Segue o comprovante da sua venda/serviço.'
      });
      return;
    } catch (e) {
      // Se o usuário cancelar ou der erro, faz o download normalmente
    }
  }

  // Download normal (desktop ou fallback)
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
