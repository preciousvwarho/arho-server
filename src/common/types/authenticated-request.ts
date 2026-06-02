import { Request } from 'express';

export interface JwtPayload {
  sub: string;
  type: 'user' | 'admin';
}

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}
