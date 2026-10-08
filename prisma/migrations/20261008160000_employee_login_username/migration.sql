-- Employee display names can repeat once each account has a distinct login
-- handle. Existing employee accounts retain NULL and may keep using their
-- name-based sign-in until a manager assigns a handle.
ALTER TABLE "User" ADD COLUMN "loginUsername" TEXT;
DROP INDEX "User_companyId_firstName_lastName_key";
CREATE UNIQUE INDEX "User_companyId_loginUsername_key"
  ON "User"("companyId", "loginUsername");
