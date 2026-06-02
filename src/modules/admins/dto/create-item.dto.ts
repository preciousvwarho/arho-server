import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateItemDto {
  @ApiProperty({ example: 'PET bottle' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  description: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(0.1)
  weightKg: number;

  @ApiProperty({ example: 20 })
  @IsInt()
  @Min(1)
  pointValue: number;

  @ApiProperty()
  @IsUrl()
  imageUrl: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  imageTwoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageTwoId?: string;
}
