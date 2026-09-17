# Product Factory e Cadastro Mestre

## Objetivo
Transformar matéria-prima de fornecedor em um ativo comercial DDF extremamente completo, reutilizável e distribuível em múltiplos canais.

## Princípio central
Este é um dos núcleos mais importantes da DDF. O schema não será 'o cadastro do Shopify' nem 'o cadastro do Mercado Livre'. Deve ser um Universal Product Schema/superset capaz de representar o máximo útil dos campos relevantes dos marketplaces/canais suportados. Campos podem ser opcionais por categoria/canal.

## Domínios mínimos
Identidade e IDs; títulos universal e por canal; descrição curta/longa; bullets; benefícios; especificações; categoria/taxonomia; público/gênero; marca; materiais; cores; tamanhos; dimensões/peso; variantes/SKUs; GTIN/EAN quando existente; tags; SEO; compliance/campos regulatórios quando aplicáveis; origem; Supplier Offers; custo/moeda; logística; estoque; políticas; atributos específicos de categoria; mídia; status de qualidade; traduções/localizações; histórico/versionamento.

## Master Product x Supplier Offer
Master Product representa o produto comercial canônico. Supplier Offer representa quem fornece, custo, moeda, estoque, shipping, lead time e condições. Um Master Product pode ter N Supplier Offers.

## Pipeline
1. Ingestão do candidato aprovado.
2. Normalização e enriquecimento.
3. Taxonomia/atributos/variantes.
4. Conteúdo comercial.
5. Mídia.
6. Validação de completude/qualidade.
7. Criação da versão pronta.

## Aceite
Produto PRONTO deve ter dados suficientes para os destinos pretendidos ou declarar explicitamente gaps por canal. Alterar fornecedor/oferta não exige reconstruir o Master Product inteiro.