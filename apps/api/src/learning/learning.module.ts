import { Module } from '@nestjs/common';
import { LearningController } from './learning.controller.js';
import { LearningService } from './learning.service.js';

/** Enrolment, lesson access and progress (EnrollmentModule and ProgressModule in the plan). */
@Module({ controllers: [LearningController], providers: [LearningService] })
export class LearningModule {}
