import { Camera, DVR, VehicleEvent, StatusHistory } from '../types';

export const mockDVRs: DVR[] = [
  { id: 'dvr-1', name: 'DVR Cổng Chính', location: 'Cổng Chính', ip_address: '192.168.1.101', port: 8000, password: 'admin', type: 'hikvision', can_view_direct: true },
  { id: 'dvr-2', name: 'DVR Hầm B1', location: 'Tầng hầm B1', ip_address: '192.168.1.102', port: 8000, password: 'admin', type: 'dahua', can_view_direct: false },
  { id: 'dvr-3', name: 'DVR Hầm B2', location: 'Tầng hầm B2', ip_address: '192.168.1.103', port: 8000, password: 'admin', type: 'other', can_view_direct: true },
];

export const mockCameras: Camera[] = [
  { id: 'cam-1', name: 'Cam Vào 1', dvr_id: 'dvr-1', ip_address: '192.168.1.111', stream_url: 'https://picsum.photos/seed/cam1/640/360' },
  { id: 'cam-2', name: 'Cam Ra 1', dvr_id: 'dvr-1', ip_address: '192.168.1.112', stream_url: 'https://picsum.photos/seed/cam2/640/360' },
  { id: 'cam-3', name: 'Cam Toàn Cảnh', dvr_id: 'dvr-1', ip_address: '192.168.1.113', stream_url: 'https://picsum.photos/seed/cam3/640/360' },
  { id: 'cam-4', name: 'Cam B1 Lối Vào', dvr_id: 'dvr-2', ip_address: '192.168.1.121', stream_url: 'https://picsum.photos/seed/cam4/640/360' },
  { id: 'cam-5', name: 'Cam B1 Lối Ra', dvr_id: 'dvr-2', ip_address: '192.168.1.122', stream_url: 'https://picsum.photos/seed/cam5/640/360' },
  { id: 'cam-6', name: 'Cam B2 Lối Vào', dvr_id: 'dvr-3', ip_address: '192.168.1.131', stream_url: 'https://picsum.photos/seed/cam6/640/360' },
];

export const mockVehicleEvents: VehicleEvent[] = [
  { id: 'v-1', plate: '30A-123.45', type: 'in', timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(), image_url: 'https://picsum.photos/seed/car1/300/200' },
  { id: 'v-2', plate: '29C-567.89', type: 'out', timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(), image_url: 'https://picsum.photos/seed/car2/300/200' },
  { id: 'v-3', plate: '51F-999.99', type: 'in', timestamp: new Date(Date.now() - 1000 * 60 * 25).toISOString(), image_url: 'https://picsum.photos/seed/car3/300/200' },
  { id: 'v-4', plate: '30G-111.22', type: 'in', timestamp: new Date(Date.now() - 1000 * 60 * 40).toISOString(), image_url: 'https://picsum.photos/seed/car4/300/200' },
  { id: 'v-5', plate: '15A-333.44', type: 'out', timestamp: new Date(Date.now() - 1000 * 60 * 55).toISOString(), image_url: 'https://picsum.photos/seed/car5/300/200' },
];

export const mockStatusHistory: StatusHistory[] = [
  { id: 'sh-1', device_id: 'cam-5', device_name: 'Cam B1 Lối Ra', device_type: 'camera', event: 'offline', timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString() },
  { id: 'sh-2', device_id: 'dvr-3', device_name: 'DVR Hầm B2', device_type: 'dvr', event: 'offline', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() },
  { id: 'sh-3', device_id: 'cam-6', device_name: 'Cam B2 Lối Vào', device_type: 'camera', event: 'offline', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() },
  { id: 'sh-4', device_id: 'dvr-1', device_name: 'DVR Cổng Chính', device_type: 'dvr', event: 'online', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() },
];
