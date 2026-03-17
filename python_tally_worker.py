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
import easyocr
import re

# ==========================================
# CẤU HÌNH HỆ THỐNG TALLY
# ==========================================

# 1. Cấu hình Supabase (NHỚ ĐIỀN THÔNG TIN CỦA BẠN VÀO ĐÂY)
SUPABASE_URL = "https://lqjywwlrnomtdvdfzgsy.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxxanl3d2xybm9tdGR2ZGZ6Z3N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODczODIsImV4cCI6MjA4NzQ2MzM4Mn0.xYy0NbUjbxhmqS-Miazfi8ILrQc5KaNf6o13waFex_8"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# 2. Cấu hình 4 Camera Tally (Thay bằng link RTSP thực tế của bạn)
# LƯU Ý: Chọn camera soi sườn làm CAMERA_TRIGGER vì dễ nhận diện xe tải nhất
CAMERA_TRIGGER_URL = "rtsp://admin:abcd1234@192.168.66.81:554/Streaming/Channels/101" # Ví dụ: Soi sườn 1
CAMERA_TOP_1_URL   = "rtsp://admin:abcd1234@192.168.66.80:554/Streaming/Channels/101" # Ví dụ: Soi nóc 1
CAMERA_TOP_2_URL   = "rtsp://admin:abcd1234@192.168.66.82:554/Streaming/Channels/101" # Ví dụ: Soi nóc 2
CAMERA_SIDE_2_URL  = "rtsp://admin:abcd1234@192.168.66.83:554/Streaming/Channels/101" # Ví dụ: Soi sườn 2

# 3. Khởi tạo mô hình YOLOv8 và EasyOCR (Nhận diện xe và đọc chữ)
print("Đang tải mô hình YOLOv8 và EasyOCR...")
model = YOLO('yolov8n.pt') 
VEHICLE_CLASSES = [7] # Chỉ nhận diện truck (xe tải/đầu kéo)
reader = easyocr.Reader(['en']) # Khởi tạo mô hình đọc chữ tiếng Anh/Số

# 4. CẤU HÌNH VẠCH KÍCH HOẠT (TRIGGER LINE) TRÊN CAMERA TRIGGER
# Bạn cần điều chỉnh tọa độ này sao cho phù hợp với góc quay của CAMERA_TRIGGER

# ==========================================
# HÀM HỖ TRỢ DATABASE & CAMERA
# ==========================================

def image_to_base64(image):
    if image is None: return None
    img_resized = cv2.resize(image, (640, 480))
    _, buffer = cv2.imencode('.jpg', img_resized, [cv2.IMWRITE_JPEG_QUALITY, 80])
    return f"data:image/jpeg;base64,{base64.b64encode(buffer).decode('utf-8')}"

def save_tally_worker(q):
    while True:
        event = q.get()
        if event is None: break
        try:
            frames = event # frames là một dictionary chứa 4 ảnh
            cont_num = frames.get('container_number', 'Không rõ')
            print(f"Đang đẩy dữ liệu Tally lên Web (Cont: {cont_num})...")
            
            event_data = {
                "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "container_number": cont_num,
                "damage_status": "Chưa phân tích",       # Sẽ cập nhật ở Giai đoạn 3 (Damage Detection)
                "image_side_1": image_to_base64(frames.get('side_1')),
                "image_top_1": image_to_base64(frames.get('top_1')),
                "image_top_2": image_to_base64(frames.get('top_2')),
                "image_side_2": image_to_base64(frames.get('side_2')),
            }
            
            response = supabase.table('tally_events').insert(event_data).execute()
            print(f"=> Đã lưu Tally Event thành công!")
        except Exception as e:
            print(f"Lỗi khi lưu Tally lên Supabase: {e}")
        finally:
            q.task_done()

class VideoCaptureAsync:
    """Đọc frame từ camera bằng một luồng riêng biệt để tránh bị ứ đọng buffer gây delay"""
    def __init__(self, src=0, name="Camera"):
        self.src = src
        self.name = name
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
                print(f"Mất kết nối {self.name}. Đang thử kết nối lại...")
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

def prepare_grid_frame(frame, name):
    """Hàm hỗ trợ thu nhỏ frame về 640x360 để ghép vào Grid 2x2"""
    if frame is None:
        blank = np.zeros((360, 640, 3), dtype=np.uint8)
        cv2.putText(blank, f"{name} - OFFLINE", (180, 180), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        return blank
    resized = cv2.resize(frame, (640, 360))
    # Vẽ tên camera góc trái trên
    cv2.putText(resized, name, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
    return resized

def main():
    db_queue = queue.Queue()
    threading.Thread(target=save_tally_worker, args=(db_queue,), daemon=True).start()

    print("Đang kết nối 4 camera Tally...")
    cap_trigger = VideoCaptureAsync(CAMERA_TRIGGER_URL, "Soi suon 1").start()
    cap_top_1 = VideoCaptureAsync(CAMERA_TOP_1_URL, "Soi noc 1").start()
    cap_top_2 = VideoCaptureAsync(CAMERA_TOP_2_URL, "Soi noc 2").start()
    cap_side_2 = VideoCaptureAsync(CAMERA_SIDE_2_URL, "Soi suon 2").start()
    
    time.sleep(2)

    tracked_vehicles = {} 
    cooldown = 0 
    frame_counter = 0

    print("Hệ thống Tally Worker đã sẵn sàng. Đang chờ xe tải và quét số Cont...")

    while True:
        frame_counter += 1
        # Đọc frame từ cả 4 camera liên tục
        _, frame_trigger = cap_trigger.read()
        _, frame_t1 = cap_top_1.read()
        _, frame_t2 = cap_top_2.read()
        _, frame_s2 = cap_side_2.read()

        if cooldown > 0:
            cooldown -= 1

        # 1. XỬ LÝ CAMERA TRIGGER (Nhận diện xe và quét OCR)
        if frame_trigger is not None:
            frame_trigger_full = cv2.resize(frame_trigger, (1280, 720))
            
            if cooldown == 0:
                results = model.track(frame_trigger_full, persist=True, classes=VEHICLE_CLASSES, verbose=False)
                
                if results[0].boxes.id is not None:
                    boxes = results[0].boxes.xyxy.cpu().numpy()
                    track_ids = results[0].boxes.id.int().cpu().tolist()
                    
                    for box, track_id in zip(boxes, track_ids):
                        x1, y1, x2, y2 = map(int, box)
                        
                        if track_id not in tracked_vehicles:
                            tracked_vehicles[track_id] = {'triggered': False}

                        # Chỉ quét OCR mỗi 5 frame để tránh giật lag video
                        if frame_counter % 5 == 0 and not tracked_vehicles[track_id]['triggered']:
                            # Cắt vùng ảnh chứa xe tải
                            truck_roi = frame_trigger_full[max(0, y1):min(720, y2), max(0, x1):min(1280, x2)]
                            
                            if truck_roi.size > 0:
                                # Đọc chữ bằng EasyOCR
                                ocr_results = reader.readtext(truck_roi, detail=0)
                                detected_text = "".join(ocr_results).upper()
                                
                                # Lọc chỉ lấy chữ cái và số
                                clean_text = re.sub(r'[^A-Z0-9]', '', detected_text)
                                
                                # Tìm chuỗi có định dạng 3-4 chữ cái + 6-7 số (VD: HLXU1234567)
                                match = re.search(r'[A-Z]{3,4}\d{6,7}', clean_text)
                                
                                if match:
                                    container_number = match.group(0)
                                    tracked_vehicles[track_id]['triggered'] = True
                                    print(f"!!! PHÁT HIỆN SỐ CONT [{container_number}] (ID: {track_id}) - KÍCH HOẠT CHỤP !!!")
                                    
                                    # Đóng gói và gửi lên Web
                                    frames_to_save = {
                                        'container_number': container_number,
                                        'side_1': frame_trigger,
                                        'top_1': frame_t1,
                                        'top_2': frame_t2,
                                        'side_2': frame_s2
                                    }
                                    db_queue.put(frames_to_save)
                                    
                                    # Hiệu ứng chớp nháy màn hình
                                    cv2.rectangle(frame_trigger_full, (0, 0), (1280, 720), (0, 255, 0), 20)
                                    cv2.putText(frame_trigger_full, f"CONT: {container_number}", (50, 100), cv2.FONT_HERSHEY_SIMPLEX, 2, (0, 255, 0), 5)
                                    
                                    cooldown = 300 
                                    break # Thoát vòng lặp box hiện tại

                        # Vẽ khung xanh quanh xe
                        cv2.rectangle(frame_trigger_full, (x1, y1), (x2, y2), (255, 0, 0), 2)
                        
                        # Hiển thị trạng thái
                        status_text = "DA CHUP" if tracked_vehicles[track_id]['triggered'] else "SCANNING OCR..."
                        color = (0, 255, 0) if tracked_vehicles[track_id]['triggered'] else (0, 255, 255)
                        cv2.putText(frame_trigger_full, status_text, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

            # Thu nhỏ lại 640x360 để ghép vào Grid
            img_trigger = cv2.resize(frame_trigger_full, (640, 360))
            cv2.putText(img_trigger, "Soi suon 1 (Trigger)", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
        else:
            img_trigger = prepare_grid_frame(None, "Soi suon 1 (Trigger)")

        # 2. CHUẨN BỊ 3 CAMERA CÒN LẠI
        img_top_1 = prepare_grid_frame(frame_t1, "Soi noc 1")
        img_top_2 = prepare_grid_frame(frame_t2, "Soi noc 2")
        img_side_2 = prepare_grid_frame(frame_s2, "Soi suon 2")

        # 3. GHÉP 4 CAMERA THÀNH GRID 2x2
        top_row = np.hstack((img_top_1, img_trigger))
        bottom_row = np.hstack((img_top_2, img_side_2))
        grid_display = np.vstack((top_row, bottom_row))

        cv2.imshow("Smart Tally System - 4 Cameras", grid_display)

        if cv2.waitKey(1) & 0xFF == ord('q'): break

    cap_trigger.stop()
    cap_top_1.stop()
    cap_top_2.stop()
    cap_side_2.stop()
    cv2.destroyAllWindows()
    db_queue.put(None)

if __name__ == "__main__":
    main()
