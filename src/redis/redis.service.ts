import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'ioredis';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly connections: Redis[] = [];

  constructor(private readonly config: ConfigService) {}

  createConnection() {
    const connection = new Redis(this.connectionOptions);
    this.connections.push(connection);
    return connection;
  }

  get connectionOptions(): RedisOptions {
    const redisUrl = new URL(
      this.config.get<string>('REDIS_URL', 'redis://localhost:6379'),
    );

    return {
      host: redisUrl.hostname,
      port: Number(redisUrl.port || 6379),
      username: redisUrl.username || undefined,
      password: redisUrl.password || undefined,
      db: redisUrl.pathname ? Number(redisUrl.pathname.slice(1) || 0) : 0,
      maxRetriesPerRequest: null,
    };
  }

  async onModuleDestroy() {
    await Promise.all(
      this.connections.map((connection) => connection.quit().catch(() => null)),
    );
  }
}
