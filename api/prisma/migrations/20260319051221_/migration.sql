/*
  Warnings:

  - You are about to drop the column `enableWaitlist` on the `events` table. All the data in the column will be lost.
  - You are about to drop the column `maxAttendees` on the `events` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "start" DATETIME NOT NULL,
    "end" DATETIME NOT NULL,
    "isAllDay" BOOLEAN DEFAULT false,
    "location" TEXT,
    "minAttendees" INTEGER,
    "deadline" DATETIME,
    "allowMaybe" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "events_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "events_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_events" ("allowMaybe", "createdAt", "createdBy", "deadline", "description", "end", "groupId", "id", "isAllDay", "location", "minAttendees", "start", "subtitle", "title", "updatedAt", "updatedBy") SELECT "allowMaybe", "createdAt", "createdBy", "deadline", "description", "end", "groupId", "id", "isAllDay", "location", "minAttendees", "start", "subtitle", "title", "updatedAt", "updatedBy" FROM "events";
DROP TABLE "events";
ALTER TABLE "new_events" RENAME TO "events";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
