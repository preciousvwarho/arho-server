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
    return { status: 'success', data: this.payments.getNetworkProviders() };
  }

  @Get('data-plans/:network')
  getDataPlans(@Param('network') network: string) {
    return this.payments.getDataPlans(network);
  }

  @Get('cable-providers')
  getCableProviders() {
    return { status: 'success', data: this.payments.getCableProviders() };
  }

  @Get('cable-packages/:provider')
  getCablePackages(@Param('provider') provider: string) {
    return this.payments.getCablePackages(provider);
  }

  @Get('electricity-providers')
  getElectricityProviders() {
    return { status: 'success', data: this.payments.getElectricityProviders() };
  }

  @Get('banks')
  getBanks() {
    return this.payments.getBanks();
  }

  @Post('airtime')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Buy airtime with wallet points' })
  buyAirtime(@CurrentUser() user: JwtPayload, @Body() dto: BuyAirtimeDto) {
    return this.payments.buyAirtime(user.sub, dto);
  }

  @Post('data')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  buyData(@CurrentUser() user: JwtPayload, @Body() dto: BuyDataDto) {
    return this.payments.buyData(user.sub, dto);
  }

  @Post('cable-tv')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  buyCable(@CurrentUser() user: JwtPayload, @Body() dto: BuyCableDto) {
    return this.payments.buyCable(user.sub, dto);
  }

  @Post('electricity')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  buyElectricity(
    @CurrentUser() user: JwtPayload,
    @Body() dto: BuyElectricityDto,
  ) {
    return this.payments.buyElectricity(user.sub, dto);
  }

  @Post('initiate-transfer')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  initiateTransfer(
    @CurrentUser() user: JwtPayload,
    @Body() dto: InitiateTransferDto,
  ) {
    return this.payments.initiateTransfer(user.sub, dto);
  }

  @Post('transfer')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  completeTransfer(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CompleteTransferDto,
  ) {
    return this.payments.completeTransfer(user.sub, dto);
  }
}
