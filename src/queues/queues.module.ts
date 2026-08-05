import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { ExpoPushService } from './expo-push.service';
import { InternalJobsController } from './internal-jobs.controller';
import { PickupReminderScheduler } from './pickup-reminder.scheduler';
import { QueuesService } from './queues.service';

@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [InternalJobsController],
  providers: [QueuesService, ExpoPushService, PickupReminderScheduler],
  exports: [QueuesService],
})
export class QueuesModule {}
