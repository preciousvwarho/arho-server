import { Injectable } from '@nestjs/common';
import { paginationMeta } from '../../common/types/pagination';
import { PrismaService } from '../../database/prisma.service';
import { ListItemsQuery } from './dto/list-items.query';

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

  get(id: string) {
    return this.prisma.item.findUniqueOrThrow({ where: { id } });
  }
}
