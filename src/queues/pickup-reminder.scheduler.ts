import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DepositStatus, NotificationType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { QueuesService } from './queues.service';

type ReminderWindow = {
  start: Date;
  end: Date;
};

export type PickupReminderRunResult = {
  dayBeforeSent: number;
  pickupMorningSent: number;
};

@Injectable()
export class PickupReminderScheduler {
  private readonly logger = new Logger(PickupReminderScheduler.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly queues: QueuesService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sendDuePickupReminders() {
    if (this.config.get<string>('QUEUE_DRIVER', 'scheduler') === 'redis') {
      return;
    }

    const now = new Date();
    if (now.getHours() < 8) {
      return;
    }

    await this.runDuePickupReminders(now);
  }

  async runDuePickupReminders(now = new Date()): Promise<PickupReminderRunResult> {
    const [dayBeforeSent, pickupMorningSent] = await Promise.all([
      this.sendDayBeforeReminders(now),
      this.sendPickupMorningReminders(now),
    ]);
    return { dayBeforeSent, pickupMorningSent };
  }

  private async sendDayBeforeReminders(now: Date) {
    const window = this.dayWindow(this.addDays(now, 1));
    const deposits = await this.prisma.depositRequest.findMany({
      where: {
        status: DepositStatus.SCHEDULED,
        scheduledPickupAt: { gte: window.start, lt: window.end },
        OR: [
          { dayBeforeReminderSentAt: null },
          { dayBeforeReminderSentAt: { isSet: false } },
        ],
      },
      select: this.reminderSelect,
    });

    await Promise.all(
      deposits.map(async (deposit) => {
        await this.prisma.notification.create({
          data: {
            userId: deposit.userId,
            type: NotificationType.PICKUP_REMINDER,
            title: 'Pickup reminder',
            message: `Your ${deposit.itemName} pickup is scheduled for tomorrow.`,
            data: {
              depositRequestId: deposit.id,
              scheduledPickupAt: deposit.scheduledPickupAt?.toISOString(),
              itemName: deposit.itemName,
            },
          },
        });
        await this.queues
          .sendPickupReminderPush({
            userId: deposit.userId,
            depositRequestId: deposit.id,
            scheduledPickupAt:
              deposit.scheduledPickupAt?.toISOString() ?? now.toISOString(),
            itemName: deposit.itemName,
          })
          .catch((error: unknown) => {
            this.logger.error('Unable to send day-before pickup push', error);
          });
        await this.prisma.depositRequest.update({
          where: { id: deposit.id },
          data: { dayBeforeReminderSentAt: new Date() },
        });
      }),
    );

    return deposits.length;
  }

  private async sendPickupMorningReminders(now: Date) {
    const window = this.dayWindow(now);
    const deposits = await this.prisma.depositRequest.findMany({
      where: {
        status: DepositStatus.SCHEDULED,
        scheduledPickupAt: { gte: window.start, lt: window.end },
        OR: [
          { pickupMorningReminderSentAt: null },
          { pickupMorningReminderSentAt: { isSet: false } },
        ],
      },
      select: this.reminderSelect,
    });

    await Promise.all(
      deposits.map(async (deposit) => {
        await this.prisma.notification.create({
          data: {
            userId: deposit.userId,
            type: NotificationType.PICKUP_REMINDER,
            title: 'Pickup today',
            message: `Your ${deposit.itemName} pickup is scheduled for today.`,
            data: {
              depositRequestId: deposit.id,
              scheduledPickupAt: deposit.scheduledPickupAt?.toISOString(),
              itemName: deposit.itemName,
            },
          },
        });
        await this.queues
          .sendPickupReminderPush(
            {
              userId: deposit.userId,
              depositRequestId: deposit.id,
              scheduledPickupAt:
                deposit.scheduledPickupAt?.toISOString() ?? now.toISOString(),
              itemName: deposit.itemName,
            },
            'Pickup today',
            `Your ${deposit.itemName} pickup is scheduled for today.`,
          )
          .catch((error: unknown) => {
            this.logger.error('Unable to send pickup morning push', error);
          });
        await this.prisma.depositRequest.update({
          where: { id: deposit.id },
          data: { pickupMorningReminderSentAt: new Date() },
        });
      }),
    );

    return deposits.length;
  }

  private dayWindow(date: Date): ReminderWindow {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = this.addDays(start, 1);
    return { start, end };
  }

  private addDays(date: Date, days: number) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private get reminderSelect() {
    return {
      id: true,
      userId: true,
      itemName: true,
      scheduledPickupAt: true,
    };
  }
}
