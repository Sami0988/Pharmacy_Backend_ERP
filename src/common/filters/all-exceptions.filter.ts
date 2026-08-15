import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const isProduction = process.env.NODE_ENV === 'production';

    console.log(`[ExceptionFilter] Caught: ${exception instanceof Error ? exception.constructor.name : String(exception)}`);
    console.log(`[ExceptionFilter] Path: ${request.url}`);
    if (exception instanceof Error) {
      console.log(`[ExceptionFilter] Message: ${exception.message}`);
      if (exception.cause instanceof Error) {
        console.log(`[ExceptionFilter] Cause: ${exception.cause.message}`);
        console.log(`[ExceptionFilter] Cause Stack: ${exception.cause.stack}`);
      }
    }

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = exception.name;
      } else if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as Record<string, unknown>;
        message = (responseObj.message as string) || message;
        error = (responseObj.error as string) || error;

        if (Array.isArray(responseObj.message)) {
          message = responseObj.message.join(', ');
        }
      }
    } else {
      this.logger.error(
        `Unhandled exception: ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
      if (!isProduction) {
        message =
          exception instanceof Error
            ? exception.message
            : 'Internal server error';
      }
    }

    const body: Record<string, unknown> = {
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
    };

    if (!isProduction) {
      body.path = request.url;
    }

    response.status(status).json(body);
  }
}
