import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsController } from './payments.controller';
import { PaymentGatewayService } from './payment-gateway.service';
import { PaymentsService } from './payments.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentGatewayService],
})
export class PaymentsModule {}
