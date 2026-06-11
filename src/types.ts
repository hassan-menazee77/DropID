export type PlanType = "free" | "pro";

export interface UserProfile {
  id: string;
  email: string;
  uniqueId: string; // Formatting: NAME-XXXX or customized if Pro
  plan: PlanType;
  storageUsed: number; // in bytes
  createdAt: string;
}

export interface SharedFile {
  id: string;
  userId: string;
  userUniqueId: string;
  name: string;
  type: string; // mime-type
  size: number; // in bytes
  url: string; // URL path to download
  thumbnail?: string; // Optional b64 thumbnail or symbol
  createdAt: string;
  expiresAt: string | null; // NULL if never expires (Pro)
  collectionId: string | null;
  downloadsCount: number;
}

export interface Collection {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
}

export interface SystemView {
  id: string;
  fileOwnerId: string;
  userUniqueId: string;
  viewerIP: string;
  timestamp: string;
}

export interface DashboardStats {
  totalFiles: number;
  totalSize: number;
  viewsCount: number;
  storageLimit: number; // bytes
}
