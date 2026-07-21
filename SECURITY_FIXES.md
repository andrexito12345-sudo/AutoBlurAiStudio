# Security Fixes Applied

## Critical Issues Fixed

### 1. Firestore Rules - Open Access
**Before:** `allow read, write: if true;`
**After:** Restricted to authenticated users, only own documents
- Users can only read/write their own profile
- Server-side updates restricted to specific fields

### 2. CORS Without Restrictions
**Before:** `app.use(cors());`
**After:** Whitelist configured
- Dev: localhost:3000, localhost:5173
- Prod: APP_URL environment variable
- Methods: GET, POST, OPTIONS only
- Credentials: enabled

### 3. Large Base64 Upload Limit
**Before:** `50mb` limit for images
**After:** `5mb` limit
- Prevents DoS via large file uploads
- Still supports high-res images

### 4. Missing Rate Limiting
**Before:** No rate limiting on endpoints
**After:** Rate limiting added
- `/api/gemini/detect-faces`: 30 requests/minute per IP
- `/api/stripe/create-checkout-session`: 10 requests/minute per IP
- `/api/user/update-subscription-simulated`: 10 requests/minute per IP

### 5. Input Validation
**Before:** Minimal validation
**After:** Enhanced validation
- MIME type whitelist: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- Email format validation
- Plan type validation: `monthly`, `annual`, `lifetime`

## Security Headers Added

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

## Remaining Recommendations

### High Priority
1. **Add firebase-admin for token verification**
   - Verify JWT tokens from clients
   - Authenticate `/api/gemini/detect-faces` with client auth token

2. **HTTPS enforcement**
   - Add `app.use((req, res, next) => { if (!req.secure) res.redirect(...) })`
   - Only in production

3. **Database field-level encryption**
   - Encrypt sensitive user data (email, subscription info)

### Medium Priority
4. **Logging & monitoring**
   - Log auth failures, rate limit hits, API errors
   - Monitor for suspicious patterns

5. **Webhook signature validation (Stripe)**
   - Already implemented, keep current logic

## Environment Variables Required

```
GEMINI_API_KEY=<your-api-key>
STRIPE_SECRET_KEY=<your-secret-key>
STRIPE_WEBHOOK_SECRET=<your-webhook-secret>
APP_URL=https://autoblur.ai
NODE_ENV=production
```

## Deployment Checklist

- [ ] Run `npm install`
- [ ] Run `npm run build`
- [ ] Set all environment variables
- [ ] Test rate limiting
- [ ] Test CORS with your domain
- [ ] Deploy to Cloud Run: `gcloud run deploy autoblur-saas --source .`
- [ ] Configure Firestore rules in Firebase Console
- [ ] Set up Stripe webhook endpoint
