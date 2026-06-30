import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../../common/types/authenticated-request';
import { AuthService } from './auth.service';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { CreatePinDto, UpdatePinDto } from './dto/pin.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return {
      status: 'success',
      message: 'User registered successfully',
      data: await this.auth.register(dto),
    };
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return {
      status: 'success',
      message: 'User logged in successfully',
      data: await this.auth.login(dto),
    };
  }

  @Post('google')
  async googleLogin(@Body() dto: GoogleLoginDto) {
    return {
      status: 'success',
      message: 'Google login processed successfully',
      data: await this.auth.googleLogin(dto),
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
}
