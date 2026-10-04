'use strict';
// Optionales Passwort für die ganze App. Ohne APP_PASSWORD ist die App offen (nur im Heimnetz sinnvoll).
const crypto = require('crypto');
const config = require('./config');
const store = require('./store');

let secret = (store.read('secret', {}) || {}).s;
if (!secret) { secret = crypto.randomBytes(32).toString('hex'); store.write('secret', { s: secret }, 0o600); }

const sign = v => crypto.createHmac('sha256', secret).update(v).digest('hex');
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const enabled = () => !!config.appPassword;

function token() { const exp = Date.now() + 30 * 864e5; return exp + '.' + sign('lh.' + exp); }
function valid(t) {
  const [exp, sig] = String(t || '').split('.');
  return !!(exp && sig && Number(exp) > Date.now() && same(sig, sign('lh.' + exp)));
}
function cookieOf(req) {
  const m = /(?:^|;\s*)lh=([^;]+)/.exec(req.headers.cookie || '');
  return m ? decodeURIComponent(m[1]) : '';
}
const authed = req => !enabled() || valid(cookieOf(req));

const fails = new Map();
function login(req, res) {
  const ip = req.ip || 'x', f = fails.get(ip) || { n: 0, t: 0 };
  if (Date.now() - f.t > 60000) { f.n = 0; }
  if (f.n >= 5) return res.status(429).json({ error: 'Zu viele Versuche. Warte eine Minute.' });
  if (!same(String((req.body || {}).password || ''), config.appPassword)) {
    f.n++; f.t = Date.now(); fails.set(ip, f);
    return res.status(401).json({ error: 'Falsches Passwort.' });
  }
  fails.delete(ip);
  res.setHeader('Set-Cookie', `lh=${encodeURIComponent(token())}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 86400}`);
  res.json({ ok: true });
}
function logout(req, res) {
  res.setHeader('Set-Cookie', 'lh=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
}
function guard(req, res, next) {
  if (authed(req)) return next();
  res.status(401).json({ error: 'login', loginRequired: true });
}

module.exports = { enabled, authed, login, logout, guard };
