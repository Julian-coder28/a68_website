const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = process.cwd();
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'Julian from a68 <julian@a68.io>';
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'julian@a68.io';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const subscriberText = [
  'Hi there,',
  '',
  'The newsletter signup was successful.',
  '',
  'From now on, updates from a68 will arrive in this inbox, including how the latest AI research is being brought into insurance to help revolutionize fraud detection.',
  '',
  'Preferences can be managed anytime-',
  '',
  'Best,',
  'Julian from a68'
].join('\n');

const subscriberHtml = [
  '<p>Hi there,</p>',
  '<p>The newsletter signup was successful.</p>',
  '<p>From now on, updates from a68 will arrive in this inbox, including how the latest AI research is being brought into insurance to help revolutionize fraud detection.</p>',
  '<p>Preferences can be managed anytime-</p>',
  '<p>Best,<br>Julian from a68</p>'
].join('');

const sendEmail = async (payload) => {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || 'Email provider error');
  }
};

const readBody = (req) => new Promise((resolve, reject) => {
  let data = '';
  req.on('data', (chunk) => {
    data += chunk;
    if (data.length > 1_000_000) {
      reject(new Error('Payload too large'));
      req.destroy();
    }
  });
  req.on('end', () => resolve(data));
  req.on('error', reject);
});

const handleSubscribe = async (req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  if (!RESEND_API_KEY) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing RESEND_API_KEY' }));
    return;
  }

  let payload;
  try {
    const body = await readBody(req);
    payload = JSON.parse(body || '{}');
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    return;
  }

  const email = String(payload.email || '').trim();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!valid) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid email' }));
    return;
  }

  try {
    await sendEmail({
      from: FROM_EMAIL,
      to: [email],
      subject: 'Welcome to the a68 newsletter',
      text: subscriberText,
      html: subscriberHtml
    });
    await sendEmail({
      from: FROM_EMAIL,
      to: [OWNER_EMAIL],
      subject: 'New newsletter signup',
      text: `New signup: ${email}`,
      html: `<p>New signup: <strong>${email}</strong></p>`
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to send email' }));
  }
};

const serveStatic = async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(ROOT, pathname));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = CONTENT_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    fs.createReadStream(filePath).pipe(res);
  });
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api/subscribe') {
    handleSubscribe(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
