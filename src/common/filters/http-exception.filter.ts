import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

type ExceptionBody = {
  message?: string | string[];
  error?: string;
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const request = host.switchToHttp().getRequest<Request>();
    const response = host.switchToHttp().getResponse<Response>();
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (statusCode === HttpStatus.TOO_MANY_REQUESTS) {
      this.logRateLimitExceeded(request, exception, statusCode);
    }

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

  private logRateLimitExceeded(
    request: Request,
    exception: unknown,
    statusCode: number,
  ) {
    this.logger.warn(
      [
        `Rate limit exceeded status=${statusCode}`,
        `method=${request.method}`,
        `url=${request.originalUrl ?? request.url}`,
        `ip=${request.ip}`,
        `xForwardedFor=${this.headerValue(request, 'x-forwarded-for')}`,
        `xRealIp=${this.headerValue(request, 'x-real-ip')}`,
        `userAgent=${this.headerValue(request, 'user-agent')}`,
        `message=${this.getMessage(exception, statusCode)}`,
      ].join(' '),
    );
  }

  private headerValue(request: Request, name: string) {
    const value = request.headers[name];
    if (Array.isArray(value)) return value.join(',');
    return value ?? 'none';
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
