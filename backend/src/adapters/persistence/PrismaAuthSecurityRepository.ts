import { PrismaClient } from "@prisma/client";
import {
  AuthSecurityRepository,
  AuthSecurityUser,
  PasswordResetRecord,
} from "../../ports/AuthSecurityRepository";
export class PrismaAuthSecurityRepository implements AuthSecurityRepository {
  constructor(private readonly c: PrismaClient) {}
  async findUser(id: string) {
    return (await this.c.user.findUnique({
      where: { id },
    })) as AuthSecurityUser | null;
  }
  async findUserByEmail(email: string) {
    return (await this.c.user.findUnique({
      where: { email },
    })) as AuthSecurityUser | null;
  }
  async findResetToken(token: string) {
    return (await this.c.passwordResetToken.findUnique({
      where: { token },
    })) as PasswordResetRecord | null;
  }
  async createResetToken(userId: string, token: string, expiresAt: Date) {
    await this.c.passwordResetToken.create({
      data: { userId, token, expiresAt },
    });
  }
  async updatePassword(id: string, passwordHash: string) {
    await this.c.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: false },
    });
  }
  async markResetUsed(id: string) {
    await this.c.passwordResetToken.update({
      where: { id },
      data: { used: true },
    });
  }
  async deleteUser(id: string) {
    await this.c.user.delete({ where: { id } });
  }
  async updateMfa(
    id: string,
    input: {
      mfaEnabled?: boolean;
      mfaSecret?: string | null;
      mfaBackupCodes?: string[];
    },
  ) {
    await this.c.user.update({ where: { id }, data: input });
  }
}
