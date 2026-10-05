'use strict';
// Mini-Google zum Testen: antwortet wie Google (vereinfacht). Wird von den Tests und vom Browser-Durchlauf benutzt.
const http = require('http');
const G = { folders: {}, log: [], failNextAuth: false, refreshInvalid: false, tokens: 0, events: {}, gcalEvents: {}, nextId: 1 };
let mockUrl;
const body = req => new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
const send = (res, code, obj, headers = {}) => { res.writeHead(code, Object.assign({ 'Content-Type': 'application/json' }, headers)); res.end(typeof obj === 'string' ? obj : JSON.stringify(obj)); };

function create() {
  return http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x'), p = u.pathname, raw = await body(req), m = req.method;
    G.log.push({ m, p, q: u.search, auth: req.headers.authorization || '', body: raw.toString().slice(0, 4000), len: raw.length });
    if (p === '/token') {
      const f = new URLSearchParams(raw.toString());
      if (f.get('grant_type') === 'authorization_code') {
        if (f.get('code') !== 'gute-code') return send(res, 400, { error: 'invalid_grant', error_description: 'Bad code' });
        G.verifier = f.get('code_verifier'); G.redirect = f.get('redirect_uri'); G.secret = f.get('client_secret');
        return send(res, 200, { access_token: 'at' + (++G.tokens), refresh_token: 'rt1', expires_in: 3600, scope: 'x' });
      }
      if (G.refreshInvalid) return send(res, 400, { error: 'invalid_grant' });
      return send(res, 200, { access_token: 'at' + (++G.tokens), expires_in: 3600 });
    }
    if (p === '/revoke') return send(res, 200, {});
    if (p === '/v1/userinfo') return send(res, 200, { email: 'peter@example.org' });
    if (G.reject401 && req.headers.authorization === 'Bearer ' + G.reject401) return send(res, 401, { error: { message: 'expired' } });
    if (p === '/drive/v3/files' && m === 'GET') {
      const q = u.searchParams.get('q') || '', nm = /name='((?:[^'\\]|\\.)*)'/.exec(q);
      if (nm) return send(res, 200, { files: G.folders[nm[1]] ? [{ id: G.folders[nm[1]] }] : [] });
      return send(res, 200, { files: [{ id: 'ord1', name: 'Anatomie', mimeType: 'application/vnd.google-apps.folder' }, { id: 'doc1', name: 'Mitschrift', mimeType: 'application/vnd.google-apps.document', webViewLink: 'https://docs.google.com/document/d/doc1/edit', modifiedTime: '2026-10-01T10:00:00Z' }], q });
    }
    if (p === '/drive/v3/files' && m === 'POST') { const b = JSON.parse(raw); if (b.mimeType.includes('folder')) G.folders[b.name] = 'F' + b.name; return send(res, 200, { id: b.mimeType.includes('folder') ? 'F' + b.name : 'neuesDoc1', name: b.name, webViewLink: 'https://x/' + b.name }); }
    if (p === '/drive/v3/files/doc1/export') return send(res, 200, 'Plexus brachialis\nNerven des Arms', { 'Content-Type': 'text/plain' });
    if (p === '/drive/v3/files/doc1') return send(res, 200, { id: 'doc1', name: 'Mitschrift', mimeType: 'application/vnd.google-apps.document', webViewLink: 'https://docs.google.com/document/d/doc1/edit' });
    if (p === '/drive/v3/files/pdf1') return send(res, 200, { id: 'pdf1', name: 'Skript.pdf', mimeType: 'application/pdf' });
    if (p === '/upload/drive/v3/files') return send(res, 200, {}, { Location: mockUrl + '/upload/session/1' });
    if (p === '/upload/session/1') return send(res, 200, { id: 'hoch' + G.log.length, name: 'hochgeladen', webViewLink: 'https://drive.google.com/file/d/h/view' });
    if (/^\/v1\/documents\/[^/:]+$/.test(p) && m === 'GET') return send(res, 200, { title: 'Mitschrift', body: { content: [{ endIndex: 1 }, { endIndex: 25, paragraph: { elements: [{ textRun: { content: 'Altes Thema\n' } }], paragraphStyle: { namedStyleType: 'HEADING_2' } } }, { endIndex: 40, paragraph: { elements: [{ textRun: { content: 'Text dazu\n' } }], paragraphStyle: { namedStyleType: 'NORMAL_TEXT' } } }] } });
    if (/^\/v1\/documents\/.+:batchUpdate$/.test(p)) return send(res, 200, {});
    if (p === '/calendar/v3/users/me/calendarList') return send(res, 200, { items: [{ id: 'primary@x', summary: 'Peter', primary: true }, { id: 'uni@x', summary: 'Uni' }] });
    if (p === '/calendar/v3/calendars/uni%40x/events') return send(res, 200, { items: [
      { id: 'e1', summary: 'Vorlesung Anatomie', location: 'H1', start: { dateTime: '2026-10-06T08:15:00+02:00' }, end: { dateTime: '2026-10-06T09:45:00+02:00' } },
      { id: 'e2', summary: 'Anmeldefrist', start: { date: '2026-10-09' }, end: { date: '2026-10-10' } },
      { id: 'e3', summary: 'Blockwoche', start: { date: '2026-10-12' }, end: { date: '2026-10-14' } },
      { id: 'e4', summary: 'Abgesagt', status: 'cancelled', start: { dateTime: '2026-10-07T10:00:00+02:00' }, end: { dateTime: '2026-10-07T11:00:00+02:00' } }] });
    if (p === '/calendar/v3/calendars' && m === 'POST') return send(res, 200, { id: 'lernkal@x' });
    let mm = /^\/calendar\/v3\/calendars\/lernkal%40x\/events(?:\/(.+))?$/.exec(p);
    if (mm) {
      if (m === 'POST') { const id = 'g' + G.nextId++; G.gcalEvents[id] = JSON.parse(raw); return send(res, 200, { id }); }
      if (m === 'PUT') { G.gcalEvents[mm[1]] = JSON.parse(raw); return send(res, 200, { id: mm[1] }); }
      if (m === 'DELETE') { delete G.gcalEvents[mm[1]]; return send(res, 204, ''); }
    }
    if (p === '/gmail/v1/users/me/messages') return send(res, 200, { messages: [{ id: 'm1' }], resultSizeEstimate: 7 });
    if (p === '/gmail/v1/users/me/messages/m1') return send(res, 200, { payload: { headers: [{ name: 'From', value: '"Frau Müller" <mueller@schule.de>' }, { name: 'Subject', value: 'Raumänderung' }, { name: 'Date', value: 'Mon, 5 Oct 2026 08:00:00 +0200' }] } });
    send(res, 404, { error: { message: 'unbekannt ' + p } });
  });
}
function setUrl(u) { mockUrl = u; }
module.exports = { G, create, setUrl };
