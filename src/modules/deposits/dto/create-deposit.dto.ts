import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDate,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { plainToInstance, Transform, Type } from 'class-transformer';

function emptyToUndefined(value: unknown) {
  return value === '' ? undefined : value;
}

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

function parseCustomLocation(value: unknown) {
  if (value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    return value;
  }
  return plainToInstance(CustomLocationDto, JSON.parse(value));
}

export class CreateDepositDto {
  @ApiProperty({
    description: 'Required recyclable item ID. Use itemId, not item.',
  })
  @IsMongoId()
  itemId: string;

  @ApiPropertyOptional({ description: 'Configured pickup area ID' })
  @Transform(({ value }) => emptyToUndefined(value))
  @IsOptional()
  @IsMongoId()
  locationId?: string;

  @ApiPropertyOptional({ description: 'Custom pickup address and coordinates' })
  @Transform(({ value }) => parseCustomLocation(value))
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomLocationDto)
  customLocation?: CustomLocationDto;

  @ApiPropertyOptional({
    description: 'User preferred pickup date and time',
    example: '2026-08-05T09:00:00.000Z',
  })
  @Transform(({ value }) =>
    value === '' || value === undefined ? undefined : new Date(value),
  )
  @IsOptional()
  @IsDate()
  preferredPickupAt?: Date;

  @ApiPropertyOptional({ description: 'Uploaded Cloudinary image URL' })
  @Transform(({ value }) => emptyToUndefined(value))
  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsOptional()
  @IsString()
  @MaxLength(255)
  imageId?: string;

  @ApiPropertyOptional({
    description: 'Multipart image file handled by the image upload interceptor',
    type: 'string',
    format: 'binary',
  })
  @Transform(({ value }) => emptyToUndefined(value))
  @IsOptional()
  image?: unknown;
}
