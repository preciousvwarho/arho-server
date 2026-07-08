import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class PaymentGatewayService {
  private readonly vtpass: AxiosInstance;
  private readonly flutterwave: AxiosInstance;

  constructor(config: ConfigService) {
    this.vtpass = axios.create({
      baseURL: config.get<string>(
        'VTPASS_BASE_URL',
        'https://sandbox.vtpass.com/api',
      ),
      headers: {
        'api-key': config.get<string>('VTPASS_API_KEY'),
        'secret-key': config.get<string>('VTPASS_SECRET'),
      },
    });
    this.flutterwave = axios.create({
      baseURL: config.get<string>(
        'FLW_BASE_URL',
        'https://api.flutterwave.com/v3',
      ),
      headers: {
        Authorization: `Bearer ${config.get<string>('FLW_SECRET_KEY') ?? ''}`,
      },
    });
  }

  async payWithVtpass(payload: Record<string, unknown>) {
    const { data } = await this.vtpass.post('/pay', payload);
    const code = data?.code;
    if (code && code !== '000') {
      throw new InternalServerErrorException(
        data?.response_description ?? 'VTPass transaction failed',
      );
    }
    return data;
  }

  async getVtpassVariations(serviceId: string) {
    const { data } = await this.vtpass.get('/service-variations', {
      params: { serviceID: serviceId },
    });
    return data?.content?.variations ?? [];
  }

  async getFlutterwaveBanks() {
    const { data } = await this.flutterwave.get('/banks/NG');
    return data;
  }

  async resolveFlutterwaveAccount(accountNumber: string, bankCode: string) {
    const { data } = await this.flutterwave.post('/accounts/resolve', {
      account_number: accountNumber,
      account_bank: bankCode,
    });
    if (data?.status !== 'success') {
      throw new InternalServerErrorException(
        data?.message ?? 'Unable to resolve account',
      );
    }
    return data.data as { account_name: string; account_number: string };
  }

  async createFlutterwaveTransfer(payload: Record<string, unknown>) {
    const { data } = await this.flutterwave.post('/transfers', payload);
    if (data?.status !== 'success') {
      throw new InternalServerErrorException(
        data?.message ?? 'Transfer failed',
      );
    }
    return data;
  }
}