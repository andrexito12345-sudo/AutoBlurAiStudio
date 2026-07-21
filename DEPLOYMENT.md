# Deployment Guide - AutoBlur SaaS

## Prerequisites

- Node.js 18+
- Google Cloud Account (Cloud Run)
- Firebase Project
- Stripe Account (optional, works in simulation mode)
- Git

## Quick Start - Local Development

```bash
# 1. Install dependencies
npm install

# 2. Create .env file (copy from .env.example)
cp .env.example .env

# 3. Add your API keys
# GEMINI_API_KEY: Get from Google AI Studio
# STRIPE_SECRET_KEY: Get from Stripe Dashboard (optional)

# 4. Start development server
npm run dev
# Opens at http://localhost:3000
```

## Build & Production

### Build locally
```bash
npm run build
# Outputs to ./dist/
```

### Deploy to Google Cloud Run

```bash
# 1. Install gcloud CLI
# https://cloud.google.com/sdk/docs/install

# 2. Login and set project
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# 3. Deploy
gcloud run deploy autoblur-saas \
  --source . \
  --platform managed \
  --region us-central1 \
  --memory 512Mi \
  --timeout 3600 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production

# 4. Set environment variables via Cloud Run Console or:
gcloud run services update autoblur-saas \
  --set-env-vars \
  GEMINI_API_KEY=YOUR_KEY,\
  STRIPE_SECRET_KEY=YOUR_KEY,\
  APP_URL=https://autoblur-saas-xxxxx.run.app
```

## Firebase Setup

### 1. Deploy Firestore Rules
```bash
firebase login
firebase init firestore
firebase deploy --only firestore:rules
```

File: `firestore.rules` (already configured with security)

### 2. Configure Firebase Console
- Go to Firebase Console → Your Project
- Firestore Database → Create Database
- Start in production mode (rules protect it)

## Stripe Setup (Optional)

### 1. Get API Keys
- Dashboard → Developers → API Keys
- Copy Secret Key → add to Cloud Run env vars

### 2. Setup Webhook
- Developers → Webhooks → Add Endpoint
- URL: `https://YOUR_DOMAIN/api/stripe/webhook`
- Events: `checkout.session.completed`, `customer.subscription.deleted`
- Copy Signing Secret → `STRIPE_WEBHOOK_SECRET` env var

## Environment Variables

| Variable | Required | Source |
|----------|----------|--------|
| `GEMINI_API_KEY` | Yes | Google AI Studio |
| `STRIPE_SECRET_KEY` | No* | Stripe Dashboard |
| `STRIPE_WEBHOOK_SECRET` | No* | Stripe Webhooks |
| `APP_URL` | Yes (prod) | Your Cloud Run URL |
| `NODE_ENV` | Yes (prod) | Set to `production` |

*Stripe is optional. Without it, app runs in simulation mode.

## Post-Deployment

### 1. Update Firebase Config
Edit `src/firebase.ts` if using different Firebase project:
```typescript
const firebaseConfig = {
  projectId: "YOUR_PROJECT_ID",
  apiKey: "YOUR_API_KEY",
  // ... etc
};
```

### 2. Test Endpoints
```bash
# Test Gemini face detection
curl -X POST https://YOUR_DOMAIN/api/gemini/detect-faces \
  -H "Content-Type: application/json" \
  -d '{"image":"...", "mimeType":"image/jpeg", "userId":"test-user"}'

# Test rate limiting (should block after 30 requests/min)
```

### 3. Monitor Logs
```bash
gcloud run logs read autoblur-saas --limit 50
```

## Security Checklist

- [x] Firestore rules configured (read-only own profile)
- [x] CORS restricted to production domain
- [x] Rate limiting enabled
- [x] Input validation added
- [x] Security headers configured
- [ ] Enable HTTPS only (automatic on Cloud Run)
- [ ] Configure CDN for static assets (optional)
- [ ] Setup monitoring & alerts

## Scaling Notes

Current setup handles ~100 concurrent requests with 512Mi memory.

For higher load:
- Increase Cloud Run memory to 1Gi
- Add Cloud CDN for static assets
- Consider Cloud Task queue for async processing
- Implement caching layer (Redis)

## Rollback

If deployment fails:
```bash
gcloud run revisions list --service=autoblur-saas
gcloud run services update-traffic autoblur-saas --to-revisions REVISION_ID=100
```

## Cost Estimate (Monthly)

- Cloud Run: ~$5-20 (depending on usage)
- Firestore: ~$1-5 (read/write ops)
- Google AI (Gemini): ~$2-10 (per 1K calls)
- Stripe: 2.9% + $0.30 per transaction
- Total: ~$10-50/month baseline

## Troubleshooting

### Issue: "CORS error"
→ Update `APP_URL` env var to match your domain

### Issue: "Rate limit exceeded"
→ Wait 60 seconds before retrying

### Issue: "Gemini API error"
→ Check GEMINI_API_KEY, verify quota in Google Cloud

### Issue: "Stripe webhook fails"
→ Verify webhook secret matches exactly, check logs

## Support

- Firebase docs: https://firebase.google.com/docs
- Google AI: https://ai.google.dev/
- Stripe docs: https://stripe.com/docs
- Cloud Run: https://cloud.google.com/run/docs
