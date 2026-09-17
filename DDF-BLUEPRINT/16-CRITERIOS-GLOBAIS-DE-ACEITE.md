# Critérios Globais de Aceite

1. DDF permanece separada do MVP legado; nenhum comportamento antigo é requisito implícito.
2. Candidato pode entrar por Trends ou manualmente e não aciona processamento premium sem aprovação.
3. Master Product é independente de Supplier Offer e pode ter múltiplos fornecedores.
4. Cadastro universal suporta extensões por categoria/canal sem virar schema proprietário de um marketplace.
5. Produto pronto pode existir sem publicação.
6. Preços são específicos por contexto e possuem cálculo explicável/versionado.
7. Margin Guard impede publicação/atualização economicamente insegura conforme regras.
8. Mudanças externas relevantes disparam recálculo/impact analysis controlado.
9. Marcas Santioh, Dilee, Dilix e Queise podem ser ligadas aos canais escolhidos; canal não é hardcoded por marca.
10. Supplier Hub e Channel Hub usam adapters e idempotência.
11. Pedido é rastreável canal → DDF → fornecedor → fulfillment/tracking → canal.
12. Intelligence separa receita de rentabilidade e permite análise multidimensional.
13. Operações críticas têm audit trail e observabilidade.
14. Falha de um connector não deve derrubar toda a DDF.
15. Segredos não ficam em código/documentação; permissões seguem menor privilégio.
16. A Control Room deve transformar estes contratos funcionais em arquitetura técnica e plano de agentes sem reinterpretar objetivos de negócio.