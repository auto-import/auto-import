-- Normalize legacy dossier status identifiers to the canonical English API values.
UPDATE "Dossier"
SET "status" = CASE "status"
  WHEN 'prospection' THEN 'offerSelected'
  WHEN 'offre_selectionnee' THEN 'offerSelected'
  WHEN 'client_confirme' THEN 'clientConfirmed'
  WHEN 'contrat_signe' THEN 'contractSigned'
  WHEN 'acompte_recu' THEN 'depositReceived'
  WHEN 'recherche_vehicule' THEN 'purchaseConfirmed'
  WHEN 'achat' THEN 'purchaseConfirmed'
  WHEN 'achat_confirme' THEN 'purchaseConfirmed'
  WHEN 'paiement_fournisseur' THEN 'supplierPaid'
  WHEN 'chargement' THEN 'loading'
  WHEN 'bl_emis' THEN 'billOfLadingIssued'
  WHEN 'en_transit' THEN 'inTransit'
  WHEN 'arrivee_port' THEN 'arrivedAtPort'
  WHEN 'documents_remis' THEN 'documentsDelivered'
  WHEN 'douane' THEN 'customsClearance'
  WHEN 'mainlevee' THEN 'customsReleased'
  WHEN 'sortie_port' THEN 'portExit'
  WHEN 'transport_local' THEN 'localTransport'
  WHEN 'livraison_client' THEN 'deliveredToClient'
  WHEN 'client' THEN 'clientRegistered'
  WHEN 'vehicule_externe_renseigne' THEN 'externalVehicleRecorded'
  WHEN 'fournisseur_externe' THEN 'externalSupplierRecorded'
  WHEN 'reception_pickup' THEN 'pickupReceived'
  WHEN 'devis_shipping' THEN 'shippingQuoted'
  WHEN 'paiement' THEN 'paymentReceived'
  WHEN 'bl_conteneur' THEN 'containerBillOfLading'
  WHEN 'cloture' THEN 'closed'
  WHEN 'service_termine' THEN 'serviceCompleted'
  WHEN 'annule' THEN 'cancelled'
  ELSE "status"
END;

UPDATE "DossierStatusHistory"
SET "fromStatus" = CASE "fromStatus"
  WHEN 'prospection' THEN 'offerSelected'
  WHEN 'offre_selectionnee' THEN 'offerSelected'
  WHEN 'client_confirme' THEN 'clientConfirmed'
  WHEN 'contrat_signe' THEN 'contractSigned'
  WHEN 'acompte_recu' THEN 'depositReceived'
  WHEN 'recherche_vehicule' THEN 'purchaseConfirmed'
  WHEN 'achat' THEN 'purchaseConfirmed'
  WHEN 'achat_confirme' THEN 'purchaseConfirmed'
  WHEN 'paiement_fournisseur' THEN 'supplierPaid'
  WHEN 'chargement' THEN 'loading'
  WHEN 'bl_emis' THEN 'billOfLadingIssued'
  WHEN 'en_transit' THEN 'inTransit'
  WHEN 'arrivee_port' THEN 'arrivedAtPort'
  WHEN 'documents_remis' THEN 'documentsDelivered'
  WHEN 'douane' THEN 'customsClearance'
  WHEN 'mainlevee' THEN 'customsReleased'
  WHEN 'sortie_port' THEN 'portExit'
  WHEN 'transport_local' THEN 'localTransport'
  WHEN 'livraison_client' THEN 'deliveredToClient'
  WHEN 'client' THEN 'clientRegistered'
  WHEN 'vehicule_externe_renseigne' THEN 'externalVehicleRecorded'
  WHEN 'fournisseur_externe' THEN 'externalSupplierRecorded'
  WHEN 'reception_pickup' THEN 'pickupReceived'
  WHEN 'devis_shipping' THEN 'shippingQuoted'
  WHEN 'paiement' THEN 'paymentReceived'
  WHEN 'bl_conteneur' THEN 'containerBillOfLading'
  WHEN 'cloture' THEN 'closed'
  WHEN 'service_termine' THEN 'serviceCompleted'
  WHEN 'annule' THEN 'cancelled'
  ELSE "fromStatus"
END
WHERE "fromStatus" IS NOT NULL;

UPDATE "DossierStatusHistory"
SET "toStatus" = CASE "toStatus"
  WHEN 'prospection' THEN 'offerSelected'
  WHEN 'offre_selectionnee' THEN 'offerSelected'
  WHEN 'client_confirme' THEN 'clientConfirmed'
  WHEN 'contrat_signe' THEN 'contractSigned'
  WHEN 'acompte_recu' THEN 'depositReceived'
  WHEN 'recherche_vehicule' THEN 'purchaseConfirmed'
  WHEN 'achat' THEN 'purchaseConfirmed'
  WHEN 'achat_confirme' THEN 'purchaseConfirmed'
  WHEN 'paiement_fournisseur' THEN 'supplierPaid'
  WHEN 'chargement' THEN 'loading'
  WHEN 'bl_emis' THEN 'billOfLadingIssued'
  WHEN 'en_transit' THEN 'inTransit'
  WHEN 'arrivee_port' THEN 'arrivedAtPort'
  WHEN 'documents_remis' THEN 'documentsDelivered'
  WHEN 'douane' THEN 'customsClearance'
  WHEN 'mainlevee' THEN 'customsReleased'
  WHEN 'sortie_port' THEN 'portExit'
  WHEN 'transport_local' THEN 'localTransport'
  WHEN 'livraison_client' THEN 'deliveredToClient'
  WHEN 'client' THEN 'clientRegistered'
  WHEN 'vehicule_externe_renseigne' THEN 'externalVehicleRecorded'
  WHEN 'fournisseur_externe' THEN 'externalSupplierRecorded'
  WHEN 'reception_pickup' THEN 'pickupReceived'
  WHEN 'devis_shipping' THEN 'shippingQuoted'
  WHEN 'paiement' THEN 'paymentReceived'
  WHEN 'bl_conteneur' THEN 'containerBillOfLading'
  WHEN 'cloture' THEN 'closed'
  WHEN 'service_termine' THEN 'serviceCompleted'
  WHEN 'annule' THEN 'cancelled'
  ELSE "toStatus"
END;

UPDATE "Vehicle"
SET "status" = CASE "status"
  WHEN 'in_transit' THEN 'inTransit'
  WHEN 'in_customs' THEN 'inCustoms'
  ELSE "status"
END;

UPDATE "Shipment"
SET "status" = CASE "status"
  WHEN 'in_transit' THEN 'inTransit'
  ELSE "status"
END;

UPDATE "CustomsFile"
SET "status" = CASE "status"
  WHEN 'documents_pending' THEN 'documentsPending'
  WHEN 'under_review' THEN 'underReview'
  ELSE "status"
END;

ALTER TABLE "Dossier" ALTER COLUMN "status" SET DEFAULT 'offerSelected';

-- Rename the only legacy permission resource spelling without dropping role grants.
DO $$
DECLARE
  legacy_permission RECORD;
  canonical_id TEXT;
BEGIN
  FOR legacy_permission IN
    SELECT "id", "action"
    FROM "Permission"
    WHERE "resource" = 'vehicle-requests'
  LOOP
    SELECT "id" INTO canonical_id
    FROM "Permission"
    WHERE "resource" = 'vehicleRequests'
      AND "action" = legacy_permission."action";

    IF canonical_id IS NULL THEN
      UPDATE "Permission"
      SET "resource" = 'vehicleRequests'
      WHERE "id" = legacy_permission."id";
    ELSE
      INSERT INTO "RolePermission" ("roleId", "permissionId")
      SELECT "roleId", canonical_id
      FROM "RolePermission"
      WHERE "permissionId" = legacy_permission."id"
      ON CONFLICT DO NOTHING;

      DELETE FROM "RolePermission"
      WHERE "permissionId" = legacy_permission."id";

      DELETE FROM "Permission"
      WHERE "id" = legacy_permission."id";
    END IF;
  END LOOP;
END $$;
