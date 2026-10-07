export type ID = string

/** Campos comuns a toda entidade pertencente a um escritório (tenant). */
export interface TenantEntity {
  id: ID
  organizationId: ID
  createdAt: string
}

export type PracticeArea = "Previdenciário" | "Trabalhista" | "Cível" | "Família" | "Empresarial" | "Imobiliário"

/** Por onde o cliente chegou ao escritório. */
export type ClientSource = "WhatsApp" | "Instagram" | "Indicação" | "Site" | "Google"

export type Priority = "alta" | "media" | "baixa"

export interface Organization {
  id: ID
  name: string
  legalName: string
  cnpj: string
  city: string
  address: string
  phone: string
  email: string
  /** Nome de um plano do catálogo (`public.plans`), ex.: "Essencial". */
  plan: string
  /**
   * `pending` até o Super Admin aprovar; `suspended` (ex.: inadimplência) e `inactive`
   * bloqueiam todos os usuários — a RLS só libera escritórios `active`.
   */
  status: "pending" | "active" | "suspended" | "inactive"
  createdAt: string
  approvedAt?: string
}

export type UserRole = "super_admin" | "owner" | "lawyer" | "staff"

export interface User extends TenantEntity {
  name: string
  firstName: string
  role: UserRole
  email: string
  phone: string
  /** Cargo livre (ex.: "Advogada associada"); sem ele, mostra-se o rótulo do papel. */
  jobTitle?: string
  oab?: string
  avatarUrl?: string
  active: boolean
  /** null = permissões padrão do papel. */
  permissions?: string[] | null
}

/* -------------------------------- Clientes -------------------------------- */

/**
 * `contato`: pessoa cadastrada ainda sem CPF/CNPJ (ex.: veio do WhatsApp). Pode ser
 * atendida e agendada; para abrir processo, contrato ou fatura, o documento é exigido.
 */
export type ClientStatus = "ativo" | "inativo" | "novo" | "inadimplente" | "contato"

/** Endereço em partes. `Client.address` guarda a mesma informação em uma linha. */
export interface ClientAddress {
  zipCode?: string
  street?: string
  number?: string
  complement?: string
  district?: string
  city?: string
  /** UF, duas letras. */
  state?: string
}

export interface Client extends TenantEntity {
  name: string
  kind: "PF" | "PJ"
  /** CPF (PF) ou CNPJ (PJ), com máscara. Único por escritório (índice no banco). */
  document: string
  email: string
  phone: string
  /** Número de WhatsApp, quando diferente do telefone. */
  whatsapp?: string
  /** Endereço em uma linha — usado nas listas e nas versões antigas do cadastro. */
  address: string
  addressDetails?: ClientAddress
  profession?: string
  /** Data de nascimento (PF) ou de fundação (PJ), `YYYY-MM-DD`. */
  birthDate?: string
  area: PracticeArea
  ownerId: ID
  status: ClientStatus
  clientSince: string
  lastActivityAt: string
  updatedAt?: string
  source?: ClientSource
  /** Marcadores livres do escritório (ex.: "VIP", "Indicação do Dr. X"). */
  tags?: string[]
  notes?: string
  /** Contato principal — representante da empresa (PJ) ou alguém que fala pelo cliente. */
  contact?: { name: string; relation: string; phone: string; email?: string }
}

/**
 * Resumo da conversa de WhatsApp mostrado no painel do cliente. A conversa completa
 * é `WhatsAppConversation` (`types/whatsapp.ts`, Central de Atendimento).
 */
export interface ClientWhatsAppSummary {
  clientId: ID
  phone: string
  provider: "zapi"
  externalId?: string
  lastMessageAt?: string
  lastMessagePreview?: string
}

/* ------------------------------- Processos -------------------------------- */

/** Classificação interna do escritório — não vem de fonte externa. */
export type ProcessStatus = "em_andamento" | "audiencia" | "aguardando_documento" | "recurso" | "suspenso" | "concluido"

/** De onde veio o dado: cadastro manual ou um provider de consulta processual. */
export type DataOrigin = "manual" | "datajud"

/**
 * Complemento tabelado de uma movimentação (Tabela Processual Unificada do CNJ),
 * exatamente como a fonte informou.
 */
export interface MovementComplement {
  /** Código do tipo de complemento. */
  code?: number
  /** Identificador técnico do complemento (ex.: "tipo_de_documento"). Nunca exibido cru. */
  key?: string
  /** Código do valor escolhido na tabela. */
  value?: number
  /** Texto do valor, para leitura (ex.: "Certidão"). */
  name?: string
}

/** Órgão julgador de uma movimentação — nome exatamente como a fonte escreveu. */
export interface MovementJudicialUnit {
  code?: string
  name?: string
}

/**
 * Documento vinculado à movimentação. Só existe quando a fonte dá acesso real
 * ao arquivo — "Documento: Certidão" no DataJud informa o tipo, não o arquivo.
 */
export interface MovementDocument {
  available: boolean
  id?: string
  url?: string
  /** Formato, ex.: "PDF". */
  type?: string
}

export interface ProcessMovement {
  id: ID
  /** ISO local, na hora em que a fonte registrou o ato. */
  at: string
  /** Nome do movimento como a fonte informou (ou o título digitado no cadastro). */
  title: string
  description?: string
  /**
   * Classificação legada dos seeds e do cadastro manual. A timeline usa o
   * interpretador (`movement-interpreter.ts`), que só recorre a este campo
   * quando o nome não basta.
   */
  kind?: "filing" | "summons" | "document" | "distribution" | "hearing" | "decision" | "expert" | "other"
  /** Código da tabela processual unificada do CNJ, quando importado. */
  code?: number
  /** Identidade de conteúdo — impede importar a mesma movimentação duas vezes. */
  hash?: string
  origin?: DataOrigin

  /* ----- Dados da fonte externa, preservados como vieram ----- */

  complements?: MovementComplement[]
  judicialUnit?: MovementJudicialUnit
  document?: MovementDocument
  /** Objeto original da fonte — permite reinterpretar sem consultar de novo. */
  raw?: unknown
}

export interface ProcessParty {
  name: string
  document?: string
  type?: "individual" | "company"
  role?: string
}

/** Rastro da fonte externa que alimentou o processo. */
export interface ProcessSource {
  provider: DataOrigin
  externalId?: string
  dataset?: string
  /** Situação nas palavras da fonte. Distinta de `status`, que é do escritório. */
  sourceStatus?: string
}

export interface Process extends TenantEntity {
  number: string
  code: string
  caseId?: ID
  clientId: ID
  area: PracticeArea
  type: string
  court: string
  district: string
  opposingParty: string
  status: ProcessStatus
  ownerId: ID
  claimValue: number
  distributedAt: string
  lastMovementAt: string
  movements: ProcessMovement[]
  /**
   * Quem cadastrou as informações: `manual` = o escritório (formulário "Novo processo"),
   * mesmo que depois a consulta pública complemente. Nesse caso, o que o escritório
   * preencheu (tribunal, grau, órgão) não é substituído pela sincronização
   * (`process-sync.ts`). Ausente em processos importados e nos cadastros antigos.
   */
  origin?: DataOrigin
  /** Processo em segredo de justiça: sem consulta pública — nada é sincronizado automaticamente. */
  secret?: boolean
  /** Descrição/observações do escritório sobre o processo. */
  notes?: string
  /**
   * Só a movimentação mais recente foi carregada (resumo usado em listas e no Painel,
   * `processes_summary`). O histórico completo vem ao abrir o processo. Nunca é salvo:
   * o banco tira a marca e mantém o histórico que já tem (`0016_carga_sob_demanda.sql`).
   */
  movementsPartial?: boolean

  /* ----- Campos preenchidos por consulta externa (todos opcionais) ----- */

  /** 20 dígitos do número CNJ, sem pontuação. */
  cnj?: string
  tribunal?: string
  /** Grau conforme a fonte (ex.: "JE", "1º grau"). */
  degree?: string
  /** Classe processual informada pela fonte. */
  className?: string
  /** Assunto principal informado pela fonte. */
  subject?: string
  /** Órgão julgador — termo neutro: a fonte não garante que seja uma vara. */
  judicialUnit?: string
  /** Sistema de tramitação (PJe, eproc…). */
  system?: string
  parties?: { active: ProcessParty[]; passive: ProcessParty[]; others: ProcessParty[] }
  source?: ProcessSource
  /** Última vez que as informações foram conferidas na fonte (por qualquer caminho). */
  lastSyncedAt?: string
  /** Última sincronização feita pelo monitoramento automático (servidor). Ausente = nunca. */
  autoSyncedAt?: string
}

/* -------------------------------- Tarefas --------------------------------- */

export type RelatedEntity = { type: "client"; id: ID } | { type: "process"; id: ID }

export interface Task extends TenantEntity {
  title: string
  description?: string
  dueAt: string
  priority: Priority
  assigneeId: ID
  status: "pendente" | "concluida"
  completedAt?: string
  related?: RelatedEntity
  /** Coluna do quadro Kanban. Ausente = primeira coluna não concluída. */
  columnId?: ID
}

/** Coluna do quadro de tarefas, criada pelo próprio escritório (estilo Notion/Trello). */
export interface TaskColumn extends TenantEntity {
  name: string
  color: string
  order: number
  /** Tarefas nesta coluna contam como concluídas. */
  isDone?: boolean
}

/* --------------------------------- Prazos --------------------------------- */

/** De onde veio o prazo: cadastrado à mão, ou a partir de uma intimação ou movimentação. */
export type PrazoOrigin = "manual" | "intimacao" | "movimentacao"

/** Só prazos `aberto` contam como próximos/pendentes. */
export type PrazoStatus = "aberto" | "cumprido" | "perdido"

/**
 * Prazo processual — a fonte de verdade dos prazos do escritório (tabela `deadlines`,
 * `0008_prazos.sql`). O banco confere processo, cliente, responsável e tarefa por id.
 */
export interface Prazo extends TenantEntity {
  processId: ID
  /** Cliente do processo (o banco acompanha o processo; some se o cliente for excluído). */
  clientId?: ID
  description: string
  /** `YYYY-MM-DD` — o último dia para cumprir. */
  fatalDate: string
  /** `YYYY-MM-DD` — até quando o escritório quer concluir (data da tarefa vinculada). */
  internalDate: string
  /** Obrigatória quando a data interna fica depois da data fatal. */
  internalDateReason?: string
  responsibleId: ID
  origin: PrazoOrigin
  status: PrazoStatus
  /** Tarefa criada para o prazo (vínculo por id; some se a tarefa for excluída). */
  taskId?: ID
  /** Quem cadastrou (o banco grava a pessoa logada). */
  createdById: ID
  updatedAt?: string
  /** Quando foi cumprido ou marcado como perdido, e por quem. */
  closedAt?: string
  closedById?: ID
  /** Intimação que originou o prazo (confirmada pelo advogado). Único por escritório. */
  intimacaoId?: ID
  /** Evento da antiga Triagem que originou o prazo (registros anteriores). */
  triageItemId?: ID
}

/* ------------------------------ OAB ------------------------------- */

/** Inscrição na OAB de um membro do escritório (tabela `lawyer_oabs`). */
export interface LawyerOab {
  id: ID
  organizationId: ID
  userId: ID
  /** Só dígitos. */
  number: string
  /** UF da seccional. */
  uf: string
  active: boolean
  createdAt: string
}

/* --------------------------------- Agenda --------------------------------- */

/** Categoria de compromisso criada pelo próprio escritório (ex.: "Audiência"). */
export interface AppointmentCategory extends TenantEntity {
  name: string
  /** Cor em hexadecimal, ex.: "#337EA9". */
  color: string
}

export interface Appointment extends TenantEntity {
  title: string
  /** Categoria do escritório; ausente quando o compromisso não foi categorizado. */
  categoryId?: ID
  start: string
  end: string
  ownerId: ID
  personName?: string
  area?: PracticeArea
  clientId?: ID
  processId?: ID
  location?: string
  notes?: string
}

/* ------------------------------- Documentos ------------------------------- */

export type DocumentKind = "Contrato" | "Procuração" | "Documento pessoal" | "Petição" | "Comprovante" | "Laudo" | "Decisão"

export interface LegalDocument extends TenantEntity {
  name: string
  kind: DocumentKind
  extension: "pdf" | "docx" | "doc" | "txt" | "jpg" | "png"
  sizeBytes: number
  clientId?: ID
  processId?: ID
  uploadedById: ID
  uploadedAt: string
  /** Caminho do arquivo no bucket `documents` (`<organizationId>/<id>`); ausente = sem conteúdo salvo. */
  storagePath?: string
}

/* ------------------------------- Financeiro ------------------------------- */

/** `pendente` é o previsto; `atrasado` é calculado pelo vencimento e também pode estar salvo. */
export type InvoiceStatus = "pago" | "pendente" | "atrasado" | "cancelado"

export type InvoiceCategory = "Honorários" | "Êxito" | "Custas" | "Consulta" | "Outros"

export interface Invoice extends TenantEntity {
  clientId: ID
  processId?: ID
  description: string
  /** Ausente em lançamentos anteriores à categoria. */
  category?: InvoiceCategory
  amount: number
  dueDate: string
  paidAt?: string
  status: InvoiceStatus
  method?: "Pix" | "Boleto" | "Transferência" | "Cartão"
  notes?: string
}

/* ------------------------------- Atividade -------------------------------- */

export type ActivityType =
  | "document"
  | "contract"
  | "petition"
  | "appointment"
  | "payment"
  | "task"
  | "client"
  | "hearing"
  | "summons"
  | "movement"
  | "deadline"
  /** Jurisprudência vinculada a um processo. */
  | "jurisprudence"

export interface Activity extends TenantEntity {
  type: ActivityType
  at: string
  /** Nome em destaque no início da frase (opcional). */
  actor?: string
  message: string
  detail?: string
  actorUserId?: ID
  clientId?: ID
  processId?: ID
  href?: string
}

export interface Notification {
  id: ID
  organizationId: ID
  type: "deadline" | "document" | "appointment" | "contract"
  title: string
  description: string
  at: string
  read: boolean
  href: string
}

export * from "./whatsapp"
