export type SubscriptionPlan = 'free' | 'trial' | 'basic' | 'premium' | 'lifetime';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  subscriptionPlan: SubscriptionPlan;
  trialStartedAt?: string; // ISO String
  trialExpiresAt?: string; // ISO String
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionExpiresAt?: string; // ISO String
  imagesProcessedCount: number;
}

export interface ProcessingTask {
  id: string;
  name: string;
  size: number;
  status: 'idle' | 'detecting' | 'blurring' | 'completed' | 'failed';
  originalUrl?: string; // Data URL or Object URL
  processedUrl?: string; // Data URL of the blurred image
  facesCount?: number;
  error?: string;
  progress: number; // 0 to 100
}

export interface FaceBoundingBox {
  ymin: number; // 0 to 1000
  xmin: number; // 0 to 1000
  ymax: number; // 0 to 1000
  xmax: number; // 0 to 1000
}
