import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { UserProfile, SharedFile, Collection, SystemView } from "./src/types";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where } from "firebase/firestore";
import { createClient } from "@supabase/supabase-js";

const UPLOADS_DIR = process.env.NODE_ENV === "production" 
  ? "/tmp/uploads" 
  : path.resolve("./uploads");

try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch (e) {
  console.warn("Could not create uploads dir:", e);
}

// Initialize Supabase Storage Client
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);
const SUPABASE_BUCKET = "dropid-files";

// Initialize Firebase client SDK as backend driver
let db: any = null;
try {
  const firebaseConfigPath = path.resolve("./firebase-applet-config.json");
  if (fs.existsSync(firebaseConfigPath)) {
    const config = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf8"));
    if (config && config.apiKey) {
      const app = initializeApp(config);
      db = getFirestore(app, config.firestoreDatabaseId || "(default)");
      console.log("Firebase Firestore initialized successfully in server backend.");
    }
  }
} catch (e) {
  console.error("Failed to initialize Firebase Firestore in server.ts:", e);
}

const DB_FILE = path.resolve("/tmp/server_db.json");
interface LocalDatabase {
  users: Record<string, UserProfile>;
  files: Record<string, SharedFile>;
  collections: Record<string, Collection>;
  views: SystemView[];
}

function readDB(): LocalDatabase {
  if (!fs.existsSync(DB_FILE)) {
    const defaultDB: LocalDatabase = {
      users: {},
      files: {},
      collections: {},
      views: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultDB, null, 2));
    return defaultDB;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  } catch (err) {
    return { users: {}, files: {}, collections: {}, views: [] };
  }
}

function writeDB(data: LocalDatabase) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function generateSuffix(): string {
  const chars = "ABCDEFGHJKLMNOPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueId = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueId + "-" + file.originalname);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2147483648 }
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

async function startServer() {

  app.get("/api/health", (req, res) => {
    res.json({ status: "healthy", time: new Date().toISOString() });
  });

  app.post("/api/user-profile", async (req, res) => {
    const { email, userId } = req.body;
    if (!email || !userId) {
      return res.status(400).json({ error: "Email and userId are required" });
    }

    try {
      let profile: UserProfile | null = null;
      if (db) {
        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          profile = userSnap.data() as UserProfile;
        } else {
          const q = query(collection(db, "users"), where("email", "==", email));
          const qSnap = await getDocs(q);
          if (!qSnap.empty) {
            profile = qSnap.docs[0].data() as UserProfile;
          }
        }
      } else {
        const dbData = readDB();
        profile = Object.values(dbData.users).find(u => u.email === email || u.id === userId) || null;
      }

      if (!profile) {
        const namePart = email.split("@")[0].toUpperCase().replace(/[^A-Z0-9]/g, "");
        const generatedId = `${namePart || "USER"}-${generateSuffix()}`;

        profile = {
          id: userId,
          email,
          uniqueId: generatedId,
          plan: "free",
          storageUsed: 0,
          createdAt: new Date().toISOString()
        };

        if (db) {
          await setDoc(doc(db, "users", userId), profile);
        } else {
          const dbData = readDB();
          dbData.users[userId] = profile;
          writeDB(dbData);
        }
      }

      res.json(profile);
    } catch (err: any) {
      console.error("Error in /api/user-profile:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/user-profile/toggle-plan", async (req, res) => {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    try {
      let user: UserProfile | null = null;
      if (db) {
        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          user = userSnap.data() as UserProfile;
          user.plan = user.plan === "free" ? "pro" : "free";
          await setDoc(userRef, user);
        }
      } else {
        const dbData = readDB();
        user = dbData.users[userId];
        if (user) {
          user.plan = user.plan === "free" ? "pro" : "free";
          writeDB(dbData);
        }
      }

      if (!user) {
        return res.status(404).json({ error: "User profile not found" });
      }

      res.json(user);
    } catch (err: any) {
      console.error("Error in toggle-plan:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/user-profile/custom-id", async (req, res) => {
    const { userId, customId } = req.body;
    if (!userId || !customId) {
      return res.status(400).json({ error: "userId and customId are required" });
    }

    const sanitizedId = customId.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (sanitizedId.length < 3 || sanitizedId.length > 15) {
      return res.status(400).json({ error: "Custom ID must be between 3 and 15 alphanumeric characters" });
    }

    try {
      let user: UserProfile | null = null;
      let idExists = false;

      if (db) {
        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          return res.status(404).json({ error: "User profile not found" });
        }
        user = userSnap.data() as UserProfile;

        if (user.plan !== "pro") {
          return res.status(403).json({ error: "Custom IDs are a premium Pro feature. Please upgrade first." });
        }

        const q = query(collection(db, "users"), where("uniqueId", "==", sanitizedId));
        const qSnap = await getDocs(q);
        idExists = qSnap.docs.some(doc => doc.id !== userId);
        if (idExists) {
          return res.status(409).json({ error: "This Custom ID is already claimed. Try another!" });
        }

        user.uniqueId = sanitizedId;
        await setDoc(userRef, user);

        const filesQ = query(collection(db, "files"), where("userId", "==", userId));
        const filesSnap = await getDocs(filesQ);
        for (const fileDoc of filesSnap.docs) {
          await updateDoc(doc(db, "files", fileDoc.id), {
            userUniqueId: sanitizedId
          });
        }
      } else {
        const dbData = readDB();
        user = dbData.users[userId];
        if (!user) {
          return res.status(404).json({ error: "User profile not found" });
        }

        if (user.plan !== "pro") {
          return res.status(403).json({ error: "Custom IDs are a premium Pro feature. Please upgrade first." });
        }

        idExists = Object.values(dbData.users).some(u => u.id !== userId && u.uniqueId === sanitizedId);
        if (idExists) {
          return res.status(409).json({ error: "This Custom ID is already claimed. Try another!" });
        }

        user.uniqueId = sanitizedId;
        Object.values(dbData.files).forEach(file => {
          if (file.userId === userId) {
            file.userUniqueId = sanitizedId;
          }
        });
        writeDB(dbData);
      }

      res.json(user);
    } catch (err: any) {
      console.error("Error setting custom ID:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/upload", upload.array("files"), async (req, res) => {
    const { userId, collectionId } = req.body;
    const uploadedFiles = req.files as Express.Multer.File[];

    if (!userId) {
      return res.status(400).json({ error: "userId is required for upload" });
    }

    if (!uploadedFiles || uploadedFiles.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    try {
      let user: UserProfile | null = null;
      if (db) {
        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          user = userSnap.data() as UserProfile;
        }
      } else {
        const dbData = readDB();
        user = dbData.users[userId];
      }

      if (!user) {
        uploadedFiles.forEach(f => {
          try { fs.unlinkSync(f.path); } catch (e) {}
        });
        return res.status(404).json({ error: "User profile not found" });
      }

      const totalSize = uploadedFiles.reduce((acc, f) => acc + f.size, 0);
      const freeLimit = 2 * 1024 * 1024 * 1024;
      const proLimit = 100 * 1024 * 1024 * 1024;
      const maxLimit = user.plan === "pro" ? proLimit : freeLimit;

      if (user.storageUsed + totalSize > maxLimit) {
        uploadedFiles.forEach(f => {
          try { fs.unlinkSync(f.path); } catch (e) {}
        });
        return res.status(403).json({ error: `Storage limit exceeded. Limit is ${user.plan === "pro" ? "100GB" : "2GB"}.` });
      }

      const responseFiles: SharedFile[] = [];

      for (const f of uploadedFiles) {
        const fileId = "file-" + Math.random().toString(36).substring(2, 11).toUpperCase();
        
        const fileBuffer = fs.readFileSync(f.path);
        const storageFilePath = `${user.id}/${f.filename}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(SUPABASE_BUCKET)
          .upload(storageFilePath, fileBuffer, {
            contentType: f.mimetype || "application/octet-stream",
            upsert: true
          });

        if (uploadError) {
          throw uploadError;
        }

        try { fs.unlinkSync(f.path); } catch (e) {}

        const { data: publicUrlData } = supabase.storage
          .from(SUPABASE_BUCKET)
          .getPublicUrl(storageFilePath);

        const publicUrl = publicUrlData.publicUrl;

        const expiresAt = user.plan === "pro" 
          ? null 
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        const newFile: SharedFile = {
          id: fileId,
          userId: user.id,
          userUniqueId: user.uniqueId,
          name: f.originalname,
          type: f.mimetype || "application/octet-stream",
          size: f.size,
          url: publicUrl,
          createdAt: new Date().toISOString(),
          expiresAt,
          collectionId: collectionId || null,
          downloadsCount: 0
        };

        (newFile as any).supabasePath = storageFilePath;

        if (db) {
          await setDoc(doc(db, "files", fileId), newFile);
        } else {
          const dbData = readDB();
          dbData.files[fileId] = newFile;
          writeDB(dbData);
        }

        responseFiles.push(newFile);
      }

      user.storageUsed += totalSize;
      if (db) {
        await setDoc(doc(db, "users", userId), user);
      } else {
        const dbData = readDB();
        dbData.users[userId] = user;
        writeDB(dbData);
      }

      res.json({ success: true, files: responseFiles, user });
    } catch (err: any) {
      uploadedFiles.forEach(f => {
        try { fs.unlinkSync(f.path); } catch (e) {}
      });
      console.error("Upload error in /api/upload:", err);
      res.status(500).json({ error: err.message || "Failed to process files upload" });
    }
  });

  app.get("/api/files/by-id/:uniqueId", async (req, res) => {
    const { uniqueId } = req.params;
    const queryIp = req.ip || "unknown";
    const sanitizedId = uniqueId.trim().toUpperCase();

    try {
      let owner: UserProfile | null = null;
      let activeFiles: SharedFile[] = [];
      let viewsCount = 0;

      if (db) {
        const userQ = query(collection(db, "users"), where("uniqueId", "==", sanitizedId));
        const userSnap = await getDocs(userQ);
        if (userSnap.empty) {
          return res.status(404).json({ error: "ID not found" });
        }
        owner = userSnap.docs[0].data() as UserProfile;

        const filesQ = query(collection(db, "files"), where("userUniqueId", "==", sanitizedId));
        const filesSnap = await getDocs(filesQ);
        const now = Date.now();
        activeFiles = filesSnap.docs
          .map(doc => doc.data() as SharedFile)
          .filter(file => {
            if (file.expiresAt && new Date(file.expiresAt).getTime() < now) {
              return false;
            }
            return true;
          });

        const viewId = "view-" + Math.random().toString(36).substring(2, 11);
        const newView: SystemView = {
          id: viewId,
          fileOwnerId: owner.id,
          userUniqueId: owner.uniqueId,
          viewerIP: queryIp,
          timestamp: new Date().toISOString()
        };
        await setDoc(doc(db, "views", viewId), newView);

        const viewsQ = query(collection(db, "views"), where("userUniqueId", "==", sanitizedId));
        const viewsSnap = await getDocs(viewsQ);
        viewsCount = viewsSnap.size;
      } else {
        const dbData = readDB();
        owner = Object.values(dbData.users).find(u => u.uniqueId === sanitizedId) || null;
        if (!owner) {
          return res.status(404).json({ error: "ID not found" });
        }

        const now = Date.now();
        activeFiles = Object.values(dbData.files).filter(file => {
          if (file.userUniqueId !== sanitizedId) return false;
          if (file.expiresAt && new Date(file.expiresAt).getTime() < now) {
            return false;
          }
          return true;
        });

        const viewId = "view-" + Math.random().toString(36).substring(2, 11);
        const newView: SystemView = {
          id: viewId,
          fileOwnerId: owner.id,
          userUniqueId: owner.uniqueId,
          viewerIP: queryIp,
          timestamp: new Date().toISOString()
        };
        dbData.views.push(newView);
        writeDB(dbData);

        viewsCount = dbData.views.filter(v => v.userUniqueId === sanitizedId).length;
      }

      res.json({
        ownerName: owner.email.split("@")[0].toUpperCase(),
        plan: owner.plan,
        files: activeFiles,
        analytics: {
          viewsCount
        }
      });
    } catch (err: any) {
      console.error("Error retrieving files for receiver:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/user/stats/:userId", async (req, res) => {
    const { userId } = req.params;

    try {
      let user: UserProfile | null = null;
      let totalFiles = 0;
      let totalSize = 0;
      let viewsCount = 0;

      if (db) {
        const userSnap = await getDoc(doc(db, "users", userId));
        if (!userSnap.exists()) {
          return res.status(404).json({ error: "User not found" });
        }
        user = userSnap.data() as UserProfile;
        totalSize = user.storageUsed;

        const filesQ = query(collection(db, "files"), where("userId", "==", userId));
        const filesSnap = await getDocs(filesQ);
        totalFiles = filesSnap.size;

        const viewsQ = query(collection(db, "views"), where("fileOwnerId", "==", userId));
        const viewsSnap = await getDocs(viewsQ);
        viewsCount = viewsSnap.size;
      } else {
        const dbData = readDB();
        user = dbData.users[userId];
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }
        const userFiles = Object.values(dbData.files).filter(f => f.userId === userId);
        totalFiles = userFiles.length;
        totalSize = user.storageUsed;
        viewsCount = dbData.views.filter(v => v.fileOwnerId === userId).length;
      }

      res.json({
        totalFiles,
        totalSize,
        viewsCount,
        storageLimit: user.plan === "pro" ? 100 * 1024 * 1024 * 1024 : 2 * 1024 * 1024 * 1024
      });
    } catch (err: any) {
      console.error("Error fetching stats:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/download/:fileId", async (req, res) => {
    const { fileId } = req.params;

    try {
      let fileMeta: SharedFile | null = null;

      if (db) {
        const fileRef = doc(db, "files", fileId);
        const fileSnap = await getDoc(fileRef);
        if (fileSnap.exists()) {
          fileMeta = fileSnap.data() as SharedFile;
        }
      } else {
        const dbData = readDB();
        fileMeta = dbData.files[fileId];
      }

      if (!fileMeta) {
        return res.status(404).send("File not found");
      }

      if (fileMeta.expiresAt && new Date(fileMeta.expiresAt).getTime() < Date.now()) {
        return res.status(410).send("File has expired");
      }

      const downloadResponse = await fetch(fileMeta.url);
      if (!downloadResponse.ok) {
        return res.status(404).send("File contents could not be retrieved from Supabase Storage.");
      }

      if (db) {
        await updateDoc(doc(db, "files", fileId), {
          downloadsCount: (fileMeta.downloadsCount || 0) + 1
        });
      } else {
        const dbData = readDB();
        const fMeta = dbData.files[fileId];
        if (fMeta) {
          fMeta.downloadsCount += 1;
          writeDB(dbData);
        }
      }

      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileMeta.name)}"`);
      res.setHeader("Content-Type", fileMeta.type || "application/octet-stream");
      if (fileMeta.size) {
        res.setHeader("Content-Length", fileMeta.size);
      }

      const arrayBuffer = await downloadResponse.arrayBuffer();
      res.write(Buffer.from(arrayBuffer));
      res.end();
    } catch (err: any) {
      console.error("Error downloading file:", err);
      res.status(500).send("Error downloading file from storage.");
    }
  });

  app.delete("/api/files/:fileId", async (req, res) => {
    const { fileId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    try {
      let fileMeta: SharedFile | null = null;
      let user: UserProfile | null = null;
      let remainingSize = 0;

      if (db) {
        const fileRef = doc(db, "files", fileId);
        const fileSnap = await getDoc(fileRef);
        if (!fileSnap.exists()) {
          return res.status(404).json({ error: "File not found" });
        }
        fileMeta = fileSnap.data() as SharedFile;

        if (fileMeta.userId !== userId) {
          return res.status(403).json({ error: "Access denied" });
        }

        const supabasePath = (fileMeta as any).supabasePath || `${fileMeta.userId}/${fileMeta.id}`;
        try {
          const { error: deleteError } = await supabase.storage
            .from(SUPABASE_BUCKET)
            .remove([supabasePath]);
          if (deleteError) {
            console.error("Supabase Storage deletion warning:", deleteError);
          }
        } catch (e) {
          console.error("Failed to delete from Supabase storage:", e);
        }

        await deleteDoc(fileRef);

        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          user = userSnap.data() as UserProfile;
          
          const filesQ = query(collection(db, "files"), where("userId", "==", userId));
          const filesSnap = await getDocs(filesQ);
          remainingSize = filesSnap.docs
            .map(d => d.data() as SharedFile)
            .reduce((sum, f) => sum + f.size, 0);

          user.storageUsed = remainingSize;
          await setDoc(userRef, user);
        }
      } else {
        const dbData = readDB();
        fileMeta = dbData.files[fileId];

        if (!fileMeta) {
          return res.status(404).json({ error: "File not found" });
        }

        if (fileMeta.userId !== userId) {
          return res.status(403).json({ error: "Access denied" });
        }

        const fileNameOnDisk = (fileMeta as any).fileNameOnDisk;
        const filePath = path.join(UPLOADS_DIR, fileNameOnDisk);
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (e) {
          console.warn("Could not delete from disk:", filePath);
        }

        delete dbData.files[fileId];

        user = dbData.users[userId];
        if (user) {
          remainingSize = Object.values(dbData.files)
            .filter(f => f.userId === userId)
            .reduce((sum, f) => sum + f.size, 0);
          user.storageUsed = remainingSize;
        }

        writeDB(dbData);
      }

      res.json({ success: true, message: "File deleted successfully", storageUsed: user ? user.storageUsed : 0 });
    } catch (err: any) {
      console.error("Error in delete file:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/collections/:userId", async (req, res) => {
    const { userId } = req.params;

    try {
      let cols: Collection[] = [];
      if (db) {
        const q = query(collection(db, "collections"), where("userId", "==", userId));
        const snap = await getDocs(q);
        cols = snap.docs.map(doc => doc.data() as Collection);
      } else {
        const dbData = readDB();
        cols = Object.values(dbData.collections).filter(c => c.userId === userId);
      }
      res.json(cols);
    } catch (err: any) {
      console.error("Error in getCollections:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/collections", async (req, res) => {
    const { userId, name } = req.body;
    if (!userId || !name) {
      return res.status(400).json({ error: "userId and name are required" });
    }

    try {
      const colId = "col-" + Math.random().toString(36).substring(2, 11).toUpperCase();
      const newCollection: Collection = {
        id: colId,
        userId,
        name,
        createdAt: new Date().toISOString()
      };

      if (db) {
        await setDoc(doc(db, "collections", colId), newCollection);
      } else {
        const dbData = readDB();
        dbData.collections[colId] = newCollection;
        writeDB(dbData);
      }

      res.json(newCollection);
    } catch (err: any) {
      console.error("Error in createCollection:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/collections/:colId", async (req, res) => {
    const { colId } = req.params;
    const { userId } = req.body;

    try {
      if (db) {
        const colRef = doc(db, "collections", colId);
        const snap = await getDoc(colRef);
        if (!snap.exists()) {
          return res.status(404).json({ error: "Collection not found" });
        }
        const col = snap.data() as Collection;
        if (col.userId !== userId) {
          return res.status(403).json({ error: "Unauthorized" });
        }

        const filesQ = query(collection(db, "files"), where("collectionId", "==", colId));
        const filesSnap = await getDocs(filesQ);
        for (const fileDoc of filesSnap.docs) {
          await updateDoc(doc(db, "files", fileDoc.id), {
            collectionId: null
          });
        }

        await deleteDoc(colRef);
      } else {
        const dbData = readDB();
        const col = dbData.collections[colId];
        if (!col) {
          return res.status(404).json({ error: "Collection not found" });
        }
        if (col.userId !== userId) {
          return res.status(403).json({ error: "Unauthorized" });
        }

        Object.values(dbData.files).forEach(file => {
          if (file.collectionId === colId) {
            file.collectionId = null;
          }
        });

        delete dbData.collections[colId];
        writeDB(dbData);
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("Error in deleteCollection:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/files/add-to-collection", async (req, res) => {
    const { fileIds, collectionId, userId } = req.body;
    if (!fileIds || !Array.isArray(fileIds) || !userId) {
      return res.status(400).json({ error: "Invalid data" });
    }

    try {
      if (db) {
        for (const id of fileIds) {
          const fileRef = doc(db, "files", id);
          const fileSnap = await getDoc(fileRef);
          if (fileSnap.exists()) {
            const f = fileSnap.data() as SharedFile;
            if (f.userId === userId) {
              await updateDoc(fileRef, {
                collectionId: collectionId || null
              });
            }
          }
        }
      } else {
        const dbData = readDB();
        fileIds.forEach(id => {
          const f = dbData.files[id];
          if (f && f.userId === userId) {
            f.collectionId = collectionId || null;
          }
        });
        writeDB(dbData);
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("Error in bulk assign files:", err);
      res.status(500).json({ error: err.message });
    }
  });

  const distPath = path.join(process.cwd(), "dist");
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get("*", (req: any, res: any, next: any) => {
      if (req.path.startsWith("/api/")) return next();
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  if (process.env.NODE_ENV !== "production") {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`DropID server running on http://0.0.0.0:${PORT}`);
    });
  }
}

startServer().catch(err => {
  console.error("Error starting DropID app server:", err);
});

export default app;
