-- Additive: preserve every historical VehicleSpec.color and lookup.
CREATE TYPE "VehicleColor" AS ENUM ('BLACK', 'WHITE', 'GRAY', 'SILVER', 'BLUE', 'RED', 'GREEN', 'BROWN', 'BEIGE', 'GOLD', 'ORANGE', 'YELLOW', 'PURPLE', 'OTHER');
CREATE TYPE "VehiclePaintCondition" AS ENUM ('ORIGINAL', 'TOUCHED_UP', 'PARTIALLY_REPAINTED', 'MULTIPLE_PANELS_REPAINTED', 'FULLY_REPAINTED', 'ACCIDENT_REPAINTED', 'SCRATCHED', 'DAMAGED', 'UNKNOWN');
ALTER TABLE "Vehicle" ADD COLUMN "color" "VehicleColor", ADD COLUMN "paintCondition" "VehiclePaintCondition" NOT NULL DEFAULT 'UNKNOWN';

UPDATE "Vehicle" v SET "color" = (CASE
  WHEN s.color IS NULL OR btrim(s.color) = '' THEN NULL
  WHEN translate(lower(btrim(regexp_replace(s.color, '\s+', ' ', 'g'))), 'éèêëàâäîïôöùûüç', 'eeeeaaaiioouuuc') IN ('noir', 'noire', 'black') THEN 'BLACK'
  WHEN translate(lower(btrim(regexp_replace(s.color, '\s+', ' ', 'g'))), 'éèêëàâäîïôöùûüç', 'eeeeaaaiioouuuc') IN ('blanc', 'blanche', 'white') THEN 'WHITE'
  WHEN translate(lower(btrim(regexp_replace(s.color, '\s+', ' ', 'g'))), 'éèêëàâäîïôöùûüç', 'eeeeaaaiioouuuc') IN ('gris', 'grise', 'gray', 'grey') THEN 'GRAY'
  WHEN translate(lower(btrim(regexp_replace(s.color, '\s+', ' ', 'g'))), 'éèêëàâäîïôöùûüç', 'eeeeaaaiioouuuc') IN ('argent', 'argente', 'argentee', 'silver') THEN 'SILVER'
  WHEN translate(lower(btrim(regexp_replace(s.color, '\s+', ' ', 'g'))), 'éèêëàâäîïôöùûüç', 'eeeeaaaiioouuuc') IN ('bleu', 'bleue', 'blue') THEN 'BLUE'
  WHEN translate(lower(btrim(regexp_replace(s.color, '\s+', ' ', 'g'))), 'éèêëàâäîïôöùûüç', 'eeeeaaaiioouuuc') IN ('rouge', 'red') THEN 'RED'
  WHEN translate(lower(btrim(regexp_replace(s.color, '\s+', ' ', 'g'))), 'éèêëàâäîïôöùûüç', 'eeeeaaaiioouuuc') IN ('vert', 'verte', 'green') THEN 'GREEN'
  WHEN translate(lower(btrim(regexp_replace(s.color, '\s+', ' ', 'g'))), 'éèêëàâäîïôöùûüç', 'eeeeaaaiioouuuc') IN ('marron', 'brun', 'brune', 'brown') THEN 'BROWN'
  WHEN translate(lower(btrim(regexp_replace(s.color, '\s+', ' ', 'g'))), 'éèêëàâäîïôöùûüç', 'eeeeaaaiioouuuc') IN ('beige') THEN 'BEIGE'
  WHEN translate(lower(btrim(regexp_replace(s.color, '\s+', ' ', 'g'))), 'éèêëàâäîïôöùûüç', 'eeeeaaaiioouuuc') IN ('or', 'dore', 'doree', 'gold', 'golden') THEN 'GOLD'
  WHEN translate(lower(btrim(regexp_replace(s.color, '\s+', ' ', 'g'))), 'éèêëàâäîïôöùûüç', 'eeeeaaaiioouuuc') IN ('orange') THEN 'ORANGE'
  WHEN translate(lower(btrim(regexp_replace(s.color, '\s+', ' ', 'g'))), 'éèêëàâäîïôöùûüç', 'eeeeaaaiioouuuc') IN ('jaune', 'yellow') THEN 'YELLOW'
  WHEN translate(lower(btrim(regexp_replace(s.color, '\s+', ' ', 'g'))), 'éèêëàâäîïôöùûüç', 'eeeeaaaiioouuuc') IN ('violet', 'violette', 'purple') THEN 'PURPLE'
  WHEN translate(lower(btrim(regexp_replace(s.color, '\s+', ' ', 'g'))), 'éèêëàâäîïôöùûüç', 'eeeeaaaiioouuuc') IN ('autre', 'other') THEN 'OTHER'
  ELSE 'OTHER' END)::"VehicleColor" FROM "VehicleSpec" s WHERE s."vehicleId" = v.id;
