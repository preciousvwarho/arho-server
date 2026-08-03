import { BadRequestException, Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { paginationMeta } from '../../common/types/pagination';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { UploadedImage } from '../uploads/uploads.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { ListDepositsQuery } from './dto/list-deposits.query';

@Injectable()
export class DepositsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(
    userId: string,
    dto: CreateDepositDto,
    uploadedImage?: UploadedImage,
  ) {
    if (!dto.locationId && !dto.customLocation) {
      throw new BadRequestException(
        'Provide a pickup area or a custom location',
      );
    }
    if (dto.preferredPickupAt && dto.preferredPickupAt <= new Date()) {
      throw new BadRequestException(
        'Preferred pickup date must be in the future',
      );
    }
    const imageUrl = uploadedImage?.url ?? dto.imageUrl;
    const imageId = uploadedImage?.publicId ?? dto.imageId;
    if (!imageUrl) {
      throw new BadRequestException('Provide an image upload or imageUrl');
    }

    const item = await this.prisma.item.findUniqueOrThrow({
      where: { id: dto.itemId, isActive: true },
    });
    const deposit = await this.prisma.depositRequest.create({
      data: {
        userId,
        itemId: item.id,
        locationId: dto.locationId,
        customLocation: dto.customLocation,
        itemName: item.name,
        weightKg: item.weightKg,
        pointValue: item.pointValue,
        imageUrl,
        imageId,
        preferredPickupAt: dto.preferredPickupAt,
      },
      include: { item: true, location: true },
    });

    await this.notifications.notifyUserSafely({
      userId,
      type: NotificationType.DEPOSIT_CREATED,
      title: 'Deposit request submitted',
      message: `Your ${deposit.itemName} pickup request has been submitted successfully.`,
      data: {
        depositRequestId: deposit.id,
        itemId: deposit.itemId,
        itemName: deposit.itemName,
      },
    });

    return deposit;
  }

  async listMine(userId: string, query: ListDepositsQuery) {
    const where = { userId, ...(query.status ? { status: query.status } : {}) };
    const [deposits, total] = await Promise.all([
      this.prisma.depositRequest.findMany({
        where,
        include: { item: true, location: true, processedBy: true },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.depositRequest.count({ where }),
    ]);
    return {
      deposits,
      pagination: paginationMeta(query.page, query.limit, total),
    };
  }

  getMine(userId: string, id: string) {
    return this.prisma.depositRequest.findFirstOrThrow({
      where: { id, userId },
      include: { item: true, location: true, processedBy: true },
    });
  }

  async getStats(userId: string) {
    const stats = await this.prisma.depositRequest.aggregate({
      where: { userId, status: 'CREDITED' },
      _sum: { pointValue: true, weightKg: true },
      _count: true,
    });
    const totalWeight = stats._sum.weightKg ?? 0;
    return {
      totalCoins: stats._sum.pointValue ?? 0,
      totalCount: stats._count,
      savedCO2: Number((totalWeight * 1.5).toFixed(2)),
    };
  }
}
