import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import LiveView from './components/LiveView';
import DeviceStatus from './components/DeviceStatus';
import VehicleLog from './components/VehicleLog';
import TallyLog from './components/TallyLog';
import DeviceManagement from './components/DeviceManagement';
import AIChatbox from './components/AIChatbox';
import ContainerGate from './components/ContainerGate';
import { Tab, DVR, Camera } from './types';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { mockDVRs, mockCameras } from './data/mock';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('container_gate');
  const [dvrs, setDvrs] = useState<DVR[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [useMock, setUseMock] = useState(!isSupabaseConfigured());

  const fetchData = async () => {
    setLoading(true);
    try {
      if (!isSupabaseConfigured()) throw new Error('No Supabase');
      
      const dvrPromise = supabase.from('dvrs').select('*').order('created_at', { ascending: true });
      const camPromise = supabase.from('cameras').select('*').order('created_at', { ascending: true });
      
      const [dvrResult, camResult] = await Promise.all([dvrPromise, camPromise]);
      
      if (dvrResult.error) throw dvrResult.error;
      if (camResult.error) throw camResult.error;

      setDvrs(dvrResult.data || []);
      setCameras(camResult.data || []);
      setUseMock(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setDvrs(prev => prev.length === 0 ? mockDVRs : prev);
      setCameras(prev => prev.length === 0 ? mockCameras : prev);
      setUseMock(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#0f1115]">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="flex-1 p-6 overflow-hidden relative">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-400">Đang tải dữ liệu...</div>
        ) : (
          <>
            {activeTab === 'live' && <LiveView dvrs={dvrs} cameras={cameras} />}
            {activeTab === 'status' && <DeviceStatus dvrs={dvrs} cameras={cameras} />}
            {activeTab === 'vehicles' && <VehicleLog dvrs={dvrs} cameras={cameras} />}
            {activeTab === 'tally' && <TallyLog />}
            {activeTab === 'container_gate' && <ContainerGate />}
            {activeTab === 'management' && (
              <DeviceManagement 
                dvrs={dvrs} 
                cameras={cameras} 
                setDvrs={setDvrs} 
                setCameras={setCameras} 
                useMock={useMock} 
                refetch={fetchData} 
              />
            )}
            
            {/* AI Chatbox Assistant */}
            <AIChatbox 
              dvrs={dvrs} 
              cameras={cameras} 
              setDvrs={setDvrs} 
              setCameras={setCameras} 
              useMock={useMock} 
              refetch={fetchData} 
            />
          </>
        )}
      </main>
    </div>
  );
}
