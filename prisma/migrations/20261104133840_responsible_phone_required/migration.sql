/*
  Warnings:

  - Made the column `phone` on table `Responsible` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Responsible" ALTER COLUMN "phone" SET NOT NULL;
