import { Module } from '@nestjs/common';
import { AdminAssessmentsController } from './admin-assessments.controller.js';
import { AdminCategoriesController } from './admin-categories.controller.js';
import { AdminCoursesController } from './admin-courses.controller.js';
import { AssessmentAuthoringService } from './assessment-authoring.service.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { CourseAuthoringService } from './course-authoring.service.js';

/** Catalogue (public) and course authoring (content editors and administrators). */
@Module({
  controllers: [
    CatalogController,
    AdminCategoriesController,
    AdminCoursesController,
    AdminAssessmentsController,
  ],
  providers: [CatalogService, CourseAuthoringService, AssessmentAuthoringService],
})
export class CoursesModule {}
