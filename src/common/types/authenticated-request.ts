import { Request } from 'express';

export interface JwtPayload {
  sub: string;
  type: 'user' | 'admin';
  sid?: string;
}

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}
