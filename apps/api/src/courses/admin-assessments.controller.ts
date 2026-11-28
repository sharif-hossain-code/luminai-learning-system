import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import {
  createAssessmentRequestSchema,
  createQuestionRequestSchema,
  reorderRequestSchema,
  updateAssessmentRequestSchema,
  updateQuestionRequestSchema,
  type CreateAssessmentRequest,
  type QuestionType,
  type UpdateAssessmentRequest,
  type UpdateQuestionRequest,
} from '@luminai/contracts';
import { RoleCode } from '@luminai/database';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { type AuthContext, CurrentAuth, Roles } from '../identity/auth-context.js';
import { AssessmentAuthoringService } from './assessment-authoring.service.js';
import type { Actor } from './course-authoring.service.js';

const uuid = { schema: z.uuid() };
const actor = (auth: AuthContext, request: FastifyRequest): Actor => ({ ...auth, ip: request.ip });

/**
 * Quiz and question authoring. Like the rest of the studio, every route answers
 * with the whole updated course (answer keys included: editors only).
 */
@Controller('admin')
@Roles(RoleCode.CONTENT_EDITOR, RoleCode.ADMIN)
export class AdminAssessmentsController {
  constructor(private readonly authoring: AssessmentAuthoringService) {}

  @Post('courses/:courseId/assessments')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Param('courseId', uuid) courseId: string,
    @Body({ schema: createAssessmentRequestSchema }) body: CreateAssessmentRequest,
  ) {
    return { data: await this.authoring.createAssessment(actor(auth, request), courseId, body) };
  }

  @Patch('assessments/:assessmentId')
  async update(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Param('assessmentId', uuid) assessmentId: string,
    @Body({ schema: updateAssessmentRequestSchema }) body: UpdateAssessmentRequest,
  ) {
    return {
      data: await this.authoring.updateAssessment(actor(auth, request), assessmentId, body),
    };
  }

  @Delete('assessments/:assessmentId')
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Param('assessmentId', uuid) assessmentId: string,
  ) {
    return { data: await this.authoring.deleteAssessment(actor(auth, request), assessmentId) };
  }

  @Post('assessments/:assessmentId/questions')
  @HttpCode(HttpStatus.CREATED)
  async createQuestion(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Param('assessmentId', uuid) assessmentId: string,
    @Body({ schema: createQuestionRequestSchema }) body: { type: QuestionType },
  ) {
    return {
      data: await this.authoring.createQuestion(actor(auth, request), assessmentId, body),
    };
  }

  @Put('assessments/:assessmentId/question-order')
  async reorderQuestions(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Param('assessmentId', uuid) assessmentId: string,
    @Body({ schema: reorderRequestSchema }) body: { ids: string[] },
  ) {
    return {
      data: await this.authoring.reorderQuestions(actor(auth, request), assessmentId, body.ids),
    };
  }

  @Patch('questions/:questionId')
  async updateQuestion(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Param('questionId', uuid) questionId: string,
    @Body({ schema: updateQuestionRequestSchema }) body: UpdateQuestionRequest,
  ) {
    return { data: await this.authoring.updateQuestion(actor(auth, request), questionId, body) };
  }

  @Delete('questions/:questionId')
  async deleteQuestion(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Param('questionId', uuid) questionId: string,
  ) {
    return { data: await this.authoring.deleteQuestion(actor(auth, request), questionId) };
  }
}
