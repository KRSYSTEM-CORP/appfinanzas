-- Session revocation on password change (audit KRPOS-SEC-006).
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
