-- AlterTable
ALTER TABLE "events" ADD COLUMN "enableWaitlist" BOOLEAN DEFAULT false;
ALTER TABLE "events" ADD COLUMN "maxAttendees" INTEGER;
