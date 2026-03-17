import React from 'react';
import { LayoutGrid, Activity, Car, Camera as CameraIcon, Settings, ShieldCheck } from 'lucide-react';
import { Tab } from '../types';

interface SidebarProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

export default function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  const navItems = [
    { id: 'live', label: 'Xem Trực Tiếp', icon: LayoutGrid },
    { id: 'status', label: 'Trạng Thái & Lịch Sử', icon: Activity },
    { id: 'vehicles', label: 'Quản Lý Xe Ra Vào', icon: Car },
    { id: 'tally', label: 'Tally Container', icon: CameraIcon },
    { id: 'container_gate', label: 'Cổng Container AI', icon: ShieldCheck },
    { id: 'management', label: 'Quản Lý Thiết Bị', icon: Settings },
  ] as const;

  return (
    <div className="w-64 bg-[#16181d] border-r border-[#2a2d36] flex flex-col h-full">
      <div className="p-6 flex items-center gap-3 border-b border-[#2a2d36]">
        <div className="bg-blue-500/20 p-2 rounded-lg">
          <CameraIcon className="w-6 h-6 text-blue-400" />
        </div>
        <div>
          <h1 className="font-semibold text-gray-100 leading-tight">CamGuard</h1>
          <p className="text-xs text-gray-400">Hệ thống giám sát</p>
        </div>
      </div>
      
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                isActive 
                  ? 'bg-blue-500/10 text-blue-400' 
                  : 'text-gray-400 hover:bg-[#20232b] hover:text-gray-200'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium text-sm">{item.label}</span>
            </button>
          );
        })}
      </nav>
      
      <div className="p-4 border-t border-[#2a2d36]">
        <div className="bg-[#20232b] rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">Hệ thống</span>
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Online
            </span>
          </div>
          <p className="text-xs text-gray-500 font-mono">Design by GIABIN</p>
        </div>
      </div>
    </div>
  );
}
