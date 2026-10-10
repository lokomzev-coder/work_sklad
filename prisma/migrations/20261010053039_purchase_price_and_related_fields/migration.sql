-- CreateEnum
CREATE TYPE "RelatedFieldDocumentType" AS ENUM ('ORDER', 'PURCHASE_ORDER', 'INVOICE_OUT', 'INVOICE_IN');

-- CreateEnum
CREATE TYPE "RelatedFieldSourceKind" AS ENUM ('BUILTIN', 'CUSTOM');

-- AlterTable
ALTER TABLE "CatalogItem" ADD COLUMN     "purchasePrice" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "RelatedFieldConfig" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "documentType" "RelatedFieldDocumentType" NOT NULL,
    "sourceKind" "RelatedFieldSourceKind" NOT NULL,
    "fieldKey" TEXT,
    "customFieldDefinitionId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelatedFieldConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RelatedFieldConfig_orgId_documentType_idx" ON "RelatedFieldConfig"("orgId", "documentType");

-- AddForeignKey
ALTER TABLE "RelatedFieldConfig" ADD CONSTRAINT "RelatedFieldConfig_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelatedFieldConfig" ADD CONSTRAINT "RelatedFieldConfig_customFieldDefinitionId_fkey" FOREIGN KEY ("customFieldDefinitionId") REFERENCES "CustomFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

