# Section 2 — Audit préalable 2FA/TOTP

## Architecture inspectée

AuthService valide bcrypt puis crée un access JWT et une RefreshSession dont seul le hash du jeton opaque est conservé. Le cookie refresh est HttpOnly, avec origine contrôlée sur les opérations utilisant le cookie. JwtStrategy recharge l'utilisateur, ses rôles et son organisation à chaque requête. Deux gateways WebSocket vérifient également les JWT. Aucun mécanisme 2FA ni modèle associé n'existe.

Le frontend utilise AuthProvider, authApi et `/connexion`, avec jeton d'accès uniquement en mémoire. ProfileWorkspace contient les paramètres personnels et le changement de mot de passe ; UsersAdministration possède les actions administrateur. Les DTOs, guards et permissions sont déjà centralisés. `users:manage` protège la réinitialisation des mots de passe et convient à une réinitialisation 2FA explicite, limitée à l'organisation.

SensitiveFieldService implémente déjà AES-256-GCM ; la clé INTEGRATION_SECRETS_ENCRYPTION_KEY est requise dans la configuration de production. AuditLog existe. L'intercepteur d'audit exclut `/auth` : les événements 2FA devront donc être écrits explicitement. Le throttler est installé mais aucun guard de throttling global n'est configuré ; un décorateur seul ne suffirait pas.

## Modifications minimales retenues avant codage

- Migration additive : un modèle UserTwoFactor, relation facultative à User. Secret actif et secret provisoire chiffrés, expiration du setup, activation, hashes de récupération, dernier pas TOTP accepté, compteur/verrou de tentatives, challenge temporaire et version des sessions. Aucun utilisateur existant activé automatiquement.
- Réutilisation AES-GCM avec une sous-clé dédiée TOTP dérivée de la clé serveur existante et données authentifiées liant le secret à son utilisateur.
- Bibliothèque TOTP standard et génération QR locale au serveur : aucun secret envoyé à un service de QR externe.
- Challenge JWT de cinq minutes après mot de passe correct, usage unique, avec finalité distincte et contrôle dans HTTP et WebSocket. Un nouveau challenge remplace le précédent. Aucun access token ni refresh cookie créé avant réussite.
- AuthService conserve l'émission et la rotation des sessions. Activation/désactivation/reset révoquent les refresh sessions et incrémentent une version vérifiée sur les access tokens. Les anciens jetons sans version restent compatibles avec les comptes non modifiés (version zéro).
- Limite par IP sur les endpoints d'authentification concernés et compteur persistant par utilisateur (cinq échecs, verrou de quinze minutes). Consommation des codes et création de session dans une même transaction verrouillée.
- Setup avec mot de passe actuel, vérification TOTP, dix codes aléatoires de récupération affichés une fois. Désactivation avec mot de passe et second facteur. Reset administrateur avec permission users:manage, réauthentification de l'acteur et raison auditée ; aucun reset de soi-même par ce raccourci.
- Frontend : étape authenticator/récupération dans le login, panneau de sécurité dans le profil, action de reset dans l'administration existante. Aucune refonte des autres modules.

## Références techniques

La fenêtre TOTP et la protection contre le rejeu seront vérifiées contre [RFC 6238](https://www.rfc-editor.org/info/rfc6238/). API de bibliothèque vérifiée dans la [documentation officielle otplib](https://otplib.yeojz.dev/guide/getting-started.html) et dans les déclarations locales de la version installée.

## Validation prévue

Login sans 2FA, setup incomplet, code invalide/expiré/rejoué, récupération à usage unique et concurrence, verrou après échecs, challenge refusé sur HTTP/WebSocket et refresh, sessions révoquées, reset limité à l'organisation et aux permissions, chiffrement/hash, absence de secrets dans les réponses ordinaires et audits, migration sur PostgreSQL isolé, tests frontend et build.

Cette section sera soumise à validation avant de commencer la section 3.
