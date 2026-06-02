import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  getProfile(id: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        pickupLocation: true,
        registrationStage: true,
        pointBalance: true,
        role: true,
        isEmailVerified: true,
        isActive: true,
        createdAt: true,
        country: true,
        state: true,
      },
    });
  }
}
