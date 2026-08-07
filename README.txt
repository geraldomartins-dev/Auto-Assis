# Auto+Assis

Sistema web desenvolvido como Trabalho de Conclusão de Curso para apoiar a gestão de uma oficina automotiva. A aplicação reúne controle de peças, movimentações de estoque, solicitações de serviço, ordens de serviço, relatórios e consultas rápidas.

## Perfis e funcionalidades

### Gerente

- acompanha indicadores no dashboard;
- cadastra, edita e consulta peças;
- registra entradas e saídas com atualização transacional do estoque;
- gerencia solicitações e ordens de serviço;
- consulta relatórios e respostas rápidas sobre a operação.

### Cliente

- cria uma conta e autentica-se;
- registra solicitações de serviço;
- acompanha somente as próprias solicitações;
- aprova ou rejeita um orçamento;
- pode recuperar a senha por e-mail quando o SMTP está configurado.

## Tecnologias

- Node.js 20 ou superior;
- Express;
- MariaDB 10.4+ ou MySQL 8+;
- HTML, CSS e JavaScript;
- bcrypt para senhas;
- tokens assinados com HMAC para autenticação;
- Nodemailer para recuperação de senha.

## Instalação

1. Instale o Node.js e o MariaDB/MySQL.
2. Importe `autoassis_db.sql` no banco. O script cria a base `autoassis_novo`, todas as tabelas e dados fictícios para demonstração.
3. Execute `npm install` na pasta do projeto.
4. Copie `.env.example` para `.env` e informe os dados do banco e uma chave longa em `AUTH_SECRET`.
5. Inicie com `npm start`.
6. Acesse `http://localhost:3000`.

## Contas de demonstração

| Perfil | E-mail | Senha |
|---|---|---|
| Gerente | `gerente@autoassis.local` | `Gerente@2026` |
| Cliente | `cliente@autoassis.local` | `Cliente@2026` |

Essas credenciais são exclusivamente fictícias e devem ser substituídas em uma instalação real.

## Comandos

- `npm start`: inicia o servidor;
- `npm run dev`: inicia com reinicialização automática;
- `npm test`: executa os testes automatizados.

## Segurança implementada

- senhas armazenadas com bcrypt;
- consultas SQL parametrizadas;
- autorização separada entre cliente e gerente;
- limitação de tentativas nas rotas de autenticação;
- recuperação de senha com token aleatório, armazenado como hash e com expiração;
- transação e bloqueio da peça ao registrar movimentações;
- cabeçalhos HTTP de proteção e restrição de CORS.

## Requisitos funcionais principais

- RF01: cadastrar e autenticar usuários;
- RF02: controlar acesso conforme o perfil;
- RF03: gerenciar peças e estoque mínimo;
- RF04: registrar entradas e saídas;
- RF05: impedir saída superior ao saldo disponível;
- RF06: registrar e acompanhar solicitações;
- RF07: permitir aprovação ou rejeição do orçamento pelo cliente;
- RF08: emitir relatórios e consultas rápidas.

## Testes recomendados para a apresentação

1. entrar como gerente e cadastrar uma peça;
2. registrar uma entrada e conferir o aumento do saldo;
3. registrar uma saída e conferir a redução do saldo;
4. tentar uma saída maior que o estoque e observar a rejeição;
5. entrar como cliente e criar uma solicitação;
6. entrar como gerente e enviar um orçamento;
7. voltar ao cliente e aprovar ou rejeitar o orçamento;
8. abrir as Consultas Rápidas e conferir os indicadores.

## Limitações e trabalhos futuros

- envio de notificações sobre mudanças na ordem de serviço;
- auditoria detalhada das alterações realizadas por usuários;
- integração com emissão fiscal e pagamentos;
- implantação em nuvem com HTTPS e banco gerenciado;
- ampliação da cobertura de testes de integração e interface.
