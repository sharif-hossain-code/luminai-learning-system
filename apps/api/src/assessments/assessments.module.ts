import { Module } from '@nestjs/common';
import { LearningModule } from '../learning/learning.module.js';
import { AssessmentsController } from './assessments.controller.js';
import { AssessmentsService } from './assessments.service.js';
import { MockWritingFeedbackProvider, WRITING_FEEDBACK_PROVIDER } from './writing-feedback.js';

/**
 * Taking assessments: attempts, answers, scoring and feedback (AssessmentModule in
 * the plan). Authoring lives with the course studio in CoursesModule.
 */
@Module({
  imports: [LearningModule],
  controllers: [AssessmentsController],
  providers: [
    AssessmentsService,
    // The mock stays until an AI provider is chosen (assumption A6, Phase 6).
    { provide: WRITING_FEEDBACK_PROVIDER, useClass: MockWritingFeedbackProvider },
  ],
})
export class AssessmentsModule {}
