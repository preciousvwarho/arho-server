import { Injectable } from '@nestjs/common';

type ExpoModule = typeof import('expo-server-sdk');
type ExpoClient = InstanceType<ExpoModule['Expo']>;

@Injectable()
export class ExpoPushService {
  private expo?: ExpoClient;

  async sendMany(args: {
    expoPushTokens: string[];
    title: string;
    body: string;
    data?: Record<string, unknown>;
  }) {
    const expo = await this.getExpoClient();
    const { Expo } = await this.getExpoModule();
    const messages = args.expoPushTokens
      .filter((token) => Expo.isExpoPushToken(token))
      .map((token) => ({
        to: token,
        sound: 'default' as const,
        title: args.title,
        body: args.body,
        data: args.data,
      }));

    if (messages.length === 0) return [];

    const chunks = expo.chunkPushNotifications(messages);
    const tickets = await Promise.all(
      chunks.map((chunk) => expo.sendPushNotificationsAsync(chunk)),
    );
    return tickets.flat();
  }

  private async getExpoClient() {
    if (!this.expo) {
      const { Expo } = await this.getExpoModule();
      this.expo = new Expo();
    }
    return this.expo;
  }

  private getExpoModule(): Promise<ExpoModule> {
    return import('expo-server-sdk');
  }
}
