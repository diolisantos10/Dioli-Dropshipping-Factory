# Pricing & Margin Protection Engine

## Missão
Precificar e proteger rentabilidade. É sistema de missão crítica, não calculadora simples de markup.

## Princípio
Um Master Product pode ter vários preços. Preço pode variar por Supplier Offer, país/moeda, marca, loja e canal.

## Entradas de custo
Custo do fornecedor; moeda/FX; frete/logística; impostos/tributos/duties aplicáveis; comissão percentual do canal; tarifa fixa; custo de pagamento/financeiro; custos operacionais atribuíveis; promoções/subsídios quando aplicáveis; reservas/buffers definidos; margem/markup alvo e mínimo.

## Cálculo
Determinar custo real total e preço necessário para atingir política de contribuição/margem do destino. Guardar componentes do cálculo e versão da regra — nunca somente o preço final.

## Motor reativo
Mudança em custo do fornecedor, câmbio, frete, imposto, tarifa/comissão de marketplace ou regra comercial deve identificar SKUs/destinos afetados, recalcular e propagar atualização controlada ao Channel Hub.

## Margin Guard
- preço mínimo absoluto e margem mínima;
- proibir venda abaixo das salvaguardas;
- detectar variações anômalas;
- thresholds para atualização automática vs quarentena/aprovação;
- histórico/versionamento/auditoria;
- alertas de margem em risco;
- fallback seguro quando dado crítico estiver ausente/stale.

## Regra de segurança
A DDF pode deixar de vender; não pode vender sem saber se a operação atende aos limites econômicos configurados.

## Aceite
Todo preço publicado deve ser explicável por componentes e regra. Alteração externa deve produzir impacto rastreável e nunca cascata cega.