# DDF — Runbook operacional

## Saúde

- Endpoint público: `GET /health`.
- Saudável: HTTP 200, `status=ok`, `database.status=up`.
- Degradado: HTTP 503. Verificar `DATABASE_URL`, disponibilidade do PostgreSQL e logs do deployment.
- Cada resposta protegida carrega `X-Correlation-ID`; use esse valor para rastrear uma operação.

## Deploy

1. O gate de CI executa migration check, lint, testes, build e audit de dependências.
2. O Railway implanta a branch `codex/ddf-foundation` após atualização do GitHub.
3. Na primeira conexão, migrations pendentes são aplicadas dentro de transação.
4. Validar `/health`, autenticação, cada rota da aplicação e uma gravação controlada.

## Rollback

1. Interromper gravações externas e deixar connectors desativados.
2. Reimplantar o último deployment saudável no Railway.
3. Migrations são aditivas; nunca remover coluna/tabela no mesmo release que deixa de usá-la.
4. Para migration destrutiva futura, criar primeiro uma migration de expansão, migrar dados, validar e só depois contrair em outro release.

## Backup e restauração

1. Habilitar backup nativo/volume snapshot do PostgreSQL no Railway conforme o plano contratado.
2. Antes de release estrutural, gerar dump lógico com `pg_dump --format=custom` usando credencial operacional temporária.
3. Armazenar o arquivo criptografado fora da aplicação e registrar retenção/proprietário.
4. Testar restauração em banco isolado com `pg_restore --clean --if-exists`.
5. Executar `SELECT version FROM schema_migrations ORDER BY version` e smoke tests antes de promover o banco restaurado.

Automação: configure `DATABASE_URL` (origem) e `DDF_RESTORE_DATABASE_URL` (banco isolado e descartável) e execute `npm run db:restore-drill`. O script recusa origem e destino idênticos, restaura o dump e valida migrations. Nunca aponte o destino para produção.

## Smoke de produção

Execute `DDF_SMOKE_URL=https://... DDF_SMOKE_USER=... DDF_SMOKE_PASSWORD=... npm run test:smoke`. O teste exige health saudável, acesso à aplicação e correlation ID. Segredos não devem ser gravados em arquivos ou logs.

## Incidentes

- **Conflito 409:** recarregar dados; não sobrescrever silenciosamente outra revisão.
- **Banco indisponível:** a interface sinaliza modo local, mas nenhuma ação externa deve ser executada.
- **Connector degradado:** isolar o adapter, preservar o core e reprocessar pela mesma idempotency key.
- **Outbox acumulada:** pausar integrações, identificar erro recorrente e reprocessar apenas eventos `FAILED`; eventos `DEAD` exigem revisão humana.
- **Credencial suspeita:** rotacionar imediatamente as variáveis Railway, invalidar sessões/Basic Auth e revisar audit trail.

## Aceite de produção

- CI verde e deployment saudável.
- Backup e restauração comprovados.
- Papéis e credenciais revisados pelo proprietário.
- Primeiro fornecedor/canal aprovados e conectados em sandbox antes da produção.
- Pedido de teste rastreado canal → DDF → fornecedor → tracking → canal.
- Aceite formal registrado com data, responsável e ressalvas.
