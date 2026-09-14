# Section 3 — Couleur extérieure et état de peinture

## Audit préalable et changement minimal

`Vehicle` possède `condition` (état général) et `interiorColor`, mais aucune couleur extérieure structurée ni état de peinture. La couleur existante est `VehicleSpec.color`, texte libre avec un ancien identifiant de lookup facultatif. Les endpoints create/update véhicule et upsert specs sont protégés par les permissions Véhicules et l'organisation. Le formulaire actif `/vehicules` est `VehicleStockPolished.tsx`. `VehiclesWorkspace.tsx` n'est pas routé et reste inchangé.

Ajouter `VehicleColor` et `VehiclePaintCondition`, avec `Vehicle.color` nullable et `Vehicle.paintCondition` initialisé à `UNKNOWN`. Migration additive des couleurs françaises/anglaises reconnues ; texte non vide non reconnu classé `OTHER`, absence laissée à null. Conserver intégralement `VehicleSpec.color` et les lookups existants. L'état général et la couleur intérieure restent distincts.

Le backend valide les enums et maintient la compatibilité de l'ancien endpoint specs dans une transaction : une ancienne écriture de couleur alimente la couleur structurée ; une modification explicite de couleur structurée actualise sa représentation texte. Une modification de peinture seule ne touche pas la couleur. Les créations depuis les offres utilisent le même mapping. Les valeurs de peinture ne sont jamais déduites d'une couleur ou de l'état général.

Le formulaire actif reçoit deux sélecteurs distincts ; la fiche affiche les deux informations. Le texte historique est conservé lors des modifications sans changement de couleur. Aucun nouveau module, endpoint ou permission.

Validation prévue : migration avec valeurs historiques, API réelle (création, modification, refus des enums invalides, isolation tenant, compatibilité specs), formulaire actif et vérifications TypeScript.

## Résultat et validation — 14 septembre 2026

Implémentation terminée dans les modèles, DTOs create/update, services Véhicules et création depuis les Offres (y compris Catalogue → Dossier), types API et formulaire actif. Les nouvelles valeurs sont visibles dans la fiche véhicule. L'ancien endpoint specs reste utilisable ; les écritures de couleur et leur représentation historique sont synchronisées dans la même transaction. L'ancien lookup couleur est conservé et son identifiant est retiré uniquement lorsqu'une nouvelle couleur est explicitement choisie.

Migration `20260914170000_vehicle_color_paint` appliquée avec succès sur PostgreSQL 17 local jetable : 42 migrations au total. Sept fixtures préparées avant migration vérifient gris, argenté, doré, anglais, texte inconnu, texte vide et null, avec conservation exacte du texte historique. Pas de modification de production.

- 24 tests backend de régression Véhicules, Offres, Catalogue → Dossier et isolation tenant réussis.
- 8 scénarios HTTP/PostgreSQL réussis : création réelle avec trois photos, lecture, modification de peinture seule, changement/effacement de couleur, ancien endpoint specs, enums incorrects ou mélangés, null interdit pour peinture, contrôle inter-organisations et permissions.
- 3 tests frontend réussis, dont le formulaire actif envoyant séparément `color` et `paintCondition` sans réécrire la couleur historique via specs.
- TypeScript backend et frontend : aucune erreur. Contrôle `git diff --check` réussi.
- Aucun HTTP 500 observé dans ces parcours. Les valeurs invalides renvoient 400 ; les accès interdits renvoient 403/404.

Soit 35 tests réussis, plus les 7 cas de migration. Pas de nouvelle session Chrome ni de test visuel multi-écrans dans cette section ; le formulaire est vérifié avec Testing Library. Les builds complets de la section 2 n'ont pas été relancés pour cette modification ciblée.

Déploiement : appliquer la migration avec `prisma migrate deploy` depuis `backend` avant de démarrer le nouveau backend. Le contrôle de migration au démarrage exige cette migration pour éviter des lectures sur un schéma incomplet. `VehiclesWorkspace.tsx` reste inchangé car non routé. Aucun commit ni déploiement effectué ; section 4 non commencée.
