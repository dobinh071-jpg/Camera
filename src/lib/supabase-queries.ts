import { supabase } from './supabase';

// ==========================================
// 1. Query Container Logs
// ==========================================
export async function queryContainerLogs(args: {
  date_from?: string;
  date_to?: string;
  lane_id?: string;
  container_no?: string;
  event_type?: string;
  limit?: number;
}) {
  try {
    let query = supabase
      .from('container_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(args.limit || 20);

    if (args.date_from) query = query.gte('created_at', args.date_from);
    if (args.date_to) query = query.lte('created_at', args.date_to);
    if (args.lane_id) query = query.eq('lane_id', args.lane_id);
    if (args.event_type) query = query.eq('event_type', args.event_type);
    if (args.container_no) query = query.ilike('container_no', `%${args.container_no}%`);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (e: any) {
    console.error('queryContainerLogs error:', e);
    return { error: e.message };
  }
}

// ==========================================
// 2. Get Statistics
// ==========================================
export async function getStatistics(args: {
  date_from?: string;
  date_to?: string;
  lane_id?: string;
  event_type?: string;
}) {
  try {
    let query = supabase
      .from('container_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (args.date_from) query = query.gte('created_at', args.date_from);
    if (args.date_to) query = query.lte('created_at', args.date_to);
    if (args.lane_id) query = query.eq('lane_id', args.lane_id);
    if (args.event_type) query = query.eq('event_type', args.event_type);
    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];
    const byLane: Record<string, number> = {};
    const byEventType: Record<string, number> = {};
    const containerCount: Record<string, number> = {};

    for (const row of rows) {
      byLane[row.lane_id] = (byLane[row.lane_id] || 0) + 1;
      byEventType[row.event_type] = (byEventType[row.event_type] || 0) + 1;
      if (row.container_no && row.container_no !== 'UNKNOWN') {
        containerCount[row.container_no] = (containerCount[row.container_no] || 0) + 1;
      }
    }

    const topContainers = Object.entries(containerCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([container_no, count]) => ({ container_no, count }));

    return {
      total_events: rows.length,
      by_lane: byLane,
      by_event_type: byEventType,
      top_containers: topContainers,
      unknown_count: rows.filter(r => r.container_no === 'UNKNOWN').length,
    };
  } catch (e: any) {
    console.error('getStatistics error:', e);
    return { error: e.message };
  }
}

// ==========================================
// 3. Query Device Status
// ==========================================
export async function queryDeviceStatus(args: {
  device_type?: string;
  device_name?: string;
}) {
  try {
    let query = supabase
      .from('status_history')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(50);

    if (args.device_type) query = query.eq('device_type', args.device_type);
    if (args.device_name) query = query.ilike('device_name', `%${args.device_name}%`);

    const { data, error } = await query;
    if (error) throw error;

    // Get latest status per device
    const latestByDevice: Record<string, any> = {};
    for (const row of data || []) {
      if (!latestByDevice[row.device_id]) {
        latestByDevice[row.device_id] = row;
      }
    }
    return Object.values(latestByDevice);
  } catch (e: any) {
    console.error('queryDeviceStatus error:', e);
    return { error: e.message };
  }
}

// ==========================================
// 4. Query Vehicle Events
// ==========================================
export async function queryVehicleEvents(args: {
  date_from?: string;
  date_to?: string;
  plate?: string;
  type?: string;
  limit?: number;
}) {
  try {
    let query = supabase
      .from('vehicle_events')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(args.limit || 20);

    if (args.date_from) query = query.gte('timestamp', args.date_from);
    if (args.date_to) query = query.lte('timestamp', args.date_to);
    if (args.type) query = query.eq('type', args.type);
    if (args.plate) query = query.ilike('plate', `%${args.plate}%`);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (e: any) {
    console.error('queryVehicleEvents error:', e);
    return { error: e.message };
  }
}

// ==========================================
// 5. Get System Config
// ==========================================
export function getSystemConfig() {
  return {
    total_lanes: 5,
    total_cameras: 14,
    lanes: [
      { id: 'LAN_VAO_1', name: 'Làn Vào 1', cameras: ['cam_left', 'cam_right', 'cam_rear', 'cam_top'], trigger: 'cam_rear' },
      { id: 'LAN_VAO_2', name: 'Làn Vào 2', cameras: ['cam_left', 'cam_right', 'cam_rear', 'cam_top'], trigger: 'cam_rear' },
      { id: 'TRAM_CAN', name: 'Trạm Cân', cameras: ['cam_left', 'cam_right', 'cam_rear', 'cam_top'], trigger: 'cam_top' },
      { id: 'LAN_RA_1', name: 'Làn Ra 1', cameras: ['cam_top'], trigger: 'cam_top' },
      { id: 'LAN_RA_2', name: 'Làn Ra 2', cameras: ['cam_top'], trigger: 'cam_top' },
    ],
    detection_method: 'Background subtraction + contour analysis + EasyOCR',
    states: ['IDLE', 'OCCUPIED', 'COOLDOWN'],
  };
}
