import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

type ApiResponse = {
  status?: unknown;
  message?: unknown;
  data?: unknown;
  pagination?: unknown;
  [key: string]: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((body) => this.wrap(body)));
  }

  private wrap(body: unknown) {
    if (!isRecord(body)) {
      return {
        status: 'success',
        message: 'Request successful',
        data: body ?? null,
      };
    }

    const response = body as ApiResponse;
    const status =
      typeof response.status === 'string' ? response.status : 'success';
    const message =
      typeof response.message === 'string'
        ? response.message
        : 'Request successful';
    const extra = this.pickExtraData(response);
    const { data, pagination } = this.normalizeData(response, extra);

    return {
      status,
      message,
      data,
      ...(pagination ? { pagination } : {}),
    };
  }

  private normalizeData(
    response: ApiResponse,
    extra: Record<string, unknown>,
  ) {
    const pagination = response.pagination;

    if ('data' in response) {
      const nestedData = response.data;
      if (isRecord(nestedData)) {
        const { pagination: nestedPagination, ...cleanData } = nestedData;
        return {
          data: { ...cleanData, ...extra },
          pagination: pagination ?? nestedPagination,
        };
      }

      return {
        data:
          Object.keys(extra).length > 0
            ? { value: nestedData ?? null, ...extra }
            : (nestedData ?? null),
        pagination,
      };
    }

    return {
      data: Object.keys(extra).length > 0 ? extra : null,
      pagination,
    };
  }

  private pickExtraData(response: ApiResponse) {
    const { status, message, data, pagination, ...extra } = response;
    void status;
    void message;
    void data;
    void pagination;
    return extra;
  }
}
