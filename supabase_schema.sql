-- Xoá các bảng cũ nếu đã tồn tại để có thể chạy lại script
DROP TABLE IF EXISTS vehicle_events CASCADE;
DROP TABLE IF EXISTS status_history CASCADE;
DROP TABLE IF EXISTS cameras CASCADE;
DROP TABLE IF EXISTS dvrs CASCADE;

-- Bảng Đầu ghi (DVRs)
CREATE TABLE dvrs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT,
  ip_address TEXT NOT NULL,
  port INTEGER DEFAULT 80,
  password TEXT,
  type TEXT DEFAULT 'other',
  can_view_direct BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Bảng Camera (Cameras)
CREATE TABLE cameras (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  dvr_id UUID REFERENCES dvrs(id) ON DELETE CASCADE,
  ip_address TEXT NOT NULL,
  password TEXT,
  stream_url TEXT,
  status TEXT DEFAULT 'offline',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Bảng Lịch sử trạng thái (Status History)
CREATE TABLE status_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id UUID NOT NULL, -- Có thể không phải là foreign key cứng vì device có thể bị xoá
  device_name TEXT NOT NULL,
  device_type TEXT CHECK (device_type IN ('dvr', 'camera')),
  event TEXT CHECK (event IN ('online', 'offline')),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Bảng Sự kiện xe (Vehicle Events)
CREATE TABLE vehicle_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plate TEXT NOT NULL,
  type TEXT CHECK (type IN ('in', 'out')),
  image_url TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

create table tally_events (
  id uuid default uuid_generate_v4() primary key,
  timestamp timestamp with time zone default timezone('utc'::text, now()) not null,
  container_number text,
  damage_status text default 'Chưa phân tích',
  image_top_1 text,
  image_side_1 text,
  image_top_2 text,
  image_side_2 text
);

DROP TABLE IF EXISTS container_logs;

-- 2. Tạo bảng lưu lịch sử ra vào của Container
CREATE TABLE container_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    container_no VARCHAR(15) NOT NULL,                -- Số Cont (VD: TLLU1234567)
    lane_id VARCHAR(50) NOT NULL,                     -- Làn xe (VD: LAN_1, TRAM_CAN)
    event_type VARCHAR(10) NOT NULL,                  -- Trạng thái: 'IN' (Vào bãi) hoặc 'OUT' (Ra bãi)
    matched_cameras INT DEFAULT 0,                    -- Số lượng camera đọc giống nhau (VD: 2)
    total_cameras INT DEFAULT 0,                      -- Tổng số camera của làn đó (VD: 3)
    image_url_left TEXT,                              -- Link ảnh chụp sườn trái
    image_url_right TEXT,                             -- Link ảnh chụp sườn phải
    image_url_rear TEXT,                              -- Link ảnh chụp phía sau
    image_url_top TEXT,                               -- Link ảnh chụp phía trên
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() -- Thời gian xe qua cổng
);

-- 3. Tạo Index để truy vấn tốc độ cao
-- Index này giúp việc tìm kiếm "Lần gần nhất số Cont này xuất hiện là khi nào?" diễn ra trong chớp mắt
CREATE INDEX idx_container_no ON container_logs(container_no);
CREATE INDEX idx_created_at ON container_logs(created_at DESC);
CREATE INDEX idx_cont_time ON container_logs(container_no, created_at DESC);



-- Bật Row Level Security (RLS)
ALTER TABLE dvrs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cameras ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_events ENABLE ROW LEVEL SECURITY;

-- Tạo policies cho phép đọc/ghi tất cả (Chỉ dùng cho môi trường dev/demo)
CREATE POLICY "Allow all operations on dvrs" ON dvrs FOR ALL USING (true);
CREATE POLICY "Allow all operations on cameras" ON cameras FOR ALL USING (true);
CREATE POLICY "Allow all operations on status_history" ON status_history FOR ALL USING (true);
CREATE POLICY "Allow all operations on vehicle_events" ON vehicle_events FOR ALL USING (true);

-- ==========================================
-- DỮ LIỆU MẪU (MOCK DATA)
-- ==========================================

-- Insert DVRs
INSERT INTO dvrs (id, name, location, ip_address, port, password, type, can_view_direct) VALUES
  ('d8b8e3a0-1234-4567-89ab-cdef01234567', 'DVR Cổng Chính', 'Cổng Chính', '192.168.1.101', 8000, 'admin', 'hikvision', true),
  ('d8b8e3a0-2345-4567-89ab-cdef01234567', 'DVR Hầm B1', 'Tầng hầm B1', '192.168.1.102', 8000, 'admin', 'dahua', false),
  ('d8b8e3a0-3456-4567-89ab-cdef01234567', 'DVR Hầm B2', 'Tầng hầm B2', '192.168.1.103', 8000, 'admin', 'other', true);

-- Insert Cameras
INSERT INTO cameras (id, name, dvr_id, ip_address, channel, stream_url) VALUES
  ('c8b8e3a0-1234-4567-89ab-cdef01234567', 'Cam Vào 1', 'd8b8e3a0-1234-4567-89ab-cdef01234567', '192.168.1.111', 1, 'https://picsum.photos/seed/cam1/640/360'),
  ('c8b8e3a0-2345-4567-89ab-cdef01234567', 'Cam Ra 1', 'd8b8e3a0-1234-4567-89ab-cdef01234567', '192.168.1.112', 2, 'https://picsum.photos/seed/cam2/640/360'),
  ('c8b8e3a0-3456-4567-89ab-cdef01234567', 'Cam Toàn Cảnh', 'd8b8e3a0-1234-4567-89ab-cdef01234567', '192.168.1.113', 3, 'https://picsum.photos/seed/cam3/640/360'),
  ('c8b8e3a0-4567-4567-89ab-cdef01234567', 'Cam B1 Lối Vào', 'd8b8e3a0-2345-4567-89ab-cdef01234567', '192.168.1.121', 1, 'https://picsum.photos/seed/cam4/640/360'),
  ('c8b8e3a0-5678-4567-89ab-cdef01234567', 'Cam B1 Lối Ra', 'd8b8e3a0-2345-4567-89ab-cdef01234567', '192.168.1.122', 2, 'https://picsum.photos/seed/cam5/640/360'),
  ('c8b8e3a0-6789-4567-89ab-cdef01234567', 'Cam B2 Lối Vào', 'd8b8e3a0-3456-4567-89ab-cdef01234567', '192.168.1.131', 1, 'https://picsum.photos/seed/cam6/640/360');

-- Insert Vehicle Events
INSERT INTO vehicle_events (plate, type, image_url, timestamp) VALUES
  ('30A-123.45', 'in', 'https://picsum.photos/seed/car1/300/200', now() - interval '5 minutes'),
  ('29C-567.89', 'out', 'https://picsum.photos/seed/car2/300/200', now() - interval '12 minutes'),
  ('51F-999.99', 'in', 'https://picsum.photos/seed/car3/300/200', now() - interval '25 minutes'),
  ('30G-111.22', 'in', 'https://picsum.photos/seed/car4/300/200', now() - interval '40 minutes'),
  ('15A-333.44', 'out', 'https://picsum.photos/seed/car5/300/200', now() - interval '55 minutes');

-- Insert Status History
INSERT INTO status_history (device_id, device_name, device_type, event, timestamp) VALUES
  ('c8b8e3a0-5678-4567-89ab-cdef01234567', 'Cam B1 Lối Ra', 'camera', 'offline', now() - interval '30 minutes'),
  ('d8b8e3a0-3456-4567-89ab-cdef01234567', 'DVR Hầm B2', 'dvr', 'offline', now() - interval '2 hours'),
  ('c8b8e3a0-6789-4567-89ab-cdef01234567', 'Cam B2 Lối Vào', 'camera', 'offline', now() - interval '2 hours'),
  ('d8b8e3a0-1234-4567-89ab-cdef01234567', 'DVR Cổng Chính', 'dvr', 'online', now() - interval '24 hours');


