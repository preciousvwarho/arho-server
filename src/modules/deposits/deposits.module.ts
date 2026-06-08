import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { DepositsController } from './deposits.controller';
import { DepositsService } from './deposits.service';

@Module({
  imports: [UploadsModule],
  controllers: [DepositsController],
  providers: [DepositsService],
})
export class DepositsModule {}
