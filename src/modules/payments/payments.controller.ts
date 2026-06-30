import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../../common/types/authenticated-request';
import { BuyAirtimeDto } from './dto/buy-airtime.dto';
import { BuyCableDto } from './dto/buy-cable.dto';
import { BuyDataDto } from './dto/buy-data.dto';
import { BuyElectricityDto } from './dto/buy-electricity.dto';
import { CompleteTransferDto, InitiateTransferDto } from './dto/transfer.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('services')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('network-providers')
  getNetworkProviders() {
    return {
      status: 'success',
      message: 'Network providers retrieved successfully',
      data: { providers: this.payments.getNetworkProviders() },
    };
  }

  @Get('data-plans/:network')
  async getDataPlans(@Param('network') network: string) {
    return {
      status: 'success',
      message: 'Data plans retrieved successfully',
      data: { plans: await this.payments.getDataPlans(network) },
    };
  }

  @Get('cable-providers')
  getCableProviders() {
    return {
      status: 'success',
      message: 'Cable providers retrieved successfully',
      data: { providers: this.payments.getCableProviders() },
    };
  }

  @Get('cable-packages/:provider')
  async getCablePackages(@Param('provider') provider: string) {
    return {
      status: 'success',
      message: 'Cable packages retrieved successfully',
      data: { packages: await this.payments.getCablePackages(provider) },
    };
  }

  @Get('electricity-providers')
  getElectricityProviders() {
    return {
      status: 'success',
      message: 'Electricity providers retrieved successfully',
      data: { providers: this.payments.getElectricityProviders() },
    };
  }

  @Get('banks')
  async getBanks() {
    return {
      status: 'success',
      message: 'Banks retrieved successfully',
      data: { banks: await this.payments.getBanks() },
    };
  }

  @Post('airtime')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Buy airtime with wallet points' })
  async buyAirtime(@CurrentUser() user: JwtPayload, @Body() dto: BuyAirtimeDto) {
    return {
      status: 'success',
      message: 'Airtime purchased successfully',
      data: { transaction: await this.payments.buyAirtime(user.sub, dto) },
    };
  }

  @Post('data')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async buyData(@CurrentUser() user: JwtPayload, @Body() dto: BuyDataDto) {
    return {
      status: 'success',
      message: 'Data purchased successfully',
      data: { transaction: await this.payments.buyData(user.sub, dto) },
    };
  }

  @Post('cable-tv')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async buyCable(@CurrentUser() user: JwtPayload, @Body() dto: BuyCableDto) {
    return {
      status: 'success',
      message: 'Cable subscription purchased successfully',
      data: { transaction: await this.payments.buyCable(user.sub, dto) },
    };
  }

  @Post('electricity')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async buyElectricity(
    @CurrentUser() user: JwtPayload,
    @Body() dto: BuyElectricityDto,
  ) {
    return {
      status: 'success',
      message: 'Electricity purchased successfully',
      data: { transaction: await this.payments.buyElectricity(user.sub, dto) },
    };
  }

  @Post('initiate-transfer')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async initiateTransfer(
    @CurrentUser() user: JwtPayload,
    @Body() dto: InitiateTransferDto,
  ) {
    return {
      status: 'success',
      message: 'Transfer initiated successfully',
      data: await this.payments.initiateTransfer(user.sub, dto),
    };
  }

  @Post('transfer')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async completeTransfer(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CompleteTransferDto,
  ) {
    return {
      status: 'success',
      message: 'Transfer completed successfully',
      data: { transaction: await this.payments.completeTransfer(user.sub, dto) },
    };
  }
}
