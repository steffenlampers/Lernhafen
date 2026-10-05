'use strict';
// Mini-Google zum Testen: Geräte-Anmeldung und ein Drive mit Ordnern und Dateien im Speicher. Wird von den Tests und vom Browser-Durchlauf benutzt.
const http = require('http');
const crypto = require('crypto');

const G = { nodes: {}, seq: 1, authorized: false, refreshInvalid: false, log: [], failUpload: null, tokens: 0, sessions: {}, revoked: 0 };
let mockUrl;
const id = () => 'id' + (G.seq++);
const md5 = b => crypto.createHash('md5').update(b).digest('hex');
const send = (res, code, obj, headers = {}) => { res.writeHead(code, Object.assign({ 'Content-Type': 'application/json' }, headers)); res.end(typeof obj === 'string' ? obj : JSON.stringify(obj)); };
const body = req => new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
const pub = n => ({ id: n.id, name: n.name, mimeType: n.mime, md5Checksum: n.folder ? undefined : n.md5, modifiedTime: n.modified, size: n.folder ? undefined : String(n.content.length), trashed: n.trashed });
const FOLDER = 'application/vnd.google-apps.folder';

function reset() { G.nodes = {}; G.seq = 1; G.authorized = false; G.refreshInvalid = false; G.log = []; G.failUpload = null; G.tokens = 0; G.sessions = {}; G.revoked = 0; }
/** Datei oder Ordner "von Hand" in Drive anlegen (als hätte jemand etwas verändert). Pfad wie "Lernhafen/Anatomie/a.pdf". */
function put(pathStr, content) {
  const parts = pathStr.split('/'); let parent = null;
  for (const [i, name] of parts.entries()) {
    const last = i === parts.length - 1 && content != null;
    let n = Object.values(G.nodes).find(x => x.name === name && x.parent === parent && !x.trashed && x.folder === !last);
    if (!n) { n = { id: id(), name, parent, folder: !last, mime: last ? 'application/octet-stream' : FOLDER, content: Buffer.alloc(0), md5: '', modified: new Date().toISOString(), trashed: false }; G.nodes[n.id] = n; }
    if (last) { n.content = Buffer.from(content); n.md5 = md5(n.content); n.modified = new Date().toISOString(); }
    parent = n.id;
  }
  return G.nodes[parent];
}
const find = pathStr => { let parent = null, n = null; for (const name of pathStr.split('/')) { n = Object.values(G.nodes).find(x => x.name === name && x.parent === parent && !x.trashed); if (!n) return null; parent = n.id; } return n; };
const tree = () => Object.values(G.nodes).filter(n => !n.folder && !n.trashed).map(n => { const parts = []; for (let c = n; c; c = G.nodes[c.parent]) parts.unshift(c.name); return parts.join('/'); }).sort();

function create() {
  return http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x'), p = u.pathname, raw = await body(req), m = req.method;
    G.log.push({ m, p, q: u.search, auth: req.headers.authorization || '', body: raw.length < 3000 ? raw.toString() : '', len: raw.length });
    if (p === '/device/code') { const f = new URLSearchParams(raw.toString()); G.deviceScope = f.get('scope'); G.deviceClient = f.get('client_id'); return send(res, 200, { device_code: 'dev123', user_code: 'ABCD-EFGH', verification_url: 'https://www.google.com/device', expires_in: 900, interval: 5 }); }
    if (p === '/token') {
      const f = new URLSearchParams(raw.toString());
      if (f.get('grant_type') === 'urn:ietf:params:oauth:grant-type:device_code') {
        if (!G.authorized) return send(res, 428, { error: 'authorization_pending' });
        const idt = 'x.' + Buffer.from(JSON.stringify({ email: 'peter@example.org' })).toString('base64url') + '.y';
        return send(res, 200, { access_token: 'at' + (++G.tokens), refresh_token: 'rt1', expires_in: 3600, id_token: idt });
      }
      if (G.refreshInvalid) return send(res, 400, { error: 'invalid_grant' });
      return send(res, 200, { access_token: 'at' + (++G.tokens), expires_in: 3600 });
    }
    if (p === '/revoke') { G.revoked++; return send(res, 200, {}); }
    if (G.expired401 && req.headers.authorization === 'Bearer ' + G.expired401) return send(res, 401, { error: { message: 'abgelaufen' } });
    if (p === '/drive/v3/files' && m === 'GET') {
      const q = u.searchParams.get('q') || '', par = /'([\w-]+)' in parents/.exec(q), nm = /name='((?:[^'\\]|\\.)*)'/.exec(q);
      let list = Object.values(G.nodes).filter(n => !n.trashed);
      if (par) list = list.filter(n => n.parent === par[1]);
      if (/mimeType='[^']*folder'/.test(q)) list = list.filter(n => n.folder);
      if (nm) list = list.filter(n => n.name === nm[1].replace(/\\(.)/g, '$1'));
      return send(res, 200, { files: list.map(pub) });
    }
    let mm = /^\/drive\/v3\/files\/([\w-]+)$/.exec(p);
    if (mm && m === 'GET') { const n = G.nodes[mm[1]]; if (!n) return send(res, 404, { error: { message: 'nicht gefunden' } }); if (u.searchParams.get('alt') === 'media') { res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); return res.end(n.content); } return send(res, 200, pub(n)); }
    if (mm && m === 'PATCH') { const n = G.nodes[mm[1]]; if (!n) return send(res, 404, {}); const b = JSON.parse(raw.toString() || '{}'); if (b.trashed) n.trashed = true; return send(res, 200, pub(n)); }
    if (p === '/drive/v3/files' && m === 'POST') { const b = JSON.parse(raw); const n = { id: id(), name: b.name, parent: (b.parents || [null])[0], folder: b.mimeType === FOLDER, mime: b.mimeType, content: Buffer.alloc(0), md5: '', modified: new Date().toISOString(), trashed: false }; G.nodes[n.id] = n; return send(res, 200, { id: n.id }); }
    if (p === '/upload/drive/v3/files' && m === 'POST') { const b = JSON.parse(raw); if (G.failUpload && G.failUpload.test(b.name)) return send(res, 500, { error: { message: 'Testfehler' } }); const s = 's' + G.seq++; G.sessions[s] = { name: b.name, parent: (b.parents || [null])[0] }; return send(res, 200, {}, { Location: `${mockUrl}/upload/session/${s}` }); }
    mm = /^\/upload\/drive\/v3\/files\/([\w-]+)$/.exec(p);
    if (mm && m === 'PATCH') { const s = 's' + G.seq++; G.sessions[s] = { update: mm[1] }; return send(res, 200, {}, { Location: `${mockUrl}/upload/session/${s}` }); }
    mm = /^\/upload\/session\/(\w+)$/.exec(p);
    if (mm && m === 'PUT') {
      const s = G.sessions[mm[1]]; let n;
      if (s.update) { n = G.nodes[s.update]; } else { n = { id: id(), name: s.name, parent: s.parent, folder: false, mime: 'application/octet-stream', trashed: false }; G.nodes[n.id] = n; }
      n.content = raw; n.md5 = md5(raw); n.modified = new Date().toISOString();
      return send(res, 200, { id: n.id, md5Checksum: n.md5, modifiedTime: n.modified });
    }
    send(res, 404, { error: { message: 'unbekannt ' + p } });
  });
}
function setUrl(u) { mockUrl = u; }
module.exports = { G, create, setUrl, put, find, tree, reset };
