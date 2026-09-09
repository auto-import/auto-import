# Expéditions, références client et stock — rapport d’implémentation

## Résultat

Les formulaires utilisent les API NestJS et les relations Prisma existantes. Les deux champs client identifiés dans `ClientsWorkspace.tsx` sont **Pays de résidence** (`countryId`) et **Nationalité** (`nationalityCountryId`). Ils partagent déjà `CrmReferenceValue`, de type `COUNTRY` : aucune table client supplémentaire n’a été créée.

Le type de conteneur est désormais un enum Prisma `ShipmentContainerType` : `THREE_VEHICLES` et `FOUR_VEHICLES`, présenté par l’API comme « 3 véhicules » et « 4 véhicules ». Les anciens `ContainerPreset` restent disponibles pour les caractéristiques physiques. Le nombre de véhicules autorisé provient du type métier, également utilisé pour répartir le fret.

## Modèles et migration

- `Shipment` : ajout nullable de `containerType`, `departurePortId`, `arrivalPortId` et relations vers `Port`.
- `Port` : UUID, organisation, nom, code, pays facultatif, dates ; unicité du code normalisé par organisation. Les clés étrangères des ports d’expédition incluent l’organisation.
- `Organization` : relation inverse `ports`.
- Réutilisation de `ShipmentVehicle`, `DossierVehicle`, `Vehicle`, `CrmReferenceValue`, `Purchase` et `CatalogueItem`.
- Migration additive : `backend/prisma/migrations/20260911120000_persistent_shipping_references/migration.sql`.
- Reprise des types historiques depuis les presets à 3/4 véhicules ; reprise des ports historiques uniquement lorsque leur code est explicitement présent. Les textes anciens restent conservés, notamment lorsqu’un code manque. Aucun véhicule, lien ou historique existant n’est supprimé.

## API et permissions

Toutes les routes bénéficient des guards JWT et permissions globaux. L’organisation est issue de l’utilisateur authentifié.

| Route | Fonction / permission |
|---|---|
| `GET /shipments/container-types` | Deux types canoniques, libellés et capacités ; `shipments:read` |
| `GET /ports` | Ports de l’organisation ; `shipments:read` |
| `POST /ports` | Création persistante, normalisation et audit ; `shipments:write` |
| `POST /crm/reference-data` | Création d’un pays dans le référentiel existant ; `clients:write` |
| `GET /crm/reference-data` | Lecture existante réutilisée ; `crmReference:read` |
| `POST /shipments`, `PUT /shipments/:id` | Type, références de ports, fret et autres métadonnées persistés ; validations de relations et de capacité |
| `POST /shipments/:id/vehicles`, `DELETE /shipments/:id/vehicles/:vehicleId` | Affectation réelle et recalcul du fret dans une transaction |
| `POST /shipments/:id/transition` | Transition sérialisée ; départ physique du stock sans dossier actif |
| `GET /vehicles/eligible-for-dossier` | Éligibilité serveur avec pagination et recherche ; `vehicles:read` |
| `GET /vehicles?inventoryOnly=true` | Vue du stock canonique pour le Catalogue ; `vehicles:read` |
| `GET /vehicles?shipmentAssignable=true` | Véhicules chargeables sans autre expédition active ; `vehicles:read` |
| `POST /dossiers`, `POST /dossiers/:id/vehicles` | Réservation atomique avec validation de disponibilité, organisation, propriété et dossier actif |

Le préfixe global HTTP est `/api`. Les réponses de listes conservent `items` et `pagination`. Le mapping existant du dossier expose les véhicules réels issus de `dossierVehicles[].vehicle` ; le détail véhicule expose déjà `dossiers`, désormais typé et affiché dans l’inventaire.

## Audit des quatre flux

**A — Stock → Véhicules → Catalogue → sélection dossier.** Le Catalogue existant décrit des lignes d’offres commercialisées par devis, avec quantités. Il ne doit pas devenir une copie de l’inventaire. Une vue « Véhicules en stock » utilise maintenant directement `/vehicles?inventoryOnly=true`. Le formulaire dossier appelle l’endpoint d’éligibilité existant, au lieu d’une liste générique limitée aux cent premiers véhicules. Recherche, pagination et erreurs explicites sont disponibles.

**B — Dossier → relation → réservation.** L’UUID sélectionné est envoyé à `DossiersService`. La réservation conditionnelle `available → reserved` et la création du lien `DossierVehicle` restent dans la même transaction. Les conditions de propriété, d’archivage et d’absence d’autre dossier actif sont appliquées à la réservation atomique, y compris lors d’un ajout ultérieur. L’inventaire et la vue stock du Catalogue relisent le même statut.

**C — Offre Chine → dossier → achat.** Une offre publiée reste une offre fournisseur, avec ses quantités et ses devis. Le workflow existant de sourcing réserve une unité et peut créer son véhicule opérationnel `chinaOffer` dès le dossier ; l’achat confirmé réutilise ce véhicule. Cette représentation n’implique pas à elle seule que le véhicule soit en stock. Le filtre d’inventaire accepte `stock`, ou les véhicules d’origine `chinaOffer`/`clientRequest` possédant un achat `confirmed` dans la même organisation. Les offres non achetées sont exclues de la sélection directe de stock. Les tests existants vérifient que l’achat du dossier conserve le même véhicule et qu’un VIN identifiable n’est pas dupliqué.

**D — Expédition → véhicules → dossier → logistique.** `ShipmentVehicle` reste l’unique relation d’affectation. Les mutations verrouillent l’expédition ; l’affectation verrouille aussi le véhicule et interdit son rattachement à deux expéditions actives. La capacité est contrôlée à la création, à l’ajout et au changement de type. Le nombre de places ne bénéficie d’aucune dérogation, même en concurrence. Les dérogations physiques existantes conservent leur justification. Le départ met le stock sans dossier actif en `inTransit`. Pour les véhicules liés à un dossier, le mapping métier existant des étapes dossier et les règles douanières restent autoritaires : le statut de l’expédition ne contourne pas les justificatifs du dossier.

## Interfaces

Les sélecteurs de ports et de pays permettent d’ajouter une valeur par API ; ils affichent chargement, absence de données, erreur réelle, reprise et succès après enregistrement. Une création en échec ne produit aucune option fictive. Les valeurs sont rechargées depuis le backend à la réouverture.

Le formulaire d’expédition envoie les UUID des ports et le type enum, ainsi que fret/devise/taux Finance, conteneur, navire, B/L, ETD et ETA. Le détail expose la capacité, la pagination des véhicules chargeables et les erreurs d’affectation. Un refus de capacité en nombre ne déclenche plus une proposition de dérogation.

Le détail d’inventaire charge le véhicule canonique et affiche ses dossiers associés. Le parcours « Expédition seule » permet de réutiliser un véhicule externe ; la création externe utilise le parcours existant avec trois photos et conserve l’UUID obtenu si la création du dossier échoue.

## Fichiers

Backend, schéma et migration :

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260911120000_persistent_shipping_references/migration.sql`
- `backend/src/prisma/prisma.service.ts`
- `backend/src/shipments/{container-type.ts,ports.controller.ts,ports.service.ts,shipments.controller.ts,shipments.module.ts,shipments.service.ts,dto/shipments.dto.ts}`
- `backend/src/crm/{crm.controller.ts,crm-reference.service.ts,dto/crm-reference.dto.ts}`
- `backend/src/vehicles/{dossier-eligibility.ts,vehicles.service.ts,dto/filter-vehicle.dto.ts}`
- `backend/src/dossiers/dossiers.service.ts`

Frontend :

- `frontend/app/(dashboard)/expeditions/page.tsx`
- `frontend/components/PersistentReferenceSelect.tsx`
- `frontend/components/crm/ClientsWorkspace.tsx`
- `frontend/components/commerce/{CatalogueWorkspace.tsx,DossierWizardWorkspace.tsx,ShipmentDetailDialog.tsx,VehicleStockPolished.tsx,common.tsx}`
- `frontend/lib/{commerce-api.ts,crm-api.ts,logistics-api.ts}`

Tests :

- `backend/test/persistent-erp-flows.e2e-spec.ts` : neuf scénarios sur PostgreSQL réel, dont migration historique, références persistantes, contrôles HTTP JWT/RBAC, isolation, capacité 3/4, concurrence, UUID dossier, transitions et redémarrage NestJS.
- `backend/test/dossier-catalogue.e2e-spec.ts` : fixture d’expédition adaptée au type obligatoire ; suite sourcing/achat existante exécutée.
- `backend/src/shipments/{shipments.service.spec.ts,shipments-comprehensive.spec.ts}` : doubles de transaction adaptés au verrouillage.
- `backend/src/vehicle-requests/procurement-operations.spec.ts` : attentes adaptées au contrôle atomique renforcé.
- `frontend/components/{PersistentReferenceSelect.test.tsx,crm/ClientsWorkspace.references.test.tsx}`
- `frontend/components/commerce/{DossierWizardWorkspace.test.tsx,CatalogueWorkspace.stock.test.tsx,ShipmentDetailDialog.test.tsx}`

## Vérifications effectuées

| Validation | Résultat |
|---|---|
| Backend `npm run build` | Réussi |
| Backend `npm test -- --runInBand` | 68 suites, 400 tests réussis |
| Retest ciblé après dernière modification du service expédition | 2 suites, 5 tests réussis |
| `npx prisma validate` | Schéma valide |
| `npx prisma generate` | Client généré |
| `npx prisma migrate deploy` sur PostgreSQL 17 isolé | 37 migrations appliquées |
| Suites E2E persistance + catalogue/dossier | 32 tests réussis, 2 scénarios optionnels ignorés |
| Retest final de la suite persistance | 9/9 réussis |
| Frontend `npm run build` | Réussi, TypeScript inclus |
| Frontend `npm test` | 27 fichiers, 78 tests réussis |
| Redémarrage PostgreSQL Docker de test | Empreinte identique des lignes Port, CrmReferenceValue, Shipment, ShipmentVehicle, Vehicle et DossierVehicle avant/après |

Les fixtures de test sont exclusivement dans `codex_dossier_fix_persistence`, sur un PostgreSQL Docker distinct. Aucune donnée métier de l’ERP n’a été ajoutée, modifiée ou supprimée par ces tests. Aucune configuration `.env` n’a été modifiée.

Le conteneur de test `corapide-persistence-regression-20260909` a été arrêté après vérification ; ses données ont été conservées.

## Déploiement et limites

La connexion ERP configurée, `localhost:51214/auto_import`, refusait les connexions. La migration n’a donc pas été appliquée à cette base. Une fois cette base disponible, exécuter `npx prisma migrate deploy` depuis `backend`, puis déployer/redémarrer backend et frontend. Le backend vérifie désormais la présence de cette migration au démarrage.

Les deux scénarios optionnels de la suite existante nécessitant un navigateur réel et une image de déploiement dédiée n’ont pas été exécutés. Les interfaces ont été vérifiées par leurs tests de composants et leur build, les flux persistants par HTTP/NestJS/Prisma/PostgreSQL. Les ports historiques sans code restent à compléter par sélection d’un port enregistré ; aucune valeur de référence manquante n’a été inventée.
