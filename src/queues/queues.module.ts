import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { ExpoPushService } from './expo-push.service';
import { QueuesService } from './queues.service';

@Module({
  imports: [DatabaseModule, RedisModule],
  providers: [QueuesService, ExpoPushService],
  exports: [QueuesService],
})
export class QueuesModule {}
