# Governança de dados e PII

## Minimização

A DDF não recebe nome, e-mail, telefone, documento ou endereço no estado operacional do pedido. O core armazena apenas `customerRef`, identificador opaco gerado no canal de origem. A interface rejeita referências com aparência de e-mail, telefone ou documento. Dados necessários para expedição devem permanecer no cofre do canal/fornecedor e ser acessados somente pelo adapter durante a execução autorizada.

## Acesso mínimo

- `VIEWER`: leitura de painéis e auditoria.
- `OPERATOR`: operação diária sem alteração de configuração crítica.
- `APPROVER`: mutações controladas e aprovações.
- `ADMIN`: configuração, segurança e recuperação.

As APIs de mutação aceitam somente `ADMIN` e `APPROVER`; mídia e estado são negados aos demais papéis. Credenciais ficam em variáveis do ambiente, nunca no repositório ou no estado do navegador.

Sem IdP externo, contas podem ser configuradas em `DDF_ADMIN_ACCOUNTS` como JSON (`[{"username":"...","password":"...","role":"VIEWER"}]`). A configuração legada de uma conta usa `DDF_ADMIN_USER`, `DDF_ADMIN_PASSWORD` e `DDF_ADMIN_ROLE`. Use senhas exclusivas, rotação periódica e HTTPS; a migração futura para IdP não altera os papéis do domínio.

## Retenção e descarte

- Referência de cliente: 90 dias por padrão, com `retentionUntil` explícito.
- Após o prazo, a rotina de retenção remove `customerRef` e notas de resolução não essenciais.
- Identificadores do pedido, valores econômicos, status e auditoria permanecem para reconciliação, sem PII.
- Legal hold exige justificativa, responsável e prazo registrados fora do payload do pedido.

## Incidente

Ao detectar PII indevida: interromper o fluxo, restringir acesso, registrar correlation ID, eliminar a cópia operacional, rotacionar credenciais se aplicável e documentar impacto e correção no registro de incidentes.
