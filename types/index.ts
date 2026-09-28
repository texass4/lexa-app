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
  plan: "Essencial" | "Profissional" | "Escritório"
  /** `pending` até o Super Admin aprovar; `inactive` bloqueia todos os usuários. */
  status: "pending" | "active" | "inactive"
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

export type ClientStatus = "ativo" | "inativo" | "novo" | "inadimplente"

export interface Client extends TenantEntity {
  name: string
  kind: "PF" | "PJ"
  document: string
  email: string
  phone: string
  address: string
  profession?: string
  birthDate?: string
  area: PracticeArea
  ownerId: ID
  status: ClientStatus
  clientSince: string
  lastActivityAt: string
  source?: ClientSource
  contact?: { name: string; relation: string; phone: string; email?: string }
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
  nextDeadline?: { date: string; title: string }
  movements: ProcessMovement[]

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
  /** Última vez que o processo foi sincronizado com a fonte. */
  lastSyncedAt?: string
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

export type InvoiceStatus = "pago" | "pendente" | "atrasado"

export interface Invoice extends TenantEntity {
  clientId: ID
  processId?: ID
  description: string
  amount: number
  dueDate: string
  paidAt?: string
  status: InvoiceStatus
  method?: "Pix" | "Boleto" | "Transferência" | "Cartão"
}

/* ------------------------------- Atividade -------------------------------- */

export type ActivityType = "document" | "contract" | "petition" | "appointment" | "payment" | "task" | "client" | "hearing" | "summons" | "movement"

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
