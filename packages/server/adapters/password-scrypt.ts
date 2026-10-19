import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { PasswordHasher } from '../context';

const derive = (password: string, salt: Buffer, cost: number, blockSize: number, parallelism: number) => new Promise<Buffer>((resolve, reject) => {
  scrypt(password, salt, 64, { N: cost, r: blockSize, p: parallelism, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key));
});
export function createScryptHasher(): PasswordHasher {
  return {
    async hash(password) {
      const salt = randomBytes(32); const key = await derive(password, salt, 32768, 8, 1);
      return `scrypt$32768$8$1$${salt.toString('hex')}$${key.toString('hex')}`;
    },
    async verify(password, encoded) {
      const parts = encoded.split('$');
      if (parts.length !== 6 || parts[0] !== 'scrypt' || parts[1] !== '32768' || parts[2] !== '8' || parts[3] !== '1'
        || !/^[a-f0-9]{64}$/.test(parts[4]) || !/^[a-f0-9]{128}$/.test(parts[5])) return false;
      const key = await derive(password, Buffer.from(parts[4], 'hex'), 32768, 8, 1);
      return timingSafeEqual(key, Buffer.from(parts[5], 'hex'));
    },
  };
}
