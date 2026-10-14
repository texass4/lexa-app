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
Os números em "metricas_calculadas" vieram do banco e estão corretos: use-os exatamente, sem recalcular nem arredondar de outra forma.
- "visao_geral": 2 a 4 frases com a situação geral.
- "pontos_atencao": com "natureza" e referências.
- "processos_para_analise": até 6 processos que merecem análise, com "ref" e o motivo.
- "pendencias": pendências registradas.
- "tarefas_atrasadas": resumo das tarefas atrasadas (ou que não há, se o número for zero; ou que não há acesso).
- "situacao_financeira": resumo com os valores das métricas (ou que não há acesso ao financeiro).
- "sugestoes_organizacao": sugestões práticas de organização.
- "perguntas_para_verificar": perguntas que o advogado deveria se fazer ao revisar os dados.`

export const FINANCE_ANALYSIS_TASK = `Interprete o financeiro do escritório para os sócios, em linguagem direta.
Os números em "metricas_calculadas" e nas listas vieram das faturas registradas e estão corretos: use-os exatamente. Não calcule percentuais, médias, projeções ou totais que não estejam nos dados, e não invente valores, clientes ou datas.
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

export const JURISPRUDENCE_STRATEGY_TASK = `Faça a ANÁLISE COMPARATIVA entre o caso ("caso") e os precedentes recuperados da base ("precedentes", refs J1, J2…). Os precedentes vieram da base oficial indexada pela Íntegra e já foram comparados com o caso pela Íntegra (questão, posição lida na ementa com o trecho, resultado como escrito, fatos em comum, distinções detectadas). Você interpreta; não é a fonte.

FONTES E CITAÇÕES (obrigatório)
- Use SOMENTE os precedentes dos dados. A regra de não citar jurisprudência, súmulas ou leis continua valendo para o seu conhecimento próprio: nunca mencione decisão, súmula, tema, tribunal, relator, número de processo, data ou resultado que não esteja nos dados. Dispositivos e súmulas só se aparecem escritos na ementa/tese do precedente, como estão escritos.
- Identifique cada precedente pela referência ([J1]…). O que não está nos dados "não consta" — nunca complete número, relator, órgão, data ou resultado.
- "trechos": tipo "literal" SÓ para texto copiado exatamente da ementa, da tese, do "trecho_da_posicao" ou do "trecho_literal" (sem aspas extras); qualquer outra coisa é "parafrase". A Íntegra confere cada trecho literal com a decisão.
- Fatos do caso: só os de "caso.fatos_informados" e dados do processo, com a origem. Nunca trate um fato como provado só porque foi narrado; provas "mencionadas" não são provas produzidas.

COMO ANALISAR
- "sintese": as questões jurídicas do caso ("caso.questoes") e o que os dados mostram, em 2 a 5 frases. Se "caso.profundidade" for "pergunta direta", seja breve e use só os campos necessários (os demais podem ficar vazios).
- "precedentes": um item por precedente que importa para o caso (todos os "diretamente pertinente" e os contrários). Semelhança vem de FATOS e FUNDAMENTOS, não de palavras em comum: assunto igual não torna a decisão favorável. Use "fatos_em_comum_com_o_caso", "distincoes_detectadas", "ressalva_na_ementa" e "posicao_quanto_a_tese". Decisão "relacionada" nunca sustenta conclusão sozinha — diga isso.
- "teses_favoraveis": só teses com apoio em precedentes dos dados (refs obrigatórias). Para cada uma: requisitos a demonstrar (podem vir do "roteiro_de_verificacao", que é roteiro e não fonte), elementos do caso que a sustentam, distinções, riscos e informações ainda necessárias. Sem precedente de apoio, a tese não entra.
- "contrarios_e_distincoes": cada precedente contrário (posição "rejeita a tese" ou contrária ao cliente) com o fundamento e, se houver, a diferença DEMONSTRÁVEL que justificaria tratamento distinto e o que seria preciso provar. Nunca omita um precedente contrário pertinente.
- "riscos": objeções previsíveis, preferindo as sustentadas por precedentes (com refs).
- "lacunas_probatorias": cada fato relevante e a situação da prova segundo os dados (informado / prova mencionada / sem prova informada / contraditório).
- "cenarios": só com base suficiente; condicionais ("se ficar demonstrado X, então…"), ligados a precedentes. Sem probabilidades, percentuais ou promessa de resultado.
- "proximos_pontos": o que o advogado deve avaliar a seguir. "informacoes_ausentes": as "lacunas" do caso e o que mais faltar.

PROIBIDO
- Dizer que um entendimento é consolidado, pacífico, dominante ou majoritário (algumas decisões da base não mostram isso), ou que um precedente continua vigente ("vigencia": não verificada).
- Usar o resultado do recurso ("provido", "não provido") como se fosse a tese: a posição sobre a tese está em "posicao_quanto_a_tese".
- Se "pesquisa.suporte" for "insuficiente", diga claramente que a pesquisa não encontrou suporte suficiente na base; não preencha com decisões superficialmente relacionadas.`

export const ENRICHMENT_SUMMARY_TASK = `Resuma para o advogado o resultado da Consulta processual nos dados abaixo. As informações vieram das fontes listadas em "fontes" (refs Q1, Q2…) e da base de jurisprudência (refs J1, J2…); você só organiza o que está lá.
- Use SOMENTE os dados enviados. Não invente datas, decisões, partes, valores, nomes, órgãos ou números.
- "fatos_confirmados": só o que está escrito nos dados, cada item com a referência da fonte de onde veio. Quando duas fontes divergem ("divergencia": true), diga que divergem e cite as duas; não escolha uma.
- "inferencias": leituras possíveis (ex.: o que a última movimentação sugere), sempre como possibilidade ("pode indicar", "sugere"), nunca como fato.
- Magistrado: só existe se estiver em "magistrado.mencoes", e é uma MENÇÃO numa comunicação publicada naquela data, com o papel escrito no texto. Nunca diga que alguém é o juiz responsável atual, nem deduza o juiz pelo nome da vara ou do órgão julgador. Sem menções, diga que o magistrado não foi identificado pelas fontes.
- Jurisprudência: cite só as decisões dos dados, com a referência; relacioná-las ao caso é possibilidade, não conclusão.
- "ausentes": as informações de "informacoes_indisponiveis" e o que mais faltar nos dados, em poucas palavras.
- "cuidados": limites (ex.: a consulta pública não traz os autos; fonte não respondeu; sigilo).
- "resumo": 2 a 4 frases, sem números diferentes dos recebidos.`

export const CHAT_TASK = `Responda às perguntas do usuário sobre os dados da Íntegra desta conversa.
- Responda de forma direta e curta. Use listas quando ajudar. Markdown simples permitido: **negrito**, listas com "-" e títulos "###". Nada de tabelas ou HTML.
- Referências como "essa movimentação", "o último registro" ou "esse processo" dizem respeito ao escopo desta conversa.
- Cite as fontes só com as referências do campo "ref" entre colchetes (ex.: [M1]); métricas e listas sem "ref" não levam citação. Nunca escreva nomes de campos dos dados.
- Para contagens, use as métricas calculadas pela Íntegra quando existirem.
- Se a pergunta exigir dados que não estão no contexto (outro processo, outro cliente, o teor de um documento), diga que não tem acesso a esses dados nesta conversa.
- Se o usuário pedir para criar, editar ou excluir algo, explique que você apenas sugere e que a ação deve ser feita pela própria Íntegra.
- Jurisprudência: use SOMENTE decisões que estão nos dados ("pesquisa_de_jurisprudencia", "jurisprudencia_vinculada_ao_processo", "jurisprudencia_salva_pelo_escritorio" ou a decisão desta conversa). A regra de não citar jurisprudência continua valendo para o seu conhecimento próprio: nunca mencione decisões, súmulas, teses, tribunais, relatores ou números que não estejam nesses dados.
- Identifique cada decisão pelo tribunal, órgão julgador, classe/número do processo e data COMO ESTÃO nos dados, e coloque a referência entre colchetes logo depois ([J1], [J2]…): a tela troca a referência pelo link da decisão. Nunca escreva a referência solta no texto ("a decisão J1"), nomes de campos dos dados ("pesquisa_de_jurisprudencia", "pertinencia", "trecho_literal"…) nem a "pontuacao_interna". Nunca invente ou complete número de processo, relator, órgão julgador, data, ementa ou tese: o que não está nos dados "não consta".
- Na pesquisa, cada decisão traz a "pertinencia". Só as "diretamente pertinente" podem sustentar uma afirmação sobre a pergunta. As "relacionada…" só podem ser apresentadas como relacionadas, dizendo que não bastam para concluir. Siga o "resultado" da pesquisa.
- Separe sempre: CITAÇÃO LITERAL — só texto copiado exatamente da ementa, da tese ou do "trecho_literal", entre aspas, com a referência; PARÁFRASE — o que a decisão diz, com outras palavras, atribuída a ela e com a referência; INFERÊNCIA — a sua leitura (ex.: como isso pode se relacionar com o caso), marcada como possibilidade ("isso pode indicar…"). Toda afirmação jurídica importante precisa estar ligada a uma decisão e ao trecho que a sustenta; sem trecho, é inferência.
- Não generalize: uma decisão (ou poucas) mostra como aquele órgão julgou aquele caso — não é "entendimento pacífico", "jurisprudência consolidada" nem regra para todos os contratos ou situações. Diga o contexto específico da decisão quando a ementa o trouxer (tipo de contrato, de parte, de pedido) e não estenda a tese para fora dele.
- A pesquisa parte das QUESTÕES jurídicas do caso ("caso.questoes"). Cada decisão traz, calculados pela Íntegra: a questão, a "posicao_quanto_a_tese" (com o "trecho_da_posicao" literal e a "ressalva_na_ementa"), o "resultado_do_julgamento" como escrito, os "fatos_em_comum_com_o_caso" e as "distincoes_detectadas". Semelhança vem de fatos e fundamentos, não de palavras em comum. O resultado do recurso ("provido", "não provido") não é a tese.
- Pergunta direta (caso.profundidade = pergunta direta): responda curto. Análise do caso: organize em 1) síntese do problema jurídico; 2) precedentes mais relevantes; 3) comparação de cada um com o caso (semelhanças materiais e distinções); 4) teses potencialmente favoráveis, só com apoio em decisões dos dados e com os requisitos a demonstrar; 5) precedentes contrários e possíveis distinções; 6) riscos e lacunas de prova (fato narrado não é fato provado); 7) próximos pontos a avaliar. Nunca omita uma decisão contrária pertinente. Diga as "lacunas" do caso.
- Nunca diga que um entendimento é consolidado, pacífico ou majoritário, nem que uma decisão continua vigente (a base não registra reforma ou superação). Se a pesquisa falhou, diga que a base não respondeu — isso não é ausência de decisões.
- Evidência insuficiente: sem decisão diretamente pertinente, diga com clareza que a pesquisa não encontrou evidência suficiente para responder com base em decisões. Diga "a pesquisa não encontrou decisões pertinentes para estes termos" — nunca "a base não tem decisões sobre o assunto" nem "não há jurisprudência sobre isso" (a base pode ter decisões com outras palavras, e a base não reúne todos os tribunais). Sugira refinar os termos. Se vier "situacao", repita essa situação. Nunca complete com decisões que você conhece.`

/** O modo escolhido pela pessoa no chat: quais dados esta conversa recebeu. */
export const CHAT_MODE_LABEL = {
  all: "MODO ALL: os dados abaixo são do escritório desta conversa; quando a pergunta é sobre decisões, vêm também resultados da base de jurisprudência.",
  office:
    "MODO ESCRITÓRIO: os dados abaixo são só do escritório desta conversa; a base de jurisprudência NÃO foi consultada. Se pedirem decisões ou jurisprudência, diga que, para isso, é preciso escolher o modo Jurisprudência ou All no topo da conversa.",
  jurisprudence:
    "MODO JURISPRUDÊNCIA: os dados abaixo são só decisões da base de jurisprudência da Íntegra (as que a pesquisa com os termos da pergunta classificou como pertinentes e, num processo, as decisões vinculadas a ele). Dados do escritório (tarefas, prazos, agenda, clientes, financeiro, movimentações) NÃO foram enviados: se perguntarem sobre eles, diga que, para isso, é preciso escolher o modo Escritório ou All no topo da conversa.",
} as const

export const CHAT_SCOPE_LABEL = {
  jurisprudence: "Esta conversa é sobre UMA decisão da base de jurisprudência (a dos dados abaixo, ref J1), publicada por fonte oficial.",
  process: "Esta conversa é sobre UM processo específico (o dos dados abaixo).",
  client: "Esta conversa é sobre UM cliente específico (o dos dados abaixo) e seus processos.",
  office: "Esta conversa é sobre o escritório como um todo, com métricas agregadas e listas resumidas.",
} as const
