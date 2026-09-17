# Orders, Fulfillment e Tracking

## Objetivo
Fechar o ciclo bidirecional do dropshipping.

## Fluxo
Canal recebe pedido → Channel Hub importa e normaliza → DDF valida vínculo/oferta/estado → encaminha fulfillment ao Supplier Hub/fornecedor quando integração permitir → fornecedor retorna aceite/status/tracking → DDF normaliza eventos → Channel Hub atualiza destino/cliente conforme capacidades.

## Entidades
Order, OrderItem, Customer/Shipping snapshot, SupplierOrder, Fulfillment, Shipment, TrackingEvent, Payment/Economic snapshot e AuditEvent.

## Regras
Preservar snapshot de preço/custo do momento da venda; idempotência de pedidos; nenhuma duplicação de fulfillment; exceções entram em fila operacional; troca de fornecedor após venda exige regra explícita e equivalência; PII com acesso mínimo e retenção apropriada.

## Exceções
Sem estoque, custo alterado, endereço inválido, fornecedor recusou, tracking ausente, cancelamento/reembolso. Nenhuma exceção deve desaparecer silenciosamente.

## Aceite
Um pedido deve ser rastreável ponta a ponta do externalOrderId ao SupplierOrder e Shipment.