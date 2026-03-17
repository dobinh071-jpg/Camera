import React, { useState, useEffect } from 'react';
import { Camera, AlertCircle, ScanLine, Loader2, X, Box } from 'lucide-react';
import { TallyEvent } from '../types';
import { supabase } from '../lib/supabase';

export default function TallyLog() {
  const [events, setEvents] = useState<TallyEvent[]>([]);
  const [scanStatus, setScanStatus] = useState<string>('Đang chờ dữ liệu từ hệ thống Tally AI...');
  const [selectedEvent, setSelectedEvent] = useState<TallyEvent | null>(null);

  useEffect(() => {
    let isMounted = true;
    
    const loadEvents = async () => {
      try {
        const { data, error } = await supabase
          .from('tally_events')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(50);

        if (error) {
          console.error("Supabase error fetching tally events:", error.message);
        } else if (data && isMounted) {
          setEvents(data as TallyEvent[]);
        }
      } catch (err) {
        console.error("Failed to load tally events:", err);
      }
    };
    
    loadEvents();

    const channel = supabase
      .channel('tally_events_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tally_events',
        },
        (payload) => {
          const newEvent = payload.new as TallyEvent;
          if (isMounted) {
            setEvents((prev) => [newEvent, ...prev].slice(0, 50));
            setScanStatus(`Vừa chụp ảnh xe lúc ${new Date(newEvent.timestamp).toLocaleTimeString()}`);
          }
        }
      )
      .subscribe();
    
    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="h-full flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-100">Smart Tally Container</h2>
        <p className="text-sm text-gray-400">Hệ thống tự động chụp ảnh 4 góc và nhận diện tình trạng container</p>
      </div>

      {/* Info Banner */}
     

      {/* AI Status Banner */}
      <div className="bg-[#16181d] p-4 rounded-xl border border-[#2a2d36] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-lg">
            <ScanLine className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-200">AI Tally Worker</h3>
            <p className="text-xs text-gray-400 mt-0.5">Đang giám sát luồng video từ 4 camera Tally</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#20232b] border border-[#2a2d36] rounded-lg text-sm text-gray-300">
          <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
          {scanStatus}
        </div>
      </div>

      {/* Event List */}
      <div className="flex-1 bg-[#16181d] rounded-xl border border-[#2a2d36] flex flex-col min-h-0 overflow-hidden">
        <div className="p-4 border-b border-[#2a2d36] bg-[#1a1d24]">
          <h3 className="font-medium text-gray-200">Lịch sử chụp ảnh Container</h3>
        </div>
        
        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-1 gap-6">
            {events.length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-8">
                Chưa có dữ liệu. Đang chờ xe tải đi qua trạm Tally...
              </div>
            ) : (
              events.map((event) => (
                <div key={event.id} className="bg-[#20232b] rounded-xl border border-[#2a2d36] overflow-hidden">
                  <div className="p-4 border-b border-[#2a2d36] flex justify-between items-center bg-[#1a1d24]">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-500/10 rounded-lg">
                        <Box className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-200">
                          {new Date(event.timestamp).toLocaleTimeString()} - {new Date(event.timestamp).toLocaleDateString()}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          Số Container: <span className="text-gray-300 font-mono">{event.container_number || 'Đang chờ AI phân tích...'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="px-3 py-1 bg-gray-500/10 border border-gray-500/20 rounded text-xs font-medium text-gray-400">
                      {event.damage_status || 'Chưa phân tích móp méo'}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-1 p-1 bg-[#16181d]">
                    {[
                      { src: event.image_top_1, label: 'Soi nóc 1' },
                      { src: event.image_side_1, label: 'Soi sườn 1' },
                      { src: event.image_top_2, label: 'Soi nóc 2' },
                      { src: event.image_side_2, label: 'Soi sườn 2' }
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
                          <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">
                            No Image
                          </div>
                        )}
                        <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-sm rounded text-[10px] text-gray-300 font-medium">
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

      {/* Image Modal */}
      {selectedEvent && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
          onClick={() => setSelectedEvent(null)}
        >
          <div className="relative max-w-7xl w-full max-h-[95vh] flex flex-col bg-[#16181d] rounded-xl border border-[#2a2d36] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-[#2a2d36] flex justify-between items-center bg-[#1a1d24]">
              <div>
                <h3 className="text-lg font-medium text-gray-200">Chi tiết ảnh chụp Tally</h3>
                <p className="text-sm text-gray-400">{new Date(selectedEvent.timestamp).toLocaleString()}</p>
              </div>
              <button 
                className="text-gray-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-[#2a2d36]"
                onClick={() => setSelectedEvent(null)}
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { src: selectedEvent.image_top_1, label: 'Soi nóc 1' },
                  { src: selectedEvent.image_side_1, label: 'Soi sườn 1' },
                  { src: selectedEvent.image_top_2, label: 'Soi nóc 2' },
                  { src: selectedEvent.image_side_2, label: 'Soi sườn 2' }
                ].map((img, idx) => (
                  <div key={idx} className="flex flex-col gap-2">
                    <div className="text-sm font-medium text-gray-300">{img.label}</div>
                    <div className="bg-black rounded-lg border border-[#2a2d36] overflow-hidden aspect-video">
                      {img.src ? (
                        <img 
                          src={img.src} 
                          alt={img.label} 
                          className="w-full h-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-600">
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
