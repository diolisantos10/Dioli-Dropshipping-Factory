# DDF — Threat model mínimo

| Risco | Controle atual | Próximo controle antes de integrações reais |
|---|---|---|
| Acesso administrativo indevido | Basic Auth, comparação constante e rate limit | IdP/OIDC, MFA e sessão curta |
| Vazamento de segredo | Variáveis de ambiente; nenhum segredo no repositório | Rotação e cofre gerenciado |
| Sobrescrita concorrente | Revisão otimista e HTTP 409 | Transações por entidade relacional |
| Repetição de operação | Idempotency keys e constraints únicas | Janela/replay policy por adapter |
| Alteração sem rastro | Audit event imutável e correlation ID | Identidade individual via IdP |
| Falha em integração | Isolamento por adapter e outbox | Worker, retry exponencial e DLQ operacional |
| Injeção/entrada maliciosa | Queries parametrizadas, limites e validações | Schemas runtime por endpoint |
| Clickjacking/XSS/MIME | CSP e headers de segurança | Nonces CSP e varredura DAST |
| Exposição de PII | PII ainda não coletada | Criptografia, retenção e acesso mínimo antes de pedidos reais |
| Perda de dados | PostgreSQL gerenciado | Backup agendado e restore drill documentado |

Nenhum conector ou pedido real deve ser ativado enquanto os controles da terceira
coluna aplicáveis ao fluxo não estiverem validados.
