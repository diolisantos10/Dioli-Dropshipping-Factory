# Supplier Connector Hub

## Objetivo
Ser a única fronteira entre a DDF e fornecedores externos. Traduzir APIs, OAuth, feeds CSV/XML/XLSX/JSON, FTP/SFTP e integrações específicas para o modelo universal interno.

## Entradas
Credenciais/autorização armazenadas com segurança; catálogo; variantes; imagens/vídeos; custo; moeda; estoque; dimensões/peso; logística; prazo; políticas; identificadores externos; status de pedidos e tracking.

## Responsabilidades
- Conectar múltiplos fornecedores sem acoplá-los ao core.
- Importar e atualizar SupplierProduct/SupplierOffer.
- Deduplicar e preservar IDs de origem.
- Sincronizar custo, estoque, disponibilidade e logística.
- Enviar pedidos aprovados para fulfillment quando o fornecedor permitir.
- Receber status/tracking e encaminhar ao fluxo de pedidos/canais.
- Registrar saúde, última sincronização, erros, latência e proveniência.

## Regra estrutural
Fornecedor específico nunca define o schema central. Cada connector mapeia o fornecedor para entidades universais: Supplier, SupplierConnection, SupplierProduct, SupplierOffer, Variant, Inventory, ShippingOption, Order/Fulfillment/TrackingEvent.

## Falhas e salvaguardas
Falha de fornecedor não pode derrubar a Factory. Dados stale devem ser marcados; produto sem confirmação de estoque/custo pode ser bloqueado conforme política. Mudança anômala de custo deve alimentar Pricing Guard, nunca publicar cegamente.

## Aceite
Adicionar novo fornecedor deve exigir predominantemente um novo adapter/configuração, sem reescrever Product Factory, Pricing ou Channel Hub.