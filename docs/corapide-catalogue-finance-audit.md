# Corapide — audit préalable et proposition minimale

Date : 14 septembre 2026. Constats établis avant les modifications. Ce document décrit l’architecture initiale et le plan retenu ; le rapport final décrit les résultats.

## Architecture conservée

Backend NestJS, Prisma et PostgreSQL ; frontend Next.js et React ; permissions partagées dans `contracts`. Les fournisseurs sont les `Partner` existants et les bureaux les `Office` existants. Aucun nouveau système de stock, fournisseur, devis, catalogue ou comptabilité.

## Commerce : constat initial

- `Vehicle` possède déjà `supplierId`, `sourceOfferVehicleId`, statuts, photos et liens `DossierVehicle`.
- `ChinaOffer` référence le fournisseur et contient des lignes `ChinaOfferVehicle`, avec compteurs de quantité réservée/achetée.
- `CustomerQuotation` référence une offre, sa ligne et sa révision. `CustomerQuotationRevision` et `QuotationCost` figent montants, devises, taux et DZD. Le moteur `QuotationPricingService` réutilise `ExchangeRatesService`.
- `QuotationsService.create` publie actuellement le devis après validation du calcul, même au statut DRAFT. Cette règle de publication explicite est conservée.
- `CatalogueItem`, unique par ligne Chine, référence les devis actifs CIF/DDP. Sa relation Chine obligatoire empêche la publication d’un véhicule de stock autonome.
- `CatalogueWorkspace` juxtapose catalogue et inventaire brut ; cela crée deux parcours commerciaux. Le filtre fournisseur ne couvre que les offres.
- Le sourcing du wizard Dossier utilise déjà le Catalogue, mais propose aussi une sélection directe de stock. Réservation, annulation et restauration supposent une source Chine.
- Le formulaire de devis est intégré à `OfferDetailWorkspace`. Il faut l’extraire et réutiliser son moteur.
- Le contrôleur Catalogue exige VEHICLES_READ mais renvoie aussi des coûts et marges : filtrage backend nécessaire.

## Finance : sources de vérité initiales

| Valeur               | Source initiale                                  | Écart identifié                                                                           |
| -------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| CA encaissé global   | Journal VALIDATED lié à un paiement client       | Les acomptes autonomes sans projection sont ignorés                                       |
| Créances globales    | Factures moins encaissements                     | Contrats et échéanciers ignorés ; compensation indue entre dossiers                       |
| Vente Dossier        | Contrat, sinon échéancier, sinon factures        | Contrat DRAFT inclus ; certaines conversions faites à la lecture                          |
| Encaissement Dossier | Payment CONFIRMED.amount                         | Risque d’additionner plusieurs devises                                                    |
| Coût Dossier         | Cost POSTED, puis Purchase sans Cost             | Mélange coût reconnu/engagement ; coût général non exclu ; conversion historique instable |
| Coût global          | Journal DEBIT lié à Cost                         | Paiements fournisseurs exclus, évitant déjà une partie du double comptage                 |
| Marge globale        | Contrats signés moins coûts                      | Revenu contractuel assimilé au revenu reconnu                                             |
| Solde fournisseur    | Purchase.purchasePrice moins paiements confirmés | Concurrence insuffisamment contrôlée ; paiements PENDING occupent le plafond              |
| Solde trésorerie     | Solde initial + Journal crédit − débit           | Comptes facultatifs ; traitement incohérent des extournes                                 |
| Taux                 | ExchangeRate actif et date effective             | Pas de type ; doublons possibles ; certains historiques recalculés                        |

## Synchronisation et audit : écarts initiaux

`FinanceProjectionService` existe et projette les paiements confirmés par upsert dans la transaction métier. Il constitue le point de réutilisation. L’acompte enregistré par changement de statut Dossier passe un compte vide. `CustomerDepositsService.create` et son ancien chemin `apply` peuvent créer de l’argent confirmé sans Journal.

`CostsService.recordPurchaseCommitment` enregistre déjà l’achat confirmé comme `Cost POSTED` et `DIRECT_COST_PURCHASE`. Le nom historique est ambigu : il faut conserver la reconnaissance de l’achat confirmé, sans ajouter ses règlements au coût. La libération douanière appelle déjà `recordCustomsActual`.

Les extournes centrales et celles des services Payment/SupplierPayment/Cost n’ont pas le même effet. Une contre-écriture et la mise à jour atomique de la source doivent remplacer ces divergences.

`TreasuryAccount` et les soldes calculés existent, mais les bureaux, transferts et formulaires de configuration sont incomplets. Aucun compte réel ne doit être inventé ni affecté arbitrairement à un paiement historique.

`Shipment` conserve déjà le fret, son taux et sa quote-part par véhicule. Ces données de tarification ne constituent pas seules une preuve de paiement. Les frais réels doivent passer par `Cost` avec affectation explicite au dossier concerné ; `ShippingCost` historique ne doit pas devenir un deuxième Journal.

Les droits FINANCE_READ, FINANCE_REVERSE et TREASURY_READ/WRITE existent. Les réponses opérationnelles doivent aussi protéger les informations financières imbriquées.

## Proposition minimale retenue avant implémentation

1. **DB commerce** : relation `sourceVehicleId` facultative dans Quotation et Catalogue ; relation Chine du Catalogue facultative ; contrainte exclusive et index. `sourceType` et `sourceId` sont dérivés des références fiables. Le Dossier conserve le Catalogue et sa révision commerciale.
2. **Services/API commerce** : adapter le même service de devis et la requête Catalogue ; filtre fournisseur/source ; vérifier disponibilité et cohérence du devis/source ; adapter réservations, annulations et restaurations.
3. **Frontend commerce** : extraire le formulaire existant, ajouter Créer un devis dans Véhicules, afficher un Catalogue homogène et l’utiliser pour les dossiers de vente. Conserver le cas opérationnel Expédition seule.
4. **DB Finance** : liens Office, groupe de transfert, type de taux, snapshots manquants des contrats/factures/échéanciers, échéance fournisseur, protection des écritures validées. Migration additive ; pas d’invention de taux historiques.
5. **Services Finance** : compte obligatoire pour nouvelles opérations monétaires ; projection et extourne atomiques ; transferts exclus des revenus/coûts ; coûts directs et généraux séparés ; achats confirmés reconnus une seule fois.
6. **Calculs** : collections effectives ; créances par opération avec priorité contrat/échéancier/facture ; coûts réels enregistrés ; marges estimées distinctes ; historique incomplet signalé.
7. **Frontend Finance** : conserver onglets et disposition ; libellés métier ; suffixe monétaire unique ; comptes configurables par Bureau ; choix explicite du compte ; transferts et informations de rentabilité.
8. **Permissions** : droits existants ; suppression des champs sensibles sans autorisation ; isolation organisation et cohérence des relations côté API.
9. **Migrations/tests** : changements additifs, anciens enregistrements préservés ; migrations sur PostgreSQL isolé ; compilations, suites existantes, régressions HTTP, concurrence et navigateur. Aucune migration de production dans cette intervention.
