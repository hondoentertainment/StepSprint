-- CreateTable
CREATE TABLE "OAuthPkcePending" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stateNonce" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "challengeId" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OAuthPkcePending_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "OAuthPkcePending_stateNonce_key" ON "OAuthPkcePending"("stateNonce");

-- CreateIndex
CREATE INDEX "OAuthPkcePending_userId_idx" ON "OAuthPkcePending"("userId");

-- CreateIndex
CREATE INDEX "OAuthPkcePending_expiresAt_idx" ON "OAuthPkcePending"("expiresAt");
