import { Injectable } from '@nestjs/common';
import { PaginationQuery, paginationMeta } from '../../common/types/pagination';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listMine(userId: string, query: PaginationQuery) {
    const where = { userId };
    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);
    return {
      transactions,
      pagination: paginationMeta(query.page, query.limit, total),
    };
  }

  getMine(userId: string, id: string) {
    return this.prisma.transaction.findFirstOrThrow({ where: { id, userId } });
  }
}
