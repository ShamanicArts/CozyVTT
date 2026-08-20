CREATE TABLE "McpOAuthClient" (
  "clientId" TEXT NOT NULL,
  "metadata" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "McpOAuthClient_pkey" PRIMARY KEY ("clientId")
);

CREATE TABLE "McpOAuthAuthorization" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "clientState" TEXT,
  "redirectUri" TEXT NOT NULL,
  "codeChallenge" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "scopes" JSONB NOT NULL,
  "authorizationCodeHash" TEXT,
  "delegatedUserId" TEXT,
  "campaignId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "McpOAuthAuthorization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "McpOAuthRefreshToken" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "delegatedUserId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "scopes" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "McpOAuthRefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "McpOAuthAuthorization_authorizationCodeHash_key"
  ON "McpOAuthAuthorization"("authorizationCodeHash");
CREATE INDEX "McpOAuthAuthorization_expiry_idx"
  ON "McpOAuthAuthorization"("expiresAt", "consumedAt");
CREATE INDEX "McpOAuthAuthorization_user_campaign_idx"
  ON "McpOAuthAuthorization"("delegatedUserId", "campaignId");
CREATE UNIQUE INDEX "McpOAuthRefreshToken_tokenHash_key"
  ON "McpOAuthRefreshToken"("tokenHash");
CREATE INDEX "McpOAuthRefreshToken_client_expiry_idx"
  ON "McpOAuthRefreshToken"("clientId", "expiresAt", "revokedAt");
CREATE INDEX "McpOAuthRefreshToken_credential_idx"
  ON "McpOAuthRefreshToken"("credentialId");
