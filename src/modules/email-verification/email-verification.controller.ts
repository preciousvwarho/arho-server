import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { EmailVerificationService } from './email-verification.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@ApiTags('email verification')
@Controller('email')
export class EmailVerificationController {
  constructor(private readonly emailVerification: EmailVerificationService) {}

  @Post('send-otp')
  @Throttle({ default: { limit: 3, ttl: 10 * 60 * 1000 } })
  @ApiOperation({ summary: 'Send an email verification OTP' })
  async sendOtp(@Body() dto: SendOtpDto) {
    return {
      status: 'success',
      message: 'OTP sent successfully',
      data: await this.emailVerification.sendOtp(dto),
    };
  }

  @Post('resend-otp')
  @Throttle({ default: { limit: 3, ttl: 10 * 60 * 1000 } })
  @ApiOperation({ summary: 'Resend an email verification OTP' })
  async resendOtp(@Body() dto: SendOtpDto) {
    return {
      status: 'success',
      message: 'OTP resent successfully',
      data: await this.emailVerification.sendOtp(dto),
    };
  }

  @Post('verify-otp')
  @Throttle({ default: { limit: 10, ttl: 10 * 60 * 1000 } })
  @ApiOperation({ summary: 'Verify an email OTP' })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return {
      status: 'success',
      message: 'Email verified successfully',
      data: await this.emailVerification.verifyOtp(dto),
    };
  }
}
