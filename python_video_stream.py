import cv2
from flask import Flask, Response
from flask_cors import CORS
import threading
import time
import os
import urllib.parse
from dotenv import load_dotenv
from supabase import create_client, Client

# Timeout RTSP 5 giây thay vì 30 giây mặc định
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|stimeout;5000000"

# Tải các biến môi trường từ file .env
load_dotenv()

app = Flask(__name__)
CORS(app) # Cho phép React truy cập

# ==========================================
# CẤU HÌNH SUPABASE (Lấy từ hệ thống của bạn)
# ==========================================
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ LỖI: Không tìm thấy VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trong file .env")
    print("Vui lòng kiểm tra lại file .env của bạn.")
    exit(1)

# Khởi tạo client Supabase toàn cục
try:
    supabase_client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("✅ Đã kết nối thành công tới Supabase")
except Exception as e:
    print(f"❌ Lỗi khi khởi tạo Supabase client: {e}")
    exit(1)

# Quản lý các luồng camera đang chạy
active_streams = {}
stream_lock = threading.Lock()

def get_rtsp_url(cam_id):
    """
    Tự động sinh link RTSP từ dữ liệu trên Supabase dựa vào cam_id
    """
    try:
        # 1. Lấy thông tin Camera
        cam_res = supabase_client.table('cameras').select('*').eq('id', cam_id).execute()
        if not cam_res.data:
            return None
        cam = cam_res.data[0]

        # 2. Lấy thông tin DVR chứa camera này
        dvr_id = cam.get('dvr_id')
        dvr = None
        if dvr_id:
            dvr_res = supabase_client.table('dvrs').select('*').eq('id', dvr_id).execute()
            if dvr_res.data:
                dvr = dvr_res.data[0]

        # 3. Lấy IP
        ip = cam.get('ip_address') or ''
        ip = ip.replace('http://', '').replace('https://', '').split(':')[0].strip()
        if not ip:
            return None

        # 4. Lấy password: ưu tiên từ camera → DVR
        pwd = (cam.get('password') or '').strip()
        if not pwd and dvr:
            pwd = (dvr.get('password') or '').strip()

        user = 'admin'
        encoded_pwd = urllib.parse.quote(pwd, safe='')

        # 5. Xác định loại DVR để chọn format RTSP
        cam_type = (dvr.get('type', 'hikvision') if dvr else 'hikvision').lower()

        if cam_type == 'dahua':
            rtsp_url = f"rtsp://{user}:{encoded_pwd}@{ip}:554/cam/realmonitor?channel=1&subtype=0"
        else:
            # Hikvision mặc định
            rtsp_url = f"rtsp://{user}:{encoded_pwd}@{ip}:554/Streaming/Channels/101"

        # DEBUG: Hiện password để kiểm tra
        print(f"[{cam_id[:8]}] {cam.get('name','?')} | IP: {ip} | Pass: {pwd} | Type: {cam_type}")
        print(f"  -> {rtsp_url}")
        return rtsp_url

    except Exception as e:
        print(f"Lỗi khi lấy thông tin camera {cam_id} từ Supabase: {e}")
        return None

def capture_thread(cam_id, rtsp_url):
    """
    Luồng chạy ngầm để đọc RTSP và nén thành JPEG
    """
    cam_host = rtsp_url.split('@')[1].split('/')[0] if '@' in rtsp_url else '?'
    print(f"[START] Kết nối {cam_id[:8]} tại: {cam_host}")

    # Set timeout 5 giây trực tiếp (env var không hoạt động trên Windows)
    cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    if not cap.isOpened():
        print(f"[ERROR] {cam_id[:8]} - Không kết nối được ({cam_host}) - sai pass hoặc cam offline")
        with stream_lock:
            if cam_id in active_streams:
                active_streams[cam_id]['running'] = False
        return

    print(f"[OK] {cam_id[:8]} - Đã kết nối thành công ({cam_host})")
    fail_count = 0
    max_fails = 3

    while active_streams.get(cam_id, {}).get('running', False):
        success, frame = cap.read()
        if success:
            fail_count = 0
            frame = cv2.resize(frame, (640, 360))
            ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            if ret:
                with stream_lock:
                    if cam_id in active_streams:
                        active_streams[cam_id]['frame'] = buffer.tobytes()
        else:
            fail_count += 1
            if fail_count >= max_fails:
                print(f"[ERROR] {cam_id[:8]} - Mất kết nối {max_fails} lần, dừng.")
                break
            time.sleep(2)
            cap.release()
            cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        time.sleep(0.03)

    cap.release()
    with stream_lock:
        if cam_id in active_streams:
            active_streams[cam_id]['running'] = False
    print(f"[STOP] {cam_id[:8]} đã dừng")

def cleanup_thread():
    """
    Tự động tắt camera nếu trên Web không còn ai xem (sau 15 giây)
    """
    while True:
        time.sleep(10)
        current_time = time.time()
        to_remove = []
        with stream_lock:
            for cam_id in list(active_streams.keys()):
                if current_time - active_streams[cam_id]['last_accessed'] > 15:
                    # Chỉ đánh dấu dừng, không xóa ngay — capture_thread sẽ tự thoát
                    active_streams[cam_id]['running'] = False
                    to_remove.append(cam_id)
        # Chờ capture_thread thoát rồi mới xóa
        if to_remove:
            time.sleep(2)
            with stream_lock:
                for cam_id in to_remove:
                    if cam_id in active_streams and not active_streams[cam_id]['running']:
                        del active_streams[cam_id]

# Khởi động luồng dọn dẹp
threading.Thread(target=cleanup_thread, daemon=True).start()

def generate(cam_id):
    """
    Hàm Generator đẩy ảnh liên tục xuống Web
    """
    with stream_lock:
        if cam_id not in active_streams:
            rtsp_url = get_rtsp_url(cam_id)
            if not rtsp_url:
                return
                
            active_streams[cam_id] = {
                'frame': None,
                'last_accessed': time.time(),
                'running': True
            }
            # Bật luồng đọc camera
            threading.Thread(target=capture_thread, args=(cam_id, rtsp_url), daemon=True).start()
    
    while True:
        with stream_lock:
            if cam_id in active_streams:
                # Cập nhật thời gian truy cập cuối cùng (để giữ camera không bị tắt)
                active_streams[cam_id]['last_accessed'] = time.time()
                frame = active_streams[cam_id]['frame']
            else:
                break # Camera đã bị tắt do timeout
                
        if frame:
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
        else:
            time.sleep(0.1)
            
        time.sleep(0.05) # Giới hạn tốc độ gửi xuống web

@app.route('/video_feed/<cam_id>')
def video_feed(cam_id):
    """
    API Endpoint cho thẻ <img> trên React
    """
    return Response(generate(cam_id), mimetype='multipart/x-mixed-replace; boundary=frame')

if __name__ == '__main__':
    print("====================================================")
    print("🚀 SMART TALLY - VIDEO STREAMER SERVER ĐÃ SẴN SÀNG")
    print("📡 Đang lắng nghe tại: http://localhost:5000")
    print("💡 Cơ chế: Tự động lấy link từ Supabase & Bật/Tắt On-Demand")
    print("====================================================")
    app.run(host='0.0.0.0', port=5000, threaded=True)
