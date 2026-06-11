import React from "react";

interface DropIdLogoProps {
  className?: string;
  size?: number | string;
  showText?: boolean;
}

export const DropIdLogo: React.FC<DropIdLogoProps> = ({
  className = "",
  size = 40,
  showText = false,
}) => {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div 
        className="relative flex items-center justify-center select-none"
        style={{ width: size, height: size }}
      >
        {/* Ambient background glow behind the logo */}
        <div className="absolute inset-0 rounded-full bg-blue-500/20 blur-md animate-pulse" />
        
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full relative z-10 filter drop-shadow-[0_4px_12px_rgba(37,99,235,0.35)]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Multi-stop premium gradient showing high-fidelity facet colors */}
            <linearGradient id="dropid-grad" x1="15%" y1="15%" x2="85%" y2="85%">
              <stop offset="0%" stopColor="#38bdf8" /> {/* Sky Blue / Cyan */}
              <stop offset="35%" stopColor="#2563eb" /> {/* Royal Blue */}
              <stop offset="70%" stopColor="#1d4ed8" /> {/* Deeper Blue */}
              <stop offset="100%" stopColor="#0f172a" /> {/* Deep Poly Shadows */}
            </linearGradient>

            {/* Glowing ring/path gradient */}
            <linearGradient id="glow-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0.1" />
            </linearGradient>
          </defs>

          {/* Subtle Outer Neon Track */}
          <path
            d="M 50 6 C 50 6, 14 46, 14 68 A 36 36 0 0 0 86 68 C 86 46, 50 6, 50 6 Z"
            stroke="url(#glow-grad)"
            strokeWidth="1.5"
            strokeDasharray="200"
            strokeDashoffset="0"
            className="opacity-60 animate-[dash_4s_linear_infinite]"
            style={{
              strokeDasharray: "200",
              animation: "dropidTrack 10s linear infinite"
            }}
          />

          {/* Main Droplet with carved out central droplet (evenodd) */}
          <path
            d="M 50 10 
               C 50 10, 16 48, 16 68 
               A 34 34 0 0 0 84 68 
               C 84 48, 50 10, 50 10 Z
               
               M 50 28 
               C 50 28, 68 53, 68 68 
               A 18 18 0 0 1 32 68 
               C 32 53, 50 28, 50 28 Z"
            fill="url(#dropid-grad)"
            fillRule="evenodd"
          />

          {/* Premium Blue Inner Person Icon Silhouette */}
          {/* Head */}
          <circle cx="50" cy="54" r="5" fill="#38bdf8" />
          
          {/* Torso/Body */}
          <path
            d="M 40.5 73.5 
               C 40.5 67, 59.5 67, 59.5 73.5 
               A 9.5 9.5 0 0 1 40.5 73.5 Z"
            fill="#38bdf8"
          />
        </svg>

        {/* Global style inject for the path dash rotation animation */}
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes dropidTrack {
            0% { strokeDashoffset: 200; }
            100% { strokeDashoffset: 0; }
          }
        `}} />
      </div>

      {showText && (
        <div>
          <span className="font-display font-semibold text-xl tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-slate-300 dark:from-white dark:via-slate-200 light:from-slate-900 light:to-slate-700">
            Drop<span className="text-blue-500 font-bold">ID</span>
          </span>
          <div className="text-[9px] font-mono tracking-widest text-[#06b6d4]">ZERO QUALITY LOSS</div>
        </div>
      )}
    </div>
  );
};
