-- Additive foundation reconciliation. Existing operational rows are assigned
-- only from tenant-owned relations. Ambiguous or inconsistent rows abort the
-- migration instead of being attached to an arbitrary organization.

-- DropIndex
DROP INDEX "Client_organizationId_idx";

-- DropIndex
DROP INDEX "Dossier_organizationId_idx";

-- DropIndex
DROP INDEX "Order_organizationId_idx";

-- DropIndex
DROP INDEX "Partner_organizationId_idx";

-- DropIndex
DROP INDEX "Prospect_organizationId_idx";

-- DropIndex
DROP INDEX "Vehicle_organizationId_idx";

-- DropIndex
DROP INDEX "VehicleRequest_organizationId_idx";

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "CustomerDeposit" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "CustomsFile" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "organizationId" TEXT;

-- Backfill direct operational ownership from mandatory tenant parents.
UPDATE "StockMovement" movement
SET "organizationId" = vehicle."organizationId"
FROM "Vehicle" vehicle
WHERE movement."vehicleId" = vehicle."id";

UPDATE "Purchase" purchase
SET "organizationId" = vehicle."organizationId"
FROM "Vehicle" vehicle
JOIN "Partner" supplier ON supplier."organizationId" = vehicle."organizationId"
WHERE purchase."vehicleId" = vehicle."id"
  AND supplier."id" = purchase."supplierId"
  AND supplier."organizationId" = vehicle."organizationId";

UPDATE "Shipment" shipment
SET "organizationId" = carrier."organizationId"
FROM "Partner" carrier
WHERE shipment."carrierPartnerId" = carrier."id";

UPDATE "Shipment" shipment
SET "organizationId" = inferred."organizationId"
FROM (
  SELECT shipment_vehicle."shipmentId", MIN(vehicle."organizationId") AS "organizationId"
  FROM "ShipmentVehicle" shipment_vehicle
  JOIN "Vehicle" vehicle ON vehicle."id" = shipment_vehicle."vehicleId"
  GROUP BY shipment_vehicle."shipmentId"
  HAVING COUNT(DISTINCT vehicle."organizationId") = 1
) inferred
WHERE shipment."id" = inferred."shipmentId"
  AND (shipment."organizationId" IS NULL OR shipment."organizationId" = inferred."organizationId");

UPDATE "CustomsFile" customs
SET "organizationId" = shipment."organizationId"
FROM "Shipment" shipment
WHERE customs."shipmentId" = shipment."id";

UPDATE "CustomsFile" customs
SET "organizationId" = vehicle."organizationId"
FROM "Vehicle" vehicle
WHERE customs."vehicleId" = vehicle."id"
  AND (customs."organizationId" IS NULL OR customs."organizationId" = vehicle."organizationId");

UPDATE "CustomerDeposit" deposit
SET "organizationId" = inferred."organizationId"
FROM (
  SELECT parent."depositId", MIN(parent."organizationId") AS "organizationId"
  FROM (
    SELECT deposit_row."id" AS "depositId", prospect."organizationId"
    FROM "CustomerDeposit" deposit_row
    JOIN "Prospect" prospect ON prospect."id" = deposit_row."prospectId"
    UNION ALL
    SELECT deposit_row."id", client."organizationId"
    FROM "CustomerDeposit" deposit_row
    JOIN "Client" client ON client."id" = deposit_row."clientId"
    UNION ALL
    SELECT deposit_row."id", customer_order."organizationId"
    FROM "CustomerDeposit" deposit_row
    JOIN "Order" customer_order ON customer_order."id" = deposit_row."orderId"
  ) parent
  GROUP BY parent."depositId"
  HAVING COUNT(DISTINCT parent."organizationId") = 1
) inferred
WHERE deposit."id" = inferred."depositId";

UPDATE "Task" task
SET "organizationId" = assignee."organizationId"
FROM "User" assignee
JOIN "User" creator ON creator."organizationId" = assignee."organizationId"
WHERE assignee."id" = task."assignedTo"
  AND creator."id" = task."createdBy"
  AND creator."organizationId" = assignee."organizationId";

UPDATE "AuditLog" audit
SET "organizationId" = app_user."organizationId"
FROM "User" app_user
WHERE audit."userId" = app_user."id";

DO $$
DECLARE
  unresolved JSONB;
BEGIN
  SELECT jsonb_build_object(
    'AuditLog', (SELECT COUNT(*) FROM "AuditLog" WHERE "organizationId" IS NULL),
    'CustomerDeposit', (SELECT COUNT(*) FROM "CustomerDeposit" WHERE "organizationId" IS NULL),
    'CustomsFile', (SELECT COUNT(*) FROM "CustomsFile" WHERE "organizationId" IS NULL),
    'Purchase', (SELECT COUNT(*) FROM "Purchase" WHERE "organizationId" IS NULL),
    'Shipment', (SELECT COUNT(*) FROM "Shipment" WHERE "organizationId" IS NULL),
    'StockMovement', (SELECT COUNT(*) FROM "StockMovement" WHERE "organizationId" IS NULL),
    'Task', (SELECT COUNT(*) FROM "Task" WHERE "organizationId" IS NULL)
  ) INTO unresolved;

  IF EXISTS (SELECT 1 FROM jsonb_each_text(unresolved) entry WHERE entry.value::BIGINT > 0) THEN
    RAISE EXCEPTION 'Foundation migration cannot infer tenant ownership: %', unresolved;
  END IF;
END $$;

ALTER TABLE "AuditLog" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "CustomerDeposit" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "CustomsFile" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Purchase" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Shipment" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "StockMovement" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "organizationId" SET NOT NULL;

-- CreateTable
CREATE TABLE "RefreshSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ipAddress" TEXT,

    CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefreshSession_tokenHash_key" ON "RefreshSession"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshSession_userId_revokedAt_expiresAt_idx" ON "RefreshSession"("userId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "RefreshSession_expiresAt_idx" ON "RefreshSession"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_entityType_entityId_idx" ON "AuditLog"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "BusinessDocument_uploadedBy_createdAt_idx" ON "BusinessDocument"("uploadedBy", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessDocument_entityType_entityId_idx" ON "BusinessDocument"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Client_organizationId_createdAt_idx" ON "Client"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Client_organizationId_email_idx" ON "Client"("organizationId", "email");

-- CreateIndex
CREATE INDEX "CustomerDeposit_organizationId_status_createdAt_idx" ON "CustomerDeposit"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerDeposit_prospectId_idx" ON "CustomerDeposit"("prospectId");

-- CreateIndex
CREATE INDEX "CustomerDeposit_clientId_idx" ON "CustomerDeposit"("clientId");

-- CreateIndex
CREATE INDEX "CustomerDeposit_orderId_idx" ON "CustomerDeposit"("orderId");

-- CreateIndex
CREATE INDEX "CustomsDocument_customsFileId_idx" ON "CustomsDocument"("customsFileId");

-- CreateIndex
CREATE INDEX "CustomsDocument_fileId_idx" ON "CustomsDocument"("fileId");

-- CreateIndex
CREATE INDEX "CustomsFile_organizationId_status_openedAt_idx" ON "CustomsFile"("organizationId", "status", "openedAt");

-- CreateIndex
CREATE INDEX "CustomsFile_shipmentId_idx" ON "CustomsFile"("shipmentId");

-- CreateIndex
CREATE INDEX "CustomsFile_vehicleId_idx" ON "CustomsFile"("vehicleId");

-- CreateIndex
CREATE INDEX "Dossier_organizationId_status_openedAt_idx" ON "Dossier"("organizationId", "status", "openedAt");

-- CreateIndex
CREATE INDEX "Dossier_organizationId_type_openedAt_idx" ON "Dossier"("organizationId", "type", "openedAt");

-- CreateIndex
CREATE INDEX "Dossier_clientId_idx" ON "Dossier"("clientId");

-- CreateIndex
CREATE INDEX "Dossier_salesUserId_idx" ON "Dossier"("salesUserId");

-- CreateIndex
CREATE INDEX "Dossier_opsUserId_idx" ON "Dossier"("opsUserId");

-- CreateIndex
CREATE INDEX "DossierStatusHistory_dossierId_createdAt_idx" ON "DossierStatusHistory"("dossierId", "createdAt");

-- CreateIndex
CREATE INDEX "DossierStatusHistory_changedBy_idx" ON "DossierStatusHistory"("changedBy");

-- CreateIndex
CREATE INDEX "DossierVehicle_vehicleId_idx" ON "DossierVehicle"("vehicleId");

-- CreateIndex
CREATE INDEX "FileAsset_uploadedBy_createdAt_idx" ON "FileAsset"("uploadedBy", "createdAt");

-- CreateIndex
CREATE INDEX "Invoice_orderId_status_idx" ON "Invoice"("orderId", "status");

-- CreateIndex
CREATE INDEX "Invoice_clientId_idx" ON "Invoice"("clientId");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceItem_orderItemId_idx" ON "InvoiceItem"("orderItemId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_templateId_idx" ON "Notification"("templateId");

-- CreateIndex
CREATE INDEX "Office_organizationId_status_idx" ON "Office"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Office_organizationId_name_key" ON "Office"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Order_organizationId_status_orderDate_idx" ON "Order"("organizationId", "status", "orderDate");

-- CreateIndex
CREATE INDEX "Order_clientId_idx" ON "Order"("clientId");

-- CreateIndex
CREATE INDEX "Order_prospectId_idx" ON "Order"("prospectId");

-- CreateIndex
CREATE INDEX "Order_createdBy_idx" ON "Order"("createdBy");

-- CreateIndex
CREATE INDEX "OrderItem_vehicleId_idx" ON "OrderItem"("vehicleId");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_createdAt_idx" ON "OrderStatusHistory"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_changedBy_idx" ON "OrderStatusHistory"("changedBy");

-- CreateIndex
CREATE INDEX "Organization_status_idx" ON "Organization"("status");

-- CreateIndex
CREATE INDEX "Partner_organizationId_type_status_idx" ON "Partner"("organizationId", "type", "status");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_installmentId_idx" ON "Payment"("installmentId");

-- CreateIndex
CREATE INDEX "Payment_status_paymentDate_idx" ON "Payment"("status", "paymentDate");

-- CreateIndex
CREATE INDEX "PaymentInstallment_status_dueDate_idx" ON "PaymentInstallment"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentInstallment_paymentPlanId_installmentNumber_key" ON "PaymentInstallment"("paymentPlanId", "installmentNumber");

-- CreateIndex
CREATE INDEX "PaymentPlan_orderId_status_idx" ON "PaymentPlan"("orderId", "status");

-- CreateIndex
CREATE INDEX "Prospect_organizationId_status_createdAt_idx" ON "Prospect"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Prospect_organizationId_assignedTo_idx" ON "Prospect"("organizationId", "assignedTo");

-- CreateIndex
CREATE INDEX "ProspectActivity_prospectId_activityDate_idx" ON "ProspectActivity"("prospectId", "activityDate");

-- CreateIndex
CREATE INDEX "ProspectActivity_userId_idx" ON "ProspectActivity"("userId");

-- CreateIndex
CREATE INDEX "Purchase_organizationId_status_purchaseDate_idx" ON "Purchase"("organizationId", "status", "purchaseDate");

-- CreateIndex
CREATE INDEX "Purchase_supplierId_idx" ON "Purchase"("supplierId");

-- CreateIndex
CREATE INDEX "Purchase_vehicleId_idx" ON "Purchase"("vehicleId");

-- CreateIndex
CREATE INDEX "Reservation_vehicleId_status_idx" ON "Reservation"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "Reservation_orderId_idx" ON "Reservation"("orderId");

-- CreateIndex
CREATE INDEX "Reservation_reservedBy_idx" ON "Reservation"("reservedBy");

-- CreateIndex
CREATE INDEX "Role_organizationId_scope_idx" ON "Role"("organizationId", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "Role_organizationId_name_key" ON "Role"("organizationId", "name");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE INDEX "Shipment_organizationId_status_etd_idx" ON "Shipment"("organizationId", "status", "etd");

-- CreateIndex
CREATE INDEX "Shipment_carrierPartnerId_idx" ON "Shipment"("carrierPartnerId");

-- CreateIndex
CREATE INDEX "ShipmentVehicle_vehicleId_idx" ON "ShipmentVehicle"("vehicleId");

-- CreateIndex
CREATE INDEX "ShipmentVehicle_orderId_idx" ON "ShipmentVehicle"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentVehicle_shipmentId_vehicleId_key" ON "ShipmentVehicle"("shipmentId", "vehicleId");

-- CreateIndex
CREATE INDEX "ShippingCost_shipmentId_idx" ON "ShippingCost"("shipmentId");

-- CreateIndex
CREATE INDEX "StockMovement_organizationId_createdAt_idx" ON "StockMovement"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_vehicleId_createdAt_idx" ON "StockMovement"("vehicleId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_fromLocationId_idx" ON "StockMovement"("fromLocationId");

-- CreateIndex
CREATE INDEX "StockMovement_toLocationId_idx" ON "StockMovement"("toLocationId");

-- CreateIndex
CREATE INDEX "StockMovement_performedBy_idx" ON "StockMovement"("performedBy");

-- CreateIndex
CREATE INDEX "SupplierPayment_purchaseId_status_idx" ON "SupplierPayment"("purchaseId", "status");

-- CreateIndex
CREATE INDEX "Task_organizationId_status_dueDate_idx" ON "Task"("organizationId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Task_assignedTo_status_idx" ON "Task"("assignedTo", "status");

-- CreateIndex
CREATE INDEX "Task_createdBy_idx" ON "Task"("createdBy");

-- CreateIndex
CREATE INDEX "User_organizationId_status_idx" ON "User"("organizationId", "status");

-- CreateIndex
CREATE INDEX "User_officeId_idx" ON "User"("officeId");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE INDEX "Vehicle_organizationId_status_createdAt_idx" ON "Vehicle"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Vehicle_supplierId_idx" ON "Vehicle"("supplierId");

-- CreateIndex
CREATE INDEX "Vehicle_currentLocationId_idx" ON "Vehicle"("currentLocationId");

-- CreateIndex
CREATE INDEX "VehicleCandidate_vehicleId_idx" ON "VehicleCandidate"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleCandidate_vehicleRequestId_vehicleId_key" ON "VehicleCandidate"("vehicleRequestId", "vehicleId");

-- CreateIndex
CREATE INDEX "VehiclePhoto_vehicleId_sortOrder_idx" ON "VehiclePhoto"("vehicleId", "sortOrder");

-- CreateIndex
CREATE INDEX "VehiclePhoto_fileId_idx" ON "VehiclePhoto"("fileId");

-- CreateIndex
CREATE INDEX "VehicleRequest_organizationId_status_createdAt_idx" ON "VehicleRequest"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "VehicleRequest_prospectId_idx" ON "VehicleRequest"("prospectId");

-- CreateIndex
CREATE INDEX "VehicleRequest_clientId_idx" ON "VehicleRequest"("clientId");

-- CreateIndex
CREATE INDEX "VehicleRequest_assignedTo_idx" ON "VehicleRequest"("assignedTo");

-- CreateIndex
CREATE INDEX "Warehouse_organizationId_status_idx" ON "Warehouse"("organizationId", "status");

-- CreateIndex
CREATE INDEX "WarehouseLocation_warehouseId_status_idx" ON "WarehouseLocation"("warehouseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseLocation_warehouseId_code_key" ON "WarehouseLocation"("warehouseId", "code");

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectActivity" ADD CONSTRAINT "ProspectActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- User-role links are identity-owned and must not block deletion of an otherwise
-- unreferenced account. Roles remain protected while assigned.
ALTER TABLE "UserRole" DROP CONSTRAINT "UserRole_userId_fkey";
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Permission links are role-owned; assignments still protect a role through
-- UserRole, while its permission join rows are removed with the role.
ALTER TABLE "RolePermission" DROP CONSTRAINT "RolePermission_roleId_fkey";
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dossier" ADD CONSTRAINT "Dossier_salesUserId_fkey" FOREIGN KEY ("salesUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dossier" ADD CONSTRAINT "Dossier_opsUserId_fkey" FOREIGN KEY ("opsUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DossierStatusHistory" ADD CONSTRAINT "DossierStatusHistory_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_currentLocationId_fkey" FOREIGN KEY ("currentLocationId") REFERENCES "WarehouseLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "WarehouseLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "WarehouseLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleRequest" ADD CONSTRAINT "VehicleRequest_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleRequest" ADD CONSTRAINT "VehicleRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleRequest" ADD CONSTRAINT "VehicleRequest_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_reservedBy_fkey" FOREIGN KEY ("reservedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_carrierPartnerId_fkey" FOREIGN KEY ("carrierPartnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentVehicle" ADD CONSTRAINT "ShipmentVehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentVehicle" ADD CONSTRAINT "ShipmentVehicle_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomsFile" ADD CONSTRAINT "CustomsFile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomsFile" ADD CONSTRAINT "CustomsFile_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomsFile" ADD CONSTRAINT "CustomsFile_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDocument" ADD CONSTRAINT "BusinessDocument_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerDeposit" ADD CONSTRAINT "CustomerDeposit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerDeposit" ADD CONSTRAINT "CustomerDeposit_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerDeposit" ADD CONSTRAINT "CustomerDeposit_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerDeposit" ADD CONSTRAINT "CustomerDeposit_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
