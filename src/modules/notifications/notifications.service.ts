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

type BroadcastArgs = {
  title: string;
  message: string;
  userIds?: string[];
  data?: Prisma.InputJsonObject;
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

  async broadcast(args: BroadcastArgs) {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        ...(args.userIds?.length ? { id: { in: args.userIds } } : {}),
      },
      select: { id: true },
    });

    await Promise.all(
      users.map((user) =>
        this.notifyUserSafely({
          userId: user.id,
          type: NotificationType.GENERAL,
          title: args.title,
          message: args.message,
          data: args.data,
        }),
      ),
    );

    return { sent: users.length };
  }

  async listMine(userId: string, query: ListNotificationsQuery) {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.isRead !== undefined
        ? query.isRead
          ? { readAt: { not: null } }
          : { OR: [{ readAt: null }, { readAt: { isSet: false } }] }
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
    return this.prisma.notification
      .updateMany({
        where: {
          id,
          userId,
          OR: [{ readAt: null }, { readAt: { isSet: false } }],
        },
        data: { readAt: new Date() },
      })
      .then((result) => ({ updatedCount: result.count }));
  }

  markAllRead(userId: string) {
    return this.prisma.notification
      .updateMany({
        where: {
          userId,
          OR: [{ readAt: null }, { readAt: { isSet: false } }],
        },
        data: { readAt: new Date() },
      })
      .then((result) => ({ updatedCount: result.count }));
  }

  async unreadCount(userId: string) {
    const unreadCount = await this.prisma.notification.count({
      where: {
        userId,
        OR: [{ readAt: null }, { readAt: { isSet: false } }],
      },
    });
    return { unreadCount };
  }
}
