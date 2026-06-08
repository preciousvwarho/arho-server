import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PaymentPinDto } from './payment-pin.dto';

export class InitiateTransferDto {
  @ApiProperty({ example: '0123456789' })
  @IsString()
  accountNumber: string;

  @ApiProperty({ example: '044' })
  @IsString()
  bankCode: string;

  @ApiProperty({ example: 1000 })
  @IsInt()
  @Min(100)
  amount: number;

  @ApiPropertyOptional({ example: 'Trash4Cash wallet transfer' })
  @IsOptional()
  @IsString()
  narration?: string;
}

export class CompleteTransferDto extends PaymentPinDto {
  @ApiProperty()
  @IsString()
  reference: string;
}
