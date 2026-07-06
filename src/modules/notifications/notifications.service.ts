import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { paginationMeta } from '../../common/types/pagination';
import { PrismaService } from '../../database/prisma.service';
import { QueuesService } from '../../queues/queues.service';
import { ListNotificationsQuery } from './dto/list-notifications.query';

type NotifyUserArgs = {
  userId: string;
  type?: NotificationType;
  title: string;
  message: string;
  data?: Prisma.InputJsonObject;
  push?: boolean;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueuesService,
  ) {}

  async notifyUser(args: NotifyUserArgs) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: args.userId,
        type: args.type ?? NotificationType.GENERAL,
        title: args.title,
        message: args.message,
        data: args.data,
      },
    });

    if (args.push !== false) {
      await this.queues
        .enqueuePushNotification({
          userId: args.userId,
          title: args.title,
          body: args.message,
          data: {
            notificationId: notification.id,
            type: notification.type,
            ...(args.data ?? {}),
          },
        })
        .catch((error: unknown) => {
          this.logger.error('Unable to enqueue push notification', error);
        });
    }

    return notification;
  }

  async notifyUserSafely(args: NotifyUserArgs) {
    await this.notifyUser(args).catch((error: unknown) => {
      this.logger.error('Unable to create notification', error);
    });
  }

  async listMine(userId: string, query: ListNotificationsQuery) {
    const where = {
      userId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.isRead !== undefined
        ? { readAt: query.isRead ? { not: null } : null }
        : {}),
    };

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      notifications,
      pagination: paginationMeta(query.page, query.limit, total),
    };
  }

  markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
