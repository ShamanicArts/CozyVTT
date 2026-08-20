import { LoginAccount, RegisterAccount } from "./AuthenticationCommands";
import { AuthenticationService } from "../../ports/AuthenticationService";
import { RegistrationPolicy } from "../../ports/RegistrationPolicy";

const user = {
  id: "user-1",
  email: "mira@example.com",
  displayName: "Mira",
  platformRole: "USER" as const,
  isApproved: true,
  mfaEnabled: false,
  mustChangePassword: false,
};

function auth(): jest.Mocked<AuthenticationService> {
  return {
    register: jest.fn(async (_input) => user),
    authenticate: jest.fn(async (_input) => user),
  };
}
function policy(): jest.Mocked<RegistrationPolicy> {
  return {
    userCount: jest.fn(async () => 1),
    settings: jest.fn(async () => ({
      allowRegistration: true,
      requireAdminApproval: false,
    })),
    setApproval: jest.fn(async (_id: string, _approved: boolean) => undefined),
  };
}

describe("authentication commands", () => {
  it("retains registration policy and pending approval behavior", async () => {
    const credentials = auth();
    const registrationPolicy = policy();
    registrationPolicy.settings.mockResolvedValue({
      allowRegistration: true,
      requireAdminApproval: true,
    });
    await expect(
      new RegisterAccount(credentials, registrationPolicy).execute({
        type: "identity.register",
        input: {
          email: user.email,
          password: "password",
          displayName: user.displayName,
        },
      }),
    ).resolves.toMatchObject({ user, pendingApproval: true });
    expect(registrationPolicy.setApproval).toHaveBeenCalledWith(user.id, false);
  });

  it("keeps login validation, bad credentials, and approval rejection in the application layer", async () => {
    await expect(
      new LoginAccount(auth()).execute({ type: "identity.login", input: {} }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Email and password are required",
    });
    const credentials = auth();
    credentials.authenticate.mockResolvedValue(null);
    await expect(
      new LoginAccount(credentials).execute({
        type: "identity.login",
        input: { email: user.email, password: "bad" },
      }),
    ).rejects.toMatchObject({
      status: 401,
      message: "Invalid email or password",
    });
  });
});
