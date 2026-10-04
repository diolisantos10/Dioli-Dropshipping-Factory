# Departamento de Importação e modelo de dois estoques

Situação: **desenho aprovado pelo CEO (Diego) em 04/10/2026, para construir a partir de novembro de 2026.**
A primeira importação real está prevista para janeiro de 2027. Este documento ainda **não** descreve
nada construído. Hoje (04/10) a DDF não tem agentes nem cadeiras com ficha: tem telas e regras de
fluxo, e quem decide é o Diego.

## Regras que valem para todo o departamento

1. **Diego não faz trabalho manual.** O departamento entrega a decisão pronta (fornecedor, preço,
   orçamento e custo final). O Diego só aprova a compra e paga.
2. **Só o Diego faz:** aprovar a compra, pagar, entregar ou trocar credenciais (inclusive a da conta
   Alibaba) e autorizar qualquer gasto. Nenhuma cadeira paga, aceita proposta em nome da empresa ou
   assina pedido sem essa aprovação.
3. **Regra do cofre:** toda IA passa pela Control Room (`POST /api/v1/ai/gateway/execute`, com o
   cabeçalho `X-Service-Token`). Nenhuma cadeira guarda chave de IA própria.
4. **Antecipar o próximo passo** (vale para cada ficha abaixo): a cadeira não espera ser chamada.
   Ao terminar a sua entrega, ela já prepara o que a próxima etapa vai precisar e aponta riscos
   antes que virem problema. Exemplo: o Cotador, ao receber cotações, já pede a amostra do melhor
   fornecedor e já pede ao Fiscal/Logística o custo final na porta.
5. **Nada de promessa não comprovada:** todo preço, prazo ou dado de fornecedor leva a fonte e a
   data. O que não foi verificado é marcado como "a confirmar".

## Gatilho

Um produto é **declarado sucesso**: decisão registrada do Diego, a partir dos sinais de venda da
Intelligence Room. A partir daí o caso de importação abre sozinho.

## Fluxo de ponta a ponta

```
Produto declarado sucesso
  → Diretor de Importação abre o caso (meta de custo, volume e prazo)
  → Caçador de Fornecedores: fornecedores que dão match (imagem + descrição)
  → Cotador: pedidos de cotação, comparação de preço, pedido mínimo, frete e prazo
  → Negociador: condições, amostra, ajustes
  → Fiscal/Logística: NCM, impostos, frete internacional, despachante → custo final na porta
  → Diretor monta o DOSSIÊ: até 3 opções, recomendação, riscos e orçamento pronto
  → Diego APROVA (ou recusa com motivo)   ← único passo humano obrigatório
  → Diego PAGA
  → Acompanhamento: produção, embarque, chegada em São Paulo → entrada no Bling (estoque físico)
```

## Cadeiras (fichas)

Cada ficha tem: missão, entrega, entradas, limites e **antecipação** (regra 4).

### Diretor de Importação
- **Missão:** transformar "produto de sucesso" em compra aprovada e mercadoria em São Paulo.
- **Entrega:** abertura do caso (meta de custo, volume, prazo) e dossiê final para o Diego, com até
  3 opções, a recomendação e os riscos.
- **Entradas:** produto declarado sucesso, histórico de vendas, estoque atual (Bling).
- **Limites:** não aprova nem paga; não fecha negócio.
- **Antecipa:** prazo de reposição antes de faltar estoque e o próximo produto candidato a
  importação.

### Caçador de Fornecedores (especialista Alibaba)
- **Missão:** achar o mesmo produto (ou equivalente melhor) com fornecedores confiáveis.
- **Entrega:** lista de fornecedores que dão match, com evidências: foto, descrição, tempo de
  plataforma, avaliações, selos e se é fabricante ou revendedor.
- **Meios:** busca por imagem e por descrição; acompanhamento de promoções.
- **Antecipa:** já descarta quem não atende pedido mínimo ou certificação e já marca quem aceita
  amostra.

### Cotador
- **Missão:** obter preço comparável de verdade.
- **Entrega:** tabela comparativa (preço unitário por faixa, pedido mínimo, frete até o porto,
  prazo de produção, validade da cotação), com fonte e data.
- **Antecipa:** pede amostra do melhor colocado e envia os dados ao Fiscal/Logística sem esperar.

### Negociador
- **Missão:** melhorar condições sem comprometer a empresa.
- **Entrega:** registro das mensagens trocadas e as condições finais propostas (preço, prazo,
  embalagem, marca própria).
- **Limites:** não aceita proposta, não paga e não assina; tudo fica condicionado à aprovação do
  Diego.
- **Antecipa:** pede especificação de embalagem e dados para nota e despacho junto com a
  negociação.

### Fiscal/Logística
- **Missão:** dizer quanto o produto custa **na porta** em São Paulo.
- **Entrega:** NCM, impostos estimados, frete internacional, seguro, despachante, prazo total e
  custo final por unidade.
- **Antecipa:** avisa exigências (certificação, licença, restrições) antes da aprovação, não depois.

### Reposição
- **Missão:** manter o estoque físico sem ruptura nem excesso.
- **Entrega:** sugestão de compra **diária/semanal** (o que, quanto, de quem), a partir de vendas,
  estoque no Bling e prazos reais.
- **Antecipa:** dispara um caso novo para o Diretor quando o prazo de reposição encosta no estoque
  de segurança.

## Modelo de dois estoques

| Selo no produto | Onde está o estoque | Quem guarda o saldo | Quem emite a nota | Como o pedido sai |
|---|---|---|---|---|
| **Pronta entrega** | Físico, em São Paulo | **Bling** | Bling | Separação e envio a partir de SP |
| **Sob encomenda** | No fornecedor (dropshipping) | Fornecedor (lido pela DDF) | — (a definir) | DDF repassa ao fornecedor (ex.: AliExpress) |

- O selo já existe na DDF desde 04/10/2026. É o campo `availability` do produto mestre, editável a
  qualquer momento e visível em Produtos Disponíveis e na Product Factory.
- **Site (Shopify):** dois locais de estoque, "São Paulo" (sincronizado com o Bling) e "Fornecedor".
  O site mostra "Pronta entrega" ou "Sob encomenda" conforme o local que tem saldo.
- **Carrinho misto:** o Shopify separa um pedido em partes por local (*fulfillment orders*), cada
  uma com seu prazo. A parte de SP sai pelo Bling; a parte do fornecedor é repassada pela DDF. O
  cliente vê dois prazos, um por grupo de itens.
- **Quem baixa o estoque:** cada venda baixa o saldo no local de onde sai. O físico é baixado no
  Bling, e o Bling devolve o saldo ao Shopify. O do fornecedor é atualizado pela sincronização da
  DDF com o fornecedor.

## Pendências a verificar (sem inventar)

1. **Alibaba, meio de automação.** Está confirmado que o Alibaba.com oferece no site busca por
   imagem, pedido de cotação (RFQ) e chat com fornecedores. **Não está verificado** se existe API
   oficial de **comprador** disponível para a conta do Diego (consultar o Open Platform do Alibaba
   com a conta dele).
   - Se a API existir: usar a API.
   - Se não existir: a alternativa é um agente de navegador na conta dele. **Risco:** pode violar
     os termos de uso e levar ao bloqueio da conta. Decisão do Diego depois da verificação.
2. **Bling × Shopify:** confirmar se a integração cobre os dois locais de estoque (SP + Fornecedor)
   e a emissão de nota só para a parte física.
3. **Checkout com dois prazos:** confirmar como exibir dois prazos no checkout do Shopify (tema e
   perfis de entrega).
4. **Contratação do Bling:** é decisão do Diego, porque é gasto.

## O que já existe na DDF (base para novembro)

- Selo **Pronta entrega / Sob encomenda** no produto mestre, com filtro na vitrine.
- Primeira camada do cadastro fiscal, toda opcional: NCM, CEST, origem (0–8), unidade, marca,
  modelo, garantia e, por variação, GTIN validado, peso e dimensões. O que falta aparece como lista
  de lacunas e nunca bloqueia a entrada.
- Conector AliExpress (sob encomenda) e conector Shopify (publicação).
