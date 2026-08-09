# Checklist de implantação - Auto+Assis 1.2.0

## Antes de iniciar

- Instalar Node.js 24 LTS e MariaDB 11.4 LTS ou MySQL 8.4 LTS.
- Criar usuário de banco exclusivo; não usar `root` em produção.
- Configurar `.env` a partir de `.env.example`, com `AUTH_SECRET` aleatório e URLs HTTPS.
- Configurar SMTP para que a recuperação de senha funcione.
- Definir `FRONTEND_URL` com a URL HTTPS pública e, se necessário, `SMTP_REPLY_TO` para receber respostas.
- Manter `.env`, backups e dumps fora do repositório e do ZIP público.

## Instalação ou atualização

```powershell
npm ci
npm run migrate
npm test
npm audit --omit=dev
npm start
```

Em banco novo, importe `autoassis_db.sql` e execute `npm run create-admin` antes da migração.

## Primeiro acesso

1. Entre como gerente.
2. Abra **Acessos**.
3. Preencha **Identidade da oficina** com documento, contato e endereço reais.
4. Cadastre cada gerente e mecânico em conta individual.
5. Teste uma solicitação, um orçamento, a aprovação e o contrato impresso.
6. Entre como mecânico e valide Consultas, avanço do serviço e geração do contrato, sem acesso a Relatórios ou faturamento.
7. Teste a recuperação de senha e confirme que o link abre a URL pública correta.
8. Teste a restauração do backup criado em `backups/`.

## Operação comercial

- Publicar somente atrás de HTTPS e proxy configurado.
- Definir rotina de backup, retenção, restauração e monitoramento.
- Formalizar licença, suporte, SLA, Termos de Uso e Política de Privacidade/LGPD.
- Para atender várias oficinas na mesma infraestrutura, implementar isolamento por `oficina_id` antes da venda como SaaS.
