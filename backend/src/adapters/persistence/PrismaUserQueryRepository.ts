import type { PrismaClient } from "@prisma/client";
import type {
  UserQueryRecord,
  UserQueryRepository,
} from "../../ports/UserQueryRepository";

export class PrismaUserQueryRepository implements UserQueryRepository {
  constructor(private readonly client: PrismaClient) {}

  async list(): Promise<UserQueryRecord[]> {
    return (await this.client.user.findMany({
      orderBy: { createdAt: "desc" },
    })) as unknown as UserQueryRecord[];
  }

  async find(userId: string): Promise<UserQueryRecord | null> {
    return (await this.client.user.findUnique({
      where: { id: userId },
    })) as unknown as UserQueryRecord | null;
  }
}
