import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class GeometryDto {
  @ApiProperty({ example: 'Point' })
  @IsIn(['Point'])
  type: string;

  @ApiProperty({ example: [3.3792, 6.5244] })
  @IsArray()
  coordinates: number[];
}

class CustomLocationDto {
  @ApiProperty()
  @IsString()
  address: string;

  @ApiProperty()
  @ValidateNested()
  @Type(() => GeometryDto)
  geometry: GeometryDto;
}

export class CreateDepositDto {
  @ApiProperty()
  @IsMongoId()
  itemId: string;

  @ApiPropertyOptional({ description: 'Configured pickup area ID' })
  @IsOptional()
  @IsMongoId()
  locationId?: string;

  @ApiPropertyOptional({ description: 'Custom pickup address and coordinates' })
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomLocationDto)
  customLocation?: CustomLocationDto;

  @ApiPropertyOptional({ description: 'Uploaded Cloudinary image URL' })
  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  imageId?: string;
}
