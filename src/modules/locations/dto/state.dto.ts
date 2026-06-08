import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateStateDto {
  @ApiProperty({ example: 'Lagos' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'LA' })
  @IsString()
  @MinLength(2)
  @MaxLength(10)
  code: string;

  @ApiProperty()
  @IsMongoId()
  countryId: string;
}

export class UpdateStateDto extends PartialType(CreateStateDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
