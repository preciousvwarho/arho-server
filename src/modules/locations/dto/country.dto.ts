import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCountryDto {
  @ApiProperty({ example: 'Nigeria' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'NG' })
  @IsString()
  @MinLength(2)
  @MaxLength(3)
  code: string;

  @ApiProperty({ example: 'NGN' })
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency: string;

  @ApiProperty({ example: '+234' })
  @Matches(/^\+\d{1,4}$/)
  phoneCode: string;
}

export class UpdateCountryDto extends PartialType(CreateCountryDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
