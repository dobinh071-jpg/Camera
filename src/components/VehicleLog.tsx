import React, { useState, useEffect } from 'react';
import { mockVehicleEvents } from '../data/mock';
import { Car, LogIn, LogOut, Hash, AlertCircle, ScanLine, Play, Square, Loader2, X } from 'lucide-react';
import { DVR, Camera, VehicleEvent } from '../types';
import { supabase } from '../lib/supabase';

interface Props {
  dvrs: DVR[];
  cameras: Camera[];
}

export default function VehicleLog({ dvrs, cameras }: Props) {
  const [events, setEvents] = useState<VehicleEvent[]>([]);
  const [scanStatus, setScanStatus] = useState<string>('Đang chờ dữ liệu từ hệ thống AI Camera (Python)...');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all');
  const [totalIn, setTotalIn] = useState(0);
  const [totalOut, setTotalOut] = useState(0);

  const currentInLot = Math.max(0, totalIn - totalOut);

  const filteredEvents = events.filter(e => filter === 'all' || e.type === filter);

  useEffect(() => {
    let isMounted = true;
    
    // Load initial events from DB
    const loadEvents = async () => {
      try {
        // Clean up events older than 1 day
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);
        const oneDayAgoStr = oneDayAgo.toISOString();
        
        await supabase
          .from('vehicle_events')
          .delete()
          .lt('timestamp', oneDayAgoStr);

        // Fetch recent events
        const { data, error } = await supabase
          .from('vehicle_events')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(100);

        if (error) {
          console.error("Supabase error fetching events:", error.message);
        } else if (data && isMounted) {
          setEvents(data as VehicleEvent[]);
        }

        // Fetch total counts for today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString();

        const { count: countIn } = await supabase
          .from('vehicle_events')
          .select('*', { count: 'exact', head: true })
          .eq('type', 'in')
          .gte('timestamp', todayStr);

        const { count: countOut } = await supabase
          .from('vehicle_events')
          .select('*', { count: 'exact', head: true })
          .eq('type', 'out')
          .gte('timestamp', todayStr);

        if (isMounted) {
          setTotalIn(countIn || 0);
          setTotalOut(countOut || 0);
        }
      } catch (err) {
        console.error("Failed to load events from Supabase:", err);
      }
    };
    
    loadEvents();

    // Subscribe to real-time inserts from Python AI worker
    const channel = supabase
      .channel('vehicle_events_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'vehicle_events',
        },
        (payload) => {
          const newEvent = payload.new as VehicleEvent;
          if (isMounted) {
            setEvents((prev) => [newEvent, ...prev].slice(0, 100));
            setScanStatus(`Vừa phát hiện xe ${newEvent.type === 'in' ? 'VÀO' : 'RA'} lúc ${new Date(newEvent.timestamp).toLocaleTimeString()}`);
            
            // Increment counts if the event is from today
            const eventDate = new Date(newEvent.timestamp);
            const today = new Date();
            if (
              eventDate.getDate() === today.getDate() && 
              eventDate.getMonth() === today.getMonth() && 
              eventDate.getFullYear() === today.getFullYear()
            ) {
              if (newEvent.type === 'in') {
                setTotalIn(prev => prev + 1);
              } else if (newEvent.type === 'out') {
                setTotalOut(prev => prev + 1);
              }
            }
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
        <h2 className="text-xl font-semibold text-gray-100">Quản Lý Xe Ra Vào</h2>
        <p className="text-sm text-gray-400">Thống kê và lịch sử phương tiện ra vào bãi</p>
      </div>

      {/* Info Banner */}
    

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#16181d] p-5 rounded-xl border border-[#2a2d36] flex items-center gap-4">
          <div className="p-3 bg-blue-500/10 rounded-lg text-blue-400">
            <Car className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-400 font-medium">Xe đang trong bãi</p>
            <p className="text-2xl font-semibold text-gray-100">{currentInLot}</p>
          </div>
        </div>
        <div className="bg-[#16181d] p-5 rounded-xl border border-[#2a2d36] flex items-center gap-4">
          <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-400">
            <LogIn className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-400 font-medium">Tổng lượt vào (Hôm nay)</p>
            <p className="text-2xl font-semibold text-gray-100">{totalIn}</p>
          </div>
        </div>
        <div className="bg-[#16181d] p-5 rounded-xl border border-[#2a2d36] flex items-center gap-4">
          <div className="p-3 bg-orange-500/10 rounded-lg text-orange-400">
            <LogOut className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-400 font-medium">Tổng lượt ra (Hôm nay)</p>
            <p className="text-2xl font-semibold text-gray-100">{totalOut}</p>
          </div>
        </div>
      </div>

      {/* AI Status Banner */}
      <div className="bg-[#16181d] p-4 rounded-xl border border-[#2a2d36] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-lg">
            <ScanLine className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-200">Hệ thống AI tự động đếm xe (Python Worker)</h3>
            <p className="text-xs text-gray-400 mt-0.5">Đang nhận dữ liệu thời gian thực từ máy chủ AI tại bãi xe</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#20232b] border border-[#2a2d36] rounded-lg text-sm text-gray-300">
          <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
          {scanStatus}
        </div>
      </div>

      {/* Event List */}
      <div className="flex-1 bg-[#16181d] rounded-xl border border-[#2a2d36] flex flex-col min-h-0 overflow-hidden">
        <div className="p-4 border-b border-[#2a2d36] bg-[#1a1d24] flex justify-between items-center">
          <h3 className="font-medium text-gray-200">Lịch sử ra vào gần đây</h3>
          <div className="flex gap-2">
            <button 
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                filter === 'all' 
                  ? 'bg-[#2a2d36] text-gray-200' 
                  : 'bg-transparent border border-[#2a2d36] text-gray-400 hover:text-gray-200'
              }`}
            >
              Tất cả
            </button>
            <button 
              onClick={() => setFilter('in')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                filter === 'in' 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                  : 'bg-transparent border border-[#2a2d36] text-gray-400 hover:text-gray-200'
              }`}
            >
              Chỉ xe vào
            </button>
            <button 
              onClick={() => setFilter('out')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                filter === 'out' 
                  ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' 
                  : 'bg-transparent border border-[#2a2d36] text-gray-400 hover:text-gray-200'
              }`}
            >
              Chỉ xe ra
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#2a2d36] bg-[#16181d] sticky top-0 z-10">
                <th className="p-4 text-xs font-medium text-gray-400 uppercase tracking-wider">Thời gian</th>
                <th className="p-4 text-xs font-medium text-gray-400 uppercase tracking-wider">Hình ảnh</th>
                <th className="p-4 text-xs font-medium text-gray-400 uppercase tracking-wider">Nhận diện</th>
                <th className="p-4 text-xs font-medium text-gray-400 uppercase tracking-wider">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a2d36]">
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-500 text-sm">
                    {events.length === 0 
                      ? 'Chưa có phương tiện nào được phát hiện. Đang chờ dữ liệu từ Python Worker...'
                      : 'Không có phương tiện nào phù hợp với bộ lọc.'}
                  </td>
                </tr>
              ) : (
                filteredEvents.map((event) => (
                <tr key={event.id} className="hover:bg-[#1a1d24] transition-colors">
                  <td className="p-4 whitespace-nowrap">
                    <div className="text-sm text-gray-200">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(event.timestamp).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="p-4">
                    <div 
                      className="w-24 h-16 rounded overflow-hidden border border-[#2a2d36] relative group cursor-pointer"
                      onClick={() => setSelectedImage(event.image_url)}
                    >
                      <img 
                        src={event.image_url} 
                        alt="Phương tiện" 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <ScanLine className="w-5 h-5 text-white" />
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 border border-blue-500/20 rounded text-xs font-medium text-blue-400 w-fit">
                        <Car className="w-3 h-3" />
                        Phát hiện phương tiện
                      </div>
                      {event.confidence && (
                        <span className="text-[10px] text-gray-500">
                          Độ tin cậy: {Math.round(event.confidence * 100)}%
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                      event.type === 'in' 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                        : 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                    }`}>
                      {event.type === 'in' ? <LogIn className="w-3.5 h-3.5" /> : <LogOut className="w-3.5 h-3.5" />}
                      {event.type === 'in' ? 'Vào bãi' : 'Ra bãi'}
                    </span>
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Image Modal */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-5xl w-full max-h-[90vh] flex items-center justify-center" onClick={e => e.stopPropagation()}>
            <button 
              className="absolute -top-12 right-0 text-gray-400 hover:text-white transition-colors bg-[#1a1d24] p-2 rounded-full border border-[#2a2d36]"
              onClick={() => setSelectedImage(null)}
            >
              <X className="w-6 h-6" />
            </button>
            <img 
              src={selectedImage} 
              alt="Phóng to" 
              className="max-w-full max-h-[85vh] object-contain rounded-lg border border-[#2a2d36] shadow-2xl"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      )}
    </div>
  );
}
