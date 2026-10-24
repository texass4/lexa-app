import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

/*
 * Modelo de dados da Mesa.
 *
 * Regra central: cada entidade tem uma única linha, numa única tabela. Dashboard, diário,
 * projetos e canvas só guardam o identificador (uuid) de um registro, nunca uma cópia dele.
 * Referências entre módulos são polimórficas (`ref_type` + `ref_id`) e, por isso, sem chave
 * estrangeira: quem as exibe confere se o registro ainda existe e mostra "indisponível".
 *
 * Datas de calendário (prazo, início, dia do diário) usam `date` e circulam como texto
 * `YYYY-MM-DD`, sem fuso. Datas de auditoria usam `timestamptz`.
 */

export const taskStatus = pgEnum("task_status", ["todo", "in_progress", "done", "archived"])
export const taskPriority = pgEnum("task_priority", ["low", "medium", "high"])
export const projectStatus = pgEnum("project_status", ["planned", "active", "paused", "completed", "archived"])
export const refType = pgEnum("ref_type", ["task", "project", "area", "page", "journal", "board"])
export const boardElementKind = pgEnum("board_element_kind", ["card", "shape", "text", "sticky", "frame", "drawing", "record"])
export const inboxKind = pgEnum("inbox_kind", ["note", "task", "idea"])

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
const emptyDoc = sql`'{"type":"doc","content":[]}'::jsonb`

export type Recurrence = { freq: "daily" | "weekly" | "monthly" | "yearly"; interval: number }
export type Viewport = { x: number; y: number; zoom: number }

export const areas = pgTable(
  "areas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    color: text("color").notNull().default("sage"),
    position: integer("position").notNull().default(0),
    searchText: text("search_text").notNull().default(""),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("areas_name_not_blank", sql`length(btrim(${t.name})) > 0`)],
)

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: projectStatus("status").notNull().default("active"),
    areaId: uuid("area_id").references(() => areas.id, { onDelete: "set null" }),
    startDate: date("start_date", { mode: "string" }),
    targetDate: date("target_date", { mode: "string" }),
    searchText: text("search_text").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("projects_title_not_blank", sql`length(btrim(${t.title})) > 0`),
    check("projects_dates_order", sql`${t.startDate} is null or ${t.targetDate} is null or ${t.startDate} <= ${t.targetDate}`),
    index("projects_area_idx").on(t.areaId),
  ],
)

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Número curto e estável para exibir (T-12). O identificador real é o uuid. */
    number: integer("number").notNull().generatedAlwaysAsIdentity(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: taskStatus("status").notNull().default("todo"),
    priority: taskPriority("priority").notNull().default("medium"),
    startDate: date("start_date", { mode: "string" }),
    dueDate: date("due_date", { mode: "string" }),
    // Excluir um projeto ou uma área nunca apaga as tarefas: o vínculo vira nulo.
    areaId: uuid("area_id").references(() => areas.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    estimateMinutes: integer("estimate_minutes"),
    recurrence: jsonb("recurrence").$type<Recurrence>(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** Ordem dentro da coluna do kanban. */
    position: doublePrecision("position").notNull().default(0),
    searchText: text("search_text").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("tasks_number_key").on(t.number),
    check("tasks_title_not_blank", sql`length(btrim(${t.title})) > 0`),
    check("tasks_dates_order", sql`${t.startDate} is null or ${t.dueDate} is null or ${t.startDate} <= ${t.dueDate}`),
    check("tasks_estimate_range", sql`${t.estimateMinutes} is null or (${t.estimateMinutes} > 0 and ${t.estimateMinutes} <= 100000)`),
    // Concluída sempre tem data de conclusão; aberta nunca tem. Arquivada pode ter ou não.
    check(
      "tasks_completion_consistent",
      sql`(${t.status} <> 'done' or ${t.completedAt} is not null) and (${t.status} not in ('todo', 'in_progress') or ${t.completedAt} is null)`,
    ),
    index("tasks_status_idx").on(t.status),
    index("tasks_due_idx").on(t.dueDate),
    index("tasks_project_idx").on(t.projectId),
    index("tasks_area_idx").on(t.areaId),
  ],
)

export const subtasks = pgTable(
  "subtasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    done: boolean("done").notNull().default(false),
    position: doublePrecision("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("subtasks_title_not_blank", sql`length(btrim(${t.title})) > 0`), index("subtasks_task_idx").on(t.taskId)],
)

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [check("tags_name_not_blank", sql`length(btrim(${t.name})) > 0`), uniqueIndex("tags_name_key").on(sql`lower(${t.name})`)],
)

export const taskTags = pgTable(
  "task_tags",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.tagId] }), index("task_tags_tag_idx").on(t.tagId)],
)

export const pages = pgTable(
  "pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull().default(""),
    /** Documento do editor em blocos (JSON do Tiptap/ProseMirror). */
    content: jsonb("content").notNull().default(emptyDoc),
    contentText: text("content_text").notNull().default(""),
    searchText: text("search_text").notNull().default(""),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    areaId: uuid("area_id").references(() => areas.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    /** Controle de concorrência otimista do salvamento automático. */
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("pages_project_idx").on(t.projectId), index("pages_area_idx").on(t.areaId)],
)

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryDate: date("entry_date", { mode: "string" }).notNull(),
    content: jsonb("content").notNull().default(emptyDoc),
    contentText: text("content_text").notNull().default(""),
    searchText: text("search_text").notNull().default(""),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("journal_entries_date_key").on(t.entryDate)],
)

/**
 * Referências encontradas no conteúdo de páginas e entradas do diário. É derivada do
 * documento a cada salvamento (o documento é a fonte); existe para listar "mencionado em".
 */
export const contentLinks = pgTable(
  "content_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceType: refType("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    targetType: refType("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("content_links_unique").on(t.sourceType, t.sourceId, t.targetType, t.targetId),
    index("content_links_target_idx").on(t.targetType, t.targetId),
  ],
)

export const boards = pgTable(
  "boards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull().default(""),
    description: text("description").notNull().default(""),
    viewport: jsonb("viewport").$type<Viewport>().notNull().default(sql`'{"x":0,"y":0,"zoom":1}'::jsonb`),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    areaId: uuid("area_id").references(() => areas.id, { onDelete: "set null" }),
    searchText: text("search_text").notNull().default(""),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("boards_project_idx").on(t.projectId)],
)

/**
 * Elemento visual de um quadro. Guarda só aparência e geometria; quando representa um
 * registro (kind = 'record'), guarda apenas o tipo e o id dele em `ref_type`/`ref_id`.
 * O id é gerado no navegador para que conexões possam apontar para elementos ainda não salvos.
 */
export const boardElements = pgTable(
  "board_elements",
  {
    id: uuid("id").primaryKey(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    kind: boardElementKind("kind").notNull(),
    x: doublePrecision("x").notNull(),
    y: doublePrecision("y").notNull(),
    width: doublePrecision("width").notNull(),
    height: doublePrecision("height").notNull(),
    zIndex: integer("z_index").notNull().default(0),
    /** Frame que agrupa o elemento (posição relativa a ele). Conferido no serviço. */
    parentId: uuid("parent_id"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    refType: refType("ref_type"),
    refId: uuid("ref_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("board_elements_size", sql`${t.width} > 0 and ${t.height} > 0`),
    check("board_elements_record_ref", sql`(${t.kind} = 'record') = (${t.refType} is not null and ${t.refId} is not null)`),
    index("board_elements_board_idx").on(t.boardId),
    index("board_elements_ref_idx").on(t.refType, t.refId),
  ],
)

/** Conexão desenhada entre dois elementos. É só visual: não cria dependência entre tarefas. */
export const boardConnections = pgTable(
  "board_connections",
  {
    id: uuid("id").primaryKey(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => boardElements.id, { onDelete: "cascade" }),
    targetId: uuid("target_id")
      .notNull()
      .references(() => boardElements.id, { onDelete: "cascade" }),
    sourceHandle: text("source_handle"),
    targetHandle: text("target_handle"),
    label: text("label").notNull().default(""),
    style: jsonb("style").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("board_connections_board_idx").on(t.boardId)],
)

export const inboxItems = pgTable(
  "inbox_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    content: text("content").notNull(),
    kind: inboxKind("kind").notNull().default("note"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    /** Registro criado a partir do item (a captura não é duplicada: o conteúdo segue para ele). */
    convertedType: refType("converted_type"),
    convertedId: uuid("converted_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("inbox_items_content_not_blank", sql`length(btrim(${t.content})) > 0`), index("inbox_items_processed_idx").on(t.processedAt)],
)

/** Preferências da pessoa dona da Mesa (linha única, id = 1). */
export const settings = pgTable(
  "settings",
  {
    id: integer("id").primaryKey().default(1),
    ownerName: text("owner_name").notNull().default(""),
    /** Fuso usado para "hoje" e "atrasada". Nulo: o fuso informado pelo navegador. */
    timezone: text("timezone"),
    weekStartsOn: integer("week_starts_on").notNull().default(1),
    updatedAt: updatedAt(),
  },
  (t) => [check("settings_singleton", sql`${t.id} = 1`), check("settings_week_start", sql`${t.weekStartsOn} between 0 and 6`)],
)
