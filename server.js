const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const AUTH_EMAIL = process.env.AUTH_EMAIL || '';
const AUTH_PASSWORD1 = process.env.AUTH_PASSWORD1 || '';
const AUTH_PASSWORD2 = process.env.AUTH_PASSWORD2 || '';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

app.use(cookieParser());

// ─── Supabase Admin Client ────────────────────────────────────────────────────
let supabaseAdmin = null;
try {
  const { createClient } = require('@supabase/supabase-js');
  const sbUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (sbUrl && sbKey) {
    supabaseAdmin = createClient(sbUrl, sbKey, { auth: { persistSession: false } });
  }
} catch (e) {
  console.error('[Supabase] Admin client error:', e.message);
}

// ─── Cloudinary Setup ─────────────────────────────────────────────────────────
let cloudinary = null;
try {
  cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
    api_key: process.env.CLOUDINARY_API_KEY || '',
    api_secret: process.env.CLOUDINARY_API_SECRET || '',
  });
} catch (e) {
  console.error('[Cloudinary] Setup error:', e.message);
}

// ─── Multer Memory Storage ────────────────────────────────────────────────────
let multer = null;
let upload = null;
try {
  multer = require('multer');
  upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });
} catch (e) {
  console.error('[Multer] Setup error:', e.message);
}

// ─── Auth Helpers ─────────────────────────────────────────────────────────────
function signToken(payload) {
  const data = JSON.stringify(payload);
  const b64 = Buffer.from(data).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [b64, sig] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(b64).digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    return JSON.parse(Buffer.from(b64, 'base64url').toString());
  } catch {
    return null;
  }
}

function isAuthenticated(req) {
  const token = req.cookies.__style_auth;
  const payload = verifyToken(token);
  if (!payload) return false;
  return payload.email === AUTH_EMAIL && payload.exp > Date.now();
}

function requireAdminAuth(req, res, next) {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ message: 'Unauthorized. Please log in.' });
  }
  next();
}

// ─── Login Page ────────────────────────────────────────────────────────────────
const LOGIN_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Style — Admin Access</title>
<link rel="icon" type="image/svg+xml" href="/style-logo.svg">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #0a0a0a;
  color: #fff;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.container {
  width: 100%;
  max-width: 420px;
  background: rgba(20, 20, 20, 0.95);
  border: 1px solid rgba(212, 175, 55, 0.3);
  border-radius: 24px;
  padding: 48px 36px;
  box-shadow: 0 8px 60px rgba(212, 175, 55, 0.08);
}
.logo-wrap { text-align: center; margin-bottom: 36px; }
.logo {
  display: inline-block;
  font-size: 42px;
  font-weight: 800;
  letter-spacing: 6px;
  background: linear-gradient(135deg, #d4af37 0%, #f5d77a 40%, #d4af37 60%, #b8860b 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.subtitle { color: rgba(255,255,255,0.4); font-size: 13px; letter-spacing: 2px; margin-top: 8px; text-transform: uppercase; }
.form { display: flex; flex-direction: column; gap: 18px; }
.field label { display: block; font-size: 12px; color: rgba(255,255,255,0.5); margin-bottom: 8px; letter-spacing: 1px; text-transform: uppercase; }
.field input {
  width: 100%; padding: 14px 18px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px; color: #fff; font-size: 15px; outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.field input:focus { border-color: rgba(212, 175, 55, 0.5); box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.1); }
.field input::placeholder { color: rgba(255,255,255,0.2); }
.btn {
  width: 100%; padding: 16px;
  background: linear-gradient(135deg, #d4af37 0%, #b8860b 100%);
  color: #0a0a0a; border: none; border-radius: 12px;
  font-size: 15px; font-weight: 700; letter-spacing: 1px; cursor: pointer;
  transition: transform 0.15s, box-shadow 0.2s; margin-top: 8px;
}
.btn:hover { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(212, 175, 55, 0.25); }
.btn:active { transform: translateY(0); }
.error { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; padding: 12px 16px; border-radius: 10px; font-size: 13px; text-align: center; display: none; }
.error.show { display: block; }
</style>
</head>
<body>
<div class="container">
  <div class="logo-wrap">
    <div class="logo">STYLE</div>
    <div class="subtitle">Admin Access</div>
  </div>
  <form class="form" id="loginForm">
    <div class="field">
      <label>Email</label>
      <input type="email" name="email" placeholder="admin@yourdomain.com" required autocomplete="username">
    </div>
    <div class="field">
      <label>Password</label>
      <input type="password" name="password1" placeholder="Enter password" required autocomplete="current-password">
    </div>
    <div class="field">
      <label>Access Key</label>
      <input type="password" name="password2" placeholder="Enter access key" required autocomplete="off">
    </div>
    <div id="error" class="error"></div>
    <button type="submit" class="btn">Enter Admin Panel</button>
  </form>
</div>
<script>
document.getElementById('loginForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  var form = e.target;
  var data = new FormData(form);
  try {
    var res = await fetch('/__auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: data.get('email'), password1: data.get('password1'), password2: data.get('password2') })
    });
    if (res.ok) {
      window.location.href = '/admin-panel';
    } else {
      var err = await res.json();
      var el = document.getElementById('error');
      el.textContent = err.message || 'Invalid credentials';
      el.classList.add('show');
    }
  } catch (err) {
    var el = document.getElementById('error');
    el.textContent = 'Connection error. Please try again.';
    el.classList.add('show');
  }
});
</script>
</body>
</html>`;

// ─── Auth Endpoints ───────────────────────────────────────────────────────────
app.post('/__auth', express.json(), (req, res) => {
  const { email, password1, password2 } = req.body || {};
  if (!email || !password1 || !password2) {
    return res.status(400).json({ message: 'All fields are required.' });
  }
  if (email === AUTH_EMAIL && password1 === AUTH_PASSWORD1 && password2 === AUTH_PASSWORD2) {
    const token = signToken({ email, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 });
    res.cookie('__style_auth', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });
    return res.json({ ok: true });
  }
  return res.status(401).json({ message: 'Invalid email or passwords.' });
});

app.post('/__logout', (req, res) => {
  res.clearCookie('__style_auth');
  res.json({ ok: true });
});

// ─── SVG Assets ──────────────────────────────────────────────────────────────
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f5d77a"/>
      <stop offset="40%" stop-color="#d4af37"/>
      <stop offset="60%" stop-color="#d4af37"/>
      <stop offset="100%" stop-color="#b8860b"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="#0a0a0a"/>
  <text x="32" y="44" text-anchor="middle" font-family="Georgia, serif" font-size="38" font-weight="bold" fill="url(#g)">S</text>
</svg>`;

app.get('/style-logo.svg', (req, res) => { res.set('Content-Type', 'image/svg+xml'); res.send(LOGO_SVG); });
app.get('/favicon.svg', (req, res) => { res.set('Content-Type', 'image/svg+xml'); res.send(LOGO_SVG); });

// ─── Cloudinary Upload Endpoint ───────────────────────────────────────────────
app.post('/api/upload', requireAdminAuth, (req, res, next) => {
  if (!upload) return res.status(500).json({ message: 'File upload not available (multer not installed).' });
  if (!cloudinary || !process.env.CLOUDINARY_CLOUD_NAME) {
    return res.status(500).json({ message: 'Cloudinary not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.' });
  }
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ message: 'Upload error: ' + err.message });
    if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });
    const resourceType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
    try {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: resourceType, folder: 'style-app', quality: 'auto', fetch_format: 'auto' },
          (error, result) => error ? reject(error) : resolve(result)
        );
        stream.end(req.file.buffer);
      });
      res.json({ url: result.secure_url, public_id: result.public_id, resource_type: resourceType });
    } catch (uploadErr) {
      res.status(500).json({ message: 'Cloudinary upload failed: ' + uploadErr.message });
    }
  });
});

// ─── Admin API Routes ─────────────────────────────────────────────────────────
const adminRouter = express.Router();
adminRouter.use(requireAdminAuth);
adminRouter.use(express.json());

function checkDb(res) {
  if (!supabaseAdmin) {
    res.status(500).json({ message: 'Database not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' });
    return false;
  }
  return true;
}

// Stats
adminRouter.get('/stats', async (req, res) => {
  if (!checkDb(res)) return;
  try {
    const [products, orders, reels, categories] = await Promise.all([
      supabaseAdmin.from('products').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('orders').select('id,total', { count: 'exact' }),
      supabaseAdmin.from('reels').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('categories').select('id', { count: 'exact', head: true }),
    ]);
    const revenue = (orders.data || []).reduce((s, o) => s + (Number(o.total) || 0), 0);
    res.json({
      products: products.count || 0,
      orders: orders.count || 0,
      reels: reels.count || 0,
      categories: categories.count || 0,
      revenue: revenue.toFixed(2),
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Products
adminRouter.get('/products', async (req, res) => {
  if (!checkDb(res)) return;
  const { data, error } = await supabaseAdmin.from('products')
    .select('*, images:product_images(image_url, sort_order), category:categories(name)')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

adminRouter.post('/products', async (req, res) => {
  if (!checkDb(res)) return;
  const { data, error } = await supabaseAdmin.from('products').insert(req.body).select().single();
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

adminRouter.put('/products/:id', async (req, res) => {
  if (!checkDb(res)) return;
  const { data, error } = await supabaseAdmin.from('products').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

adminRouter.delete('/products/:id', async (req, res) => {
  if (!checkDb(res)) return;
  const { error } = await supabaseAdmin.from('products').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ message: error.message });
  res.json({ ok: true });
});

adminRouter.post('/products/:id/images', async (req, res) => {
  if (!checkDb(res)) return;
  const { image_url, sort_order } = req.body;
  const { data, error } = await supabaseAdmin.from('product_images')
    .insert({ product_id: req.params.id, image_url, sort_order: sort_order || 0 }).select().single();
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

adminRouter.delete('/products/:id/images/:imgId', async (req, res) => {
  if (!checkDb(res)) return;
  const { error } = await supabaseAdmin.from('product_images').delete().eq('id', req.params.imgId);
  if (error) return res.status(500).json({ message: error.message });
  res.json({ ok: true });
});

// Categories
adminRouter.get('/categories', async (req, res) => {
  if (!checkDb(res)) return;
  const { data, error } = await supabaseAdmin.from('categories').select('*').order('sort_order');
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

adminRouter.post('/categories', async (req, res) => {
  if (!checkDb(res)) return;
  const { data, error } = await supabaseAdmin.from('categories').insert(req.body).select().single();
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

adminRouter.put('/categories/:id', async (req, res) => {
  if (!checkDb(res)) return;
  const { data, error } = await supabaseAdmin.from('categories').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

adminRouter.delete('/categories/:id', async (req, res) => {
  if (!checkDb(res)) return;
  const { error } = await supabaseAdmin.from('categories').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ message: error.message });
  res.json({ ok: true });
});

// Orders
adminRouter.get('/orders', async (req, res) => {
  if (!checkDb(res)) return;
  const { data, error } = await supabaseAdmin.from('orders')
    .select('*, order_items(*)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

adminRouter.put('/orders/:id/status', async (req, res) => {
  if (!checkDb(res)) return;
  const { status, payment_status } = req.body;
  const update = {};
  if (status) update.status = status;
  if (payment_status) update.payment_status = payment_status;
  const { data, error } = await supabaseAdmin.from('orders').update(update).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

// Reels
adminRouter.get('/reels', async (req, res) => {
  if (!checkDb(res)) return;
  const { data, error } = await supabaseAdmin.from('reels')
    .select('*, product:products(id, name, slug)')
    .order('sort_order').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

adminRouter.post('/reels', async (req, res) => {
  if (!checkDb(res)) return;
  const { data, error } = await supabaseAdmin.from('reels').insert(req.body).select().single();
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

adminRouter.put('/reels/:id', async (req, res) => {
  if (!checkDb(res)) return;
  const { data, error } = await supabaseAdmin.from('reels').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

adminRouter.delete('/reels/:id', async (req, res) => {
  if (!checkDb(res)) return;
  const { error } = await supabaseAdmin.from('reels').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ message: error.message });
  res.json({ ok: true });
});

// Banners
adminRouter.get('/banners', async (req, res) => {
  if (!checkDb(res)) return;
  const { data, error } = await supabaseAdmin.from('banners').select('*').order('sort_order');
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

adminRouter.post('/banners', async (req, res) => {
  if (!checkDb(res)) return;
  const { data, error } = await supabaseAdmin.from('banners').insert(req.body).select().single();
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

adminRouter.put('/banners/:id', async (req, res) => {
  if (!checkDb(res)) return;
  const { data, error } = await supabaseAdmin.from('banners').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

adminRouter.delete('/banners/:id', async (req, res) => {
  if (!checkDb(res)) return;
  const { error } = await supabaseAdmin.from('banners').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ message: error.message });
  res.json({ ok: true });
});

// Coupons
adminRouter.get('/coupons', async (req, res) => {
  if (!checkDb(res)) return;
  const { data, error } = await supabaseAdmin.from('coupons').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

adminRouter.post('/coupons', async (req, res) => {
  if (!checkDb(res)) return;
  const { data, error } = await supabaseAdmin.from('coupons').insert(req.body).select().single();
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

adminRouter.put('/coupons/:id', async (req, res) => {
  if (!checkDb(res)) return;
  const { data, error } = await supabaseAdmin.from('coupons').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

adminRouter.delete('/coupons/:id', async (req, res) => {
  if (!checkDb(res)) return;
  const { error } = await supabaseAdmin.from('coupons').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ message: error.message });
  res.json({ ok: true });
});

app.use('/api/admin', adminRouter);

// ─── Admin Panel HTML ─────────────────────────────────────────────────────────
function getAdminHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Style Admin</title>
<link rel="icon" type="image/svg+xml" href="/style-logo.svg">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a0a;color:#e5e5e5;display:flex;min-height:100vh;font-size:14px}
.sidebar{width:220px;background:#111;border-right:1px solid #222;padding:24px 0;display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:100}
.sidebar-logo{padding:0 20px 24px;border-bottom:1px solid #222;margin-bottom:16px}
.sidebar-logo .name{font-size:22px;font-weight:800;letter-spacing:4px;background:linear-gradient(135deg,#d4af37,#f5d77a,#b8860b);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.sidebar-logo .sub{font-size:10px;color:#555;letter-spacing:2px;text-transform:uppercase;margin-top:2px}
nav a{display:flex;align-items:center;gap:10px;padding:11px 20px;color:#888;text-decoration:none;font-size:13px;font-weight:500;border-left:3px solid transparent;transition:all .15s;cursor:pointer}
nav a:hover{color:#d4af37;background:rgba(212,175,55,.05)}
nav a.active{color:#d4af37;border-left-color:#d4af37;background:rgba(212,175,55,.07)}
.nav-icon{width:18px;height:18px;opacity:.7}
.sidebar-footer{margin-top:auto;padding:16px 20px;border-top:1px solid #222}
.logout-btn{width:100%;padding:10px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);border-radius:8px;color:#f87171;font-size:13px;cursor:pointer;transition:all .15s}
.logout-btn:hover{background:rgba(239,68,68,.15)}
.main{margin-left:220px;flex:1;padding:28px;min-height:100vh}
.page-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}
.page-title{font-size:22px;font-weight:700;color:#fff}
.btn{padding:9px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:none;transition:all .15s}
.btn-primary{background:linear-gradient(135deg,#d4af37,#b8860b);color:#0a0a0a}
.btn-primary:hover{opacity:.9;transform:translateY(-1px)}
.btn-danger{background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.3);color:#f87171}
.btn-danger:hover{background:rgba(239,68,68,.25)}
.btn-sm{padding:5px 12px;font-size:12px}
.btn-ghost{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#bbb}
.btn-ghost:hover{background:rgba(255,255,255,.1)}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;margin-bottom:28px}
.stat-card{background:#161616;border:1px solid #222;border-radius:14px;padding:20px;position:relative;overflow:hidden}
.stat-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#d4af37,#b8860b)}
.stat-label{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
.stat-value{font-size:28px;font-weight:800;color:#fff}
.stat-sub{font-size:11px;color:#555;margin-top:4px}
.card{background:#161616;border:1px solid #222;border-radius:14px;overflow:hidden;margin-bottom:24px}
.card-header{padding:16px 20px;border-bottom:1px solid #222;display:flex;justify-content:space-between;align-items:center}
.card-title{font-size:15px;font-weight:600;color:#fff}
table{width:100%;border-collapse:collapse}
th{padding:11px 16px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:#555;border-bottom:1px solid #1a1a1a}
td{padding:13px 16px;border-bottom:1px solid #1a1a1a;color:#bbb;vertical-align:middle}
tr:last-child td{border-bottom:none}
tr:hover td{background:rgba(255,255,255,.02)}
.badge{display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap}
.badge-green{background:rgba(34,197,94,.1);color:#4ade80}
.badge-yellow{background:rgba(234,179,8,.1);color:#facc15}
.badge-red{background:rgba(239,68,68,.1);color:#f87171}
.badge-blue{background:rgba(59,130,246,.1);color:#60a5fa}
.badge-gray{background:rgba(255,255,255,.05);color:#666}
.thumb{width:44px;height:44px;border-radius:8px;object-fit:cover;background:#1a1a1a}
.actions{display:flex;gap:8px;align-items:center}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px}
.modal{background:#161616;border:1px solid #2a2a2a;border-radius:20px;width:100%;max-width:560px;max-height:90vh;overflow-y:auto}
.modal-header{padding:20px 24px;border-bottom:1px solid #222;display:flex;justify-content:space-between;align-items:center}
.modal-title{font-size:17px;font-weight:700;color:#fff}
.modal-close{background:none;border:none;color:#555;cursor:pointer;font-size:20px;line-height:1;padding:4px}
.modal-close:hover{color:#bbb}
.modal-body{padding:24px}
.modal-footer{padding:16px 24px;border-top:1px solid #222;display:flex;gap:12px;justify-content:flex-end}
.form-group{margin-bottom:18px}
.form-group label{display:block;font-size:12px;color:#888;margin-bottom:6px;font-weight:500;letter-spacing:.3px}
.form-group input,.form-group select,.form-group textarea{width:100%;padding:11px 14px;background:#0d0d0d;border:1px solid #2a2a2a;border-radius:10px;color:#e5e5e5;font-size:14px;outline:none;transition:border-color .15s;font-family:inherit}
.form-group input:focus,.form-group select,.form-group textarea:focus{border-color:rgba(212,175,55,.4);box-shadow:0 0 0 2px rgba(212,175,55,.08)}
.form-group input::placeholder,.form-group textarea::placeholder{color:#444}
.form-group select option{background:#161616}
.form-group textarea{resize:vertical;min-height:80px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.upload-zone{border:2px dashed #2a2a2a;border-radius:12px;padding:28px;text-align:center;cursor:pointer;transition:all .2s;position:relative}
.upload-zone:hover{border-color:rgba(212,175,55,.4);background:rgba(212,175,55,.03)}
.upload-zone input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer}
.upload-zone .upload-icon{font-size:28px;margin-bottom:8px}
.upload-zone .upload-text{color:#555;font-size:13px}
.upload-zone .upload-hint{color:#444;font-size:11px;margin-top:4px}
.upload-progress{margin-top:10px;height:4px;background:#1a1a1a;border-radius:2px;overflow:hidden;display:none}
.upload-progress-bar{height:100%;background:linear-gradient(90deg,#d4af37,#b8860b);width:0%;transition:width .3s}
.upload-preview{margin-top:12px;display:none}
.upload-preview img,.upload-preview video{max-width:100%;max-height:180px;border-radius:8px;object-fit:contain}
.url-display{margin-top:8px;padding:8px 12px;background:#0d0d0d;border:1px solid #222;border-radius:8px;font-size:11px;color:#666;word-break:break-all}
.empty-state{padding:60px;text-align:center;color:#444}
.loading{padding:60px;text-align:center;color:#555}
.error-msg{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:#f87171;padding:12px 16px;border-radius:10px;font-size:13px;margin-bottom:16px;display:none}
</style>
</head>
<body>

<aside class="sidebar">
  <div class="sidebar-logo">
    <div class="name">STYLE</div>
    <div class="sub">Admin Panel</div>
  </div>
  <nav>
    <a href="#" onclick="showSection('dashboard')" id="nav-dashboard" class="active">
      <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
      Dashboard
    </a>
    <a href="#" onclick="showSection('products')" id="nav-products">
      <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 7H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1z"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
      Products
    </a>
    <a href="#" onclick="showSection('categories')" id="nav-categories">
      <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
      Categories
    </a>
    <a href="#" onclick="showSection('orders')" id="nav-orders">
      <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
      Orders
    </a>
    <a href="#" onclick="showSection('reels')" id="nav-reels">
      <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      Reels
    </a>
    <a href="#" onclick="showSection('banners')" id="nav-banners">
      <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>
      Banners
    </a>
    <a href="#" onclick="showSection('coupons')" id="nav-coupons">
      <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
      Coupons
    </a>
  </nav>
  <div class="sidebar-footer">
    <button class="logout-btn" onclick="doLogout()">Sign Out</button>
  </div>
</aside>

<main class="main" id="main-content">
  <div id="section-dashboard">
    <div class="page-header"><h1 class="page-title">Dashboard</h1></div>
    <div class="stats-grid" id="stats-grid">
      <div class="stat-card"><div class="stat-label">Products</div><div class="stat-value" id="stat-products">—</div></div>
      <div class="stat-card"><div class="stat-label">Orders</div><div class="stat-value" id="stat-orders">—</div></div>
      <div class="stat-card"><div class="stat-label">Revenue</div><div class="stat-value" id="stat-revenue">—</div><div class="stat-sub">Total from all orders</div></div>
      <div class="stat-card"><div class="stat-label">Reels</div><div class="stat-value" id="stat-reels">—</div></div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Quick Links</span></div>
      <div style="padding:20px;display:flex;gap:12px;flex-wrap:wrap">
        <button class="btn btn-ghost" onclick="showSection('products')">Manage Products</button>
        <button class="btn btn-ghost" onclick="showSection('orders')">View Orders</button>
        <button class="btn btn-ghost" onclick="showSection('reels')">Upload Reels</button>
        <button class="btn btn-ghost" onclick="showSection('coupons')">Manage Coupons</button>
      </div>
    </div>
  </div>

  <div id="section-products" style="display:none">
    <div class="page-header">
      <h1 class="page-title">Products</h1>
      <button class="btn btn-primary" onclick="openProductModal()">+ Add Product</button>
    </div>
    <div class="card">
      <div id="products-body"><div class="loading">Loading...</div></div>
    </div>
  </div>

  <div id="section-categories" style="display:none">
    <div class="page-header">
      <h1 class="page-title">Categories</h1>
      <button class="btn btn-primary" onclick="openCategoryModal()">+ Add Category</button>
    </div>
    <div class="card">
      <div id="categories-body"><div class="loading">Loading...</div></div>
    </div>
  </div>

  <div id="section-orders" style="display:none">
    <div class="page-header"><h1 class="page-title">Orders</h1></div>
    <div class="card">
      <div id="orders-body"><div class="loading">Loading...</div></div>
    </div>
  </div>

  <div id="section-reels" style="display:none">
    <div class="page-header">
      <h1 class="page-title">Reels</h1>
      <button class="btn btn-primary" onclick="openReelModal()">+ Add Reel</button>
    </div>
    <div class="card">
      <div id="reels-body"><div class="loading">Loading...</div></div>
    </div>
  </div>

  <div id="section-banners" style="display:none">
    <div class="page-header">
      <h1 class="page-title">Banners</h1>
      <button class="btn btn-primary" onclick="openBannerModal()">+ Add Banner</button>
    </div>
    <div class="card">
      <div id="banners-body"><div class="loading">Loading...</div></div>
    </div>
  </div>

  <div id="section-coupons" style="display:none">
    <div class="page-header">
      <h1 class="page-title">Coupons</h1>
      <button class="btn btn-primary" onclick="openCouponModal()">+ Add Coupon</button>
    </div>
    <div class="card">
      <div id="coupons-body"><div class="loading">Loading...</div></div>
    </div>
  </div>
</main>

<!-- Product Modal -->
<div class="modal-overlay" id="modal-product" style="display:none">
<div class="modal">
  <div class="modal-header">
    <span class="modal-title" id="modal-product-title">Add Product</span>
    <button class="modal-close" onclick="closeModal('modal-product')">&times;</button>
  </div>
  <div class="modal-body">
    <div class="error-msg" id="product-error"></div>
    <input type="hidden" id="product-id">
    <div class="form-row">
      <div class="form-group"><label>Product Name *</label><input type="text" id="product-name" placeholder="e.g. Classic White Tee"></div>
      <div class="form-group"><label>Slug *</label><input type="text" id="product-slug" placeholder="classic-white-tee"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Price ($) *</label><input type="number" id="product-price" step="0.01" placeholder="29.99"></div>
      <div class="form-group"><label>Compare At Price ($)</label><input type="number" id="product-compare-price" step="0.01" placeholder="49.99"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Brand</label><input type="text" id="product-brand" placeholder="Brand name"></div>
      <div class="form-group"><label>Status</label><select id="product-status"><option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option></select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Category</label><select id="product-category"><option value="">— None —</option></select></div>
      <div class="form-group"><label>SKU</label><input type="text" id="product-sku" placeholder="SKU-001"></div>
    </div>
    <div class="form-group"><label>Description</label><textarea id="product-desc" placeholder="Product description..."></textarea></div>
    <div class="form-row">
      <div class="form-group" style="display:flex;align-items:center;gap:8px;padding-top:24px">
        <input type="checkbox" id="product-featured" style="width:auto"><label for="product-featured" style="margin:0">Featured</label>
      </div>
      <div class="form-group" style="display:flex;align-items:center;gap:8px;padding-top:24px">
        <input type="checkbox" id="product-new" style="width:auto"><label for="product-new" style="margin:0">New Arrival</label>
      </div>
    </div>
    <div class="form-group"><label>Product Image (Cloudinary Upload)</label>
      <div class="upload-zone" id="product-upload-zone">
        <input type="file" accept="image/*" onchange="handleUpload(this,'product-img-url','product-upload-preview','product-upload-progress')">
        <div class="upload-icon">🖼️</div>
        <div class="upload-text">Click to upload product image</div>
        <div class="upload-hint">JPG, PNG, WebP up to 50MB</div>
      </div>
      <div class="upload-progress" id="product-upload-progress"><div class="upload-progress-bar" id="product-upload-bar"></div></div>
      <div class="upload-preview" id="product-upload-preview"></div>
      <input type="hidden" id="product-img-url">
    </div>
  </div>
  <div class="modal-footer">
    <button class="btn btn-ghost" onclick="closeModal('modal-product')">Cancel</button>
    <button class="btn btn-primary" onclick="saveProduct()">Save Product</button>
  </div>
</div>
</div>

<!-- Category Modal -->
<div class="modal-overlay" id="modal-category" style="display:none">
<div class="modal">
  <div class="modal-header">
    <span class="modal-title" id="modal-category-title">Add Category</span>
    <button class="modal-close" onclick="closeModal('modal-category')">&times;</button>
  </div>
  <div class="modal-body">
    <div class="error-msg" id="category-error"></div>
    <input type="hidden" id="category-id">
    <div class="form-row">
      <div class="form-group"><label>Name *</label><input type="text" id="category-name" placeholder="e.g. Men's Shirts"></div>
      <div class="form-group"><label>Slug *</label><input type="text" id="category-slug" placeholder="mens-shirts"></div>
    </div>
    <div class="form-group"><label>Description</label><textarea id="category-desc" placeholder="Category description..."></textarea></div>
    <div class="form-row">
      <div class="form-group"><label>Sort Order</label><input type="number" id="category-order" value="0"></div>
      <div class="form-group" style="display:flex;align-items:center;gap:8px;padding-top:24px">
        <input type="checkbox" id="category-active" checked style="width:auto"><label for="category-active" style="margin:0">Active</label>
      </div>
    </div>
    <div class="form-group"><label>Category Image (Cloudinary Upload)</label>
      <div class="upload-zone">
        <input type="file" accept="image/*" onchange="handleUpload(this,'category-img-url','category-upload-preview','category-upload-progress')">
        <div class="upload-icon">🖼️</div>
        <div class="upload-text">Click to upload category image</div>
      </div>
      <div class="upload-progress" id="category-upload-progress"><div class="upload-progress-bar"></div></div>
      <div class="upload-preview" id="category-upload-preview"></div>
      <input type="hidden" id="category-img-url">
    </div>
  </div>
  <div class="modal-footer">
    <button class="btn btn-ghost" onclick="closeModal('modal-category')">Cancel</button>
    <button class="btn btn-primary" onclick="saveCategory()">Save Category</button>
  </div>
</div>
</div>

<!-- Reel Modal -->
<div class="modal-overlay" id="modal-reel" style="display:none">
<div class="modal">
  <div class="modal-header">
    <span class="modal-title">Add Reel</span>
    <button class="modal-close" onclick="closeModal('modal-reel')">&times;</button>
  </div>
  <div class="modal-body">
    <div class="error-msg" id="reel-error"></div>
    <div class="form-group"><label>Title</label><input type="text" id="reel-title" placeholder="Reel title (optional)"></div>
    <div class="form-group"><label>Description</label><textarea id="reel-desc" placeholder="Short description..."></textarea></div>
    <div class="form-group"><label>Linked Product (optional)</label><select id="reel-product"><option value="">— No product —</option></select></div>
    <div class="form-group"><label>Sort Order</label><input type="number" id="reel-order" value="0"></div>
    <div class="form-group"><label>Video File (Cloudinary Upload) *</label>
      <div class="upload-zone" id="reel-upload-zone">
        <input type="file" accept="video/*" onchange="handleUpload(this,'reel-video-url','reel-upload-preview','reel-upload-progress')">
        <div class="upload-icon">🎬</div>
        <div class="upload-text">Click to upload video</div>
        <div class="upload-hint">MP4, MOV, WebM up to 500MB</div>
      </div>
      <div class="upload-progress" id="reel-upload-progress"><div class="upload-progress-bar" id="reel-upload-bar"></div></div>
      <div class="upload-preview" id="reel-upload-preview"></div>
      <input type="hidden" id="reel-video-url">
    </div>
    <div class="form-group"><label>Thumbnail Image (optional)</label>
      <div class="upload-zone">
        <input type="file" accept="image/*" onchange="handleUpload(this,'reel-thumb-url','reel-thumb-preview','reel-thumb-progress')">
        <div class="upload-icon">🖼️</div>
        <div class="upload-text">Click to upload thumbnail</div>
      </div>
      <div class="upload-progress" id="reel-thumb-progress"><div class="upload-progress-bar"></div></div>
      <div class="upload-preview" id="reel-thumb-preview"></div>
      <input type="hidden" id="reel-thumb-url">
    </div>
    <div class="form-group" style="display:flex;align-items:center;gap:8px">
      <input type="checkbox" id="reel-active" checked style="width:auto"><label for="reel-active" style="margin:0">Active (visible in app)</label>
    </div>
  </div>
  <div class="modal-footer">
    <button class="btn btn-ghost" onclick="closeModal('modal-reel')">Cancel</button>
    <button class="btn btn-primary" onclick="saveReel()">Save Reel</button>
  </div>
</div>
</div>

<!-- Banner Modal -->
<div class="modal-overlay" id="modal-banner" style="display:none">
<div class="modal">
  <div class="modal-header">
    <span class="modal-title" id="modal-banner-title">Add Banner</span>
    <button class="modal-close" onclick="closeModal('modal-banner')">&times;</button>
  </div>
  <div class="modal-body">
    <div class="error-msg" id="banner-error"></div>
    <input type="hidden" id="banner-id">
    <div class="form-row">
      <div class="form-group"><label>Title *</label><input type="text" id="banner-title" placeholder="Banner title"></div>
      <div class="form-group"><label>Subtitle</label><input type="text" id="banner-subtitle" placeholder="Optional subtitle"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>CTA Text</label><input type="text" id="banner-cta-text" placeholder="Shop Now"></div>
      <div class="form-group"><label>CTA Link</label><input type="text" id="banner-cta-link" placeholder="/category/men"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Placement</label>
        <select id="banner-placement">
          <option value="home_slider">Home Slider</option>
          <option value="home_secondary">Home Secondary</option>
          <option value="category">Category</option>
          <option value="promo">Promo</option>
        </select>
      </div>
      <div class="form-group"><label>Sort Order</label><input type="number" id="banner-order" value="0"></div>
    </div>
    <div class="form-group"><label>Banner Image (Cloudinary Upload) *</label>
      <div class="upload-zone">
        <input type="file" accept="image/*" onchange="handleUpload(this,'banner-img-url','banner-upload-preview','banner-upload-progress')">
        <div class="upload-icon">🖼️</div>
        <div class="upload-text">Click to upload banner image</div>
        <div class="upload-hint">Recommended: 1200x400px</div>
      </div>
      <div class="upload-progress" id="banner-upload-progress"><div class="upload-progress-bar"></div></div>
      <div class="upload-preview" id="banner-upload-preview"></div>
      <input type="hidden" id="banner-img-url">
    </div>
    <div class="form-group" style="display:flex;align-items:center;gap:8px">
      <input type="checkbox" id="banner-active" checked style="width:auto"><label for="banner-active" style="margin:0">Active</label>
    </div>
  </div>
  <div class="modal-footer">
    <button class="btn btn-ghost" onclick="closeModal('modal-banner')">Cancel</button>
    <button class="btn btn-primary" onclick="saveBanner()">Save Banner</button>
  </div>
</div>
</div>

<!-- Coupon Modal -->
<div class="modal-overlay" id="modal-coupon" style="display:none">
<div class="modal">
  <div class="modal-header">
    <span class="modal-title" id="modal-coupon-title">Add Coupon</span>
    <button class="modal-close" onclick="closeModal('modal-coupon')">&times;</button>
  </div>
  <div class="modal-body">
    <div class="error-msg" id="coupon-error"></div>
    <input type="hidden" id="coupon-id">
    <div class="form-row">
      <div class="form-group"><label>Code *</label><input type="text" id="coupon-code" placeholder="SUMMER20"></div>
      <div class="form-group"><label>Description</label><input type="text" id="coupon-desc" placeholder="20% off summer"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Discount Type</label>
        <select id="coupon-type"><option value="percentage">Percentage (%)</option><option value="fixed">Fixed ($)</option></select>
      </div>
      <div class="form-group"><label>Discount Value *</label><input type="number" id="coupon-value" step="0.01" placeholder="20"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Min Spend ($)</label><input type="number" id="coupon-min" step="0.01" value="0" placeholder="0"></div>
      <div class="form-group"><label>Max Uses</label><input type="number" id="coupon-max-uses" placeholder="Unlimited"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Valid From</label><input type="datetime-local" id="coupon-from"></div>
      <div class="form-group"><label>Valid Until</label><input type="datetime-local" id="coupon-until"></div>
    </div>
    <div class="form-group" style="display:flex;align-items:center;gap:8px">
      <input type="checkbox" id="coupon-active" checked style="width:auto"><label for="coupon-active" style="margin:0">Active</label>
    </div>
  </div>
  <div class="modal-footer">
    <button class="btn btn-ghost" onclick="closeModal('modal-coupon')">Cancel</button>
    <button class="btn btn-primary" onclick="saveCoupon()">Save Coupon</button>
  </div>
</div>
</div>

<!-- Order Status Modal -->
<div class="modal-overlay" id="modal-order" style="display:none">
<div class="modal" style="max-width:380px">
  <div class="modal-header">
    <span class="modal-title">Update Order Status</span>
    <button class="modal-close" onclick="closeModal('modal-order')">&times;</button>
  </div>
  <div class="modal-body">
    <input type="hidden" id="order-id">
    <div class="form-group"><label>Order Status</label>
      <select id="order-status">
        <option value="pending">Pending</option>
        <option value="processing">Processing</option>
        <option value="shipped">Shipped</option>
        <option value="out_for_delivery">Out for Delivery</option>
        <option value="delivered">Delivered</option>
        <option value="cancelled">Cancelled</option>
        <option value="returned">Returned</option>
      </select>
    </div>
    <div class="form-group"><label>Payment Status</label>
      <select id="order-payment-status">
        <option value="unpaid">Unpaid</option>
        <option value="paid">Paid</option>
        <option value="refunded">Refunded</option>
        <option value="failed">Failed</option>
      </select>
    </div>
  </div>
  <div class="modal-footer">
    <button class="btn btn-ghost" onclick="closeModal('modal-order')">Cancel</button>
    <button class="btn btn-primary" onclick="saveOrderStatus()">Update Status</button>
  </div>
</div>
</div>

<script>
var currentSection = 'dashboard';
var productsList = [];
var categoriesList = [];

function api(method, path, body) {
  var opts = { method: method, credentials: 'include' };
  if (body) { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(body); }
  return fetch('/api/admin' + path, opts).then(function(r) { return r.json(); });
}

function showSection(name) {
  document.getElementById('section-' + currentSection).style.display = 'none';
  document.getElementById('nav-' + currentSection).classList.remove('active');
  currentSection = name;
  document.getElementById('section-' + name).style.display = 'block';
  document.getElementById('nav-' + name).classList.add('active');
  var loaders = { products: loadProducts, categories: loadCategories, orders: loadOrders, reels: loadReels, banners: loadBanners, coupons: loadCoupons, dashboard: loadStats };
  if (loaders[name]) loaders[name]();
  return false;
}

function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function openModal(id) { document.getElementById(id).style.display = 'flex'; }

function doLogout() {
  fetch('/__logout', { method: 'POST', credentials: 'include' }).then(function() { window.location.href = '/'; });
}

function statusBadge(s) {
  var map = { active:'green', pending:'yellow', processing:'blue', shipped:'blue', delivered:'green', cancelled:'red', returned:'red', paid:'green', unpaid:'yellow', refunded:'blue', failed:'red', draft:'gray', archived:'gray' };
  return '<span class="badge badge-' + (map[s] || 'gray') + '">' + s + '</span>';
}

// ── Dashboard ────────────────────────────────────────────────
function loadStats() {
  api('GET', '/stats').then(function(d) {
    if (d.message) return;
    document.getElementById('stat-products').textContent = d.products;
    document.getElementById('stat-orders').textContent = d.orders;
    document.getElementById('stat-revenue').textContent = '$' + d.revenue;
    document.getElementById('stat-reels').textContent = d.reels;
  });
}

// ── Upload Handler ────────────────────────────────────────────
function handleUpload(input, urlFieldId, previewId, progressId) {
  var file = input.files[0];
  if (!file) return;
  var fd = new FormData();
  fd.append('file', file);
  var xhr = new XMLHttpRequest();
  var progressEl = document.getElementById(progressId);
  var barEl = progressEl ? progressEl.querySelector('.upload-progress-bar') : null;
  if (progressEl) progressEl.style.display = 'block';
  xhr.upload.onprogress = function(e) {
    if (e.lengthComputable && barEl) barEl.style.width = Math.round(e.loaded / e.total * 100) + '%';
  };
  xhr.onload = function() {
    var resp = JSON.parse(xhr.responseText);
    if (resp.url) {
      document.getElementById(urlFieldId).value = resp.url;
      var preview = document.getElementById(previewId);
      if (preview) {
        preview.style.display = 'block';
        if (resp.resource_type === 'video') {
          preview.innerHTML = '<video src="' + resp.url + '" controls style="max-width:100%;max-height:180px;border-radius:8px"></video><div class="url-display">' + resp.url + '</div>';
        } else {
          preview.innerHTML = '<img src="' + resp.url + '" style="max-width:100%;max-height:180px;border-radius:8px;object-fit:contain"><div class="url-display">' + resp.url + '</div>';
        }
      }
    } else {
      alert('Upload failed: ' + (resp.message || 'Unknown error'));
    }
  };
  xhr.onerror = function() { alert('Upload failed. Check Cloudinary settings.'); };
  xhr.open('POST', '/api/upload');
  xhr.withCredentials = true;
  xhr.send(fd);
}

// ── Products ─────────────────────────────────────────────────
function loadProducts() {
  api('GET', '/products').then(function(data) {
    productsList = Array.isArray(data) ? data : [];
    var html = '<table><thead><tr><th>Image</th><th>Name</th><th>Price</th><th>Category</th><th>Status</th><th>Featured</th><th>Actions</th></tr></thead><tbody>';
    if (!productsList.length) html = '<div class="empty-state">No products yet. Add your first product!</div>';
    else {
      productsList.forEach(function(p) {
        var img = (p.images && p.images[0]) ? '<img class="thumb" src="' + p.images[0].image_url + '" onerror="this.style.display=\\'none\\'">' : '<div class="thumb"></div>';
        html += '<tr><td>' + img + '</td><td style="color:#fff;font-weight:500">' + p.name + '</td><td>$' + Number(p.price).toFixed(2) + '</td><td>' + (p.category ? p.category.name : '—') + '</td><td>' + statusBadge(p.status) + '</td><td>' + (p.is_featured ? '<span class="badge badge-yellow">Yes</span>' : '—') + '</td><td class="actions"><button class="btn btn-sm btn-ghost" onclick="editProduct(\\'' + p.id + '\\')">Edit</button><button class="btn btn-sm btn-danger" onclick="deleteProduct(\\'' + p.id + '\\')">Delete</button></td></tr>';
      });
      html += '</tbody></table>';
    }
    document.getElementById('products-body').innerHTML = html;
  });
}

function openProductModal(id) {
  document.getElementById('product-id').value = '';
  document.getElementById('product-name').value = '';
  document.getElementById('product-slug').value = '';
  document.getElementById('product-price').value = '';
  document.getElementById('product-compare-price').value = '';
  document.getElementById('product-brand').value = '';
  document.getElementById('product-status').value = 'active';
  document.getElementById('product-sku').value = '';
  document.getElementById('product-desc').value = '';
  document.getElementById('product-featured').checked = false;
  document.getElementById('product-new').checked = false;
  document.getElementById('product-img-url').value = '';
  document.getElementById('product-upload-preview').style.display = 'none';
  document.getElementById('product-upload-preview').innerHTML = '';
  document.getElementById('product-error').style.display = 'none';
  document.getElementById('modal-product-title').textContent = 'Add Product';
  loadCategoriesIntoSelect('product-category');
  openModal('modal-product');
}

function editProduct(id) {
  var p = productsList.find(function(x) { return x.id === id; });
  if (!p) return;
  document.getElementById('product-id').value = p.id;
  document.getElementById('product-name').value = p.name || '';
  document.getElementById('product-slug').value = p.slug || '';
  document.getElementById('product-price').value = p.price || '';
  document.getElementById('product-compare-price').value = p.compare_at_price || '';
  document.getElementById('product-brand').value = p.brand || '';
  document.getElementById('product-status').value = p.status || 'active';
  document.getElementById('product-sku').value = p.sku || '';
  document.getElementById('product-desc').value = p.description || '';
  document.getElementById('product-featured').checked = !!p.is_featured;
  document.getElementById('product-new').checked = !!p.is_new;
  var img = p.images && p.images[0] ? p.images[0].image_url : '';
  document.getElementById('product-img-url').value = img;
  if (img) {
    document.getElementById('product-upload-preview').style.display = 'block';
    document.getElementById('product-upload-preview').innerHTML = '<img src="' + img + '" style="max-width:100%;max-height:180px;border-radius:8px"><div class="url-display">' + img + '</div>';
  }
  document.getElementById('product-error').style.display = 'none';
  document.getElementById('modal-product-title').textContent = 'Edit Product';
  loadCategoriesIntoSelect('product-category', p.category_id);
  openModal('modal-product');
}

function loadCategoriesIntoSelect(selectId, selectedId) {
  api('GET', '/categories').then(function(data) {
    categoriesList = Array.isArray(data) ? data : [];
    var sel = document.getElementById(selectId);
    sel.innerHTML = '<option value="">— None —</option>';
    categoriesList.forEach(function(c) {
      var opt = document.createElement('option');
      opt.value = c.id; opt.textContent = c.name;
      if (selectedId && c.id === selectedId) opt.selected = true;
      sel.appendChild(opt);
    });
  });
}

function saveProduct() {
  var id = document.getElementById('product-id').value;
  var name = document.getElementById('product-name').value.trim();
  var slug = document.getElementById('product-slug').value.trim();
  var price = document.getElementById('product-price').value;
  if (!name || !slug || !price) {
    document.getElementById('product-error').textContent = 'Name, slug and price are required.';
    document.getElementById('product-error').style.display = 'block';
    return;
  }
  var body = {
    name: name, slug: slug, price: parseFloat(price),
    compare_at_price: document.getElementById('product-compare-price').value ? parseFloat(document.getElementById('product-compare-price').value) : null,
    brand: document.getElementById('product-brand').value || null,
    status: document.getElementById('product-status').value,
    sku: document.getElementById('product-sku').value || null,
    description: document.getElementById('product-desc').value || null,
    is_featured: document.getElementById('product-featured').checked,
    is_new: document.getElementById('product-new').checked,
    category_id: document.getElementById('product-category').value || null,
  };
  var imgUrl = document.getElementById('product-img-url').value;
  var req = id ? api('PUT', '/products/' + id, body) : api('POST', '/products', body);
  req.then(function(data) {
    if (data.message) { document.getElementById('product-error').textContent = data.message; document.getElementById('product-error').style.display = 'block'; return; }
    if (imgUrl && !id) api('POST', '/products/' + data.id + '/images', { image_url: imgUrl, sort_order: 0 });
    closeModal('modal-product');
    loadProducts();
  });
}

function deleteProduct(id) {
  if (!confirm('Delete this product? This cannot be undone.')) return;
  api('DELETE', '/products/' + id).then(function() { loadProducts(); });
}

// ── Categories ───────────────────────────────────────────────
function loadCategories() {
  api('GET', '/categories').then(function(data) {
    categoriesList = Array.isArray(data) ? data : [];
    var html = '<table><thead><tr><th>Image</th><th>Name</th><th>Slug</th><th>Sort</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
    if (!categoriesList.length) html = '<div class="empty-state">No categories yet.</div>';
    else {
      categoriesList.forEach(function(c) {
        var img = c.image_url ? '<img class="thumb" src="' + c.image_url + '">' : '<div class="thumb"></div>';
        html += '<tr><td>' + img + '</td><td style="color:#fff;font-weight:500">' + c.name + '</td><td style="color:#555">' + c.slug + '</td><td>' + c.sort_order + '</td><td>' + statusBadge(c.is_active ? 'active' : 'draft') + '</td><td class="actions"><button class="btn btn-sm btn-ghost" onclick="editCategory(\\'' + c.id + '\\')">Edit</button><button class="btn btn-sm btn-danger" onclick="deleteCategory(\\'' + c.id + '\\')">Delete</button></td></tr>';
      });
      html += '</tbody></table>';
    }
    document.getElementById('categories-body').innerHTML = html;
  });
}

function openCategoryModal() {
  document.getElementById('category-id').value = '';
  document.getElementById('category-name').value = '';
  document.getElementById('category-slug').value = '';
  document.getElementById('category-desc').value = '';
  document.getElementById('category-order').value = '0';
  document.getElementById('category-active').checked = true;
  document.getElementById('category-img-url').value = '';
  document.getElementById('category-upload-preview').style.display = 'none';
  document.getElementById('category-error').style.display = 'none';
  document.getElementById('modal-category-title').textContent = 'Add Category';
  openModal('modal-category');
}

function editCategory(id) {
  var c = categoriesList.find(function(x) { return x.id === id; });
  if (!c) return;
  document.getElementById('category-id').value = c.id;
  document.getElementById('category-name').value = c.name || '';
  document.getElementById('category-slug').value = c.slug || '';
  document.getElementById('category-desc').value = c.description || '';
  document.getElementById('category-order').value = c.sort_order || 0;
  document.getElementById('category-active').checked = !!c.is_active;
  document.getElementById('category-img-url').value = c.image_url || '';
  if (c.image_url) { document.getElementById('category-upload-preview').style.display = 'block'; document.getElementById('category-upload-preview').innerHTML = '<img src="' + c.image_url + '" style="max-width:100%;max-height:180px;border-radius:8px"><div class="url-display">' + c.image_url + '</div>'; }
  document.getElementById('modal-category-title').textContent = 'Edit Category';
  openModal('modal-category');
}

function saveCategory() {
  var id = document.getElementById('category-id').value;
  var name = document.getElementById('category-name').value.trim();
  var slug = document.getElementById('category-slug').value.trim();
  if (!name || !slug) { document.getElementById('category-error').textContent = 'Name and slug required.'; document.getElementById('category-error').style.display = 'block'; return; }
  var body = { name: name, slug: slug, description: document.getElementById('category-desc').value || null, sort_order: parseInt(document.getElementById('category-order').value) || 0, is_active: document.getElementById('category-active').checked, image_url: document.getElementById('category-img-url').value || null };
  (id ? api('PUT', '/categories/' + id, body) : api('POST', '/categories', body)).then(function(d) {
    if (d.message) { document.getElementById('category-error').textContent = d.message; document.getElementById('category-error').style.display = 'block'; return; }
    closeModal('modal-category'); loadCategories();
  });
}

function deleteCategory(id) {
  if (!confirm('Delete this category?')) return;
  api('DELETE', '/categories/' + id).then(function() { loadCategories(); });
}

// ── Orders ───────────────────────────────────────────────────
function loadOrders() {
  api('GET', '/orders').then(function(data) {
    var orders = Array.isArray(data) ? data : [];
    var html = '<table><thead><tr><th>Order #</th><th>Total</th><th>Status</th><th>Payment</th><th>Items</th><th>Date</th><th>Actions</th></tr></thead><tbody>';
    if (!orders.length) html = '<div class="empty-state">No orders yet.</div>';
    else {
      orders.forEach(function(o) {
        var items = (o.order_items || []).length;
        html += '<tr><td style="color:#fff;font-weight:600">' + o.order_number + '</td><td>$' + Number(o.total).toFixed(2) + '</td><td>' + statusBadge(o.status) + '</td><td>' + statusBadge(o.payment_status) + '</td><td>' + items + '</td><td style="color:#555">' + new Date(o.created_at).toLocaleDateString() + '</td><td><button class="btn btn-sm btn-ghost" onclick="openOrderModal(\\'' + o.id + '\\',\\'' + o.status + '\\',\\'' + o.payment_status + '\\')">Update</button></td></tr>';
      });
      html += '</tbody></table>';
    }
    document.getElementById('orders-body').innerHTML = html;
  });
}

function openOrderModal(id, status, payStatus) {
  document.getElementById('order-id').value = id;
  document.getElementById('order-status').value = status;
  document.getElementById('order-payment-status').value = payStatus;
  openModal('modal-order');
}

function saveOrderStatus() {
  var id = document.getElementById('order-id').value;
  api('PUT', '/orders/' + id + '/status', { status: document.getElementById('order-status').value, payment_status: document.getElementById('order-payment-status').value }).then(function() { closeModal('modal-order'); loadOrders(); });
}

// ── Reels ────────────────────────────────────────────────────
function loadReels() {
  api('GET', '/reels').then(function(data) {
    var reels = Array.isArray(data) ? data : [];
    var html = '<table><thead><tr><th>Title</th><th>Video</th><th>Product</th><th>Likes</th><th>Status</th><th>Order</th><th>Actions</th></tr></thead><tbody>';
    if (!reels.length) html = '<div class="empty-state">No reels yet. Upload your first reel!</div>';
    else {
      reels.forEach(function(r) {
        var thumb = r.thumbnail_url ? '<img class="thumb" src="' + r.thumbnail_url + '">' : '<div class="thumb" style="display:flex;align-items:center;justify-content:center;color:#444;font-size:18px">▶</div>';
        html += '<tr><td style="color:#fff">' + (r.title || '—') + '</td><td>' + thumb + '</td><td>' + (r.product ? r.product.name : '—') + '</td><td>' + r.likes_count + '</td><td>' + statusBadge(r.is_active ? 'active' : 'draft') + '</td><td>' + r.sort_order + '</td><td class="actions"><button class="btn btn-sm btn-ghost" onclick="toggleReelActive(\\'' + r.id + '\\',' + (!r.is_active) + ')">' + (r.is_active ? 'Hide' : 'Show') + '</button><button class="btn btn-sm btn-danger" onclick="deleteReel(\\'' + r.id + '\\')">Delete</button></td></tr>';
      });
      html += '</tbody></table>';
    }
    document.getElementById('reels-body').innerHTML = html;
  });
}

function openReelModal() {
  document.getElementById('reel-title').value = '';
  document.getElementById('reel-desc').value = '';
  document.getElementById('reel-order').value = '0';
  document.getElementById('reel-active').checked = true;
  document.getElementById('reel-video-url').value = '';
  document.getElementById('reel-thumb-url').value = '';
  document.getElementById('reel-upload-preview').style.display = 'none';
  document.getElementById('reel-upload-preview').innerHTML = '';
  document.getElementById('reel-thumb-preview').style.display = 'none';
  document.getElementById('reel-error').style.display = 'none';
  api('GET', '/products').then(function(data) {
    var sel = document.getElementById('reel-product');
    sel.innerHTML = '<option value="">— No product —</option>';
    (Array.isArray(data) ? data : []).forEach(function(p) {
      var opt = document.createElement('option');
      opt.value = p.id; opt.textContent = p.name;
      sel.appendChild(opt);
    });
  });
  openModal('modal-reel');
}

function saveReel() {
  var videoUrl = document.getElementById('reel-video-url').value;
  if (!videoUrl) { document.getElementById('reel-error').textContent = 'Please upload a video first.'; document.getElementById('reel-error').style.display = 'block'; return; }
  var body = {
    title: document.getElementById('reel-title').value || null,
    description: document.getElementById('reel-desc').value || null,
    video_url: videoUrl,
    thumbnail_url: document.getElementById('reel-thumb-url').value || null,
    product_id: document.getElementById('reel-product').value || null,
    sort_order: parseInt(document.getElementById('reel-order').value) || 0,
    is_active: document.getElementById('reel-active').checked,
  };
  api('POST', '/reels', body).then(function(d) {
    if (d.message) { document.getElementById('reel-error').textContent = d.message; document.getElementById('reel-error').style.display = 'block'; return; }
    closeModal('modal-reel'); loadReels();
  });
}

function toggleReelActive(id, active) {
  api('PUT', '/reels/' + id, { is_active: active }).then(function() { loadReels(); });
}

function deleteReel(id) {
  if (!confirm('Delete this reel?')) return;
  api('DELETE', '/reels/' + id).then(function() { loadReels(); });
}

// ── Banners ──────────────────────────────────────────────────
var bannersList = [];
function loadBanners() {
  api('GET', '/banners').then(function(data) {
    bannersList = Array.isArray(data) ? data : [];
    var html = '<table><thead><tr><th>Image</th><th>Title</th><th>Placement</th><th>Sort</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
    if (!bannersList.length) html = '<div class="empty-state">No banners yet.</div>';
    else {
      bannersList.forEach(function(b) {
        var img = b.image_url ? '<img class="thumb" src="' + b.image_url + '">' : '<div class="thumb"></div>';
        html += '<tr><td>' + img + '</td><td style="color:#fff">' + b.title + '</td><td><span class="badge badge-blue">' + b.placement + '</span></td><td>' + b.sort_order + '</td><td>' + statusBadge(b.is_active ? 'active' : 'draft') + '</td><td class="actions"><button class="btn btn-sm btn-ghost" onclick="editBanner(\\'' + b.id + '\\')">Edit</button><button class="btn btn-sm btn-danger" onclick="deleteBanner(\\'' + b.id + '\\')">Delete</button></td></tr>';
      });
      html += '</tbody></table>';
    }
    document.getElementById('banners-body').innerHTML = html;
  });
}

function openBannerModal() {
  document.getElementById('banner-id').value = '';
  document.getElementById('banner-title').value = '';
  document.getElementById('banner-subtitle').value = '';
  document.getElementById('banner-cta-text').value = '';
  document.getElementById('banner-cta-link').value = '';
  document.getElementById('banner-placement').value = 'home_slider';
  document.getElementById('banner-order').value = '0';
  document.getElementById('banner-active').checked = true;
  document.getElementById('banner-img-url').value = '';
  document.getElementById('banner-upload-preview').style.display = 'none';
  document.getElementById('banner-error').style.display = 'none';
  document.getElementById('modal-banner-title').textContent = 'Add Banner';
  openModal('modal-banner');
}

function editBanner(id) {
  var b = bannersList.find(function(x) { return x.id === id; });
  if (!b) return;
  document.getElementById('banner-id').value = b.id;
  document.getElementById('banner-title').value = b.title || '';
  document.getElementById('banner-subtitle').value = b.subtitle || '';
  document.getElementById('banner-cta-text').value = b.cta_text || '';
  document.getElementById('banner-cta-link').value = b.cta_link || '';
  document.getElementById('banner-placement').value = b.placement || 'home_slider';
  document.getElementById('banner-order').value = b.sort_order || 0;
  document.getElementById('banner-active').checked = !!b.is_active;
  document.getElementById('banner-img-url').value = b.image_url || '';
  if (b.image_url) { document.getElementById('banner-upload-preview').style.display = 'block'; document.getElementById('banner-upload-preview').innerHTML = '<img src="' + b.image_url + '" style="max-width:100%;max-height:180px;border-radius:8px"><div class="url-display">' + b.image_url + '</div>'; }
  document.getElementById('modal-banner-title').textContent = 'Edit Banner';
  openModal('modal-banner');
}

function saveBanner() {
  var id = document.getElementById('banner-id').value;
  var title = document.getElementById('banner-title').value.trim();
  var imgUrl = document.getElementById('banner-img-url').value;
  if (!title) { document.getElementById('banner-error').textContent = 'Title is required.'; document.getElementById('banner-error').style.display = 'block'; return; }
  if (!imgUrl && !id) { document.getElementById('banner-error').textContent = 'Please upload a banner image.'; document.getElementById('banner-error').style.display = 'block'; return; }
  var body = { title: title, subtitle: document.getElementById('banner-subtitle').value || null, cta_text: document.getElementById('banner-cta-text').value || null, cta_link: document.getElementById('banner-cta-link').value || null, placement: document.getElementById('banner-placement').value, sort_order: parseInt(document.getElementById('banner-order').value) || 0, is_active: document.getElementById('banner-active').checked, image_url: imgUrl || undefined };
  (id ? api('PUT', '/banners/' + id, body) : api('POST', '/banners', body)).then(function(d) {
    if (d.message) { document.getElementById('banner-error').textContent = d.message; document.getElementById('banner-error').style.display = 'block'; return; }
    closeModal('modal-banner'); loadBanners();
  });
}

function deleteBanner(id) {
  if (!confirm('Delete this banner?')) return;
  api('DELETE', '/banners/' + id).then(function() { loadBanners(); });
}

// ── Coupons ──────────────────────────────────────────────────
var couponsList = [];
function loadCoupons() {
  api('GET', '/coupons').then(function(data) {
    couponsList = Array.isArray(data) ? data : [];
    var html = '<table><thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Used</th><th>Max</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
    if (!couponsList.length) html = '<div class="empty-state">No coupons yet.</div>';
    else {
      couponsList.forEach(function(c) {
        html += '<tr><td style="color:#fff;font-weight:600;font-family:monospace">' + c.code + '</td><td>' + c.discount_type + '</td><td>' + (c.discount_type === 'percentage' ? c.discount_value + '%' : '$' + c.discount_value) + '</td><td>' + c.used_count + '</td><td>' + (c.max_uses || '∞') + '</td><td>' + statusBadge(c.is_active ? 'active' : 'draft') + '</td><td class="actions"><button class="btn btn-sm btn-ghost" onclick="editCoupon(\\'' + c.id + '\\')">Edit</button><button class="btn btn-sm btn-danger" onclick="deleteCoupon(\\'' + c.id + '\\')">Delete</button></td></tr>';
      });
      html += '</tbody></table>';
    }
    document.getElementById('coupons-body').innerHTML = html;
  });
}

function openCouponModal() {
  document.getElementById('coupon-id').value = '';
  document.getElementById('coupon-code').value = '';
  document.getElementById('coupon-desc').value = '';
  document.getElementById('coupon-type').value = 'percentage';
  document.getElementById('coupon-value').value = '';
  document.getElementById('coupon-min').value = '0';
  document.getElementById('coupon-max-uses').value = '';
  document.getElementById('coupon-from').value = '';
  document.getElementById('coupon-until').value = '';
  document.getElementById('coupon-active').checked = true;
  document.getElementById('coupon-error').style.display = 'none';
  document.getElementById('modal-coupon-title').textContent = 'Add Coupon';
  openModal('modal-coupon');
}

function editCoupon(id) {
  var c = couponsList.find(function(x) { return x.id === id; });
  if (!c) return;
  document.getElementById('coupon-id').value = c.id;
  document.getElementById('coupon-code').value = c.code || '';
  document.getElementById('coupon-desc').value = c.description || '';
  document.getElementById('coupon-type').value = c.discount_type || 'percentage';
  document.getElementById('coupon-value').value = c.discount_value || '';
  document.getElementById('coupon-min').value = c.min_spend || 0;
  document.getElementById('coupon-max-uses').value = c.max_uses || '';
  document.getElementById('coupon-from').value = c.valid_from ? c.valid_from.slice(0, 16) : '';
  document.getElementById('coupon-until').value = c.valid_until ? c.valid_until.slice(0, 16) : '';
  document.getElementById('coupon-active').checked = !!c.is_active;
  document.getElementById('modal-coupon-title').textContent = 'Edit Coupon';
  openModal('modal-coupon');
}

function saveCoupon() {
  var id = document.getElementById('coupon-id').value;
  var code = document.getElementById('coupon-code').value.trim().toUpperCase();
  var val = document.getElementById('coupon-value').value;
  if (!code || !val) { document.getElementById('coupon-error').textContent = 'Code and value are required.'; document.getElementById('coupon-error').style.display = 'block'; return; }
  var maxUses = document.getElementById('coupon-max-uses').value;
  var body = { code: code, description: document.getElementById('coupon-desc').value || null, discount_type: document.getElementById('coupon-type').value, discount_value: parseFloat(val), min_spend: parseFloat(document.getElementById('coupon-min').value) || 0, max_uses: maxUses ? parseInt(maxUses) : null, valid_from: document.getElementById('coupon-from').value || new Date().toISOString(), valid_until: document.getElementById('coupon-until').value || null, is_active: document.getElementById('coupon-active').checked };
  (id ? api('PUT', '/coupons/' + id, body) : api('POST', '/coupons', body)).then(function(d) {
    if (d.message) { document.getElementById('coupon-error').textContent = d.message; document.getElementById('coupon-error').style.display = 'block'; return; }
    closeModal('modal-coupon'); loadCoupons();
  });
}

function deleteCoupon(id) {
  if (!confirm('Delete this coupon?')) return;
  api('DELETE', '/coupons/' + id).then(function() { loadCoupons(); });
}

// Init
loadStats();
</script>
</body>
</html>`;
}

// ─── Admin Panel Route (at /admin-panel to avoid conflicting with Expo web app) ─
app.get('/admin-panel', (req, res) => {
  if (!AUTH_EMAIL || !AUTH_PASSWORD1 || !AUTH_PASSWORD2) {
    return res.status(500).send('Server not configured. Set AUTH_EMAIL, AUTH_PASSWORD1, AUTH_PASSWORD2 env vars.');
  }
  if (!isAuthenticated(req)) {
    return res.type('html').send(LOGIN_PAGE);
  }
  res.type('html').send(getAdminHtml());
});

// Admin panel sub-paths (SPA - redirect to /admin-panel)
app.get('/admin-panel/*', (req, res) => {
  if (!isAuthenticated(req)) return res.type('html').send(LOGIN_PAGE);
  res.redirect('/admin-panel');
});

// ─── Affiliate Redirect (server-side) ─────────────────────────────────────────
app.get('/ref', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect('/');
  try {
    if (!supabaseAdmin) return res.redirect('/');
    const { data: links } = await supabaseAdmin
      .from('affiliate_links')
      .select('*, product:products(slug)')
      .eq('affiliate_code', code)
      .limit(1);
    const link = (links || [])[0];
    if (!link) return res.redirect('/');
    // Record click async (don't block redirect)
    supabaseAdmin.from('affiliate_clicks').insert({ affiliate_link_id: link.id, product_id: link.product_id }).catch(() => {});
    supabaseAdmin.from('affiliate_links').update({ clicks_count: (link.clicks_count || 0) + 1 }).eq('id', link.id).catch(() => {});
    const productSlug = link.product && link.product.slug;
    const targetPath = productSlug ? '/product/' + productSlug + '?ref=' + encodeURIComponent(code) : '/';
    res.redirect(targetPath);
  } catch (e) {
    res.redirect('/');
  }
});

// ─── Serve Expo Web App ───────────────────────────────────────────────────────
// The Expo web app handles its own authentication via Supabase.
// All routes (including /admin, /admin/*) are served to the Expo SPA which
// routes them client-side based on the user's Supabase auth role.
const webBuildPath = path.join(__dirname, 'dist');
if (fs.existsSync(webBuildPath)) {
  app.use(express.static(webBuildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(webBuildPath, 'index.html'));
  });
} else {
  app.get('*', (req, res) => {
    res.send('<!DOCTYPE html><html><head><title>Style</title><link rel="icon" type="image/svg+xml" href="/style-logo.svg"></head><body style="background:#0a0a0a;color:#d4af37;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;gap:16px"><h1 style="font-size:48px;letter-spacing:8px;background:linear-gradient(135deg,#d4af37,#f5d77a,#b8860b);-webkit-background-clip:text;-webkit-text-fill-color:transparent">STYLE</h1><p style="color:#555">Web build not found. Run: npx expo export --platform web</p><a href="/admin-panel" style="color:#d4af37;text-decoration:none;border:1px solid rgba(212,175,55,.3);padding:10px 24px;border-radius:10px;font-size:14px">→ Go to Admin Panel</a></body></html>');
  });
}

app.listen(PORT, () => {
  console.log('Style server running on port ' + PORT);
});
