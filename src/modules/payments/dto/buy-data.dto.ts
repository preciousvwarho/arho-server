import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { PaymentPinDto } from './payment-pin.dto';

export class BuyDataDto extends PaymentPinDto {
  @ApiProperty({ example: '08031234567' })
  @IsString()
  phoneNumber: string;

  @ApiProperty({ example: 'mtn' })
  @IsString()
  network: string;

  @ApiProperty({ example: 'mtn-data-1gb' })
  @IsString()
  dataCode: string;
}
