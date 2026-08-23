import type { UserSessionInvalidator } from "../../ports/UserSessionInvalidator";
import { destroyUserLoginSessions } from "../../services/sessionStore";

export class LoginSessionInvalidator implements UserSessionInvalidator {
  async invalidate(userId: string): Promise<void> {
    await destroyUserLoginSessions(userId);
  }
}
