import React from 'react';
import { Button, Modal } from '../UI';

type ImportFieldDefinition = {
  key: string;
  label: string;
  required: boolean;
};

interface ColumnMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  headers: string[];
  fields: ImportFieldDefinition[];
  mapping: Record<string, string>;
  onMappingChange: (field: string, column: string) => void;
}

const ColumnMappingModal: React.FC<ColumnMappingModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  headers,
  fields,
  mapping,
  onMappingChange,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Mapeamento de Colunas"
      size="3xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={onConfirm}>Continuar</Button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-slate-300">
          Selecione qual coluna do arquivo corresponde a cada campo do produto.
        </p>
        <p className="text-xs text-slate-500">
          Campos com * sao obrigatorios para validar e salvar os produtos.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields.map((field) => (
            <div key={field.key} className="space-y-2">
              <label className="block text-[11px] uppercase tracking-widest font-semibold text-slate-400">
                {field.label} {field.required ? '*' : ''}
              </label>
              <select
                value={mapping[field.key] || ''}
                onChange={(e) => onMappingChange(field.key, e.target.value)}
                className="w-full bg-dark-900/40 border border-white/5 rounded-lg px-3 py-3 text-slate-100 focus:outline-none focus:border-accent/40 focus:ring-4 focus:ring-accent/5 transition-all"
              >
                <option value="">Nao mapear</option>
                {headers.map((header) => (
                  <option key={`${field.key}-${header}`} value={header}>
                    {header}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
};

export default ColumnMappingModal;
