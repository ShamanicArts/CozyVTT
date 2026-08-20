import { AdminPasswordHasher } from "../../ports/AdminPasswordHasher";
import { hashPassword } from "../../services/auth";

export class ArgonAdminPasswordHasher implements AdminPasswordHasher {
  async hash(password: string): Promise<string> {
    return hashPassword(password);
  }
}
