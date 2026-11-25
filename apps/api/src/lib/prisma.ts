import { Prisma, PrismaClient } from '@prisma/client';
import { decrypt, encrypt } from './secretBox.js';

const WRITES = ['create', 'createMany', 'createManyAndReturn', 'update', 'updateMany'];

// Device and student passwords are encrypted as they are written and decrypted as they
// are read, so the rest of the code only sees plain values.
export function createPrismaClient(key: Buffer, options?: Prisma.PrismaClientOptions): PrismaClient {
  const seal = (data: any, field: string) => {
    for (const row of [data].flat()) {
      if (row && typeof row[field] === 'string') row[field] = encrypt(key, row[field]);
    }
  };
  const encryptWrites = (field: string) => ({
    async $allOperations({ operation, args, query }: { operation: string; args: any; query: (args: any) => Promise<unknown> }) {
      if (operation === 'upsert') {
        seal(args.create, field);
        seal(args.update, field);
      } else if (WRITES.includes(operation)) {
        seal(args.data, field);
      }
      return query(args);
    }
  });

  return new PrismaClient(options).$extends({
    query: {
      asset: encryptWrites('devicePassword'),
      student: encryptWrites('password')
    },
    result: {
      asset: { devicePassword: { needs: { devicePassword: true }, compute: (a) => decrypt(key, a.devicePassword) } },
      student: { password: { needs: { password: true }, compute: (s) => decrypt(key, s.password) } }
    }
  }) as unknown as PrismaClient;
}
