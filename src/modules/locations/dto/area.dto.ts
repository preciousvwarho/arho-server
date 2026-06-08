import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAreaDto {
  @ApiProperty({ example: 'Ikeja' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'IKEJA' })
  @IsString()
  @MinLength(2)
  @MaxLength(10)
  code: string;

  @ApiProperty()
  @IsMongoId()
  stateId: string;

  @ApiProperty()
  @IsMongoId()
  countryId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;
}

export class UpdateAreaDto extends PartialType(CreateAreaDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
