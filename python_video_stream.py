import cv2
from flask import Flask, Response
from flask_cors import CORS
import threading
import time
import os
from dotenv import load_dotenv
from supabase import create_client, Client

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
        
        # Nếu camera có sẵn stream_url thì dùng luôn
        if cam.get('stream_url'):
            return cam['stream_url']
            
        # 2. Lấy thông tin DVR chứa camera này
        dvr_id = cam.get('dvr_id')
        dvr = None
        if dvr_id:
            dvr_res = supabase_client.table('dvrs').select('*').eq('id', dvr_id).execute()
            if dvr_res.data:
                dvr = dvr_res.data[0]
                
        # 3. Tự động sinh link RTSP
        ip = cam.get('ip_address')
        if not ip:
            return None
            
        # Làm sạch IP (bỏ http://)
        ip = ip.replace('http://', '').replace('https://', '').split(':')[0]
        
        # Bảng cameras không có cột username/password, bảng dvrs chỉ có cột password
        user = 'admin'
        
        # Lấy mật khẩu từ stream_url của camera
        pwd = ''
        stream_url = cam.get('stream_url')
        if stream_url:
            try:
                # Lấy phần authority (giữa :// và dấu / tiếp theo)
                without_scheme = stream_url.split('://', 1)[1]
                authority = without_scheme.split('/', 1)[0]
                
                # Tách credentials và host bằng dấu @ cuối cùng trong authority
                if '@' in authority:
                    credentials = authority.rsplit('@', 1)[0]
                    if ':' in credentials:
                        pwd = credentials.split(':', 1)[1]
            except Exception as e:
                print(f"Lỗi khi parse stream_url {stream_url}: {e}")
                
        # URL-encode password để tránh lỗi với các ký tự đặc biệt như @, #, !
        import urllib.parse
        encoded_pwd = urllib.parse.quote(pwd)
            
        cam_type = (dvr.get('type') if dvr else 'hikvision').lower() if dvr and 'type' in dvr else 'hikvision'
        
        # Format RTSP chuẩn cho Hikvision và Dahua
        if cam_type == 'dahua':
            rtsp_url = f"rtsp://{user}:{encoded_pwd}@{ip}:554/cam/realmonitor?channel=1&subtype=0"
        else:
            rtsp_url = f"rtsp://{user}:{encoded_pwd}@{ip}:554/Streaming/Channels/101"
            
        print(f"[{cam_id}] Đã tạo link RTSP: {rtsp_url}")
        return rtsp_url
            
    except Exception as e:
        print(f"Lỗi khi lấy thông tin camera {cam_id} từ Supabase: {e}")
        return None

def capture_thread(cam_id, rtsp_url):
    """
    Luồng chạy ngầm để đọc RTSP và nén thành JPEG
    """
    print(f"[START] Bắt đầu kết nối camera {cam_id} tại: {rtsp_url}")
    cap = cv2.VideoCapture(rtsp_url)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    
    if not cap.isOpened():
        print(f"[ERROR] Không thể mở luồng RTSP cho {cam_id}: {rtsp_url}")
        # Đánh dấu là không chạy nữa để luồng tự thoát
        if cam_id in active_streams:
            active_streams[cam_id]['running'] = False
        return

    while active_streams.get(cam_id, {}).get('running', False):
        success, frame = cap.read()
        if success:
            # Thu nhỏ ảnh để giảm tải CPU và Băng thông khi xem 25 cam cùng lúc
            frame = cv2.resize(frame, (640, 360))
            ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            if ret:
                active_streams[cam_id]['frame'] = buffer.tobytes()
        else:
            print(f"[WARN] Mất kết nối camera {cam_id}, đang thử lại...")
            # Mất kết nối, thử lại sau 2 giây
            time.sleep(2)
            cap.release()
            cap = cv2.VideoCapture(rtsp_url)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            if not cap.isOpened():
                print(f"[ERROR] Vẫn không thể kết nối lại {cam_id}")
            
        time.sleep(0.03) # Giới hạn ~30 FPS
        
    cap.release()
    print(f"[STOP] Đã dừng luồng video cho {cam_id} (Do không ai xem hoặc lỗi)")

def cleanup_thread():
    """
    Tự động tắt camera nếu trên Web không còn ai xem (sau 15 giây)
    """
    while True:
        time.sleep(10)
        current_time = time.time()
        with stream_lock:
            for cam_id in list(active_streams.keys()):
                if current_time - active_streams[cam_id]['last_accessed'] > 15:
                    active_streams[cam_id]['running'] = False
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
