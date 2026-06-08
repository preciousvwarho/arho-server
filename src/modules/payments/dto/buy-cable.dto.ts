import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { PaymentPinDto } from './payment-pin.dto';

export class BuyCableDto extends PaymentPinDto {
  @ApiProperty({ example: 'dstv' })
  @IsString()
  cableProvider: string;

  @ApiProperty({ example: '1234567890' })
  @IsString()
  smartCardNumber: string;

  @ApiProperty({ example: 'dstv-padi' })
  @IsString()
  packageCode: string;
}
