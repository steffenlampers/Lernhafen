'use strict';
const path = require('path');

const num = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };

module.exports = {
  port: num(process.env.PORT, 8088),
  dataDir: process.env.DATA_DIR || path.join(process.cwd(), 'data'),
  appPassword: process.env.APP_PASSWORD || '',
  appName: (process.env.APP_NAME || 'Lernhafen').slice(0, 40),
  profile: process.env.PROFILE || 'allgemein',
  syncHour: Math.min(Math.max(num(process.env.SYNC_HOUR, 6), 0), 23),
  ocrLang: /^[a-z_+]+$/i.test(process.env.OCR_LANG || '') ? process.env.OCR_LANG : 'deu+eng',
  version: require('../package.json').version
};
