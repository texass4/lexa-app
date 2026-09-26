# LEXA

Gestão jurídica para o escritório Almeida & Associados: clientes, processos, prazos e agenda.

```bash
npm run dev
```

Abre em [http://localhost:3000](http://localhost:3000) e redireciona para `/dashboard`.

O LEXA começa vazio — não há dados de demonstração. Tudo o que você cadastra fica salvo no navegador. Os processos são reais: consulte pelo número CNJ em **Novo processo** e ele fica salvo em **Processos**. A consulta ao DataJud roda em `python/datajud.py` e precisa de Python 3 com `requests` (`pip install requests`). Copie `.env.example` para `.env.local`.

**Mapa do código e como alterar:** [ARCHITECTURE.md](./ARCHITECTURE.md)

## LEXA IA (Gemini)

Camada de inteligência sobre os dados reais do escritório: resumo e próximos passos do processo, análise de movimentação, panorama do cliente e do escritório e um chat por contexto. A IA só lê o que a pessoa já pode ver, sempre do próprio escritório, e nunca grava nada — sugestões de tarefa abrem o formulário normal para você confirmar.

1. **Crie uma chave** da Gemini API em [Google AI Studio](https://aistudio.google.com/apikey).
2. **Configure o `.env.local`** (a chave fica só no servidor):
   ```bash
   GEMINI_API_KEY=sua-chave
   GEMINI_MODEL=gemini-2.5-flash   # opcional; qualquer modelo Flash disponível na sua conta
   AI_ENABLED=true                 # false desliga a LEXA IA
   ```
3. **Instale as dependências** (`@google/genai` já está no `package.json`): `npm install`.
4. **Rode a aplicação**: `npm run dev`.
5. **Abra um processo** em **Processos** (de preferência um consultado pelo DataJud, com movimentações).
6. **Use a LEXA IA**: no card *LEXA IA* do processo, clique em **Resumir processo**, **Verificar próximos passos** ou **Perguntar à LEXA**; em uma movimentação da timeline, use **Analisar com LEXA IA**. No cliente, **Resumo do cliente**; no Painel, **Panorama do escritório**.

Sem `GEMINI_API_KEY`, as áreas da IA mostram *"LEXA IA não configurada"*. Detalhes de arquitetura, segurança e custo: [ARCHITECTURE.md › LEXA IA](./ARCHITECTURE.md#9-lexa-ia).
