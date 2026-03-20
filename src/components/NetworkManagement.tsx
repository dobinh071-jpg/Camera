import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { NetworkDevice, NetworkAlert, NetworkSubnet } from '../types';
import { Network, Monitor, Smartphone, Printer, Server, Camera, HelpCircle, Edit2, Search, Wifi, WifiOff, Clock, User, Laptop, AlertTriangle, CheckCircle, Layers, Globe, Settings, Plus, Trash2, X } from 'lucide-react';

export default function NetworkManagement() {
  const [devices, setDevices] = useState<NetworkDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubnet, setSelectedSubnet] = useState<string>('all');
  const [editingDevice, setEditingDevice] = useState<NetworkDevice | null>(null);
  const [alerts, setAlerts] = useState<NetworkAlert[]>([]);
  const [managedSubnets, setManagedSubnets] = useState<NetworkSubnet[]>([]);
  const [isSubnetModalOpen, setIsSubnetModalOpen] = useState(false);
  const [editingSubnetId, setEditingSubnetId] = useState<string | null>(null);
  const [newSubnet, setNewSubnet] = useState('');
  const [newSubnetName, setNewSubnetName] = useState('');

  // Form state
  const [deviceName, setDeviceName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [deviceType, setDeviceType] = useState<NetworkDevice['device_type']>('unknown');

  useEffect(() => {
    fetchDevices();
    fetchAlerts();
    fetchSubnets();
    
    // Subscribe to real-time changes
    const subscription = supabase
      .channel('network_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'network_devices' }, () => {
        fetchDevices();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'network_alerts' }, () => {
        fetchAlerts();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'network_subnets' }, () => {
        fetchSubnets();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchAlerts = async () => {
    try {
      const { data, error } = await supabase
        .from('network_alerts')
        .select('*')
        .eq('resolved', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAlerts(data || []);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    }
  };

  const fetchSubnets = async () => {
    try {
      const { data, error } = await supabase
        .from('network_subnets')
        .select('*')
        .order('subnet', { ascending: true });

      if (error) throw error;
      setManagedSubnets(data || []);
    } catch (error) {
      console.error('Error fetching subnets:', error);
    }
  };

  const handleSaveSubnet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubnet) return;

    // Clean up subnet input
    let cleanedSubnet = newSubnet.trim();
    
    // If user just enters a number like "44", auto format to "192.168.44"
    if (/^\d+$/.test(cleanedSubnet)) {
      cleanedSubnet = `192.168.${cleanedSubnet}`;
    } else {
      cleanedSubnet = cleanedSubnet.replace(/\.0\/24$/, '').replace(/\.x$/, '');
    }
    
    // Ensure it has exactly 3 octets
    const parts = cleanedSubnet.split('.');
    if (parts.length > 3) {
      cleanedSubnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
    } else if (parts.length < 3) {
      alert('Định dạng dải mạng không hợp lệ. Vui lòng nhập 3 nhóm số (VD: 192.168.1) hoặc chỉ nhập số của dải (VD: 44)');
      return;
    }

    try {
      if (editingSubnetId) {
        const { error } = await supabase
          .from('network_subnets')
          .update({ subnet: cleanedSubnet, name: newSubnetName })
          .eq('id', editingSubnetId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('network_subnets')
          .insert([{ subnet: cleanedSubnet, name: newSubnetName }]);
        if (error) throw error;
      }
      
      setNewSubnet('');
      setNewSubnetName('');
      setEditingSubnetId(null);
      fetchSubnets();
    } catch (error) {
      console.error('Error saving subnet:', error);
      alert('Có lỗi xảy ra khi lưu dải mạng. Có thể dải mạng này đã tồn tại.');
    }
  };

  const cancelEditSubnet = () => {
    setEditingSubnetId(null);
    setNewSubnet('');
    setNewSubnetName('');
  };

  const handleDeleteSubnet = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa dải mạng này?')) return;
    
    try {
      const { error } = await supabase
        .from('network_subnets')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchSubnets();
    } catch (error) {
      console.error('Error deleting subnet:', error);
      alert('Có lỗi xảy ra khi xóa dải mạng.');
    }
  };

  const resolveAlert = async (id: string) => {
    try {
      const { error } = await supabase
        .from('network_alerts')
        .update({ resolved: true })
        .eq('id', id);

      if (error) throw error;
      fetchAlerts();
    } catch (error) {
      console.error('Error resolving alert:', error);
    }
  };

  const fetchDevices = async () => {
    try {
      const { data, error } = await supabase
        .from('network_devices')
        .select('*')
        .order('status', { ascending: true }) // Online first (o comes before o, wait: offline vs online. 'offline' < 'online', so we want descending for online first)
        .order('last_seen', { ascending: false });

      if (error) throw error;
      
      // Sort: Online first, then by last_seen
      const sorted = (data || []).sort((a, b) => {
        if (a.status === 'online' && b.status === 'offline') return -1;
        if (a.status === 'offline' && b.status === 'online') return 1;
        return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime();
      });
      
      setDevices(sorted);
    } catch (error) {
      console.error('Error fetching network devices:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (device: NetworkDevice) => {
    setEditingDevice(device);
    setDeviceName(device.device_name || '');
    setOwnerName(device.owner_name || '');
    setDeviceType(device.device_type || 'unknown');
  };

  const handleSave = async () => {
    if (!editingDevice) return;

    try {
      const { error } = await supabase
        .from('network_devices')
        .update({
          device_name: deviceName,
          owner_name: ownerName,
          device_type: deviceType
        })
        .eq('id', editingDevice.id);

      if (error) throw error;
      
      setEditingDevice(null);
      fetchDevices();
    } catch (error) {
      console.error('Error updating device:', error);
      alert('Có lỗi xảy ra khi cập nhật thông tin thiết bị.');
    }
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'pc': return <Monitor className="w-5 h-5 text-blue-400" />;
      case 'laptop': return <Laptop className="w-5 h-5 text-indigo-400" />;
      case 'phone': return <Smartphone className="w-5 h-5 text-emerald-400" />;
      case 'printer': return <Printer className="w-5 h-5 text-purple-400" />;
      case 'server': return <Server className="w-5 h-5 text-orange-400" />;
      case 'camera': return <Camera className="w-5 h-5 text-rose-400" />;
      default: return <HelpCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getDeviceTypeName = (type: string) => {
    switch (type) {
      case 'pc': return 'Máy bàn (PC)';
      case 'laptop': return 'Laptop';
      case 'phone': return 'Điện thoại/Tablet';
      case 'printer': return 'Máy in';
      case 'server': return 'Máy chủ (Server)';
      case 'camera': return 'Camera';
      default: return 'Chưa xác định';
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'Vừa xong';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} phút trước`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} giờ trước`;
    return `${Math.floor(diffInSeconds / 86400)} ngày trước`;
  };

  const getSubnet = (ip: string) => {
    if (!ip) return 'Unknown';
    const parts = ip.split('.');
    if (parts.length >= 3) {
      return `${parts[0]}.${parts[1]}.${parts[2]}`;
    }
    return 'Unknown';
  };

  const subnets = Array.from(new Set([
    ...managedSubnets.map(s => s.subnet),
    ...devices.map(d => getSubnet(d.last_ip_address))
  ]))
    .filter(s => s !== 'Unknown')
    .sort((a, b) => {
      const aOctet = parseInt(a.split('.')[2]) || 0;
      const bOctet = parseInt(b.split('.')[2]) || 0;
      return aOctet - bOctet;
    });

  const filteredDevices = devices.filter(d => {
    const matchesSearch = 
      d.mac_address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.last_ip_address.includes(searchTerm) ||
      (d.device_name && d.device_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (d.owner_name && d.owner_name.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesSubnet = selectedSubnet === 'all' || getSubnet(d.last_ip_address) === selectedSubnet;
    
    return matchesSearch && matchesSubnet;
  });

  const onlineCount = devices.filter(d => d.status === 'online').length;
  const offlineCount = devices.length - onlineCount;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-100 flex items-center gap-2">
            <Network className="w-6 h-6 text-blue-400" />
            Quản Lý Mạng Nội Bộ
          </h2>
          <p className="text-sm text-gray-400 mt-1">Giám sát các thiết bị đang kết nối trong mạng LAN/Wifi</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-[#16181d] px-4 py-2 rounded-lg border border-[#2a2d36]">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-sm font-medium text-gray-300">Đang Online: <span className="text-emerald-400">{onlineCount}</span>/{devices.length}</span>
          </div>
          
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Tìm MAC, IP, Tên, Người dùng..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 bg-[#16181d] border border-[#2a2d36] rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500 w-64"
            />
          </div>
          
          <button
            onClick={() => setIsSubnetModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#16181d] hover:bg-[#2a2d36] border border-[#2a2d36] text-gray-300 rounded-lg text-sm font-medium transition-colors"
          >
            <Settings className="w-4 h-4" />
            Quản lý dải mạng
          </button>
        </div>
      </div>

      {/* Subnet Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-6">
        <div 
          onClick={() => setSelectedSubnet('all')}
          className={`bg-[#16181d] border rounded-xl p-4 cursor-pointer transition-all ${
            selectedSubnet === 'all' ? 'border-blue-500 ring-1 ring-blue-500/50' : 'border-[#2a2d36] hover:border-gray-600'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-400">Tất cả dải mạng</h3>
            <Globe className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex items-end justify-between">
            <div className="text-2xl font-bold text-gray-100">{devices.length}</div>
            <div className="text-xs text-emerald-400 font-medium">{onlineCount} online</div>
          </div>
        </div>

        {subnets.map(subnet => {
          const subnetDevices = devices.filter(d => getSubnet(d.last_ip_address) === subnet);
          const subnetOnline = subnetDevices.filter(d => d.status === 'online').length;
          const managedInfo = managedSubnets.find(s => s.subnet === subnet);
          
          return (
            <div 
              key={subnet}
              onClick={() => setSelectedSubnet(subnet)}
              className={`bg-[#16181d] border rounded-xl p-4 cursor-pointer transition-all ${
                selectedSubnet === subnet ? 'border-blue-500 ring-1 ring-blue-500/50' : 'border-[#2a2d36] hover:border-gray-600'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex flex-col">
                  <h3 className="text-sm font-medium text-gray-300 font-mono">{subnet}.x</h3>
                  {managedInfo?.name && (
                    <span className="text-xs text-gray-500 mt-0.5">{managedInfo.name}</span>
                  )}
                </div>
                <Server className="w-4 h-4 text-gray-500" />
              </div>
              <div className="flex items-end justify-between mt-2">
                <div className="text-2xl font-bold text-gray-100">{subnetDevices.length}</div>
                <div className="text-xs text-emerald-400 font-medium">{subnetOnline} online</div>
              </div>
            </div>
          );
        })}
      </div>

      {alerts.length > 0 && (
        <div className="mb-6 space-y-3">
          {alerts.map(alert => (
            <div key={alert.id} className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-red-500/20 rounded-lg mt-0.5">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-red-400 font-medium">{alert.message}</h3>
                  <p className="text-sm text-red-400/70 mt-1">
                    IP <span className="font-mono font-bold text-red-300">{alert.ip_address}</span> đang bị tranh chấp giữa MAC <span className="font-mono text-red-300">{alert.mac_1.toUpperCase()}</span> và <span className="font-mono text-red-300">{alert.mac_2.toUpperCase()}</span>.
                  </p>
                  <p className="text-xs text-red-400/50 mt-2">Phát hiện lúc: {new Date(alert.created_at).toLocaleString('vi-VN')}</p>
                </div>
              </div>
              <button 
                onClick={() => resolveAlert(alert.id)}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-sm font-medium transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                Đã xử lý
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 bg-[#16181d] rounded-xl border border-[#2a2d36] overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#1a1d24] border-b border-[#2a2d36] text-sm text-gray-400">
                <th className="p-4 font-medium">Thiết bị</th>
                <th className="p-4 font-medium">Người sử dụng</th>
                <th className="p-4 font-medium">Địa chỉ IP (Hiện tại)</th>
                <th className="p-4 font-medium">Địa chỉ MAC</th>
                <th className="p-4 font-medium">Trạng thái</th>
                <th className="p-4 font-medium">Hoạt động cuối</th>
                <th className="p-4 font-medium w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a2d36]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">Đang tải dữ liệu...</td>
                </tr>
              ) : filteredDevices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">
                    Chưa có thiết bị nào được phát hiện. Hãy chạy script Python quét mạng.
                  </td>
                </tr>
              ) : (
                filteredDevices.map((device) => (
                  <tr key={device.id} className="hover:bg-[#1a1d24] transition-colors group">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-[#20232b] rounded-lg">
                          {getDeviceIcon(device.device_type)}
                        </div>
                        <div>
                          <div className="font-medium text-gray-200">
                            {device.device_name || <span className="text-gray-500 italic">Thiết bị chưa xác định</span>}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {getDeviceTypeName(device.device_type)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-500" />
                        <span className={device.owner_name ? 'text-gray-300' : 'text-gray-600 italic'}>
                          {device.owner_name || 'Chưa gán'}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="font-mono text-sm text-blue-400 bg-blue-400/10 px-2 py-1 rounded">
                        {device.last_ip_address}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="font-mono text-sm text-gray-400">
                        {device.mac_address.startsWith('routed:') ? (
                          <span className="text-gray-500 italic text-xs">Khác Subnet (Chỉ có IP)</span>
                        ) : (
                          device.mac_address.toUpperCase()
                        )}
                      </span>
                    </td>
                    <td className="p-4">
                      {device.status === 'online' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <Wifi className="w-3.5 h-3.5" />
                          Online
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-500/10 text-gray-400 border border-gray-500/20">
                          <WifiOff className="w-3.5 h-3.5" />
                          Offline
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5 text-sm text-gray-400">
                        <Clock className="w-4 h-4 opacity-70" />
                        {device.status === 'online' ? 'Đang hoạt động' : formatTimeAgo(device.last_seen)}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <button 
                        onClick={() => handleEdit(device)}
                        className="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        title="Chỉnh sửa thông tin"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editingDevice && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#16181d] rounded-xl border border-[#2a2d36] w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-[#2a2d36] flex justify-between items-center bg-[#1a1d24]">
              <h3 className="font-medium text-gray-200">Cập nhật thông tin thiết bị</h3>
              <button 
                onClick={() => setEditingDevice(null)}
                className="text-gray-400 hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="bg-[#20232b] p-3 rounded-lg border border-[#2a2d36] mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-500">MAC Address:</span>
                  <span className="font-mono text-gray-300">{editingDevice.mac_address.toUpperCase()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">IP Hiện tại:</span>
                  <span className="font-mono text-blue-400">{editingDevice.last_ip_address}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">Loại thiết bị</label>
                <select
                  value={deviceType}
                  onChange={(e) => setDeviceType(e.target.value as any)}
                  className="w-full bg-[#1a1d24] border border-[#2a2d36] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="unknown">Chưa xác định</option>
                  <option value="pc">Máy bàn (PC)</option>
                  <option value="laptop">Laptop</option>
                  <option value="phone">Điện thoại / Tablet</option>
                  <option value="printer">Máy in mạng</option>
                  <option value="server">Máy chủ (Server)</option>
                  <option value="camera">Camera IP</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">Tên thiết bị (Gợi nhớ)</label>
                <input
                  type="text"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="VD: Laptop Dell XPS, iPhone 14 Pro..."
                  className="w-full bg-[#1a1d24] border border-[#2a2d36] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">Người sử dụng / Sở hữu</label>
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="VD: Anh Tuấn IT, Chị Lan Kế toán..."
                  className="w-full bg-[#1a1d24] border border-[#2a2d36] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="p-4 border-t border-[#2a2d36] flex justify-end gap-3 bg-[#1a1d24]">
              <button
                onClick={() => setEditingDevice(null)}
                className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-gray-200 transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
              >
                Lưu thông tin
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subnet Management Modal */}
      {isSubnetModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#16181d] rounded-xl border border-[#2a2d36] w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-[#2a2d36] flex justify-between items-center bg-[#1a1d24]">
              <h3 className="font-medium text-gray-200 flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-400" />
                Quản lý dải mạng (Subnets)
              </h3>
              <button 
                onClick={() => setIsSubnetModalOpen(false)}
                className="text-gray-400 hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="mb-6 bg-[#1a1d24] p-4 rounded-xl border border-[#2a2d36]">
                <h4 className="text-sm font-medium text-gray-300 mb-3">
                  {editingSubnetId ? 'Cập nhật dải mạng' : 'Thêm dải mạng mới'}
                </h4>
                <form onSubmit={handleSaveSubnet} className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Dải mạng (VD: 192.168.1)</label>
                    <input
                      type="text"
                      value={newSubnet}
                      onChange={(e) => setNewSubnet(e.target.value)}
                      placeholder="192.168.1"
                      className="w-full bg-[#16181d] border border-[#2a2d36] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                      required
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Mô tả (VD: Tầng 1 - Kế toán)</label>
                    <input
                      type="text"
                      value={newSubnetName}
                      onChange={(e) => setNewSubnetName(e.target.value)}
                      placeholder="Tầng 1 - Kế toán"
                      className="w-full bg-[#16181d] border border-[#2a2d36] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 h-[38px]"
                    >
                      {editingSubnetId ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                      {editingSubnetId ? 'Lưu' : 'Thêm'}
                    </button>
                    {editingSubnetId && (
                      <button
                        type="button"
                        onClick={cancelEditSubnet}
                        className="px-4 py-2 bg-[#2a2d36] hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors h-[38px]"
                      >
                        Hủy
                      </button>
                    )}
                  </div>
                </form>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-300 mb-3">Danh sách dải mạng đang quản lý</h4>
                {managedSubnets.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 text-sm bg-[#1a1d24] rounded-xl border border-[#2a2d36] border-dashed">
                    Chưa có dải mạng nào được cấu hình.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {managedSubnets.map(subnet => (
                      <div key={subnet.id} className="flex items-center justify-between p-3 bg-[#1a1d24] border border-[#2a2d36] rounded-lg">
                        <div>
                          <div className="font-mono text-blue-400 font-medium">{subnet.subnet}.x</div>
                          {subnet.name && <div className="text-sm text-gray-400 mt-0.5">{subnet.name}</div>}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingSubnetId(subnet.id);
                              setNewSubnet(subnet.subnet);
                              setNewSubnetName(subnet.name || '');
                            }}
                            className="p-2 text-gray-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"
                            title="Sửa dải mạng"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteSubnet(subnet.id)}
                            className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                            title="Xóa dải mạng"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
