import React, { useState, useEffect, useRef } from 'react';
import { CameraFeed } from './CameraFeed';
import { Activity, ShieldCheck, Clock, Server, AlertCircle, RefreshCw, Box, X } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';
import { TallyEvent } from '../types';

type SystemState = 'IDLE' | 'ENTERING' | 'STOPPED' | 'PROCESSING' | 'SUCCESS';

const TALLY_CAMERAS = [
  { id: 'side_1', name: 'SOI SƯỜN 1', seed: 'tally_side_1' },
  { id: 'top_1', name: 'SOI NÓC 1', seed: 'tally_top_1' },
  { id: 'top_2', name: 'SOI NÓC 2', seed: 'tally_top_2' },
  { id: 'side_2', name: 'SOI SƯỜN 2', seed: 'tally_side_2' }
];

export default function TallyLog() {
  const [systemState, setSystemState] = useState<SystemState>('IDLE');
  const [events, setEvents] = useState<TallyEvent[]>([]);
  const [currentContainer, setCurrentContainer] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<TallyEvent | null>(null);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const simulateVehicleFlow = () => {
    if (systemState !== 'IDLE') return;
    
    setSystemState('ENTERING');
    setTerminalLogs(prev => [`[${format(new Date(), 'HH:mm:ss')}] [INFO] [TALLY] Xe đang tiến vào vị trí. Chờ xe dừng hẳn...`, ...prev].slice(0, 20));
    
    setTimeout(() => {
      setSystemState('STOPPED');
      setTerminalLogs(prev => [`[${format(new Date(), 'HH:mm:ss')}] [INFO] [TALLY] Xe đã dừng. Kích hoạt chụp 4 ảnh đồng thời!`, ...prev].slice(0, 20));
      
      setTimeout(() => {
        setSystemState('PROCESSING');
        setTerminalLogs(prev => [`[${format(new Date(), 'HH:mm:ss')}] [INFO] [TALLY] Bắt đầu phân tích AI (OCR) trên 4 ảnh vừa chụp...`, ...prev].slice(0, 20));
        
        setTimeout(() => {
          setSystemState('SUCCESS');
          setCurrentContainer('TLLU1234567');
          setTerminalLogs(prev => [`[${format(new Date(), 'HH:mm:ss')}] [SUCCESS] [TALLY] Chốt số Cont: TLLU1234567 (Mô phỏng)`, ...prev].slice(0, 20));
          
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            setSystemState('IDLE');
            setCurrentContainer(null);
          }, 5000);
        }, 2500);
      }, 1500);
    }, 2500);
  };

  // Clock update
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch and Subscribe to Supabase
  useEffect(() => {
    let isMounted = true;
    
    const fetchEvents = async () => {
      try {
        const { data, error } = await supabase
          .from('tally_events')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(50);

        if (error) throw error;

        if (data && isMounted) {
          setEvents(data as TallyEvent[]);
        }
      } catch (err) {
        console.error('Error fetching tally events:', err);
      }
    };

    fetchEvents();

    const channel = supabase
      .channel('public:tally_events')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tally_events' }, (payload) => {
        const newEvent = payload.new as TallyEvent;

        if (isMounted) {
          setEvents(prev => [newEvent, ...prev].slice(0, 50));
          
          // Add to terminal
          const timeStr = format(new Date(newEvent.timestamp), 'HH:mm:ss');
          const isUnknown = newEvent.container_number === 'UNKNOWN' || !newEvent.container_number;
          
          setTerminalLogs(prev => [
            `[${timeStr}] [DB] Saved to Supabase.`,
            isUnknown 
              ? `[${timeStr}] [WARN] [TALLY] OCR Failed. Saved images for manual review.`
              : `[${timeStr}] [SUCCESS] [TALLY] Chốt số Cont: ${newEvent.container_number}`,
            ...prev
          ].slice(0, 20));

          setCurrentContainer(newEvent.container_number || 'UNKNOWN');
          setSystemState('SUCCESS');
          
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            setSystemState('IDLE');
            setCurrentContainer(null);
          }, 5000);
        }
      })
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="h-full flex flex-col font-sans selection:bg-blue-500/30">
      {/* Top Navigation Bar */}
      <header className="h-14 border-b border-slate-800/60 bg-[#111214] flex items-center justify-between px-6 shrink-0 rounded-t-xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Box className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-100">SMART TALLY SYSTEM</h1>
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">4 Cameras • OCR & Damage Detection</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <button 
            onClick={simulateVehicleFlow}
            disabled={systemState !== 'IDLE'}
            className="px-3 py-1.5 text-xs font-bold rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/50 hover:bg-indigo-500/30 disabled:opacity-50 whitespace-nowrap"
          >
            SIMULATE TALLY FLOW
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-900 border border-slate-800">
            <Server className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-xs font-mono text-slate-400">DB: CONNECTED</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-900 border border-slate-800">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs font-mono text-slate-300">{format(currentTime, 'yyyy-MM-dd HH:mm:ss')}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col lg:flex-row p-4 gap-4 bg-[#0a0a0a] rounded-b-xl border border-t-0 border-slate-800/60">
        
        {/* Left Column: Live Cameras & Status */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          
          {/* Status Banner */}
          <div className={`shrink-0 rounded-xl border p-4 flex items-center justify-between transition-colors duration-500 ${
            systemState === 'IDLE' ? 'bg-slate-900/50 border-slate-800' :
            systemState === 'ENTERING' ? 'bg-amber-500/10 border-amber-500/30' :
            systemState === 'STOPPED' ? 'bg-blue-500/10 border-blue-500/30' :
            systemState === 'PROCESSING' ? 'bg-emerald-500/10 border-emerald-500/30' :
            'bg-emerald-500/20 border-emerald-500/50'
          }`}>
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                systemState === 'IDLE' ? 'bg-slate-800 text-slate-400' :
                systemState === 'ENTERING' ? 'bg-amber-500/20 text-amber-500 animate-pulse' :
                systemState === 'STOPPED' ? 'bg-blue-500/20 text-blue-400' :
                systemState === 'PROCESSING' ? 'bg-emerald-500/20 text-emerald-400 animate-spin' :
                'bg-emerald-500 text-slate-950'
              }`}>
                {systemState === 'PROCESSING' ? <RefreshCw className="w-6 h-6" /> : <Activity className="w-6 h-6" />}
              </div>
              <div>
                <h2 className="text-sm font-mono font-bold uppercase tracking-widest text-slate-400 mb-1">
                  System Status • Tally Station
                </h2>
                <div className="text-2xl font-bold tracking-tight">
                  {systemState === 'IDLE' && <span className="text-slate-300">WAITING FOR VEHICLE...</span>}
                  {systemState === 'ENTERING' && <span className="text-amber-400">VEHICLE POSITIONING - WAITING TO STOP...</span>}
                  {systemState === 'STOPPED' && <span className="text-blue-400">VEHICLE STOPPED - TAKING 4 SNAPSHOTS...</span>}
                  {systemState === 'PROCESSING' && <span className="text-emerald-400">RUNNING OCR ON CAPTURED IMAGES...</span>}
                  {systemState === 'SUCCESS' && currentContainer !== 'UNKNOWN' && (
                    <div className="flex items-center gap-3">
                      <span className="text-emerald-400">MATCH FOUND:</span>
                      <span className="font-mono bg-emerald-500/20 px-3 py-1 rounded border border-emerald-500/30 text-emerald-300">
                        {currentContainer}
                      </span>
                    </div>
                  )}
                  {systemState === 'SUCCESS' && currentContainer === 'UNKNOWN' && (
                    <div className="flex items-center gap-3">
                      <span className="text-red-400">OCR FAILED:</span>
                      <span className="font-mono bg-red-500/20 px-3 py-1 rounded border border-red-500/30 text-red-300 animate-pulse">
                        MANUAL CHECK REQUIRED
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 2x2 Camera Grid */}
          <div className="flex-1 grid grid-cols-2 gap-3 min-h-0">
            {TALLY_CAMERAS.map((cam) => (
              <CameraFeed
                key={cam.id}
                name={cam.name}
                status={systemState}
                imageUrl={`https://picsum.photos/seed/${cam.seed}/640/360`}
              />
            ))}
          </div>
        </div>

        {/* Right Column: Terminal & Logs */}
        <div className="w-full lg:w-[400px] xl:w-[480px] flex flex-col gap-4 shrink-0">
          
          {/* Terminal Window */}
          <div className="h-48 bg-[#0d0e12] rounded-xl border border-slate-800 flex flex-col overflow-hidden shrink-0">
            <div className="px-3 py-2 bg-[#16181d] border-b border-slate-800 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
              </div>
              <span className="text-[10px] font-mono text-slate-500 ml-2">tally-worker.log</span>
            </div>
            <div className="flex-1 p-3 overflow-y-auto font-mono text-[11px] leading-relaxed text-slate-400">
              {terminalLogs.length === 0 ? (
                <div className="text-slate-600 italic">Waiting for system events...</div>
              ) : (
                terminalLogs.map((log, i) => (
                  <div key={i} className={`mb-1 ${
                    log.includes('[SUCCESS]') ? 'text-emerald-400' :
                    log.includes('[WARN]') ? 'text-amber-400' :
                    log.includes('[ERROR]') ? 'text-red-400' :
                    'text-slate-400'
                  }`}>
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Events List */}
          <div className="flex-1 bg-[#16181d] rounded-xl border border-slate-800 flex flex-col min-h-0 overflow-hidden">
            <div className="p-3 border-b border-slate-800 bg-[#1a1d24]">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Recent Tally Events</h3>
            </div>
            
            <div className="flex-1 overflow-auto p-3">
              <div className="grid grid-cols-1 gap-3">
                {events.length === 0 ? (
                  <div className="text-center text-slate-500 text-xs py-8">
                    Chưa có dữ liệu. Đang chờ xe tải đi qua trạm Tally...
                  </div>
                ) : (
                  events.map((event) => (
                    <div key={event.id} className="bg-[#20232b] rounded-lg border border-slate-800 overflow-hidden">
                      <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-[#1a1d24]">
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 bg-blue-500/10 rounded-md">
                            <Box className="w-4 h-4 text-blue-400" />
                          </div>
                          <div>
                            <div className="text-xs font-medium text-slate-200">
                              {new Date(event.timestamp).toLocaleTimeString()}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              Cont: <span className="text-slate-300 font-mono">{event.container_number || 'UNKNOWN'}</span>
                            </div>
                          </div>
                        </div>
                        <div className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-[10px] font-medium text-slate-400">
                          {event.damage_status || 'Chưa phân tích'}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-4 gap-0.5 p-0.5 bg-[#16181d]">
                        {[
                          { src: event.image_side_1, label: 'Sườn 1' },
                          { src: event.image_top_1, label: 'Nóc 1' },
                          { src: event.image_top_2, label: 'Nóc 2' },
                          { src: event.image_side_2, label: 'Sườn 2' }
                        ].map((img, idx) => (
                          <div 
                            key={idx} 
                            className="relative aspect-video bg-black group cursor-pointer overflow-hidden"
                            onClick={() => setSelectedEvent(event)}
                          >
                            {img.src ? (
                              <img 
                                src={img.src} 
                                alt={img.label} 
                                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-600 text-[8px]">
                                N/A
                              </div>
                            )}
                            <div className="absolute bottom-1 left-1 px-1 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[8px] text-slate-300 font-medium">
                              {img.label}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Image Modal */}
      {selectedEvent && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
          onClick={() => setSelectedEvent(null)}
        >
          <div className="relative max-w-6xl w-full max-h-[95vh] flex flex-col bg-[#16181d] rounded-xl border border-slate-800 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-[#1a1d24]">
              <div>
                <h3 className="text-lg font-medium text-slate-200">Chi tiết ảnh chụp Tally</h3>
                <p className="text-sm text-slate-400">{new Date(selectedEvent.timestamp).toLocaleString()} - Cont: <span className="font-mono text-blue-400">{selectedEvent.container_number || 'UNKNOWN'}</span></p>
              </div>
              <button 
                className="text-slate-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-slate-800"
                onClick={() => setSelectedEvent(null)}
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { src: selectedEvent.image_side_1, label: 'Soi sườn 1' },
                  { src: selectedEvent.image_top_1, label: 'Soi nóc 1' },
                  { src: selectedEvent.image_top_2, label: 'Soi nóc 2' },
                  { src: selectedEvent.image_side_2, label: 'Soi sườn 2' }
                ].map((img, idx) => (
                  <div key={idx} className="flex flex-col gap-2">
                    <div className="text-sm font-medium text-slate-300">{img.label}</div>
                    <div className="bg-black rounded-lg border border-slate-800 overflow-hidden aspect-video">
                      {img.src ? (
                        <img 
                          src={img.src} 
                          alt={img.label} 
                          className="w-full h-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-600">
                          Không có ảnh
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
