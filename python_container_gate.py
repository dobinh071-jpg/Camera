import os
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|stimeout;3000000"
import cv2
import easyocr
import re
import time
import datetime
import threading
import queue
import numpy as np
import requests
from collections import Counter
from supabase import create_client, Client

# ==========================================
# 1. CẤU HÌNH HỆ THỐNG
# ==========================================
SUPABASE_URL = "https://lqjywwlrnomtdvdfzgsy.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxxanl3d2xybm9tdGR2ZGZ6Z3N5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTg4NzM4MiwiZXhwIjoyMDg3NDYzMzgyfQ.KWc_eWd5ST9qfepisK4gtTR7b1pSJ0G8-0-ThewC1yI"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
print("[INFO] Đang tải model EasyOCR (CPU)...")
reader = easyocr.Reader(['en'], gpu=False)

# trigger_camera: camera dùng để phát hiện xe vào làn và dừng
# detection_zone (y1, y2, x1, x2): vùng trên trigger_camera để so sánh background
# roi (y1, y2, x1, x2): vùng quét OCR trên mỗi camera
SYSTEM_CONFIG = {
    "LAN_VAO_1": {
        "trigger_camera": "cam_rear",
        "detection_zone": (100, 600, 150, 900),
        "cameras": {
            "cam_left":  {"url": "rtsp://admin:abcd1234@192.168.55.39:554/stream1", "roi": (80, 500, 50, 700)},
            "cam_right": {"url": "rtsp://admin:abcd1234@192.168.55.41:554/stream1", "roi": (80, 500, 50, 700)},
            "cam_rear":  {"url": "rtsp://admin:abcd1234@192.168.55.23:554/stream1", "roi": (80, 500, 100, 900)},
            "cam_top":   {"url": "rtsp://admin:abcd1234@192.168.55.42:554/stream1", "roi": (150, 600, 400, 1200)}
        }
    },
    "LAN_VAO_2": {
        "trigger_camera": "cam_rear",
        "detection_zone": (100, 600, 150, 900),
        "cameras": {
            "cam_left":  {"url": "rtsp://admin:abcd1234@192.168.55.75:554/stream1", "roi": (80, 500, 50, 700)},
            "cam_right": {"url": "rtsp://admin:abcd1234@192.168.55.27:554/stream1", "roi": (80, 500, 50, 700)},
            "cam_rear":  {"url": "rtsp://admin:abcd1234@192.168.55.38:554/stream1", "roi": (80, 500, 100, 900)},
            "cam_top":   {"url": "rtsp://admin:abcd1234@192.168.55.17:554/stream1", "roi": (150, 600, 400, 1200)}
        }
    },
    "TRAM_CAN": {
        "trigger_camera": "cam_top",
        "trigger_line_y": 480,
        "detection_zone": (150, 480, 150, 650),
        "cameras": {
            "cam_left":  {"url": "rtsp://admin:abcd1234@192.168.55.20:554/stream1", "roi": (80, 500, 50, 700)},
            "cam_right": {"url": "rtsp://admin:abcd1234@192.168.55.19:554/stream1", "roi": (80, 500, 50, 700)},
            "cam_rear":  {"url": "rtsp://admin:abcd1234@192.168.55.37:554/stream1", "roi": (80, 500, 300, 900)},
         #   "cam_top":   {"url": "rtsp://admin:abcd1234@192.168.55.25:554/stream1", "roi": (150, 600, 400, 1200)} 
        }
    },
    "LAN_RA_1": {
        "trigger_camera": "cam_top",
        "trigger_line_y": 500,
        "detection_zone": (150, 500, 200, 850),
        "cameras": {
            "cam_top": {"url": "rtsp://admin:abcd1234@192.168.55.81/stream1", "roi": (150, 600, 400, 1200)}
        }
    },
    "LAN_RA_2": {
        "trigger_camera": "cam_top",
        "trigger_line_y": 500,
        "detection_zone": (150, 500, 200, 850),
        "cameras": {
            "cam_top": {"url": "rtsp://admin:abcd1234@192.168.55.80:554/stream1", "roi": (150, 600, 400, 1200)}
        }
    }
}

# ==========================================
# 2. HẰNG SỐ
# ==========================================
MOTION_THRESHOLD = 5000
STOP_DELAY = 3.0
OCCUPANCY_THRESHOLD = 0.35
COOLDOWN_AFTER_CAPTURE = 15.0
CONFIRM_FRAMES = 5

# ==========================================
# 3. XỬ LÝ ẢNH & OCR
# ==========================================
def preprocess_image(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    contrast = clahe.apply(gray)
    blur = cv2.GaussianBlur(contrast, (3, 3), 0)
    return blur

def clean_ocr_text(text):
    text = re.sub(r'[^A-Z0-9]', '', text.upper())
    if len(text) >= 10:
        prefix = text[:4].replace('0', 'O').replace('1', 'I').replace('5', 'S').replace('8', 'B')
        suffix = text[4:].replace('O', '0').replace('I', '1').replace('S', '5').replace('B', '8').replace('Z', '2')
        text = prefix + suffix
    return text

def extract_container_number(text):
    cleaned = clean_ocr_text(text)
    match = re.search(r'([A-Z]{4})(\d{6,7})', cleaned)
    if match:
        return match.group(1) + match.group(2)
    return None

def upload_image_to_supabase(lane_id, cam_name, frame, timestamp_str):
    try:
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        file_bytes = buffer.tobytes()
        file_name = f"{lane_id}/{cam_name}_{timestamp_str}.jpg"
        response = supabase.storage.from_("container-images").upload(
            file_name, file_bytes,
            {"content-type": "image/jpeg", "x-upsert": "true"}
        )
        public_url = f"{SUPABASE_URL}/storage/v1/object/public/container-images/{file_name}"
        print(f"  [UPLOAD] {cam_name} -> {public_url}")
        return cam_name, public_url
    except Exception as e:
        print(f"  [ERROR] Upload {cam_name}: {e}")
        # Retry once
        try:
            time.sleep(1)
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            file_bytes = buffer.tobytes()
            file_name = f"{lane_id}/{cam_name}_{timestamp_str}.jpg"
            response = supabase.storage.from_("container-images").upload(
                file_name, file_bytes,
                {"content-type": "image/jpeg", "x-upsert": "true"}
            )
            public_url = f"{SUPABASE_URL}/storage/v1/object/public/container-images/{file_name}"
            print(f"  [UPLOAD RETRY OK] {cam_name} -> {public_url}")
            return cam_name, public_url
        except Exception as e2:
            print(f"  [ERROR] Upload retry {cam_name}: {e2}")
            return cam_name, None

# ==========================================
# 4. RTSP STREAM READER
# ==========================================
class RTSPStream:
    def __init__(self, url, name="cam"):
        self.url = url
        self.name = name
        self.frame = None
        self.frame_time = 0
        self.lock = threading.Lock()
        self.running = True
        self.cap = None
        self._connect()
        self.thread = threading.Thread(target=self._reader_loop, daemon=True)
        self.thread.start()

    def _connect(self):
        if self.cap is not None:
            self.cap.release()
        self.cap = cv2.VideoCapture(self.url, cv2.CAP_FFMPEG)
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        if self.cap.isOpened():
            print(f"  [STREAM] {self.name} connected")
        else:
            print(f"  [STREAM] {self.name} FAILED to connect")

    def _reader_loop(self):
        while self.running:
            try:
                if self.cap is None or not self.cap.isOpened():
                    time.sleep(2)
                    self._connect()
                    continue
                ret, frame = self.cap.read()
                if ret:
                    with self.lock:
                        self.frame = frame
                        self.frame_time = time.time()
                else:
                    time.sleep(0.5)
                    self._connect()
            except Exception as e:
                print(f"  [STREAM ERROR] {self.name}: {e}")
                time.sleep(2)
                self._connect()

    def get_frame(self):
        with self.lock:
            if self.frame is not None:
                return self.frame.copy(), self.frame_time
            return None, 0

    def get_fresh_frame(self, max_age=3.0):
        frame, ft = self.get_frame()
        if frame is not None and (time.time() - ft) <= max_age:
            return frame, ft
        return None, 0

    def stop(self):
        self.running = False
        if self.cap is not None:
            self.cap.release()

# ==========================================
# 5. OCR & XỬ LÝ LÀN
# ==========================================
def _ocr_scan(image, cam_name):
    processed = preprocess_image(image)
    results = reader.readtext(processed, allowlist='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')
    all_texts = []
    for (bbox, text, prob) in results:
        if prob > 0.2:
            all_texts.append(text)
            cont_no = extract_container_number(text)
            if cont_no:
                print(f"    [OCR] {cam_name}: {cont_no} (prob={prob:.2f})")
                return cont_no
    if all_texts:
        combined = "".join(all_texts)
        cont_no = extract_container_number(combined)
        if cont_no:
            print(f"    [OCR] {cam_name} combined: {cont_no}")
            return cont_no
    return None

def process_lane_ocr(lane_id, frames_to_process, config):
    timestamp = datetime.datetime.now()
    timestamp_str = timestamp.strftime("%Y%m%d_%H%M%S")
    print(f"[OCR] {lane_id}: Bắt đầu xử lý {len(frames_to_process)} camera...")

    container_numbers = []
    image_urls = {}

    # Parallel upload
    upload_threads = []
    upload_results = []

    def _upload_worker(lid, cname, frm, ts):
        result = upload_image_to_supabase(lid, cname, frm, ts)
        upload_results.append(result)

    for cam_name, frame in frames_to_process.items():
        t = threading.Thread(target=_upload_worker, args=(lane_id, cam_name, frame, timestamp_str))
        upload_threads.append(t)
        t.start()

    # OCR scan each camera's ROI
    for cam_name, frame in frames_to_process.items():
        cam_config = config["cameras"][cam_name]
        roi = cam_config["roi"]
        y1, y2, x1, x2 = roi
        h, w = frame.shape[:2]
        y1, y2 = max(0, y1), min(h, y2)
        x1, x2 = max(0, x1), min(w, x2)
        roi_img = frame[y1:y2, x1:x2]
        if roi_img.size == 0:
            continue
        cont_no = _ocr_scan(roi_img, cam_name)
        if cont_no:
            container_numbers.append(cont_no)

    # Wait for uploads
    for t in upload_threads:
        t.join(timeout=30)

    for cam_name, url in upload_results:
        if url:
            image_urls[cam_name] = url

    # Determine container number
    final_container = "UNKNOWN"
    if container_numbers:
        counter = Counter(container_numbers)
        final_container = counter.most_common(1)[0][0]

    print(f"[OCR] {lane_id}: Container = {final_container}")
    save_to_db(lane_id, final_container, image_urls, timestamp)
    return final_container

def save_to_db(lane_id, container_number, image_urls, timestamp):
    try:
        # Determine event type from lane name
        if "LAN_VAO" in lane_id:
            event_type = "IN"
        elif "LAN_RA" in lane_id:
            event_type = "OUT"
        elif "TRAM_CAN" in lane_id:
            event_type = "WEIGH"
        else:
            event_type = "UNKNOWN"

        data = {
            "lane_id": lane_id,
            "container_number": container_number,
            "event_type": event_type,
            "timestamp": timestamp.isoformat(),
            "image_cam_left": image_urls.get("cam_left"),
            "image_cam_right": image_urls.get("cam_right"),
            "image_cam_rear": image_urls.get("cam_rear"),
            "image_cam_top": image_urls.get("cam_top"),
        }
        supabase.table("container_logs").insert(data).execute()
        print(f"[DB] Saved: {lane_id} | {container_number} | {event_type}")
    except Exception as e:
        print(f"[DB ERROR] {e}")

# ==========================================
# 6. PHÁT HIỆN XE
# ==========================================
def check_motion(prev_frame, curr_frame):
    if prev_frame is None or curr_frame is None:
        return 0
    diff = cv2.absdiff(prev_frame, curr_frame)
    gray_diff = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY) if len(diff.shape) == 3 else diff
    _, thresh = cv2.threshold(gray_diff, 25, 255, cv2.THRESH_BINARY)
    return cv2.countNonZero(thresh)

def check_vehicle_past_line(background, current_frame, detection_zone):
    y1, y2, x1, x2 = detection_zone
    bg_roi = background[y1:y2, x1:x2]
    curr_roi = current_frame[y1:y2, x1:x2]

    if bg_roi.shape != curr_roi.shape:
        return False, 0

    bg_gray = cv2.cvtColor(bg_roi, cv2.COLOR_BGR2GRAY) if len(bg_roi.shape) == 3 else bg_roi
    curr_gray = cv2.cvtColor(curr_roi, cv2.COLOR_BGR2GRAY) if len(curr_roi.shape) == 3 else curr_roi

    diff = cv2.absdiff(bg_gray, curr_gray)
    _, thresh = cv2.threshold(diff, 30, 255, cv2.THRESH_BINARY)

    total_pixels = thresh.shape[0] * thresh.shape[1]
    changed_pixels = cv2.countNonZero(thresh)
    occupancy_ratio = changed_pixels / total_pixels if total_pixels > 0 else 0

    # Contour analysis - largest contour must be >25% of zone
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if contours:
        largest = max(contours, key=cv2.contourArea)
        largest_ratio = cv2.contourArea(largest) / total_pixels
    else:
        largest_ratio = 0

    is_occupied = occupancy_ratio >= OCCUPANCY_THRESHOLD and largest_ratio >= 0.25
    return is_occupied, occupancy_ratio

# ==========================================
# 7. LANE MONITOR
# ==========================================
class LaneMonitor:
    def __init__(self, lane_id, config):
        self.lane_id = lane_id
        self.config = config
        self.state = "IDLE"
        self.streams = {}
        self.background = None
        self.prev_trigger_frame = None
        self.last_bg_update = 0
        self.stop_start_time = 0
        self.cooldown_start = 0
        self.confirm_counter = 0
        self.ocr_queue = queue.Queue()

        # Initialize streams
        for cam_name, cam_config in config["cameras"].items():
            self.streams[cam_name] = RTSPStream(cam_config["url"], f"{lane_id}_{cam_name}")
            time.sleep(0.5)

        # Start OCR worker
        self.ocr_thread = threading.Thread(target=self._ocr_worker, daemon=True)
        self.ocr_thread.start()

        print(f"[LANE] {lane_id} initialized | trigger={config['trigger_camera']} | state=IDLE")

    def _ocr_worker(self):
        while True:
            try:
                task = self.ocr_queue.get(timeout=5)
                if task is None:
                    continue
                lane_id, frames, config = task
                process_lane_ocr(lane_id, frames, config)
            except queue.Empty:
                continue
            except Exception as e:
                print(f"[OCR WORKER ERROR] {self.lane_id}: {e}")

    def _capture_all_cameras(self):
        frames = {}
        for cam_name, stream in self.streams.items():
            # Try up to 3 times to get a fresh frame
            for attempt in range(3):
                frame, ft = stream.get_fresh_frame(max_age=3.0)
                if frame is not None:
                    frames[cam_name] = frame
                    break
                time.sleep(0.5)
            else:
                # Last resort: get any frame
                frame, ft = stream.get_frame()
                if frame is not None:
                    frames[cam_name] = frame
                    print(f"  [WARN] {self.lane_id}/{cam_name}: using stale frame (age={time.time()-ft:.1f}s)")
        return frames

    def update(self):
        trigger_cam = self.config["trigger_camera"]
        trigger_stream = self.streams.get(trigger_cam)
        if trigger_stream is None:
            return

        frame, frame_time = trigger_stream.get_frame()
        if frame is None:
            return

        now = time.time()

        # Update background every 10 seconds when IDLE
        if self.state == "IDLE" and (now - self.last_bg_update) > 10:
            self.background = frame.copy()
            self.last_bg_update = now

        # Initialize background on first frame
        if self.background is None:
            self.background = frame.copy()
            self.last_bg_update = now
            self.prev_trigger_frame = frame.copy()
            return

        detection_zone = self.config["detection_zone"]

        if self.state == "IDLE":
            is_occupied, ratio = check_vehicle_past_line(self.background, frame, detection_zone)
            if is_occupied:
                self.confirm_counter += 1
                if self.confirm_counter >= CONFIRM_FRAMES:
                    motion = check_motion(self.prev_trigger_frame, frame)
                    if motion < MOTION_THRESHOLD:
                        print(f"[DETECT] {self.lane_id}: Vehicle detected & stopped (ratio={ratio:.2f}, confirm={self.confirm_counter})")
                        self.state = "OCCUPIED"
                        self.stop_start_time = now
                    else:
                        pass  # Vehicle still moving
            else:
                self.confirm_counter = 0

        elif self.state == "OCCUPIED":
            # Wait STOP_DELAY then capture
            if (now - self.stop_start_time) >= STOP_DELAY:
                # Double check still occupied
                is_occupied, ratio = check_vehicle_past_line(self.background, frame, detection_zone)
                if is_occupied:
                    print(f"[CAPTURE] {self.lane_id}: Capturing all cameras...")
                    frames = self._capture_all_cameras()
                    if frames:
                        self.ocr_queue.put((self.lane_id, frames, self.config))
                    self.state = "COOLDOWN"
                    self.cooldown_start = now
                    self.confirm_counter = 0
                    print(f"[STATE] {self.lane_id}: OCCUPIED -> COOLDOWN")
                else:
                    # Vehicle left before capture
                    print(f"[STATE] {self.lane_id}: Vehicle left before capture, back to IDLE")
                    self.state = "IDLE"
                    self.confirm_counter = 0

        elif self.state == "COOLDOWN":
            if (now - self.cooldown_start) >= COOLDOWN_AFTER_CAPTURE:
                # Check if lane is clear before going back to IDLE
                is_occupied, ratio = check_vehicle_past_line(self.background, frame, detection_zone)
                if not is_occupied:
                    self.background = frame.copy()
                    self.last_bg_update = now
                    self.state = "IDLE"
                    self.confirm_counter = 0
                    print(f"[STATE] {self.lane_id}: COOLDOWN -> IDLE (lane clear)")

        self.prev_trigger_frame = frame.copy()

# ==========================================
# 8. DỌN DẸP DỮ LIỆU CŨ
# ==========================================
def cleanup_old_data():
    while True:
        try:
            time.sleep(3600)  # Every hour
            cutoff = (datetime.datetime.now() - datetime.timedelta(days=1)).isoformat()
            result = supabase.table("container_logs").delete().lt("timestamp", cutoff).execute()
            print(f"[CLEANUP] Deleted old records before {cutoff}")
        except Exception as e:
            print(f"[CLEANUP ERROR] {e}")

# ==========================================
# 9. MAIN
# ==========================================
def main():
    print("=" * 60)
    print("  CONTAINER GATE AI SYSTEM")
    print("=" * 60)

    # Initialize lane monitors
    monitors = {}
    for lane_id, config in SYSTEM_CONFIG.items():
        print(f"\n[INIT] {lane_id}...")
        monitors[lane_id] = LaneMonitor(lane_id, config)
        time.sleep(1)

    # Start cleanup thread
    cleanup_thread = threading.Thread(target=cleanup_old_data, daemon=True)
    cleanup_thread.start()

    print("\n" + "=" * 60)
    print("  System running. Monitoring all lanes...")
    print("=" * 60 + "\n")

    # Main loop
    while True:
        try:
            for lane_id, monitor in monitors.items():
                monitor.update()
            time.sleep(0.3)
        except KeyboardInterrupt:
            print("\n[STOP] Shutting down...")
            for monitor in monitors.values():
                for stream in monitor.streams.values():
                    stream.stop()
            break
        except Exception as e:
            print(f"[MAIN ERROR] {e}")
            time.sleep(1)

if __name__ == "__main__":
    main()
