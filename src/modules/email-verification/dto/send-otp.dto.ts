import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendOtpDto {
  @ApiProperty({ example: 'user@test.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: 'Test User' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fullName?: string;
}
