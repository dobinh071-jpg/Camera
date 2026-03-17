import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { DVR, Camera } from '../types';
import { Plus, Edit2, Trash2, Server, Camera as CameraIcon, AlertTriangle, X, ChevronRight, MonitorPlay } from 'lucide-react';

interface Props {
  dvrs: DVR[];
  cameras: Camera[];
  setDvrs: React.Dispatch<React.SetStateAction<DVR[]>>;
  setCameras: React.Dispatch<React.SetStateAction<Camera[]>>;
  useMock: boolean;
  refetch: () => void;
}

export default function DeviceManagement({ dvrs, cameras, setDvrs, setCameras, useMock, refetch }: Props) {
  const [selectedDvrId, setSelectedDvrId] = useState<string | null>(null);

  // Modal states
  const [isDvrModalOpen, setIsDvrModalOpen] = useState(false);
  const [isCamModalOpen, setIsCamModalOpen] = useState(false);
  const [editingDvr, setEditingDvr] = useState<DVR | null>(null);
  const [editingCam, setEditingCam] = useState<Camera | null>(null);

  useEffect(() => {
    if (dvrs.length > 0 && !selectedDvrId) {
      setSelectedDvrId(dvrs[0].id);
    }
  }, [dvrs, selectedDvrId]);

  const handleSaveDvr = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newDvr = {
      name: formData.get('name') as string,
      location: formData.get('location') ? formData.get('location') as string : null,
      ip_address: formData.get('ip_address') as string,
      port: parseInt(formData.get('port') as string, 10) || 80,
      password: formData.get('password') ? formData.get('password') as string : null,
      type: formData.get('type') as 'hikvision' | 'dahua' | 'other',
      can_view_direct: formData.get('can_view_direct') === 'on',
    };

    if (useMock) {
      if (editingDvr) {
        setDvrs(dvrs.map(d => d.id === editingDvr.id ? { ...d, ...newDvr } : d));
      } else {
        const id = `dvr-${Date.now()}`;
        setDvrs([...dvrs, { ...newDvr, id }]);
        setSelectedDvrId(id);
      }
    } else {
      try {
        if (editingDvr) {
          const { error } = await supabase.from('dvrs').update(newDvr).eq('id', editingDvr.id);
          if (error) throw error;
        } else {
          const { data, error } = await supabase.from('dvrs').insert([newDvr]).select();
          if (error) throw error;
          if (data && data.length > 0) {
            setSelectedDvrId(data[0].id);
          }
        }
        refetch();
      } catch (error: any) {
        console.error('Error saving DVR:', error);
        alert(`Có lỗi xảy ra khi lưu Đầu ghi: ${error?.message || 'Lỗi không xác định'}`);
      }
    }
    setIsDvrModalOpen(false);
    setEditingDvr(null);
  };

  const handleDeleteDvr = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Bạn có chắc chắn muốn xoá Đầu ghi này? Tất cả camera thuộc đầu ghi cũng sẽ bị xoá.')) return;
    
    // Optimistic update
    setDvrs(prev => prev.filter(d => d.id !== id));
    setCameras(prev => prev.filter(c => c.dvr_id !== id));
    if (selectedDvrId === id) {
      setSelectedDvrId(dvrs.find(d => d.id !== id)?.id || null);
    }

    if (!useMock) {
      try {
        const { error } = await supabase.from('dvrs').delete().eq('id', id);
        if (error) throw error;
      } catch (error) {
        console.error('Error deleting DVR:', error);
        alert('Có lỗi xảy ra khi xoá Đầu ghi.');
        refetch(); // Revert optimistic update
      }
    }
  };

  const handleSaveCam = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newCam = {
      name: formData.get('name') as string,
      dvr_id: selectedDvrId as string,
      ip_address: formData.get('ip_address') as string,
      password: formData.get('password') ? formData.get('password') as string : null,
      stream_url: formData.get('stream_url') ? formData.get('stream_url') as string : null,
    };

    if (useMock) {
      if (editingCam) {
        setCameras(cameras.map(c => c.id === editingCam.id ? { ...c, ...newCam } : c));
      } else {
        setCameras([...cameras, { ...newCam, id: `cam-${Date.now()}` }]);
      }
    } else {
      try {
        if (editingCam) {
          const { error } = await supabase.from('cameras').update(newCam).eq('id', editingCam.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('cameras').insert([newCam]);
          if (error) throw error;
        }
        refetch();
      } catch (error: any) {
        console.error('Error saving camera:', error);
        alert(`Có lỗi xảy ra khi lưu Camera: ${error?.message || 'Lỗi không xác định'}`);
      }
    }
    setIsCamModalOpen(false);
    setEditingCam(null);
  };

  const handleDeleteCam = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xoá Camera này?')) return;
    
    // Optimistic update
    setCameras(prev => prev.filter(c => c.id !== id));

    if (!useMock) {
      try {
        const { error } = await supabase.from('cameras').delete().eq('id', id);
        if (error) throw error;
      } catch (error) {
        console.error('Error deleting camera:', error);
        alert('Có lỗi xảy ra khi xoá Camera.');
        refetch(); // Revert optimistic update
      }
    }
  };

  const selectedDvr = dvrs.find(d => d.id === selectedDvrId);
  const selectedDvrCameras = cameras.filter(c => c.dvr_id === selectedDvrId);

  const getStreamUrl = (cam: Camera, dvr?: DVR) => {
    if (cam.stream_url) return cam.stream_url;
    if (!cam.ip_address) return '';
    
    const type = dvr?.type || 'hikvision';
    const rawPassword = cam.password || dvr?.password || '';
    const password = rawPassword ? `admin:${rawPassword}@` : '';
    
    const cleanIp = cam.ip_address.replace(/^https?:\/\//, '').trim();
    
    if (type === 'dahua') {
      return `http://${password}${cleanIp}/cgi-bin/snapshot.cgi?channel=1`;
    }
    // Mặc định dùng chuẩn Hikvision cho các loại khác
    return `http://${password}${cleanIp}/ISAPI/Streaming/channels/101/picture`;
  };

  return (
    <div className="h-full flex flex-col gap-6 relative">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-xl font-semibold text-gray-100">Quản Lý Thiết Bị</h2>
          <p className="text-sm text-gray-400">Quản lý Đầu ghi và Camera tương ứng</p>
        </div>
        {useMock && (
          <div className="flex items-center gap-2 bg-orange-500/10 text-orange-400 px-3 py-2 rounded-lg border border-orange-500/20 text-sm">
            <AlertTriangle className="w-4 h-4" />
            Đang dùng dữ liệu mẫu (Chưa cấu hình Supabase)
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* DVR List (Left Panel) */}
        <div className="lg:col-span-1 flex flex-col bg-[#16181d] rounded-xl border border-[#2a2d36] overflow-hidden">
          <div className="p-4 border-b border-[#2a2d36] flex justify-between items-center bg-[#1a1d24]">
            <h3 className="font-medium text-gray-200 flex items-center gap-2">
              <Server className="w-4 h-4 text-blue-400" />
              Danh sách Đầu ghi
            </h3>
            <button 
              onClick={() => { setEditingDvr(null); setIsDvrModalOpen(true); }}
              className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
              title="Thêm Đầu ghi"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {dvrs.length === 0 ? (
              <div className="text-center text-gray-500 py-8 text-sm">Chưa có đầu ghi nào</div>
            ) : (
              dvrs.map(dvr => (
                <div 
                  key={dvr.id} 
                  onClick={() => setSelectedDvrId(dvr.id)}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedDvrId === dvr.id 
                      ? 'bg-blue-500/10 border-blue-500/30' 
                      : 'bg-[#20232b] border-[#2a2d36] hover:border-gray-600'
                  }`}
                >
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className={`font-medium truncate ${selectedDvrId === dvr.id ? 'text-blue-400' : 'text-gray-200'}`}>
                        {dvr.name}
                      </h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-500 truncate">{dvr.ip_address}:{dvr.port}</span>
                      {dvr.can_view_direct && (
                        <MonitorPlay className="w-3 h-3 text-blue-500 flex-shrink-0" title="Hỗ trợ xem trực tiếp" />
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setEditingDvr(dvr); setIsDvrModalOpen(true); }}
                      className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-400/10 rounded transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={(e) => handleDeleteDvr(dvr.id, e)}
                      className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <ChevronRight className={`w-4 h-4 ml-1 ${selectedDvrId === dvr.id ? 'text-blue-400' : 'text-gray-600'}`} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Camera List (Right Panel) */}
        <div className="lg:col-span-2 flex flex-col bg-[#16181d] rounded-xl border border-[#2a2d36] overflow-hidden">
          {selectedDvr ? (
            <>
              <div className="p-4 border-b border-[#2a2d36] flex justify-between items-center bg-[#1a1d24]">
                <div>
                  <h3 className="font-medium text-gray-200 flex items-center gap-2">
                    <CameraIcon className="w-4 h-4 text-emerald-400" />
                    Camera thuộc {selectedDvr.name}
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">IP: {selectedDvr.ip_address} • {selectedDvr.location}</p>
                </div>
                <button 
                  onClick={() => { setEditingCam(null); setIsCamModalOpen(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-md transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Thêm Camera
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {selectedDvrCameras.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-3">
                    <CameraIcon className="w-12 h-12 opacity-20" />
                    <p>Đầu ghi này chưa có camera nào.</p>
                    <button 
                      onClick={() => { setEditingCam(null); setIsCamModalOpen(true); }}
                      className="text-emerald-400 hover:text-emerald-300 text-sm font-medium"
                    >
                      + Thêm camera đầu tiên
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedDvrCameras.map((cam, index) => (
                      <div key={`${cam.id}-${index}`} className="flex flex-col bg-[#20232b] rounded-lg border border-[#2a2d36] overflow-hidden">
                        <div className="p-3 flex justify-between items-start border-b border-[#2a2d36]/50">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-medium text-gray-200">{cam.name}</h4>
                            </div>
                            <span className="text-xs font-mono text-gray-500">{cam.ip_address}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => { setEditingCam(cam); setIsCamModalOpen(true); }}
                              className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-emerald-400/10 rounded transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => handleDeleteCam(cam.id)}
                              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="p-3 bg-[#1a1d24] text-xs font-mono text-gray-500 truncate" title={getStreamUrl(cam, selectedDvr)}>
                          {getStreamUrl(cam, selectedDvr) || 'Chưa cấu hình luồng'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-3">
              <Server className="w-12 h-12 opacity-20" />
              <p>Chọn một Đầu ghi ở danh sách bên trái để xem và quản lý Camera.</p>
            </div>
          )}
        </div>
      </div>

      {/* DVR Modal */}
      {isDvrModalOpen && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#16181d] border border-[#2a2d36] rounded-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-[#2a2d36] flex justify-between items-center bg-[#1a1d24]">
              <h3 className="font-medium text-gray-200">{editingDvr ? 'Sửa Đầu ghi' : 'Thêm Đầu ghi mới'}</h3>
              <button onClick={() => setIsDvrModalOpen(false)} className="text-gray-400 hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveDvr} className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Tên Đầu ghi</label>
                <input required name="name" defaultValue={editingDvr?.name} className="w-full bg-[#0f1115] border border-[#2a2d36] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Vị trí</label>
                <input required name="location" defaultValue={editingDvr?.location} className="w-full bg-[#0f1115] border border-[#2a2d36] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Địa chỉ IP (LAN)</label>
                <input required name="ip_address" defaultValue={editingDvr?.ip_address} className="w-full bg-[#0f1115] border border-[#2a2d36] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Cổng (Port)</label>
                  <input type="number" required name="port" defaultValue={editingDvr?.port || 80} className="w-full bg-[#0f1115] border border-[#2a2d36] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Mật khẩu</label>
                  <input type="password" required name="password" defaultValue={editingDvr?.password} className="w-full bg-[#0f1115] border border-[#2a2d36] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Loại Đầu ghi</label>
                <select name="type" defaultValue={editingDvr?.type || 'other'} className="w-full bg-[#0f1115] border border-[#2a2d36] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500">
                  <option value="hikvision">Hikvision / KBVision</option>
                  <option value="dahua">Dahua</option>
                  <option value="other">Khác</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="can_view_direct" name="can_view_direct" defaultChecked={editingDvr?.can_view_direct} className="rounded border-[#2a2d36] bg-[#0f1115] text-blue-500 focus:ring-blue-500" />
                <label htmlFor="can_view_direct" className="text-sm text-gray-300">Hỗ trợ xem trực tiếp trên đầu ghi</label>
              </div>
              <div className="pt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setIsDvrModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-gray-200">Hủy</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">Lưu</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Camera Modal */}
      {isCamModalOpen && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#16181d] border border-[#2a2d36] rounded-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-[#2a2d36] flex justify-between items-center bg-[#1a1d24]">
              <h3 className="font-medium text-gray-200">{editingCam ? 'Sửa Camera' : 'Thêm Camera mới'}</h3>
              <button onClick={() => setIsCamModalOpen(false)} className="text-gray-400 hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveCam} className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Tên Camera</label>
                <input required name="name" defaultValue={editingCam?.name} className="w-full bg-[#0f1115] border border-[#2a2d36] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Địa chỉ IP (LAN)</label>
                <input required name="ip_address" defaultValue={editingCam?.ip_address} className="w-full bg-[#0f1115] border border-[#2a2d36] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Mật khẩu Camera (Tùy chọn)</label>
                <input name="password" type="password" defaultValue={editingCam?.password} className="w-full bg-[#0f1115] border border-[#2a2d36] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-emerald-500" placeholder="Mặc định: abcd1234 hoặc theo Đầu ghi" />
                <p className="text-[10px] text-gray-500 mt-1">
                  Nếu để trống, hệ thống sẽ sử dụng mật khẩu của Đầu ghi.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Stream URL (Tùy chọn)</label>
                <input name="stream_url" defaultValue={editingCam?.stream_url} className="w-full bg-[#0f1115] border border-[#2a2d36] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-emerald-500" placeholder="Để trống để tự động xem trực tiếp" />
                <p className="text-[10px] text-gray-500 mt-1">
                  Hãy <b>để trống</b> ô này. Hệ thống sẽ tự động sinh link xem trực tiếp (Snapshot Mode) dựa trên IP của Camera và loại Đầu ghi. Chỉ nhập khi bạn có link luồng riêng biệt.
                </p>
              </div>
              <div className="pt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setIsCamModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-gray-200">Hủy</button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors">Lưu</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
