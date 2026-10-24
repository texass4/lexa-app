CREATE TYPE "public"."board_element_kind" AS ENUM('card', 'shape', 'text', 'sticky', 'frame', 'drawing', 'record');--> statement-breakpoint
CREATE TYPE "public"."inbox_kind" AS ENUM('note', 'task', 'idea');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('planned', 'active', 'paused', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."ref_type" AS ENUM('task', 'project', 'area', 'page', 'journal', 'board');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'in_progress', 'done', 'archived');--> statement-breakpoint
CREATE TABLE "areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"color" text DEFAULT 'sage' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "areas_name_not_blank" CHECK (length(btrim("areas"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "board_connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"board_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"source_handle" text,
	"target_handle" text,
	"label" text DEFAULT '' NOT NULL,
	"style" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_elements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"board_id" uuid NOT NULL,
	"kind" "board_element_kind" NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"width" double precision NOT NULL,
	"height" double precision NOT NULL,
	"z_index" integer DEFAULT 0 NOT NULL,
	"parent_id" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ref_type" "ref_type",
	"ref_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_elements_size" CHECK ("board_elements"."width" > 0 and "board_elements"."height" > 0),
	CONSTRAINT "board_elements_record_ref" CHECK (("board_elements"."kind" = 'record') = ("board_elements"."ref_type" is not null and "board_elements"."ref_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"viewport" jsonb DEFAULT '{"x":0,"y":0,"zoom":1}'::jsonb NOT NULL,
	"project_id" uuid,
	"area_id" uuid,
	"search_text" text DEFAULT '' NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" "ref_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"target_type" "ref_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content" text NOT NULL,
	"kind" "inbox_kind" DEFAULT 'note' NOT NULL,
	"processed_at" timestamp with time zone,
	"converted_type" "ref_type",
	"converted_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbox_items_content_not_blank" CHECK (length(btrim("inbox_items"."content")) > 0)
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_date" date NOT NULL,
	"content" jsonb DEFAULT '{"type":"doc","content":[]}'::jsonb NOT NULL,
	"content_text" text DEFAULT '' NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"content" jsonb DEFAULT '{"type":"doc","content":[]}'::jsonb NOT NULL,
	"content_text" text DEFAULT '' NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"project_id" uuid,
	"area_id" uuid,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"area_id" uuid,
	"start_date" date,
	"target_date" date,
	"search_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_title_not_blank" CHECK (length(btrim("projects"."title")) > 0),
	CONSTRAINT "projects_dates_order" CHECK ("projects"."start_date" is null or "projects"."target_date" is null or "projects"."start_date" <= "projects"."target_date")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"owner_name" text DEFAULT '' NOT NULL,
	"timezone" text,
	"week_starts_on" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_singleton" CHECK ("settings"."id" = 1),
	CONSTRAINT "settings_week_start" CHECK ("settings"."week_starts_on" between 0 and 6)
);
--> statement-breakpoint
CREATE TABLE "subtasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"title" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"position" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subtasks_title_not_blank" CHECK (length(btrim("subtasks"."title")) > 0)
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_not_blank" CHECK (length(btrim("tags"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "task_tags" (
	"task_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "task_tags_task_id_tag_id_pk" PRIMARY KEY("task_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "tasks_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"start_date" date,
	"due_date" date,
	"area_id" uuid,
	"project_id" uuid,
	"estimate_minutes" integer,
	"recurrence" jsonb,
	"completed_at" timestamp with time zone,
	"position" double precision DEFAULT 0 NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_title_not_blank" CHECK (length(btrim("tasks"."title")) > 0),
	CONSTRAINT "tasks_dates_order" CHECK ("tasks"."start_date" is null or "tasks"."due_date" is null or "tasks"."start_date" <= "tasks"."due_date"),
	CONSTRAINT "tasks_estimate_range" CHECK ("tasks"."estimate_minutes" is null or ("tasks"."estimate_minutes" > 0 and "tasks"."estimate_minutes" <= 100000)),
	CONSTRAINT "tasks_completion_consistent" CHECK (("tasks"."status" <> 'done' or "tasks"."completed_at" is not null) and ("tasks"."status" not in ('todo', 'in_progress') or "tasks"."completed_at" is null))
);
--> statement-breakpoint
ALTER TABLE "board_connections" ADD CONSTRAINT "board_connections_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_connections" ADD CONSTRAINT "board_connections_source_id_board_elements_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."board_elements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_connections" ADD CONSTRAINT "board_connections_target_id_board_elements_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."board_elements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_elements" ADD CONSTRAINT "board_elements_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "board_connections_board_idx" ON "board_connections" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "board_elements_board_idx" ON "board_elements" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "board_elements_ref_idx" ON "board_elements" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE INDEX "boards_project_idx" ON "boards" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_links_unique" ON "content_links" USING btree ("source_type","source_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "content_links_target_idx" ON "content_links" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "inbox_items_processed_idx" ON "inbox_items" USING btree ("processed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_date_key" ON "journal_entries" USING btree ("entry_date");--> statement-breakpoint
CREATE INDEX "pages_project_idx" ON "pages" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "pages_area_idx" ON "pages" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "projects_area_idx" ON "projects" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "subtasks_task_idx" ON "subtasks" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_name_key" ON "tags" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "task_tags_tag_idx" ON "task_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_number_key" ON "tasks" USING btree ("number");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tasks_due_idx" ON "tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "tasks_project_idx" ON "tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tasks_area_idx" ON "tasks" USING btree ("area_id");