import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class AdminLoginDto {
  @ApiProperty({ description: 'Admin email or username' })
  @IsString()
  login: string;

  @ApiProperty()
  @IsString()
  password: string;
}
