# Entrada e triagem — marco funcional local

Implementado: cadastro manual com URL, nome e observação; busca; fila de triagem;
aprovação, rejeição e arquivamento com justificativa; histórico antes/depois;
painel derivado dos registros locais. Cadastro não inicia produção.

Persistência: localStorage versionado, sincronizado entre abas. Falha de leitura
bloqueia edição para preservar registros. Mudança detectada antes da gravação
exige nova revisão. Não é um banco transacional: uso simultâneo em múltiplas
abas não tem garantias de serialização. A demonstração não deve receber dados
sensíveis nem operar produção.

O ator é explicitamente demonstrativo. Não há autenticação, autorização real,
auditoria imutável, serviços externos, processamento premium ou banco compartilhado.

Verificação de domínio: Node 24, `node --experimental-strip-types --test tests/intake.test.mjs`.
Quatro testes cobrem ausência de aprovação implícita, bloqueio de salto de etapa,
justificativa obrigatória, repetição de aprovação, preservação de rejeição,
URLs inválidas/com credenciais e duplicidade por URL normalizada.

Próximos requisitos: validação visual e de interação no navegador, backend com
autenticação e transações, migrations, backup e prova ponta a ponta no Railway.
Lint/build e testes de domínio não substituem esses gates.
