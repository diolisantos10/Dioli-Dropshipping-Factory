# DDF — Backlog mestre de entrega

Atualizado em 21/09/2026. Fonte de verdade funcional: `DDF-BLUEPRINT/`.
A ordem abaixo segue dependências, não datas.

Legenda: `[x]` concluído · `[-]` entregue de forma controlada, mas ainda requer
hardening/expansão · `[ ]` pendente · `[D]` decisão deliberadamente adiada.

## Estado executivo

### Entregue — Factory-first controlada

- Aplicação DDF responsiva em Next.js/TypeScript, publicada no Railway.
- Fluxo funcional de Intake → aprovação → Product Factory → mídia → produto
  pronto → pricing, com guardrails e histórico.
- Catálogo de produtos disponíveis, Intelligence Room e auditoria agregada.
- Connectors neutros simulados, sincronização idempotente e isolamento de falha.
- Pedido controlado/idempotente, snapshot econômico e ciclo até tracking.
- Estado compartilhado no PostgreSQL, autenticação Basic, endpoint de saúde e TLS.
- Lint, build e 14 testes de domínio aprovados.

### Ainda necessário para a DDF completa de produção

- Schema relacional e migrations já existem; o cutover dos fluxos da interface
  para repositórios transacionais por entidade ainda está em execução.
- Autenticação por sessão, papéis/permissões, trilha imutável e segurança avançada.
- Schema universal completo, storage real de mídia e jobs assíncronos.
- Pricing multicontexto e Intelligence comercial reconciliável.
- Fornecedor, canal, marcas e provedores reais — mantidos em aberto por decisão.
- Fluxo externo real de pedido/fulfillment/tracking, CI/E2E, backups, alertas,
  runbooks e aceite final.

## Definição de pronto

O marco **Factory-first controlado** está entregue. A **DDF completa de produção**
só estará entregue quando os cinco portões ao final deste documento estiverem
concluídos, inclusive integrações reais, segurança, recuperação e aceite formal.
Nenhum dado demonstrativo deve ser apresentado como produção, e nenhuma ação
econômica ou externa pode ocorrer implicitamente.

## B0 — Arquitetura e fundação

- [x] Ler e adotar integralmente o blueprint funcional oficial.
- [x] Separar a nova DDF do MVP legado.
- [x] Criar aplicação Next.js, TypeScript e design base responsivo.
- [x] Definir navegação e arquitetura de informação da DDF.
- [x] Registrar proprietário inicial das aprovações.
- [D] Escolher fornecedor, canal, marcas e provedores externos ao final.
- [-] Arquitetura de produção com PostgreSQL, migrations e autenticação; workers e storage pendentes.
- [x] Criar schema relacional extensível e migrations versionadas.
- [-] Papéis ADMIN/APPROVER e menor privilégio nas mutações; IdP individual permanece pendente.
- [x] Criar IDs de correlação, idempotência e contrato base de eventos/outbox.
- [-] Produção configurada sem segredos no código; local e preview ainda precisam padronização.

## B1 — Intake e Portfolio Gate

- [x] Cadastro manual de candidato com URL, nome e observação.
- [x] Normalização de URL, bloqueio de credenciais e duplicidade básica.
- [x] Busca e estados CANDIDATO, TRIADO, APROVADO, REJEITADO e ARQUIVADO.
- [x] Justificativa obrigatória e histórico antes/depois.
- [x] Garantir que cadastro não inicie produção.
- [x] Projetar Intake transacionalmente no schema relacional, preservando o bridge compatível.
- [x] Registrar origem MANUAL/TREND, região, categoria e evidências.
- [-] Comparar duplicidades por URL, nome e domínio; solicitação formal de informação permanece pendente.
- [ ] Adicionar filtros completos e snapshots imutáveis de decisão.
- [ ] Testes E2E do portão de aprovação.

## B2 — Product Factory

- [x] Iniciar produção somente a partir de candidato aprovado.
- [x] Criar Master Product independente de fornecedor e canal.
- [x] Campos editoriais essenciais, tags, categoria e completude.
- [x] Versionar alterações e impedir duplicidade por candidato.
- [x] Bloquear PRONTO enquanto faltarem campos ou mídia aprovada.
- [-] Schema universal suporta variantes, SKUs, atributos, materiais, cores,
  tamanhos, dimensões, peso, GTIN/EAN, SEO, compliance e localização.
- [ ] Criar taxonomia hierárquica extensível e atributos por categoria.
- [x] Preservar snapshots e restaurar versões do Master Product.
- [x] Declarar gaps por destino sem contaminar o schema central.
- [ ] Testes E2E do candidato aprovado até produto pronto.

## B3 — Media Factory

- [x] Registrar mídia original e derivada separadamente.
- [x] Exigir finalidade, proveniência e revisão explícita.
- [x] Preservar ativos rejeitados no histórico controlado.
- [-] Upload persistente com checksum e metadados concluído no PostgreSQL; provider externo adiado.
- [ ] Versões, direitos de uso, formatos e proporções por destino.
- [ ] Jobs controlados de transformação de imagem e vídeo.
- [ ] Comparação visual e aprovação de derivados.
- [ ] Guardrail contra alteração enganosa do produto.

## B4 — Produtos Disponíveis

- [x] Catálogo separado de publicação.
- [x] Exibir apenas Master Products em estado PRONTO.
- [ ] Busca, filtros, taxonomia, variantes, mídia e histórico detalhado.
- [ ] Exibir ofertas, custos, destinos elegíveis e gaps declarados.
- [ ] Preparar associação futura N:N com marcas e lojas.

## B5 — Pricing & Margin Protection

- [x] Motor versionado com componentes explícitos de custo.
- [x] Preço sugerido, preço mínimo seguro e Margin Guard.
- [x] Bloquear margem alvo inferior à mínima e cálculo inviável.
- [x] Interface de simulação somente para produtos prontos.
- [x] Contextos por oferta, moeda, país, loja e canal.
- [-] FX e impostos entram no cálculo versionado; fontes externas permanecem adiadas.
- [x] Análise de impacto e quarentena para mudanças superiores a 30%.
- [x] Aprovação explícita antes de propagar qualquer preço.
- [ ] Testes de precisão, arredondamento e cenários-limite.

## B6 — Auditoria, eventos e observabilidade

- [x] Linha do tempo agregando decisões, produto, mídia e pricing.
- [-] Audit trail imutável no backend; identidade individual via IdP ainda pendente.
- [x] Outbox transacional com worker, retry exponencial e estado DEAD.
- [-] API operacional expõe stale, falhas, latência, filas e saúde; alertas externos pendentes.
- [ ] Navegação causal entre evento, cálculo, job e entidade afetada.
- [ ] Alertas e runbooks de recuperação.

## B7 — Intelligence Room

- [x] Indicadores operacionais derivados dos dados disponíveis.
- [x] Exibir ausência de dados comerciais como “sem dados”, nunca zero.
- [ ] Modelo analítico por produto, oferta, origem, categoria e período.
- [x] Receita, custo, contribuição e margem derivados de pedidos enviados.
- [x] Termômetro com janela e evidência: acelerando, estável, desacelerando.
- [ ] Feedback informativo para Trends e Triagem sem ação automática.

## B8 — Connectors simulados

- [x] Definir contratos neutros e capability mapping para a prova controlada.
- [-] Supplier Adapter simulado; custo/estoque/logística reais não conectados.
- [-] Channel Adapter simulado com sincronização idempotente; listing real ausente.
- [x] Simular falhas, recovery, tentativas e estado stale por connector.
- [x] Provar que a falha de um adapter não derruba o núcleo.

## B9 — Fornecedores, canais e marcas reais — decisão final

- [D] Selecionar primeiro fornecedor e canal após aprovação da fábrica.
- [D] Selecionar provedores de IA/mídia e regras comerciais.
- [D] Definir associações de Santioh, Dilee, Dilix e Queise sem hardcode.
- [ ] Configurar credenciais por ambiente e rotação segura.
- [ ] Implementar primeiro adapter oficial de fornecedor.
- [ ] Implementar primeiro adapter oficial de canal.

## B10 — Pedidos, fulfillment e tracking

- [x] Pedido controlado, normalizado e idempotente com snapshot econômico.
- [-] Ciclo simulado de pedido até envio/tracking; fulfillment externo real pendente.
- [x] Fila controlada de exceções com motivo, estado anterior e resolução.
- [ ] PII com acesso mínimo e política de retenção.
- [ ] Prova real canal → DDF → fornecedor → tracking → canal.

## B11 — Qualidade, segurança e entrega Railway

- [x] Lint, build de produção e 19 testes de domínio aprovados.
- [-] 19 testes de domínio e E2E de autenticação, 11 rotas, landmarks e API; auditoria visual avançada pendente.
- [-] QA funcional nos fluxos principais; matriz visual desktop/mobile e estados especiais pendente.
- [-] Basic Auth, threat model, headers e rate limiting concluídos; IdP/sessão e schemas runtime pendentes.
- [-] Plano de backup, restauração e rollback documentado; restore drill ainda pendente.
- [-] CI com gates obrigatórios criado; preview por branch pendente.
- [x] Projeto, aplicação, PostgreSQL e variáveis configurados no Railway.
- [-] Deploy, smoke tests, domínio, TLS e health concluídos; observabilidade completa pendente.
- [-] Runbook operacional e segurança documentados; aceite final do proprietário pendente.

## Portões de liberação

1. **Factory Core:** B0–B7 completos com dados controlados.
2. **Proof of Architecture:** B8 completo sem dependência de fornecedor/canal real.
3. **External Pilot:** decisões e integrações de B9 aprovadas.
4. **Operations Pilot:** B10 validado ponta a ponta com serviços reais.
5. **Production Release:** B11 completo e aceite formal registrado.
