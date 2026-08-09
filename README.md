# Auto+Assis

Plataforma web para a operação de oficinas automotivas. O sistema reúne estoque, movimentações, solicitações, ordens de serviço, relatórios, consultas operacionais e controle de equipe em uma instalação dedicada por oficina.

Versão atual: **1.3.0**.

## Funcionalidades

### Gerente

- dashboard operacional com indicadores reais;
- cadastro e controle de peças;
- entradas e saídas transacionais de estoque;
- gestão do ciclo de solicitações e ordens de serviço;
- relatórios e consultas rápidas;
- acesso a valores, orçamento e faturamento;
- cadastro, edição, mudança de função e exclusão de membros da equipe;
- consulta da trilha de auditoria com autor, data, IP e valores anteriores/posteriores;
- geração de ordem de serviço e termo de autorização para impressão ou PDF.

### Mecânico

- dashboard e estoque sem valores financeiros;
- registro e consulta de movimentações;
- alteração da quantidade do estoque por entradas e saídas auditadas;
- consulta da fila de serviços;
- consultas rápidas operacionais sem faturamento, preços ou dados pessoais desnecessários;
- avanço apenas das etapas operacionais permitidas;
- geração do contrato/PDF de uma OS já orçada e versionada;
- sem acesso a faturamento agregado, relatórios, edição de orçamento, cadastro de peças ou administração da equipe.

### Cliente

- cadastro e autenticação;
- abertura e acompanhamento de solicitações;
- aprovação ou rejeição de orçamento;
- recuperação de senha por e-mail quando o SMTP está configurado.

### Experiência de uso

- modo claro e modo escuro persistentes no navegador;
- navegação adaptada ao perfil conectado;
- interface responsiva para computador e celular;
- confirmação antes de descartar formulários alterados e ainda não salvos;
- identidade visual industrial própria da plataforma.

## Requisitos suportados

- Node.js 24 LTS;
- MariaDB 11.4 LTS ou MySQL 8.4 LTS;
- npm compatível com o Node 24.

## Instalação local

1. Instale as dependências:

   ```powershell
   npm ci
   ```

2. Importe [autoassis_db.sql](autoassis_db.sql). O script cria as tabelas sem apagar dados existentes e não cria contas ou senhas padrão.

   Em uma instalação que já possui dados, faça a atualização versionada (ela cria um backup privado antes de alterar o schema):

   ```powershell
   npm run migrate
   ```

3. Copie `.env.example` para `.env` e configure banco, `AUTH_SECRET`, URLs e SMTP.

4. Em uma instalação nova, crie o primeiro gerente:

   ```powershell
   $env:ADMIN_NAME="Nome do responsável"
   $env:ADMIN_EMAIL="responsavel@empresa.com.br"
   $env:ADMIN_PASSWORD="UmaSenha@Forte2026"
   npm run create-admin
   Remove-Item Env:ADMIN_PASSWORD
   ```

   Depois disso, gerentes e mecânicos são administrados em **Acessos** dentro do sistema.

5. Inicie e acesse `http://localhost:3000`:

   ```powershell
   npm start
   ```

## Comandos

- `npm start`: inicia o servidor;
- `npm run dev`: inicia em modo de desenvolvimento;
- `npm run create-admin`: cria o primeiro gerente em um banco novo;
- `npm run backup`: cria um dump privado em `backups/`;
- `npm run migrate`: cria backup e aplica a migração versionada da versão 1.2.0;
- `npm test`: executa os testes automatizados;
- `npm audit --omit=dev`: verifica vulnerabilidades conhecidas.

## Configuração de produção

O servidor falha de forma segura quando `NODE_ENV=production` e encontra configuração inadequada. Antes de iniciar, configure:

- `AUTH_SECRET` aleatório com pelo menos 32 caracteres;
- `FRONTEND_URL` e `CORS_ORIGIN` com HTTPS;
- usuário de banco exclusivo, sem usar `root`, e senha forte;
- `SMTP_USER`, `SMTP_PASSWORD` e `SMTP_FROM`; opcionalmente, defina
  `SMTP_REPLY_TO` com um endereço válido para receber respostas;
- `TRUST_PROXY_HOPS` conforme o proxy reverso utilizado;
- `OFICINA_NOME`, `OFICINA_DOCUMENTO`, `OFICINA_TELEFONE`, `OFICINA_EMAIL` e `OFICINA_ENDERECO` com os dados exibidos nos documentos;
- backup automático e restauração testada do banco.

Nunca publique `.env`, dumps, backups ou credenciais de demonstração.

## Segurança já implementada

- bcrypt com custo 12 e política de senha forte;
- autorização separada entre cliente, mecânico e gerente;
- faturamento agregado, relatórios e administração exclusivos do gerente;
- contrato do mecânico limitado ao detalhe de uma OS já versionada, sem liberar custos na listagem;
- sessões da equipe revalidadas no banco a cada requisição protegida;
- gestão de equipe restrita ao gerente, com proteção contra autoexclusão e remoção do último administrador;
- consultas SQL parametrizadas;
- limite de requisições nas rotas de autenticação;
- recuperação com token aleatório armazenado como hash, expiração de uma hora e
  e-mail transacional em HTML/texto sem recursos externos;
- transação e bloqueio de linha ao movimentar estoque;
- allowlist de arquivos públicos — código do servidor, SQL, testes e configurações não são servidos;
- CORS restrito, CSP e cabeçalhos de proteção;
- IDs estritos e preço/custos ocultos das listas e consultas operacionais do mecânico;
- configuração de produção validada no início do processo.

## Qualidade

Antes de gerar uma versão:

```powershell
node --check server.js
npm test
npm audit --omit=dev
```

Valide também os fluxos de login dos três perfis, temas claro/escuro, estoque, movimentações, serviços, PDF, relatórios, gestão da equipe e menu móvel no navegador.

## Limites para comercialização

A versão atual foi preparada para implantação dedicada e piloto comercial controlado em uma única oficina. Antes de operar em escala, tratar dados reais de vários clientes ou oferecer como SaaS, ainda são necessários:

- confirmação de e-mail e associação de solicitações por ID de usuário;
- desativação temporária de acessos e trilha de auditoria imutável;
- migrations versionadas, monitoramento, logs estruturados e backups testados;
- isolamento por `oficina_id` caso várias oficinas compartilhem a mesma instalação;
- Termos de Uso, Política de Privacidade e processo de atendimento à LGPD;
- definição de licença, suporte, SLA e política de atualização.

Esses itens são requisitos de operação comercial, não apenas melhorias visuais.
