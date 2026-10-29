import os
import json
import ssl
import sys
import socket
import datetime
import threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
import ipaddress
import urllib.request
import urllib.error
import urllib.parse

def get_all_ips():
    ips = set()
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None):
            ip = info[4][0]
            if ':' not in ip and not ip.startswith('127.'):
                ips.add(ip)
    except Exception:
        pass
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ips.add(s.getsockname()[0])
        s.close()
    except Exception:
        pass
    # Also prioritize 192.168.x.x Wi-Fi addresses
    return list(ips)

def get_local_ip():
    ips = get_all_ips()
    # prefer 192.168.x.x if available for local phone Wi-Fi
    wifi_ips = [ip for ip in ips if ip.startswith('192.168.')]
    if wifi_ips:
        return wifi_ips[0]
    return ips[0] if ips else '127.0.0.1'

def generate_self_signed_cert(cert_file='cert.pem', key_file='key.pem', ip='127.0.0.1'):
    all_ips = get_all_ips()
    if ip not in all_ips:
        all_ips.append(ip)
    print(f"Generating fresh SSL certificate for IPs: {all_ips}...")
    key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )

    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, u"US"),
        x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, u"Local"),
        x509.NameAttribute(NameOID.LOCALITY_NAME, u"Local"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, u"NAV-BOT Indoor Navigation"),
        x509.NameAttribute(NameOID.COMMON_NAME, ip),
    ])

    san_list = [
        x509.DNSName(u"localhost"),
        x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
    ]
    for cur_ip in all_ips:
        try:
            san_list.append(x509.IPAddress(ipaddress.IPv4Address(cur_ip)))
            san_list.append(x509.DNSName(f"{cur_ip}.nip.io"))
            san_list.append(x509.DNSName(f"{cur_ip.replace('.', '-')}.sslip.io"))
        except Exception:
            pass

    cert = x509.CertificateBuilder().subject_name(
        subject
    ).issuer_name(
        issuer
    ).public_key(
        key.public_key()
    ).serial_number(
        x509.random_serial_number()
    ).not_valid_before(
        datetime.datetime.utcnow()
    ).not_valid_after(
        datetime.datetime.utcnow() + datetime.timedelta(days=365)
    ).add_extension(
        x509.SubjectAlternativeName(san_list),
        critical=False,
    ).sign(key, hashes.SHA256())

    with open(key_file, "wb") as f:
        f.write(key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        ))

    with open(cert_file, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))

    print(f"SSL certificate ready: {cert_file}, {key_file}")

class NavRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        dist_dir = os.path.join(base_dir, 'dist')
        if os.path.isdir(dist_dir) and os.path.isfile(os.path.join(dist_dir, 'index.html')):
            super().__init__(*args, directory=dist_dir, **kwargs)
        else:
            super().__init__(*args, directory=base_dir, **kwargs)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/ip':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'ip': get_local_ip()}).encode())
            return

        if self.path.startswith('/api/pi-status'):
            # Relay GET /status from the Raspberry Pi back to the browser.
            # This is how the app polls for feedback (state, current step,
            # and any motor/stepper fault) while navigation is running.
            parsed = urllib.parse.urlparse(self.path)
            qs = urllib.parse.parse_qs(parsed.query)
            pi_ip = (qs.get('pi_ip', [''])[0]).strip()
            pi_port = (qs.get('pi_port', ['5000'])[0]).strip()
            protocol = (qs.get('protocol', ['http'])[0]).strip()

            if not pi_ip:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Missing pi_ip'}).encode())
                return

            pi_url = f"{protocol}://{pi_ip}:{pi_port}/status"
            try:
                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
                with urllib.request.urlopen(pi_url, timeout=3, context=ctx) as response:
                    resp_body = response.read().decode('utf-8')
                    resp_code = response.getcode()
                self.send_response(resp_code)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(resp_body.encode('utf-8'))
            except Exception as e:
                self.send_response(502)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'error': f"Could not reach Pi status endpoint at {pi_url} ({e})"
                }).encode('utf-8'))
            return

        super().do_GET()

    def do_POST(self):
        if self.path == '/api/send-to-pi':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            try:
                data = json.loads(body)
                pi_ip = data.get('pi_ip', '').strip()
                pi_port = data.get('pi_port', '5000').strip()
                protocol = data.get('protocol', 'http').strip()
                transcript = data.get('transcript', {})
                # Optional: which Pi endpoint to hit. Defaults to /navigate
                # (the normal step/route dispatch path). The fault-testing
                # buttons use /simulate_fault and /clear_fault instead.
                pi_path = data.get('pi_path', '/navigate').strip()
                if not pi_path.startswith('/'):
                    pi_path = '/' + pi_path

                pi_url = f"{protocol}://{pi_ip}:{pi_port}{pi_path}"
                print(f"[Proxy] Forwarding route to Raspberry Pi at {pi_url}...")

                req = urllib.request.Request(
                    pi_url,
                    data=json.dumps(transcript).encode('utf-8'),
                    headers={'Content-Type': 'application/json'}
                )

                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE

                with urllib.request.urlopen(req, timeout=5, context=ctx) as response:
                    resp_body = response.read().decode('utf-8')
                    resp_code = response.getcode()

                self.send_response(resp_code)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(resp_body.encode('utf-8'))
                return

            except urllib.error.HTTPError as e:
                err_resp = e.read().decode('utf-8') if e.fp else str(e)
                self.send_response(e.code)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'error': f"Pi returned HTTP {e.code}: {err_resp}"}).encode('utf-8'))
                return
            except urllib.error.URLError as e:
                self.send_response(502)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'error': f"Could not connect to Raspberry Pi at {pi_ip}:{pi_port}. ({e.reason}). Make sure 'python3 main.py' is running on the Pi."
                }).encode('utf-8'))
                return
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
                return

        super().do_GET()

class DualServer:
    def __init__(self, https_port=8443, http_port=8000, target_ip=None):
        self.https_port = https_port
        self.http_port = http_port
        self.local_ip = target_ip if target_ip else get_local_ip()

    def start_http(self):
        try:
            httpd = ThreadingHTTPServer(('0.0.0.0', self.http_port), NavRequestHandler)
            print(f"HTTP Server listening on:  http://{self.local_ip}:{self.http_port}")
            httpd.serve_forever()
        except Exception as e:
            print(f"HTTP Server on {self.http_port} notice: {e}")

    def start_https(self):
        generate_self_signed_cert('cert.pem', 'key.pem', self.local_ip)
        httpd = ThreadingHTTPServer(('0.0.0.0', self.https_port), NavRequestHandler)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(certfile='cert.pem', keyfile='key.pem')
        httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

        all_ips = get_all_ips()
        if self.local_ip not in all_ips:
            all_ips.insert(0, self.local_ip)

        print("=" * 65)
        print("SECURE NAV-BOT HTTPS SERVER IS ACTIVE FOR PHONE & SENSORS!")
        print("=" * 65)
        print("PRIMARY PHONE LINK:")
        print(f"   --> https://{self.local_ip}:{self.https_port}")
        if len(all_ips) > 1:
            print("\nALL AVAILABLE NETWORK ADDRESSES:")
            for ip in all_ips:
                print(f"   * https://{ip}:{self.https_port}   (or http://{ip}:{self.http_port})")
        print("=" * 65)
        print("NOTE: When Chrome or Safari shows 'Your connection is not private',")
        print("tap 'Advanced' -> 'Proceed' (standard for local network self-signed SSL).")
        print("=" * 65)

        httpd.serve_forever()

    def run(self):
        t = threading.Thread(target=self.start_http, daemon=True)
        t.start()
        self.start_https()

if __name__ == '__main__':
    https_port = 8443
    target_ip = None
    for arg in sys.argv[1:]:
        if arg.isdigit():
            https_port = int(arg)
        elif '.' in arg:
            target_ip = arg.strip()

    DualServer(https_port=https_port, target_ip=target_ip).run()

