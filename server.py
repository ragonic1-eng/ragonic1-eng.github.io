"""Little Orbit shared planner. Run with Python 3.12+, no dependencies."""
import hashlib, hmac, json, os, re, secrets, sqlite3, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DB = Path(os.environ.get('DB_PATH', str(ROOT / '.local-data/trips.sqlite3')))
DB.parent.mkdir(parents=True, exist_ok=True)
with sqlite3.connect(DB) as connection:
    connection.execute('PRAGMA journal_mode=WAL')
    connection.execute('CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, key_hash TEXT NOT NULL, revision INTEGER NOT NULL, trip TEXT NOT NULL, updated REAL NOT NULL)')
CATEGORIES = {'kids', 'food', 'hotel', 'travel', 'shopping', 'break'}
BRANCHES = {'booking', 'bring', 'prepare', 'note'}
STATIC = {'/': ('index.html', 'text/html; charset=utf-8'), '/index.html': ('index.html', 'text/html; charset=utf-8'), '/app.js': ('app.js', 'text/javascript; charset=utf-8'), '/collaboration.js': ('collaboration.js', 'text/javascript; charset=utf-8'), '/config.json': ('config.json', 'application/json'), '/style.css': ('style.css', 'text/css; charset=utf-8'), '/trip.json': ('trip.json', 'application/json; charset=utf-8'), '/privacy.html': ('privacy.html', 'text/html; charset=utf-8')}
RATE_LOCK = threading.Lock()
RATE = {}

def valid_trip(trip):
    if not isinstance(trip, dict) or not isinstance(trip.get('days'), list) or len(trip['days']) != 7:
        return False
    ids = set()
    for day in trip['days']:
        if not isinstance(day, dict) or not all(isinstance(day.get(k), str) for k in ['name', 'region', 'date']):
            return False
        if not re.fullmatch(r'2026-12-(0[1-9]|[12][0-9]|3[01])', day['date']):
            return False
        start, end = day.get('start'), day.get('end')
        if type(start) is not int or type(end) is not int or not 0 <= start < end <= 1440:
            return False
        cards = day.get('cards')
        if not isinstance(cards, list) or len(cards) > 200:
            return False
        for card in cards:
            if not isinstance(card, dict) or not all(isinstance(card.get(k), str) for k in ['id', 'title', 'notes', 'category']):
                return False
            if card['id'] in ids or card['category'] not in CATEGORIES or type(card.get('duration')) is not int or not 1 <= card['duration'] <= 1440:
                return False
            ids.add(card['id'])
            branches = card.get('branches', [])
            if not isinstance(branches, list) or len(branches) > 100:
                return False
            branch_ids = set()
            for branch in branches:
                if not isinstance(branch, dict) or not all(isinstance(branch.get(k), str) for k in ['id', 'type', 'title', 'notes', 'url']):
                    return False
                if branch['id'] in branch_ids or branch['type'] not in BRANCHES or type(branch.get('done')) is not bool:
                    return False
                if branch['url'] and urlparse(branch['url']).scheme not in ['http', 'https']:
                    return False
                branch_ids.add(branch['id'])
    return True

class Handler(BaseHTTPRequestHandler):
    server_version = 'LittleOrbit'

    def headers_response(self, status, content_type='application/json; charset=utf-8'):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
        self.end_headers()

    def reply(self, status, data):
        self.headers_response(status)
        self.wfile.write(json.dumps(data).encode())

    def body(self):
        length = int(self.headers_in.get('Content-Length', '0'))
        if length < 1 or length > 2_000_000:
            raise ValueError('Invalid request size')
        if self.headers_in.get('Content-Type', '').split(';')[0] != 'application/json':
            raise ValueError('Expected application/json')
        data = json.loads(self.rfile.read(length))
        if not isinstance(data, dict):
            raise ValueError('Expected object')
        return data

    def room(self, connection, room_id):
        row = connection.execute('SELECT key_hash, revision, trip FROM rooms WHERE id=?', (room_id,)).fetchone()
        token = self.headers_in.get('Authorization', '').removeprefix('Bearer ')
        if not row or not hmac.compare_digest(row[0], hashlib.sha256(token.encode()).hexdigest()):
            return None
        return row

    def do_GET(self):
        # BaseHTTPRequestHandler uses self.headers for incoming headers; keep it accessible before response.
        self.headers_in = self.headers
        path = urlparse(self.path).path
        if path == '/api/health':
            return self.reply(200, {'ok': True})
        match = re.fullmatch(r'/api/rooms/([a-zA-Z0-9_-]{16,64})', path)
        if match:
            with sqlite3.connect(DB) as connection:
                row = self.room(connection, match[1])
            return self.reply(200, {'revision': row[1], 'trip': json.loads(row[2])}) if row else self.reply(404, {'error': 'Trip unavailable or link is incomplete.'})
        if path in STATIC:
            filename, content_type = STATIC[path]
            self.headers_response(200, content_type)
            return self.wfile.write((ROOT / filename).read_bytes())
        self.reply(404, {'error': 'Not found'})

    def do_POST(self):
        self.headers_in = self.headers
        if urlparse(self.path).path != '/api/rooms':
            return self.reply(404, {'error': 'Not found'})
        try:
            data = self.body()
            if not valid_trip(data.get('trip')):
                return self.reply(400, {'error': 'Invalid itinerary'})
            with RATE_LOCK:
                now = time.monotonic()
                # A bounded global creation limit also works behind a reverse proxy without trusting forged IP headers.
                stamps = [t for t in RATE.get('create', []) if now-t < 3600]
                if len(stamps) >= 100:
                    return self.reply(429, {'error': 'Please try creating a shared trip later.'})
                stamps.append(now)
                RATE['create'] = stamps
            room_id, key = secrets.token_urlsafe(18), secrets.token_urlsafe(32)
            with sqlite3.connect(DB) as connection:
                connection.execute('INSERT INTO rooms VALUES (?, ?, 1, ?, ?)', (room_id, hashlib.sha256(key.encode()).hexdigest(), json.dumps(data['trip']), time.time()))
            self.reply(201, {'id': room_id, 'key': key, 'revision': 1})
        except (ValueError, json.JSONDecodeError):
            self.reply(400, {'error': 'Invalid request'})

    def do_PUT(self):
        self.headers_in = self.headers
        match = re.fullmatch(r'/api/rooms/([a-zA-Z0-9_-]{16,64})', urlparse(self.path).path)
        if not match:
            return self.reply(404, {'error': 'Not found'})
        try:
            data = self.body()
            if not valid_trip(data.get('trip')) or type(data.get('revision')) is not int:
                return self.reply(400, {'error': 'Invalid itinerary'})
            with sqlite3.connect(DB, timeout=10) as connection:
                connection.execute('BEGIN IMMEDIATE')
                row = self.room(connection, match[1])
                if not row:
                    return self.reply(404, {'error': 'Trip unavailable or link is incomplete.'})
                if data['revision'] != row[1]:
                    return self.reply(409, {'error': 'Another person updated this trip.', 'revision': row[1], 'trip': json.loads(row[2])})
                revision = row[1]+1
                connection.execute('UPDATE rooms SET revision=?, trip=?, updated=? WHERE id=?', (revision, json.dumps(data['trip']), time.time(), match[1]))
            self.reply(200, {'revision': revision})
        except (ValueError, json.JSONDecodeError):
            self.reply(400, {'error': 'Invalid request'})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', '8000'))
    print(f'Little Orbit listening on port {port}', flush=True)
    ThreadingHTTPServer(('0.0.0.0', port), Handler).serve_forever()
