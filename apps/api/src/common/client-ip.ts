import { createHmac } from 'node:crypto';

/**
 * Keyed hash of an IP address for audit events: lets us spot repeated activity
 * from one address without storing the address itself.
 */
export function hashIp(ip: string | undefined, secret: string): string | null {
  if (!ip) return null;
  return createHmac('sha256', secret).update(`ip:${ip}`).digest('hex').slice(0, 32);
}
