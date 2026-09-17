# Eventos, Sincronização e Auditoria

## Objetivo
Permitir que a DDF seja reativa sem criar cascatas inseguras.

## Eventos exemplares
SupplierCostChanged, SupplierStockChanged, FXRateChanged, ChannelFeeChanged, TaxRuleChanged, ProductApproved, ProductReady, PriceCalculated, PriceGuardTriggered, ListingPublished, OrderReceived, FulfillmentUpdated, TrackingReceived, SaleRecorded.

## Regras
Eventos possuem idempotency key, timestamp, origem, entidade/versão, correlation ID e resultado. Jobs devem aceitar retry com backoff e dead-letter/exception queue. Integrações degradadas não derrubam módulos independentes.

## Auditoria
Registrar quem/o quê/quando/antes/depois para aprovações, alterações de produto, pricing, publicação, integrações e ações operacionais críticas. Logs técnicos não substituem audit trail de negócio.

## Observabilidade
Saúde de conectores, última sync, taxa de erro, filas atrasadas, dados stale e falhas de propagação devem ser visíveis.

## Aceite
De uma alteração de custo deve ser possível navegar até os preços recalculados e listings atualizados/retidos, com causa e resultado.