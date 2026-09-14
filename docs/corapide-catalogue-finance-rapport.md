# Corapide — rapport général de modification et de validation

14 septembre 2026 — modifications locales ; aucun déploiement et aucune modification de la base de production.

## Résultat

Les deux chantiers ont été réalisés dans l’architecture existante : un Catalogue commercial commun au stock et aux Offres Chine, puis la synchronisation de Finance. Les modèles Vehicle, Partner/Fournisseur, Office/Bureau, CustomerQuotation, CatalogueItem, Dossier, Cost, Payment et FinanceTransaction restent les références existantes.

L’[audit préalable](corapide-catalogue-finance-audit.md) documente les sources initiales, les déconnexions et la proposition minimale retenue avant implémentation.

## Véhicules → Devis → Catalogue → Dossier

- Action **Créer un devis** dans le stock ; extraction du formulaire de devis existant dans `QuotationDialog`, réutilisé par Véhicules et Offres Chine.
- Même service de calcul, validations, révisions et lignes de coûts. Montants, devises, taux Finance et contre-valeurs DZD restent figés dans chaque révision.
- Origine stock ou Chine conservée par relations exclusives. L’API expose `sourceType` et `sourceId` ; pour la Chine, l’identifiant de l’offre et celui de sa ligne restent traçables.
- Une seule API Catalogue et des cartes communes. Filtre Fournisseur fondé sur Partner, pour les deux sources ; recherche, source et disponibilité conservées.
- Les dossiers de vente sélectionnent le Catalogue. Le chemin opérationnel Expédition seule conserve son fonctionnement adapté aux véhicules externes.
- Le dossier conserve Catalogue, devis et révision commerciale. Un véhicule de stock est réutilisé sans duplication ; une offre Chine ne crée pas artificiellement un stock lors de sa publication.
- Lorsqu’un véhicule de stock possède déjà un achat confirmé, le dossier réutilise cette référence et son coût historique ; l’étape Achat confirmé ne demande ni nouvelle facture ni nouvel enregistrement financier.
- Réservation atomique, contrôle de validité du devis, disponibilité, organisation et droits côté backend. Annulation/restauration du stock sans modifier les compteurs Chine.
- Publication existante conservée : le système publie le devis après validation de son calcul, même si son statut administratif est encore DRAFT. Les devis rejetés, expirés ou non publiés ne permettent pas une nouvelle sélection commerciale.
- Coûts et marges protégés dans les réponses Catalogue et dans les objets imbriqués des dossiers et devis.

## Finance : source de vérité après modification

| Valeur               | Calcul / source retenue                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CA encaissé          | Paiements clients CONFIRMED ; montants DZD historiques. Acomptes autonomes anciens sans Payment distingués pour éviter de les compter deux fois              |
| Créances ouvertes    | Solde par opération : contrat signé, sinon échéancier actif, sinon facture émise ; encaissements déduits sans compenser un autre dossier avec un surpaiement |
| Coûts réels          | Cost POSTED ; contre-valeurs figées ; distinction DIRECT / OPERATING                                                                                         |
| Achat véhicule       | Achat confirmé reconnu une fois par son Cost ; ses règlements ne créent pas un deuxième coût                                                                 |
| Solde fournisseur    | Montant d’achat moins paiements confirmés dans la devise fournisseur ; paiement partiel, payé, retard et annulation distingués                               |
| Marge estimée        | Révision commerciale figée du devis                                                                                                                          |
| Marge réelle Dossier | Vente client moins coûts directs réellement enregistrés ; caractère provisoire visible tant que le dossier n’est pas finalisé                                |
| Marge consolidée     | Revenus reconnus des dossiers livrés/clôturés ou services terminés moins coûts directs réels ; charges générales séparées                                    |
| Trésorerie           | Solde initial audité + entrées − sorties du Journal ; originaux extournés et contre-écritures se compensent                                                  |

### Synchronisation

La confirmation d’un paiement crée sa projection Journal et son mouvement sur le compte choisi dans la même transaction. Les soldes, KPIs et données Dossier relisent ces faits ; aucune double saisie du même paiement n’est nécessaire.

Les acomptes autonomes créent désormais Payment et Journal. Leur affectation à une facture/échéance ne crée pas un deuxième encaissement. Le rapprochement d’un acompte historique demande un compte explicite et, pour une devise étrangère, son taux historique documenté. Les allocations PENDING ne rendent plus une facture ou une échéance payée.

Les coûts directs de douane, assurance, fret, transit, port, transport local et autres coûts utilisent Cost. Les charges générales n’affectent pas automatiquement la marge d’un dossier. Un coût d’expédition doit identifier le dossier auquel sa part est affectée ; aucune répartition arbitraire entre clients. Les données de tarification du fret ne sont pas assimilées à un décaissement.

### Journal et audit

Libellés métier conservant les codes internes. Relations vers dossier, client/fournisseur, achat/véhicule, source, Bureau, compte, date, référence et snapshot monétaire disponibles selon l’événement.

Une écriture VALIDATED ou REVERSED ne peut plus être supprimée ou modifiée silencieusement : un déclencheur PostgreSQL protège l’historique. L’extourne conserve l’original, crée une contre-écriture avec le même taux et synchronise Payment, SupplierPayment ou Cost. Les allocations et factures sont rapprochées. Motif, utilisateur, date et relation original/contre-écriture sont conservés. L’annulation d’un achat ayant encore des écritures actives exige leur extourne préalable.

### Trésorerie et change

Comptes configurables avec code, nom, devise, type, Bureau, solde initial, entrées, sorties, solde calculé et statut. Choix explicite d’un compte actif de la bonne devise pour un paiement réel ; aucun compte automatiquement inventé. Les anciens comptes sans Bureau restent consultables et doivent être configurés avant de nouveaux mouvements.

Transferts atomiques avec deux écritures liées, référence et protection contre la répétition. Les transferts n’augmentent ni revenus ni coûts. Leur extourne traite les deux comptes ensemble.

Types de taux Commercial, Banque, Interne et Manuel ; date effective ; unicité des définitions actives à date identique. Le choix du type est également disponible lors de la validation des paiements clients/fournisseurs. Le changement d’un taux ne modifie pas les anciennes opérations.

## Migrations

Deux migrations additives :

1. `20260914100000_catalogue_vehicle_source` : source stock des devis/catalogue, relations, index et contrainte de source exclusive.
2. `20260914120000_finance_synchronization` : bureaux, transferts, types de taux, snapshots contrats/factures/échéanciers, échéance fournisseur et protection du Journal.

Aucune suppression d’enregistrement. Les anciennes contre-valeurs DZD sont complétées à taux 1 lorsque la devise est déjà DZD. Aucun taux étranger inconnu n’est fabriqué. Les doublons de taux actifs à même date sont désactivés de façon déterministe, sans suppression de leur historique.

Les 40 migrations du dépôt ont été appliquées et leur état vérifié sur PostgreSQL 17 isolé. Le schéma Prisma est valide. Les deux nouvelles migrations n’ont pas été exécutées en production.

## Tests et contrôles

| Vérification                                         | Résultat                                                                                                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend : 71 suites                                  | **431 tests réussis**                                                                                                                                    |
| Frontend                                             | **83 tests réussis**                                                                                                                                     |
| Intégration PostgreSQL / HTTP / Chrome / conteneur   | **30 scénarios réussis**, aucun ignoré                                                                                                                   |
| Compilation backend NestJS                           | Réussie                                                                                                                                                  |
| Compilation frontend Next.js de production et typage | Réussie                                                                                                                                                  |
| Image Docker backend de production                   | Construite et démarrée localement ; dossiers relus après redémarrage                                                                                     |
| Schéma Prisma / état des migrations                  | Valide ; 40 migrations à jour sur la base isolée                                                                                                         |
| Précontrôle SQL de rapprochement                     | Exécuté en lecture seule sur la base de test                                                                                                             |
| Lint frontend ciblé                                  | Aucune nouvelle erreur ; 6 erreurs préexistantes subsistent dans quatre composants, comparaison avec HEAD conservée dans `frontend-lint-comparison.json` |

Les scénarios vérifient notamment : stock et Chine, CIF/DDP, filtre fournisseur, réutilisation du véhicule, réservation concurrente, annulation/restauration, absence de mouvement financier pour un devis, acompte/contrat/créance, paiements fournisseurs partiels et concurrents, types de taux, immutabilité après changement du change, coûts directs/généraux, extournes, trésorerie, transferts, acomptes historiques, permissions et refus d’un compte incompatible.

Chrome a parcouru Catalogue → création de Dossier → contrat → acompte avec compte → réservation du véhicule → rechargement, puis les cinq onglets Journal, Trésorerie, Fournisseurs, Charges et Change. Le test surveille les réponses serveur 5xx.

Une erreur 500 a été découverte pendant le développement sur un conflit d’écriture du pilote PostgreSQL. Elle a été corrigée et couverte par un test : la seconde opération concurrente retourne désormais 409, avec rollback. **Aucune erreur 500 observée dans la dernière exécution des 30 scénarios.** Les réponses 400/403/404/409 attendues des tests négatifs restent des refus métier normaux.

## Vérifications avant production

- Sauvegarder et tester les migrations sur une copie des données réelles, puis déployer backend et frontend compatibles.
- Configurer les comptes réels et leurs Bureaux ; renseigner les taux applicables. Les exemples de comptes du cahier des charges ne sont pas créés automatiquement.
- Exécuter [`catalogue-finance-preflight-readonly.sql`](../backend/scripts/catalogue-finance-preflight-readonly.sql) pour repérer comptes sans Bureau, paiements sans Journal/compte, acomptes historiques, snapshots étrangers manquants et coûts doublonnés.
- Rapprocher ces anomalies avec les justificatifs réels. Les historiques étrangers sans contre-valeur fiable sont signalés et exclus des totaux DZD concernés ; ne pas les recalculer au taux courant. Les anciens paiements déjà validés sans projection nécessitent un rapprochement documenté, pas une deuxième saisie de paiement.
- Faire la recette des rôles et des données réelles en préproduction. Les tests réalisés couvrent les scénarios décrits ; ils ne constituent pas une garantie universelle d’absence d’incident sur toute configuration future.

Aucune donnée de production n’a été utilisée pour les tests et aucun message n’a été envoyé à des tiers.

## Reproduire les contrôles

Dans `backend`, lancer `npm test -- --runInBand` puis `npm run build`. Dans `frontend`, lancer `npm test` puis `npm run build`.

La suite `backend/test/dossier-catalogue.e2e-spec.ts` exige une base locale jetable dont le nom commence par `codex_dossier_fix_`. Exécuter les migrations sur cette base, puis `npm run test:e2e -- --runInBand test/dossier-catalogue.e2e-spec.ts`. Pour les deux contrôles supplémentaires, renseigner `DOSSIER_BROWSER_URL` avec un frontend local compilé et `DOSSIER_CONTAINER_IMAGE` avec l’image backend construite depuis `backend/Dockerfile.production`. La suite refuse une base distante ou non identifiée comme base de test.
