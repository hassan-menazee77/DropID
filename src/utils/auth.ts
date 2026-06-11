import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, User, onAuthStateChanged, signOut } from "firebase/auth";
// @ts-ignore
import firebaseConfig from "../../firebase-applet-config.json";

// Check if Firebase is provisioned
let firebaseAvailable = false;
let authInstance: any = null;

try {
  if (firebaseConfig && (firebaseConfig as any).apiKey) {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    authInstance = getAuth(app);
    firebaseAvailable = true;
    console.log("Firebase Auth loaded successfully.");
  }
} catch (e) {
  console.warn("firebase-applet-config.json not loaded, falling back to client-simulated SaaS authentication.", e);
}

export interface UserSession {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
}

export const authService = {
  isFirebaseEnabled: (): boolean => firebaseAvailable,

  // Subscribe to authentication changes
  onAuthChange: (callback: (user: UserSession | null) => void): (() => void) => {
    if (firebaseAvailable && authInstance) {
      return onAuthStateChanged(authInstance, (user: User | null) => {
        if (user) {
          callback({
            uid: user.uid,
            email: user.email || "user@dropid.app",
            displayName: user.displayName || user.email?.split("@")[0].toUpperCase() || "premium member"
          });
        } else {
          callback(null);
        }
      });
    } else {
      // Client-side simulation subscription
      const stored = localStorage.getItem("dropid_active_user");
      if (stored) {
        try {
          callback(JSON.parse(stored));
        } catch (e) {
          callback(null);
        }
      } else {
        callback(null);
      }
      
      // Return a dummy unsubscribe
      return () => {};
    }
  },

  // Log in with Simulated Account (or Google if Firebase is active)
  signInWithGoogle: async (): Promise<UserSession> => {
    if (firebaseAvailable && authInstance) {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(authInstance, provider);
      return {
        uid: result.user.uid,
        email: result.user.email || "user@dropid.app",
        displayName: result.user.displayName || "Premium Member"
      };
    } else {
      // Simulate OAuth login instantly
      const simulatedEmail = localStorage.getItem("simulated_email") || "mark@gmail.com";
      const newSimulatedUser: UserSession = {
        uid: "usr_" + Math.random().toString(36).substring(2, 9),
        email: simulatedEmail,
        displayName: simulatedEmail.split("@")[0].toUpperCase()
      };
      localStorage.setItem("dropid_active_user", JSON.stringify(newSimulatedUser));
      return newSimulatedUser;
    }
  },

  // Manual fast login (great for quick testing!)
  signInManual: (email: string): UserSession => {
    const freshUser: UserSession = {
      uid: "usr_" + Math.random().toString(36).substring(2, 9),
      email: email.trim() || "mark@gmail.com",
      displayName: (email.trim() || "mark@gmail.com").split("@")[0].toUpperCase()
    };
    localStorage.setItem("dropid_active_user", JSON.stringify(freshUser));
    return freshUser;
  },

  // Sign out
  logout: async (): Promise<void> => {
    if (firebaseAvailable && authInstance) {
      await signOut(authInstance);
    } else {
      localStorage.removeItem("dropid_active_user");
    }
  }
};
