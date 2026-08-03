import { Injectable } from '@nestjs/common';
import { paginationMeta } from '../../common/types/pagination';
import { PrismaService } from '../../database/prisma.service';
import { CreateItemDto } from '../admins/dto/create-item.dto';
import type { UploadedImage } from '../uploads/uploads.service';
import { ListItemsQuery } from './dto/list-items.query';
import { UpdateItemDto } from './dto/update-item.dto';

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListItemsQuery) {
    const where = {
      isActive: true,
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' as const } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.item.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.item.count({ where }),
    ]);
    return {
      items,
      pagination: paginationMeta(query.page, query.limit, total),
    };
  }

  async listRecycleCategories(query: ListItemsQuery) {
    const where = {
      isActive: true,
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' as const } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.item.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          name: true,
          description: true,
          weightKg: true,
          pointValue: true,
          imageUrl: true,
          imageTwoUrl: true,
          isActive: true,
        },
      }),
      this.prisma.item.count({ where }),
    ]);

    return {
      categories: items,
      pagination: paginationMeta(query.page, query.limit, total),
    };
  }

  get(id: string) {
    return this.prisma.item.findUniqueOrThrow({ where: { id } });
  }

  create(dto: CreateItemDto, image?: UploadedImage, imageTwo?: UploadedImage) {
    return this.prisma.item.create({
      data: {
        ...dto,
        imageUrl: image?.url ?? dto.imageUrl,
        imageId: image?.publicId ?? dto.imageId,
        imageTwoUrl: imageTwo?.url ?? dto.imageTwoUrl,
        imageTwoId: imageTwo?.publicId ?? dto.imageTwoId,
      },
    });
  }

  update(
    id: string,
    dto: UpdateItemDto,
    image?: UploadedImage,
    imageTwo?: UploadedImage,
  ) {
    return this.prisma.item.update({
      where: { id },
      data: {
        ...dto,
        imageUrl: image?.url ?? dto.imageUrl,
        imageId: image?.publicId ?? dto.imageId,
        imageTwoUrl: imageTwo?.url ?? dto.imageTwoUrl,
        imageTwoId: imageTwo?.publicId ?? dto.imageTwoId,
      },
    });
  }

  async toggleStatus(id: string) {
    const item = await this.prisma.item.findUniqueOrThrow({ where: { id } });
    return this.prisma.item.update({
      where: { id },
      data: { isActive: !item.isActive },
    });
  }

  delete(id: string) {
    return this.prisma.item.delete({ where: { id } });
  }
}
