import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../../common/types/authenticated-request';
import { AuthService } from './auth.service';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { CreatePinDto, UpdatePinDto } from './dto/pin.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/reset-password.dto';
import { ResetPinDto } from './dto/reset-pin.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  async register(@Body() dto: RegisterDto) {
    return {
      status: 'success',
      message: 'User registered successfully',
      data: await this.auth.register(dto),
    };
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  async login(@Body() dto: LoginDto) {
    return {
      status: 'success',
      message: 'User logged in successfully',
      data: await this.auth.login(dto),
    };
  }

  @Post('google')
  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  async googleLogin(@Body() dto: GoogleLoginDto) {
    return {
      status: 'success',
      message: 'Google login processed successfully',
      data: await this.auth.googleLogin(dto),
    };
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto) {
    return {
      status: 'success',
      message: 'Token refreshed successfully',
      data: await this.auth.refresh(dto.refreshToken),
    };
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 10 * 60 * 1000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return {
      status: 'success',
      message: 'Password reset OTP sent successfully',
      data: await this.auth.forgotPassword(dto),
    };
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 10 * 60 * 1000 } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return {
      status: 'success',
      message: 'Password reset successfully',
      data: await this.auth.resetPassword(dto),
    };
  }

  @Post('logout')
  async logout(@Body() dto: RefreshTokenDto) {
    return {
      status: 'success',
      message: 'User logged out successfully',
      data: await this.auth.logout(dto.refreshToken),
    };
  }

  @Post('pin')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async createPin(@CurrentUser() user: JwtPayload, @Body() dto: CreatePinDto) {
    return {
      status: 'success',
      message: 'Transaction PIN created successfully',
      data: await this.auth.createPin(user.sub, dto),
    };
  }

  @Post('pin/update')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async updatePin(@CurrentUser() user: JwtPayload, @Body() dto: UpdatePinDto) {
    return {
      status: 'success',
      message: 'Transaction PIN updated successfully',
      data: await this.auth.updatePin(user.sub, dto),
    };
  }

  @Post('pin/forgot')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 10 * 60 * 1000 } })
  async forgotPin(@CurrentUser() user: JwtPayload) {
    return {
      status: 'success',
      message: 'PIN reset OTP sent successfully',
      data: await this.auth.forgotPin(user.sub),
    };
  }

  @Post('pin/reset')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 10 * 60 * 1000 } })
  async resetPin(@CurrentUser() user: JwtPayload, @Body() dto: ResetPinDto) {
    return {
      status: 'success',
      message: 'Transaction PIN reset successfully',
      data: await this.auth.resetPin(user.sub, dto),
    };
  }
}
