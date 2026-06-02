import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateDepositStatusDto {
  @ApiProperty({ enum: ['CREDITED', 'REJECTED'] })
  @IsIn(['CREDITED', 'REJECTED'])
  status: 'CREDITED' | 'REJECTED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  adminNote?: string;
}
