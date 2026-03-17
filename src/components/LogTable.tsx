import React, { useState } from 'react';
import { format } from 'date-fns';
import { CheckCircle, ArrowRight, ArrowLeft, Scale, Image as ImageIcon, X } from 'lucide-react';

export interface ContainerLog {
  id: string;
  containerNo: string;
  laneId: string;
  eventType: 'IN' | 'OUT' | 'WEIGH';
  matchedCameras: number;
  totalCameras: number;
  createdAt: Date;
  imageUrlLeft?: string;
  imageUrlRight?: string;
  imageUrlRear?: string;
  imageUrlTop?: string;
}

interface LogTableProps {
  logs: ContainerLog[];
}

export function LogTable({ logs }: LogTableProps) {
  const [selectedLog, setSelectedLog] = useState<ContainerLog | null>(null);

  return (
    <>
      <div className="bg-[#151619] border border-slate-800 rounded-xl overflow-hidden flex flex-col h-full shadow-xl">
        <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200 tracking-wide">RECENT ACTIVITY</h3>
          <span className="text-xs font-mono text-slate-500">{logs.length} RECORDS</span>
        </div>
        
        <div className="overflow-y-auto flex-1 p-2">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-2 py-1.5 text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800/50 mb-2">
            <div>Container No</div>
            <div className="w-16 text-center">Event</div>
            <div className="w-20 text-center">Match</div>
            <div className="w-24 text-right">Time</div>
          </div>

          <div className="space-y-1">
            {logs.map((log) => (
              <div 
                key={log.id} 
                onClick={() => setSelectedLog(log)}
                className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center px-2 py-2.5 rounded-lg bg-slate-900/30 hover:bg-slate-800/50 transition-colors border border-transparent hover:border-slate-700/50 cursor-pointer group"
              >
              <div className="flex flex-col">
                <span className={`font-mono text-sm font-medium transition-colors ${log.containerNo === 'UNKNOWN' ? 'text-red-400 group-hover:text-red-300' : 'text-slate-200 group-hover:text-emerald-400'}`}>
                  {log.containerNo === 'UNKNOWN' ? 'MANUAL CHECK' : log.containerNo}
                </span>
                <span className="text-[10px] text-slate-500 font-mono tracking-wider">{log.laneId}</span>
              </div>
              
              <div className="w-16 flex justify-center">
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  log.eventType === 'IN' 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                    : log.eventType === 'OUT'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                }`}>
                  {log.eventType === 'IN' ? <ArrowRight className="w-3 h-3" /> : log.eventType === 'OUT' ? <ArrowLeft className="w-3 h-3" /> : <Scale className="w-3 h-3" />}
                  {log.eventType}
                </span>
              </div>
              
              <div className="w-20 flex justify-center">
                <div className="flex items-center gap-1 text-xs font-mono text-slate-400">
                  <CheckCircle className={`w-3 h-3 ${log.containerNo === 'UNKNOWN' ? 'text-red-500' : log.matchedCameras === log.totalCameras ? 'text-emerald-500' : 'text-amber-500'}`} />
                  {log.matchedCameras}/{log.totalCameras}
                </div>
              </div>
              
              <div className="w-24 flex items-center justify-end gap-2 text-xs font-mono text-slate-500">
                {(log.imageUrlLeft || log.imageUrlRight || log.imageUrlTop || log.imageUrlRear) && (
                  <ImageIcon className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                )}
                {format(log.createdAt, 'HH:mm:ss')}
              </div>
            </div>
          ))}

          {logs.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-500 italic">
              No recent activity
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Image Viewer Modal */}
    {selectedLog && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setSelectedLog(null)}>
        <div 
          className="bg-[#151619] border border-slate-800 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
            <div>
              <h2 className="text-lg font-bold text-slate-200 flex items-center gap-3">
                <span className={selectedLog.containerNo === 'UNKNOWN' ? 'text-red-400' : 'text-emerald-400'}>
                  {selectedLog.containerNo === 'UNKNOWN' ? 'MANUAL CHECK REQUIRED' : selectedLog.containerNo}
                </span>
                <span className="text-xs font-mono bg-slate-800 px-2 py-1 rounded text-slate-400">
                  {selectedLog.laneId}
                </span>
              </h2>
              <p className="text-xs font-mono text-slate-500 mt-1">
                Captured at: {format(selectedLog.createdAt, 'yyyy-MM-dd HH:mm:ss')}
              </p>
            </div>
            <button 
              onClick={() => setSelectedLog(null)}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="p-6 overflow-y-auto flex-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: 'LEFT CAMERA', url: selectedLog.imageUrlLeft },
                { label: 'RIGHT CAMERA', url: selectedLog.imageUrlRight },
                { label: 'TOP CAMERA', url: selectedLog.imageUrlTop },
                { label: 'REAR CAMERA', url: selectedLog.imageUrlRear },
              ].map((cam, idx) => (
                <div key={idx} className="flex flex-col gap-2">
                  <span className="text-xs font-mono font-bold text-slate-500 tracking-wider">
                    {cam.label}
                  </span>
                  <div className="aspect-video bg-black rounded-lg border border-slate-800 overflow-hidden relative flex items-center justify-center">
                    {cam.url ? (
                      <img 
                        src={cam.url} 
                        alt={cam.label} 
                        className="w-full h-full object-contain"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-xs font-mono text-slate-600">NO IMAGE</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
