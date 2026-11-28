import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, Res } from '@nestjs/common';
import {
  saveAnswerRequestSchema,
  submitAttemptRequestSchema,
  type SaveAnswerRequest,
  type SubmitAttemptRequest,
} from '@luminai/contracts';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { type AuthContext, CurrentAuth } from '../identity/auth-context.js';
import { byUser, RateLimit } from '../rate-limit/rate-limit.js';
import { AssessmentsService } from './assessments.service.js';

const uuid = { schema: z.uuid() };

/**
 * Taking assessments, for the signed-in learner (any role can learn). The learner
 * always comes from the session, and attempts belonging to anyone else are 404.
 */
@Controller()
export class AssessmentsController {
  constructor(private readonly assessments: AssessmentsService) {}

  @Get('assessments/:assessmentId')
  async assessment(
    @CurrentAuth() auth: AuthContext,
    @Param('assessmentId', uuid) assessmentId: string,
  ) {
    return { data: await this.assessments.assessment(auth.userId, assessmentId) };
  }

  /** 201 with a new attempt, or 200 with the attempt already in progress. */
  @Post('assessments/:assessmentId/attempts')
  @RateLimit({ name: 'attempt-start:user', limit: 30, windowSeconds: 60, key: byUser })
  async start(
    @CurrentAuth() auth: AuthContext,
    @Param('assessmentId', uuid) assessmentId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { attempt, created } = await this.assessments.start(auth.userId, assessmentId);
    void reply.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return { data: attempt };
  }

  @Get('attempts/:attemptId')
  async attempt(@CurrentAuth() auth: AuthContext, @Param('attemptId', uuid) attemptId: string) {
    return { data: await this.assessments.get(auth.userId, attemptId) };
  }

  /** Autosave: the quiz page saves each answer as it changes. */
  @Put('attempts/:attemptId/answers/:questionId')
  @RateLimit({ name: 'answer:user', limit: 600, windowSeconds: 5 * 60, key: byUser })
  async saveAnswer(
    @CurrentAuth() auth: AuthContext,
    @Param('attemptId', uuid) attemptId: string,
    @Param('questionId', uuid) questionId: string,
    @Body({ schema: saveAnswerRequestSchema }) body: SaveAnswerRequest,
  ) {
    return {
      data: await this.assessments.saveAnswer(auth.userId, attemptId, questionId, body.response),
    };
  }

  @Post('attempts/:attemptId/submit')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'attempt-submit:user', limit: 30, windowSeconds: 60, key: byUser })
  async submit(
    @CurrentAuth() auth: AuthContext,
    @Param('attemptId', uuid) attemptId: string,
    @Body({ schema: submitAttemptRequestSchema }) body: SubmitAttemptRequest,
  ) {
    return { data: await this.assessments.submit(auth.userId, attemptId, body) };
  }
}
