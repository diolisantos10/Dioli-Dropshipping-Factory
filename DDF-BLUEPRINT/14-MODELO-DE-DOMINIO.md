# Modelo de Domínio Conceitual

## Núcleo sugerido
Supplier; SupplierConnection; SupplierProduct; SupplierOffer; MasterProduct; ProductVariant; ProductAttribute; Category/Taxonomy; MediaAsset; RawCandidate; TriageDecision; Brand; Store; Channel; ChannelConnection; Listing; PricingRule; PriceCalculation; CostComponent; InventorySnapshot; FXRate; FeeRule; TaxRule; Order; OrderItem; SupplierOrder; Fulfillment; Shipment; TrackingEvent; SyncJob; AuditEvent; TrendSignal; IntelligenceMetric.

## Relações-chave
- MasterProduct 1:N ProductVariant.
- MasterProduct/Variant 1:N SupplierOffer.
- MasterProduct pode ser associado a N Brands/Stores conforme estratégia.
- Listing representa uma publicação específica em Brand/Store + Channel.
- PriceCalculation é versionado por destino/contexto.
- Order preserva snapshots econômicos, não depende apenas do preço atual.

## Requisito de extensibilidade
Schemas específicos de marketplace/fornecedor podem existir como metadata/mappings versionados, mas não devem contaminar o domínio central com campos proprietários espalhados pelo sistema.