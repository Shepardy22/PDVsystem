# 🛒 PDVsystem

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.26-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20.6.0-brightgreen.svg)
![React](https://img.shields.io/badge/react-19.2.3-61dafb.svg)
![TypeScript](https://img.shields.io/badge/typescript-5.8.2-3178c6.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

**Sistema de Vendas e gestão de estoque**

[Documentação Completa](docs/README.md) • [Instalação](#-instalação-rápida) • [Recursos](#-recursos-principais) • [Arquitetura](#-arquitetura)

</div>

---

## 📋 Sobre o Projeto

**PDVsystem**  é uma base aberta para sistemas de ponto de venda e gestão de estoque. Construído com React e Node.js, oferece módulos prontos para vendas, caixa, clientes e relatórios, permitindo que outros desenvolvedores personalizem, implementem e contribuam para sua evolução.

Projetado para atender desde pequenos e médios comércios, focando em velocidade, estabilidade e experiência do usuário.

---

## 📸 Tour Visual do Sistema

Explore as principais funcionalidades do sistema através das imagens abaixo. Clique nas seções para expandir.

<details>
<summary><b>🖥️ Terminal de Vendas (PDV)</b></summary>
<br>

> Interface otimizada para operação via teclado, garantindo vendas rápidas e sem uso do mouse. Registro de múltiplos pagamentos, descontos e impressão direta.

![Tela do PDV - Terminal de Vendas](docs/img/pos-screen.png)
*(Exemplo da interface de vendas)*
</details>

<details>
<summary><b>📦 Gestão de Estoque e Produtos</b></summary>
<br>

> Cadastro detalhado de produtos, controle de estoque mínimo, categorias e fornecedores. Importação e exportação em massa (Excel) para facilitar a migração.

![Gestão de Produtos](docs/img/products-screen.png)
</details>

<details>
<summary><b>💵 Fluxo de Caixa e Financeiro</b></summary>
<br>

> Abertura e fechamento de caixa com conferência cega. Histórico completo de sangrias, suprimentos e quebra de caixa.

![Fluxo de Caixa](docs/img/cash-screen.png)
</details>

<details>
<summary><b>📊 Dashboards e Relatórios (BI)</b></summary>
<br>

> Gráficos interativos de vendas de produtos por volume e frequência e produtos mais vendidos.

![Relatórios de Vendas](docs/img/reports-screen.png)
</details>

<details>
<summary><b>🔒 Configurações e Monitoramento</b></summary>
<br>

> Monitoramento de recursos do servidor (CPU/RAM) em tempo real, logs de auditoria, whitelist de IPs e gerenciamento de permissões de usuários.

![Configurações e Monitoramento](docs/img/settings-screen.png)
</details>

---

## 🚀 Recursos Principais

### 💰 Para o Operador (Frente de Caixa)
- **Venda Rápida**: Agilidade na finalização da venda (Enter contínuo) e auto-focus no campo de busca
- **Flexibilidade**: Pagamentos mistos (ex: R$50 Dinheiro + R$100 Cartão)
- **Offline-First**: Operação contínua mesmo com oscilações de rede (Sync automático)

### 🏢 Para o Gerente (Backoffice)
- **Relatórios**: Curva ABC de produtos, fechamento diário/mensal automatico
- **Fiscal**: Emissão de comprovantes não fiscais e preparação para NFC-e (em desenvolvimento)
- **Segurança**: Níveis de acesso granulares (Admin, Gerente, Caixa)

### 🛠️ Para o Time de TI (Suporte)
- **Update Automático**: Script de update integrado para clientes
- **Telemetria**: Logs remotos para diagnóstico de problemas
- **Acesso Remoto**: Túnel Ngrok integrado para suporte à distância

---

## 🏗️ Arquitetura e Tecnologias

O sistema segue uma arquitetura **Clean Architecture** adaptada, visando manutenibilidade e escalabilidade.

### Stack Tecnológico
- **Frontend**: React 19, TypeScript, Tailwind CSS, Shadcn/UI
- **Backend**: Node.js, Express, Better-SQLite3 (WAL Mode)
- **Infra**: PM2 para gerenciamento de processos, Scripts .bat para automação Windows

---

## 💻 Guia do Desenvolvedor

Esta seção é para desenvolvedores que desejam manter ou expandir o sistema.

### Estrutura de Pastas Essencial
```
PDVsystem/
├── pages/              # Views principais (Rotas do React)
├── components/         # UI Kit e componentes reutilizáveis
├── server/src/         # Código fonte do Backend
│   ├── routes/         # Definição dos endpoints da API
│   ├── services/       # Regras de negócio complexas
│   └── db/             # Migrations e conexão SQLite
├── docs/               # Documentação técnica detalhada
└── scripts/            # Automação (.bat e .sh)
```

### Scripts de Automação (Windows)
O projeto inclui scripts `.bat` na raiz para facilitar o deploy em clientes Windows:

- `iniciar-sistema.bat`: Inicializa o PM2 e o servidor.
- `atualizar-app.bat`: Busca atualizações e aplica patches.
- `iniciar-tunel.bat`: Abre conexão remota via Ngrok para suporte.

### Primeiros Passos (Dev)

1. **Instalar Dependências**:
   ```bash
   npm install
   ```
2. **Setup do Banco**:
   ```bash
   npm run migrate
   ```
3. **Rodar em Dev**:
   ```bash
   npm run dev
   ```

### Scripts de Build Profissionais

O projeto inclui scripts otimizados para análise e build de produção:

#### 📦 Scripts Disponíveis

```bash
# Build com resumo detalhado (recomendado)
npm run build:analyze
```
**Benefícios**: 
- Mostra apenas informações relevantes (chunks, tamanhos, tempo)
- Filtra ruído do output (últimas 15 linhas)
- Ideal para CI/CD e verificação rápida de bundle size

```bash
# Build limpo (remove dist/ antes)
npm run build:clean
```
**Benefícios**:
- Garante build completamente novo
- Remove arquivos órfãos de builds anteriores
- Previne problemas de cache em produção

```bash
# Análise de erros de build
npm run build:errors
```
**Benefícios**:
- Filtra apenas erros com contexto (2 linhas antes/depois)
- Facilita debug sem informações desnecessárias
- Economiza tempo na identificação de problemas

```bash
# Análise de warnings
npm run build:warnings
```
**Benefícios**:
- Identifica potenciais problemas não-críticos
- Útil para code quality e otimizações
- Contexto de 1 linha antes/depois para localização rápida

```bash
# Contagem de chunks JS gerados
npm run build:stats
```
**Benefícios**:
- Monitora crescimento do bundle ao longo do tempo
- Ajuda a identificar quando code splitting é necessário
- Métrica rápida de complexidade do build

> **🎯 Dica de Performance**: O sistema usa **code splitting** com React.lazy() e manual chunks.
> O build inicial é ~230KB (react-vendor) + chunks sob demanda, resultando em **90% de redução** no bundle inicial.

### Comandos Úteis (PowerShell)

Comandos para depuração avançada e análise personalizada:

```powershell
# Buscar padrões específicos no código-fonte
Get-ChildItem -Recurse -Filter *.tsx | Select-String -Pattern "useState"

# Análise de imports não utilizados
npm run build 2>&1 | Select-String -Pattern "not used|unused"

# Buscar múltiplos padrões com contexto
npm run build 2>&1 | Select-String -Pattern "error|warning" -Context 2,2

# Verificar tamanho total de dist/
Get-ChildItem dist -Recurse | Measure-Object -Property Length -Sum | Select-Object @{Name="TotalMB";Expression={[math]::Round($_.Sum / 1MB, 2)}}

# Listar todos os chunks ordenados por tamanho
Get-ChildItem dist/assets/*.js | Sort-Object Length -Descending | Select-Object Name, @{Name="Size(KB)";Expression={[math]::Round($_.Length / 1KB, 2)}}


# Aplicar correção de chaves estrangeiras no SQLite
Get-Content server/migrations/fix_products_foreign_keys_cascade.sql | sqlite3 data/novabev.sqlite
```

> **💡 Dica**: Use os scripts npm (`build:analyze`, `build:errors`, etc.) para análises comuns. Reserve comandos PowerShell customizados para casos específicos.

> [!NOTE]
> **Dados de Demonstração**: O projeto é clonado com um banco de dados **já populado** (produtos, vendas, clientes) para facilitar seus testes.
>
> **Para Produção**:
> 1. Vá em **Configurações > Sistema**.
> 2. No painel "Manutenção", clique em **Resetar Banco de Dados**.
> 3. Use a senha de segurança: `root@remove`.
>
> Isso limpará todas as vendas e produtos, mantendo apenas o usuário admin (login: root, senha: root).

> Para mais detalhes técnicos, consulte a [Pasta de Documentação](docs/).

---

## 🛡️ Segurança

- **IP Whitelist**: O sistema só aceita conexões de IPs previamente autorizados.
- **IP Whitelist**: O sistema só aceita conexões de IPs previamente autorizados.
- **Validação de Dados**: Verificação rigorosa de inputs no backend.

---

## 📥 Instalação Produção

Consulte o guia detalhado em [docs/09-instalacao-e-execucao.md](docs/09-instalacao-e-execucao.md).

```bash
# Exemplo rápido com PM2
npm run build
pm2 start server/dist/index.js --name PDVsystem
```

---

<div align="center">

**⭐ Se este projeto foi útil, considere dar uma estrela!**

</div>
