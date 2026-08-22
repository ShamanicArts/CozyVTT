import { Request, Response, NextFunction } from "express";
import {
  requirePasswordChanged,
  PASSWORD_CHANGE_REQUIRED,
} from "./passwordChange";

const mockFindUnique = jest.fn();
jest.mock("../config/database", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

function mockReq(
  path: string,
  sessionOverrides: Record<string, unknown> = {},
): Request {
  return {
    path,
    session: {
      ...sessionOverrides,
      id: "test-session-id",
      cookie: {},
    },
  } as unknown as Request;
}

function mockRes(): { status: jest.Mock; json: jest.Mock; res: Response } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { status, json, res: { status, json } as unknown as Response };
}

const mockNext: NextFunction = jest.fn();

beforeEach(() => jest.clearAllMocks());

describe("requirePasswordChanged", () => {
  it("allows unauthenticated requests and sessions without a pending change", async () => {
    await requirePasswordChanged(mockReq("/campaigns"), mockRes().res, mockNext);
    await requirePasswordChanged(
      mockReq("/campaigns", {
        userId: "user-1",
        mustChangePassword: false,
      }),
      mockRes().res,
      mockNext,
    );
    expect(mockNext).toHaveBeenCalledTimes(2);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it.each([
    "/auth/change-password",
    "/auth/logout",
    "/auth/me",
    "/auth/ping",
    "/auth/appearance",
    "/config",
  ])("allows %s while a password change is pending", async (path) => {
    const { res, status } = mockRes();
    await requirePasswordChanged(
      mockReq(path, { userId: "user-1", mustChangePassword: true }),
      res,
      mockNext,
    );
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it("blocks every other API route", async () => {
    const { res, status, json } = mockRes();
    await requirePasswordChanged(
      mockReq("/campaigns", {
        userId: "user-1",
        mustChangePassword: true,
      }),
      res,
      mockNext,
    );
    expect(mockNext).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: PASSWORD_CHANGE_REQUIRED }),
    );
  });

  it("does not allow path-prefix near misses", async () => {
    const { res, status } = mockRes();
    await requirePasswordChanged(
      mockReq("/auth/me/campaigns", {
        userId: "user-1",
        mustChangePassword: true,
      }),
      res,
      mockNext,
    );
    expect(mockNext).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });

  it("loads and caches the flag for legacy sessions", async () => {
    mockFindUnique.mockResolvedValue({ mustChangePassword: true });
    const req = mockReq("/campaigns", { userId: "user-1" });
    const { res, status } = mockRes();
    await requirePasswordChanged(req, res, mockNext);
    expect(mockFindUnique).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenCalledWith(403);
    expect(req.session.mustChangePassword).toBe(true);
  });

  it("fails open when a legacy-session lookup fails", async () => {
    mockFindUnique.mockRejectedValue(new Error("connection refused"));
    const { res, status } = mockRes();
    await requirePasswordChanged(
      mockReq("/campaigns", { userId: "user-1" }),
      res,
      mockNext,
    );
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });
});
