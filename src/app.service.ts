import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'success',
      message: 'Trash4Cash API is running',
      timestamp: new Date().toISOString(),
    };
  }
}
