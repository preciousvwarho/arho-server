import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../../common/types/authenticated-request';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { CreatePinDto, UpdatePinDto } from './dto/pin.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('pin')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  createPin(@CurrentUser() user: JwtPayload, @Body() dto: CreatePinDto) {
    return this.auth.createPin(user.sub, dto);
  }

  @Post('pin/update')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  updatePin(@CurrentUser() user: JwtPayload, @Body() dto: UpdatePinDto) {
    return this.auth.updatePin(user.sub, dto);
  }
}
