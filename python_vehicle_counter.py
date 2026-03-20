import cv2
import numpy as np
from ultralytics import YOLO
from supabase import create_client, Client
import time
import os
from datetime import datetime, timezone
import base64
import threading
import queue

# ==========================================
# CẤU HÌNH HỆ THỐNG
# ==========================================

# 1. Cấu hình Supabase (NHỚ ĐIỀN THÔNG TIN CỦA BẠN VÀO ĐÂY)
SUPABASE_URL = "https://lqjywwlrnomtdvdfzgsy.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxxanl3d2xybm9tdGR2ZGZ6Z3N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODczODIsImV4cCI6MjA4NzQ2MzM4Mn0.xYy0NbUjbxhmqS-Miazfi8ILrQc5KaNf6o13waFex_8"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# 2. Cấu hình Camera
VIDEO_SOURCE = "rtsp://admin:abcd2026@192.168.44.44:554/Streaming/Channels/101"

# 3. Khởi tạo mô hình YOLOv8
print("Đang tải mô hình YOLOv8...")
model = YOLO('yolov8n.pt') 

VEHICLE_CLASSES = [2, 3, 5, 7] # car, motorcycle, bus, truck

# 4. CẤU HÌNH VẠCH ĐỎ (LINE CROSSING)
LINE_A = (1, 420)   # Điểm bên trái màn hình
LINE_B = (700, 500)  # Điểm bên phải màn hình

# ==========================================
# HÀM HỖ TRỢ DATABASE & CAMERA
# ==========================================

def image_to_base64(image):
    img_resized = cv2.resize(image, (640, 480))
    _, buffer = cv2.imencode('.jpg', img_resized, [cv2.IMWRITE_JPEG_QUALITY, 80])
    return f"data:image/jpeg;base64,{base64.b64encode(buffer).decode('utf-8')}"

def save_event_worker(q):
    while True:
        event = q.get()
        if event is None: break
        try:
            vehicle_type, direction, confidence, frame = event
            print(f"Đang đẩy lên Web: {vehicle_type} - {direction} ({confidence:.2f})")
            
            event_data = {
                "type": direction,
                "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "image_url": image_to_base64(frame)
            }
            
            print(f"Dữ liệu chuẩn bị gửi: {event_data['type']}")
            
            response = supabase.table('vehicle_events').insert(event_data).execute()
            print(f"=> Đã lưu thành công lên Web! Response: {response}")
        except Exception as e:
            print(f"Lỗi khi lưu lên Supabase: {e}")
        finally:
            q.task_done()

class VideoCaptureAsync:
    """Đọc frame từ camera bằng một luồng riêng biệt để tránh bị ứ đọng buffer gây delay"""
    def __init__(self, src=0):
        self.src = src
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|fflags;nobuffer|flags;low_delay"
        self.cap = cv2.VideoCapture(self.src, cv2.CAP_FFMPEG)
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        self.grabbed, self.frame = self.cap.read()
        self.started = False
        self.read_lock = threading.Lock()

    def start(self):
        if self.started:
            return None
        self.started = True
        self.thread = threading.Thread(target=self.update, args=(), daemon=True)
        self.thread.start()
        return self

    def update(self):
        while self.started:
            grabbed, frame = self.cap.read()
            with self.read_lock:
                self.grabbed = grabbed
                self.frame = frame
            if not grabbed:
                print("Mất kết nối camera. Đang thử kết nối lại...")
                time.sleep(2)
                self.cap = cv2.VideoCapture(self.src, cv2.CAP_FFMPEG)
                self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    def read(self):
        with self.read_lock:
            frame = self.frame.copy() if self.frame is not None else None
            grabbed = self.grabbed
        return grabbed, frame

    def stop(self):
        self.started = False
        self.thread.join()
        self.cap.release()

# ==========================================
# CHƯƠNG TRÌNH CHÍNH
# ==========================================

def main():
    db_queue = queue.Queue()
    threading.Thread(target=save_event_worker, args=(db_queue,), daemon=True).start()

    cap = VideoCaptureAsync(VIDEO_SOURCE)
    cap.start()
    
    time.sleep(1)
    
    ret, _ = cap.read()
    if not ret:
        print("Không thể mở camera!")
        cap.stop()
        return

    tracked_vehicles = {} 
    count_in = 0
    count_out = 0

    print("Bắt đầu phân tích... Nhấn 'q' để thoát.")

    while True:
        ret, frame = cap.read()
        if not ret or frame is None:
            time.sleep(0.1)
            continue

        frame = cv2.resize(frame, (1280, 720))
        results = model.track(frame, persist=True, classes=VEHICLE_CLASSES, verbose=False)
        
        # Vẽ Vạch Đỏ và Vùng đệm
        cv2.line(frame, LINE_A, LINE_B, (0, 0, 255), 3)
        cv2.putText(frame, "VACH DO", (LINE_A[0], LINE_A[1] - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
        
        OFFSET = 15 # Vùng đệm 15 pixel (tổng khoảng cách 30 pixel)
        # Vẽ 2 đường đệm mờ để dễ hình dung vùng kích hoạt
        cv2.line(frame, (LINE_A[0], LINE_A[1] - OFFSET), (LINE_B[0], LINE_B[1] - OFFSET), (0, 0, 255), 1)
        cv2.line(frame, (LINE_A[0], LINE_A[1] + OFFSET), (LINE_B[0], LINE_B[1] + OFFSET), (0, 0, 255), 1)

        if results[0].boxes.id is not None:
            boxes = results[0].boxes.xyxy.cpu().numpy()
            track_ids = results[0].boxes.id.int().cpu().tolist()
            clss = results[0].boxes.cls.cpu().tolist()
            confs = results[0].boxes.conf.cpu().tolist()
            current_ids = []

            for box, track_id, cls, conf in zip(boxes, track_ids, clss, confs):
                current_ids.append(track_id)
                x1, y1, x2, y2 = map(int, box)
                
                # Dùng điểm tâm CẠNH DƯỚI của xe (bánh xe chạm đất) để xét qua vạch cho chuẩn
                cx = int((x1 + x2) / 2)
                cy = int(y2) 
                vehicle_name = model.names[int(cls)]

                if track_id not in tracked_vehicles:
                    tracked_vehicles[track_id] = {
                        'counted': False, 
                        'state': None,
                        'history': []
                    }

                # Lưu lịch sử 3 frame gần nhất để lọc nhiễu (Median Filter)
                tracked_vehicles[track_id]['history'].append(cy)
                if len(tracked_vehicles[track_id]['history']) > 3:
                    tracked_vehicles[track_id]['history'].pop(0)

                # Tính giá trị cy đã được làm mượt (loại bỏ các frame nhảy vọt)
                smooth_cy = np.median(tracked_vehicles[track_id]['history'])

                color = (0, 255, 0) if not tracked_vehicles[track_id]['counted'] else (255, 0, 0)
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                cv2.circle(frame, (cx, cy), 5, (0, 0, 255), -1)

                # --- LOGIC ĐẾM XE MỚI (HYSTERESIS + MEDIAN FILTER) ---
                # Tính y của vạch đỏ tại vị trí x của xe
                if LINE_B[0] != LINE_A[0]:
                    m = (LINE_B[1] - LINE_A[1]) / (LINE_B[0] - LINE_A[0])
                    b = LINE_A[1] - m * LINE_A[0]
                    line_y = m * cx + b
                else:
                    line_y = LINE_A[1]

                current_state = tracked_vehicles[track_id]['state']
                
                # Xác định trạng thái dựa trên cy đã làm mượt
                if smooth_cy < line_y - OFFSET:
                    new_state = 'above' # Phía trong bãi
                elif smooth_cy > line_y + OFFSET:
                    new_state = 'below' # Phía ngoài bãi
                else:
                    new_state = current_state # Nằm trong vùng đệm, giữ nguyên trạng thái

                if current_state is None and new_state is not None:
                    tracked_vehicles[track_id]['state'] = new_state
                
                elif current_state is not None and new_state is not None and current_state != new_state:
                    if not tracked_vehicles[track_id]['counted']:
                        direction = None
                        if current_state == 'below' and new_state == 'above':
                            direction = 'in'
                        elif current_state == 'above' and new_state == 'below':
                            direction = 'out'
                            
                        if direction:
                            tracked_vehicles[track_id]['counted'] = True
                            
                            if direction == 'in':
                                count_in += 1
                            else:
                                count_out += 1
                            
                            # Đổi màu vạch đỏ chớp nháy
                            cv2.line(frame, LINE_A, LINE_B, (0, 255, 0), 8)
                            
                            # Cắt ảnh và gửi
                            margin = 20
                            h, w = frame.shape[:2]
                            vehicle_crop = frame[max(0, y1-margin):min(h, y2+margin), max(0, x1-margin):min(w, x2+margin)]
                            db_queue.put((vehicle_name, direction, conf, vehicle_crop))
                
                # Cập nhật trạng thái
                if new_state is not None:
                    tracked_vehicles[track_id]['state'] = new_state

            for tid in list(tracked_vehicles.keys()):
                if tid not in current_ids:
                    del tracked_vehicles[tid]

        cv2.putText(frame, f"VAO: {count_in}", (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 3)
        cv2.putText(frame, f"RA: {count_out}", (50, 100), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 3)
        cv2.imshow("He Thong Nhan Dien Xe - YOLOv8", frame)

        if cv2.waitKey(1) & 0xFF == ord('q'): break

    cap.stop()
    cv2.destroyAllWindows()
    db_queue.put(None)

if __name__ == "__main__":
    main()