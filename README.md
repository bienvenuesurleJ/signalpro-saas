# Bot Trading Signaux — projet Vercel

- `public/index.html` : page d'accueil, offres, connexion / inscription
- `private/app.html` : l'application (servie uniquement aux comptes connectés via `/api/app`)
- `api/` : comptes, paiement Stripe, portail client, webhook
- Base de données : tables `sp_*` du projet Supabase existant

## Variables d'environnement à définir dans Vercel (Settings > Environment Variables)
- `SUPABASE_URL` : URL du projet Supabase
- `SUPABASE_SERVICE_ROLE_KEY` : clé secrète « service_role » (jamais dans le code ni dans le chat)
- `STRIPE_SECRET_KEY` : clé Stripe (de préférence une clé restreinte)
- `STRIPE_WEBHOOK_SECRET` : secret du webhook Stripe (commence par `whsec_`)
- `SITE_URL` : adresse du site, sans `/` final (ex. `https://mon-site.vercel.app`)
- `STRIPE_PORTAL_CONFIG` : (optionnel) identifiant de la configuration du portail client
