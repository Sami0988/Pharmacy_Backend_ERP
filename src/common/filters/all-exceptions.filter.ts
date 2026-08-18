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

    this.logger.error(
      `${exception instanceof Error ? exception.constructor.name : String(exception)} - ${request.url}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse.slice(0, 500);
        error = exception.name;
      } else if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as Record<string, unknown>;
        message = (responseObj.message as string) || message;
        error = (responseObj.error as string) || error;

        if (Array.isArray(responseObj.message)) {
          message = responseObj.message.join(', ');
        }
        // Truncate message to avoid large responses
        message = String(message).slice(0, 500);
      }
    } else {
      if (!isProduction) {
        message =
          exception instanceof Error
            ? exception.message.slice(0, 500)
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
