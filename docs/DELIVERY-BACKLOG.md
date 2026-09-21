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

- Modelagem relacional transacional e migrations; hoje o PostgreSQL persiste o
  estado compartilhado como documento JSON versionado.
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
- [-] Arquitetura de produção com PostgreSQL e autenticação; ORM, filas e storage pendentes.
- [ ] Criar schema relacional e migrations versionadas.
- [ ] Implementar papéis, permissões e princípio do menor privilégio.
- [-] IDs de correlação e idempotência existem nos fluxos simulados; contrato de eventos pendente.
- [-] Produção configurada sem segredos no código; local e preview ainda precisam padronização.

## B1 — Intake e Portfolio Gate

- [x] Cadastro manual de candidato com URL, nome e observação.
- [x] Normalização de URL, bloqueio de credenciais e duplicidade básica.
- [x] Busca e estados CANDIDATO, TRIADO, APROVADO, REJEITADO e ARQUIVADO.
- [x] Justificativa obrigatória e histórico antes/depois.
- [x] Garantir que cadastro não inicie produção.
- [-] Persistência compartilhada no PostgreSQL; falta modelagem transacional relacional.
- [ ] Registrar origem MANUAL/TREND, região, categoria e evidências.
- [ ] Implementar comparação de duplicidades e solicitação de informação.
- [ ] Adicionar filtros completos e snapshots imutáveis de decisão.
- [ ] Testes E2E do portão de aprovação.

## B2 — Product Factory

- [x] Iniciar produção somente a partir de candidato aprovado.
- [x] Criar Master Product independente de fornecedor e canal.
- [x] Campos editoriais essenciais, tags, categoria e completude.
- [x] Versionar alterações e impedir duplicidade por candidato.
- [x] Bloquear PRONTO enquanto faltarem campos ou mídia aprovada.
- [ ] Completar schema universal: variantes, SKUs, atributos, materiais, cores,
  tamanhos, dimensões, peso, GTIN/EAN, SEO, compliance e localização.
- [ ] Criar taxonomia hierárquica extensível e atributos por categoria.
- [ ] Implementar diferenças e restauração entre versões.
- [ ] Declarar gaps por destino sem contaminar o schema central.
- [ ] Testes E2E do candidato aprovado até produto pronto.

## B3 — Media Factory

- [x] Registrar mídia original e derivada separadamente.
- [x] Exigir finalidade, proveniência e revisão explícita.
- [x] Preservar ativos rejeitados no histórico controlado.
- [ ] Upload para object storage, checksums e metadados do arquivo.
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
- [ ] Contextos por oferta, moeda, país, marca, loja e canal.
- [ ] FX, impostos e tarifas como fontes versionadas.
- [ ] Análise de impacto e quarentena para mudanças anômalas.
- [ ] Aprovação explícita antes de propagar qualquer preço.
- [ ] Testes de precisão, arredondamento e cenários-limite.

## B6 — Auditoria, eventos e observabilidade

- [x] Linha do tempo agregando decisões, produto, mídia e pricing.
- [-] Histórico compartilhado; falta audit trail imutável com identidade forte do ator.
- [ ] Outbox/event bus, retries e dead-letter queue.
- [ ] Estado stale, falhas, latência, filas e saúde operacional visíveis.
- [ ] Navegação causal entre evento, cálculo, job e entidade afetada.
- [ ] Alertas e runbooks de recuperação.

## B7 — Intelligence Room

- [x] Indicadores operacionais derivados dos dados disponíveis.
- [x] Exibir ausência de dados comerciais como “sem dados”, nunca zero.
- [ ] Modelo analítico por produto, oferta, origem, categoria e período.
- [ ] Receita, custo, contribuição e margem reconciliáveis.
- [ ] Termômetro com janela e evidência: acelerando, estável, desacelerando.
- [ ] Feedback informativo para Trends e Triagem sem ação automática.

## B8 — Connectors simulados

- [x] Definir contratos neutros e capability mapping para a prova controlada.
- [-] Supplier Adapter simulado; custo/estoque/logística reais não conectados.
- [-] Channel Adapter simulado com sincronização idempotente; listing real ausente.
- [-] Simular falhas e recuperação; stale e política completa de retries pendentes.
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
- [ ] Fila de exceções: estoque, custo, endereço, recusa e cancelamento.
- [ ] PII com acesso mínimo e política de retenção.
- [ ] Prova real canal → DDF → fornecedor → tracking → canal.

## B11 — Qualidade, segurança e entrega Railway

- [x] Lint, build de produção e 14 testes de domínio aprovados.
- [ ] Testes unitários completos, integração, E2E e acessibilidade.
- [-] QA funcional nos fluxos principais; matriz visual desktop/mobile e estados especiais pendente.
- [-] Basic Auth e validações básicas; threat model, sessão, headers e rate limiting pendentes.
- [ ] Backups, restauração testada e plano de migrations/rollback.
- [ ] CI com gates obrigatórios e preview por branch.
- [x] Projeto, aplicação, PostgreSQL e variáveis configurados no Railway.
- [-] Deploy, smoke tests, domínio, TLS e health concluídos; observabilidade completa pendente.
- [ ] Documentação operacional e aceite final do proprietário.

## Portões de liberação

1. **Factory Core:** B0–B7 completos com dados controlados.
2. **Proof of Architecture:** B8 completo sem dependência de fornecedor/canal real.
3. **External Pilot:** decisões e integrações de B9 aprovadas.
4. **Operations Pilot:** B10 validado ponta a ponta com serviços reais.
5. **Production Release:** B11 completo e aceite formal registrado.
