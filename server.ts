import express from 'express';
import path from 'path';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { initializeApp as initializeAdminApp, getApps as getAdminApps } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';

const PORT = 3000;

// Initialize Firebase Admin (using Application Default Credentials or standard GCP roles)
const adminApp = getAdminApps().length === 0
  ? initializeAdminApp({
      projectId: 'gen-lang-client-0410784317'
    })
  : getAdminApps()[0];

const PROJECT_ID = 'gen-lang-client-0410784317';
const DATABASE_ID = 'ai-studio-autoblursaas-955fae40-4175-4078-8c61-673671b13f8d';

// Server-authoritative access check. Mirrors the client's getPlanAccess but this
// is the real gate. Creator/admin emails get unlimited access.
const PAID_PLANS = ['daily', 'weekly', 'monthly', 'premium', 'ultra_pro', 'lifetime'];
const PLAN_IMAGE_LIMITS: Record<string, number> = { daily: 50, weekly: 500, monthly: 2000 };
const FREE_IMAGE_LIMIT = 10;
const ADMIN_EMAILS = ['andrexito12345@gmail.com', 'abcdavila006@gmail.com'];

function serverPlanAccess(userData: Record<string, any> | null, email?: string) {
  const e = (email || '').toLowerCase().trim();
  if (e && ADMIN_EMAILS.includes(e)) {
    return { unlimited: true, blocked: false, limit: Infinity, count: userData?.imagesProcessedCount || 0 };
  }
  const plan = userData?.subscriptionPlan || 'free';
  const exp = userData?.subscriptionExpiresAt;
  const notExpired = exp === 'never' || (!!exp && new Date(exp) > new Date());
  const paid = PAID_PLANS.includes(plan) && notExpired;
  const limit = paid ? (userData?.imageLimit ?? PLAN_IMAGE_LIMITS[plan] ?? 2000) : FREE_IMAGE_LIMIT;
  const count = userData?.imagesProcessedCount || 0;
  const trialExpired = !paid && !!userData?.trialExpiresAt && new Date() > new Date(userData.trialExpiresAt);
  const blocked = count >= limit || trialExpired;
  return { unlimited: false, blocked, limit, count, paid, trialExpired };
}

// Helper to perform secure Firestore updates via Google's REST API using the user's verified client ID token
async function updateFirestoreDocument(idToken: string, collection: string, docId: string, fields: Record<string, any>) {
  const projectId = 'gen-lang-client-0410784317';
  const databaseId = 'ai-studio-autoblursaas-955fae40-4175-4078-8c61-673671b13f8d';
  
  // Create updateMask query params so we perform a partial patch
  const queryParams = Object.keys(fields)
    .map(key => `updateMask.fieldPaths=${key}`)
    .join('&');

  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/${collection}/${docId}?${queryParams}`;

  const formattedFields: Record<string, any> = {};
  for (const [key, val] of Object.entries(fields)) {
    if (val === null || val === undefined) {
      formattedFields[key] = { nullValue: null };
    } else if (typeof val === 'string') {
      formattedFields[key] = { stringValue: val };
    } else if (typeof val === 'number') {
      formattedFields[key] = { integerValue: Math.round(val).toString() };
    } else if (typeof val === 'boolean') {
      formattedFields[key] = { booleanValue: val };
    } else if (val instanceof Date) {
      formattedFields[key] = { timestampValue: val.toISOString() };
    } else {
      formattedFields[key] = { stringValue: String(val) };
    }
  }

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields: formattedFields })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Firestore REST update failed: ${response.status} - ${errText}`);
  }
  return await response.json();
}

// Helper to fetch a Firestore document securely via Google's REST API using the user's verified client ID token
async function getFirestoreDocument(idToken: string, collection: string, docId: string) {
  const projectId = 'gen-lang-client-0410784317';
  const databaseId = 'ai-studio-autoblursaas-955fae40-4175-4078-8c61-673671b13f8d';
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/${collection}/${docId}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${idToken}`
    }
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Firestore REST fetch failed: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  const fields: Record<string, any> = {};
  
  if (data.fields) {
    for (const [key, valueObj] of Object.entries(data.fields)) {
      const val = valueObj as any;
      if ('stringValue' in val) fields[key] = val.stringValue;
      else if ('integerValue' in val) fields[key] = parseInt(val.integerValue, 10);
      else if ('doubleValue' in val) fields[key] = parseFloat(val.doubleValue);
      else if ('booleanValue' in val) fields[key] = val.booleanValue;
      else if ('timestampValue' in val) fields[key] = val.timestampValue;
      else if ('nullValue' in val) fields[key] = null;
    }
  }
  return fields;
}

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

// Guards against an upstream call that never settles (the Gemini SDK has no
// built-in timeout). Without this a hung request leaves the client stuck on
// "detecting" forever instead of failing fast so the user can retry.
function withTimeout<T>(promise: Promise<T>, ms: number, label = 'La operación'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} tardó demasiado y fue cancelada (timeout ${ms}ms). Intenta de nuevo.`)), ms)
    )
  ]);
}

async function startServer() {
  const app = express();
  
  // CORS configuration
  app.use(cors());
  
  // Standard JSON parser with high limit for Base64 image transfers
  app.use(express.json({ limit: '50mb' }));

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
      (req as any).idToken = idToken; // Attach verified ID token
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
      const userId = (req as any).user?.uid;
      const idToken = (req as any).idToken;

      if (!userId || !idToken) {
        return res.status(401).json({ error: 'Acceso no autorizado: No se pudo identificar al usuario o token ausente.' });
      }

      if (!image) {
        return res.status(400).json({ error: 'Missing image content' });
      }

      // Server-authoritative plan/limit enforcement — do NOT trust the client.
      const userData = await getFirestoreDocument(idToken, 'users', userId);
      const access = serverPlanAccess(userData, (req as any).user?.email);
      if (access.blocked) {
        return res.status(403).json({
          error: access.trialExpired
            ? 'Tu prueba gratuita ha expirado. Elige un plan para continuar.'
            : `Has alcanzado el límite de ${access.limit} imágenes de tu plan. Actualiza tu plan para continuar.`,
        });
      }

      // Clean base64 string
      let cleanBase64 = image;
      if (cleanBase64.includes(';base64,')) {
        cleanBase64 = cleanBase64.split(';base64,').pop() || '';
      }

      const ai = getGemini();
      const response = await callWithRetry(() => withTimeout(ai.models.generateContent({
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
      }), 30000, 'La detección de rostros'));

      const rawText = response.text || '[]';
      const faces = JSON.parse(rawText.trim());

      // Count the processed image server-side (unless unlimited/creator). The
      // client no longer writes this — the counter is now trusted.
      if (!access.unlimited) {
        try {
          await updateFirestoreDocument(idToken, 'users', userId, {
            imagesProcessedCount: (access.count || 0) + 1
          });
        } catch (incErr) {
          console.error('Failed to increment image counter:', incErr);
        }
      }

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
      res.status(500).json({ error: error.message || 'Error processing face detection' });
    }
  });

  // API Route: PayPhone Prepare Transaction
  app.post('/api/payphone/prepare', authenticateUser, async (req, res) => {
    try {
      const { planType } = req.body;
      const userId = (req as any).user?.uid;
      const idToken = (req as any).idToken;

      if (!userId || !idToken) {
        return res.status(401).json({ error: 'Acceso no autorizado: No se pudo identificar al usuario.' });
      }

      if (!['daily', 'weekly', 'monthly'].includes(planType)) {
        return res.status(400).json({ error: 'Tipo de plan inválido.' });
      }

      const payphoneToken = process.env.PAYPHONE_TOKEN;
      const payphoneStoreId = process.env.PAYPHONE_STORE_ID;

      if (!payphoneToken || !payphoneStoreId) {
        return res.status(500).json({ 
          error: 'La pasarela de PayPhone no está configurada en las variables de entorno del servidor (PAYPHONE_TOKEN / PAYPHONE_STORE_ID).' 
        });
      }

      // Calculate amount strictly on the server-side (cents).
      let amount = 1299; // Default monthly: $12.99 (1299 cents)
      if (planType === 'daily') {
        amount = 199; // Daily pass: $1.99 (199 cents)
      } else if (planType === 'weekly') {
        amount = 499; // Weekly pass: $4.99 (499 cents)
      }

      // Generate secure unique transaction ID
      const clientTransactionId = `${userId}-${planType}-${Date.now()}`;

      // Save pending transaction document (using user token — clients cannot touch transactions unless matched)
      await updateFirestoreDocument(idToken, 'transactions', clientTransactionId, {
        userId,
        planType,
        amount,
        status: 'pending',
        createdAt: new Date().toISOString()
      });

      // Respond with required PayPhone config payload
      res.json({
        token: payphoneToken,
        storeId: payphoneStoreId,
        amount: amount,
        amountWithoutTax: amount,
        tax: 0,
        amountWithTax: 0,
        currency: "USD",
        clientTransactionId: clientTransactionId,
        reference: `Plan ${planType === 'daily' ? 'Diario' : planType === 'weekly' ? 'Semanal' : 'Mensual'}`
      });

    } catch (error: any) {
      console.error('Error preparing PayPhone transaction:', error);
      res.status(500).json({ error: error.message || 'Error al preparar la transacción.' });
    }
  });

  // API Route: PayPhone Confirm Transaction
  app.post('/api/payphone/confirm', authenticateUser, async (req, res) => {
    try {
      const { id, clientTransactionId } = req.body;
      const userId = (req as any).user?.uid;
      const idToken = (req as any).idToken;

      if (!userId || !idToken) {
        return res.status(401).json({ error: 'Acceso no autorizado: No se pudo identificar al usuario.' });
      }

      if (!id || !clientTransactionId) {
        return res.status(400).json({ error: 'Falta el id de transacción o el identificador del cliente.' });
      }

      // Fetch pending transaction (using user token)
      const txData = await getFirestoreDocument(idToken, 'transactions', clientTransactionId);

      if (!txData) {
        return res.status(400).json({ error: 'Transacción no encontrada o inválida.' });
      }

      if (txData.userId !== userId || txData.status !== 'pending') {
        return res.status(400).json({ error: 'Transacción inválida o ya procesada.' });
      }

      const payphoneToken = process.env.PAYPHONE_TOKEN;
      if (!payphoneToken) {
        return res.status(500).json({ error: 'Configuración del servidor incompleta (PayPhone token).' });
      }

      // Server-to-server call to verify payment status on PayPhone API
      const confirmResponse = await fetch('https://paymentbox.payphonetodoesposible.com/api/confirm', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${payphoneToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: parseInt(id, 10),
          clientTxId: clientTransactionId
        })
      });

      const confirmData: any = await confirmResponse.json();

      if (!confirmResponse.ok) {
        console.error('Payphone Confirmation API failed:', confirmData);
        await updateFirestoreDocument(idToken, 'transactions', clientTransactionId, {
          status: 'failed',
          updatedAt: new Date().toISOString(),
          error: confirmData.message || 'Error en la verificación de PayPhone'
        });
        return res.status(400).json({ error: 'Error en la pasarela de pagos de PayPhone.' });
      }

      // Check for approved statuses (transactionStatus === "Approved" or statusCode === 3)
      const isApproved = confirmData.transactionStatus === 'Approved' || confirmData.statusCode === 3;

      if (!isApproved) {
        console.warn('Payphone Transaction not approved:', confirmData);
        await updateFirestoreDocument(idToken, 'transactions', clientTransactionId, {
          status: 'failed',
          updatedAt: new Date().toISOString(),
          error: confirmData.transactionStatus || 'No aprobado'
        });
        return res.status(400).json({ error: `La transacción no fue aprobada: ${confirmData.transactionStatus || 'Declined'}` });
      }

      // Upgrade user in Firebase Firestore.
      // Each plan is a one-time pass: it grants an image allowance until it expires.
      const PLAN_CONFIG: Record<string, { days: number; imageLimit: number }> = {
        daily: { days: 1, imageLimit: 50 },
        weekly: { days: 7, imageLimit: 500 },
        monthly: { days: 30, imageLimit: 2000 }
      };
      const config = PLAN_CONFIG[txData.planType] || PLAN_CONFIG.monthly;

      const expires = new Date();
      expires.setDate(expires.getDate() + config.days);
      const expiresAt = expires.toISOString();

      const planName = txData.planType;

      // Upgrade the user. Reset the counter so the new pass starts fresh.
      // This is the ONLY place a plan is granted — clients cannot write these fields directly but we do it via rest with idToken.
      await updateFirestoreDocument(idToken, 'users', userId, {
        subscriptionPlan: planName,
        subscriptionExpiresAt: expiresAt,
        imageLimit: config.imageLimit,
        imagesProcessedCount: 0
      });

      // Mark transaction as confirmed
      await updateFirestoreDocument(idToken, 'transactions', clientTransactionId, {
        status: 'confirmed',
        updatedAt: new Date().toISOString(),
        payphoneId: id.toString()
      });

      console.log(`User ${userId} successfully upgraded to ${planName} via PayPhone id ${id}`);
      res.json({ success: true, plan: planName, expiresAt });

    } catch (error: any) {
      console.error('Error confirming PayPhone transaction:', error);
      res.status(500).json({ error: error.message || 'Error interno de confirmación.' });
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
