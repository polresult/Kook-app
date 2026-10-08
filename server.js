// Kook server: serves the app and stores per-user state (name + PIN).
// No dependencies. Data lives in DATA_DIR (a Railway volume mounted at /data).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(ROOT, 'data'));
const DB_FILE = path.join(DATA_DIR, 'users.json');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8'
};

// ---------- storage ----------
let db = { users: {}, tokens: {} };
function loadDb() {
  try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { db = { users: {}, tokens: {} }; }
  db.users = db.users || {}; db.tokens = db.tokens || {};
}
function saveDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}
function hashPin(pin, salt) { return crypto.scryptSync(String(pin), salt, 32).toString('hex'); }
function userKey(name) { return String(name || '').trim().toLowerCase(); }
function validName(name) { return /^[\p{L}\p{N} _.-]{1,30}$/u.test(name); }
function validPin(pin) { return /^\d{4,8}$/.test(pin); }
const DEFAULT_STATE = { week: [], fav: [], ratings: {}, checked: {}, persons: 2, pantry: {} };
function cleanState(s) {
  s = s && typeof s === 'object' ? s : {};
  return {
    week: Array.isArray(s.week) ? s.week.filter(Number.isInteger).slice(0, 14) : [],
    fav: Array.isArray(s.fav) ? s.fav.filter(Number.isInteger).slice(0, 500) : [],
    ratings: s.ratings && typeof s.ratings === 'object' ? s.ratings : {},
    checked: s.checked && typeof s.checked === 'object' ? s.checked : {},
    persons: Math.max(1, Math.min(16, parseInt(s.persons) || 2)),
    pantry: s.pantry && typeof s.pantry === 'object' ? s.pantry : {}
  };
}

// ---------- helpers ----------
function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 200000) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function authUser(req) {
  const m = /^Bearer ([a-f0-9]{48})$/.exec(req.headers.authorization || '');
  if (!m) return null;
  const key = db.tokens[m[1]];
  return key && db.users[key] ? { key, token: m[1] } : null;
}
function issueToken(key) {
  const token = crypto.randomBytes(24).toString('hex');
  db.tokens[token] = key;
  return token;
}

// ---------- API ----------
async function api(req, res, urlPath) {
  if (urlPath === '/api/ping') return send(res, 200, { ok: true, users: Object.keys(db.users).length });

  if (urlPath === '/api/register' && req.method === 'POST') {
    const b = await readBody(req);
    const name = String(b.name || '').trim(), key = userKey(name);
    if (!validName(name)) return send(res, 400, { error: 'Kies een naam van 1 tot 30 letters of cijfers.' });
    if (!validPin(b.pin)) return send(res, 400, { error: 'De pincode bestaat uit 4 tot 8 cijfers.' });
    if (db.users[key]) return send(res, 409, { error: 'Deze naam bestaat al. Log in, of kies een andere naam.' });
    const salt = crypto.randomBytes(16).toString('hex');
    db.users[key] = { name, salt, pinHash: hashPin(b.pin, salt), state: cleanState(b.state), updatedAt: Date.now() };
    const token = issueToken(key);
    saveDb();
    return send(res, 200, { token, name, state: db.users[key].state });
  }

  if (urlPath === '/api/login' && req.method === 'POST') {
    const b = await readBody(req);
    const key = userKey(b.name), u = db.users[key];
    if (!u || !validPin(b.pin) || hashPin(b.pin, u.salt) !== u.pinHash) {
      return send(res, 401, { error: 'Naam of pincode klopt niet.' });
    }
    const token = issueToken(key);
    saveDb();
    return send(res, 200, { token, name: u.name, state: u.state });
  }

  const auth = authUser(req);
  if (!auth) return send(res, 401, { error: 'Niet ingelogd.' });
  const u = db.users[auth.key];

  if (urlPath === '/api/state' && req.method === 'GET') return send(res, 200, { name: u.name, state: u.state, updatedAt: u.updatedAt });
  if (urlPath === '/api/state' && req.method === 'PUT') {
    const b = await readBody(req);
    u.state = cleanState(b.state); u.updatedAt = Date.now();
    saveDb();
    return send(res, 200, { ok: true, updatedAt: u.updatedAt });
  }
  if (urlPath === '/api/logout' && req.method === 'POST') {
    delete db.tokens[auth.token]; saveDb();
    return send(res, 200, { ok: true });
  }
  if (urlPath === '/api/users' && req.method === 'GET') {
    return send(res, 200, { users: Object.values(db.users).map(x => x.name).sort() });
  }
  return send(res, 404, { error: 'Onbekend verzoek.' });
}

// ---------- static files ----------
function serveStatic(req, res, urlPath) {
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const filePath = path.normalize(path.join(ROOT, urlPath));
  const blocked = ['server.js', 'package.json', 'railway.json'];
  if (!filePath.startsWith(ROOT + path.sep) || filePath.startsWith(DATA_DIR) || blocked.includes(path.basename(filePath))) {
    res.writeHead(404); return res.end('Not found');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(filePath);
    const cache = ext === '.webp' || ext === '.png' ? 'public, max-age=604800' : 'no-cache';
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': cache });
    res.end(data);
  });
}

loadDb();
// Keep the process alive: one bad request must never take the server down.
process.on('uncaughtException', e => console.error('uncaughtException', e));
process.on('unhandledRejection', e => console.error('unhandledRejection', e));
http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(req.url.split('?')[0]); }
  catch (e) { res.writeHead(400); return res.end('Bad request'); }
  try {
    if (urlPath.startsWith('/api/')) {
      api(req, res, urlPath).catch(() => send(res, 400, { error: 'Ongeldig verzoek.' }));
    } else if (req.method === 'GET' || req.method === 'HEAD') {
      serveStatic(req, res, urlPath);
    } else { res.writeHead(405); res.end(); }
  } catch (e) {
    console.error('request error', e);
    try { res.writeHead(500); res.end('Server error'); } catch (_) {}
  }
}).listen(PORT, () => console.log('Kook draait op poort ' + PORT + ', data in ' + DATA_DIR));
