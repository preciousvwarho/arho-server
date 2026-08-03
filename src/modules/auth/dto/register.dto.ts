import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Ada Okafor' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  @ApiProperty({ example: 'ada@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '08031234567' })
  @Matches(/^(\+234|0)[789][01][0-9]{8}$/)
  phoneNumber: string;

  @ApiProperty({ example: 'SecurePass1!' })
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
  password: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  countryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  stateId?: string;

  @ApiPropertyOptional({ example: 'T4C8F3A1B2' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  referralCode?: string;
}
