# Localization audit allowlist

The localization boundary exempts only content inside `data-i18n-exempt`, code/preformatted content, scripts/styles, and editable user input. This attribute is reserved for user-entered data and stable identifiers; it must not be placed on interface sections.

Legitimate language-neutral terms are: `CarImport DZ` (fallback product name), ERP, CRM, API, WebSocket, Socket.IO, VIN, CIF, DDP, B/L, ETD, ETA, PDF, PNG, JPEG, WebP, DZD, USD, EUR, CNY, WhatsApp, Redis, PostgreSQL and Nginx. Company/user names, e-mail addresses, phone numbers, vehicle makes/models, supplier text, file names, dossier references, provider identifiers and audit payload values are data rather than interface copy.

New interface copy must use the typed `I18nProvider` catalog. The compatibility interface catalog exists only for pre-catalog route copy and has exact phrase entries; broad source directories and generic accented-character patterns are not allowed as exemptions. Browser acceptance must inspect a match before adding it here because French words can legitimately occur in user data.
