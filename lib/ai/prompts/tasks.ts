/**
 * Instruções de cada funcionalidade. O formato de saída é garantido pelo
 * schema (JSON estruturado); aqui fica o que cada campo deve conter.
 */

export const PROCESS_SUMMARY_TASK = `Resuma o processo para o advogado responsável.
- "resumo": do que se trata o processo, em 2 a 4 frases, só com o que os dados mostram.
- "situacao": estado atual segundo a movimentação mais recente registrada, com a data dela.
- "fatos_relevantes": fatos objetivos registrados (sem interpretação).
- "movimentacoes_relevantes": até 6 movimentações importantes, cada uma com a referência "ref" (ex.: "M2") e um comentário curto.
- "pontos_atencao": o que merece atenção, com "natureza" = "fato", "inferencia" ou "verificacao" e as referências que o sustentam.
- "proximas_acoes": sugestões de verificação ou organização, redigidas como sugestão.
- "informacoes_ausentes": o que faltaria para uma análise completa (ex.: teor das decisões, prazo).
- "nivel_confianca": "alto" só se os dados forem suficientes e claros; "baixo" se forem escassos.`

export const MOVEMENT_ANALYSIS_TASK = `Explique a movimentação indicada em "movimentacao_analisada" para o advogado.
- "o_que_aconteceu": explicação clara do ato registrado, considerando o nome do movimento E seus complementos. Pode usar conhecimento geral para explicar o que esse tipo de ato costuma significar, deixando claro que é explicação geral.
- "o_que_o_registro_informa": apenas o que está literalmente no registro (nome, data, complementos, órgão).
- "o_que_nao_e_possivel_concluir": limites do registro (ex.: destino de uma remessa, teor de uma decisão, prazo).
- "pontos_atencao": pontos que podem merecer verificação, como possibilidade.
- "sugestoes_tarefa": no máximo UMA tarefa sugerida, apenas se fizer sentido; lista vazia caso contrário. Sem datas inventadas.
- "nivel_confianca": quão bem os dados permitem explicar o ato.`

export const NEXT_ACTIONS_TASK = `Identifique pontos de atenção e sugira próximos passos para o processo.
Considere: movimentações recentes, tempo sem movimentação ("dias_desde_a_ultima_movimentacao"), tarefas atrasadas ou pendentes, compromissos próximos e informações que merecem verificação.
- "pontos_atencao": com "natureza" e referências.
- "sugestoes": até 4 tarefas que o advogado PODE querer criar. "titulo" curto e acionável (até 80 caracteres); "descricao" com o que verificar; "prioridade" = "alta", "media" ou "baixa"; "justificativa" baseada nos dados; "refs" com as fontes. Não repita tarefas que já existem em "tarefas_do_processo". Não inclua datas de prazo que não estejam nos dados.
- "informacoes_ausentes": o que falta para sugerir com mais segurança.`

export const CLIENT_SUMMARY_TASK = `Gere um panorama do cliente para o escritório.
- "resumo": relação do cliente com o escritório e visão geral dos casos, em 2 a 4 frases.
- "processos": para cada processo relevante, "ref" (ex.: "P1") e um comentário curto sobre a situação.
- "pontos_atencao": com "natureza" e referências (processos parados, tarefas atrasadas, valores em atraso, compromissos próximos).
- "atividades_recentes": o que aconteceu recentemente, segundo os registros.
- "pendencias": tarefas, documentos ou valores pendentes registrados.
- "proximas_acoes": sugestões, redigidas como sugestão.
- "informacoes_ausentes" e "nivel_confianca".`

export const OFFICE_OVERVIEW_TASK = `Gere um panorama do escritório para os sócios.
Os números em "metricas_calculadas_pelo_lexa" vieram do banco e estão corretos: use-os exatamente, sem recalcular nem arredondar de outra forma.
- "visao_geral": 2 a 4 frases com a situação geral.
- "pontos_atencao": com "natureza" e referências.
- "processos_para_analise": até 6 processos que merecem análise, com "ref" e o motivo.
- "pendencias": pendências registradas.
- "tarefas_atrasadas": resumo das tarefas atrasadas (ou que não há, se o número for zero; ou que não há acesso).
- "situacao_financeira": resumo com os valores das métricas (ou que não há acesso ao financeiro).
- "sugestoes_organizacao": sugestões práticas de organização.
- "perguntas_para_verificar": perguntas que o advogado deveria se fazer ao revisar os dados.`

export const FINANCE_ANALYSIS_TASK = `Interprete o financeiro do escritório para os sócios, em linguagem direta.
Os números em "metricas_calculadas_pelo_lexa" e nas listas vieram das faturas registradas e estão corretos: use-os exatamente. Não calcule percentuais, médias, projeções ou totais que não estejam nos dados, e não invente valores, clientes ou datas.
"recebido_no_mesmo_periodo_do_mes_anterior" é a base justa de comparação com o mês atual (mesmo número de dias); nunca compare o mês atual, incompleto, com o mês anterior inteiro.
- "leitura": 2 a 4 frases: como está o recebimento do mês, o que está em atraso e o que entra nos próximos 30 dias.
- "pontos_atencao": o que merece ação (atrasos concentrados, atrasos antigos, vencimentos próximos relevantes), com "natureza" e as referências dos clientes (ex.: C1).
- "sugestoes": próximos passos práticos (quem cobrar primeiro e por quê, o que conferir). São sugestões: nada é feito sem o advogado.
- "perguntas_para_verificar": o que conferir antes de agir (ex.: pagamento recebido e ainda não registrado).
Se não houver atraso nem vencimento próximo, diga isso com clareza, sem criar preocupação.`

export const JURISPRUDENCE_ANALYSIS_TASK = `Interprete para o advogado a decisão em "decisao" (ref J1). A decisão veio da fonte oficial indicada em "fonte"; você NÃO é a fonte.
- Use somente o que está em "decisao" (e em "processo_do_escritorio", quando houver). Não invente decisões, números de processo, tribunais, relatores, datas, citações, teses nem resultados.
- A regra de não citar jurisprudência, súmulas ou leis continua valendo para o seu conhecimento próprio: em "fundamentos_mencionados" entram APENAS dispositivos, súmulas e precedentes que aparecem escritos no texto da decisão, como estão escritos.
- "resumo": 2 a 4 frases sobre o que foi decidido.
- "tese_principal": a tese como está na ementa ou na tese jurídica; se não houver, deixe vazio e registre em "informacoes_ausentes".
- "resultado": o resultado do julgamento (ex.: provido, não provido, conhecido em parte) só se constar do texto; senão, vazio.
- "pontos_relevantes": pontos da própria decisão.
- "relevancia_para_pesquisa": por que a decisão se relaciona (ou não) com "pesquisa_do_advogado"; sem pesquisa, por que ela pode ser útil, em termos gerais.
- "comparacao_com_processo": só se houver "processo_do_escritorio": semelhanças e diferenças com base nos dados dos dois, como possibilidade; sem processo, deixe vazio.
- "informacoes_ausentes": o que a decisão não informa (ex.: inteiro teor, resultado, partes). Os campos listados em "campos_ausentes" não estão na base.`

export const RELATED_JURISPRUDENCE_TASK = `Compare o processo do escritório ("processo_do_escritorio", ref P1) com as decisões encontradas na pesquisa ("decisoes", refs J1, J2…). As decisões vieram da base oficial; você só interpreta.
- Use somente os dados enviados. Não invente decisões nem acrescente detalhes que não estão nas ementas.
- "decisoes": para cada decisão analisada, "ref" (exatamente uma das referências recebidas), "semelhanca" ("alta" só quando o tema central e o contexto fático descritos na ementa coincidem com os dados do processo; "media" quando há tema comum com contexto diferente ou incerto; "baixa" quando a ligação é fraca) e "motivo" em uma frase.
- "visao_geral": 2 a 3 frases sobre o conjunto, sem números diferentes dos recebidos.
- "cuidados": limites da comparação (ex.: o processo tem poucos dados; as ementas não trazem os fatos completos; a base contém só o STJ).`

export const CHAT_TASK = `Responda às perguntas do usuário sobre os dados da Íntegra desta conversa.
- Responda de forma direta e curta. Use listas quando ajudar. Markdown simples permitido: **negrito**, listas com "-" e títulos "###". Nada de tabelas ou HTML.
- Referências como "essa movimentação", "o último registro" ou "esse processo" dizem respeito ao escopo desta conversa.
- Cite as fontes com as referências entre colchetes (ex.: [M1]).
- Para contagens, use as métricas calculadas pela Íntegra quando existirem.
- Se a pergunta exigir dados que não estão no contexto (outro processo, outro cliente, o teor de um documento), diga que não tem acesso a esses dados nesta conversa.
- Se o usuário pedir para criar, editar ou excluir algo, explique que você apenas sugere e que a ação deve ser feita pela própria Íntegra.`

export const CHAT_SCOPE_LABEL = {
  process: "Esta conversa é sobre UM processo específico (o dos dados abaixo).",
  client: "Esta conversa é sobre UM cliente específico (o dos dados abaixo) e seus processos.",
  office: "Esta conversa é sobre o escritório como um todo, com métricas agregadas e listas resumidas.",
} as const
