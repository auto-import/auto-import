-- Additive: existing users keep password-only authentication and version zero.
CREATE TABLE "UserTwoFactor" (
  "userId" TEXT NOT NULL,
  "secretCiphertext" TEXT,
  "pendingCiphertext" TEXT,
  "pendingExpiresAt" TIMESTAMP(3),
  "enabledAt" TIMESTAMP(3),
  "recoveryHashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "lastUsedStep" INTEGER,
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  "challengeHash" TEXT,
  "challengeExpiresAt" TIMESTAMP(3),
  "sessionVersion" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserTwoFactor_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "UserTwoFactor_enabled_secret_check" CHECK ("enabledAt" IS NULL OR "secretCiphertext" IS NOT NULL),
  CONSTRAINT "UserTwoFactor_counters_check" CHECK ("failedAttempts" >= 0 AND "sessionVersion" >= 0),
  CONSTRAINT "UserTwoFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
