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
