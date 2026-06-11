import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Upload,
  Download,
  Search,
  Copy,
  Check,
  ExternalLink,
  Lock,
  Unlock,
  Settings,
  Plus,
  Trash2,
  QrCode,
  LogOut,
  Zap,
  Sparkles,
  Share2,
  LayoutGrid,
  FolderPlus,
  Eye,
  BarChart3,
  Cloud,
  Play,
  Image as ImageIcon,
  Video as VideoIcon,
  File as FileIcon,
  Clock,
  ArrowRight,
  X,
  Sun,
  Moon,
  TrendingUp,
  Shield,
  Award,
  ChevronRight
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import JSZip from "jszip";

import { UserProfile, SharedFile, Collection, DashboardStats } from "./types";
import { api } from "./utils/api";
import { authService, UserSession } from "./utils/auth";
import { DropIdLogo } from "./components/DropIdLogo";

export default function App() {
  // Page routing
  const [view, setView] = useState<"landing" | "dashboard" | "receiver">("landing");
  
  // Theme state
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // Auth & user states
  const [session, setSession] = useState<UserSession | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    totalFiles: 0,
    totalSize: 0,
    viewsCount: 0,
    storageLimit: 2 * 1024 * 1024 * 1024
  });

  // Flow states
  const [loading, setLoading] = useState<boolean>(true);
  const [searchIdInput, setSearchIdInput] = useState<string>("");
  const [upgradeLoading, setUpgradeLoading] = useState<boolean>(false);
  const [customIdInput, setCustomIdInput] = useState<string>("");
  const [customIdError, setCustomIdError] = useState<string>("");
  
  // Storage files
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [newCollectionName, setNewCollectionName] = useState<string>("");
  const [isCreatingCollection, setIsCreatingCollection] = useState<boolean>(false);

  // Receiver view states
  const [receiverId, setReceiverId] = useState<string>("");
  const [receiverData, setReceiverData] = useState<{
    ownerName: string;
    plan: "free" | "pro";
    files: SharedFile[];
    analytics: { viewsCount: number };
  } | null>(null);
  const [receiverError, setReceiverError] = useState<string>("");
  const [receiverLoading, setReceiverLoading] = useState<boolean>(false);
  
  // Password protection for receiver downloads (SaaS premium mock)
  const [passwordInput, setPasswordInput] = useState<string>("");
  const [enteredPasswordCorrect, setEnteredPasswordCorrect] = useState<boolean>(true);
  const [passwordRequired, setPasswordRequired] = useState<boolean>(false);

  // File Upload states
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadSpeed, setUploadSpeed] = useState<number>(0);
  const [uploadedBytes, setUploadedBytes] = useState<number>(0);
  const [totalUploadBytes, setTotalUploadBytes] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [showConfetti, setShowConfetti] = useState<boolean>(false);
  const [uploadedSessionFiles, setUploadedSessionFiles] = useState<SharedFile[]>([]);

  // Interactivity feedback
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});
  const [fullscreenPreview, setFullscreenPreview] = useState<SharedFile | null>(null);
  
  // QR Modal display
  const [showQrModal, setShowQrModal] = useState<boolean>(false);

  // Fast manual account inputs (great for testers)
  const [showEmailLoginDialog, setShowEmailLoginDialog] = useState<boolean>(false);
  const [loginEmail, setLoginEmail] = useState<string>("");

  // Refs for upload trigger
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Zip downloading progress feedback
  const [zipProgress, setZipProgress] = useState<string>("");

  // Clean-up or init parameters
  useEffect(() => {
    // 1. Detect view based on URL parameter or Hash
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get("id");
    if (idParam) {
      setReceiverId(idParam);
      setView("receiver");
      loadReceiverPage(idParam);
    } else {
      setView("landing");
    }

    // 2. Load auth subscription
    const unsubscribe = authService.onAuthChange((user) => {
      setSession(user);
      if (user) {
        syncUserProfile(user.email, user.uid);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Update theme on body
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
      document.body.style.backgroundColor = "#0a0a0f";
    } else {
      root.classList.remove("dark");
      document.body.style.backgroundColor = "#f8fafc";
    }
  }, [theme]);

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Esc: Close active modals, previews, or overlays
      if (e.key === "Escape") {
        let closedSomething = false;
        if (fullscreenPreview) {
          setFullscreenPreview(null);
          closedSomething = true;
        }
        if (showQrModal) {
          setShowQrModal(false);
          closedSomething = true;
        }
        if (showEmailLoginDialog) {
          setShowEmailLoginDialog(false);
          closedSomething = true;
        }
        if (isCreatingCollection) {
          setIsCreatingCollection(false);
          closedSomething = true;
        }
        if (closedSomething) {
          e.preventDefault();
        }
      }

      // 2. Ctrl+U: Open the file upload browser (specifically inside the dashboard)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "u") {
        if (view === "dashboard" && fileInputRef.current) {
          e.preventDefault();
          fileInputRef.current.click();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [fullscreenPreview, showQrModal, showEmailLoginDialog, isCreatingCollection, view]);

  // Sync user profile with Express server database
  const syncUserProfile = async (email: string, userId: string) => {
    try {
      setLoading(true);
      const userProfile = await api.getOrCreateProfile(email, userId);
      setProfile(userProfile);
      setCustomIdInput(userProfile.uniqueId);

      // Load stats, files & collections
      await refreshDashboardData(userProfile.id, userProfile.uniqueId);
    } catch (e) {
      console.error("Error syncing profile:", e);
    } finally {
      setLoading(false);
    }
  };

  const refreshDashboardData = async (userId: string, uniqueId: string) => {
    try {
      const dbStats = await api.getDashboardStats(userId);
      setStats(dbStats);

      const dbCols = await api.getCollections(userId);
      setCollections(dbCols);

      // Get files belonging to this unique id
      const res = await api.getReceiverFiles(uniqueId);
      setFiles(res.files);
    } catch (e) {
      console.error("Error loading dashboard details:", e);
    }
  };

  // Log in
  const handleGoogleLogin = async () => {
    try {
      const user = await authService.signInWithGoogle();
      setSession(user);
      await syncUserProfile(user.email, user.uid);
      setView("dashboard");
    } catch (e) {
      console.error("Failed standard login:", e);
    }
  };

  const handleManualLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.includes("@")) {
      alert("Please enter a valid email address");
      return;
    }
    const user = authService.signInManual(loginEmail);
    setSession(user);
    syncUserProfile(user.email, user.uid);
    setShowEmailLoginDialog(false);
    setView("dashboard");
  };

  // Sign out
  const handleLogout = async () => {
    await authService.logout();
    setSession(null);
    setProfile(null);
    setView("landing");
  };

  // Copy helper
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedStates((prev) => ({ ...prev, [id]: true }));
    setTimeout(() => {
      setCopiedStates((prev) => ({ ...prev, [id]: false }));
    }, 2000);
  };

  // Upload actions
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const filesList = Array.from(e.dataTransfer.files) as File[];
      triggerFileUpload(filesList);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const filesList = Array.from(e.target.files) as File[];
      triggerFileUpload(filesList);
    }
  };

  const triggerFileUpload = async (filesList: File[]) => {
    if (!profile) {
      // Must have account to upload
      setShowEmailLoginDialog(true);
      return;
    }

    // Free plan files and size controls
    const numFiles = filesList.length;
    const totalSize = filesList.reduce((acc, f) => acc + f.size, 0);

    if (profile.plan === "free" && files.length + numFiles > 50) {
      alert("Free plan users are limited to 50 files total. Please upgrade to Pro for unlimited file slots!");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadSpeed(0);
    setUploadedBytes(0);
    setTotalUploadBytes(totalSize);

    try {
      const response = await api.uploadFiles(
        profile.id,
        filesList,
        selectedCollectionId,
        (progress, speed, loaded, total) => {
          setUploadProgress(progress);
          setUploadSpeed(speed);
          setUploadedBytes(loaded);
        }
      );

      if (response.success) {
        setUploadedSessionFiles(response.files);
        setProfile(response.user);
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 5000);
        
        // Refresh dashboard contents
        await refreshDashboardData(profile.id, profile.uniqueId);
      }
    } catch (err: any) {
      alert(err.message || "Something went wrong during the file upload.");
    } finally {
      setIsUploading(false);
    }
  };

  // Load files for Recipient View
  const loadReceiverPage = async (id: string) => {
    if (!id) return;
    setReceiverLoading(true);
    setReceiverError("");
    setReceiverData(null);
    try {
      const data = await api.getReceiverFiles(id);
      setReceiverData(data);
      // Premium feature mock password protection for simulation
      if (data.plan === "pro" && id.includes("SECURE")) {
        setPasswordRequired(true);
        setEnteredPasswordCorrect(false);
      } else {
        setPasswordRequired(false);
        setEnteredPasswordCorrect(true);
      }
    } catch (e: any) {
      setReceiverError(e.message || "Failed to locate files or invalid ID.");
    } finally {
      setReceiverLoading(false);
    }
  };

  // Handle manual Enter ID Search
  const handleIdSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchIdInput.trim()) return;
    const cleanId = searchIdInput.trim().toUpperCase();
    setReceiverId(cleanId);
    setView("receiver");
    loadReceiverPage(cleanId);
  };

  // Delete file
  const handleDeleteFile = async (fileId: string) => {
    if (!profile) return;
    if (confirm("Are you sure you want to permanently delete this file? This cannot be undone.")) {
      try {
        const res = await api.deleteFile(fileId, profile.id);
        if (res.success) {
          // Sync state locally
          setFiles((prev) => prev.filter((f) => f.id !== fileId));
          setStats((prev) => ({ ...prev, totalSize: res.storageUsed, totalFiles: prev.totalFiles - 1 }));
        }
      } catch (e: any) {
        alert("Failed to delete file: " + e.message);
      }
    }
  };

  // Create Collection/Album
  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !newCollectionName.trim()) return;
    try {
      const newCol = await api.createCollection(profile.id, newCollectionName.trim());
      setCollections((prev) => [...prev, newCol]);
      setNewCollectionName("");
      setIsCreatingCollection(false);
    } catch (e: any) {
      alert("Failed to create collection");
    }
  };

  // Delete Collection
  const handleDeleteCollection = async (colId: string) => {
    if (!profile) return;
    if (confirm("Are you sure you want to delete this collection? Files inside will be freed standardly.")) {
      try {
        await api.deleteCollection(colId, profile.id);
        setCollections((prev) => prev.filter((c) => c.id !== colId));
        if (selectedCollectionId === colId) {
          setSelectedCollectionId(null);
        }
      } catch (e: any) {
        alert("Failed delete collection");
      }
    }
  };

  // Toggle Pro status instantly for user testing!
  const handleTogglePlan = async () => {
    if (!profile) return;
    setUpgradeLoading(true);
    try {
      const updatedProfile = await api.togglePlan(profile.id);
      setProfile(updatedProfile);
      await refreshDashboardData(updatedProfile.id, updatedProfile.uniqueId);
    } catch (e: any) {
      alert("Plan toggle failed.");
    } finally {
      setUpgradeLoading(false);
    }
  };

  // Save Custom ID (Pro)
  const handleSaveCustomId = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !customIdInput.trim()) return;
    
    setCustomIdError("");
    try {
      const updated = await api.setCustomUniqueId(profile.id, customIdInput.trim());
      setProfile(updated);
      alert(`Success! Your personal ID is now: ${updated.uniqueId}`);
      await refreshDashboardData(updated.id, updated.uniqueId);
    } catch (e: any) {
      setCustomIdError(e.message || "That Custom ID is unavailable.");
    }
  };

  // Download All files as single ZIP (Client Side)
  const downloadAllAsZip = async () => {
    const filesToDownload = receiverData?.files || files;
    if (filesToDownload.length === 0) return;

    setZipProgress("Preparing...");
    const zip = new JSZip();

    try {
      for (let i = 0; i < filesToDownload.length; i++) {
        const file = filesToDownload[i];
        setZipProgress(`Fetching file ${i + 1}/${filesToDownload.length}: ${file.name}`);
        
        const response = await fetch(file.url);
        if (!response.ok) throw new Error(`Could not fetch file: ${file.name}`);
        
        const blob = await response.blob();
        zip.file(file.name, blob);
      }

      setZipProgress("Generating ZIP contents...");
      const zipBlob = await zip.generateAsync({ type: "blob" });
      
      const link = document.createElement("a");
      link.href = URL.createObjectURL(zipBlob);
      link.download = `DropID_${receiverId || profile?.uniqueId || "files"}_archive.zip`;
      link.click();
      setZipProgress("");
    } catch (err: any) {
      console.error(err);
      alert("ZIP extraction error: " + err.message);
      setZipProgress("");
    }
  };

  // Download QR code canvas
  const downloadQrCodeImage = () => {
    const canvas = document.getElementById("qr-canvas") as HTMLCanvasElement;
    if (canvas) {
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `DropID_${profile?.uniqueId || "QR"}_Card.png`;
      a.click();
    }
  };

  // Helper format human size
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Simulated link path
  const getShareLinkString = (uniqueId: string) => {
    return `${window.location.origin}?id=${uniqueId}`;
  };

  // Floating particles background configuration
  const floatingParticles = Array.from({ length: 15 });

  return (
    <div className={`min-h-screen transition-colors duration-300 font-sans ${theme === "dark" ? "bg-[#0a0a0f] text-slate-100" : "bg-slate-50 text-slate-800"}`}>
      {/* Glow Effects */}
      <div className="absolute top-0 left-1/4 w-[30rem] h-[30rem] ambient-glow rounded-full pointer-events-none z-0" />
      <div className="absolute top-1/3 right-1/4 w-[25rem] h-[25rem] ambient-cyan-glow rounded-full pointer-events-none z-0" />

      {/* Header Bar */}
      <header className={`sticky top-0 z-40 backdrop-blur-md border-b transition-colors duration-300 ${theme === "dark" ? "bg-[#0a0a0f]/85 border-[#1e1e2e]" : "bg-white/80 border-slate-200"}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* Logo */}
          <div className="cursor-pointer" onClick={() => setView("landing")}>
            <DropIdLogo showText={true} size={38} />
          </div>

          {/* Nav Items */}
          <div className="flex items-center gap-3">
            {/* Quick Demo Selector for developer convenience */}
            <span className="hidden sm:inline-flex text-xs font-mono py-1 px-2.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
              Europe servers online
            </span>

            {/* Dark & Light toggle */}
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className={`p-2 rounded-xl transition-all duration-200 ${theme === "dark" ? "bg-slate-900 hover:bg-slate-800 text-yellow-400" : "bg-slate-200 hover:bg-slate-300 text-slate-800"}`}
              title="Toggle theme mode"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Login / Dashboard buttons */}
            {profile ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setView(view === "dashboard" ? "landing" : "dashboard")}
                  className="text-xs sm:text-sm py-2 px-4 rounded-xl font-medium bg-gradient-to-tr from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/20 hover:scale-[1.02] transition-transform"
                >
                  {view === "dashboard" ? "View Landing" : "Dashboard"}
                </button>
                <button
                  onClick={handleLogout}
                  className={`p-2 rounded-xl border transition-colors ${theme === "dark" ? "bg-slate-900 border-[#1e1e2e] hover:bg-slate-850 hover:text-red-400" : "bg-slate-150 border-slate-200 hover:bg-slate-200 text-red-600"}`}
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowEmailLoginDialog(true)}
                  className={`text-xs sm:text-sm py-2 px-4 rounded-xl border transition-all ${theme === "dark" ? "border-[#1e1e2e] text-slate-300 hover:bg-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-100"}`}
                >
                  Tester Sign In
                </button>
                <button
                  onClick={handleGoogleLogin}
                  className="text-xs sm:text-sm py-2 px-4 rounded-xl font-medium bg-gradient-to-tr from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/20 hover:scale-[1.02] transition-all hover:shadow-cyan-500/10 flex items-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Get Your Free ID
                </button>
              </div>
            )}
          </div>

        </div>
      </header>

      {/* Confetti Animation Effect */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden flex items-center justify-center">
          <div className="absolute top-1/4 animate-bounce bg-blue-500/20 text-blue-400 px-6 py-3 rounded-full border border-blue-500/30 text-sm font-semibold flex items-center gap-2 shadow-xl backdrop-blur-md">
            <Sparkles className="w-5 h-5 animate-spin" />
            Upload fully synchronized at 100% original quality!
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* --- 1. LANDING VIEW --- */}
        {view === "landing" && (
          <div className="space-y-24">
            
            {/* HERO SECTION */}
            <div className="text-center max-w-4xl mx-auto space-y-8 pt-12">
              
              <div className="inline-flex items-center gap-2 py-1 px-3.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/25">
                <Sparkles className="w-3.5 h-3.5" />
                Next Generation File Sharing Ecosystem
              </div>

              <h1 className="font-display font-bold text-4xl sm:text-6xl tracking-tight leading-none text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-slate-400 dark:from-white dark:to-slate-300 light:from-slate-900 light:to-slate-700">
                Share anything. Instantly.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 via-cyan-400 to-indigo-400">
                  Zero quality loss.
                </span>
              </h1>

              <p className="text-slate-400 font-sans text-base sm:text-xl max-w-2xl mx-auto light:text-slate-600">
                Instantly drop high-resolution photographs, ProRes video streams, and full-scale ZIP folders. Transfer on high-speed tunnels, claim your beautiful signature personal ID card, and experience drag-and-drop sharing the way Vercel shares code.
              </p>

              {/* ENTER FRIEND ID SEARCH */}
              <div className="max-w-lg mx-auto bg-slate-900/40 p-2 rounded-2xl border border-slate-800 backdrop-blur-xl shadow-2xl relative group light:bg-slate-100 light:border-slate-200">
                <form onSubmit={handleIdSearchSubmit} className="flex gap-2">
                  <div className="relative flex-1 flex items-center">
                    <Search className="absolute left-3 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Enter a friend's ID (e.g. MARK-7X9K)"
                      value={searchIdInput}
                      onChange={(e) => setSearchIdInput(e.target.value.toUpperCase())}
                      className="w-full bg-transparent pl-11 pr-4 py-3.5 text-sm outline-none text-white font-mono placeholder-slate-500 uppercase rounded-xl transition-all border border-transparent focus:border-blue-500/30 light:text-slate-900 light:placeholder-slate-400"
                    />
                  </div>
                  <button
                    type="submit"
                    className="py-3 px-5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-500 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center gap-1.5 text-sm cursor-pointer"
                  >
                    Load Files
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              </div>

              {/* DEMO ID CARD AND METRICS */}
              <div className="flex flex-wrap justify-center gap-6 text-xs text-slate-500 font-mono pt-4 justify-items-center">
                <span className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-blue-500" /> 10,000+ files shared today</span>
                <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-[#06b6d4]" /> End-to-end cloud validation</span>
                <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-cyan-400" /> Files expire in 7 days on Free plan</span>
              </div>

            </div>

            {/* AUTOMATED WORKFLOW DEMO */}
            <div className={`p-8 sm:p-12 rounded-3xl border ${theme === "dark" ? "bg-slate-900/30 border-[#1e1e2e]" : "bg-white border-slate-200"} relative overflow-hidden max-w-5xl mx-auto shadow-2xl`}>
              <div className="absolute top-0 right-0 p-4 font-mono text-[10px] text-zinc-500 flex items-center gap-1 bg-zinc-800/20 border-b border-l border-white/5 rounded-bl-xl">
                <span>INTERACTIVE SIMULATED PIPELINE</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center relative z-10">
                
                {/* Step 1: Upload */}
                <div className="p-6 rounded-2xl bg-[#0a0a0f]/60 border border-slate-800/80 space-y-4 light:bg-slate-50 light:border-slate-200">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center font-mono font-bold text-xs">01</div>
                  <h3 className="font-display font-medium text-lg">Drop your Assets</h3>
                  <p className="text-xs text-slate-400 leading-relaxed light:text-slate-500">Drag 4K raw photographs, video streams or high performance archives directly onto the interface. Zero compression applied.</p>
                  
                  {/* Visual representation */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/60 text-center text-[10px] text-slate-500 font-mono relative overflow-hidden group">
                    <div className="absolute top-0 left-0 h-1 bg-gradient-to-r from-blue-500 to-cyan-400 animate-pulse w-full" />
                    <Upload className="w-6 h-6 mx-auto mb-2 text-blue-500 group-hover:scale-110 transition-transform duration-300" />
                    <span>UPLOADING RAW_CAPTURE_02.RAW</span>
                    <div className="w-full bg-slate-900 h-1.5 rounded-full mt-2 overflow-hidden">
                      <div className="bg-blue-500 h-full rounded-full w-[82%] animate-pulse" />
                    </div>
                  </div>
                </div>

                {/* Step 2: ID Generated */}
                <div className="p-6 rounded-2xl bg-[#0a0a0f]/60 border border-slate-800/80 space-y-4 light:bg-slate-50 light:border-slate-200 relative">
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 text-[10px] font-mono py-0.5 px-2.5 rounded-full">AUTOMATED TUNNEL</div>
                  <div className="w-9 h-9 rounded-lg bg-cyan-500/10 text-cyan-400 border border-[#06b6d4]/20 flex items-center justify-center font-mono font-bold text-xs">02</div>
                  <h3 className="font-display font-medium text-lg">Receive Personal ID</h3>
                  <p className="text-xs text-slate-400 leading-relaxed light:text-slate-500">An immutable, beautiful personal identifier is allocated to you instantly (e.g., MARK-7X9K) for atomic security mapping.</p>
                  
                  {/* Visual Card Representation */}
                  <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-950 to-slate-900 border border-white/5 text-center text-white relative shimmer-overlay select-none shadow-md">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[7px] font-mono text-cyan-400 tracking-widest">DROPID PLATINUM MEMBER</span>
                      <Award className="w-3.5 h-3.5 text-cyan-400" />
                    </div>
                    <div className="font-display font-bold text-sm tracking-widest py-1.5">MARK-7X9K</div>
                    <div className="flex justify-between text-[6px] font-mono text-zinc-500">
                      <span>STORAGE: 100% SECURE</span>
                      <span>EXPIRES: 7 DAYS</span>
                    </div>
                  </div>
                </div>

                {/* Step 3: Instant Loader */}
                <div className="p-6 rounded-2xl bg-[#0a0a0f]/60 border border-slate-800/80 space-y-4 light:bg-slate-50 light:border-slate-200">
                  <div className="w-9 h-9 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center justify-center font-mono font-bold text-xs">03</div>
                  <h3 className="font-display font-medium text-lg">Friends Fetch in One Click</h3>
                  <p className="text-xs text-slate-400 leading-relaxed light:text-slate-500">No email lists, complex credentials or accounts. Remotely located friends input your signature ID, and files load instantly.</p>
                  
                  {/* Visual Receiver Grid representation */}
                  <div className="flex gap-2 p-3 bg-zinc-950 border border-zinc-900 rounded-xl justify-center items-center">
                    <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center"><ImageIcon className="w-3.5 h-3.5 text-zinc-400" /></div>
                    <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center"><VideoIcon className="w-3.5 h-3.5 text-slate-400 animate-pulse" /></div>
                    <div className="w-8 h-8 rounded bg-blue-500 text-white flex items-center justify-center"><Download className="w-3.5 h-3.5" /></div>
                    <span className="text-[8px] font-mono text-zinc-400">DOWNLOADZIP (18.4MB)</span>
                  </div>
                </div>

              </div>

            </div>

            {/* HOW IT WORKS SECTION */}
            <div className="text-center space-y-12">
              <div className="space-y-4">
                <h2 className="font-display font-medium text-2xl sm:text-3xl">Architectured for Ultimate Simplicity</h2>
                <p className="text-slate-400 text-sm sm:text-base max-w-xl mx-auto light:text-slate-550">We stripped away registration forms, tedious links, spam emails, and pixel optimization toggles.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
                
                <div className="p-6 rounded-2xl bg-[#111118] border border-[#1e1e2e] space-y-3 light:bg-white light:border-slate-200">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-500 flex items-center justify-center">
                    <Zap className="w-5 h-5" />
                  </div>
                  <h4 className="font-semibold text-base">Instant Tunnel Routing</h4>
                  <p className="text-xs text-slate-400 leading-relaxed light:text-slate-500">Files stream straight from high-bandwidth nodes directly into high-fidelity recipient browsers.</p>
                </div>

                <div className="p-6 rounded-2xl bg-[#111118] border border-[#1e1e2e] space-y-3 light:bg-white light:border-slate-200">
                  <div className="w-10 h-10 rounded-xl bg-cyan-600/10 text-cyan-500 flex items-center justify-center">
                    <Cloud className="w-5 h-5" />
                  </div>
                  <h4 className="font-semibold text-base">100% Original Resolution</h4>
                  <p className="text-xs text-slate-400 leading-relaxed light:text-slate-500">Zero transcoding or pixel conversion. Professional videographers share Apple ProRes workflows with total security.</p>
                </div>

                <div className="p-6 rounded-2xl bg-[#111118] border border-[#1e1e2e] space-y-3 light:bg-white light:border-slate-200">
                  <div className="w-10 h-10 rounded-xl bg-violet-600/10 text-violet-500 flex items-center justify-center">
                    <QrCode className="w-5 h-5" />
                  </div>
                  <h4 className="font-semibold text-base">QR Signature Code</h4>
                  <p className="text-xs text-slate-400 leading-relaxed light:text-slate-500">Auto-generated beautifully printed vector QR graphics. Download instantly to share on Instagram and social handles.</p>
                </div>

                <div className="p-6 rounded-2xl bg-[#111118] border border-[#1e1e2e] space-y-3 light:bg-white light:border-slate-200">
                  <div className="w-10 h-10 rounded-xl bg-teal-600/10 text-teal-500 flex items-center justify-center">
                    <Lock className="w-5 h-5" />
                  </div>
                  <h4 className="font-semibold text-base">Pro Protection Mode</h4>
                  <p className="text-xs text-slate-400 leading-relaxed light:text-slate-500">Enable customized password security, track dynamic viewing statistics, and choose branded, vanity Custom IDs.</p>
                </div>

              </div>
            </div>

            {/* PRICING PLANS SECTION */}
            <div className="space-y-12">
              <div className="text-center space-y-4">
                <span className="text-xs font-mono py-1 px-3.5 rounded bg-[#06b6d4]/10 text-cyan-400 border border-[#06b6d4]/20 uppercase">PRICING TIERS</span>
                <h2 className="font-display font-bold text-3xl sm:text-4xl">One plan for casual sharing. One for professionals.</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto items-stretch">
                
                {/* FREE PLAN */}
                <div className="rounded-3xl bg-[#111118]/85 border border-[#1e1e2e] p-8 flex flex-col justify-between space-y-8 relative overflow-hidden light:bg-white light:border-slate-200">
                  <div className="space-y-4">
                    <div className="text-xs font-mono text-slate-400">Casual User</div>
                    <h3 className="font-display font-medium text-2xl text-white light:text-slate-900">DropID Free</h3>
                    <div className="text-3xl font-display font-bold text-white light:text-slate-900">$0<span className="text-xs text-slate-400 font-normal"> / forever</span></div>
                    <p className="text-xs text-slate-400 light:text-slate-500">Perfect for sharing raw phone photos, quick text files, and homework assignments with family.</p>
                    
                    <ul className="space-y-2.5 text-xs text-slate-300 pt-4 border-t border-slate-800/80 light:text-slate-650 light:border-slate-200">
                      <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Permanent generated signature ID</li>
                      <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> 2GB storage capacity allocation</li>
                      <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Max 50 storage folder limits</li>
                      <li className="flex items-center gap-2 text-red-400"><X className="w-4 h-4" /> Files automatically expire in 7 days</li>
                      <li className="flex items-center gap-2 text-red-400"><X className="w-4 h-4" /> Custom branded signature ID name (Pro-only)</li>
                    </ul>
                  </div>

                  <button
                    onClick={session ? () => setView("dashboard") : handleGoogleLogin}
                    className="w-full py-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-850 text-white text-xs font-semibold tracking-wider transition-all light:bg-slate-100 light:border-slate-200 light:text-slate-900 light:hover:bg-slate-150 cursor-pointer text-center"
                  >
                    {session ? "Access Free Dashboard" : "Get Free ID Now"}
                  </button>
                </div>

                {/* PRO PLAN */}
                <div className="rounded-3xl bg-gradient-to-br from-[#121226] to-[#0d0d16] border-2 border-blue-600/80 p-8 flex flex-col justify-between space-y-8 relative overflow-hidden shadow-2xl shadow-blue-600/10 dark:from-[#111122] dark:to-[#0c0c16]">
                  <div className="absolute top-0 right-0 bg-blue-500 text-white font-mono text-[9px] font-bold py-1 px-3 uppercase rounded-bl-xl tracking-wider flex items-center gap-1 shadow-lg shadow-blue-500/20">
                    <Sparkles className="w-3 h-3 animate-spin" />
                    RECOMMENDED
                  </div>

                  <div className="space-y-4">
                    <div className="text-xs font-mono text-blue-400 flex items-center gap-1">
                      <Award className="w-3.5 h-3.5 text-blue-500" />
                      Professional & Creative Teams
                    </div>
                    <h3 className="font-display font-medium text-2xl text-transparent bg-clip-text bg-gradient-to-r from-white to-blue-300">DropID Pro</h3>
                    <div className="text-3xl font-display font-bold">$9<span className="text-xs text-slate-400 font-normal"> / month (Billed Yearly)</span></div>
                    <p className="text-xs text-slate-350">The ultimate workspace tool loved by professional DSLR photographers, videographers, and premium content creators.</p>
                    
                    <ul className="space-y-2.5 text-xs text-slate-200 pt-4 border-t border-white/5">
                      <li className="flex items-center gap-2"><Check className="w-4 h-4 text-blue-500" /> Custom signature ID (e.g. JOHN instead of JOHN-7X9K)</li>
                      <li className="flex items-center gap-2"><Check className="w-4 h-4 text-blue-500" /> 100GB persistent file server space</li>
                      <li className="flex items-center gap-2"><Check className="w-4 h-4 text-blue-500" /> Files never expire (persist forever)</li>
                      <li className="flex items-center gap-2"><Check className="w-4 h-4 text-blue-500" /> Secure password protected lock links</li>
                      <li className="flex items-center gap-2"><Check className="w-4 h-4 text-blue-500" /> Pro Analytics (real-time view & download graphs)</li>
                      <li className="flex items-center gap-2"><Check className="w-4 h-4 text-blue-500" /> Premium priority upload tunnels and speed</li>
                    </ul>
                  </div>

                  <button
                    onClick={profile ? handleTogglePlan : handleGoogleLogin}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 hover:scale-[1.01] text-white text-xs font-semibold tracking-wider transition-all shadow-lg shadow-blue-500/20 hover:shadow-cyan-500/10 cursor-pointer text-center"
                  >
                    {profile ? (profile.plan === "pro" ? "Downgrade (Toggle Plan)" : "Upgrade Instantly to Pro") : "Upgrade to Pro"}
                  </button>
                </div>

              </div>
            </div>

          </div>
        )}

        {/* --- 2. DASHBOARD VIEW --- */}
        {view === "dashboard" && profile && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* LEFT PROFILE CARD & STATS COLUMN (lg:col-span-4) */}
            <div className="lg:col-span-4 space-y-8">
              
              {/* TITANIUM PREMIUM PLAN ID CARD */}
              <div className="relative group">
                <div className={`absolute -inset-1.5 rounded-3xl bg-gradient-to-r ${profile.plan === "pro" ? "from-[#3b82f6] to-[#06b6d4]" : "from-slate-700 to-zinc-800"} opacity-70 blur-md group-hover:opacity-100 transition duration-1000 group-hover:duration-200`} />
                
                {/* ID Card Graphic Wrapper */}
                <div className="relative rounded-2xl bg-gradient-to-br from-[#1e1e2e] to-[#0a0a0f] p-6 text-white overflow-hidden shadow-2xl border border-white/10 select-none cursor-pointer shimmer-overlay">
                  {/* Holographic lines backdrop */}
                  <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none" />
                  
                  {/* Card Front Top */}
                  <div className="flex justify-between items-start mb-10 relative z-10">
                    <div>
                      <div className="text-[10px] font-mono tracking-widest text-slate-400 font-bold uppercase">DROPID DIRECT MEMBER CARD</div>
                      <div className="text-[8px] font-mono text-cyan-400 mt-0.5 tracking-wider">SECURE DIGITAL CHIP CODES</div>
                    </div>
                    {profile.plan === "pro" ? (
                      <span className="font-mono text-[9px] bg-blue-500/25 border border-blue-500/40 text-blue-400 dark:bg-blue-500/30 font-bold py-0.5 px-2.5 rounded-full flex items-center gap-1 shadow-md shadow-blue-500/10">
                        <Award className="w-3 h-3 animate-pulse text-blue-400" />
                        PRO PLAN
                      </span>
                    ) : (
                      <span className="font-mono text-[9px] bg-slate-800 border border-slate-700 text-slate-350 py-0.5 px-2.5 rounded-full">
                        FREE MEMBER
                      </span>
                    )}
                  </div>

                  {/* Card Unique ID Label (The Hero Display) */}
                  <div className="space-y-1 my-6 relative z-10">
                    <div className="text-[8px] font-mono text-slate-500 uppercase tracking-widest">PERSONAL IDENTITY IDENTIFIER</div>
                    <div className="text-3xl font-display font-extrabold tracking-widest text-[#06b6d4] drop-shadow-md">
                      {profile.uniqueId}
                    </div>
                  </div>

                  {/* Card Bottom Panel */}
                  <div className="flex justify-between items-end pt-4 border-t border-white/5 relative z-10">
                    <div>
                      <div className="text-[7px] font-mono text-slate-500 uppercase tracking-wider">AUTHORIZED ACCOUNT HOLDER</div>
                      <div className="text-xs font-mono font-medium truncate max-w-[150px]" title={profile.email}>{profile.email}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[7px] font-mono text-slate-500 uppercase tracking-wider">EXPIRATION CODE</div>
                      <div className="text-[10px] font-mono font-medium text-amber-400">
                        {profile.plan === "pro" ? "NEVER EXPIRES" : "7 DAYS (AUTO)"}
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* CARD UTILITY QUICK BUTTONS */}
              <div className={`p-4 rounded-2xl border ${theme === "dark" ? "bg-[#111118] border-[#1e1e2e]" : "bg-white border-slate-200"}`}>
                <div className="grid grid-cols-2 gap-3.5">
                  <button
                    onClick={() => copyToClipboard(profile.uniqueId, "card-id")}
                    className="flex flex-col items-center justify-center p-3 text-center rounded-xl bg-[#0a0a0f]/40 border border-[#1e1e2e] hover:bg-[#3b82f6]/10 hover:border-[#3b82f6]/30 transition-all gap-1.5 cursor-pointer light:bg-slate-50 light:border-slate-200"
                  >
                    {copiedStates["card-id"] ? <Check className="w-5.5 h-5.5 text-blue-500 animate-bounce" /> : <Copy className="w-5.5 h-5.5 text-slate-400" />}
                    <span className="text-[10px] font-mono font-bold uppercase text-slate-400">Copy My ID</span>
                  </button>
                  <button
                    onClick={() => copyToClipboard(getShareLinkString(profile.uniqueId), "card-link")}
                    className="flex flex-col items-center justify-center p-3 text-center rounded-xl bg-[#0a0a0f]/40 border border-[#1e1e2e] hover:bg-[#06b6d4]/10 hover:border-[#06b6d4]/30 transition-all gap-1.5 cursor-pointer light:bg-slate-50 light:border-slate-200"
                  >
                    {copiedStates["card-link"] ? <Check className="w-5.5 h-5.5 text-[#06b6d4] animate-bounce" /> : <Share2 className="w-5.5 h-5.5 text-slate-400" />}
                    <span className="text-[10px] font-mono font-bold uppercase text-slate-400">Copy URL Link</span>
                  </button>
                </div>

                <div className="mt-4 pt-4 border-t border-[#1e1e2e] flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-mono">Simulated QR Code Card:</span>
                  <button
                    onClick={() => setShowQrModal(true)}
                    className="text-[10px] font-medium text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    Expand QR Image
                  </button>
                </div>
              </div>

              {/* STORAGE METRIC Animated Bar */}
              <div className={`p-6 rounded-2xl border ${theme === "dark" ? "bg-[#111118] border-[#1e1e2e]" : "bg-white border-slate-200"} space-y-4`}>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Cloud className="w-5 h-5 text-blue-500 animate-pulse" />
                    <span className="font-semibold text-sm">Storage usage indicator</span>
                  </div>
                  <span className="text-xs font-mono font-semibold">
                    {formatBytes(stats.totalSize)} / {formatBytes(stats.storageLimit)}
                  </span>
                </div>

                {/* Simulated Meter */}
                <div className="w-full bg-slate-905 h-3.5 rounded-full overflow-hidden border border-white/5 relative light:bg-slate-100">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (stats.totalSize / stats.storageLimit) * 100)}%` }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                    className={`h-full rounded-full bg-gradient-to-r ${profile.plan === "pro" ? "from-blue-600 via-cyan-500 to-indigo-500" : "from-blue-600 to-cyan-500"}`}
                  />
                </div>

                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>USED CAPACITY: {((stats.totalSize / stats.storageLimit) * 100).toFixed(1)}%</span>
                  <span>SLOTS LOADED: {stats.totalFiles}</span>
                </div>

                {profile.plan === "free" && (
                  <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/25 text-[11px] text-orange-400 leading-relaxed">
                    <strong>Attention:</strong> You are currently utilizing the Free tunnel directory. Upgrading instantly unlocks 100GB space.
                  </div>
                )}
              </div>

              {/* ANALYTICS CARD VIEW */}
              <div className={`p-6 rounded-2xl border ${theme === "dark" ? "bg-[#111118] border-[#1e1e2e]" : "bg-white border-slate-200"} space-y-4`}>
                <div className="flex justify-between items-center border-b border-[#1e1e2e] pb-3 light:border-slate-200">
                  <span className="font-semibold text-sm flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-cyan-400" />
                    Tunnel Traffic Analytics
                  </span>
                  {profile.plan === "pro" ? (
                    <span className="text-[10px] font-mono text-cyan-400">TRACKING REALTIME</span>
                  ) : (
                    <span className="text-[10px] font-mono text-slate-550 border border-dashed rounded px-1.5 max-h-[18px]">PRO UPGRADE</span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#0a0a0f]/60 p-3 rounded-xl border border-[#1e1e2e] light:bg-slate-50 light:border-slate-250">
                    <div className="text-[9px] font-mono text-slate-500">AGGREGATE VIEW COUNT</div>
                    <div className="text-2xl font-bold font-display mt-1 text-[#06b6d4]">
                      {profile.plan === "pro" ? stats.viewsCount : "⚠️ PRO ONLY"}
                    </div>
                  </div>
                  <div className="bg-[#0a0a0f]/60 p-3 rounded-xl border border-[#1e1e2e] light:bg-slate-50 light:border-slate-250">
                    <div className="text-[9px] font-mono text-slate-500">TOTAL TRANSFERS</div>
                    <div className="text-2xl font-bold font-display mt-1 text-blue-500">
                      {profile.plan === "pro" ? stats.totalFiles : "⚠️ PRO ONLY"}
                    </div>
                  </div>
                </div>

                {/* Custom Graph Display */}
                {profile.plan === "pro" ? (
                  <div className="space-y-3.5 pt-2">
                    <span className="text-[10px] font-mono text-slate-400">WEEKLY TRANSFERS RATIO GRAPH</span>
                    <div className="h-20 flex items-end gap-2 pt-2 border-b border-l border-[#1e1e2e] pl-2">
                      <div className="bg-blue-600 w-full rounded-t hover:bg-blue-500 transition-colors cursor-pointer" style={{ height: "40%" }} title="Monday: 12 files" />
                      <div className="bg-[#06b6d4] w-full rounded-t hover:bg-cyan-400 transition-colors cursor-pointer" style={{ height: "65%" }} title="Tuesday: 18 files" />
                      <div className="bg-blue-600 w-full rounded-t" style={{ height: "35%" }} />
                      <div className="bg-indigo-600 w-full rounded-t" style={{ height: "80%" }} />
                      <div className="bg-[#06b6d4] w-full rounded-t" style={{ height: "95%" }} />
                      <div className="bg-blue-600 w-full rounded-t" style={{ height: "20%" }} />
                      <div className="bg-zinc-850 w-full rounded-t" style={{ height: "5%" }} />
                    </div>
                    <div className="flex justify-between text-[8px] font-mono text-zinc-500">
                      <span>MON</span>
                      <span>WED</span>
                      <span>SAT</span>
                      <span>SUN</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-xs text-slate-400 italic">
                    Upgrade to DropID Pro to unlock full weekly download trackers and real-time viewing logs.
                  </div>
                )}
              </div>

              {/* PREMIUM MANAGE CUSTOM VANITY ID */}
              <div className={`p-6 rounded-2xl border ${theme === "dark" ? "bg-[#111118] border-[#1e1e2e]" : "bg-white border-slate-200"} space-y-4`}>
                <div className="flex items-center gap-2">
                  <Settings className="w-4.5 h-4.5 text-blue-500" />
                  <span className="font-semibold text-sm">Personal Signature Settings</span>
                </div>

                {profile.plan === "pro" ? (
                  <form onSubmit={handleSaveCustomId} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-slate-400">VANITY CUSTOM SIGNATURE ID</label>
                      <input
                        type="text"
                        placeholder="e.g. JOHN"
                        value={customIdInput}
                        onChange={(e) => setCustomIdInput(e.target.value.toUpperCase())}
                        className="w-full bg-[#0a0a0f] border border-slate-800 rounded-xl px-3 py-2 text-sm font-mono text-cyan-400 uppercase outline-none focus:border-blue-500"
                      />
                      {customIdError && (
                        <div className="text-[10px] font-semibold text-red-500">{customIdError}</div>
                      )}
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2 px-4 rounded-xl bg-blue-600 text-white font-semibold text-xs transition-transform tracking-wider uppercase hover:bg-blue-500 active:scale-95 cursor-pointer"
                    >
                      Apply Custom ID
                    </button>
                  </form>
                ) : (
                  <div className="space-y-3 pt-2">
                    <div className="text-xs text-slate-400 font-medium">Vanity Custom IDs are a Pro premium feature.</div>
                    <button
                      onClick={handleTogglePlan}
                      className="w-full py-2.5 px-4 rounded-xl bg-orange-600 text-white font-semibold text-xs tracking-wider transition-all uppercase flex items-center justify-center gap-1.5 cursor-pointer shadow hover:bg-orange-500"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      Switch Plan for Custom ID
                    </button>
                  </div>
                )}
              </div>

            </div>

            {/* RIGHT FILE MANAGEMENT & UPLOAD MATRIX (lg:col-span-8) */}
            <div className="lg:col-span-8 space-y-8">
              
              {/* STUNNING PREMIUM UPLOAD DRAGZONE */}
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-3xl p-10 text-center cursor-pointer transition-all duration-300 overflow-hidden ${
                  dragActive 
                    ? "border-blue-500 bg-blue-500/10 scale-[1.01] shadow-2xl shadow-blue-500/10" 
                    : theme === "dark" 
                      ? "border-slate-800 bg-[#111118]/45 hover:border-blue-500/40 hover:bg-[#111118]/70" 
                      : "border-slate-205 bg-white hover:border-blue-500/40 hover:bg-slate-50"
                }`}
              >
                {/* Embedded backdrop lights during active dragging */}
                {dragActive && (
                  <div className="absolute inset-0 pointer-events-none flex justify-center items-center opacity-40">
                    <div className="w-64 h-64 bg-gradient-to-tr from-blue-600 to-cyan-500 filter blur-3xl rounded-full" />
                  </div>
                )}

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  multiple
                  className="hidden"
                />

                <div className="space-y-5 relative z-10 select-none">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white mx-auto shadow-lg shadow-blue-500/20">
                    <Upload className={`w-8 h-8 ${dragActive ? "animate-bounce" : ""}`} />
                  </div>

                  <div className="space-y-1">
                    <h3 className="font-display font-semibold text-xl tracking-wide">
                      Drag files here or <span className="text-blue-500 font-bold hover:underline">browse computer</span>
                    </h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed light:text-slate-505">
                      Drop high-resolution photographs, videos, documents, or multiple archives instantly. {profile.plan === "pro" ? "Unlimited bandwidth active." : "Max 2GB per upload slot."}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2.5">
                    <div className="inline-flex items-center gap-2 py-1 px-3 rounded-full bg-slate-900 border border-slate-800 text-[10px] font-mono text-[#06b6d4] uppercase light:bg-slate-50 light:border-slate-200">
                      <Sparkles className="w-3.5 h-3.5" />
                      Zero Quality loss fully guaranteed
                    </div>
                    <div className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full bg-[#1e1e2e]/55 border border-[#1e1e2e] text-[10px] font-mono text-slate-450 uppercase">
                      <span className="bg-slate-950 px-1 py-0.5 rounded text-[9px] text-[#06b6d4] font-bold">Ctrl + U</span>
                      <span>Instant Browse</span>
                    </div>
                  </div>
                </div>

                {/* Upload speed loading screen */}
                {isUploading && (
                  <div className="absolute inset-0 bg-[#0a0a0f]/95 backdrop-blur-md flex flex-col justify-center items-center p-8 z-25">
                    <div className="w-full max-w-md space-y-6">
                      
                      <div className="flex justify-between items-end">
                        <div className="text-left">
                          <span className="text-xs font-mono text-[#06b6d4] tracking-widest block font-bold uppercase">HIGH-SPEED SYNC CHANNEL</span>
                          <span className="text-sm font-semibold truncate block mt-1">Uploading your selected original assets...</span>
                        </div>
                        <span className="text-xs font-mono font-bold text-amber-400">{uploadProgress}%</span>
                      </div>

                      {/* Bar indicator */}
                      <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden border border-white/5 relative">
                        <div
                          className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full rounded-full transition-all duration-150"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div className="bg-[#111118] p-3 rounded-xl border border-white/5">
                          <div className="text-[8px] font-mono text-slate-500">TRANSFER SPEED</div>
                          <div className="text-xs font-mono font-bold text-slate-200 mt-1">{uploadSpeed.toFixed(1)} MB/s</div>
                        </div>
                        <div className="bg-[#111118] p-3 rounded-xl border border-white/5">
                          <div className="text-[8px] font-mono text-slate-500">BYTES UPLOADED</div>
                          <div className="text-xs font-mono font-bold text-slate-200 mt-1">{formatBytes(uploadedBytes)}</div>
                        </div>
                        <div className="bg-[#111118] p-3 rounded-xl border border-white/5">
                          <div className="text-[8px] font-mono text-slate-500">TOTAL DIRECT SIZE</div>
                          <div className="text-xs font-mono font-bold text-slate-200 mt-1">{formatBytes(totalUploadBytes)}</div>
                        </div>
                      </div>

                    </div>
                  </div>
                )}
              </div>

              {/* ALBUM COLLECTIONS VIEW */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-mono text-[#06b6d4] tracking-wider uppercase font-semibold">Albums & Collections</span>
                  <button
                    onClick={() => setIsCreatingCollection(!isCreatingCollection)}
                    className="text-xs text-blue-500 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    Create Album
                  </button>
                </div>

                {isCreatingCollection && (
                  <form onSubmit={handleCreateCollection} className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex gap-2 light:bg-slate-50 light:border-slate-200">
                    <input
                      type="text"
                      placeholder="e.g. Wedding Raw Capture, Backup July"
                      value={newCollectionName}
                      onChange={(e) => setNewCollectionName(e.target.value)}
                      className="flex-1 bg-black text-xs rounded-lg px-3 py-2 border border-slate-800 text-white outline-none focus:border-blue-500 light:bg-white light:text-slate-900 light:border-slate-200"
                      required
                    />
                    <button
                      type="submit"
                      className="py-2 px-4 rounded-lg bg-blue-600 text-white font-semibold text-xs cursor-pointer"
                    >
                      Save Album
                    </button>
                  </form>
                )}

                <div className="flex flex-wrap gap-2.5">
                  <button
                    onClick={() => setSelectedCollectionId(null)}
                    className={`py-1.5 px-3.5 rounded-full text-xs font-medium cursor-pointer border transition-colors ${
                      selectedCollectionId === null
                        ? "bg-blue-600 text-white border-transparent"
                        : "bg-slate-900/50 border-slate-800 text-slate-400 hover:bg-slate-900 light:bg-white light:border-slate-200"
                    }`}
                  >
                    All Shared Files ({files.length})
                  </button>
                  {collections.map((col) => (
                    <div key={col.id} className="inline-flex items-center rounded-full overflow-hidden border border-slate-800 light:border-slate-200">
                      <button
                        onClick={() => setSelectedCollectionId(col.id)}
                        className={`py-1.5 pl-3.5 pr-2 text-xs font-medium cursor-pointer transition-colors ${
                          selectedCollectionId === col.id
                            ? "bg-blue-600 text-white"
                            : "bg-slate-900/50 text-slate-400 hover:bg-slate-905 light:bg-white"
                        }`}
                      >
                        {col.name} ({files.filter(f => f.collectionId === col.id).length})
                      </button>
                      <button
                        onClick={() => handleDeleteCollection(col.id)}
                        className="p-1 px-2.5 bg-slate-950 border-l border-slate-800 hover:bg-red-950 hover:text-red-400 transition-colors cursor-pointer text-slate-500 h-full light:bg-slate-100轻"
                        title="Delete collection"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* FILES GRID PERSISTENCE VIEW */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-mono text-[#06b6d4] tracking-wider uppercase font-semibold">Shared Cloud Gallery</span>
                  <div className="flex gap-2">
                    {files.length > 0 && (
                      <button
                        onClick={downloadAllAsZip}
                        className="text-xs bg-slate-900 border border-slate-800 hover:bg-slate-850 py-1.5 px-3 rounded-lg flex items-center gap-1.5 text-blue-400 font-medium cursor-pointer light:bg-white light:border-slate-200"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download all as Zip
                      </button>
                    )}
                  </div>
                </div>

                {zipProgress && (
                  <div className="p-3 bg-blue-500/15 border border-blue-500/20 rounded-xl text-xs text-blue-400 font-mono">
                    ⏳ {zipProgress}
                  </div>
                )}

                {/* Filter files based on selection */}
                {(() => {
                  const filteredFiles = selectedCollectionId 
                    ? files.filter(f => f.collectionId === selectedCollectionId)
                    : files;

                  if (filteredFiles.length === 0) {
                    return (
                      <div className="p-16 text-center border-2 border-dashed border-slate-900 rounded-3xl space-y-3 dark:border-slate-950 light:border-slate-150">
                        <div className="w-12 h-12 bg-slate-900 text-slate-500 rounded-full flex items-center justify-center mx-auto light:bg-slate-100">
                          <ImageIcon className="w-6 h-6" />
                        </div>
                        <h4 className="font-semibold text-slate-350">No files uploaded yet</h4>
                        <p className="text-xs text-slate-500 max-w-xs mx-auto">Drop raw documents or photos above. High-frequency uploads will populate here immediately with direct download triggers.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {filteredFiles.map((file) => {
                        const isImg = file.type.startsWith("image/");
                        const isVid = file.type.startsWith("video/");

                        return (
                          <div
                            key={file.id}
                            className={`group relative rounded-2xl border overflow-hidden transition-all duration-300 hover:scale-[1.02] flex flex-col justify-between ${
                              theme === "dark" ? "bg-[#111118] border-[#1e1e2e] hover:border-[#3b82f6]/50" : "bg-white border-slate-200 hover:border-slate-400"
                            }`}
                          >
                            {/* Graphic preview frame */}
                            <div className="relative aspect-video bg-[#0a0a0f] flex items-center justify-center overflow-hidden border-b border-[#1e1e2e] light:border-slate-150 group-hover:bg-black/9 overflow-hidden">
                              {isImg ? (
                                <img
                                  src={file.url}
                                  alt={file.name}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                  loading="lazy"
                                />
                              ) : isVid ? (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <video src={file.url} className="w-full h-full object-cover" controls={false} muted loop playsInline />
                                  <div className="absolute bg-black/60 p-2.5 rounded-full">
                                    <Play className="w-5 h-5 text-white fill-white" />
                                  </div>
                                </div>
                              ) : (
                                <div className="p-4 text-center">
                                  <FileIcon className="w-10 h-10 text-cyan-500 mx-auto mb-1 animate-pulse" />
                                  <span className="text-[10px] font-mono text-slate-400 block truncate max-w-[150px]">{file.name.split(".").pop()?.toUpperCase()} Document</span>
                                </div>
                              )}

                              {/* Hover Overlay triggers */}
                              <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2.5 transition-opacity duration-200">
                                <button
                                  onClick={() => setFullscreenPreview(file)}
                                  className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white shadow font-medium text-xs flex items-center gap-1 cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  Preview Raw
                                </button>
                                <a
                                  href={file.url}
                                  download={file.name}
                                  className="p-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow font-medium text-xs flex items-center gap-1 cursor-pointer"
                                  title="Original quality download"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  Download
                                </a>
                              </div>
                            </div>

                            {/* Info block */}
                            <div className="p-3.5 space-y-1">
                              <div className="text-xs font-semibold truncate text-[#f8fafc] dark:text-[#f8fafc] light:text-slate-900" title={file.name}>
                                {file.name}
                              </div>
                              <div className="flex justify-between items-center text-[10px] font-mono text-slate-500">
                                <span>{formatBytes(file.size)}</span>
                                <span className="flex items-center gap-1">
                                  <Download className="w-3 h-3" />
                                  {file.downloadsCount}
                                </span>
                              </div>
                            </div>

                            {/* Settings buttons row */}
                            <div className="px-3 py-2 border-t border-slate-900/60 flex justify-between items-center bg-[#0d0d12]/50 light:bg-slate-50 light:border-slate-150">
                              <span className="text-[9px] font-mono text-slate-550 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Expires: {file.expiresAt ? new Date(file.expiresAt).toLocaleDateString() : "Never (Pro)"}
                              </span>
                              <button
                                onClick={() => handleDeleteFile(file.id)}
                                className="p-1 text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                                title="Delete file"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

              </div>

            </div>

          </div>
        )}

        {/* --- 3. STANDALONE RECEIVER / FRIEND RETRIEVAL VIEW --- */}
        {view === "receiver" && (
          <div className="max-w-4xl mx-auto space-y-8 pt-6">
            
            {/* BACK BUTTON TO LANDING */}
            <div className="flex justify-between items-center">
              <button
                onClick={() => setView("landing")}
                className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                ← Back to Homepage
              </button>
              
              <span className="text-xs font-mono py-1 px-3.5 rounded bg-zinc-900 text-slate-400 border border-zinc-805">
                TUNNEL ID: {receiverId || "NULL"}
              </span>
            </div>

            {/* Error state */}
            {receiverError && (
              <div className="p-8 rounded-3xl bg-red-650/10 border border-red-500/20 text-center space-y-4">
                <div className="text-red-500 text-3xl">⚠️</div>
                <h3 className="font-display font-medium text-xl">Identity Code Expired or Unrecognized</h3>
                <p className="text-xs text-slate-405 max-w-sm mx-auto leading-relaxed">
                  We could not map tunnel ID "<strong>{receiverId}</strong>" to any active user files. It may have passed the 7-day expiration boundary limit, or is misspelled.
                </p>
                <button
                  onClick={() => setView("landing")}
                  className="py-2 px-5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-white hover:bg-slate-850 cursor-pointer"
                >
                  Return to Home
                </button>
              </div>
            )}

            {/* Loading state */}
            {receiverLoading && (
              <div className="p-16 text-center space-y-4 border border-zinc-900/60 rounded-3xl bg-[#111118]/25">
                <div className="mx-auto w-10 h-10 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <h4 className="font-mono text-xs tracking-widest text-[#06b6d4] uppercase">INTERCONNECTING SPEED TUNNEL</h4>
                <p className="text-xs text-slate-500">Synchronizing pipeline structures, verifying original pixel parameters...</p>
              </div>
            )}

            {/* PASSWORD PROTECTION DIALOG MOCK FOR PRO */}
            {passwordRequired && !enteredPasswordCorrect && receiverData && (
              <div className="p-10 rounded-3xl bg-[#111118] border border-[#1e1e2e] space-y-6 text-center max-w-md mx-auto relative overflow-hidden shadow-2xl">
                <div className="absolute top-0 right-0 p-3 bg-amber-500/10 border-b border-l border-white/5 rounded-bl-xl text-amber-500 font-mono text-[9px] tracking-wider uppercase">PASSWORD LOCKED</div>
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
                  <Lock className="w-6 h-6 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-display font-semibold text-lg text-white">This DropID Tunnel is password-locked</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Account <strong>{receiverData.ownerName}</strong> utilized the premium Pro locker security. Please verify the code below.
                  </p>
                </div>
                <div className="space-y-3">
                  <input
                    type="password"
                    placeholder="Enter Shared Password (Simulate with: pro123)"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    className="w-full text-center bg-[#0a0a0f] border border-slate-800 rounded-xl py-3 px-4 font-mono text-sm tracking-widest text-cyan-400 outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={() => {
                      if (passwordInput === "pro123") {
                        setEnteredPasswordCorrect(true);
                      } else {
                        alert("Incorrect password. Please use: pro123 to simulate dynamic unlocking.");
                      }
                    }}
                    className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold text-xs tracking-wider uppercase text-white cursor-pointer"
                  >
                    Unlock and Connect Tunnel
                  </button>
                  <p className="text-[9px] font-mono text-zinc-500 text-center uppercase">PRO DEMONSTRATION PASSWORD: pro123</p>
                </div>
              </div>
            )}

            {/* Standalone Receiver load success view */}
            {receiverData && enteredPasswordCorrect && (
              <div className="space-y-8 animate-fade-in">
                
                {/* RECEIVER HEADER BANNER */}
                <div className="p-6 sm:p-10 rounded-3xl bg-[#111118]/80 border border-[#1e1e2e] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 relative shadow-2xl light:bg-white light:border-slate-200">
                  <div className="space-y-3">
                    <span className="text-[10px] font-mono text-blue-400 tracking-wider uppercase flex items-center gap-1.5 font-bold">
                      <Sparkles className="w-3.5 h-3.5 animate-spin text-blue-400" />
                      SECURE CONNECTION SYSTEM ACTIVE
                    </span>
                    <h2 className="font-display font-semibold text-2xl sm:text-3xl text-white light:text-slate-900">
                      Files from <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-cyan-400 font-extrabold">{receiverData.ownerName}</span>
                    </h2>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-lg light:text-slate-500">
                      These original files have been synchronized at <strong>100% resolution with zero compression loss</strong>. This tunnel is verified and fully monitored.
                    </p>
                  </div>

                  <div className="flex sm:flex-col items-stretch gap-2 w-full sm:w-auto">
                    {receiverData.files.length > 0 && (
                      <button
                        onClick={downloadAllAsZip}
                        className="flex-1 sm:flex-none py-3 px-5 rounded-xl bg-blue-600 text-white hover:bg-blue-500 font-semibold text-xs tracking-wider uppercase transition-transform hover:scale-[1.01] flex items-center justify-center gap-1.5 shadow-lg shadow-blue-600/10 cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        Download all as Zip
                      </button>
                    )}
                    
                    <span className="text-[10px] font-mono text-zinc-550 text-center py-1 bg-black/15 border border-white/5 rounded px-2">
                      AGGREGATE LOG VIEWS: {receiverData.analytics.viewsCount}
                    </span>
                  </div>
                </div>

                {zipProgress && (
                  <div className="p-4 bg-cyan-500/15 border border-[#06b6d4]/20 rounded-xl text-xs text-cyan-400 font-mono">
                    ⏳ {zipProgress}
                  </div>
                )}

                {/* RECEIVER MASONRY GALLERY */}
                {receiverData.files.length === 0 ? (
                  <div className="p-16 border-2 border-dashed border-[#1e1e2e] rounded-3xl text-center space-y-3">
                    <Cloud className="w-12 h-12 text-slate-600 mx-auto animate-pulse" />
                    <h4 className="font-semibold text-slate-400">Empty gallery slot</h4>
                    <p className="text-xs text-slate-500">Account {receiverData.ownerName} has no files currently mapped. Tell them to drag files onto their signature dashboard.</p>
                  </div>
                ) : (
                  <div className="masonry-grid">
                    {receiverData.files.map((file) => {
                      const isImg = file.type.startsWith("image/");
                      const isVid = file.type.startsWith("video/");

                      return (
                        <div
                          key={file.id}
                          className={`group rounded-2xl border overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-blue-500/5 ${
                            theme === "dark" ? "bg-[#111118]/90 border-[#1e1e2e] hover:border-[#3b82f6]/50" : "bg-white border-slate-205 hover:border-slate-400"
                          }`}
                        >
                          {/* Photo Frame */}
                          <div className="relative aspect-video bg-[#0a0a0f] flex items-center justify-center overflow-hidden border-b border-[#1e1e2e] light:border-slate-150">
                            {isImg ? (
                              <img
                                src={file.url}
                                alt={file.name}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                loading="lazy"
                              />
                            ) : isVid ? (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <video src={file.url} className="w-full h-full object-cover" controls={false} muted playsInline loop />
                                <div className="absolute bg-black/60 p-2.5 rounded-full z-10">
                                  <Play className="w-5 h-5 text-white fill-white" />
                                </div>
                              </div>
                            ) : (
                              <div className="p-4 text-center">
                                <FileIcon className="w-10 h-10 text-cyan-400 mx-auto mb-1 animate-pulse" />
                                <span className="text-[10px] font-mono text-zinc-500 block uppercase font-semibold">{file.name.split(".").pop()} document</span>
                              </div>
                            )}

                            {/* Hover interactions */}
                            <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity duration-200">
                              <button
                                onClick={() => setFullscreenPreview(file)}
                                className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Preview
                              </button>
                              <a
                                href={file.url}
                                download={file.name}
                                className="p-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5" />
                                Save File
                              </a>
                            </div>
                          </div>

                          {/* Data block */}
                          <div className="p-4 flex flex-col justify-between">
                            <div className="text-xs font-semibold truncate text-[#f8fafc] dark:text-[#f8fafc] light:text-slate-900" title={file.name}>
                              {file.name}
                            </div>
                            <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 mt-2">
                              <span>{formatBytes(file.size)}</span>
                              <span className="text-amber-500 font-semibold uppercase">
                                {file.expiresAt ? `Expires: ${new Date(file.expiresAt).toLocaleDateString()}` : "Persistent Link"}
                              </span>
                            </div>
                          </div>

                        </div>
                      );
                    })}
                  </div>
                )}

              </div>
            )}

          </div>
        )}

      </main>

      {/* --- 4. FULLSCREEN LARGE IMAGE PREVIEW MODAL --- */}
      <AnimatePresence>
        {fullscreenPreview && (
          <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-50 flex flex-col justify-center items-center p-4">
            
            {/* Modal Close buttons */}
            <div className="absolute top-4 right-4 flex items-center gap-2">
              <span className="hidden sm:inline-flex text-[9px] font-mono tracking-widest text-slate-500 bg-[#0a0a0f] border border-white/5 px-2 py-1 rounded">ESC TO CLOSE</span>
              <button
                onClick={() => setFullscreenPreview(null)}
                className="p-2 bg-slate-900 text-white rounded-full hover:bg-slate-800 cursor-pointer animate-pulse"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="max-w-4xl w-full text-center space-y-4">
              
              <div className="max-h-[75vh] flex justify-center items-center overflow-hidden rounded-2xl bg-[#0a0a0f] border border-white/5 shadow-2xl relative">
                {fullscreenPreview.type.startsWith("image/") ? (
                  <img
                    src={fullscreenPreview.url}
                    alt={fullscreenPreview.name}
                    referrerPolicy="no-referrer"
                    className="max-h-[75vh] object-contain w-auto h-auto shadow-2xl"
                  />
                ) : fullscreenPreview.type.startsWith("video/") ? (
                  <video
                    src={fullscreenPreview.url}
                    controls
                    autoPlay
                    playsInline
                    className="max-h-[75vh] w-full shadow-2xl"
                  />
                ) : (
                  <div className="p-20 text-center space-y-4">
                    <FileIcon className="w-20 h-20 text-blue-500 mx-auto animate-bounce" />
                    <h3 className="font-display font-semibold text-lg text-white">Interactive Document Node</h3>
                    <p className="text-xs text-slate-400">Previews are configured strictly for image and video formats. Downloading provides direct access.</p>
                  </div>
                )}
              </div>

              {/* Info section below preview */}
              <div className="flex flex-col sm:flex-row justify-between items-center max-w-2xl mx-auto gap-4 p-4 rounded-xl border border-white/5 bg-slate-900/60 backdrop-blur">
                <div className="text-left">
                  <h4 className="text-xs font-semibold truncate max-w-[250px] text-white" title={fullscreenPreview.name}>
                    {fullscreenPreview.name}
                  </h4>
                  <p className="text-[10px] font-mono text-zinc-550 mt-0.5">SIZE: {formatBytes(fullscreenPreview.size)} | {fullscreenPreview.type}</p>
                </div>

                <div className="flex gap-2">
                  <a
                    href={fullscreenPreview.url}
                    download={fullscreenPreview.name}
                    className="py-1.5 px-4 rounded-lg bg-blue-600 text-white font-semibold text-xs tracking-wider uppercase hover:bg-blue-500 transition-colors cursor-pointer"
                  >
                    Download Original Code (100% Size)
                  </a>
                  <button
                    onClick={() => {
                      copyToClipboard(getShareLinkString(fullscreenPreview.userUniqueId), "modal-link");
                      alert("Direct share link copy succeeded!");
                    }}
                    className="py-1.5 px-4 rounded-lg bg-zinc-800 text-white text-xs font-semibold cursor-pointer"
                  >
                    Copy Link Block
                  </button>
                </div>
              </div>

            </div>

          </div>
        )}
      </AnimatePresence>

      {/* --- 5. QR CODE PREVIEW MODAL --- */}
      <AnimatePresence>
        {showQrModal && profile && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-[#111118] border border-[#1e1e2e] p-8 rounded-3xl text-center space-y-6 max-w-xs w-full relative">
              <div className="absolute top-3 right-3 flex items-center gap-1.5">
                <span className="hidden sm:inline-flex text-[8px] font-mono tracking-widest text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded border border-white/5">ESC Close</span>
                <button
                  onClick={() => setShowQrModal(false)}
                  className="p-1 rounded-full bg-slate-900 hover:bg-slate-800 text-slate-400 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <h3 className="font-display font-medium text-lg text-white">Your Premium QR Code Signature</h3>
              
              <div className="bg-white p-4.5 rounded-2xl inline-block shadow-2xl relative">
                {/* Hidden Canvas used for high density PNG downloads */}
                <QRCodeCanvas
                  id="qr-canvas"
                  value={getShareLinkString(profile.uniqueId)}
                  size={160}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="H"
                  includeMargin={false}
                />
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-mono text-slate-400">
                  SCAN CODE → INSTANT TACTILE LOADING
                </p>
                <p className="text-[11px] text-zinc-500 leading-relaxed font-sans">
                  Anyone can scan this graphic using native camera devices to instantly view and grab your shared files.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 pt-2">
                <button
                  onClick={downloadQrCodeImage}
                  className="py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold tracking-wider uppercase hover:bg-blue-500 cursor-pointer"
                >
                  Download PNG Graphic
                </button>
                <button
                  onClick={() => {
                    copyToClipboard(getShareLinkString(profile.uniqueId), "qr-link");
                    alert("Sustained share URL copied to clipboard.");
                  }}
                  className="py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-xs font-semibold border border-zinc-805 text-slate-300 cursor-pointer"
                >
                  Copy URL Route
                </button>
              </div>

            </div>
          </div>
        )}
      </AnimatePresence>

      {/* --- 6. SECURE MANUAL LOGIN DIALOG (TESTERS & DEMO VERIFICATION) --- */}
      <AnimatePresence>
        {showEmailLoginDialog && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-[#111118] border border-[#1e1e2e] p-8 rounded-3xl max-w-md w-full space-y-6 relative">
              <div className="absolute top-4 right-4 flex items-center gap-2">
                <span className="hidden sm:inline-flex text-[8px] font-mono tracking-widest text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded border border-white/5">ESC Close</span>
                <button
                  onClick={() => setShowEmailLoginDialog(false)}
                  className="p-1.5 rounded-full bg-slate-900 hover:bg-slate-850 text-slate-400 cursor-pointer"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>

              <div className="text-center space-y-2">
                <DropIdLogo size={48} className="mx-auto flex justify-center mb-2" />
                <h3 className="font-display font-semibold text-lg text-white">Sign In to DropID Platform</h3>
                <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                  Enter your email address to immediately generate your titanium personal member card ID and start uploading original files.
                </p>
              </div>

              {/* Developer tester email options */}
              <div className="bg-blue-600/10 border border-blue-500/20 p-3.5 rounded-xl space-y-1.5">
                <div className="text-[10px] font-mono text-blue-400 font-bold uppercase">DEVELOPER PRESETS (ONE-CLICK)</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const user = authService.signInManual("mark@gmail.com");
                      setSession(user);
                      syncUserProfile(user.email, user.uid);
                      setShowEmailLoginDialog(false);
                      setView("dashboard");
                    }}
                    className="flex-1 text-[10px] py-1 bg-zinc-950 hover:bg-zinc-850 rounded text-slate-300 transition-colors uppercase font-mono tracking-wider"
                  >
                    Mark (Default)
                  </button>
                  <button
                    onClick={() => {
                      const user = authService.signInManual("tester.pro@dropid.app");
                      setSession(user);
                      syncUserProfile("tester.pro@dropid.app", "pro_user_id");
                      setShowEmailLoginDialog(false);
                      setView("dashboard");
                    }}
                    className="flex-1 text-[10px] py-1 bg-zinc-950 hover:bg-zinc-850 rounded text-slate-300 transition-colors uppercase font-mono tracking-wider"
                  >
                    Pro Tester Account
                  </button>
                </div>
              </div>

              <form onSubmit={handleManualLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block font-semibold">EMAIL ACCOUNT ADDRESS</label>
                  <input
                    type="email"
                    placeholder="you@domain.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full bg-[#0a0a0f] border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 outline-none focus:border-blue-500 placeholder-slate-600"
                    required
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-blue-600 font-semibold text-xs uppercase tracking-wider text-white rounded-xl hover:bg-blue-500 active:scale-95 transition-all text-center cursor-pointer"
                  >
                    Authenticate Now
                  </button>
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    className="flex-1 py-3 bg-slate-900 border border-[#1e1e2e] text-slate-350 text-xs uppercase tracking-wider rounded-xl font-semibold hover:bg-slate-850 cursor-pointer"
                  >
                    Google OAuth Pop
                  </button>
                </div>
              </form>

            </div>
          </div>
        )}
      </AnimatePresence>

      {/* --- FOOTER CARD RAIL --- */}
      <footer className={`py-12 border-t mt-24 text-center text-xs font-mono transition-colors duration-300 ${theme === "dark" ? "border-[#1e1e2e] bg-[#08080c] text-slate-500" : "border-slate-200 bg-slate-100 text-slate-600"}`}>
        <div className="max-w-7xl mx-auto px-4 space-y-6">
          <div className="flex flex-wrap justify-center gap-6">
            <a href="#" className="hover:text-blue-400 transition-colors">Tunnels Directory</a>
            <a href="#" className="hover:text-blue-400 transition-colors">High Bandwidth Nodes</a>
            <a href="#" className="hover:text-blue-405 transition-colors">Security assertions</a>
            <a href="#" className="hover:text-blue-400 transition-colors">Zero-loss API specifications</a>
            <a href="#" className="hover:text-amber-400 transition-colors" onClick={() => { setView("dashboard"); if(!profile) setShowEmailLoginDialog(true); }}>Simulator Sandbox Dashboard</a>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-[10px] text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-cyan-400 tracking-widest uppercase">DROPID INCORPORATED PLATFORM</p>
            <p className="text-[10px] text-zinc-650 leading-relaxed">
              Designed as a premium, secure pipeline in London & Switzerland. Built 100% compliant with React, Express, and Vite standards. © 2026. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
}
