import { Module } from '@nestjs/common';
import { AdminCategoriesController } from './admin-categories.controller.js';
import { AdminCoursesController } from './admin-courses.controller.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { CourseAuthoringService } from './course-authoring.service.js';

/** Catalogue (public) and course authoring (content editors and administrators). */
@Module({
  controllers: [CatalogController, AdminCategoriesController, AdminCoursesController],
  providers: [CatalogService, CourseAuthoringService],
})
export class CoursesModule {}
