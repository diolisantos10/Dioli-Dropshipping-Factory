# Channel Connector Hub

## Objetivo
Ser a fronteira universal entre DDF e destinos de venda: Shopify, Mercado Livre, TikTok Shop, sites próprios e futuros marketplaces/canais.

## Arquitetura
Cada canal possui adapter que traduz Master Product, taxonomia, atributos, mídia, preço, estoque e estados para o contrato externo. O core não conhece peculiaridades do canal além de capacidades declaradas pelo adapter.

## Responsabilidades
Publicar/despublicar; mapear categorias/atributos; criar/atualizar variantes; sincronizar preço; disponibilidade/estoque quando aplicável; mídia; receber pedidos/eventos; recuperar status; encaminhar tracking; registrar external IDs, erros e saúde da integração.

## Multicanal e marcas
Santioh, Dilee, Dilix e Queise não possuem destinos rígidos. Estratégia escolhe destinos. Queise pode ser ampla; marcas específicas podem ser seletivas. Tecnicamente, qualquer combinação permitida deve ser possível.

## Idempotência
Repetir evento/sync não pode criar anúncio/pedido duplicado. Toda publicação possui vínculo Product + Brand/Store + Channel + externalListingId + versão.

## Aceite
Novo canal deve ser incorporável por adapter/capability mapping sem alterar o modelo central.