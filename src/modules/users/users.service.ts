import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PushNotificationsDto } from './dto/push-notifications.dto';
import { PushTokenDto } from './dto/push-token.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

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
        pushNotificationsEnabled: true,
        createdAt: true,
        country: true,
        state: true,
      },
    });
  }

  updateProfile(id: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id },
      data: dto,
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
        pushNotificationsEnabled: true,
        createdAt: true,
        country: true,
        state: true,
      },
    });
  }

  async setPushToken(id: string, dto: PushTokenDto) {
    await this.prisma.user.updateMany({
      where: {
        pushToken: dto.pushToken,
        id: { not: id },
      },
      data: { pushToken: null },
    });

    return this.prisma.user.update({
      where: { id },
      data: { pushToken: dto.pushToken },
      select: { pushNotificationsEnabled: true },
    });
  }

  setPushNotificationPreference(id: string, dto: PushNotificationsDto) {
    return this.prisma.user.update({
      where: { id },
      data: { pushNotificationsEnabled: dto.enabled },
      select: { pushNotificationsEnabled: true },
    });
  }

  getPushNotificationPreference(id: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: { pushNotificationsEnabled: true },
    });
  }
}
