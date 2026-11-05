# Roteiro de apresentação — Auto+Assis

## Proposta (1 minuto)
O Auto+Assis organiza o atendimento de uma oficina: o cliente abre a solicitação, a equipe prepara e executa o serviço e o gerente acompanha estoque e resultados.

## Demonstração (6 a 8 minutos)
1. Entre como gerente e apresente a visão geral. Explique o significado dos indicadores e abra as análises de estoque.
2. Mostre uma peça cadastrada, sua quantidade e o estoque mínimo. Registre uma entrada ou saída e confira a mudança no saldo.
3. Em outra janela, entre como cliente. Abra um atendimento com veículo e descrição do problema.
4. Volte ao gerente, localize a solicitação e prepare o orçamento.
5. No cliente, aprove o orçamento e mostre a atualização do atendimento.
6. Na equipe, avance pelas etapas permitidas, mostre a ordem de serviço para impressão e conclua o atendimento.
7. No cliente, abra o histórico e registre uma avaliação. Encerre mostrando a auditoria ao gerente.

Use contas e dados fictícios próprios para o ensaio. Mantenha cliente e equipe em perfis de navegador separados para evitar troca de sessão.

## Antes de apresentar
- Inicie o MySQL/MariaDB e execute `npm start` na pasta do projeto.
- Abra `http://localhost:3000/api/prontidao` e confirme que o banco está disponível.
- Faça login nas contas de demonstração e ensaie o ciclo completo acima.
- Confira os dados da oficina usados na impressão da OS.
- Teste o zoom e a resolução do projetor. O tema claro costuma facilitar a leitura em salas iluminadas.
- Se mostrar recuperação de senha, confirme previamente a configuração de e-mail e o recebimento real.

## O que foi verificado nesta revisão
- 91 testes automatizados do sistema passaram em execução sequencial.
- Dez testes de navegador passaram no Chromium, com APIs simuladas: fluxos do cliente, indicadores, falhas de carregamento, menu móvel e telas da equipe nos dois temas.
- Banco local e endpoint `/api/prontidao` responderam com sucesso após iniciar o ambiente.
- Corrigidos o contador do dia local, gráficos sem dados, mensagens de erro do painel e navegação por teclado.
- Revisados textos, títulos, navegação e excesso de elementos decorativos.

Os testes com APIs simuladas verificam a interface; o ensaio com o banco e as contas reais de demonstração continua necessário. Não apresente uma funcionalidade como validada em operação apenas porque o teste de interface passou.
