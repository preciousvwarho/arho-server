import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';
import { PaymentPinDto } from './payment-pin.dto';

export class BuyElectricityDto extends PaymentPinDto {
  @ApiProperty({ example: 'ikeja-electric' })
  @IsString()
  discoProvider: string;

  @ApiProperty({ example: 'prepaid' })
  @IsString()
  meterType: string;

  @ApiProperty({ example: '12345678901' })
  @IsString()
  meterNumber: string;

  @ApiProperty({ example: 1000 })
  @IsInt()
  @Min(100)
  amount: number;
}
