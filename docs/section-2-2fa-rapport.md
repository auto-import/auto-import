# Section 2 — Authentification à deux facteurs

Date : 14 septembre 2026. Implémentation locale, sans déploiement en production.

## Résultat

La connexion email/mot de passe reste disponible pour les utilisateurs sans 2FA. Pour un utilisateur ayant activé la 2FA, le mot de passe ouvre une étape authenticator ou code de récupération. Aucun accès métier ni refresh token n'est délivré avant cette vérification.

Le profil propose la configuration avec QR code généré localement, la saisie manuelle du secret et la confirmation par code à six chiffres. Dix codes de récupération sont affichés une seule fois après activation. La désactivation exige le mot de passe et un second facteur. Les administrateurs disposant de `users:manage` peuvent réinitialiser la 2FA d'un autre utilisateur de leur organisation, après réauthentification et saisie d'un motif audité.

L'[audit préalable](section-2-2fa-audit.md) décrit les composants inspectés et les modifications minimales retenues. Les mécanismes JWT, refresh sessions, chiffrement et audit existants sont réutilisés.

## Base de données et services

- Migration additive `20260914150000_user_two_factor` : table dédiée `UserTwoFactor`, relation facultative à `User`, clé primaire/FK sur `userId`, valeurs initiales et contraintes de cohérence. Aucune suppression ni activation automatique des comptes existants.
- Secrets provisoires et actifs chiffrés en AES-256-GCM, avec sous-clé TOTP dérivée de la clé serveur existante et liaison cryptographique à l'utilisateur. Les codes de récupération aléatoires de 128 bits sont uniquement conservés sous forme de hashes.
- Challenge JWT de cinq minutes, distinct d'un access token et à usage unique. Il est refusé par les guards HTTP et les deux gateways WebSocket. Un changement de mot de passe invalide un challenge en attente.
- TOTP à six chiffres, période de trente secondes, tolérance d'un pas. Un code déjà accepté ne peut pas être rejoué. Setup valable dix minutes.
- Verrou utilisateur persistant de quinze minutes après cinq échecs. Limitation supplémentaire par IP sur les routes concernées. Les compteurs persistent après un échec et après redémarrage du service.
- Verrouillage transactionnel de l'utilisateur : consommation du facteur, audit et création de session réussissent ou échouent ensemble. Deux requêtes concurrentes ne peuvent pas consommer le même code de récupération.
- Activation, désactivation et reset révoquent les refresh sessions et incrémentent la version contrôlée sur les access tokens. Les nouveaux accès avec les anciens jetons sont refusés.
- Les audits enregistrent acteur, utilisateur cible, organisation, date et motif selon l'action, sans secret, code ni token. Les réponses sensibles portent `Cache-Control: no-store`.

## API et frontend

Les réponses conservent l'enveloppe `ResponseInterceptor` et les DTOs explicites validés par `class-validator`.

| Route sous `/api/auth` | Usage / protection |
| --- | --- |
| `POST /login` | Connexion habituelle ou challenge 2FA après mot de passe correct |
| `POST /two-factor/verify` | Validation du challenge et création de la session existante |
| `GET /two-factor/status` | État du compte connecté, sans secret ni hash |
| `POST /two-factor/setup` | Préparation après vérification du mot de passe actuel |
| `POST /two-factor/enable` | Activation après vérification du code TOTP |
| `POST /two-factor/disable` | Mot de passe et facteur exigés |
| `POST /two-factor/users/:id/reset` | Permission `users:manage`, même organisation, réauthentification de l'acteur et motif |

`AuthProvider` et `authApi` conservent les tokens d'accès en mémoire. Le formulaire `/connexion`, le profil existant et l'administration utilisateurs accueillent les nouvelles actions. Aucun secret 2FA n'est placé dans localStorage/sessionStorage.

Le test navigateur a révélé que le proxy Next redirigeait les appels API sans cookie vers la page de connexion. Le proxy laisse désormais les routes API atteindre les guards du backend ; les pages privées restent protégées. Des tests couvrent login, refresh, vérification 2FA, API protégée et navigation avec/sans cookie.

Une fixture du test existant `DossierWizardWorkspace.test.tsx` a été complétée : l'appel simulé des véhicules éligibles renvoie désormais une promesse. Cela supprime trois exceptions asynchrones dans la suite globale, sans changer ce formulaire métier.

## Vérifications réalisées

| Contrôle | Résultat final |
| --- | --- |
| Suite backend complète | 73 suites, 468 tests réussis |
| Suite frontend complète | 31 fichiers, 92 tests réussis, aucune exception asynchrone |
| PostgreSQL réel + HTTP + Chrome | 13 scénarios réussis, aucun scénario ignoré |
| Total de ces trois suites | 573 tests réussis |
| Types TypeScript backend et frontend | Réussis |
| Builds Nest et Next | Réussis |
| Image Docker de production | Construction réussie ; TOTP et génération QR exécutés avec succès dans le runtime Linux |
| Lint ciblé sur les fichiers frontend 2FA | Aucune erreur ; trois avertissements sur le mock image du test |
| `git diff --check` | Réussi |
| Migration PostgreSQL 17 isolé | 41 migrations appliquées, dont la nouvelle migration 2FA |

Les scénarios couvrent la compatibilité sans 2FA, les anciens access tokens des comptes non modifiés, setup incomplet/expiré, code invalide/expiré/rejoué, concurrence, récupération à usage unique, verrou persistant, révocation des sessions, reset RBAC/inter-organisations, absence de secrets dans les réponses ordinaires et les audits, ainsi que le rollback si l'émission de session échoue.

Dans Chrome : connexion habituelle, profil, QR réellement affiché, activation, reconnexion TOTP, erreur de code affichée, reconnexion par récupération, diminution du nombre de codes restants, désactivation puis connexion habituelle. Aucun HTTP 500 observé dans les scénarios d'intégration et le parcours navigateur. Un secret volontairement corrompu renvoie le HTTP 503 attendu et un message contrôlé ; les autres refus attendus utilisent 401/403/404/409/429.

Deux scénarios d'intégration avaient dépassé le délai Jest de cinq secondes pendant les suites simultanées. Le délai de cette suite PostgreSQL/bcrypt a été porté à trente secondes ; la relance complète a réussi. Le parcours navigateur conserve un délai distinct.

Résultats synthétiques : [section-2-validation.json](section-2-validation.json).

## Déploiement et limites de validation

Appliquer la migration avec la procédure Prisma habituelle avant de démarrer le nouveau backend (`prisma migrate deploy`, depuis `backend`). Le contrôle de migration au démarrage exige désormais cette migration, afin de refuser un schéma incomplet. La migration a été testée uniquement sur la base locale jetable ; aucune base de production n'a été modifiée.

Conserver et sauvegarder `INTEGRATION_SECRETS_ENCRYPTION_KEY`, déjà utilisée par l'application. Une modification sans migration des secrets rendrait les authenticator existants indéchiffrables. L'horloge serveur doit rester synchronisée pour TOTP. La limite par IP utilise le stockage en mémoire du throttler existant ; le verrou par utilisateur est en PostgreSQL et commun aux instances. La révocation empêche les requêtes HTTP et nouvelles connexions WebSocket ; elle ne force pas la fermeture d'une socket déjà ouverte.

Le contrôle des dépendances de production signale dix avis préexistants (huit élevés, deux modérés) sur des versions inchangées, aucun sur les nouvelles dépendances `otplib`/`qrcode`. Les six erreurs de lint préexistantes hors section 2 restent documentées dans [la comparaison de lint](frontend-lint-comparison.json). Ces points ne sont pas masqués par le succès des tests ; leur correction relève d'un changement distinct.

Les tests réussis établissent les résultats ci-dessus dans l'environnement local, sans garantir l'absence de toute erreur dans une infrastructure de production non testée. Aucun commit ni déploiement effectué. La section 3 n'a pas été commencée ; elle attend la validation de cette section.
