import express from "express";
import session from "express-session";
import request from "supertest";

const findUnique = jest.fn();

jest.mock("../../config/database", () => ({
  prisma: {
    user: {
      findUnique,
      count: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    passwordResetToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));
jest.mock(
  "express-rate-limit",
  () =>
    () =>
    (
      _req: express.Request,
      _res: express.Response,
      next: express.NextFunction,
    ) =>
      next(),
);
jest.mock("../../middleware/auth", () => ({
  requireAuth: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => next(),
}));
jest.mock("../../services/auth", () => ({
  sanitizeUser: (user: unknown) => user,
  hashPassword: jest.fn(),
  verifyPassword: jest.fn(),
}));
jest.mock("../../services/systemSettings", () => ({
  getSystemSettings: jest.fn(),
  getAppearanceSettings: jest.fn(),
}));
jest.mock("../../services/email", () => ({
  isSmtpConfigured: jest.fn(() => false),
  sendPasswordResetEmail: jest.fn(),
}));

import authRoutes from "../auth";

function app(): express.Express {
  const server = express();
  server.use(express.json());
  server.use(
    session({ secret: "test", resave: false, saveUninitialized: false }),
  );
  server.use("/api/auth", authRoutes);
  return server;
}

describe("auth security HTTP command adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findUnique.mockResolvedValue(null);
  });

  it("preserves representative validation/auth contracts for every command-backed security route", async () => {
    const server = app();
    await expect(
      request(server).post("/api/auth/forgot-password").send({}),
    ).resolves.toMatchObject({
      status: 400,
      body: { error: "Validation Error", message: "Email is required" },
    });
    await expect(
      request(server).post("/api/auth/reset-password").send({}),
    ).resolves.toMatchObject({
      status: 400,
      body: {
        error: "Validation Error",
        message: "Token and new password are required",
      },
    });
    await expect(
      request(server).post("/api/auth/change-password").send({}),
    ).resolves.toMatchObject({
      status: 400,
      body: {
        error: "Validation Error",
        message: "Current password and new password are required",
      },
    });
    await expect(
      request(server).delete("/api/auth/account").send({}),
    ).resolves.toMatchObject({
      status: 400,
      body: {
        error: "Validation Error",
        message: "Password is required to delete your account",
      },
    });
    await expect(
      request(server).post("/api/auth/mfa/setup").send({}),
    ).resolves.toMatchObject({
      status: 404,
      body: { error: "Not Found", message: "User not found" },
    });
    await expect(
      request(server).post("/api/auth/mfa/verify").send({}),
    ).resolves.toMatchObject({
      status: 400,
      body: {
        error: "Validation Error",
        message: "Verification code is required",
      },
    });
    await expect(
      request(server).post("/api/auth/mfa/verify-login").send({}),
    ).resolves.toMatchObject({
      status: 401,
      body: {
        error: "Unauthorized",
        message: "No MFA verification pending. Please log in first.",
      },
    });
    await expect(
      request(server).post("/api/auth/mfa/disable").send({}),
    ).resolves.toMatchObject({
      status: 400,
      body: {
        error: "Validation Error",
        message: "Password and authentication code are required",
      },
    });
    await expect(
      request(server).post("/api/auth/mfa/backup-codes").send({}),
    ).resolves.toMatchObject({
      status: 400,
      body: { error: "Validation Error", message: "Password is required" },
    });
  });
});
