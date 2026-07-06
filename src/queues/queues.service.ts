import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ExpoPushService } from './expo-push.service';

type PushNotificationJob = {
  userId?: string;
  expoPushTokens?: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type PushRecipient = Pick<PushNotificationJob, 'userId' | 'expoPushTokens'>;

type PickupReminderJob = {
  userId: string;
  depositRequestId: string;
  scheduledPickupAt: string;
  itemName: string;
};

@Injectable()
export class QueuesService implements OnModuleDestroy {
  private readonly logger = new Logger(QueuesService.name);
  private pushQueue?: Queue<PushNotificationJob, void, 'push_notification'>;
  private pushWorker?: Worker<PushNotificationJob, void, 'push_notification'>;
  private pickupReminderQueue?: Queue<
    PickupReminderJob,
    void,
    'pickup_reminder'
  >;
  private pickupReminderWorker?: Worker<
    PickupReminderJob,
    void,
    'pickup_reminder'
  >;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly expoPush: ExpoPushService,
  ) {}

  async enqueuePushNotification(job: PushNotificationJob) {
    const queue = this.getPushQueue();
    await queue.add('push_notification', job);
    this.ensurePushWorker();
  }

  async enqueuePickupReminder(job: PickupReminderJob) {
    const delay = new Date(job.scheduledPickupAt).getTime() - Date.now();
    if (delay <= 0) return;

    const queue = this.getPickupReminderQueue();
    await queue.add('pickup_reminder', job, {
      delay,
      jobId: `pickup-reminder:${job.depositRequestId}`,
    });
    this.ensurePickupReminderWorker();
  }

  private getPushQueue() {
    if (!this.pushQueue) {
      this.pushQueue = new Queue<PushNotificationJob, void, 'push_notification'>(
        'push_notification',
        {
          connection: this.redis.connectionOptions,
          defaultJobOptions: {
            attempts: 10,
            backoff: { type: 'exponential', delay: 30000 },
            removeOnComplete: true,
            removeOnFail: 1000,
          },
        },
      );
    }
    return this.pushQueue;
  }

  private ensurePushWorker() {
    if (this.pushWorker) return;

    this.pushWorker = new Worker<PushNotificationJob, void, 'push_notification'>(
      'push_notification',
      (job) => this.processPushNotification(job),
      { connection: this.redis.connectionOptions, concurrency: 3 },
    );

    this.pushWorker.on('failed', (job, error) => {
      this.logger.error(`Push notification job ${job?.id} failed`, error);
    });
  }

  private async processPushNotification(
    job: Job<PushNotificationJob, void, 'push_notification'>,
  ) {
    const tokens = await this.resolvePushTokens(job.data);
    if (tokens.length === 0) return;

    await this.expoPush.sendMany({
      expoPushTokens: tokens,
      title: job.data.title,
      body: job.data.body,
      data: job.data.data,
    });
  }

  private async resolvePushTokens(job: PushRecipient) {
    if (job.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: job.userId },
        select: {
          pushToken: true,
          pushNotificationsEnabled: true,
        },
      });
      return user?.pushNotificationsEnabled && user.pushToken
        ? [user.pushToken]
        : [];
    }

    return job.expoPushTokens ?? [];
  }

  private getPickupReminderQueue() {
    if (!this.pickupReminderQueue) {
      this.pickupReminderQueue = new Queue<
        PickupReminderJob,
        void,
        'pickup_reminder'
      >('pickup_reminder', {
        connection: this.redis.connectionOptions,
        defaultJobOptions: {
          attempts: 10,
          backoff: { type: 'exponential', delay: 30000 },
          removeOnComplete: true,
          removeOnFail: 1000,
        },
      });
    }
    return this.pickupReminderQueue;
  }

  private ensurePickupReminderWorker() {
    if (this.pickupReminderWorker) return;

    this.pickupReminderWorker = new Worker<
      PickupReminderJob,
      void,
      'pickup_reminder'
    >(
      'pickup_reminder',
      (job) => this.processPickupReminder(job),
      { connection: this.redis.connectionOptions, concurrency: 3 },
    );

    this.pickupReminderWorker.on('failed', (job, error) => {
      this.logger.error(`Pickup reminder job ${job?.id} failed`, error);
    });
  }

  private async processPickupReminder(
    job: Job<PickupReminderJob, void, 'pickup_reminder'>,
  ) {
    const tokens = await this.resolvePushTokens({ userId: job.data.userId });
    if (tokens.length === 0) return;

    await this.expoPush.sendMany({
      expoPushTokens: tokens,
      title: 'Pickup reminder',
      body: `Your ${job.data.itemName} pickup is scheduled for tomorrow.`,
      data: {
        depositRequestId: job.data.depositRequestId,
        scheduledPickupAt: job.data.scheduledPickupAt,
        type: 'PICKUP_REMINDER',
      },
    });
  }

  async onModuleDestroy() {
    await Promise.all([
      this.pushWorker?.close(),
      this.pushQueue?.close(),
      this.pickupReminderWorker?.close(),
      this.pickupReminderQueue?.close(),
    ]);
  }
}
