import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CacheService } from '../cache/cache.service';

const IDEMPOTENCY_TTL = 3600; // 1 hour (reduced from 24h to save Redis commands)

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly cacheService: CacheService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest();
    const idempotencyKey = request.headers['idempotency-key'];

    if (!idempotencyKey) {
      return next.handle();
    }

    const cacheKey = `idempotency:${request.method}:${request.path}:${idempotencyKey}`;

    const cached = await this.cacheService.get<{
      status: number;
      body: unknown;
    }>(cacheKey);

    if (cached) {
      this.logger.debug(`Idempotency cache hit for key: ${idempotencyKey}`);
      return of(cached.body).pipe(tap(() => {
        const response = context.switchToHttp().getResponse();
        response.status(cached.status);
        response.setHeader('X-Idempotent-Replay', 'true');
      }));
    }

    return next.handle().pipe(
      tap(async (data) => {
        const response = context.switchToHttp().getResponse();
        const statusCode = response.statusCode;

        if (statusCode >= 200 && statusCode < 300) {
          await this.cacheService.set(
            cacheKey,
            { status: statusCode, body: data },
            IDEMPOTENCY_TTL,
          );
          this.logger.debug(`Cached response for idempotency key: ${idempotencyKey}`);
        }
      }),
    );
  }
}
