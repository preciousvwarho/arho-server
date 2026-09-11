import {
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { parseFirebaseServiceAccount } from './firebase-service-account.util';

@Injectable()
export class FirebaseAuthService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseAuthService.name);
  private app?: App;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.getApp();
  }

  async verifyIdToken(idToken: string): Promise<DecodedIdToken> {
    const app = this.getApp();
    return getAuth(app).verifyIdToken(idToken);
  }

  private getApp() {
    if (this.app) return this.app;

    const existingApp = getApps()[0];
    if (existingApp) {
      this.app = existingApp;
      this.logger.log('Using existing Firebase app');
      return this.app;
    }

    const rawServiceAccount = this.config.get<string>(
      'FIREBASE_SERVICE_ACCOUNT_JSON',
    );
    if (!rawServiceAccount) {
      throw new UnauthorizedException('Firebase login is not configured');
    }

    try {
      const serviceAccount = parseFirebaseServiceAccount(rawServiceAccount);
      this.app = initializeApp({
        credential: cert({
          projectId: serviceAccount.project_id,
          clientEmail: serviceAccount.client_email,
          privateKey: serviceAccount.private_key,
        }),
      });
      this.logger.log(
        'Firebase app initialized from FIREBASE_SERVICE_ACCOUNT_JSON',
      );
      return this.app;
    } catch {
      throw new UnauthorizedException('Firebase login is not configured');
    }
  }
}
