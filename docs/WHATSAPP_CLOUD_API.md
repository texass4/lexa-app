# WhatsApp oficial (WhatsApp Business Cloud API) — Atendimento

Integração da página **Atendimento** com a API oficial da Meta. O atendimento é feito por pessoas: não há IA nem robô respondendo pelo WhatsApp.

> **Estado desta etapa (1ª):** infraestrutura, banco, webhook, recebimento, status de entrega e envio de **texto** prontos e testados localmente. **Não foi testado com a Meta de verdade:** o ambiente de desenvolvimento não alcança `graph.facebook.com` e não há aplicativo nem número da Meta configurados. Antes de usar com clientes, faça o roteiro de [Teste com a Meta](#teste-com-a-meta-o-que-falta).

## Como funciona

```
Cliente no WhatsApp ──► Meta ──► POST /api/whatsapp/meta/webhook            (público, assinado)
                                   │ confere X-Hub-Signature-256 (META_APP_SECRET), no corpo bruto
                                   │ phone_number_id do evento → número vinculado → escritório
                                   ▼
                          whatsapp_contacts / _conversations / _messages      (RLS por escritório)
                                   │ Realtime (mesma RLS)
                                   ▼
                          Atendimento (lista + conversa)
                                   │ Enviar
                                   ▼
          POST /api/whatsapp/conversations/:id/messages ──► Graph API /{phone-number-id}/messages
          (sessão + whatsapp.edit; regra das 24 h;          (token do escritório, decifrado só no servidor)
           grava "pendente" → "enviada"/"falhou")
```

- **Provedor:** `lib/integrations/whatsapp/meta/` (cliente da Graph API e tradução do webhook), na mesma interface `WhatsAppProvider` da conexão antiga. Banco, serviços e tela são os mesmos.
- **Um aplicativo da Meta para a plataforma, um número por escritório.** O aplicativo da Íntegra recebe os webhooks de todos os escritórios. Cada escritório vincula o **próprio** número com a **própria** autorização: WABA ID, Phone Number ID e token de acesso. Não existe credencial global que represente todos os escritórios.
- **Escritório de cada evento:** o `metadata.phone_number_id` do evento é casado com o número que o escritório vinculou. Um número só pode pertencer a um escritório (restrição no banco). Nada no corpo escolhe o escritório diretamente.

## Banco (migração `0021_whatsapp_cloud_api.sql`)

Reaproveita as tabelas do `0002` (instâncias, contatos, conversas, mensagens, anexos, status). Não duplica nada e não apaga dados. Pode ser rodada de novo.

| Mudança | Para quê |
|---|---|
| `whatsapp_instances.provider` aceita `meta`; `external_id` = Phone Number ID; nova coluna `business_account_id` = WABA ID | o número oficial do escritório |
| `status` aceita `error`; novas colunas `verified_name`, `quality_rating` e `last_checked_at` | "conectado" só depois de a Meta confirmar; o erro aparece na tela |
| `unique (provider, external_id)` (já existia) + `whatsapp_instances_meta_org_idx` | um número não serve a dois escritórios; um número oficial por escritório |
| tabela `whatsapp_credentials` (token cifrado, AES-256-GCM) | RLS ligada **sem política** e sem permissão para `anon`/`authenticated`: o navegador não lê, nem quem administra |
| `whatsapp_messages.provider_error_code` | código da Meta numa falha (ex.: `131047`, fora das 24 h) |
| `whatsapp_webhook_events.provider` | de qual provedor veio o evento (diagnóstico) |

As salvaguardas que já existiam continuam valendo:

- mensagem sem duplicata (`unique (conversation_id, provider_message_id)`);
- chaves compostas `(organization_id, id)`, que impedem referência entre escritórios;
- status que só avança (`whatsapp_apply_status`);
- escrita só pelo servidor.

O teste SQL `supabase/tests/whatsapp_cloud.sql` (incluído no `npm run test:rls`) confere:

- isolamento entre escritórios, credenciais invisíveis, número de um escritório só;
- duplicidade, status para frente e permissão `whatsapp.view`.

## Segurança

- **Token do escritório:** fica cifrado com `WHATSAPP_CREDENTIALS_KEY` (fora do banco). O id da instância entra como dado autenticado, então a cifra copiada para outro escritório não abre. O token entra pela tela e nunca volta em resposta, log ou tela.
- **Webhook:** a assinatura é conferida sobre os **bytes recebidos**, com comparação em tempo constante. Sem assinatura ou com assinatura errada, o webhook responde 401. Sem `META_APP_SECRET`, responde 503 e recusa tudo. A verificação inicial devolve o `hub.challenge` só com o `WHATSAPP_WEBHOOK_VERIFY_TOKEN` certo.
- **Idempotência:** a Meta repete o lote quando não recebe 200, e mensagem repetida é ignorada. Número desconhecido recebe 200, para a Meta não insistir, mas nada é gravado. Uma falha no processamento devolve 500 e a Meta tenta de novo.
- **Logs:**
  - o log tem só ids, tipos e códigos, sem texto, nome, telefone ou token;
  - o registro `whatsapp_webhook_events` da Meta guarda uma cópia **sem conteúdo** (`redactMetaPayload`);
  - ninguém lê esse registro pelo navegador.
- **Mídia recebida:** baixada depois da resposta, com o token, e só de domínios da Meta. Arquivos acima de 64 MB são recusados. Vai para o bucket privado `whatsapp/<escritório>/…`.
- **Identidade:** o telefone **não** vincula o contato ao cliente automaticamente, porque telefone não prova identidade. A tela **sugere** o cliente com o mesmo telefone e alguém confirma ("Vincular"). Isso mudou também para a conexão antiga.
- **Permissões:** `whatsapp.view` para ler, `whatsapp.edit` para responder e `office.manage` para conectar ou desconectar o número.

## Regras da Meta aplicadas

- **Janela de atendimento de 24 h:** texto livre só até 24 h depois da última mensagem do cliente. Fora disso, ou se o cliente nunca escreveu, a Meta só aceita **modelo de mensagem aprovado**. A Íntegra recusa antes de gravar (409, com a explicação) e a tela bloqueia a resposta, deixando só as notas internas. Se a Meta recusar mesmo assim (`131047`), a mensagem fica como falhou, com o motivo.
- **Só texto nesta etapa:** anexos e áudio gravado ficam escondidos no número oficial, e o servidor recusa se chegarem.
- **Confirmação de leitura:** ao abrir a conversa, a Íntegra marca como lida na Meta. O cliente vê os tiques azuis.
- **Recebido:** texto, imagem, documento, áudio, vídeo, figurinha, localização, contato, botão e lista. Reações são ignoradas por enquanto; tipos novos aparecem como "mensagem não suportada".

## Configuração da plataforma (equipe da Íntegra, uma vez)

1. **Portfólio empresarial na Meta** (business.facebook.com), com a **verificação da empresa** concluída. Sem ela, o aplicativo fica limitado e não pode atender outros negócios.
2. **Aplicativo:** em developers.facebook.com › Meus apps › Criar app, tipo **Empresa** (Business). Adicione o produto **WhatsApp**.
3. **`META_APP_SECRET`:** em Configurações do app › Básico › Chave secreta do aplicativo.
4. **Webhook:** em WhatsApp › Configuração › Webhook:
   - URL de retorno: `https://SEU_DOMINIO/api/whatsapp/meta/webhook` (HTTPS público);
   - token de verificação: o mesmo valor de `WHATSAPP_WEBHOOK_VERIFY_TOKEN`;
   - clique em **Verificar e salvar** (a Íntegra precisa estar no ar com as variáveis);
   - em "Campos do webhook", assine **`messages`**.
5. **`WHATSAPP_CREDENTIALS_KEY`:** `openssl rand -base64 32`. Guarde em um cofre de segredos, porque trocar a chave invalida os tokens salvos.
6. **Aplicar a migração `0021_whatsapp_cloud_api.sql`** no SQL Editor do Supabase.
7. **Revisão do app:** para atender números de outras empresas (os escritórios), o aplicativo precisa de **acesso avançado** às permissões `whatsapp_business_messaging` e `whatsapp_business_management`, aprovado na **Revisão do app** da Meta. Até lá, o app em modo de desenvolvimento só funciona com números e pessoas ligados ao próprio portfólio da Íntegra. O número de teste da Meta envia só para até 5 destinatários cadastrados (erro `131030`).

## Conexão de cada escritório

A pessoa que administra o escritório abre **Atendimento** › status da conexão (abaixo de "Conversas") › **Configurar** e informa:

| Campo | Onde está na Meta |
|---|---|
| **WABA ID** | WhatsApp › Configuração da API (identificação da conta do WhatsApp Business) |
| **Phone Number ID** | mesmo lugar, ao lado do número (não é o telefone) |
| **Token de acesso permanente** | de um **usuário do sistema** com acesso à conta do WhatsApp do escritório e ao aplicativo da Íntegra, com as permissões `whatsapp_business_messaging` e `whatsapp_business_management` e validade "Nunca" |

Ao salvar, a Íntegra só marca "Conectado" depois de **validar na Meta** que:

1. o token acessa o número e o número é da Cloud API;
2. o número pertence ao WABA informado;
3. o aplicativo foi assinado na conta (`POST /{waba}/subscribed_apps`). Sem essa assinatura, nada é recebido.

Se qualquer verificação falhar, nada é salvo e a tela mostra o motivo. Depois, a conexão é reverificada ao abrir o Atendimento (no máximo a cada 5 min) ou na hora, em **Verificar**. Token revogado vira "Conexão com erro", nunca "Conectado". **Desconectar** apaga o token e desfaz a assinatura; o histórico fica.

### Vínculo multi-tenant na Meta (importante)

O webhook chega no **aplicativo da Íntegra**. Por isso o token do escritório precisa ter sido gerado com acesso à conta do WhatsApp **dele** e ao **aplicativo da Íntegra**. Há dois caminhos:

- **Piloto (manual), possível hoje com o código desta etapa:** o escritório compartilha a conta do WhatsApp Business com o portfólio da Íntegra como **parceiro** (Configurações do negócio › Contas › Contas do WhatsApp › Atribuir parceiro). A Íntegra gera, no próprio portfólio, um token de usuário do sistema com acesso a essa conta e ao aplicativo, e esse token é salvo na tela do escritório.
- **Definitivo (próxima etapa, depende da Meta):** a Íntegra vira **Provedor de Tecnologia** (Tech Provider), com empresa verificada e app revisado, e usa o **Cadastro Incorporado** (Embedded Signup). O escritório autoriza pelo botão "Entrar com o Facebook", escolhe ou cria a conta e o número, e o servidor troca o código por um token do escritório. **Isso não está implementado** e exige aprovação da Meta.

## Teste com a Meta (o que falta)

O que foi validado aqui:

- testes de unidade;
- teste SQL;
- teste de ponta a ponta do webhook contra a aplicação e o Supabase local;
- a tela no Chromium.

Para validar contra a Meta de verdade:

1. Configure a plataforma (seção acima) num ambiente com HTTPS público, como homologação ou um túnel.
2. No painel do app, use o **número de teste** da Meta e cadastre o seu celular como destinatário permitido.
3. Conecte o número de teste em Atendimento › Configurar. O status deve ficar "Conectado", com o nome do número.
4. Mande uma mensagem do seu celular para o número de teste. Ela deve aparecer na lista em segundos.
5. Responda pela Íntegra. Deve sair "enviada" e depois passar para entregue e lida.
6. Para testar a janela, espere 24 h sem responder (ou use uma conversa antiga): o envio deve ser recusado com a explicação.

## Testes automatizados

| Arquivo | Cobre |
|---|---|
| `lib/integrations/whatsapp/meta/webhook.test.ts` | verificação inicial, assinatura (corpo alterado, segredo errado, acentos), tradução de todos os tipos, lote com vários números, status e falha `131047`, registro sem conteúdo |
| `lib/integrations/whatsapp/meta/client.test.ts` | formato do envio, erros da Meta (`131047`, `190`, `200`, limites) sem vazar token, conexão (número, posse, assinatura), leitura, mídia só de domínios da Meta e até 64 MB |
| `lib/services/whatsapp/credentials.test.ts` | cifra: ida e volta, outra instância não abre, chave errada ou adulteração, sem chave |
| `lib/whatsapp/send-rules.test.ts` | janela de 24 h, só texto, notas sempre liberadas, conexão antiga inalterada |
| `supabase/tests/whatsapp_cloud.sql` (`npm run test:rls`) | RLS, isolamento, credenciais invisíveis, duplicidade, status para frente |
| `tests/integration/whatsapp-meta.integration.ts` (`npm run test:integration`, com a aplicação rodando) | webhook assinado → banco → RLS, sem vínculo automático por telefone, repetição, número desconhecido, status e falha, isolamento A/B |

## Ainda não implementado (próximas etapas)

- **Modelos de mensagem (templates):** listar os aprovados e enviar fora da janela de 24 h ou para iniciar uma conversa.
- **Envio de anexos e áudio** pelo número oficial.
- **Cadastro Incorporado** (onboarding sem token manual).
- **Webhooks de qualidade e de conta** (`phone_number_quality_update`, `account_update`): hoje a qualidade só é lida na verificação periódica.
- **Reações.**
- **Medição de uso e custo** por escritório. A Meta cobra modelos de mensagem pela tabela dela.

A conexão antiga (Z-API, não oficial, via WhatsApp Web) continua no código só para quem já a usa. Ela não deve ser usada em escritórios novos.
