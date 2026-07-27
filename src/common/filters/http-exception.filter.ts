import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

type ExceptionBody = {
  message?: string | string[];
  error?: string;
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (statusCode >= 500) {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(statusCode).json({
      status: 'error',
      message: this.getMessage(exception, statusCode),
      data: null,
    });
  }

  private getMessage(exception: unknown, statusCode: number) {
    if (!(exception instanceof HttpException)) {
      return 'Internal server error';
    }

    const response = exception.getResponse();
    if (typeof response === 'string') return response;

    const body = response as ExceptionBody;
    if (Array.isArray(body.message)) return body.message.join(', ');
    if (body.message) return body.message;
    if (body.error) return body.error;

    return statusCode >= 500 ? 'Internal server error' : 'Request failed';
  }
}
