import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AdminJwtAuthGuard } from '../../common/guards/admin-jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { QueuesModule } from '../../queues/queues.module';
import { AdminJwtStrategy } from './admin-jwt.strategy';
import { AdminsController } from './admins.controller';
import { AdminsService } from './admins.service';

@Module({
  imports: [
    PassportModule,
    NotificationsModule,
    QueuesModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRE', '30d') },
      }),
    }),
  ],
  controllers: [AdminsController],
  providers: [
    AdminsService,
    AdminJwtStrategy,
    AdminJwtAuthGuard,
    PermissionsGuard,
  ],
})
export class AdminsModule {}
