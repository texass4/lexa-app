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

## E-mail (Brevo SMTP)

Todo e-mail transacional sai pelo SMTP da Brevo, por dois caminhos:

| Quem envia | E-mails | Configuração |
|---|---|---|
| **A Íntegra** (`lib/auth/mailer.ts`) | Convite para o escritório, reenvio do convite, link de nova senha (Configurações › Usuários e Admin) e "Esqueci minha senha" | Variáveis `BREVO_*` no servidor |
| **O Supabase Auth** | E-mails nativos do Auth (confirmação de e-mail, convite e redefinição disparados pelo próprio Supabase, troca de e-mail, magic link, reautenticação) | Painel do Supabase › SMTP |

A Íntegra só pede o link ao Supabase (`auth.admin.generateLink`, que não envia nada) e manda o e-mail com o próprio template. Assim o convite sai com o nome do escritório, e uma falha de envio não desfaz o convite: ele fica pendente e pode ser reenviado.

### 1. Variáveis de ambiente (só no servidor)

```bash
BREVO_SMTP_HOST=smtp-relay.brevo.com   # Brevo › SMTP & API › SMTP: "SMTP Server" (confira lá)
BREVO_SMTP_PORT=587      # 587 (STARTTLS, padrão) ou 465 (TLS direto)
BREVO_SMTP_USER=         # Brevo › SMTP & API › SMTP: "Login"
BREVO_SMTP_PASSWORD=     # uma SMTP key gerada nessa aba (não é a API key)
BREVO_SENDER_EMAIL=      # remetente validado na Brevo, no domínio autenticado da Íntegra
BREVO_SENDER_NAME=Íntegra
NEXT_PUBLIC_SITE_URL=    # endereço público do app, usado nos links (não é segredo)
```

Nada disso usa o prefixo `NEXT_PUBLIC_` (exceto o endereço do site, que é público). Em produção, configure as variáveis no provedor de hospedagem, nunca no repositório. O Admin (`/api/admin/settings`) informa só se o e-mail está configurado, nunca os valores.

Sem as variáveis `BREVO_*`, em desenvolvimento o link aparece no terminal do servidor. Em produção, o convite é criado com o aviso "o e-mail não foi enviado" e a tela de recuperação de senha mostra um erro, em vez de fingir que enviou.

### 2. Na Brevo (manual)

1. **Autentique o domínio da Íntegra:** em *Senders, Domains & Dedicated IPs › Domains*, clique em *Add a domain* e informe o domínio do remetente. A Brevo mostra os registros DNS que precisam ser criados; copie **exatamente** os valores exibidos por ela para o DNS do domínio:
   - **Código de verificação da Brevo** (TXT): prova que o domínio é seu.
   - **DKIM** (o registro e o nome de host que a Brevo indicar): assina os e-mails.
   - **DMARC** (TXT em `_dmarc.<seu-domínio>`): se o domínio ainda não tiver um, crie com o valor sugerido pela Brevo. Comece com uma política de monitoramento (`p=none`) e endureça (`quarantine`/`reject`) depois de conferir os relatórios.
   - **SPF** (TXT `v=spf1 …`): se a Brevo indicar um `include` para o seu domínio, acrescente ao SPF existente. O domínio só pode ter **um** registro `v=spf1`: junte os `include:` em vez de criar um segundo.

   Volte à Brevo e clique em *Authenticate*/*Verify* até todos os registros aparecerem como válidos (a propagação do DNS pode demorar).
2. **Cadastre o remetente:** em *Senders*, adicione `BREVO_SENDER_EMAIL` (no domínio autenticado) com o nome `Íntegra`.
3. **Gere a SMTP key:** em *SMTP & API › SMTP*, use *Generate a new SMTP key*. O *Login* exibido vai para `BREVO_SMTP_USER`, a chave para `BREVO_SMTP_PASSWORD`, e o servidor e a porta para `BREVO_SMTP_HOST`/`BREVO_SMTP_PORT`. A chave só aparece uma vez; se perder, gere outra e revogue a antiga.
4. **(Recomendado)** Se o rastreamento de cliques estiver ativo na conta, os links passam por um redirecionamento da Brevo. Para e-mails de acesso (links de uso único), prefira desativá-lo.
5. Para acompanhar entregas, rejeições e bloqueios, use *Transactional › Logs*.

Não use marketing, campanhas nem automações da Brevo para esses e-mails: eles são só transacionais.

### 3. No Supabase (manual)

1. **SMTP próprio:** em *Authentication › Emails › SMTP Settings* (em versões antigas do painel, *Project Settings › Authentication*), ative *Enable Custom SMTP* e preencha:
   - *Sender email*: o mesmo `BREVO_SENDER_EMAIL`. *Sender name*: `Íntegra`.
   - *Host*, *Port*, *Username* e *Password*: os mesmos `BREVO_SMTP_HOST`, `BREVO_SMTP_PORT`, `BREVO_SMTP_USER` e `BREVO_SMTP_PASSWORD`.

   As credenciais ficam no painel do Supabase, não no código.
2. **Limite de envio:** com SMTP próprio, o Supabase aplica um limite de e-mails por hora. Ajuste em *Authentication › Rate Limits* para o volume esperado. Esse limite vale só para os e-mails que o Supabase envia; os da Íntegra seguem os limites do plano da Brevo.
3. **Templates:** em *Authentication › Emails › Templates*, cole o assunto (`supabase/templates/subjects.json`) e o corpo:
   - *Confirm signup* → `supabase/templates/confirmation.html`
   - *Invite user* → `supabase/templates/invite.html`
   - *Reset password* → `supabase/templates/recovery.html`

   Eles usam o `token_hash` e passam por `/auth/confirm`, que cria a sessão no servidor, e têm o mesmo visual dos e-mails da Íntegra. Os demais templates (*Magic Link*, *Change Email Address*, *Reauthentication*) não são usados pelos fluxos da Íntegra: podem ficar no padrão e, mesmo assim, saem pela Brevo. Depois de mudar `lib/auth/email-templates.ts`, rode `npm run email:templates` e cole de novo (um teste falha se os arquivos ficarem desatualizados).
4. **URLs:** em *Authentication › URL Configuration*, coloque em *Site URL* o mesmo endereço de `NEXT_PUBLIC_SITE_URL` e adicione `<endereço>/auth/confirm` em *Redirect URLs*. Os templates do Supabase usam `{{ .SiteURL }}`.
5. **Validade do link:** é o *Email OTP Expiration* do provedor de e-mail (*Authentication › Providers › Email*, ou *Sign In / Providers* nas versões novas). A tela "Recuperar senha" diz que o link vale por 1 hora, que é o padrão (3600 s); se mudar o valor, ajuste esse texto.

Hoje o cadastro de escritório (`/api/auth/signup`) e os convites criam a conta com o e-mail já confirmado, porque a aprovação do escritório é a porta de entrada. Por isso o template *Confirm signup* só é usado se alguém criar uma conta direto pelo Supabase Auth.

### 4. Como testar

Com as variáveis no `.env.local` e o servidor reiniciado (`npm run dev`):

- **Convite:** em *Configurações › Usuários › Convidar*, convide um e-mail seu. O aviso "Convite enviado." confirma o envio, e o e-mail chega com o nome do escritório. O botão leva a */redefinir-senha?convite=1* ("Boas-vindas à Íntegra"); crie a senha e você entra no painel. No menu do usuário (ainda pendente), *Reenviar convite* manda um link novo. Pelo Admin: *Escritórios › Novo escritório* convida o Sócio, e *Usuários › Criar usuário* convida uma pessoa.
- **Recuperação de senha:** em */recuperar-senha*, informe o e-mail de uma conta. A tela responde igual para e-mails que existem e que não existem; o e-mail chega para quem tem conta. O link abre "Nova senha"; depois de salvar, entre com a senha nova. Um link usado ou vencido volta ao login com o aviso de link inválido.
- **Confirmação de e-mail e e-mails nativos do Supabase:** em *Authentication › Users*, use *Send password recovery* em um usuário de teste (template *Reset password*) ou *Invite user* com um e-mail de teste (template *Invite user*) e confira se o e-mail chega pela Brevo com o visual da Íntegra. Um convite feito pelo painel do Supabase cria só a conta, sem escritório, então apague esse usuário depois. Para ver o *Confirm signup*, crie uma conta de teste pela API do Supabase Auth (`signUp`) com a confirmação de e-mail ativa e apague depois.
- **Falhas:** com uma `BREVO_SMTP_PASSWORD` errada, o convite é criado com o aviso "o e-mail não foi enviado", o reenvio mostra um erro, e o log do servidor traz `[LEXA · e-mail] O SMTP recusou o login…` (sem a senha). Os envios aparecem em *Transactional › Logs* na Brevo.

Os testes automáticos (`npm test`) cobrem configuração, validação de destinatário, deduplicação, nova tentativa, classificação de erros e templates, sem precisar de SMTP.
