export type Tab = 'live' | 'status' | 'vehicles' | 'tally' | 'management' | 'container_gate' | 'network';

export interface Camera {
  id: string;
  name: string;
  dvr_id: string;
  ip_address: string;
  password?: string;
  stream_url?: string;
  status?: string;
}

export interface DVR {
  id: string;
  name: string;
  location: string;
  ip_address: string;
  port: number;
  password?: string;
  type?: 'hikvision' | 'dahua' | 'other';
  can_view_direct: boolean;
  status?: string;
}

export interface VehicleEvent {
  id: string;
  type: 'in' | 'out';
  timestamp: string;
  image_url: string;
  confidence?: number;
}

export interface StatusHistory {
  id: string;
  device_id: string;
  device_name: string;
  device_type: 'dvr' | 'camera';
  event: 'online' | 'offline';
  timestamp: string;
}

export interface TallyEvent {
  id: string;
  timestamp: string;
  container_number?: string;
  damage_status?: string;
  image_top_1?: string;
  image_side_1?: string;
  image_top_2?: string;
  image_side_2?: string;
  direction?: 'in' | 'out';
}

export interface NetworkDevice {
  id: string;
  mac_address: string;
  last_ip_address: string;
  device_name?: string;
  owner_name?: string;
  device_type?: string;
  status: 'online' | 'offline';
  last_seen: string;
  created_at: string;
}

export interface NetworkAlert {
  id: string;
  alert_type: string;
  ip_address: string;
  mac_1: string;
  mac_2: string;
  message: string;
  resolved: boolean;
  created_at: string;
}

export interface NetworkSubnet {
  id: string;
  subnet: string;
  name: string;
  created_at: string;
}
