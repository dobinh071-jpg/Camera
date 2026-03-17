import React, { useState, useEffect } from 'react';
import { DVR, Camera } from '../types';
import { Maximize2, VideoOff, ExternalLink, Image as ImageIcon, Server, Camera as CameraIcon, ChevronRight, ChevronDown, LayoutGrid, X } from 'lucide-react';

interface Props {
  dvrs: DVR[];
  cameras: Camera[];
}

const CameraFeed = ({ cam, dvr }: { cam: Camera, dvr?: DVR }) => {
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    let targetUrl = cam.stream_url?.trim();
    
    // Kiểm tra nếu là IP local (192.168.x.x) và đang chạy trên cloud
    const checkIsLocalIp = (ipOrUrl: string) => {
      try {
        const urlObj = new URL(ipOrUrl.startsWith('http') ? ipOrUrl : `http://${ipOrUrl}`);
        const hostname = urlObj.hostname;
        return hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./);
      } catch {
        return ipOrUrl.startsWith('192.168.') || ipOrUrl.startsWith('10.') || ipOrUrl.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./);
      }
    };

    const isCloudHost = window.location.hostname.includes('run.app');
    const isLocal = checkIsLocalIp(targetUrl || cam.ip_address || '');

    if (isLocal && isCloudHost) {
      const mockImages = [
        'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?q=80&w=800',
        'https://images.unsplash.com/photo-1506521781263-d8422e82f27a?q=80&w=800',
        'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?q=80&w=800',
        'https://images.unsplash.com/photo-1573348722427-f1d6819fdf98?q=80&w=800'
      ];
      // Use camera ID to consistently pick the same mock image for the same camera
      const imgIndex = (cam.id.charCodeAt(cam.id.length - 1) || 0) % mockImages.length;
      const randomImg = mockImages[imgIndex];
      targetUrl = `/api/proxy/image?url=${encodeURIComponent(randomImg)}`;
    } else if (targetUrl) {
      try {
        const urlObj = new URL(targetUrl);
        if (urlObj.username || urlObj.password) {
          const username = urlObj.username;
          const password = urlObj.password;
          urlObj.username = '';
          urlObj.password = '';
          targetUrl = `/api/proxy/image?url=${encodeURIComponent(urlObj.toString())}&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
        } else {
          // If it's a direct HTTP URL, we might still want to proxy it to avoid Mixed Content (HTTPS -> HTTP) or CORS
          targetUrl = `/api/proxy/image?url=${encodeURIComponent(targetUrl)}`;
        }
      } catch (e) {
        // Invalid URL, use as is
      }
    } else if (cam.ip_address) {
      const type = dvr?.type || 'hikvision';
      const rawPassword = cam.password || dvr?.password || '';
      const cleanIp = cam.ip_address.replace(/^https?:\/\//, '').trim();
      
      let baseUrl = type === 'dahua' 
        ? `http://${cleanIp}/cgi-bin/snapshot.cgi?channel=1`
        : `http://${cleanIp}/ISAPI/Streaming/channels/101/picture`;
        
      targetUrl = `/api/proxy/image?url=${encodeURIComponent(baseUrl)}&username=admin&password=${encodeURIComponent(rawPassword)}`;
    }

    if (!targetUrl) return;

    const loadNextFrame = () => {
      if (!isMounted) return;
      
      const urlWithCacheBust = cam.stream_url 
        ? targetUrl 
        : `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
      
      const img = new Image();
      img.referrerPolicy = "no-referrer";
      
      img.onload = () => {
        if (!isMounted) return;
        setSnapshotUrl(urlWithCacheBust);
        setError(false);
        // Schedule next frame after this one successfully loaded
        timeoutId = setTimeout(loadNextFrame, 1000);
      };
      
      img.onerror = () => {
        if (!isMounted) return;
        setError(true);
        // If error, wait longer before retrying to not spam the server
        timeoutId = setTimeout(loadNextFrame, 5000);
      };
      
      img.src = urlWithCacheBust;
    };

    // Start the loop
    loadNextFrame();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [cam, dvr]);

  if (snapshotUrl && !error) {
    return (
      <img 
        src={snapshotUrl} 
        alt={cam.name}
        className="w-full h-full object-cover"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 bg-[#0f1115]">
      {error ? (
        <ImageIcon className="w-8 h-8 mb-2 opacity-50 text-red-400" />
      ) : (
        <VideoOff className="w-8 h-8 mb-2 opacity-50" />
      )}
      <span className="text-sm font-medium mb-2 text-center px-4">
        {error ? 'Không thể tải ảnh chụp' : 'Chưa cấu hình luồng'}
      </span>
      {dvr && (
        <a 
          href={`http://${dvr.ip_address}:${dvr.port}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 hover:underline bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20 transition-colors pointer-events-auto"
        >
          <ExternalLink className="w-3 h-3" />
          Mở {dvr.name}
        </a>
      )}
    </div>
  );
};

export default function LiveView({ dvrs, cameras }: Props) {
  const [gridSize, setGridSize] = useState<1 | 4 | 9 | 16 | 25>(9);
  const [selectedDvrId, setSelectedDvrId] = useState<string | null>(null);
  const [selectedCamId, setSelectedCamId] = useState<string | null>(null);
  const [expandedDvrs, setExpandedDvrs] = useState<string[]>(dvrs.map(d => d.id));
  const [fullscreenCam, setFullscreenCam] = useState<Camera | null>(null);

  const toggleDvrExpand = (dvrId: string) => {
    setExpandedDvrs(prev => prev.includes(dvrId) ? prev.filter(id => id !== dvrId) : [...prev, dvrId]);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFullscreenCam(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  let filteredCameras = cameras;
  if (selectedCamId) {
    filteredCameras = cameras.filter(c => c.id === selectedCamId);
  } else if (selectedDvrId) {
    filteredCameras = cameras.filter(c => c.dvr_id === selectedDvrId);
  }

  const displayCameras = filteredCameras.slice(0, gridSize);

  // Dynamic grid calculation
  let actualGridSize = gridSize;
  if (displayCameras.length === 1) actualGridSize = 1;
  else if (displayCameras.length <= 4) actualGridSize = 4;
  else if (displayCameras.length <= 9) actualGridSize = 9;
  else if (displayCameras.length <= 16) actualGridSize = 16;
  else actualGridSize = 25;

  const cols = Math.ceil(Math.sqrt(actualGridSize));

  return (
    <div className="h-full flex gap-6">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 flex flex-col bg-[#16181d] rounded-xl border border-[#2a2d36] overflow-hidden">
        <div className="p-4 border-b border-[#2a2d36] bg-[#1a1d24]">
          <h3 className="font-medium text-gray-200 flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-blue-400" />
            Danh sách Camera
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div 
            className={`px-3 py-2 rounded-lg cursor-pointer text-sm font-medium transition-colors ${!selectedDvrId && !selectedCamId ? 'bg-blue-500/10 text-blue-400' : 'text-gray-400 hover:bg-[#20232b] hover:text-gray-200'}`}
            onClick={() => { setSelectedDvrId(null); setSelectedCamId(null); }}
          >
            Tất cả Camera
          </div>
          
          {dvrs.map(dvr => {
            const dvrCams = cameras.filter(c => c.dvr_id === dvr.id);
            const isExpanded = expandedDvrs.includes(dvr.id);
            const isSelected = selectedDvrId === dvr.id && !selectedCamId;
            
            return (
              <div key={dvr.id} className="space-y-1 mt-2">
                <div 
                  className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${isSelected ? 'bg-blue-500/10 text-blue-400 font-medium' : 'text-gray-300 hover:bg-[#20232b]'}`}
                  onClick={() => { setSelectedDvrId(dvr.id); setSelectedCamId(null); }}
                >
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <Server className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-blue-400' : 'text-gray-500'}`} />
                    <span className="truncate">{dvr.name}</span>
                  </div>
                  <button 
                    className="p-1 hover:bg-[#2a2d36] rounded text-gray-500 hover:text-gray-300"
                    onClick={(e) => { e.stopPropagation(); toggleDvrExpand(dvr.id); }}
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                </div>
                
                {isExpanded && (
                  <div className="pl-4 space-y-1">
                    {dvrCams.map(cam => {
                      const isCamSelected = selectedCamId === cam.id;
                      return (
                        <div 
                          key={cam.id}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${isCamSelected ? 'bg-emerald-500/10 text-emerald-400 font-medium' : 'text-gray-400 hover:bg-[#20232b] hover:text-gray-200'}`}
                          onClick={() => { setSelectedCamId(cam.id); setSelectedDvrId(dvr.id); }}
                        >
                          <CameraIcon className={`w-3.5 h-3.5 flex-shrink-0 ${isCamSelected ? 'text-emerald-400' : 'text-gray-500'}`} />
                          <span className="truncate">{cam.name}</span>
                        </div>
                      );
                    })}
                    {dvrCams.length === 0 && (
                      <div className="px-3 py-2 text-xs text-gray-500 italic pl-8">Không có camera</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-100">Xem Trực Tiếp</h2>
            <p className="text-sm text-gray-400">Giám sát camera thời gian thực (Hỗ trợ Snapshot Mode)</p>
          </div>
          <div className="flex bg-[#16181d] p-1 rounded-lg border border-[#2a2d36]">
            {[1, 4, 9, 16, 25].map((size) => (
              <button
                key={size}
                onClick={() => setGridSize(size as 1 | 4 | 9 | 16 | 25)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  gridSize === size 
                    ? 'bg-[#2a2d36] text-white' 
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {size} Cam
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 min-h-0">
          <div 
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`
            }}
          >
            {displayCameras.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center text-gray-500 bg-[#16181d] rounded-xl border border-[#2a2d36] aspect-video">
                <VideoOff className="w-12 h-12 mb-4 opacity-20" />
                <p>Không có camera nào để hiển thị</p>
              </div>
            ) : (
              displayCameras.map((cam) => {
                const dvr = dvrs.find(d => d.id === cam.dvr_id);
                return (
                  <div key={cam.id} className="relative bg-[#16181d] rounded-xl border border-[#2a2d36] overflow-hidden group aspect-video">
                    <CameraFeed cam={cam} dvr={dvr} />
                    
                    {/* Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                    
                    {/* Top Bar */}
                    <div className="absolute top-0 left-0 right-0 p-3 flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full bg-emerald-500`}></span>
                        <span className="text-xs font-medium text-white bg-black/50 px-2 py-1 rounded backdrop-blur-sm">
                          {cam.name}
                        </span>
                      </div>
                      <span className="text-xs text-gray-300 bg-black/50 px-2 py-1 rounded backdrop-blur-sm">
                        {dvr?.name}
                      </span>
                    </div>

                    {/* Bottom Bar */}
                    <div className="absolute bottom-0 left-0 right-0 p-3 flex justify-between items-end opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <span className="text-xs font-mono text-white/80 bg-black/50 px-2 py-1 rounded backdrop-blur-sm">
                        {new Date().toLocaleTimeString()}
                      </span>
                      <button 
                        className="p-1.5 bg-black/50 hover:bg-black/80 text-white rounded backdrop-blur-sm transition-colors cursor-pointer pointer-events-auto"
                        onClick={() => setFullscreenCam(cam)}
                      >
                        <Maximize2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Fullscreen Overlay */}
      {fullscreenCam && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 backdrop-blur-md"
          onClick={() => setFullscreenCam(null)}
        >
          <div 
            className="relative w-full max-w-7xl aspect-video bg-[#16181d] rounded-xl overflow-hidden border border-[#2a2d36] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <CameraFeed cam={fullscreenCam} dvr={dvrs.find(d => d.id === fullscreenCam.dvr_id)} />
            
            {/* Top Bar */}
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start bg-gradient-to-b from-black/80 to-transparent">
              <div className="flex items-center gap-3">
                <span className={`w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]`}></span>
                <span className="text-lg font-medium text-white drop-shadow-md">
                  {fullscreenCam.name}
                </span>
                <span className="text-sm text-gray-300 bg-black/50 px-2 py-1 rounded backdrop-blur-sm">
                  {dvrs.find(d => d.id === fullscreenCam.dvr_id)?.name}
                </span>
              </div>
              <button 
                className="p-2 bg-black/50 hover:bg-red-500/80 text-white rounded-lg backdrop-blur-sm transition-colors cursor-pointer pointer-events-auto flex items-center gap-2"
                onClick={() => setFullscreenCam(null)}
              >
                <X className="w-5 h-5" />
                <span className="font-medium">Đóng</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
