// Kook server: serves the app and stores per-user state (name + PIN).
// No dependencies. Data lives in DATA_DIR (a Railway volume mounted at /data).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(ROOT, 'data'));
const DB_FILE = path.join(DATA_DIR, 'users.json');
const INBOX_FILE = path.join(DATA_DIR, 'inbox.json');
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
const DEFAULT_STATE = { week: [], fav: [], ratings: {}, checked: {}, persons: 2, pantry: {}, gone: {} };
function cleanState(s) {
  s = s && typeof s === 'object' ? s : {};
  return {
    week: Array.isArray(s.week) ? s.week.filter(Number.isInteger).slice(0, 100) : [],
    // plan (recipe id -> day 0..6) and dayPersons are only stored once a client sends them, so
    // older saved weeks are still migrated by the client (the first seven dishes keep their day).
    ...(s.plan && typeof s.plan === 'object' && !Array.isArray(s.plan) ? { plan: Object.fromEntries(Object.entries(s.plan).filter(([k, v]) => /^\d+$/.test(k) && Number.isInteger(v) && v >= 0 && v < 7).slice(0, 100)) } : {}),
    ...(Array.isArray(s.dayPersons) ? { dayPersons: Array.from({ length: 7 }, (_, i) => { const n = parseInt(s.dayPersons[i]); return n >= 1 && n <= 16 ? n : null; }) } : {}),
    fav: Array.isArray(s.fav) ? s.fav.filter(Number.isInteger).slice(0, 500) : [],
    ratings: s.ratings && typeof s.ratings === 'object' ? s.ratings : {},
    checked: s.checked && typeof s.checked === 'object' ? s.checked : {},
    persons: Math.max(1, Math.min(16, parseInt(s.persons) || 2)),
    pantry: s.pantry && typeof s.pantry === 'object' ? s.pantry : {},
    gone: s.gone && typeof s.gone === 'object' && !Array.isArray(s.gone) ? s.gone : {},
    extra: Array.isArray(s.extra) ? s.extra.map(x => typeof x === 'string' ? {n: x, q: ''} : (x && typeof x.n === 'string' ? {n: x.n, q: typeof x.q === 'string' ? x.q : ''} : null)).filter(x => x && x.n.trim()).map(x => ({n: x.n.slice(0, 200), q: x.q.slice(0, 80)})).slice(0, 100) : []
  };
}

// ---------- TikTok inbox ----------
// Users hand in links to TikTok cooking videos. They are turned into recipes outside the
// server (tools/tiktok.py reads /api/inbox/pending); a link counts as done once the app
// ships a recipe for that video, so the server never has to track a status.
let inbox = { items: [] };
function loadInbox() {
  try { inbox = JSON.parse(fs.readFileSync(INBOX_FILE, 'utf8')); } catch (e) { inbox = { items: [] }; }
  if (!Array.isArray(inbox.items)) inbox.items = [];
}
function saveInbox() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = INBOX_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(inbox));
  fs.renameSync(tmp, INBOX_FILE);
}
const TIKTOK_HOST = /^([a-z0-9-]+\.)?tiktok\.com$/;
// First TikTok link in a piece of text (a share from the TikTok app is a sentence plus the link).
function tiktokUrl(text) {
  for (const m of String(text || '').slice(0, 2000).matchAll(/https?:\/\/[^\s<>"']+/g)) {
    try {
      const u = new URL(m[0].replace(/[).,!?]+$/, ''));
      if (TIKTOK_HOST.test(u.hostname) && u.pathname.length > 1) return 'https://' + u.hostname + u.pathname;
    } catch (e) {}
  }
  return null;
}
function tiktokParts(url) {
  const id = /\/(?:video|photo)\/(\d+)/.exec(url), handle = /\/@([^/?]+)/.exec(url);
  return { videoId: id ? id[1] : '', handle: handle ? handle[1] : '' };
}
// Short share links (vm.tiktok.com/…, tiktok.com/t/…) redirect to the full video link.
// Follow at most four redirects, and only within tiktok.com.
function resolveTikTok(url, hops = 4) {
  return new Promise(resolve => {
    if (tiktokParts(url).videoId || hops <= 0) return resolve(url);
    const req = https.get(url, { timeout: 6000, headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36' } }, res => {
      res.resume();
      let next = null;
      try {
        const u = new URL(res.headers.location || '', url);
        if (res.statusCode >= 300 && res.statusCode < 400 && u.protocol === 'https:' && TIKTOK_HOST.test(u.hostname)) next = 'https://' + u.hostname + u.pathname;
      } catch (e) {}
      next ? resolveTikTok(next, hops - 1).then(resolve) : resolve(url);
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(url));
  });
}
function inboxFor(key) {
  return inbox.items.filter(it => it.by.includes(key)).map(({ id, url, videoId, handle, at }) => ({ id, url, videoId, handle, at }));
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

  // Read by tools/tiktok.py. Only public video links, no user names. Set INBOX_KEY to require ?key=.
  if (urlPath === '/api/inbox/pending' && req.method === 'GET') {
    if (process.env.INBOX_KEY && new URL(req.url, 'http://x').searchParams.get('key') !== process.env.INBOX_KEY) return send(res, 401, { error: 'Niet toegestaan.' });
    return send(res, 200, { items: inbox.items.map(({ url, videoId, handle, at }) => ({ url, videoId, handle, at })) });
  }

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
  if (urlPath === '/api/inbox' && req.method === 'GET') return send(res, 200, { items: inboxFor(auth.key) });
  if (urlPath === '/api/inbox' && req.method === 'POST') {
    const b = await readBody(req);
    const found = tiktokUrl(b.url);
    if (!found) return send(res, 400, { error: 'Dit is geen TikTok-link. Kopieer de link via Delen in TikTok.' });
    const url = await resolveTikTok(found), parts = tiktokParts(url);
    let it = inbox.items.find(x => (parts.videoId && x.videoId === parts.videoId) || x.url === url || x.url === found);
    if (it && it.by.includes(auth.key)) return send(res, 200, { items: inboxFor(auth.key), known: true });
    if (!it) {
      if (inbox.items.length >= 500) return send(res, 400, { error: 'De wachtrij is vol. Probeer het later opnieuw.' });
      if (inboxFor(auth.key).length >= 60) return send(res, 400, { error: 'Je hebt al veel links doorgegeven. Verwijder er eerst een paar.' });
      it = { id: crypto.randomBytes(6).toString('hex'), url, videoId: parts.videoId, handle: parts.handle, at: Date.now(), by: [] };
      inbox.items.push(it);
    }
    it.by.push(auth.key);
    saveInbox();
    return send(res, 200, { items: inboxFor(auth.key) });
  }
  if (urlPath === '/api/inbox/remove' && req.method === 'POST') {
    const b = await readBody(req);
    const it = inbox.items.find(x => x.id === b.id);
    if (it) {
      it.by = it.by.filter(k => k !== auth.key);
      if (!it.by.length) inbox.items = inbox.items.filter(x => x !== it);
      saveInbox();
    }
    return send(res, 200, { items: inboxFor(auth.key) });
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
  const hidden = path.relative(ROOT, filePath).split(path.sep).some(part => part.startsWith('.'));
  if (!filePath.startsWith(ROOT + path.sep) || filePath.startsWith(DATA_DIR) || hidden || blocked.includes(path.basename(filePath))) {
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
loadInbox();
// Keep the process alive: one bad request must never take the server down.
process.on('uncaughtException', e => console.error('uncaughtException', e));
process.on('unhandledRejection', e => console.error('unhandledRejection', e));
const server = http.createServer((req, res) => {
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
// Railway stops the old container with SIGTERM on every redeploy; exit cleanly
// so that is not reported as a crash. Writes are synchronous, so nothing is lost.
function shutdown(sig) {
  console.log(sig + ' ontvangen, Kook stopt');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
