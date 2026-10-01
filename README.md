# Íntegra

**Inteligência para a gestão jurídica.**

Gestão para escritórios de advocacia: clientes, processos, tarefas, agenda, documentos, financeiro e atendimento por WhatsApp.

```bash
npm run dev
```

Abre em [http://localhost:3000](http://localhost:3000). Sem sessão, vai para o login; depois de entrar, para o painel (`/dashboard`). Antes da primeira vez, copie `.env.example` para `.env.local` e rode as migrações de `supabase/migrations/` em ordem.

## Onde os dados ficam

Os dados do escritório ficam no **Supabase**: clientes, processos, tarefas, agenda, documentos, financeiro, atividades e WhatsApp em tabelas por escritório, isoladas pela RLS; os arquivos (documentos e anexos do WhatsApp) no Supabase Storage; contas e sessões no Supabase Auth. A Íntegra começa vazia — não há dados de demonstração. Ao entrar, o que a pessoa pode ver é carregado no navegador, e cada alteração é gravada no Supabase logo em seguida (`lib/store/storage.ts`).

No navegador ficam só preferências e marcadores locais, nunca dados do escritório: tema claro ou escuro, barra lateral recolhida, visualização das tarefas (quadro ou lista) e a data da última visita, usada em "Desde sua última visita".

Os processos são reais: consulte pelo número CNJ em **Novo processo** e ele fica salvo em **Processos**. A consulta roda no próprio servidor do Next (TypeScript) — não precisa de Python.

**Mapa do código e como alterar:** [ARCHITECTURE.md](./ARCHITECTURE.md) · **Marca e identidade visual:** [ARCHITECTURE.md › Marca](./ARCHITECTURE.md#5b-marca-íntegra)

> O produto se chamava LEXA. Identificadores internos (pasta `lexa-app`, variáveis `LEXA_*`, chaves `lexa:*` do navegador, cabeçalho `x-lexa-webhook-token`, nomes de migração, `LexaAIProvider` etc.) continuam com o nome antigo por compatibilidade.

## Íntegra IA (Gemini)

Camada de inteligência sobre os dados reais do escritório: resumo e próximos passos do processo, análise de movimentação, panorama do cliente e do escritório e um chat por contexto. A IA só lê o que a pessoa já pode ver, sempre do próprio escritório, e nunca grava nada — sugestões de tarefa abrem o formulário normal para você confirmar.

1. **Crie uma chave** da Gemini API em [Google AI Studio](https://aistudio.google.com/apikey).
2. **Configure o `.env.local`** (a chave fica só no servidor):
   ```bash
   GEMINI_API_KEY=sua-chave
   GEMINI_MODEL=gemini-2.5-flash   # opcional; qualquer modelo Flash disponível na sua conta
   GEMINI_FALLBACK_MODEL=          # opcional; reserva quando o principal estiver sobrecarregado
   AI_ENABLED=true                 # false desliga a Íntegra IA
   ```
3. **Instale as dependências** (`@google/genai` já está no `package.json`): `npm install`.
4. **Rode a aplicação**: `npm run dev`.
5. **Abra um processo** em **Processos** (de preferência um consultado pelo DataJud, com movimentações).
6. **Use a Íntegra IA**: no card *Íntegra IA* do processo, clique em **Resumir processo**, **Verificar próximos passos** ou **Perguntar à Íntegra**; em uma movimentação da timeline, use **Analisar com Íntegra IA**. No cliente, **Resumo do cliente**; no Painel, **Panorama do escritório**.

Sem `GEMINI_API_KEY`, as áreas da IA mostram *"Íntegra IA não configurada"*. Detalhes de arquitetura, segurança e custo: [ARCHITECTURE.md › Íntegra IA](./ARCHITECTURE.md#10-íntegra-ia).

## E-mail (SMTP)

Todo e-mail transacional sai por SMTP, por dois caminhos:

| Quem envia | E-mails | Configuração |
|---|---|---|
| **A Íntegra** (`lib/services/email`) | Convite para o escritório, reenvio do convite, link de nova senha (Configurações › Usuários e Admin) e "Esqueci minha senha" | Variáveis `SMTP_*` no servidor |
| **O Supabase Auth** | E-mails nativos do Auth (confirmação de e-mail, convite e redefinição disparados pelo próprio Supabase, troca de e-mail, magic link, reautenticação) | Painel do Supabase › SMTP |

A implementação é genérica: funciona com qualquer provedor SMTP (Google Workspace, Microsoft 365, Zoho, Amazon SES, servidor próprio etc.). Trocar de provedor é só trocar as variáveis. A Íntegra pede o link ao Supabase (`auth.admin.generateLink`, que não envia nada) e manda o e-mail com o próprio template. Uma falha de envio não desfaz o convite: ele fica pendente e pode ser reenviado.

Arquitetura: `tela → Route Handler → lib/auth/mailer.ts (regra do convite/recuperação) → lib/services/email (sendEmail) → Nodemailer → SMTP`. Só `lib/services/email/email-service.ts` conhece o Nodemailer.

### 1. Variáveis de ambiente (só no servidor)

| Variável | Obrigatória | O que é |
|---|---|---|
| `SMTP_HOST` | sim | Servidor SMTP do provedor |
| `SMTP_PORT` | não (padrão `587`) | Porta SMTP do provedor |
| `SMTP_SECURE` | não | `true` = TLS desde a conexão (normalmente porta 465); `false` = STARTTLS (normalmente 587). Sem valor, só a porta 465 usa TLS direto |
| `SMTP_USER` | sim | Usuário de autenticação SMTP |
| `SMTP_PASSWORD` | sim | Senha ou chave SMTP (em contas com 2FA, normalmente uma "senha de app") |
| `SMTP_FROM_EMAIL` | sim | Remetente; precisa estar autorizado no provedor para o `SMTP_USER` |
| `SMTP_FROM_NAME` | não (padrão `Íntegra`) | Nome exibido do remetente |

Os valores vêm do painel do seu provedor SMTP. Nenhuma dessas variáveis usa o prefixo `NEXT_PUBLIC_`: são lidas só no servidor e nunca chegam ao navegador. O Admin (`/api/admin/settings`) informa só se o e-mail está configurado, nunca os valores. Em produção sem TLS direto, a conexão exige STARTTLS (credenciais nunca trafegam em texto puro).

- **Desenvolvimento local:** copie `.env.example` para `.env.local` (fica fora do git), preencha e reinicie o `npm run dev`.
- **Vercel (produção e preview):** em *Project › Settings › Environment Variables*, cadastre as mesmas variáveis para os ambientes desejados e faça um novo deploy (variáveis novas só valem a partir do próximo deploy). Defina também `NEXT_PUBLIC_SITE_URL` com o endereço público do app, usado nos links. Para trazê-las para a máquina: `vercel env pull .env.local`.

Sem SMTP configurado, em desenvolvimento o link aparece no terminal do servidor. Em produção, o convite é criado com o aviso "o e-mail não foi enviado" e a tela de recuperação de senha mostra um erro, em vez de fingir que enviou.

### 2. Testar a configuração

```bash
npm run email:verify                           # configurado? conecta? autentica?
npm run email:verify -- --send-to=voce@x.com   # e manda um e-mail de teste
```

O script lê o `.env.local`, mostra host, porta e remetente (nunca a senha) e diz em qual etapa falhou. É só de terminal: não existe rota pública para enviar ou testar e-mail.

### 3. No provedor SMTP e no DNS (manual)

1. Use um remetente de um domínio da Íntegra (não um endereço gratuito como Gmail/Hotmail), autorizado no provedor para o usuário SMTP.
2. Configure no DNS do domínio os registros que o **seu provedor** indicar, copiando exatamente os valores mostrados por ele:
   - **SPF** (TXT `v=spf1 …`): autoriza o provedor a enviar pelo domínio. Só pode haver **um** registro `v=spf1`: junte os `include:` em vez de criar outro.
   - **DKIM**: assinatura dos e-mails (nome e valor fornecidos pelo provedor).
   - **DMARC** (TXT em `_dmarc.<seu-domínio>`): comece com política de monitoramento (`p=none`) e endureça (`quarantine`/`reject`) depois de conferir os relatórios.
3. Se o provedor restringir o SMTP por IP, lembre que a Vercel e o Supabase não têm IP fixo: libere o acesso (ou desative a restrição), ou o envio falha com login recusado.
4. Se o provedor reescrever links para rastrear cliques, desative isso para estes e-mails (são links de uso único).

### 4. No Supabase (manual)

1. **SMTP próprio:** em *Authentication › Emails › SMTP Settings* (em versões antigas do painel, *Project Settings › Authentication*), ative *Enable Custom SMTP* e preencha *Sender email* (`SMTP_FROM_EMAIL`), *Sender name* (`Íntegra`), *Host*, *Port*, *Username* e *Password* com os mesmos valores das variáveis `SMTP_*`. As credenciais ficam no painel do Supabase, não no código.
2. **Limite de envio:** com SMTP próprio, o Supabase aplica um limite de e-mails por hora; ajuste em *Authentication › Rate Limits*. Vale só para os e-mails que o Supabase envia.
3. **Templates:** em *Authentication › Emails › Templates*, cole o assunto (`supabase/templates/subjects.json`) e o corpo:
   - *Confirm signup* → `supabase/templates/confirmation.html`
   - *Invite user* → `supabase/templates/invite.html`
   - *Reset password* → `supabase/templates/recovery.html`

   Eles usam o `token_hash` e passam por `/auth/confirm`, que cria a sessão no servidor, com o mesmo visual dos e-mails da Íntegra. Os demais templates (*Magic Link*, *Change Email Address*, *Reauthentication*) não são usados pelos fluxos da Íntegra. Depois de mudar `lib/services/email/templates/`, rode `npm run email:templates` e cole de novo (um teste falha se os arquivos ficarem desatualizados).
4. **URLs:** em *Authentication › URL Configuration*, *Site URL* = o mesmo endereço de `NEXT_PUBLIC_SITE_URL`, e adicione `<endereço>/auth/confirm` em *Redirect URLs*.
5. **Validade do link:** é o *Email OTP Expiration* do provedor de e-mail do Auth (padrão 1 hora, que é o que a tela "Recuperar senha" informa; se mudar, ajuste o texto).

Hoje o cadastro de escritório e os convites criam a conta com o e-mail já confirmado (a aprovação do escritório é a porta de entrada), então o *Confirm signup* só é usado se alguém criar conta direto pelo Supabase Auth.

### 5. Como testar os fluxos

- **Convite:** em *Configurações › Usuários › Convidar*, convide um e-mail seu. "Convite enviado." confirma o envio e o e-mail chega com o nome do escritório. O botão leva a */redefinir-senha?convite=1*; crie a senha e você entra. No menu do usuário pendente, *Reenviar convite*. Pelo Admin: *Escritórios › Novo escritório* e *Usuários › Criar usuário*.
- **Recuperação de senha:** em */recuperar-senha*, informe o e-mail de uma conta. A tela responde igual para e-mails que existem ou não; o link abre "Nova senha". Link usado ou vencido volta ao login com aviso.
- **E-mails nativos do Supabase:** em *Authentication › Users*, *Send password recovery* num usuário de teste ou *Invite user* com um e-mail de teste (apague esse usuário depois: ele não tem escritório).
- **Falhas:** com `SMTP_PASSWORD` errada, o convite avisa que o e-mail não foi enviado, o reenvio mostra erro e o log do servidor traz `[LEXA · e-mail] O SMTP recusou o login…` (sem a senha).

Os testes automáticos (`npm test`) cobrem configuração, validação de destinatários, deduplicação, nova tentativa, classificação de erros, teste de conexão e templates, sem precisar de SMTP.
