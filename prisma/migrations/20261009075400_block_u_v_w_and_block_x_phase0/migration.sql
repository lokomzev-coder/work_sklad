-- AlterEnum
ALTER TYPE "CustomFieldEntityType" ADD VALUE 'TASK';

-- DropIndex
DROP INDEX "User_email_key";

-- AlterTable
ALTER TABLE "InvoiceIn" ADD COLUMN     "name" TEXT;

-- AlterTable
ALTER TABLE "InvoiceOut" ADD COLUMN     "name" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "name" TEXT;

-- AlterTable
ALTER TABLE "ProductionOrder" ADD COLUMN     "name" TEXT;

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "name" TEXT;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "name" TEXT,
ADD COLUMN     "sourceInventoryId" TEXT;

-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "maxLegalEntities" INTEGER,
ADD COLUMN     "maxStorageMb" INTEGER,
ADD COLUMN     "maxStores" INTEGER;

-- CreateIndex
CREATE INDEX "StockMovement_sourceInventoryId_idx" ON "StockMovement"("sourceInventoryId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_sourceInventoryId_fkey" FOREIGN KEY ("sourceInventoryId") REFERENCES "StockMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

