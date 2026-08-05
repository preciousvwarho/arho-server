import {
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { PickupReminderScheduler } from './pickup-reminder.scheduler';

@ApiTags('internal jobs')
@Controller('internal/jobs')
export class InternalJobsController {
  constructor(
    private readonly config: ConfigService,
    private readonly pickupReminders: PickupReminderScheduler,
  ) {}

  @Post('pickup-reminders/run')
  @ApiOperation({ summary: 'Internal: run due pickup reminder job' })
  @ApiHeader({
    name: 'x-internal-job-secret',
    required: true,
    description: 'Internal job secret configured by INTERNAL_JOB_SECRET',
  })
  async runPickupReminders(
    @Headers('x-internal-job-secret') secret?: string,
  ) {
    this.assertAuthorized(secret);
    return {
      status: 'success',
      message: 'Pickup reminder job completed successfully',
      data: await this.pickupReminders.runDuePickupReminders(),
    };
  }

  private assertAuthorized(secret?: string) {
    const expectedSecret = this.config.get<string>('INTERNAL_JOB_SECRET');
    if (!expectedSecret || secret !== expectedSecret) {
      throw new UnauthorizedException('Invalid internal job secret');
    }
  }
}
