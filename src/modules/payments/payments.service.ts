/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { generateReference } from '../../common/utils/generate-reference';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BuyAirtimeDto } from './dto/buy-airtime.dto';
import { BuyCableDto } from './dto/buy-cable.dto';
import { BuyDataDto } from './dto/buy-data.dto';
import { BuyElectricityDto } from './dto/buy-electricity.dto';
import { CompleteTransferDto, InitiateTransferDto } from './dto/transfer.dto';
import { PaymentGatewayService } from './payment-gateway.service';

type Variation = {
  variation_code: string;
  variation_amount: string | number;
  name?: string;
};

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly notifications: NotificationsService,
    private readonly gateway: PaymentGatewayService,
  ) {}

  getNetworkProviders() {
    return [
      { name: 'MTN', code: 'mtn' },
      { name: 'GLO', code: 'glo' },
      { name: 'Airtel', code: 'airtel' },
      { name: '9mobile', code: 'etisalat' },
    ];
  }

  getCableProviders() {
    return [
      { name: 'DSTV', code: 'dstv' },
      { name: 'GOtv', code: 'gotv' },
      { name: 'Startimes', code: 'startimes' },
    ];
  }

  getElectricityProviders() {
    return [
      { name: 'Ikeja Electric', code: 'ikeja-electric' },
      { name: 'Eko Electric', code: 'eko-electric' },
      { name: 'Abuja Electric', code: 'abuja-electric' },
      { name: 'Kano Electric', code: 'kano-electric' },
      { name: 'Port Harcourt Electric', code: 'portharcourt-electric' },
    ];
  }

  async getDataPlans(network: string) {
    return this.getVariations(this.networkServiceId(network, 'data'));
  }

  async getCablePackages(provider: string) {
    return this.getVariations(this.cableServiceId(provider));
  }

  getBanks() {
    return this.gateway.getFlutterwaveBanks();
  }

  async buyAirtime(userId: string, dto: BuyAirtimeDto) {
    await this.auth.verifyPin(userId, dto.transactionPin);
    return this.walletGatewayPurchase({
      userId,
      amount: dto.amount,
      type: 'AIRTIME',
      referencePrefix: 'AIRTIME',
      description: `${dto.network.toUpperCase()} airtime for ${dto.phoneNumber}`,
      metadata: { ...dto },
      gatewayPayload: {
        request_id: generateReference('VT'),
        serviceID: this.networkServiceId(dto.network, 'airtime'),
        amount: dto.amount,
        phone: dto.phoneNumber,
      },
    });
  }

  async buyData(userId: string, dto: BuyDataDto) {
    await this.auth.verifyPin(userId, dto.transactionPin);
    const plan = await this.findVariation(
      this.networkServiceId(dto.network, 'data'),
      dto.dataCode,
    );
    const amount = Number(plan.variation_amount);
    return this.walletGatewayPurchase({
      userId,
      amount,
      type: 'DATA',
      referencePrefix: 'DATA',
      description: `${dto.network.toUpperCase()} data for ${dto.phoneNumber}`,
      metadata: { ...dto, plan },
      gatewayPayload: {
        request_id: generateReference('VT'),
        serviceID: this.networkServiceId(dto.network, 'data'),
        variation_code: dto.dataCode,
        phone: dto.phoneNumber,
      },
    });
  }

  async buyCable(userId: string, dto: BuyCableDto) {
    await this.auth.verifyPin(userId, dto.transactionPin);
    const plan = await this.findVariation(
      this.cableServiceId(dto.cableProvider),
      dto.packageCode,
    );
    const amount = Number(plan.variation_amount);
    return this.walletGatewayPurchase({
      userId,
      amount,
      type: 'CABLE',
      referencePrefix: 'CABLE',
      description: `${dto.cableProvider.toUpperCase()} cable subscription`,
      metadata: { ...dto, plan },
      gatewayPayload: {
        request_id: generateReference('VT'),
        serviceID: this.cableServiceId(dto.cableProvider),
        billersCode: dto.smartCardNumber,
        variation_code: dto.packageCode,
      },
    });
  }

  async buyElectricity(userId: string, dto: BuyElectricityDto) {
    await this.auth.verifyPin(userId, dto.transactionPin);
    return this.walletGatewayPurchase({
      userId,
      amount: dto.amount,
      type: 'ELECTRICITY',
      referencePrefix: 'ELECTRICITY',
      description: `${dto.discoProvider} electricity purchase`,
      metadata: { ...dto },
      gatewayPayload: {
        request_id: generateReference('VT'),
        serviceID: this.electricityServiceId(dto.discoProvider),
        billersCode: dto.meterNumber,
        variation_code: dto.meterType,
        amount: dto.amount,
      },
    });
  }

  async initiateTransfer(userId: string, dto: InitiateTransferDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const fee = this.calculateTransferFee(dto.amount);
    const totalAmount = dto.amount + fee;
    if (user.pointBalance < totalAmount) {
      throw new BadRequestException('Insufficient point balance');
    }
    const account = await this.resolveFlutterwaveAccount(
      dto.accountNumber,
      dto.bankCode,
    );
    const transaction = await this.prisma.transaction.create({
      data: {
        userId,
        type: 'TRANSFER',
        amount: totalAmount,
        fee,
        status: 'PENDING',
        reference: generateReference('TRANSFER'),
        description: dto.narration ?? `Transfer to ${account.account_name}`,
        metadata: {
          transferAmount: dto.amount,
          accountNumber: dto.accountNumber,
          bankCode: dto.bankCode,
          accountName: account.account_name,
          narration: dto.narration,
        },
        balanceBefore: user.pointBalance,
        balanceAfter: user.pointBalance,
      },
    });
    return { transaction, account };
  }

  async completeTransfer(userId: string, dto: CompleteTransferDto) {
    await this.auth.verifyPin(userId, dto.transactionPin);
    const transaction = await this.prisma.transaction.findUniqueOrThrow({
      where: { reference: dto.reference },
    });
    if (transaction.userId !== userId || transaction.status !== 'PENDING') {
      throw new NotFoundException('Pending transfer not found');
    }
    const metadata = transaction.metadata as {
      transferAmount: number;
      accountNumber: string;
      bankCode: string;
      narration?: string;
    };
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (user.pointBalance < transaction.amount) {
      throw new BadRequestException('Insufficient point balance');
    }
    const gateway = await this.createFlutterwaveTransfer({
      account_bank: metadata.bankCode,
      account_number: metadata.accountNumber,
      amount: metadata.transferAmount,
      narration: metadata.narration ?? transaction.description,
      reference: transaction.reference,
      currency: 'NGN',
    });

    const completed = await this.prisma.$transaction(async (tx) => {
      const balanceAfter = user.pointBalance - transaction.amount;
      await tx.user.update({
        where: { id: userId },
        data: { pointBalance: balanceAfter },
      });
      return tx.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'COMPLETED',
          balanceBefore: user.pointBalance,
          balanceAfter,
          metadata: { ...(metadata ?? {}), gateway },
        },
      });
    });

    await this.notifications.notifyUserSafely({
      userId,
      type: NotificationType.BILL_PAYMENT,
      title: 'Transfer completed',
      message: `Your transfer of ${metadata.transferAmount} points has been completed successfully.`,
      data: {
        transactionId: completed.id,
        reference: completed.reference,
        amount: completed.amount,
        type: completed.type,
      },
    });

    return completed;
  }

  private async walletGatewayPurchase(args: {
    userId: string;
    amount: number;
    type: 'AIRTIME' | 'DATA' | 'CABLE' | 'ELECTRICITY';
    referencePrefix: string;
    description: string;
    metadata: Prisma.InputJsonObject;
    gatewayPayload: Record<string, unknown>;
  }) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: args.userId },
    });
    if (user.pointBalance < args.amount) {
      throw new BadRequestException('Insufficient point balance');
    }
    const transaction = await this.prisma.transaction.create({
      data: {
        userId: args.userId,
        type: args.type,
        amount: args.amount,
        status: 'PENDING',
        reference: generateReference(args.referencePrefix),
        description: args.description,
        metadata: args.metadata,
        balanceBefore: user.pointBalance,
        balanceAfter: user.pointBalance,
      },
    });

    try {
      const gateway = await this.gateway.payWithVtpass(args.gatewayPayload);
      const completed = await this.prisma.$transaction(async (tx) => {
        const balanceAfter = user.pointBalance - args.amount;
        await tx.user.update({
          where: { id: args.userId },
          data: { pointBalance: balanceAfter },
        });
        return tx.transaction.update({
          where: { id: transaction.id },
          data: {
            status: 'COMPLETED',
            balanceAfter,
            metadata: { ...args.metadata, gateway },
          },
        });
      });
      await this.notifications.notifyUserSafely({
        userId: args.userId,
        type: NotificationType.BILL_PAYMENT,
        title: 'Bill payment successful',
        message: args.description,
        data: {
          transactionId: completed.id,
          reference: completed.reference,
          amount: completed.amount,
          type: completed.type,
        },
      });
      return completed;
    } catch (error) {
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'FAILED',
          metadata: {
            ...args.metadata,
            error: error instanceof Error ? error.message : 'Gateway error',
          },
        },
      });
      throw error;
    }
  }

  private getVariations(serviceId: string) {
    return this.gateway.getVtpassVariations(serviceId);
  }

  private async findVariation(serviceId: string, variationCode: string) {
    const variations = (await this.getVariations(serviceId)) as Variation[];
    const plan = variations.find(
      (variation) => variation.variation_code === variationCode,
    );
    if (!plan) {
      throw new NotFoundException('VTPass package or plan not found');
    }
    return plan;
  }

  private networkServiceId(network: string, type: 'airtime' | 'data') {
    const key = network.toLowerCase();
    if (type === 'airtime') return key;
    const ids: Record<string, string> = {
      mtn: 'mtn-data',
      glo: 'glo-data',
      airtel: 'airtel-data',
      etisalat: 'etisalat-data',
      '9mobile': 'etisalat-data',
    };
    return ids[key] ?? `${key}-data`;
  }

  private cableServiceId(provider: string) {
    return provider.toLowerCase();
  }

  private electricityServiceId(provider: string) {
    return provider.toLowerCase();
  }

  private calculateTransferFee(amount: number) {
    if (amount <= 5000) return 10;
    if (amount <= 50000) return 25;
    return 50;
  }

  private resolveFlutterwaveAccount(accountNumber: string, bankCode: string) {
    return this.gateway.resolveFlutterwaveAccount(accountNumber, bankCode);
  }

  private createFlutterwaveTransfer(payload: Record<string, unknown>) {
    return this.gateway.createFlutterwaveTransfer(payload);
  }
}
