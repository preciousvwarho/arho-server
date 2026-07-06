import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { UploadsModule } from '../uploads/uploads.module';
import { DepositsController } from './deposits.controller';
import { DepositsService } from './deposits.service';

@Module({
  imports: [UploadsModule, NotificationsModule],
  controllers: [DepositsController],
  providers: [DepositsService],
})
export class DepositsModule {}
