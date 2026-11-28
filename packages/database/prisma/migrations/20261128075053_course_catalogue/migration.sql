-- CreateEnum
CREATE TYPE "course_status" AS ENUM ('DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "course_level" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "lesson_type" AS ENUM ('TEXT', 'VIDEO', 'AUDIO', 'INTERACTIVE', 'EXTERNAL_LINK');

-- CreateEnum
CREATE TYPE "lesson_completion_rule" AS ENUM ('MARK_COMPLETE', 'VIEW', 'MEDIA_FINISHED');

-- CreateEnum
CREATE TYPE "lesson_resource_type" AS ENUM ('VIDEO', 'AUDIO', 'CAPTIONS', 'TRANSCRIPT', 'DOCUMENT', 'LINK');

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "level" "course_level" NOT NULL DEFAULT 'BEGINNER',
    "estimated_minutes" INTEGER NOT NULL DEFAULT 0,
    "outcomes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "prerequisites" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cover_object_key" TEXT,
    "status" "course_status" NOT NULL DEFAULT 'DRAFT',
    "featured_rank" INTEGER,
    "draft_revision" INTEGER NOT NULL DEFAULT 1,
    "published_revision" INTEGER,
    "published_version_id" UUID,
    "owner_id" UUID NOT NULL,
    "updated_by_id" UUID,
    "review_requested_at" TIMESTAMPTZ(3),
    "first_published_at" TIMESTAMPTZ(3),
    "published_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "category_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "level" "course_level" NOT NULL,
    "estimated_minutes" INTEGER NOT NULL,
    "module_count" INTEGER NOT NULL,
    "lesson_count" INTEGER NOT NULL,
    "search_text" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "draft_revision" INTEGER NOT NULL,
    "published_by_id" UUID,
    "published_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "module_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "type" "lesson_type" NOT NULL DEFAULT 'TEXT',
    "objectives" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "content" JSONB NOT NULL DEFAULT '{"schemaVersion":1,"blocks":[]}',
    "estimated_minutes" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL,
    "completion_rule" "lesson_completion_rule" NOT NULL DEFAULT 'MARK_COMPLETE',
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_resources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lesson_id" UUID NOT NULL,
    "type" "lesson_resource_type" NOT NULL,
    "title" TEXT NOT NULL,
    "storage_key" TEXT,
    "external_url" TEXT,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lesson_resources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_is_active_display_order_idx" ON "categories"("is_active", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "courses_slug_key" ON "courses"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "courses_published_version_id_key" ON "courses"("published_version_id");

-- CreateIndex
CREATE INDEX "courses_status_idx" ON "courses"("status");

-- CreateIndex
CREATE INDEX "courses_owner_id_updated_at_idx" ON "courses"("owner_id", "updated_at");

-- CreateIndex
CREATE INDEX "courses_category_id_idx" ON "courses"("category_id");

-- CreateIndex
CREATE INDEX "course_versions_category_id_level_idx" ON "course_versions"("category_id", "level");

-- CreateIndex
CREATE UNIQUE INDEX "course_versions_course_id_version_key" ON "course_versions"("course_id", "version");

-- CreateIndex
CREATE INDEX "modules_course_id_position_idx" ON "modules"("course_id", "position");

-- CreateIndex
CREATE INDEX "lessons_module_id_position_idx" ON "lessons"("module_id", "position");

-- CreateIndex
CREATE INDEX "lesson_resources_lesson_id_position_idx" ON "lesson_resources"("lesson_id", "position");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_published_version_id_fkey" FOREIGN KEY ("published_version_id") REFERENCES "course_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_versions" ADD CONSTRAINT "course_versions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_versions" ADD CONSTRAINT "course_versions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_versions" ADD CONSTRAINT "course_versions_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modules" ADD CONSTRAINT "modules_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written additions (Prisma can't express these).
-- ---------------------------------------------------------------------------

-- Slugs are lower-case, URL-safe words joined by single hyphens.
ALTER TABLE "categories" ADD CONSTRAINT "categories_slug_format"
  CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length("slug") <= 80);
ALTER TABLE "courses" ADD CONSTRAINT "courses_slug_format"
  CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length("slug") <= 80);

ALTER TABLE "courses" ADD CONSTRAINT "courses_estimated_minutes_range"
  CHECK ("estimated_minutes" BETWEEN 0 AND 100000);
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_estimated_minutes_range"
  CHECK ("estimated_minutes" BETWEEN 0 AND 10000);
ALTER TABLE "modules" ADD CONSTRAINT "modules_position_non_negative" CHECK ("position" >= 0);
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_position_non_negative" CHECK ("position" >= 0);
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_position_non_negative"
  CHECK ("position" >= 0);

-- A resource points at exactly one place, and external links are https only.
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_one_location"
  CHECK (("storage_key" IS NULL) <> ("external_url" IS NULL));
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_https_only"
  CHECK ("external_url" IS NULL OR "external_url" LIKE 'https://%');

-- A published version always belongs to the course that points at it.
ALTER TABLE "course_versions" ADD CONSTRAINT "course_versions_version_positive"
  CHECK ("version" >= 1);

-- Full-text search over published versions: title weighted above summary and keywords.
-- A trigger fills the column (a generated column confuses Prisma's schema diff).
-- Versions are immutable, so it only needs to run on insert.
ALTER TABLE "course_versions" ADD COLUMN "search_vector" tsvector;
CREATE INDEX "course_versions_search_vector_idx" ON "course_versions" USING GIN ("search_vector");

CREATE FUNCTION "course_versions_search_vector_fill"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW."search_vector" :=
    setweight(to_tsvector('english', coalesce(NEW."title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW."search_text", '')), 'B');
  RETURN NEW;
END;
$$;

CREATE TRIGGER "course_versions_search_vector_fill"
  BEFORE INSERT OR UPDATE OF "title", "search_text" ON "course_versions"
  FOR EACH ROW EXECUTE FUNCTION "course_versions_search_vector_fill"();
