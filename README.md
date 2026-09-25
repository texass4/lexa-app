# LEXA

Gestão jurídica para o escritório Almeida & Associados: clientes, processos, prazos e agenda.

```bash
npm run dev
```

Abre em [http://localhost:3000](http://localhost:3000) e redireciona para `/dashboard`.

O LEXA começa vazio — não há dados de demonstração. Tudo o que você cadastra fica salvo no navegador. Os processos são reais: consulte pelo número CNJ em **Novo processo** e ele fica salvo em **Processos**. A consulta ao DataJud roda em `python/datajud.py` e precisa de Python 3 com `requests` (`pip install requests`). Copie `.env.example` para `.env.local`.

**Mapa do código e como alterar:** [ARCHITECTURE.md](./ARCHITECTURE.md)
