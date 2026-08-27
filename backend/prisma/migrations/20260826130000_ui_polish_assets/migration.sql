CREATE TABLE "UserAvatar" (
  "userId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserAvatar_pkey" PRIMARY KEY ("userId")
);

CREATE UNIQUE INDEX "UserAvatar_fileId_key" ON "UserAvatar"("fileId");
CREATE INDEX "UserAvatar_organizationId_idx" ON "UserAvatar"("organizationId");
ALTER TABLE "UserAvatar" ADD CONSTRAINT "UserAvatar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserAvatar" ADD CONSTRAINT "UserAvatar_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserAvatar" ADD CONSTRAINT "UserAvatar_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
