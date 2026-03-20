import os
import re
import time
import platform
import subprocess
import socket
from concurrent.futures import ThreadPoolExecutor
from dotenv import load_dotenv
from supabase import create_client, Client

# Tải các biến môi trường
load_dotenv()

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ LỖI: Không tìm thấy VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trong file .env")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Lưu trữ bản đồ IP -> MAC của lần quét trước
previous_arp = {}

def check_port(ip, port, timeout=0.3):
    """Kiểm tra xem một port có đang mở trên IP không"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            s.connect((ip, port))
            return True
    except:
        return False

def guess_device_type(ip, mac):
    """Đoán loại thiết bị dựa trên Port đang mở và địa chỉ MAC"""
    # 1. Quét Port (Chính xác nhất)
    # Port 554 (RTSP), 8000 (Hikvision), 37777 (Dahua), 34567 (Xiongmai) -> Camera/DVR
    if check_port(ip, 554) or check_port(ip, 8000) or check_port(ip, 37777) or check_port(ip, 34567):
        return 'camera'
        
    # Port 9100 (JetDirect), 515 (LPD) -> Máy in mạng
    if check_port(ip, 9100) or check_port(ip, 515):
        return 'printer'
        
    # Port 445 (SMB), 135 (RPC) -> Máy tính Windows
    if check_port(ip, 445) or check_port(ip, 135):
        return 'pc'
        
    # Port 22 (SSH) -> Máy chủ / Linux / Thiết bị mạng
    if check_port(ip, 22):
        return 'server'
        
    # 2. Dựa vào MAC OUI (3 byte đầu của MAC)
    if mac and not mac.startswith('routed:'):
        mac_upper = mac.upper()
        # Các hãng Camera phổ biến (Hikvision, Dahua, Uniview...)
        camera_ouis = ('B0:C5:54', '48:EA:63', 'E0:14:D8', '38:AF:29', '14:A7:8B', '20:13:10', '8C:E7:48', 'BC:1C:81')
        if mac_upper.startswith(camera_ouis):
            return 'camera'
            
        # Apple (iPhone, iPad, Macbook)
        apple_ouis = ('00:1C:B3', '14:CD:00', '28:CF:E9', '34:C0:59', '40:98:AD', '60:FB:42', '90:B1:1C', 'A4:D1:8C', 'D4:A3:3D', 'F8:FF:C2')
        if mac_upper.startswith(apple_ouis):
            return 'phone' # Hoặc laptop
            
    return 'unknown'

def ping_host(ip):
    """Ping một IP cụ thể, trả về IP nếu thành công"""
    try:
        if platform.system() == "Windows":
            res = subprocess.run(["ping", "-n", "1", "-w", "500", ip], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
            if "TTL=" in res.stdout or "TTL =" in res.stdout:
                return ip
        else:
            res = subprocess.run(["ping", "-c", "1", "-W", "1", ip], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
            if res.returncode == 0 and "ttl=" in res.stdout.lower():
                return ip
    except:
        pass
    return None

def ping_sweep(subnets):
    """Ping toàn bộ các dải mạng. Trả về danh sách các IP có phản hồi (Online)."""
    print(f"Đang ping các dải mạng: {', '.join(subnets)} ...")
    ips_to_ping = []
    for subnet in subnets:
        for i in range(1, 255):
            ips_to_ping.append(f"{subnet}.{i}")
            
    active_ips = []
    with ThreadPoolExecutor(max_workers=100) as executor:
        results = executor.map(ping_host, ips_to_ping)
        for res in results:
            if res:
                active_ips.append(res)
                
    time.sleep(2)
    return active_ips

def get_arp_table():
    """Lấy bảng ARP từ hệ điều hành để lấy MAC thật"""
    devices = []
    try:
        if platform.system() == "Windows":
            output = subprocess.check_output("arp -a", shell=True).decode("utf-8", errors="ignore")
            pattern = re.compile(r"([0-9\.]+)\s+([0-9a-fA-F\-]{17})\s+")
            for line in output.split('\n'):
                match = pattern.search(line)
                if match:
                    ip = match.group(1)
                    mac = match.group(2).replace('-', ':').lower()
                    if mac != 'ff:ff:ff:ff:ff:ff' and not ip.startswith('224.') and not ip.startswith('239.') and not ip.endswith('.255'):
                        devices.append({'ip': ip, 'mac': mac})
        else:
            output = subprocess.check_output("arp -a", shell=True).decode("utf-8", errors="ignore")
            pattern = re.compile(r"\(([0-9\.]+)\) at ([0-9a-fA-F:]{17})")
            for line in output.split('\n'):
                match = pattern.search(line)
                if match:
                    ip = match.group(1)
                    mac = match.group(2).lower()
                    if mac != 'ff:ff:ff:ff:ff:ff' and not ip.endswith('.255'):
                        devices.append({'ip': ip, 'mac': mac})
    except Exception as e:
        print(f"Lỗi khi quét ARP: {e}")
        
    unique_devices = {}
    for d in devices:
        unique_devices[d['mac']] = d['ip']
        
    return [{'mac': k, 'ip': v} for k, v in unique_devices.items()]

def detect_conflicts(current_devices):
    """Phát hiện xung đột IP (IP Flapping)"""
    global previous_arp
    current_arp = {d['ip']: d['mac'] for d in current_devices if not d['mac'].startswith('routed:')}
    
    if not previous_arp:
        previous_arp = current_arp
        return

    for ip, mac in current_arp.items():
        if ip in previous_arp and previous_arp[ip] != mac:
            mac1 = previous_arp[ip]
            mac2 = mac
            print(f"⚠️ PHÁT HIỆN XUNG ĐỘT IP: {ip} đang bị tranh chấp giữa {mac1} và {mac2}")
            try:
                existing = supabase.table('network_alerts').select('id').eq('ip_address', ip).eq('resolved', False).execute()
                if not existing.data:
                    supabase.table('network_alerts').insert({
                        'alert_type': 'ip_conflict',
                        'ip_address': ip,
                        'mac_1': mac1,
                        'mac_2': mac2,
                        'message': f'Phát hiện xung đột IP: {ip}'
                    }).execute()
            except Exception as e:
                print(f"Lỗi khi gửi cảnh báo lên Supabase: {e}")
                
    previous_arp = current_arp

def update_supabase(devices):
    """Cập nhật danh sách thiết bị lên Supabase"""
    try:
        existing_res = supabase.table('network_devices').select('mac_address, status, device_type').execute()
        existing_data = {d['mac_address']: d for d in existing_res.data} if existing_res.data else {}
        
        current_time = time.strftime('%Y-%m-%dT%H:%M:%S%z')
        current_macs = []
        
        for dev in devices:
            mac = dev['mac']
            ip = dev['ip']
            current_macs.append(mac)
            
            # Phân tích loại thiết bị nếu chưa biết
            dev_type = 'unknown'
            if mac in existing_data:
                dev_type = existing_data[mac].get('device_type', 'unknown')
                
            if dev_type == 'unknown':
                dev_type = guess_device_type(ip, mac)
            
            if mac in existing_data:
                supabase.table('network_devices').update({
                    'last_ip_address': ip,
                    'last_seen': current_time,
                    'status': 'online',
                    'device_type': dev_type
                }).eq('mac_address', mac).execute()
            else:
                supabase.table('network_devices').insert({
                    'mac_address': mac,
                    'last_ip_address': ip,
                    'status': 'online',
                    'device_type': dev_type,
                    'last_seen': current_time
                }).execute()
                existing_data[mac] = {'status': 'online', 'device_type': dev_type}
                
        offline_macs = set(existing_data.keys()) - set(current_macs)
        for mac in offline_macs:
            if existing_data[mac].get('status') != 'offline':
                supabase.table('network_devices').update({
                    'status': 'offline'
                }).eq('mac_address', mac).execute()
            
        print(f"[{time.strftime('%H:%M:%S')}] Đã cập nhật: {len(current_macs)} thiết bị online, {len(offline_macs)} thiết bị offline.")
        
    except Exception as e:
        print(f"Lỗi khi cập nhật Supabase: {e}")

def get_subnets_from_db():
    try:
        res = supabase.table('network_subnets').select('subnet').execute()
        if res.data:
            return [item['subnet'].strip() for item in res.data]
    except Exception as e:
        print(f"Lỗi khi lấy danh sách dải mạng từ DB: {e}")
    return []

def clean_subnet(subnet_str):
    s = subnet_str.strip().replace('.0/24', '').replace('.x', '')
    parts = s.split('.')
    if len(parts) >= 3:
        return f"{parts[0]}.{parts[1]}.{parts[2]}"
    return None

def main():
    print("🚀 Bắt đầu trình quét mạng nội bộ (Hỗ trợ Ping ICMP & Nhận diện thiết bị thông minh)...")
    print("Nhấn Ctrl+C để dừng.")
    
    while True:
        subnets_to_scan = set()
        
        # 1. Lấy từ Database
        db_subnets = get_subnets_from_db()
        for s in db_subnets:
            cleaned = clean_subnet(s)
            if cleaned:
                subnets_to_scan.add(cleaned)
            
        # 2. Lấy từ ENV
        load_dotenv(override=True)
        SUBNETS_ENV = os.getenv("SUBNETS", "")
        if SUBNETS_ENV:
            for s in SUBNETS_ENV.split(','):
                cleaned = clean_subnet(s)
                if cleaned:
                    subnets_to_scan.add(cleaned)
                    
        # 3. Tự động phát hiện nếu không có gì
        if not subnets_to_scan:
            try:
                if platform.system() == "Windows":
                    ip_output = subprocess.check_output("ipconfig", shell=True).decode("utf-8", errors="ignore")
                    ip_matches = re.findall(r"IPv4 Address[.\s]+:\s+([0-9\.]+)", ip_output)
                    for my_ip in ip_matches:
                        subnet = ".".join(my_ip.split(".")[:3])
                        subnets_to_scan.add(subnet)
                else:
                    ip_output = subprocess.check_output("ifconfig", shell=True).decode("utf-8", errors="ignore")
                    ip_matches = re.findall(r"inet\s+([0-9\.]+)", ip_output)
                    for my_ip in ip_matches:
                        if my_ip != "127.0.0.1":
                            subnet = ".".join(my_ip.split(".")[:3])
                            subnets_to_scan.add(subnet)
            except Exception as e:
                print(f"Lỗi khi tự động phát hiện dải mạng: {e}")

        if not subnets_to_scan:
            print("⚠️ Không tìm thấy dải mạng nào để quét.")
            time.sleep(30)
            continue
            
        # BƯỚC 1: Ping toàn bộ để tìm các IP đang Online
        active_ips = ping_sweep(list(subnets_to_scan))
        
        # BƯỚC 2: Lấy bảng ARP để lấy MAC thật
        arp_devices = get_arp_table()
        arp_dict = {d['ip']: d['mac'] for d in arp_devices}
        
        # BƯỚC 3: Tổng hợp danh sách
        final_devices = []
        for ip in active_ips:
            if ip in arp_dict:
                final_devices.append({'ip': ip, 'mac': arp_dict[ip]})
            else:
                pseudo_mac = f"routed:{ip}"
                final_devices.append({'ip': ip, 'mac': pseudo_mac})
                
        if final_devices:
            detect_conflicts(final_devices)
            update_supabase(final_devices)
        else:
            print("Không tìm thấy thiết bị nào Online.")
            
        time.sleep(30)

if __name__ == "__main__":
    main()