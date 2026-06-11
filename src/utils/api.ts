import { UserProfile, SharedFile, Collection, DashboardStats } from "../types";

// Base API fetching wrapper
async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  // Get or Register User Profile
  getOrCreateProfile: async (email: string, userId: string): Promise<UserProfile> => {
    return fetchAPI<UserProfile>("/api/user-profile", {
      method: "POST",
      body: JSON.stringify({ email, userId }),
    });
  },

  // Toggle Free <-> Pro plan
  togglePlan: async (userId: string): Promise<UserProfile> => {
    return fetchAPI<UserProfile>("/api/user-profile/toggle-plan", {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
  },

  // Change uniqueId (Pro Feature)
  setCustomUniqueId: async (userId: string, customId: string): Promise<UserProfile> => {
    return fetchAPI<UserProfile>("/api/user-profile/custom-id", {
      method: "POST",
      body: JSON.stringify({ userId, customId }),
    });
  },

  // Upload Files with optional collection association
  uploadFiles: async (
    userId: string,
    files: File[],
    collectionId?: string | null,
    onProgress?: (progress: number, speedMBs: number, uploadedBytes: number, totalBytes: number) => void
  ): Promise<{ success: boolean; files: SharedFile[]; user: UserProfile }> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      
      formData.append("userId", userId);
      if (collectionId) {
        formData.append("collectionId", collectionId);
      }
      
      files.forEach(file => {
        formData.append("files", file);
      });

      const startTime = Date.now();

      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = Math.round((event.loaded / event.total) * 100);
          const elapsedSeconds = (Date.now() - startTime) / 1000;
          let speedMBs = 0;
          if (elapsedSeconds > 0) {
            const uploadedMB = event.loaded / (1024 * 1024);
            speedMBs = uploadedMB / elapsedSeconds;
          }
          onProgress(progress, speedMBs, event.loaded, event.total);
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (e) {
            reject(new Error("Failed to parse server upload response."));
          }
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            reject(new Error(err.error || "Upload failed."));
          } catch (e) {
            reject(new Error(`Upload failed with status ${xhr.status}.`));
          }
        }
      });

      xhr.addEventListener("error", () => {
        reject(new Error("Network upload error."));
      });

      xhr.open("POST", "/api/upload");
      xhr.send(formData);
    });
  },

  // Get recipient files
  getReceiverFiles: async (
    uniqueId: string
  ): Promise<{
    ownerName: string;
    plan: "free" | "pro";
    files: SharedFile[];
    analytics: { viewsCount: number };
  }> => {
    return fetchAPI<{
      ownerName: string;
      plan: "free" | "pro";
      files: SharedFile[];
      analytics: { viewsCount: number };
    }>(`/api/files/by-id/${encodeURIComponent(uniqueId)}`);
  },

  // Get dashboard metrics
  getDashboardStats: async (userId: string): Promise<DashboardStats> => {
    return fetchAPI<DashboardStats>(`/api/user/stats/${userId}`);
  },

  // Delete specific file
  deleteFile: async (fileId: string, userId: string): Promise<{ success: boolean; storageUsed: number }> => {
    return fetchAPI<{ success: boolean; storageUsed: number }>(`/api/files/${fileId}`, {
      method: "DELETE",
      body: JSON.stringify({ userId }),
    });
  },

  // Get collections
  getCollections: async (userId: string): Promise<Collection[]> => {
    return fetchAPI<Collection[]>(`/api/collections/${userId}`);
  },

  // Create collection
  createCollection: async (userId: string, name: string): Promise<Collection> => {
    return fetchAPI<Collection>("/api/collections", {
      method: "POST",
      body: JSON.stringify({ userId, name }),
    });
  },

  // Delete collection
  deleteCollection: async (colId: string, userId: string): Promise<{ success: boolean }> => {
    return fetchAPI<{ success: boolean }>(`/api/collections/${colId}`, {
      method: "DELETE",
      body: JSON.stringify({ userId }),
    });
  },

  // Bulk add files to collection
  assignFilesToCollection: async (
    userId: string,
    fileIds: string[],
    collectionId: string | null
  ): Promise<{ success: boolean }> => {
    return fetchAPI<{ success: boolean }>("/api/files/add-to-collection", {
      method: "POST",
      body: JSON.stringify({ userId, fileIds, collectionId }),
    });
  }
};
