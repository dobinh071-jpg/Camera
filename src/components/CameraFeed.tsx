import React from 'react';
import { Camera, AlertCircle } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CameraFeedProps {
  key?: string | number;
  name: string;
  status: 'IDLE' | 'ENTERING' | 'STOPPED' | 'PROCESSING' | 'SUCCESS';
  imageUrl: string;
}

export function CameraFeed({ name, status, imageUrl }: CameraFeedProps) {
  const isScanning = status === 'PROCESSING';
  
  return (
    <div className="relative flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-950 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-mono font-medium text-slate-300 uppercase tracking-wider">{name}</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
          <Camera className="w-3 h-3 text-slate-500" />
          <span className="text-[10px] font-mono text-slate-500">LIVE</span>
        </div>
      </div>

      {/* Video Area */}
      <div className={cn(
        "relative aspect-video bg-slate-950 overflow-hidden",
        isScanning ? "is-scanning" : ""
      )}>
        <img 
          src={imageUrl} 
          alt={name}
          className="w-full h-full object-cover opacity-80"
          referrerPolicy="no-referrer"
        />
        
        {/* Scanning Overlay */}
        {isScanning && (
          <div className="absolute inset-0 border-2 border-emerald-500/50 z-10">
            <div className="scanning-line" />
            <div className="absolute inset-0 bg-emerald-500/10" />
          </div>
        )}

        {/* ROI Boxes (Simulated) */}
        <div className="absolute inset-0 pointer-events-none p-4">
          <div className={cn(
            "w-full h-full border border-dashed transition-colors duration-300",
            status === 'IDLE' ? 'border-slate-700/50' :
            status === 'ENTERING' ? 'border-amber-500/50' :
            status === 'STOPPED' ? 'border-emerald-500/80' :
            status === 'PROCESSING' ? 'border-emerald-500' :
            'border-emerald-500'
          )} />
        </div>

        {/* Status Overlay */}
        {status === 'ENTERING' && (
          <div className="absolute top-2 right-2 px-2 py-1 bg-amber-500/90 text-amber-950 text-[10px] font-bold uppercase rounded shadow-sm flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Motion Detected
          </div>
        )}
      </div>
    </div>
  );
}
