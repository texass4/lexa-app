# Consulta processual ("Consultar processo")

Workflow que reúne o que as fontes oficiais informam sobre um processo e apresenta um
relatório único, com a fonte, a data da consulta e onde verificar cada informação. O que
nenhuma fonte trouxe aparece como **"Não disponível na fonte consultada"** — nada é
completado, presumido ou inventado.

- Entrada: **Processos › Consultar processo** (número CNJ ou processo do cadastro), o menu
  de cada linha da lista, o menu "…" do processo e o botão **Consultar** do painel
  "Andamento".
- Página: `/processos/consulta?execucao=<id>` (acompanha as etapas e mostra o relatório).
- Código: `lib/services/consulta/*` (workflow, relatório, magistrado, serviço, fontes,
  persistência), `lib/integrations/legal/djen/*` (comunicações), `components/processos/consulta/*`.
- Banco: `supabase/migrations/0020_consulta_processual.sql` (tabela `process_enrichment_runs`).
- Testes: `lib/services/consulta/consulta.test.ts`, `lib/integrations/legal/djen/djen.test.ts`,
  `lib/ai/services/enrichment.test.ts`, `supabase/tests/consulta_processual.sql`.

## Etapas (estado visível na tela)

1. **Validar** o número (20 dígitos + dígito verificador do CNJ).
2. **Fonte principal** (DataJud).
3. **Normalizar** (ficha da Íntegra: sem formato bruto da fonte).
4. **Complementares** em paralelo, cada uma com prazo próprio: comunicações (DJEN) e
   jurisprudência relacionada.
5. **Magistrado e órgão julgador** (regras abaixo).
6. **Consolidar** movimentações, divergências entre fontes e comparação com o cadastro.
7. **Registrar** fontes, horários, duração, estado de cada fonte e campos encontrados.
8. **Relatório**: concluído, parcial (alguma fonte falhou) ou falhou (nenhuma trouxe dados).

Execução no servidor: a rota responde na hora com o id da execução e o trabalho segue em
segundo plano (`after` do Next, `maxDuration` 120 s); a tela relê a execução a cada 1–2,5 s.
Uma fonte fora do ar não derruba as outras.

| Proteção | Como |
|---|---|
| Timeout | DataJud: 35 s por tentativa, 60 s no total (cliente) + 70 s no workflow; complementares: 20 s por tentativa, 30 s no workflow |
| Retry/backoff | 3 tentativas só para falhas passageiras, espera exponencial; `Retry-After` respeitado; 429 para na hora |
| Cache | DataJud: cache do escritório (6 h; "Consultar novamente" aceita até 1 min). DJEN: 1 h por escritório + número. Consulta concluída há < 10 min é reaproveitada (a menos que se peça "Consultar novamente") |
| Deduplicação | Uma execução em andamento por escritório + número (índice único no banco); pedidos repetidos voltam a mesma. Chamadas simultâneas à mesma fonte viram uma |
| Limite | 20 consultas novas por pessoa a cada 10 min e 300 por escritório por dia (`auth_rate_hit`) |
| Execução esquecida | "Rodando" há mais de 5 min vira "falhou" e libera nova consulta |

## Fontes

### 1. DataJud — API Pública (CNJ) · **integrada** (já existia; reutilizada)

| | |
|---|---|
| O que é | Índice público de metadados processuais que os tribunais enviam ao CNJ |
| Cobertura | Tribunais com índice `api_publica_<sigla>`: STJ, TST, TSE, STM, TRF1–6, TRT1–24, os 27 TJs (`lib/integrations/legal/datajud/tribunals.ts`) |
| Campos | número, tribunal, grau, sistema, formato, classe, **assuntos**, órgão julgador (nome, código, município IBGE), data de ajuizamento, última atualização, nível de sigilo, movimentações (data, código TPU, complementos, órgão) |
| Não traz | partes e advogados, **magistrado**, valor da causa, prioridades, documentos/autos |
| Limitações | atualização em lotes pelos tribunais (atraso de dias); processos sigilosos podem não aparecer; sob carga responde 200 sem resultados (tratado como falha passageira) |
| Custo | gratuita |
| Uso comercial | sujeito aos termos publicados pelo CNJ na documentação do DataJud — confirme antes de produção |
| Configuração | `DATAJUD_API_KEY` (chave pública divulgada pelo CNJ); Admin › Configurações › "Consulta automática ao DataJud" |
| Verificar | link para o site oficial do tribunal (a API não tem página por processo) |

### 2. Comunicações processuais — DJEN / Comunica (CNJ) · **implementada, desligada por padrão**

| | |
|---|---|
| O que é | API pública do Diário de Justiça Eletrônico Nacional (`comunicaapi.pje.jus.br`), consulta por número do processo |
| Campos | data de disponibilização, tribunal, órgão, tipo de comunicação e de documento, classe, teor (só para ler menções; o relatório guarda um trecho de 280 caracteres), link do documento/certidão oficial, destinatários (nome e polo, como publicados), advogados (nome, OAB, UF) |
| Uso no relatório | partes e representantes **como publicados**; menções a magistrados com o papel escrito no texto; divergência de órgão/classe com o DataJud |
| Limitações | só processos com comunicações publicadas; **bloqueia acesso de fora do Brasil (HTTP 403)** — o servidor precisa rodar no Brasil; limite por IP; o CNJ **não publica termos de uso comercial** |
| Custo | gratuita, sem chave |
| Uso comercial | **não confirmado** — por isso fica desligada (`DJEN_CONSULTA_ENABLED`) até o escritório confirmar com o CNJ |
| Estado da validação | testada com respostas no formato documentado (testes automatizados). **Não validada ao vivo neste ambiente de desenvolvimento** (rede bloqueada para o domínio). Valide ligando a variável num servidor no Brasil |
| Configuração | `DJEN_CONSULTA_ENABLED=true` (padrão desligado); opcional `DJEN_BASE_URL` |

### 3. Base de jurisprudência da Íntegra (STJ — Dados Abertos) · **integrada** (já existia)

Pesquisa local (sem rede externa) por assunto, classe e tipo de ação; ver
`docs/JURISPRUDENCIA.md`. Só roda com `JURISPRUDENCIA_FONTES` configurada.

### 4. Cadastro do escritório · **interna**

Mostrado e comparado com as fontes públicas, **nunca alterado pela consulta**.

### 5. Site oficial do tribunal · **link (sem consulta automática)**

Nome, segmento de Justiça e site oficial (`https://www.<sigla>.jus.br`) derivados da estrutura
do número CNJ (Resolução CNJ 65/2008), sem rede. A consulta pública do tribunal é feita pela
pessoa — pode pedir CAPTCHA, e a Íntegra não acessa por ela.

### Não integradas (e por quê)

| Fonte | Motivo |
|---|---|
| Páginas de consulta pública dos tribunais (PJe, eproc, e-SAJ…) | exigem interação/CAPTCHA; automatizar seria scraping — não permitido |
| Perfil institucional de magistrados | não há API oficial; os tribunais publicam em páginas próprias, sem padrão |
| Provedores privados (Escavador, Judit, Codilo…) | pagos, exigem contrato; a interface `ProcessProvider` já permite plugar um quando houver autorização |

## Magistrado — regras

- O DataJud **não** informa magistrado. O nome do órgão julgador **nunca** vira nome de juiz.
- Só conta um nome com o papel escrito ao lado, no texto de uma comunicação oficial
  ("Relator(a): Des. …", "…, Juiz(a) de Direito", "… Juíza Federal"). Assinatura
  "assinado eletronicamente por X" sem papel de magistrado não conta (costuma ser servidor).
- Papéis distintos: relator, juiz, desembargador, ministro.
- A tela mostra cada nome como **menção datada, com o trecho e o link da publicação** — e diz
  que isso **não confirma o magistrado responsável atual**.

## Segredo de justiça e sigilo

- Processo do cadastro marcado em segredo de justiça: as fontes públicas **não são
  consultadas**, o cadastro fica como está e "Atualizar processo" não aparece.
- Sigilo informado pela fonte (nível > 0): partes não são exibidas.

## Cadastro do escritório

O relatório compara o cadastro com as fontes (tribunal, grau, órgão, classe) e mostra o que
diverge **sem aplicar**. "Atualizar processo com a consulta" é uma ação explícita: acrescenta
movimentações novas e segue a regra de `mergeProcessSheet` — em cadastro manual, o que o
escritório preencheu prevalece e a fonte só completa o vazio. Número que não está no cadastro:
"Cadastrar processo" abre o formulário com o número.

## Persistência e segurança

- `process_enrichment_runs` (migração 0020): execução, processo, número, quem pediu, estado,
  início/fim/duração, etapas, fontes (estado, horários, cache, campos, versão dos dados),
  relatório normalizado, campos encontrados/ausentes, versão dos dados da fonte principal.
- RLS: lê quem é do escritório com `processes.view`. **Ninguém grava pela API** (só o servidor,
  com service role e `organization_id` explícito).
- `internal_errors` (detalhe técnico) fica fora do GRANT: a API não lê. A tela recebe estado e
  mensagem pública.
- Retenção: sem JSON bruto das fontes; trecho curto das comunicações; as 10 execuções mais
  recentes por processo.
- Chaves só no servidor (`DATAJUD_API_KEY` sem `NEXT_PUBLIC_`).

## Resumir com a Íntegra

Sob demanda, sobre o relatório já gravado (nenhuma fonte nova). A resposta separa **fatos
confirmados** (cada um com a referência da fonte — Q1, Q2… — ou sai), **inferências** e
**informações ausentes** (estas vêm do relatório, não do modelo). Instrução explícita: nunca
dizer que alguém é o juiz responsável atual nem deduzir o juiz pelo órgão julgador.
