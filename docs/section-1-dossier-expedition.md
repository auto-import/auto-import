# Section 1 — Dossier et expédition maritime

## Audit avant implémentation

Le Dossier valide un workflow séquentiel versionné puis synchronise Vehicle dans sa transaction. Shipment possède un workflow séparé (`pending`, `booked`, `loading`, `inTransit`, `arrived`, `cancelled`), un historique et la création idempotente des dossiers douaniers à l'arrivée. Aucun appel ne relie actuellement ces deux transitions. ShipmentVehicle relie les véhicules ; DossierVehicle relie leurs dossiers. CustomsFile peut également relier explicitement un dossier à une expédition. Aucun statut individuel maritime n'existe sur ShipmentVehicle.

Le frontend lit déjà Shipment.status via l'API existante. Les routes sont protégées par les permissions dossiers et expéditions. Les migrations existantes conservent des statuts texte et ces relations ; aucune nouvelle table n'est nécessaire.

## Modification minimale retenue

Centraliser la propagation du Dossier vers Vehicle et Shipment dans un service appelé avec la transaction du Dossier. Réutiliser les écritures, dates et automatismes de ShipmentsService dans une méthode transactionnelle commune, sans transaction imbriquée. Appeler aussi la propagation maritime lorsque Douane fait avancer le Dossier DDP.

| Étape Dossier (y compris alias historiques) | Statut Shipment |
| --- | --- |
| Avant réservation maritime | Aucun changement |
| Shipment Booking / Booking | booked |
| Loading | loading |
| BL émis / BL conteneur / In Transit | inTransit |
| Arrived at Port / Arrived | arrived |
| Douane, mainlevée, sortie port, transport local, livraison, documents remis, clôture, service terminé | arrived (voyage terminé) |
| Annulation du Dossier | Aucun changement du voyage partagé |

Un Shipment décrit un voyage commun : le jalon maritime le plus avancé validé par un dossier fait foi. Les autres dossiers ne sont pas avancés artificiellement ; leurs formalités restent individuelles. Un dossier retardataire ne fait pas reculer le navire. Pas de second statut maritime par véhicule ni de migration. Une expédition annulée reste annulée. Les liens historiques de voyages déjà arrivés ne sont pas réécrits. Les mises à jour utilisent un verrou sur Shipment et un ordre stable des identifiants.

Les retours en arrière ne sont autorisés par aucun des deux workflows existants. La correction conserve cette restriction. L'annulation d'un dossier n'est pas l'annulation d'un conteneur partagé. La synchronisation n'ouvre pas de route publique supplémentaire et conserve les contrôles du workflow source et le cloisonnement par organisation.

## Validation

Validation du 14 septembre 2026 sur environnement local isolé :

- Suite backend complète : **72 suites, 460 tests réussis**, aucun échec ni test ignoré.
- Intégration PostgreSQL 17 et API Nest réelle : **6 scénarios réussis**, aucun HTTP 500 observé. Les refus attendus retournent 401, 404 ou 409.
- Composant frontend ShipmentDetailDialog : **1 test réussi**. Le frontend existant affiche déjà `arrived` comme « Arrivé au port » ; aucune modification visuelle nécessaire.
- Vérification finale ciblée après formatage et renforcement du test d'arrivée : **59 tests réussis** (déjà compris dans les 460).
- Build NestJS réussi.
- Résultats compacts : `section-1-validation.json`.

Les six scénarios réels couvrent : arrivée DDP avec photo vérifiée et refus sans photo ; conteneur avec dossiers à des étapes différentes ; arrivée shipping-only et chargement ; rollback de Dossier, Vehicle, Shipment et historiques lors d'un conflit injecté dans l'automatisation ; isolation entre organisations et accès sans authentification ; deux arrivées concurrentes sans doublon ; synchronisation par le lien CustomsFile lorsque Douane avance le Dossier. Les retours en arrière Dossier et Shipment sont refusés avec HTTP 409.

Un ancien test unitaire d'arrivée shipping-only absorbait toutes les exceptions. Sa fixture a été complétée et il exige maintenant que la transition réussisse, tout en vérifiant l'absence de contrôle documentaire DDP.

## Livrable et périmètre

- Nouvelle table de correspondance : `backend/src/dossiers/workflows/dossier-shipment-status.map.ts`.
- Point central de propagation : `dossier-status-propagation.service.ts`, injecté dans DossiersService. La correspondance Dossier → Vehicle existante reste réutilisée ; la section 6 n'est pas commencée.
- ShipmentsService : extraction des effets d'une transition dans une méthode commune, synchronisation interne depuis le Dossier avec verrou et relecture du lien dans la transaction.
- CustomsService : appel de cette même synchronisation maritime lorsque Douane change le statut du Dossier DDP.
- Modules Nest et fixtures de tests adaptés aux dépendances obligatoires.
- Aucune nouvelle route, permission, table, colonne ou migration pour cette section. Aucun recalcul Finance ni mouvement financier ajouté.
- Tests dédiés : `backend/src/dossiers/workflows/dossier-shipment-status-sync.spec.ts` et `backend/test/dossier-shipment-sync.e2e-spec.ts`.

Aucun déploiement ni accès à la base de production. La synchronisation s'applique aux prochaines transitions ; aucun historique ancien n'a été réécrit en masse. Les modifications précédentes Catalogue/Finance sont conservées dans le workspace ; aucun commit regroupant plusieurs sections n'a été créé.

## Scénario manuel de recette

1. Dans une organisation de test, rattacher deux véhicules de dossiers différents au même conteneur en transit.
2. Sur un Dossier DDP en transit, ajouter la photo d'arrivée de chaque véhicule puis valider « Arrivé au port ».
3. Recharger Expéditions : le conteneur affiche « Arrivé au port », sa date d'arrivée est renseignée et l'historique identifie le dossier déclencheur et l'utilisateur. Les dossiers douaniers sont créés une seule fois.
4. Vérifier que l'autre Dossier conserve son étape ; avancer son workflow ne fait pas reculer le conteneur.
5. Tenter un retour à « En transit » des deux côtés : l'API refuse avec 409 et l'historique reste intact.
6. Répéter avec un Dossier shipping-only : « Arrived » synchronise le voyage sans demander la photo spécifique au parcours DDP.

Arrêt demandé après la section 1 : validation du client attendue avant toute implémentation de la section 2 (2FA).
