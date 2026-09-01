-- CreateTable
CREATE TABLE "SignupVerification" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignupVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SignupVerification_email_idx" ON "SignupVerification"("email");
