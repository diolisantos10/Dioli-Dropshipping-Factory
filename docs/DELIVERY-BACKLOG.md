# DDF — Backlog mestre de entrega

Fonte de verdade: `DDF-BLUEPRINT/`. Ordem baseada em dependências, não em datas.
Responsável inicial pelas aprovações: proprietário da DDF. Fornecedores, canais,
marcas e provedores reais permanecem adiados até a validação da fábrica.

## Definição global de pronto

A DDF só será considerada entregue quando o fluxo controlado funcionar de ponta
a ponta, estiver persistido em banco compartilhado, possuir autenticação e
autorização, auditoria de negócio, testes, observabilidade, documentação e uma
implantação validada no Railway. Nenhum dado demonstrativo poderá ser apresentado
como produção e nenhuma ação econômica ou externa poderá ocorrer implicitamente.

## B0 — Arquitetura e fundação

- [x] Ler e adotar integralmente o blueprint funcional oficial.
- [x] Separar a nova DDF do MVP legado.
- [x] Criar aplicação Next.js, TypeScript e design base responsivo.
- [x] Definir navegação e arquitetura de informação da Control Room.
- [x] Registrar proprietário inicial das aprovações.
- [x] Adiar escolhas de fornecedor, canal, marca e provedores externos.
- [ ] Definir arquitetura de produção: banco, ORM, autenticação, filas e storage.
- [ ] Criar schema relacional e migrations versionadas.
- [ ] Implementar papéis, permissões e princípio do menor privilégio.
- [ ] Criar IDs de correlação, idempotência e contrato de eventos.
- [ ] Configurar ambientes local, preview e produção sem segredos no código.

## B1 — Intake e Portfolio Gate

- [x] Cadastro manual de candidato com URL, nome e observação.
- [x] Normalização de URL, bloqueio de credenciais e duplicidade básica.
- [x] Busca e estados CANDIDATO, TRIADO, APROVADO, REJEITADO e ARQUIVADO.
- [x] Justificativa obrigatória e histórico antes/depois.
- [x] Garantir que cadastro não inicie produção.
- [ ] Migrar persistência do navegador para banco transacional.
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

- [x] Linha do tempo local agregando decisões, produto, mídia e pricing.
- [ ] Audit trail imutável no backend com ator, antes/depois e justificativa.
- [ ] Outbox/event bus, idempotency keys, retries e dead-letter queue.
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

- [ ] Definir contratos universais e capability mapping.
- [ ] Criar Supplier Adapter simulado com custo, estoque e logística.
- [ ] Criar Channel Adapter simulado com listing idempotente.
- [ ] Simular custo/estoque stale, falhas, retries e recuperação.
- [ ] Provar que falha de um adapter não derruba o núcleo.

## B9 — Fornecedores, canais e marcas reais — decisão final

- [ ] Selecionar primeiro fornecedor e canal após aprovação da fábrica.
- [ ] Selecionar provedores de IA/mídia e regras comerciais.
- [ ] Definir associações de Santioh, Dilee, Dilix e Queise sem hardcode.
- [ ] Configurar credenciais por ambiente e rotação segura.
- [ ] Implementar primeiro adapter oficial de fornecedor.
- [ ] Implementar primeiro adapter oficial de canal.

## B10 — Pedidos, fulfillment e tracking

- [ ] Pedido normalizado e idempotente com snapshot econômico.
- [ ] Supplier Order, fulfillment, shipment e tracking ponta a ponta.
- [ ] Fila de exceções: estoque, custo, endereço, recusa e cancelamento.
- [ ] PII com acesso mínimo e política de retenção.
- [ ] Prova canal → DDF → fornecedor → tracking → canal.

## B11 — Qualidade, segurança e entrega Railway

- [x] Lint, build de produção e testes de domínio atuais aprovados.
- [ ] Testes unitários completos, integração, E2E e acessibilidade.
- [ ] QA visual desktop/mobile e estados vazio/loading/error/blocked/stale.
- [ ] Threat model, validação de entrada, headers e rate limiting.
- [ ] Backups, restauração testada e plano de migrations/rollback.
- [ ] CI com gates obrigatórios e preview por branch.
- [ ] Configurar projeto/serviços/variáveis no Railway.
- [ ] Deploy, smoke tests, domínio, TLS e observabilidade.
- [ ] Documentação operacional e aceite final do proprietário.

## Portões de liberação

1. **Factory Core:** B0–B7 completos com dados controlados.
2. **Proof of Architecture:** B8 completo sem dependência de fornecedor/canal real.
3. **External Pilot:** decisões e integrações de B9 aprovadas.
4. **Operations Pilot:** B10 validado ponta a ponta.
5. **Production Release:** B11 completo e aceite formal registrado.
