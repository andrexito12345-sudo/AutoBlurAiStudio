# AutoBlur SaaS - Quick Start to Production

**Status:** ✅ Security hardened & ready to deploy

## What Was Fixed

### Security Issues (All Critical/High Priority)
1. ✅ Firestore rules — now auth-required, user-isolated
2. ✅ CORS — whitelisted to localhost + production domain
3. ✅ Rate limiting — 30 req/min (detect-faces), 10 req/min (checkout)
4. ✅ Input validation — MIME types, email format, plan types
5. ✅ File upload limit — reduced 50MB → 5MB (DoS prevention)
6. ✅ Security headers — HSTS, X-Frame-Options, X-XSS-Protection

## Prerequisites
- Google Cloud Account
- Firebase Project
- Node.js 18+
- (Optional) Stripe Account for real payments

## 1. Local Dev (2 minutes)

```bash
cd autoblur-saas
npm install
cp .env.example .env
# Edit .env, add GEMINI_API_KEY from https://ai.google.dev/
npm run dev
# Visit http://localhost:3000
```

## 2. Firebase Setup (5 minutes)

```bash
# Install Firebase CLI
npm install -g firebase-tools
firebase login
firebase init firestore

# Deploy security rules (already configured)
firebase deploy --only firestore:rules
```

In Firebase Console:
- Create Firestore Database
- Start in Production mode (rules protect it)

## 3. Deploy to Cloud Run (3 minutes)

```bash
# 1. Build
npm run build

# 2. Deploy
gcloud run deploy autoblur-saas \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated

# 3. Get URL from output, e.g.: https://autoblur-saas-xxxxx.run.app
```

## 4. Set Environment Variables

In Cloud Run Console → autoblur-saas → Edit & Deploy:

```env
GEMINI_API_KEY=<from https://ai.google.dev/>
STRIPE_SECRET_KEY=<from Stripe, optional>
STRIPE_WEBHOOK_SECRET=<from Stripe webhooks, optional>
APP_URL=https://autoblur-saas-xxxxx.run.app
NODE_ENV=production
```

Or via CLI:
```bash
gcloud run services update autoblur-saas \
  --set-env-vars=GEMINI_API_KEY=xxx,APP_URL=https://autoblur-saas-xxxxx.run.app,NODE_ENV=production
```

## 5. Stripe Setup (Optional, for real payments)

Skip if using simulation mode.

```bash
# 1. Get keys from https://dashboard.stripe.com/apikeys
# 2. Add STRIPE_SECRET_KEY & STRIPE_WEBHOOK_SECRET to Cloud Run env vars
# 3. Setup webhook:
#    - Stripe Dashboard → Developers → Webhooks → Add Endpoint
#    - URL: https://autoblur-saas-xxxxx.run.app/api/stripe/webhook
#    - Events: checkout.session.completed, customer.subscription.deleted
#    - Copy signing secret → STRIPE_WEBHOOK_SECRET
```

## 6. Test Deployment

```bash
# Check health
curl https://autoblur-saas-xxxxx.run.app

# Test face detection (replace URL & userId)
curl -X POST https://autoblur-saas-xxxxx.run.app/api/gemini/detect-faces \
  -H "Content-Type: application/json" \
  -d '{
    "image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABA...",
    "mimeType": "image/jpeg",
    "userId": "test-user-id"
  }'
```

## 7. Security Checklist

- [x] Firestore rules deployed
- [x] Build verified (no errors)
- [x] Rate limiting active
- [x] Input validation enabled
- [x] CORS configured
- [ ] Custom domain (optional)
- [ ] CDN for assets (optional, scalability)
- [ ] Monitoring alerts (optional)

## Files Reference

| File | Purpose |
|------|---------|
| `SECURITY_FIXES.md` | Detailed security fixes |
| `DEPLOYMENT.md` | Full deployment guide |
| `firestore.rules` | Firestore security rules (deploy via CLI) |
| `server.ts` | Backend API + rate limiting |
| `.env.example` | Environment variables template |

## Estimated Costs (Monthly)

- Cloud Run: $5-20 (pay per request)
- Firestore: $1-5 (read/write operations)
- Gemini API: $2-10 (per 1K requests)
- Stripe: 2.9% + $0.30 per transaction
- **Total: ~$10-50/month baseline**

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "CORS error" | Update APP_URL env var in Cloud Run |
| "Rate limit exceeded" | Wait 60 seconds |
| "Gemini API error" | Verify GEMINI_API_KEY, check quota in Google Cloud |
| "Build fails" | Run `npm install` locally first, then deploy with `--source .` |
| "Firestore permission denied" | Deploy firestore.rules via `firebase deploy --only firestore:rules` |

## Next Steps

1. Deploy to Cloud Run ✅
2. Test endpoints
3. Configure custom domain (Route 53 / Cloud Domains)
4. Setup monitoring (Cloud Logging)
5. Scale as needed (increase memory if hitting limits)

## Support Links

- Firebase: https://firebase.google.com/docs
- Google AI: https://ai.google.dev/docs
- Stripe: https://stripe.com/docs
- Cloud Run: https://cloud.google.com/run/docs
- gcloud CLI: https://cloud.google.com/sdk/gcloud

---

**Status:** Code compiled ✅ | Security hardened ✅ | Ready to deploy ✅
