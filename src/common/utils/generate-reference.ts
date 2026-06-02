import { randomBytes } from 'node:crypto';

export function generateReference(prefix = 'TXN') {
  return `${prefix}_${Date.now()}_${randomBytes(4).toString('hex').toUpperCase()}`;
}
