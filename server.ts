import express from 'express';
import path from 'path';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import Stripe from 'stripe';
import { initializeApp as initializeAdminApp, getApps as getAdminApps } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';

const PORT = 3000;

// Simple in-memory rate limiter (per key sliding window)
const rateLimitStore = new Map<string, number[]>();
function checkRateLimit(key: string, windowMs = 60000, maxRequests = 20): boolean {
  const now = Date.now();
  const hits = (rateLimitStore.get(key) || []).filter(t => now - t < windowMs);
  if (hits.length >= maxRequests) return false;
  hits.push(now);
  rateLimitStore.set(key, hits);
  return true;
}

// Initialize Firebase Admin (using Application Default Credentials or standard GCP roles)
if (getAdminApps().length === 0) {
  initializeAdminApp({
    projectId: 'gen-lang-client-0410784317'
  });
}

const db = getAdminFirestore('ai-studio-autoblursaas-955fae40-4175-4078-8c61-673671b13f8d');

// Initialize Gemini SDK lazily
let geminiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  if (!geminiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    geminiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return geminiClient;
}

// Retry wrapper helper for Gemini API calls to gracefully handle transient high-load (503/500/rate limits)
async function callWithRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const errorStr = (error.message || error.toString() || '').toLowerCase();
    const isTransient = 
      errorStr.includes('503') || 
      errorStr.includes('500') || 
      errorStr.includes('high d') || 
      errorStr.includes('experiencing') ||
      errorStr.includes('rate limit') ||
      errorStr.includes('resource exhausted') || 
      errorStr.includes('overloaded') ||
      errorStr.includes('service unavailable') ||
      errorStr.includes('quota');
    
    if (isTransient && retries > 0) {
      console.warn(`[Gemini Retry] Call failed: "${error.message || error}". Retrying in ${delay}ms... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return callWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

// Initialize Stripe lazily
let stripeClient: Stripe | null = null;
function getStripe(): Stripe | null {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      return null; // Gracefully support fallback/simulator mode if no key is supplied
    }
    stripeClient = new Stripe(key, {
      apiVersion: '2025-01-27' as any,
    });
  }
  return stripeClient;
}

async function startServer() {
  const app = express();

  app.set('trust proxy', 1); // behind Cloud Run / AI Studio proxy, for correct req.ip

  // CORS: restrict to the deployed app origin (same-origin in production) + localhost dev
  const allowedOrigins = [
    process.env.APP_URL,
    'http://localhost:3000',
    'http://localhost:5173',
  ].filter(Boolean) as string[];

  app.use(cors({
    origin: (origin, cb) => {
      // Allow same-origin/non-browser requests (no Origin header) and whitelisted origins
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  // Use raw body parsing ONLY for Stripe webhooks to verify signatures correctly
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const stripe = getStripe();
    const signature = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripe || !signature || !webhookSecret) {
      console.warn('Stripe or Webhook keys not configured. Skipping signature verification.');
      return res.status(400).send('Webhook configuration error');
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (err: any) {
      console.error(`Webhook Error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.metadata?.userId;
          const plan = (session.metadata?.plan || 'premium') as 'premium' | 'lifetime';
          
          if (userId) {
            const userRef = db.collection('users').doc(userId);
            
            let updatePayload: any = {
              subscriptionPlan: plan,
              stripeCustomerId: session.customer as string,
            };

            if (plan === 'lifetime') {
              updatePayload.subscriptionExpiresAt = 'never';
              updatePayload.stripeSubscriptionId = 'lifetime_one_time_payment';
            } else {
              const expires = new Date();
              expires.setMonth(expires.getMonth() + (session.metadata?.interval === 'annual' ? 12 : 1));
              updatePayload.subscriptionExpiresAt = expires.toISOString();
              updatePayload.stripeSubscriptionId = session.subscription as string;
            }
            
            await userRef.update(updatePayload);
            console.log(`User ${userId} successfully upgraded to ${plan} via webhook`);
          }
          break;
        }
        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          const userId = subscription.metadata?.userId;
          if (userId) {
            const userRef = db.collection('users').doc(userId);
            await userRef.update({
              subscriptionPlan: 'free',
              stripeSubscriptionId: '',
              subscriptionExpiresAt: ''
            });
            console.log(`User ${userId} subscription cancelled`);
          }
          break;
        }
      }
      res.json({ received: true });
    } catch (error) {
      console.error('Error handling webhook event:', error);
      res.status(500).send('Error updating database');
    }
  });

  // JSON parser with a bounded limit for Base64 image transfers (DoS guard)
  app.use(express.json({ limit: '8mb' }));

  // Middleware to securely verify Firebase ID Tokens on backend requests
  const authenticateUser = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Acceso no autorizado: Token de autenticación ausente.' });
      }

      const idToken = authHeader.split('Bearer ')[1];
      const decodedToken = await getAdminAuth().verifyIdToken(idToken);
      (req as any).user = decodedToken;
      next();
    } catch (error: any) {
      console.error('Error al verificar ID Token:', error);
      return res.status(401).json({ error: 'Acceso no autorizado: Token inválido o expirado.' });
    }
  };

  // API Route: Detect faces using Gemini 3.5 Flash
  app.post('/api/gemini/detect-faces', authenticateUser, async (req, res) => {
    try {
      const { image, mimeType } = req.body;
      const userId = (req as any).user?.uid; // Retrieve authenticated user ID securely from JWT token!

      if (!userId) {
        return res.status(401).json({ error: 'Acceso no autorizado: No se pudo identificar al usuario.' });
      }

      // Rate limit per authenticated user (protects Gemini cost from abuse)
      if (!checkRateLimit(`faces:${userId}`, 60000, 20)) {
        return res.status(429).json({ error: 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.' });
      }

      if (!image) {
        return res.status(400).json({ error: 'Missing image content' });
      }

      if (mimeType && !['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType)) {
        return res.status(400).json({ error: 'Tipo de imagen no soportado.' });
      }

      // Check user subscription plan and image limits securely using the admin DB
      const userRef = db.collection('users').doc(userId);
      const userSnap = await userRef.get();
      
      if (userSnap.exists) {
        const profile = userSnap.data();
        const plan = profile?.subscriptionPlan;
        const processedCount = profile?.imagesProcessedCount || 0;
        
        // Validation for Basic/Free/Trial Plan: max 10 images total
        if ((plan === 'free' || plan === 'basic' || plan === 'trial') && processedCount >= 10) {
          return res.status(403).json({ 
            error: 'Has alcanzado el límite de 10 imágenes permitidas en el Plan Básico. Por favor, suscríbete al plan Premium Pro o adquiere el Plan De Por Vida para procesar de forma ilimitada.' 
          });
        }
      } else {
        return res.status(404).json({ error: 'Perfil de usuario no registrado.' });
      }

      // Clean base64 string
      let cleanBase64 = image;
      if (cleanBase64.includes(';base64,')) {
        cleanBase64 = cleanBase64.split(';base64,').pop() || '';
      }

      const ai = getGemini();
      const response = await callWithRetry(() => ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [
          {
            inlineData: {
              mimeType: mimeType || 'image/jpeg',
              data: cleanBase64
            }
          },
          `Analiza la imagen cuidadosamente. Detecta todos los rostros humanos en esta foto.
          Devuelve sus coordenadas en un formato JSON estructurado que sea estrictamente un arreglo de objetos.
          Cada objeto debe tener una propiedad 'box_2d' con un arreglo de exactamente 4 enteros [ymin, xmin, ymax, xmax] donde cada número está normalizado en el rango [0, 1000] (donde 0 representa el inicio y 1000 el final de la dimensión).
          Si no hay rostros, devuelve un arreglo vacío [].`
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                box_2d: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.INTEGER
                  },
                  description: 'Las coordenadas de la caja de cara [ymin, xmin, ymax, xmax] de 0 a 1000.'
                }
              },
              required: ['box_2d']
            }
          }
        }
      }));

      const rawText = response.text || '[]';
      const faces = JSON.parse(rawText.trim());

      // Atomically increment the processed images counter (race-safe)
      await db.collection('users').doc(userId).update({
        imagesProcessedCount: FieldValue.increment(1)
      });

      res.json({ faces });
    } catch (error: any) {
      console.error('Error detecting faces:', error);
      const errorStr = (error.message || error.toString() || '').toLowerCase();
      if (
        errorStr.includes('503') || 
        errorStr.includes('high d') || 
        errorStr.includes('experiencing') || 
        errorStr.includes('rate limit') || 
        errorStr.includes('overloaded') ||
        errorStr.includes('service unavailable')
      ) {
        return res.status(503).json({
          error: 'El modelo de IA está experimentando una alta demanda temporal en este momento. Por favor, espera unos segundos e inténtalo de nuevo.'
        });
      }
      res.status(500).json({ error: 'Error al procesar la detección de rostros.' });
    }
  });

  // API Route: Create Stripe checkout session or simulate (Authenticated via ID token!)
  app.post('/api/stripe/create-checkout-session', authenticateUser, async (req, res) => {
    try {
      const { planType } = req.body;
      const userId = (req as any).user?.uid;
      const email = (req as any).user?.email;

      if (!userId || !email) {
        return res.status(400).json({ error: 'Missing userId or email in verified credentials' });
      }

      if (!checkRateLimit(`checkout:${userId}`, 60000, 10)) {
        return res.status(429).json({ error: 'Demasiadas solicitudes de pago. Espera un momento.' });
      }

      if (!['monthly', 'annual', 'lifetime'].includes(planType)) {
        return res.status(400).json({ error: 'Tipo de plan inválido.' });
      }

      const stripe = getStripe();
      const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;

      // Graceful fallback to sandbox/simulation if Stripe keys are missing
      if (!stripe) {
        console.info('Stripe key is missing. Returning active simulation flags.');
        return res.json({ 
          simulated: true, 
          message: 'Running in sandbox simulation mode because STRIPE_SECRET_KEY is not defined in Secrets.' 
        });
      }

      // Create a production session config
      let sessionConfig: any = {
        payment_method_types: ['card'],
        customer_email: email,
        success_url: `${appUrl}?session_id={CHECKOUT_SESSION_ID}&checkout_success=true`,
        cancel_url: `${appUrl}?checkout_cancel=true`,
      };

      if (planType === 'lifetime') {
        sessionConfig.mode = 'payment';
        sessionConfig.line_items = [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'AutoBlur SaaS Premium - Acceso De Por Vida',
                description: 'Acceso ilimitado para siempre, procesamiento prioritario de imágenes y todos los filtros avanzados.',
              },
              unit_amount: 3999, // $39.99 USD
            },
            quantity: 1,
          }
        ];
        sessionConfig.metadata = {
          userId,
          plan: 'lifetime',
          interval: 'one-time'
        };
      } else {
        // Setup Price IDs depending on planType ('monthly' vs 'annual')
        const priceAmount = planType === 'annual' ? 9900 : 999; // $99/year or $9.99/month
        const intervalName = planType === 'annual' ? 'year' : 'month';

        sessionConfig.mode = 'subscription';
        sessionConfig.line_items = [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `AutoBlur SaaS Premium - Plan ${planType === 'annual' ? 'Anual' : 'Mensual'}`,
                description: 'Procesamiento ilimitado de imágenes, mayor resolución y soporte prioritario.',
              },
              unit_amount: priceAmount,
              recurring: {
                interval: intervalName,
              },
            },
            quantity: 1,
          },
        ];
        sessionConfig.metadata = {
          userId,
          plan: 'premium',
          interval: planType
        };
        sessionConfig.subscription_data = {
          metadata: {
            userId,
          },
        };
      }

      const session = await stripe.checkout.sessions.create(sessionConfig);

      res.json({ simulated: false, id: session.id, url: session.url });
    } catch (error: any) {
      console.error('Stripe Session Error:', error);
      res.status(500).json({ error: 'Error al iniciar la sesión de pago.' });
    }
  });

  // API Route: Simulated Upgrade (Testing & Development fallback, Authenticated via ID token!)
  app.post('/api/user/update-subscription-simulated', authenticateUser, async (req, res) => {
    try {
      const { plan } = req.body;
      const userId = (req as any).user?.uid; // Securely verified from JWT!

      if (!userId || !plan) {
        return res.status(400).json({ error: 'Missing parameters' });
      }

      if (!['free', 'basic', 'premium', 'lifetime'].includes(plan)) {
        return res.status(400).json({ error: 'Plan inválido.' });
      }

      const userRef = db.collection('users').doc(userId);
      
      let expiresAt = '';
      if (plan === 'lifetime') {
        expiresAt = 'never';
      } else if (plan === 'premium') {
        const expires = new Date();
        expires.setMonth(expires.getMonth() + 1); // 1 month validity simulated
        expiresAt = expires.toISOString();
      } else {
        // basic or free
        expiresAt = 'never';
      }

      await userRef.update({
        subscriptionPlan: plan,
        subscriptionExpiresAt: expiresAt,
        stripeCustomerId: 'cus_simulated_test',
        stripeSubscriptionId: plan === 'lifetime' ? 'lifetime_simulated_test' : 'sub_simulated_test'
      });

      res.json({ success: true, plan, expiresAt });
    } catch (error: any) {
      console.error('Error during simulated upgrade:', error);
      res.status(500).json({ error: 'Error processing simulation' });
    }
  });

  // Serve static assets and Vite middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
