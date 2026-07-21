export type SubscriptionPlan =
  | 'free'
  | 'trial'
  | 'daily'
  | 'weekly'
  | 'monthly'
  // Legacy plans kept for backward compatibility with existing user documents.
  | 'basic'
  | 'premium'
  | 'ultra_pro'
  | 'lifetime';

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
  imageLimit?: number; // Max images allowed for the active paid pass (set on purchase)
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
  faces?: FaceBoundingBox[];
  error?: string;
  progress: number; // 0 to 100
}

export interface FaceBoundingBox {
  ymin: number; // 0 to 1000
  xmin: number; // 0 to 1000
  ymax: number; // 0 to 1000
  xmax: number; // 0 to 1000
}
