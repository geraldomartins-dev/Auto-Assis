# Histórico de versões

## 1.3.0 - 2026-08-08

- mecânico autorizado a alterar quantidades somente por movimentações transacionais;
- trilha de auditoria persistente para estoque, peças, equipe e configuração da oficina;
- auditoria guarda autor, perfil, data, IP, requisição e valores anteriores/posteriores, sem senhas ou tokens;
- nova tela de auditoria exclusiva do gerente, com filtros e paginação;
- proteção contra saída acidental de formulários com alterações não salvas;
- migração versionada e backup automático para a nova tabela `auditoria`.

## 1.2.0 - 2026-08-08

### Produto

- temas claro e escuro persistentes em toda a plataforma;
- contraste revisado nos dois temas, incluindo campos, placeholders, estados e textos auxiliares;
- rolagem vertical corrigida nas telas longas do portal do cliente;
- identidade visual industrial e responsiva;
- gestão de equipe com cadastro, edição, alteração de função e exclusão;
- perfis Gerente e Mecânico com menus e permissões próprios;
- Consultas rápidas operacionais disponíveis ao mecânico, sem informações financeiras ou pessoais desnecessárias;
- cadastro da identidade documental da oficina dentro do sistema.

### Ordens de serviço

- criação presencial transacional, sem registros incompletos;
- transições aprovado → em andamento → concluído sem reenvio indevido de custo ou número da OS;
- máquina de estados estrita, sem atalhos nem reabertura de atendimentos concluídos ou rejeitados;
- número de OS único gerado pelo servidor;
- orçamento versionado e identificado por SHA-256;
- decisão do cliente registrada com data, usuário e origem;
- contrato com dados da oficina, responsável, orçamento, decisão e assinaturas;
- contrato/PDF disponível ao mecânico por uma rota dedicada para OS versionada;
- emissão bloqueada enquanto a oficina não completar seus dados documentais.

### Segurança e operação

- e-mail de recuperação redesenhado, com botão de ação, link alternativo, validade e avisos de segurança;
- sessões revogadas após troca de senha, perfil ou exclusão;
- custos e preços ocultos das listas do mecânico, com acesso pontual apenas ao contrato solicitado;
- dados pessoais e financeiros removidos do `localStorage`;
- limite de login separado por IP e conta, limpo após sucesso;
- CSV protegido contra fórmulas e campos malformados;
- backup automático antes da migração versionada;
- arquivos privados bloqueados pelo servidor web.

### Validação

- 74 testes automatizados aprovados;
- 17 páginas com scripts inline validados;
- 0 vulnerabilidades conhecidas no `npm audit --omit=dev` em 2026-08-08.
