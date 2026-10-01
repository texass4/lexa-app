# Auditoria completa do MVP — Íntegra

> Data: 01/10/2026 · Branch `claude/keen-ride-8iewki` (commit `0d55191`) · Next.js 16.3.6 / React 19 / Supabase.
> Escopo: **somente análise**. Nenhum código, layout, banco ou funcionalidade foi alterado. Este arquivo é o único artefato.
> Os caminhos de arquivo foram atualizados para a estrutura organizada por módulo (ver `docs/ARQUITETURA.md`).

## Como esta auditoria foi feita (e o que ela NÃO prova)

- Leitura do código (migrations, RLS, rotas `app/api/*`, camada de IA, store, integrações, docs) e execução do app em **build de produção** contra um **Supabase simulado** (mock local com dados de exemplo e com escritório vazio).
- Matriz de responsividade: 13 telas × 8 larguras (320 a 1920 px) = 104 execuções, com detecção de overflow horizontal e alvos de toque; capturas em 390 / 768 / 1280 px.
- `lint`, `typecheck`, `build` e 418 testes unitários passam (verificado na fase anterior).

**Limites declarados (para não vender certeza que não existe):**

1. **RLS e Supabase real não foram exercitados.** A análise de isolamento entre escritórios é por leitura das migrations, não por ataque real. É o item que mais precisa de teste manual/automatizado antes de vender.
2. **Qualidade das respostas de IA não foi avaliada**: não havia chave Gemini/Anthropic. Avaliei custo, limites, contexto e fluxo — não o conteúdo.
3. Mobile foi emulado em Chromium (viewport/toque), não em aparelho real. Modo escuro e telas de Admin não foram revisados visualmente.
4. Nenhuma medição de carga real; as projeções para 10/50/100 escritórios são raciocínio sobre a arquitetura, marcadas como "a medir" quando não comprovadas.

Convenção de severidade: **P0** = não vender sem corrigir · **P1** = corrigir antes/ao iniciar pilotos · **P2** = melhora real, não bloqueia · **P3** = polimento/futuro. Preferência pessoal de design **não** entrou como problema (ver fim da seção 5).

---

## 1. Resumo executivo

A Íntegra tem uma base técnica acima da média para um MVP: isolamento multi-escritório por chave composta + RLS, controle de concorrência otimista, tempo real, IA com medição de custo e limites, política explícita de "não inventar dado" e um design system coerente. O produto cobre o ciclo de um escritório pequeno (clientes → processos → movimentações → prazos → tarefas → agenda → documentos → financeiro) e o diferencial real — **Triagem** de intimações/movimentações com confirmação humana — está bem desenhado.

O que impede chamar de "pronto para vender":

- **Promessas que dependem de configuração externa que não está no repositório**: acompanhamento automático de processos/DJEN depende de um agendador (não há `vercel.json`/cron versionado) e a captura do DJEN vem desligada; WhatsApp (Atendimento) está presa a **um único escritório** via variável de ambiente, mas aparece no menu de todos.
- **Cadastro público sem proteção contra abuso** (sem rate limit, sem CAPTCHA, sem verificação de e-mail).
- **Um furo no modelo de permissões**: valores financeiros aparecem na "Atividade recente" para quem não tem acesso ao Financeiro.
- **Escala**: o app carrega *todas* as linhas de 10+ coleções no início da sessão. Para 1 escritório com poucas centenas de registros é ótimo; vira gargalo em escritórios com histórico grande.
- **Primeira impressão e mobile** têm arestas (cópia técnica "configure `GEMINI_API_KEY`" exibida a usuário final; alvos de toque de 16–20 px; detalhe do processo com ~4.000 px de altura no celular).

**Veredito:** pronto para **pilotos fechados e acompanhados** (2–5 escritórios, com onboarding manual) **depois de resolver os 4 P0**. Ainda **não** está pronto para venda aberta/autoatendimento.

**Contagem:** P0 = 4 · P1 = 12 · P2 = 9 · P3 = 4 (total 29).

## 2. Estado atual

| Área | Estado |
|---|---|
| Autenticação/convites/recuperação | Funcional; e-mail via SMTP genérico (Nodemailer) com dedupe e mensagens seguras |
| Multi-escritório | Sólido por desenho (chave composta `(organization_id, id)`, RLS por módulo) |
| Módulos centrais (Clientes, Processos, Tarefas, Agenda, Documentos, Financeiro) | Completos para MVP |
| Triagem (DJEN + movimentações com IA) | Bom desenho; **depende de cron + chaves + termos** |
| Íntegra IA | Estrutura boa; **desligada sem chave**, copy técnica no estado "não configurada" |
| Atendimento (WhatsApp) | **Single-tenant** (um escritório por env var) |
| Cobrança/planos | Sem gateway; receita "estimada" |
| Notificações | Sino dentro do app; sem lembrete externo |
| Testes | 36 arquivos / 418 testes unitários; 1 de integração; **sem E2E, sem teste de RLS** |

## 3. Pontos fortes (reais)

1. **Isolamento de dados bem pensado**: PK composta com `organization_id`, RLS `organization_id = current_org_id()` + `has_perm('<módulo>.view|edit')`; todas as funções `security definer` com `revoke … grant` explícito.
2. **Concorrência**: `updated_at` como versão otimista (`bump_row_version`) + Realtime por escritório — dois usuários editando não se sobrescrevem em silêncio.
3. **Honestidade de dados**: a UI não fabrica números (receita "estimada" rotulada; Triagem diz "nenhum prazo é criado sem a sua confirmação").
4. **IA com governança**: medição `ai_reserve/ai_finish`, limites por minuto/hora/escritório/plano, cache de 12 h, grounding com fontes, página de privacidade que cita os provedores.
5. **Integrações com política de saída**: monitoramento com backoff; 429 do DataJud pausa a rodada.
6. **Design system consistente** (tokens, tipografia, estados vazios bem escritos, badges semânticos).
7. **Responsividade robusta**: 1 overflow em 104 execuções (3 px em `/processos/p-1` a 1024 px).
8. **Qualidade de engenharia**: build, lint e typecheck limpos; funções puras testadas (dashboard, prazos, triagem, mailer).
9. **Estados vazios de primeiro uso corretos** (clientes, processos, agenda, tarefas, financeiro explicam o próximo passo).

## 4. Problemas críticos (P0)

### P0-1 — Atendimento/WhatsApp só funciona para um escritório
- **Evidência:** `lib/services/whatsapp/instances.ts` associa a instância Z-API a `ZAPI_ORGANIZATION_ID`. O item "Atendimento" aparece no menu de todos os escritórios; nos demais, a tela fica em "WhatsApp não configurado".
- **Impacto:** a promessa de produto não escala para o 2º cliente; cada novo escritório exigiria deploy/variável.
- **Recomendação:** antes de vender, ou (a) esconder o módulo por feature flag/plano até existir instância por escritório, ou (b) modelar instância por organização. Decisão de produto, não só técnica.

### P0-2 — O "acompanhamento automático" depende de um agendador que não está versionado
- **Evidência:** `/api/cron/process-sync` exige `Authorization: Bearer CRON_SECRET` e ser chamada por "agendador da hospedagem"; **não há `vercel.json`** nem workflow no repositório. A captura do DJEN vem **desligada por padrão** (precisa de confirmação de termos e hospedagem no Brasil — `docs/MODULOS.md`).
- **Impacto:** se o cron não for criado, o banner "A Íntegra acompanha N processos" e a Triagem ficam parados sem nenhum aviso ao usuário. É o coração da demo de venda.
- **Recomendação:** versionar a configuração do agendador (ou documentar como checklist de deploy obrigatório), e mostrar no app **"última verificação em …"** / alerta quando passar de X horas sem rodar.

### P0-3 — Cadastro e recuperação de senha públicos sem proteção contra abuso
- **Evidência:** `app/api/auth/signup` e `app/api/auth/recover` são públicos; não encontrei rate limit, CAPTCHA ou verificação de e-mail em `app/api/auth`, `lib/auth` ou `proxy.ts` (rate limit existe só em IA e monitoramento). O signup cria usuário com `email_confirm: true`. O dedupe do `recover` é em memória por instância (não vale entre instâncias serverless).
- **Impacto:** criação em massa de contas/escritórios; uso do `recover` para enviar e-mail em massa (reputação do domínio SMTP, custo); enumeração de e-mails.
- **Recomendação:** se o signup for aberto, rate limit por IP/e-mail (persistente) + CAPTCHA + verificação de e-mail. Se o signup for só por convite nos pilotos, **fechar a rota** até lá.

### P0-4 — Isolamento entre escritórios não é verificado por teste automatizado
- **Evidência:** o desenho de RLS é bom, mas o repositório tem 36 arquivos de teste, 1 de integração, e **nenhum que cria dois escritórios e tenta ler/escrever cruzado**. Aqui o RLS também não pôde ser exercitado (limite 1).
- **Impacto:** num SaaS jurídico, um vazamento entre escritórios é o evento que encerra o negócio. Uma migration futura pode quebrar isso sem alarme.
- **Recomendação:** um teste de RLS contra Supabase local/CI (org A não lê/escreve/deleta nada da org B em todas as tabelas, inclusive Storage e funções RPC) como **portão de release**.

## 5. UX

**Funciona bem**
- Hierarquia clara: título → subtítulo explicativo → ação primária à direita (Clientes, Documentos, Tarefas).
- Triagem: lista curta, cada item com origem, status, "Exige ação" e dois botões; é a tela mais "de produto" do sistema.
- Linguagem humana nos estados vazios ("Agenda livre hoje.", "Tudo em dia").

**Problemas reais**
- **Cópia técnica para usuário final** (P1-5): "Íntegra IA não configurada — Configure `GEMINI_API_KEY` no ambiente do servidor" aparece no painel do dashboard, no painel de IA do processo e como "Ainda não configurada" no banner. Para o advogado isso é ruído e passa imagem de produto incompleto. Deve ser uma mensagem de "recurso indisponível/contate o suporte", e a instrução técnica só para o admin.
- **Quatro pontos de entrada de IA** na mesma tela (botão IA no topo, card "Sua assistente jurídica", painel "Pergunte sobre seu escritório", dock fixo ≥ 1536 px). Não é erro, mas diluem a mensagem (P2-2).
- **Configurações → Acesso**: aparecem **dois campos "Senha atual"** (um ao lado do e-mail, outro no bloco de senha). Confunde (P2-1).
- **Financeiro no começo do mês**: "R$ 0 recebidos · −100% vs. setembro" em vermelho no dia 1 é tecnicamente correto e semanticamente alarmante. Comparar mês parcial com mês fechado induz a erro (P2-5). Texto truncado "0% do p…" no card.
- **Dashboard em escritório vazio** diz "A Íntegra acompanha 0 processos… encontrou 0 movimentações… 0 parcelas" — frase sem informação (P2-2).

**Não tratei como problema (preferência):** tagline "Mais organização. Mais resultados." na sidebar, fundo de imagem da sidebar, escolha de cores, ordem exata dos cards.

## 6. Layout

- **Desktop 1280:** limpo e consistente. Sidebar escura + conteúdo claro; cards com raio/sombra uniformes.
- **Densidade de informação**
  - Clientes: 4 filtros + 6 abas + busca + 3 botões no cabeçalho — denso mas ordenado; aceitável para uso diário.
  - **Detalhe do processo** é a tela mais carregada: cabeçalho, banner "Última movimentação", 3 cards, painel IA, Movimentações, Triagem, Histórico, Prazos, Tarefas, Andamento, Resumo, Partes, Detalhes, Documentos. Há **redundância** ("Próximo prazo" + bloco Prazos + banner). 2.0–2.5 telas no desktop, **~4.090 px no celular** (P1-8).
  - Dashboard: 13 cards; 2.021 px (1280) e 3.677 px (390). Útil no desktop; no celular exige muita rolagem (P2-2).
  - Agenda: 135 elementos interativos a 1280 — esperado numa grade semanal.
- **Arestas pontuais:** faixa de abas de Documentos corta o último rótulo ("Pessoa…") a 1280 (P2-3); número CNJ em monoespaçada quebra em 2 linhas na tabela de Documentos e no cabeçalho do processo (P2-4); no Kanban a "4ª coluna" tracejada aparece cortada (P3-2).

## 7. Responsividade

| Largura | Resultado |
|---|---|
| 320–768 | Sem overflow; navegação inferior no celular funciona |
| 1024 | **3 px de overflow** em `/processos/p-1` (`button.flex.size-8` termina em 1027 px) — P2-8 |
| 1280–1920 | Sem overflow |

- **Alvos de toque (390 px):** checkbox "Concluir tarefa" **18×18 px**; links de lista com 16–20 px de altura (Documentos: 18 alvos pequenos; Dashboard: 11; Detalhe do processo: 7; Financeiro: 5). A recomendação usual é ≥ 40–44 px. Para uso diário no celular, concluir tarefa é a ação mais frequente → **P1-7**.
- **Texto decorativo muito pequeno** (7–9,5 px: iniciais em avatares, "pdf", contadores) — P2-9. Iniciais de responsável como único indicador é pouco legível.
- A barra inferior é `fixed`; nas capturas de página inteira ela "flutua" no meio — é artefato da captura, **não** defeito.

## 8. Funcionalidades (por tela)

| Tela | Funciona | Ruim/confuso | Falta | Exagero | Simplificar |
|---|---|---|---|---|---|
| **Dashboard** | Dados reais; "Prazos da semana"; "Cobranças em atraso" | Copy de IA técnica; 4 entradas de IA | Checklist de primeiro uso | 13 cards no celular | Reduzir cards no mobile |
| **Clientes** | Tabela, filtros, importação CSV, estados vazios | Muitos filtros simultâneos | — | — | Esconder filtros avançados atrás de "Filtros" |
| **Processos** | Lista + CNJ + status | — | — | — | — |
| **Detalhe do processo** | Linha do tempo, prazos, tarefas, docs, IA | Muito longo; informação repetida | Âncoras/abas | 14 blocos | Abas (Resumo/Andamento/Prazos/Docs) |
| **Tarefas** | Kanban + lista, "Minhas/Escritório" | Checkbox pequeno no celular | — | — | — |
| **Agenda** | Grade semanal, compromissos | — | — | — | — |
| **Documentos** | Upload ligado a cliente/processo | Abas cortadas; CNJ em 2 linhas | IA lendo documentos (roadmap) | — | — |
| **Financeiro** | Parcelas, atraso, CSV, receita por área | −100% no início do mês | Gateway/cobrança real | — | — |
| **Atendimento** | Inbox WhatsApp (quando configurado) | Single-tenant (P0-1) | Multi-escritório | — | Esconder sem config |
| **Triagem** | Fila priorizada, revisão humana | Depende de cron/DJEN (P0-2) | Aviso "última verificação" | — | — |
| **Configurações** | Perfil, OAB, equipe, permissões, integrações, tema | Dois "Senha atual" | — | — | Separar e-mail e senha |

## 9. Fluxos de usuário

Fluxo alvo: **Cliente → Atendimento → Processo → Movimentação → Triagem → Prazo → Tarefa → Responsável → Agenda → Histórico**.

- Cliente → Processo → Tarefa/Prazo/Documento: **ligados por vínculo** (cada documento "fica ligado ao cliente e ao processo"). Bom.
- Movimentação → Triagem → Prazo: **o melhor fluxo do produto** (intimação interpretada, "Confirmar prazo", prazo vira registro). Frágil só pela dependência do cron (P0-2).
- Prazo → Tarefa → Responsável → Agenda: funciona; o prazo aparece no dashboard e na agenda.
- **Atendimento → Cliente/Processo:** só existe para o escritório com instância (P0-1).
- **Histórico:** "Atividade recente" existe, mas mostra valores financeiros a quem não deveria (P1-1) e não tem retenção (P1-3).

## 10. IA

**Valor:** o uso com melhor retorno é **Triagem** (interpreta intimação, sugere prazo, exige confirmação) e "Pergunte sobre seu escritório" com fontes. Não recomendo colocar IA em mais módulos.

**Controles (pontos fortes):** medição por chamada, limites 8/min e 60/h por usuário, 200/h por escritório, teto mensal por plano, cache 12 h, grounding.

**Problemas**
- **WhatsApp IA fora de toda governança (P1-2):** `app/api/whatsapp/ai` exige só `whatsapp.view`; sem medição, limite ou cache; modelo **fixo** `"claude-opus-5"` no código; até 150 mensagens + 4 arquivos de contexto; `maxDuration = 300`. É o maior risco de custo descontrolado e de cobrança de um provedor diferente do declarado em contrato de plano.
- **Estado "não configurada"** com nome de variável de ambiente (P1-5).
- **Chamadas duplicadas:** `/api/ai/status` é buscado **uma vez por sessão** (cache em módulo) — ok; mas custa ~1 s no carregamento frio observado (P3-4). Não achei chamadas duplicadas ao modelo.
- **Contexto:** a IA não lê documentos (declarado em `docs/MODULOS.md`); é limitação aceitável para MVP, não defeito (P3-3).
- **Custo projetado:** o limite de 200/h por escritório protege; sem o limite no WhatsApp, o custo ali é ilimitado.

## 11. Arquitetura

- **Modelo de dados:** cada coleção é uma tabela `(organization_id, id, data jsonb, created_at, updated_at)`. Flexível e rápido de evoluir; troca-se segurança de forma por velocidade.
  - Consequência: **o servidor não valida a forma do `jsonb`** — o cliente escreve diretamente (P2-6). RLS protege *quem* escreve, não *o quê*.
- **Store em cliente:** carrega tudo no início, escreve por diff, Realtime por escritório. Simples e muito responsivo — **enquanto os volumes são pequenos** (ver 12).
- **`proxy.ts` chama `supabase.auth.getUser()` em toda requisição** (nos logs 176–531 ms por request): é segurança correta, mas é latência em toda navegação.
- **Operação:** cron externo não versionado (P0-2); sem gateway de cobrança (P1-4).
- **Manutenibilidade:** `lib/store/office-store.tsx` tem ~1.215 linhas concentrando regras (inclusive o texto das atividades financeiras). Funciona, mas é o arquivo de maior risco de regressão.

## 12. Performance

Medido: 3,8 MB de chunks estáticos; maior chunk 113 KB gzip; recharts carregado sob demanda; `/api/ai/status` ~1 s em carga fria no dashboard.

Projeção (raciocínio, **a medir**):

| Escritórios | Expectativa |
|---|---|
| 10 | Sem problema perceptível |
| 50 | Primeiro sintoma: início de sessão para quem tem histórico grande (carrega *todas* as linhas, em páginas de 1.000); `activities`/`notifications` crescem sem retenção (P1-3). Políticas RLS chamam `current_org_id()`/`has_perm()` por linha, sem `(select …)` — custo provável em tabelas grandes (P1-11) |
| 100 | DataJud com **chave compartilhada**: um 429 pausa o monitoramento de todos (P1-6); Realtime com um canal por escritório; cron único passa a ser gargalo (precisa de fila/paginação por escritório) |

Dashboard mobile: 3.677 px de altura; renderiza tudo de uma vez.

## 13. Segurança

**Verificado e bom:** rotas de admin → `requireAdmin`; IA → `aiRoute`; equipe/me → `requireMember`; WhatsApp → `requireActor`; webhook/cron → segredo; funções `security definer` com `revoke/grant` explícitos; limites de tamanho de upload (25 MB documentos, 64 MB WhatsApp, 5 MB CSV); `profiles_update_self` restrito a campos do próprio perfil.

**Pontos de atenção**
- **P0-3** signup/recover sem rate limit/CAPTCHA/verificação.
- **P1-1** `activities` e `notifications` têm RLS só por `organization_id` (sem permissão de módulo). Pagamentos gravam `detail: "… · R$ <valor> · pago em …"` e o dashboard mostra `activities.slice(0, 7)` **sem filtrar por permissão** → quem não tem `finance.view` (ex.: papel `staff` padrão) vê valores recebidos.
- **P1-6** `/api/processes/search` e `/[id]/sync` exigem `processes.edit` mas não têm limite por usuário/escritório.
- **P2-7** Bucket `documents` sem restrição de MIME; `contentType` vem do cliente.
- **P3-1** Rotas de membro não verificam `Origin` (só admin e `auth/events` usam `assertSameOrigin`); o cookie `SameSite=Lax` mitiga, risco baixo.
- Avatares em bucket público: aceitável, mas anotar.

## 14. Experiência de venda

Demo de 60 s sugerida (com o produto atual, depois dos P0):
1. **0–10 s** Painel: "Boa noite, Helena" + prazos da semana + cobranças em atraso (dados reais).
2. **10–25 s** Triagem: intimação do DJEN com prazo sugerido → "Confirmar prazo" → prazo no painel.
3. **25–40 s** Processo: linha do tempo + "Pergunte sobre o processo" com fontes.
4. **40–55 s** Tarefas/Agenda: tarefa criada a partir do prazo, atribuída.
5. **55–60 s** Financeiro: cobrança em atraso, exportar CSV.

**Momentos de valor:** Triagem e a pergunta com fontes. **Momentos que enfraquecem a demo:** "IA não configurada", Atendimento vazio, KPIs em zero, "−100%" no início do mês. Para demonstrar, é preciso um escritório de exemplo populado e chaves configuradas.

## 15. Primeiro acesso

Fluxo: login → dashboard → criar cliente → processo → tarefa → abrir processo → movimentações → prazo → IA → dashboard.

- O dashboard vazio é correto e honesto, mas **8 painéis vazios** + KPIs 0 + banner "acompanha 0 processos" dão sensação de sistema parado. **Não há checklist de primeiros passos** (P1-10).
- O melhor primeiro passo (consultar processo pelo CNJ) existe, mas só aparece como texto dentro de um painel vazio.
- "Importar" clientes (CSV) existe e é ótimo para migração — merece destaque no primeiro acesso.
- A IA, no primeiro acesso, aparece como "não configurada" (P1-5).

## 16. P0 — corrigir antes de vender

| ID | Problema |
|---|---|
| P0-1 | Atendimento/WhatsApp single-office exposto a todos |
| P0-2 | Monitoramento/DJEN dependem de cron não versionado; sem indicador de "última verificação" |
| P0-3 | Signup/recover públicos sem rate limit/CAPTCHA/verificação de e-mail |
| P0-4 | Sem teste automatizado de isolamento entre escritórios (RLS) |

## 17. P1 — antes/ao iniciar pilotos

| ID | Problema |
|---|---|
| P1-1 | Atividade recente/notificações expõem valores financeiros sem checar permissão |
| P1-2 | IA do WhatsApp sem medição/limite, modelo fixo, contexto grande |
| P1-3 | Store carrega tudo; `activities`/`notifications` sem retenção |
| P1-4 | Sem gateway/plano de cobrança (receita "estimada") |
| P1-5 | Copy técnica "configure `GEMINI_API_KEY`" para usuário final |
| P1-6 | DataJud com chave compartilhada e sem throttle por usuário/escritório |
| P1-7 | Alvos de toque pequenos no celular (checkbox 18 px, links 16–20 px) |
| P1-8 | Detalhe do processo longo e redundante (~4.090 px no celular) |
| P1-9 | Sem E2E dos fluxos críticos (login, criar cliente/processo/tarefa, convite) |
| P1-10 | Sem checklist/onboarding de primeiro acesso |
| P1-11 | Políticas RLS chamam funções por linha (medir; embrulhar em `(select …)`) |
| P1-12 | Sem lembrete de prazo fora do app (e-mail/push) — expectativa central em escritório jurídico |

## 18. P2

| ID | Problema |
|---|---|
| P2-1 | Dois campos "Senha atual" duplicados em Configurações → Acesso |
| P2-2 | Dashboard com 13 cards no mobile; 4 entradas de IA; frases "0 processos… 0 movimentações" |
| P2-3 | Abas de Documentos cortadas a 1280; texto truncado "0% do p…" no Financeiro |
| P2-4 | Número CNJ quebra em duas linhas (tabela de Documentos, cabeçalho do processo) |
| P2-5 | "−100% vs. setembro" no início do mês (mês parcial vs mês fechado) |
| P2-6 | `jsonb` gravado pelo cliente sem validação de forma no servidor |
| P2-7 | Storage de documentos sem restrição de MIME; `contentType` do cliente |
| P2-8 | 3 px de overflow a 1024 px no detalhe do processo |
| P2-9 | Texto decorativo de 7–9,5 px (iniciais de avatar, "pdf", contadores) |

## 19. P3

| ID | Problema |
|---|---|
| P3-1 | Rotas de membro sem verificação de `Origin` (mitigado por `SameSite=Lax`) |
| P3-2 | Kanban: "4ª coluna" tracejada aparece cortada |
| P3-3 | IA não lê documentos (roadmap, não defeito) |
| P3-4 | `/api/ai/status` em carga fria (~1 s) |

## 20. Roadmap sugerido

**Semana 1–2 (portão de pilotos):** P0-1…P0-4; P1-5 (copy); P1-1 (filtrar atividade por permissão); P2-1.
**Semana 3–4 (pilotos):** P1-2, P1-6 (limites), P1-7 (alvos de toque), P1-10 (primeiros passos), P1-12 (lembrete por e-mail), P1-9 (E2E mínimo).
**Mês 2:** P1-3/P1-11 (retenção + medir RLS), P1-8 (abas no processo), P1-4 (cobrança), P2-*.
**Depois:** P3, documentos na IA, notificações ricas.

## 21. Checklist de MVP

- [ ] Cron do monitoramento versionado/documentado e visível no app
- [ ] Teste de RLS entre dois escritórios no CI
- [ ] Signup protegido ou fechado
- [ ] Atendimento oculto ou multi-escritório
- [ ] Atividade/notificações respeitam permissão
- [ ] IA do WhatsApp sob medição/limites
- [ ] Copy de IA sem jargão técnico
- [ ] Escritório de demonstração populado
- [ ] Alvos de toque ≥ 40 px nas ações frequentes
- [ ] Plano de cobrança (manual ok para pilotos)
- [x] Build, lint, typecheck, testes unitários verdes
- [x] Estados vazios de primeiro uso
- [x] Isolamento por desenho (RLS) e concorrência otimista

## 22. Veredito técnico

Base sólida e acima da média para MVP: modelo multi-tenant correto, concorrência tratada, IA com governança, integrações com backoff. Os riscos são de **operação** (cron, cobrança), **abuso** (cadastro público), **verificação** (sem teste de RLS) e **escala futura** (store que carrega tudo, retenção, RLS por linha). Nenhum exige reescrever a arquitetura; todos têm correção localizada.

## 23. Veredito de UX

Visual coerente e profissional; linguagem humana; Triagem é muito boa. As fraquezas são **cópia técnica exposta**, **densidade do detalhe do processo**, **toque em celular** e **primeira sessão sem guia**. Nada disso exige redesenho — são ajustes de conteúdo e hierarquia.

## 24. Veredito de produto

| | |
|---|---|
| **Pronto** | Cadastros e vínculos (cliente/processo/tarefa/agenda/documento/financeiro), permissões por módulo, tema, importação de clientes, Triagem (lógica e UI) |
| **Parcialmente pronto** | Monitoramento/DJEN (depende de cron/termos), Íntegra IA (depende de chave; copy), Atendimento (1 escritório), responsividade (alvos de toque) |
| **Risco** | Cadastro público, vazamento financeiro via atividade, IA do WhatsApp sem limite, ausência de teste de RLS, escala do store |
| **Corrigir já** | P0-1…P0-4 |
| **Pode esperar** | Documentos na IA, gateway automático, notificações ricas, refinamentos visuais |

---

## Matriz final

| Área | Estado | Severidade | Problema | Recomendação |
|---|---|---|---|---|
| UX | Bom | P1 | Copy técnica de IA; sem guia de primeiro uso; Senha atual duplicada | Mensagem para usuário final; checklist inicial; separar e-mail/senha |
| Layout | Bom | P1 | Detalhe do processo longo/redundante | Abas por tema; remover repetição de prazo |
| Responsividade | Bom, com falhas | P1 | Alvos de toque 16–20 px; overflow 3 px a 1024 | Aumentar área de toque; corrigir botão `size-8` |
| Funcionalidade | Parcial | P0 | Atendimento single-office; cron não versionado | Ocultar/multi-tenant; versionar agendador + "última verificação" |
| Arquitetura | Sólida | P1 | Store carrega tudo; `jsonb` sem validação; sem retenção | Retenção; paginação por módulo; validação de forma no servidor |
| Performance | Boa em pequena escala | P1 | RLS por linha; DataJud compartilhado; proxy com `getUser` em toda request | Medir com 50k linhas; `(select …)` em RLS; throttle por escritório |
| Segurança | Boa base | P0 | Signup/recover sem proteção; atividade expõe valores; sem teste de RLS | Rate limit/CAPTCHA; filtrar por permissão; testes de isolamento |
| IA | Boa no núcleo | P1 | IA do WhatsApp fora de limites, modelo fixo | Passar por `ai_reserve/ai_finish`, parametrizar modelo |
| Venda | Parcial | P1 | Demo depende de chaves/cron/dados; sem cobrança | Escritório demo; cobrança manual nos pilotos |

## TOP 10 alterações que mais aumentariam a qualidade percebida

1. Trocar a copy "Configure `GEMINI_API_KEY`" por mensagem de usuário final (e ocultar o painel se IA indisponível).
2. Checklist de primeiros passos no dashboard vazio (importar clientes, consultar processo por CNJ, convidar equipe).
3. Abas no detalhe do processo para reduzir a rolagem e a repetição.
4. Alvos de toque ≥ 40 px (checkbox de tarefa, links de lista) no celular.
5. Indicador "Última verificação do monitoramento: há X" no painel/Triagem.
6. Reduzir a 1 a 2 entradas de IA no dashboard.
7. Corrigir "−100%" do início do mês (comparar período equivalente ou rotular "mês em andamento").
8. Corrigir campos "Senha atual" duplicados em Configurações.
9. Ocultar "Atendimento" quando não configurado para o escritório.
10. Corrigir abas cortadas de Documentos e quebra do número CNJ.

## TOP 10 alterações que mais reduziriam risco técnico

1. Teste automatizado de isolamento entre escritórios (RLS, Storage, RPC) como portão de release.
2. Rate limit persistente + CAPTCHA + verificação de e-mail no signup/recover (ou fechar o signup).
3. Versionar o agendador (cron) e alertar quando não rodar.
4. Filtrar `activities`/`notifications` por permissão do módulo (RLS ou na camada de leitura).
5. Colocar a IA do WhatsApp sob medição/limites e parametrizar o modelo.
6. Retenção para `activities`/`notifications` e estratégia de carga por módulo (não carregar tudo).
7. Medir e otimizar RLS (`(select current_org_id())`) com massa de dados.
8. Throttle por usuário/escritório e fila para DataJud (chave compartilhada).
9. Validação de forma do `jsonb` no servidor para as coleções críticas.
10. Pelo menos um E2E (login → criar cliente → processo → tarefa → convite) no CI.
