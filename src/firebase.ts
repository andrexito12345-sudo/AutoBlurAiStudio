import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  onSnapshot
} from 'firebase/firestore';
import { UserProfile, SubscriptionPlan } from './types';

// Load Firebase configuration
const firebaseConfig = {
  projectId: "gen-lang-client-0410784317",
  appId: "1:690409973716:web:d9e9505bab6eee1b9ed841",
  apiKey: "AIzaSyD3XYwqxHZlrT013ZPkEtQMowXOMfO0vRg",
  authDomain: "gen-lang-client-0410784317.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-autoblursaas-955fae40-4175-4078-8c61-673671b13f8d",
  storageBucket: "gen-lang-client-0410784317.firebasestorage.app",
  messagingSenderId: "690409973716"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, "ai-studio-autoblursaas-955fae40-4175-4078-8c61-673671b13f8d");

// Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Google Sign In function
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

// Sign Out function
export async function logOut(): Promise<void> {
  await signOut(auth);
}

// Create or retrieve user profile
export async function getOrCreateUserProfile(user: User): Promise<UserProfile> {
  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    return userSnap.data() as UserProfile;
  }

  // Create new user profile with 7-day free trial starting now
  const now = new Date();
  const expires = new Date();
  expires.setDate(now.getDate() + 7); // 7 days free trial

  const newProfile: UserProfile = {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || 'User',
    photoURL: user.photoURL || undefined,
    subscriptionPlan: 'trial',
    trialStartedAt: now.toISOString(),
    trialExpiresAt: expires.toISOString(),
    imagesProcessedCount: 0
  };

  await setDoc(userRef, newProfile);
  return newProfile;
}
