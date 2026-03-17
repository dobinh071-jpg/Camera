import React, { useState, useEffect } from 'react';
import { DVR, Camera, StatusHistory } from '../types';
import { Server, Camera as CameraIcon, History, AlertCircle, CheckCircle2, Network, MonitorPlay, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Props {
  dvrs: DVR[];
  cameras: Camera[];
}

export default function DeviceStatus({ dvrs, cameras }: Props) {
  const [deviceStatus, setDeviceStatus] = useState<Record<string, 'online' | 'offline'>>({});
  const [historyLog, setHistoryLog] = useState<StatusHistory[]>([]);
  const [expandedDvrs, setExpandedDvrs] = useState<string[]>(dvrs.map(d => d.id));
  
  // Initialize deviceStatus with 'offline' on first render to avoid false offline events
  const [isFirstPing, setIsFirstPing] = useState(true);

  const toggleDvrExpand = (dvrId: string) => {
    setExpandedDvrs(prev => prev.includes(dvrId) ? prev.filter(id => id !== dvrId) : [...prev, dvrId]);
  };

  useEffect(() => {
    let isMounted = true;

    const loadHistory = async () => {
      try {
        // Clean up history older than 2 days
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        
        await supabase
          .from('status_history')
          .delete()
          .lt('timestamp', twoDaysAgo.toISOString());

        // Fetch recent history
        const { data, error } = await supabase
          .from('status_history')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(50);

        if (!error && data && isMounted) {
          setHistoryLog(data as StatusHistory[]);
        }
      } catch (err) {
        console.error("Failed to load status history:", err);
      }
    };

    loadHistory();

    // Ping devices on the local network by attempting to load an image/favicon
    const pingDevices = async () => {
      const newStatus: Record<string, 'online' | 'offline'> = {};
      
      const checkOnline = async (host: string): Promise<boolean> => {
        try {
          const res = await fetch(`/api/proxy/ping?host=${encodeURIComponent(host)}`);
          if (!res.ok) return false;
          const data = await res.json();
          return data.alive;
        } catch (e) {
          return false;
        }
      };

      // Ping DVRs
      const dvrResults: { id: string, status: 'online' | 'offline' }[] = [];
      for (const dvr of dvrs) {
        const host = `${dvr.ip_address}:${dvr.port}`;
        const isOnline = await checkOnline(host);
        dvrResults.push({ id: dvr.id, status: isOnline ? 'online' : 'offline' });
      }

      // Ping Cameras - process in chunks of 4 to avoid browser connection limits
      const camResults: { id: string, status: 'online' | 'offline' }[] = [];
      for (let i = 0; i < cameras.length; i += 4) {
        const chunk = cameras.slice(i, i + 4);
        const chunkPromises = chunk.map(async (cam): Promise<{ id: string, status: 'online' | 'offline' }> => {
          if (!cam.ip_address) return { id: cam.id, status: 'offline' };
          const isOnline = await checkOnline(cam.ip_address);
          return { id: cam.id, status: isOnline ? 'online' : 'offline' };
        });
        
        const results = await Promise.all(chunkPromises);
        camResults.push(...results);
      }

      for (const res of dvrResults) {
        newStatus[res.id] = res.status as 'online' | 'offline';
      }
      for (const res of camResults) {
        newStatus[res.id] = res.status as 'online' | 'offline';
      }

      setDeviceStatus(prevStatus => {
        const newHistoryEvents: any[] = [];
        const now = new Date().toISOString();

        // Check DVRs
        dvrs.forEach(dvr => {
          const oldStatus = prevStatus[dvr.id];
          const currentStatus = newStatus[dvr.id];
          
          // Log if status changed, OR if it's the first ping and the device is offline
          if ((oldStatus && oldStatus !== currentStatus) || (isFirstPing && currentStatus === 'offline')) {
            newHistoryEvents.push({
              device_id: dvr.id,
              device_name: dvr.name,
              device_type: 'dvr',
              event: currentStatus,
              timestamp: now
            });
          }
        });

        // Check Cameras
        cameras.forEach(cam => {
          const oldStatus = prevStatus[cam.id];
          const currentStatus = newStatus[cam.id];
          
          // Log if status changed, OR if it's the first ping and the device is offline
          if ((oldStatus && oldStatus !== currentStatus) || (isFirstPing && currentStatus === 'offline')) {
            newHistoryEvents.push({
              device_id: cam.id,
              device_name: cam.name,
              device_type: 'camera',
              event: currentStatus,
              timestamp: now
            });
          }
        });

        if (newHistoryEvents.length > 0) {
          // Push to Supabase asynchronously
          supabase.from('status_history').insert(newHistoryEvents).then(({ error }) => {
            if (error) console.error("Failed to insert status history:", error);
          });
          
          // Update local state optimistically
          setHistoryLog(prev => {
            // Generate temporary IDs for optimistic UI
            const optimisticEvents = newHistoryEvents.map((e, i) => ({
              ...e,
              id: `temp-${Date.now()}-${i}`
            })) as StatusHistory[];
            const combined = [...optimisticEvents, ...prev];
            return combined.slice(0, 50); // Keep last 50 events
          });
        }
        
        return newStatus;
      });
      
      setIsFirstPing(false);
    };

    pingDevices();
    const interval = setInterval(pingDevices, 30000); // Ping every 30 seconds to avoid spamming
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [dvrs, cameras, isFirstPing]);

  return (
    <div className="h-full flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-100">Trạng Thái Thiết Bị (LAN)</h2>
        <p className="text-sm text-gray-400">Giám sát tình trạng hoạt động của Đầu ghi và Camera qua mạng nội bộ</p>
        <p className="text-xs text-amber-500 mt-1 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          Lưu ý: Trình duyệt có thể chặn kết nối HTTP từ trang web HTTPS (Mixed Content). Hãy chạy ứng dụng ở localhost để kiểm tra chính xác nhất.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Device List */}
        <div className="lg:col-span-2 flex flex-col bg-[#16181d] rounded-xl border border-[#2a2d36] overflow-hidden">
          <div className="p-4 border-b border-[#2a2d36] flex justify-between items-center bg-[#1a1d24]">
            <h3 className="font-medium text-gray-200 flex items-center gap-2">
              <Network className="w-4 h-4 text-blue-400" />
              Danh sách Đầu ghi & Camera (LAN IP)
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {dvrs.map(dvr => {
              const dvrCameras = cameras.filter(c => c.dvr_id === dvr.id);
              const status = deviceStatus[dvr.id] || 'offline';
              
              const isExpanded = expandedDvrs.includes(dvr.id);
              
              return (
                <div key={dvr.id} className="space-y-2">
                  <div 
                    className="flex items-center justify-between p-3 bg-[#20232b] rounded-lg border border-[#2a2d36] cursor-pointer hover:border-gray-600 transition-colors"
                    onClick={() => toggleDvrExpand(dvr.id)}
                  >
                    <div className="flex items-center gap-3">
                      <button className="text-gray-400 hover:text-gray-200">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      <div className={`p-1.5 rounded-md ${status === 'online' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                        <Server className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-gray-200 text-sm">{dvr.name}</h4>
                          <span className="text-[10px] font-mono bg-[#16181d] px-1.5 py-0.5 rounded text-gray-400 border border-[#2a2d36]">
                            {dvr.ip_address}:{dvr.port}
                          </span>
                          {dvr.can_view_direct && (
                            <a 
                              href={`http://${dvr.ip_address}:${dvr.port}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-[10px] font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 px-1.5 py-0.5 rounded border border-blue-500/20 transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="w-3 h-3" />
                              View trực tiếp
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">{dvrCameras.length} Cam</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                        status === 'online' 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                          : 'bg-red-500/10 text-red-400 border-red-500/20'
                      }`}>
                        {status === 'online' ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  </div>
                  
                  {isExpanded && dvrCameras.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pl-6 border-l-2 border-[#2a2d36] ml-4">
                      {dvrCameras.map((cam, index) => {
                        const camStatus = deviceStatus[cam.id] || 'offline';
                        return (
                          <div key={`${cam.id}-${index}`} className="flex items-center justify-between p-2 bg-[#1a1d24] rounded-md border border-[#2a2d36]/50">
                            <div className="flex items-center gap-2 min-w-0 pr-2">
                              <CameraIcon className={`w-3.5 h-3.5 flex-shrink-0 ${camStatus === 'online' ? 'text-gray-400' : 'text-red-400'}`} />
                              <span className="text-xs text-gray-300 truncate" title={`${cam.name} (${cam.ip_address})`}>{cam.name}</span>
                            </div>
                            <div className="flex-shrink-0">
                              {camStatus === 'online' ? (
                                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]"></div>
                              ) : (
                                <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]"></div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* History Log */}
        <div className="flex flex-col bg-[#16181d] rounded-xl border border-[#2a2d36] overflow-hidden">
          <div className="p-4 border-b border-[#2a2d36] flex justify-between items-center bg-[#1a1d24]">
            <h3 className="font-medium text-gray-200 flex items-center gap-2">
              <History className="w-4 h-4 text-purple-400" />
              Lịch sử kết nối
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="relative border-l border-[#2a2d36] ml-3 space-y-6">
              {historyLog.length === 0 ? (
                <div className="text-center text-gray-500 py-8 text-sm">Chưa có sự kiện nào</div>
              ) : (
                historyLog.map((history, idx) => (
                  <div key={history.id} className="relative pl-6">
                    <span className={`absolute -left-1.5 top-1.5 w-3 h-3 rounded-full border-2 border-[#16181d] ${
                      history.event === 'online' ? 'bg-emerald-500' : 'bg-red-500'
                    }`}></span>
                    <div className="bg-[#20232b] p-3 rounded-lg border border-[#2a2d36]">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-sm font-medium text-gray-200">{history.device_name}</span>
                        <span className="text-xs font-mono text-gray-500">
                          {new Date(history.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">
                          {history.device_type === 'dvr' ? 'Đầu ghi' : 'Camera'}
                        </span>
                        <span className="text-gray-600">•</span>
                        <span className={`text-xs font-medium ${history.event === 'online' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {history.event === 'online' ? 'Đã kết nối lại' : 'Mất kết nối'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
