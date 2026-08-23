import { AdminPasswordHasher } from "../../ports/AdminPorts";
import argon2 from "argon2";
import type { PasswordHasher } from "../../ports/PasswordHasher";

export class ArgonAdminPasswordHasher implements AdminPasswordHasher, PasswordHasher {
  async hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  }
  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}
