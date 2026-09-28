# LEXA

Gestão jurídica para o escritório Almeida & Associados: clientes, processos, prazos e agenda.

```bash
npm run dev
```

Abre em [http://localhost:3000](http://localhost:3000) e redireciona para `/dashboard`.

O LEXA começa vazio — não há dados de demonstração. Tudo o que você cadastra fica salvo no navegador. Os processos são reais: consulte pelo número CNJ em **Novo processo** e ele fica salvo em **Processos**. A consulta roda no próprio servidor do Next (TypeScript) — não precisa de Python. Copie `.env.example` para `.env.local` e rode as migrações de `supabase/migrations/` em ordem.

**Mapa do código e como alterar:** [ARCHITECTURE.md](./ARCHITECTURE.md)
