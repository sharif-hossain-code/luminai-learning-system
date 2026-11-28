import { Body, Controller, Get, HttpStatus, Param, Post, Put, Query, Res } from '@nestjs/common';
import {
  myEnrollmentsQuerySchema,
  updateLessonProgressRequestSchema,
  type UpdateLessonProgressRequest,
} from '@luminai/contracts';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { type AuthContext, CurrentAuth } from '../identity/auth-context.js';
import { byUser, RateLimit } from '../rate-limit/rate-limit.js';
import { LearningService } from './learning.service.js';

const uuid = { schema: z.uuid() };

/**
 * Enrolment, lessons and progress for the signed-in learner. Every route needs a
 * session, and the learner is always taken from it, never from the request.
 */
@Controller()
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  @Post('courses/:courseId/enrollments')
  @RateLimit({ name: 'enrol:user', limit: 30, windowSeconds: 60, key: byUser })
  async enrol(
    @CurrentAuth() auth: AuthContext,
    @Param('courseId', uuid) courseId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { enrollment, created } = await this.learning.enrol(auth.userId, courseId);
    void reply.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return { data: enrollment };
  }

  @Get('courses/:courseIdOrSlug/learning')
  async course(
    @CurrentAuth() auth: AuthContext,
    @Param('courseIdOrSlug', { schema: z.string().trim().min(1).max(80) }) idOrSlug: string,
  ) {
    return { data: await this.learning.learnerCourse(auth.userId, idOrSlug) };
  }

  @Get('lessons/:lessonId')
  async lesson(@CurrentAuth() auth: AuthContext, @Param('lessonId', uuid) lessonId: string) {
    return { data: await this.learning.lesson(auth.userId, lessonId) };
  }

  /** Media players save every few seconds; the limit is far above that. */
  @Put('lessons/:lessonId/progress')
  @RateLimit({ name: 'progress:user', limit: 300, windowSeconds: 5 * 60, key: byUser })
  async saveProgress(
    @CurrentAuth() auth: AuthContext,
    @Param('lessonId', uuid) lessonId: string,
    @Body({ schema: updateLessonProgressRequestSchema }) body: UpdateLessonProgressRequest,
  ) {
    return { data: await this.learning.saveProgress(auth.userId, lessonId, body) };
  }

  @Get('users/me/enrollments')
  async myEnrollments(
    @CurrentAuth() auth: AuthContext,
    @Query({ schema: myEnrollmentsQuerySchema }) query: z.infer<typeof myEnrollmentsQuerySchema>,
  ) {
    return { data: await this.learning.myEnrollments(auth.userId, query.status) };
  }

  @Get('users/me/continue-learning')
  async continueLearning(@CurrentAuth() auth: AuthContext) {
    return { data: await this.learning.continueLearning(auth.userId) };
  }
}
