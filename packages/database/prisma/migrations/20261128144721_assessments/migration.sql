-- CreateEnum
CREATE TYPE "question_type" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_TEXT', 'WRITING');

-- CreateEnum
CREATE TYPE "assessment_feedback_mode" AS ENUM ('SCORE_ONLY', 'CORRECTNESS', 'FULL');

-- CreateEnum
CREATE TYPE "attempt_status" AS ENUM ('IN_PROGRESS', 'SUBMITTED');

-- CreateTable
CREATE TABLE "assessments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_id" UUID NOT NULL,
    "module_id" UUID,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "pass_percent" INTEGER NOT NULL DEFAULT 70,
    "max_attempts" INTEGER,
    "feedback_mode" "assessment_feedback_mode" NOT NULL DEFAULT 'FULL',
    "estimated_minutes" INTEGER NOT NULL DEFAULT 10,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assessment_id" UUID NOT NULL,
    "type" "question_type" NOT NULL DEFAULT 'SINGLE_CHOICE',
    "prompt" TEXT NOT NULL DEFAULT '',
    "options" JSONB NOT NULL DEFAULT '[]',
    "answer_key" JSONB NOT NULL DEFAULT '{}',
    "explanation" TEXT NOT NULL DEFAULT '',
    "rubric" JSONB NOT NULL DEFAULT '{}',
    "points" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "course_version_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" "attempt_status" NOT NULL DEFAULT 'IN_PROGRESS',
    "score" INTEGER,
    "max_score" INTEGER NOT NULL,
    "percent" INTEGER,
    "passed" BOOLEAN,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMPTZ(3),
    "evaluated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assessment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "response" JSONB NOT NULL,
    "awarded_points" INTEGER,
    "is_correct" BOOLEAN,
    "feedback" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attempt_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assessments_course_id_module_id_position_idx" ON "assessments"("course_id", "module_id", "position");

-- CreateIndex
CREATE INDEX "assessments_module_id_idx" ON "assessments"("module_id");

-- CreateIndex
CREATE INDEX "questions_assessment_id_position_idx" ON "questions"("assessment_id", "position");

-- CreateIndex
CREATE INDEX "assessment_attempts_user_id_submitted_at_idx" ON "assessment_attempts"("user_id", "submitted_at");

-- CreateIndex
CREATE INDEX "assessment_attempts_enrollment_id_idx" ON "assessment_attempts"("enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_attempts_user_id_assessment_id_attempt_number_key" ON "assessment_attempts"("user_id", "assessment_id", "attempt_number");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_answers_attempt_id_question_id_key" ON "attempt_answers"("attempt_id", "question_id");

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_course_version_id_fkey" FOREIGN KEY ("course_version_id") REFERENCES "course_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "assessment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Values stay in range whatever the application does.
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_pass_percent_range" CHECK ("pass_percent" BETWEEN 0 AND 100);
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_max_attempts_positive" CHECK ("max_attempts" IS NULL OR "max_attempts" >= 1);
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_minutes_non_negative" CHECK ("estimated_minutes" >= 0);
ALTER TABLE "questions" ADD CONSTRAINT "questions_points_non_negative" CHECK ("points" >= 0);
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_number_positive" CHECK ("attempt_number" >= 1);
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_score_range" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= "max_score"));
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_percent_range" CHECK ("percent" IS NULL OR "percent" BETWEEN 0 AND 100);
-- A submitted attempt always has its submission time, score and result; an open one has none.
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_submitted" CHECK (
  ("status" = 'SUBMITTED') = ("submitted_at" IS NOT NULL)
  AND ("status" = 'SUBMITTED') = ("score" IS NOT NULL)
  AND ("status" = 'SUBMITTED') = ("passed" IS NOT NULL)
);
-- At most one open attempt per learner and assessment, even under concurrent starts.
CREATE UNIQUE INDEX "assessment_attempts_one_open" ON "assessment_attempts" ("user_id", "assessment_id") WHERE "status" = 'IN_PROGRESS';
