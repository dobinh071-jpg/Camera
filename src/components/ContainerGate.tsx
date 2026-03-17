import React, { useState, useEffect, useRef } from 'react';
import { CameraFeed } from './CameraFeed';
import { LogTable, type ContainerLog } from './LogTable';
import { Activity, ShieldCheck, Clock, Server, AlertCircle, RefreshCw, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';

type SystemState = 'IDLE' | 'ENTERING' | 'STOPPED' | 'PROCESSING' | 'SUCCESS';

// System Configuration matching the Python backend
const SYSTEM_CONFIG = {
  LAN_VAO_1: { 
    id: 'LAN_VAO_1', name: 'Làn Vào 1', 
    cameras: [
      { id: 'cam_left', name: 'SOI SƯỜN L1 - L', seed: 'cont_left_1' },
      { id: 'cam_right', name: 'SOI SƯỜN L1 - R', seed: 'cont_right_1' },
      { id: 'cam_top', name: 'SOI NÓC L1', seed: 'cont_top_1' },
      { id: 'cam_rear', name: 'SOI HẬU L1', seed: 'cont_rear_1' }
    ] 
  },
  LAN_VAO_2: { 
    id: 'LAN_VAO_2', name: 'Làn Vào 2', 
    cameras: [
      { id: 'cam_left', name: 'SOI SƯỜN L2 - L', seed: 'cont_left_2' },
      { id: 'cam_right', name: 'SOI SƯỜN L2 - R', seed: 'cont_right_2' },
      { id: 'cam_top', name: 'SOI NÓC L2', seed: 'cont_top_2' },
      { id: 'cam_rear', name: 'SOI HẬU L2', seed: 'cont_rear_2' }
    ] 
  },
  TRAM_CAN: { 
    id: 'TRAM_CAN', name: 'Trạm Cân', 
    cameras: [
      { id: 'cam_left', name: 'SOI SƯỜN TC - L', seed: 'cont_left_tc' },
      { id: 'cam_right', name: 'SOI SƯỜN TC - R', seed: 'cont_right_tc' },
      { id: 'cam_top', name: 'SOI NÓC TC', seed: 'cont_top_tc' },
      { id: 'cam_rear', name: 'SOI HẬU TC', seed: 'cont_rear_tc' }
    ] 
  },
  LAN_RA_1: { 
    id: 'LAN_RA_1', name: 'Làn Ra 1', 
    cameras: [
      { id: 'cam_top', name: 'SOI NÓC LR1', seed: 'cont_top_r1' }
    ] 
  },
  LAN_RA_2: { 
    id: 'LAN_RA_2', name: 'Làn Ra 2', 
    cameras: [
      { id: 'cam_top', name: 'SOI NÓC LR2', seed: 'cont_top_r2' }
    ] 
  },
};

type LaneId = keyof typeof SYSTEM_CONFIG;

export default function ContainerGate() {
  const [activeLane, setActiveLane] = useState<LaneId>('LAN_VAO_1');
  const [systemState, setSystemState] = useState<SystemState>('IDLE');
  const [logs, setLogs] = useState<ContainerLog[]>([]);
  const [currentContainer, setCurrentContainer] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const activeLaneRef = useRef(activeLane);

  const currentLaneConfig = SYSTEM_CONFIG[activeLane];

  const simulateVehicleFlow = () => {
    if (systemState !== 'IDLE') return;
    
    setSystemState('ENTERING');
    setTerminalLogs(prev => [`[${format(new Date(), 'HH:mm:ss')}] [INFO] [${activeLane}] Xe đang tiến vào vị trí. Chờ xe dừng hẳn...`, ...prev].slice(0, 20));
    
    setTimeout(() => {
      setSystemState('STOPPED');
      setTerminalLogs(prev => [`[${format(new Date(), 'HH:mm:ss')}] [INFO] [${activeLane}] Xe đã dừng. Kích hoạt chụp 4 ảnh đồng thời!`, ...prev].slice(0, 20));
      
      setTimeout(() => {
        setSystemState('PROCESSING');
        setTerminalLogs(prev => [`[${format(new Date(), 'HH:mm:ss')}] [INFO] [${activeLane}] Bắt đầu phân tích AI (OCR) trên 4 ảnh vừa chụp...`, ...prev].slice(0, 20));
        
        setTimeout(() => {
          setSystemState('SUCCESS');
          setCurrentContainer('TEST9876543');
          setTerminalLogs(prev => [`[${format(new Date(), 'HH:mm:ss')}] [SUCCESS] [${activeLane}] Chốt số Cont: TEST9876543 (Mô phỏng)`, ...prev].slice(0, 20));
          
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            setSystemState('IDLE');
            setCurrentContainer(null);
          }, 5000);
        }, 2500);
      }, 1500);
    }, 2500);
  };

  useEffect(() => {
    activeLaneRef.current = activeLane;
  }, [activeLane]);

  // Clock update
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch and Subscribe to Supabase
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const { data, error } = await supabase
          .from('container_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;

        if (data) {
          const formattedLogs: ContainerLog[] = data.map(d => ({
            id: d.id,
            containerNo: d.container_no,
            laneId: d.lane_id,
            eventType: d.event_type,
            matchedCameras: d.matched_cameras,
            totalCameras: d.total_cameras,
            createdAt: new Date(d.created_at),
            imageUrlLeft: d.image_url_left,
            imageUrlRight: d.image_url_right,
            imageUrlRear: d.image_url_rear,
            imageUrlTop: d.image_url_top
          }));
          setLogs(formattedLogs);
        }
      } catch (err) {
        console.error('Error fetching logs:', err);
      }
    };

    fetchLogs();

    const channel = supabase
      .channel('public:container_logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'container_logs' }, (payload) => {
        const newRow = payload.new;
        const newLog: ContainerLog = {
          id: newRow.id,
          containerNo: newRow.container_no,
          laneId: newRow.lane_id,
          eventType: newRow.event_type,
          matchedCameras: newRow.matched_cameras,
          totalCameras: newRow.total_cameras,
          createdAt: new Date(newRow.created_at),
          imageUrlLeft: newRow.image_url_left,
          imageUrlRight: newRow.image_url_right,
          imageUrlRear: newRow.image_url_rear,
          imageUrlTop: newRow.image_url_top
        };

        setLogs(prev => [newLog, ...prev].slice(0, 50));
        
        // Add to terminal
        const timeStr = format(new Date(newRow.created_at), 'HH:mm:ss');
        const isUnknown = newRow.container_no === 'UNKNOWN';
        
        setTerminalLogs(prev => [
          `[${timeStr}] [DB] Saved to Supabase. Opening barrier...`,
          isUnknown 
            ? `[${timeStr}] [WARN] [${newRow.lane_id}] OCR Failed. Saved images for manual review.`
            : `[${timeStr}] [SUCCESS] [${newRow.lane_id}] Chốt số Cont: ${newRow.container_no} (Đồng thuận: ${newRow.matched_cameras}/${newRow.total_cameras} cam)`,
          ...prev
        ].slice(0, 20));

        // If the event is for the currently viewed lane, show SUCCESS state briefly
        if (newRow.lane_id === activeLaneRef.current) {
           setCurrentContainer(newRow.container_no);
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
      supabase.removeChannel(channel);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="h-full flex flex-col font-sans selection:bg-emerald-500/30">
      {/* Top Navigation Bar */}
      <header className="h-14 border-b border-slate-800/60 bg-[#111214] flex items-center justify-between px-6 shrink-0 rounded-t-xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-100">AI GATE CONTROL</h1>
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">14 Cameras • 5 Lanes</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-900 border border-slate-800">
            <Server className="w-3.5 h-3.5 text-emerald-500" />
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
          
          {/* Lane Selector */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 scrollbar-hide shrink-0">
            <div className="flex items-center gap-2">
              {Object.values(SYSTEM_CONFIG).map((lane) => (
                <button
                key={lane.id}
                onClick={() => setActiveLane(lane.id as LaneId)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeLane === lane.id 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' 
                    : 'bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800 hover:text-slate-300'
                }`}
              >
                <MapPin className="w-4 h-4" />
                {lane.name}
                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-950/50 border border-slate-700/50">
                  {lane.cameras.length} CAM
                </span>
              </button>
              ))}
            </div>
            <button 
              onClick={simulateVehicleFlow}
              disabled={systemState !== 'IDLE'}
              className="px-3 py-1.5 text-xs font-bold rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/50 hover:bg-indigo-500/30 disabled:opacity-50 whitespace-nowrap"
            >
              SIMULATE FLOW
            </button>
          </div>

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
                  System Status • {currentLaneConfig.name}
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

          {/* Camera Grid */}
          <div className={`grid gap-4 flex-1 min-h-0 ${currentLaneConfig.cameras.length === 1 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2' : 'grid-cols-1 md:grid-cols-2'}`}>
            {currentLaneConfig.cameras.map((cam) => {
              // Find the latest log for this lane to display actual images if available
              const latestLogForLane = logs.find(log => log.laneId === activeLane);
              let actualImageUrl = null;
              
              if (latestLogForLane) {
                if (cam.id === 'cam_left') actualImageUrl = latestLogForLane.imageUrlLeft;
                if (cam.id === 'cam_right') actualImageUrl = latestLogForLane.imageUrlRight;
                if (cam.id === 'cam_top') actualImageUrl = latestLogForLane.imageUrlTop;
                if (cam.id === 'cam_rear') actualImageUrl = latestLogForLane.imageUrlRear;
              }

              return (
                <CameraFeed 
                  key={cam.id}
                  name={cam.name} 
                  status={systemState} 
                  imageUrl={actualImageUrl || `https://picsum.photos/seed/${cam.seed}/800/450`} 
                />
              );
            })}
            {currentLaneConfig.cameras.length === 1 && (
              <div className="hidden md:flex xl:flex items-center justify-center border border-dashed border-slate-800/50 rounded-xl bg-slate-900/20 text-slate-600 font-mono text-sm">
                NO ADDITIONAL CAMERAS
              </div>
            )}
          </div>
          
          {/* Terminal Output Simulation */}
          <div className="shrink-0 h-24 bg-[#0d0e12] border border-slate-800 rounded-xl p-4 font-mono text-xs overflow-y-auto shadow-inner flex flex-col-reverse">
            <div className="space-y-1.5 opacity-80">
              <div className="text-slate-500">[{format(currentTime, 'HH:mm:ss')}] System ready. Listening on {activeLane}...</div>
              {systemState === 'SUCCESS' && (
                <div className="text-emerald-400">[{format(currentTime, 'HH:mm:ss')}] [ACTION] [{activeLane}] Reading OCR from {currentLaneConfig.cameras.length} cameras...</div>
              )}
              {terminalLogs.map((log, i) => (
                <div key={i} className={log.includes('[SUCCESS]') ? 'text-emerald-300' : 'text-slate-300'}>
                  {log}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Logs */}
        <div className="w-full lg:w-96 shrink-0 flex flex-col min-h-0">
          <LogTable logs={logs} />
        </div>
      </main>
    </div>
  );
}
