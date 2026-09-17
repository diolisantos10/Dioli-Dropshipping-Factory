# Prateleira Bruta e Entrada Manual

## Objetivo
Ser o estoque barato de oportunidades ainda não industrializadas.

## Entradas independentes
1. Global Trend Intelligence.
2. Entrada manual por URL por usuário autorizado.

## Entrada manual
Campos mínimos: URL do produto/fornecedor, usuário, timestamp, origem=MANUAL e observação/motivo opcional. Exemplos de motivo: visto em rede social, concorrente, aposta comercial, pedido interno.

## Regra de autonomia
Trend Intelligence não pode barrar uma inclusão manual. O candidato manual entra na Prateleira Bruta independentemente de score de trends, mas segue por padrão a mesma triagem antes de gastar recursos de produção.

## Dados do candidato
ID, origem, URLs/fontes, fornecedor, snapshot bruto, categoria preliminar, região/sinal, evidências, notas, status, duplicidade/relação com candidatos existentes e histórico.

## Interface funcional
Busca, filtros por origem/categoria/região/data/status, cards/lista, detalhes/evidências, ação Enviar para Triagem, arquivar e entrada manual destacada.

## Aceite
Inserir URL deve criar candidato auditável sem iniciar Product Factory. Deve ser possível comparar futuramente desempenho de candidatos MANUAL vs TREND.