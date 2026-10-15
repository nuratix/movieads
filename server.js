import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// ─── Environment & Secrets ───────────────────────────────────────────────────
const ADMIN_KEY = (process.env.ADMIN_KEY || '2133933919').trim();
const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD || '@Junaid0041w').trim();
const ADS_SECRET_KEY = (process.env.ADS_SECRET_KEY || 'mf_ad_sec_89a31bc09e').trim();
const JWT_SECRET = process.env.JWT_SECRET || 'movieads_jwt_super_secret_signing_key_2026';
const BASE_URL = (process.env.BASE_URL || '').trim().replace(/\/+$/, '');

// ─── Storage Directories ─────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'ads.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Initialize database file if not exists
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ ads: [] }, null, 2), 'utf-8');
}

function loadAds() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data.ads) ? data.ads : [];
  } catch (err) {
    console.error('Error reading ads database:', err);
    return [];
  }
}

function saveAds(ads) {
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify({ ads }, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
}

// ─── Multer 16:9 Image Upload Setup ──────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const cleanName = `ad_16_9_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    cb(null, cleanName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB max
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif/;
    const mime = file.mimetype.toLowerCase();
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    if (allowed.test(mime) || allowed.test(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WEBP, GIF) are allowed for 16:9 ad banners.'));
    }
  },
});

// ─── Middlewares ─────────────────────────────────────────────────────────────
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static file servers
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

function getEffectiveBaseUrl(req) {
  if (BASE_URL) return BASE_URL;
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

// ─── Auth Middleware ─────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const token = req.cookies?.movieads_token || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Admin login required' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded && decoded.role === 'admin') {
      req.admin = decoded;
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized: Invalid credentials' });
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }
}

// ─── Secret Key Ad API Middleware ────────────────────────────────────────────
function verifyAdSecretKey(req, res, next) {
  const provided = (
    req.headers['x-ad-secret-key'] ||
    req.headers['x-app-key'] ||
    req.query.secret_key ||
    req.query.key ||
    req.query.app_key ||
    ''
  ).toString().trim();

  if (!provided || provided !== ADS_SECRET_KEY) {
    return res.status(403).json({
      error: 'Forbidden: invalid or missing X-Ad-Secret-Key header.',
      detail: 'This Ad API is private and requires the authorized secret key.',
    });
  }
  next();
}

// ─── Auth Endpoints ──────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { key, password } = req.body || {};
  const cleanKey = String(key || '').trim();
  const cleanPass = String(password || '').trim();

  if (!cleanKey || !cleanPass) {
    return res.status(400).json({ error: 'Both Admin Key and Password are required.' });
  }

  if (cleanKey !== ADMIN_KEY || cleanPass !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid Admin Key or Password.' });
  }

  const token = jwt.sign(
    { role: 'admin', key: cleanKey, iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.cookie('movieads_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });

  return res.status(200).json({
    success: true,
    message: 'Authenticated successfully.',
    token,
  });
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('movieads_token');
  return res.status(200).json({ success: true, message: 'Logged out successfully.' });
});

app.get('/api/auth/me', (req, res) => {
  const token = req.cookies?.movieads_token || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ authenticated: false });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded && decoded.role === 'admin') {
      return res.status(200).json({ authenticated: true, key: decoded.key });
    }
    return res.status(401).json({ authenticated: false });
  } catch {
    return res.status(401).json({ authenticated: false });
  }
});

// ─── Admin Ad Management Endpoints ───────────────────────────────────────────
app.get('/api/ads', requireAdmin, (req, res) => {
  const ads = loadAds();
  const baseUrl = getEffectiveBaseUrl(req);
  const enriched = ads.map((ad) => ({
    ...ad,
    full_poster_url: ad.poster_url.startsWith('http') ? ad.poster_url : `${baseUrl}${ad.poster_url}`,
    click_url: `${baseUrl}/api/v1/click/${ad.id}`,
  }));
  return res.status(200).json({ success: true, count: enriched.length, ads: enriched });
});

app.post('/api/ads', requireAdmin, upload.single('poster_file'), (req, res) => {
  try {
    const { name, target_url, poster_url, is_active, placement } = req.body || {};
    const cleanName = String(name || '').trim();
    const cleanTarget = String(target_url || '').trim();
    let finalPosterUrl = '';

    if (req.file) {
      finalPosterUrl = `/uploads/${req.file.filename}`;
    } else if (poster_url && String(poster_url).trim().startsWith('http')) {
      finalPosterUrl = String(poster_url).trim();
    }

    if (!cleanName) {
      return res.status(400).json({ error: 'Ad Name / Title is required.' });
    }
    if (!cleanTarget) {
      return res.status(400).json({ error: 'Target destination URL is required.' });
    }
    if (!finalPosterUrl) {
      return res.status(400).json({ error: 'Please upload a 16:9 ad poster image or provide an image URL.' });
    }

    const ads = loadAds();
    const id = `ad_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newAd = {
      id,
      name: cleanName,
      target_url: cleanTarget,
      poster_url: finalPosterUrl,
      aspect_ratio: '16:9',
      placement: (placement || 'all').trim(),
      is_active: is_active === 'true' || is_active === true || is_active === 1 || is_active === '1',
      impressions: 0,
      clicks: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    ads.unshift(newAd);
    saveAds(ads);

    const baseUrl = getEffectiveBaseUrl(req);
    return res.status(201).json({
      success: true,
      message: 'Ad campaign created and published successfully.',
      ad: {
        ...newAd,
        full_poster_url: newAd.poster_url.startsWith('http') ? newAd.poster_url : `${baseUrl}${newAd.poster_url}`,
        click_url: `${baseUrl}/api/v1/click/${newAd.id}`,
      },
    });
  } catch (err) {
    console.error('Error creating ad:', err);
    return res.status(500).json({ error: err.message || 'Failed to create ad campaign.' });
  }
});

app.patch('/api/ads/:id/toggle', requireAdmin, (req, res) => {
  const { id } = req.params;
  const ads = loadAds();
  const ad = ads.find((a) => a.id === id);
  if (!ad) {
    return res.status(404).json({ error: 'Ad not found.' });
  }

  ad.is_active = !ad.is_active;
  ad.updated_at = new Date().toISOString();
  saveAds(ads);

  return res.status(200).json({
    success: true,
    message: ad.is_active ? 'Ad activated.' : 'Ad paused.',
    is_active: ad.is_active,
  });
});

app.put('/api/ads/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, target_url, is_active, placement } = req.body || {};
  const ads = loadAds();
  const ad = ads.find((a) => a.id === id);
  if (!ad) {
    return res.status(404).json({ error: 'Ad not found.' });
  }

  if (name) ad.name = String(name).trim();
  if (target_url) ad.target_url = String(target_url).trim();
  if (is_active !== undefined) ad.is_active = Boolean(is_active);
  if (placement) ad.placement = String(placement).trim();
  ad.updated_at = new Date().toISOString();

  saveAds(ads);
  return res.status(200).json({ success: true, message: 'Ad updated successfully.', ad });
});

app.delete('/api/ads/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const ads = loadAds();
  const index = ads.findIndex((a) => a.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Ad not found.' });
  }

  const [removed] = ads.splice(index, 1);
  saveAds(ads);

  // Clean up uploaded file if local
  if (removed && removed.poster_url && removed.poster_url.startsWith('/uploads/')) {
    const filename = removed.poster_url.replace('/uploads/', '');
    const filePath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (_) {}
    }
  }

  return res.status(200).json({ success: true, message: 'Ad campaign deleted successfully.' });
});

// ─── Public Ad Serving API (Protected by ADS_SECRET_KEY) ─────────────────────
// 1. GET ALL ACTIVE ADS (Returns active 16:9 ads for client site/app)
app.get('/api/v1/ads', verifyAdSecretKey, (req, res) => {
  const ads = loadAds();
  const baseUrl = getEffectiveBaseUrl(req);
  const activeAds = ads
    .filter((a) => a.is_active)
    .map((a) => ({
      id: a.id,
      name: a.name,
      aspect_ratio: a.aspect_ratio || '16:9',
      poster_url: a.poster_url.startsWith('http') ? a.poster_url : `${baseUrl}${a.poster_url}`,
      target_url: a.target_url,
      click_url: `${baseUrl}/api/v1/click/${a.id}`,
      impression_url: `${baseUrl}/api/v1/impression/${a.id}`,
      placement: a.placement || 'all',
      created_at: a.created_at,
    }));

  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  return res.status(200).json({
    status: 'success',
    count: activeAds.length,
    ads: activeAds,
  });
});

// 2. GET RANDOM ACTIVE AD
app.get('/api/v1/ads/random', verifyAdSecretKey, (req, res) => {
  const ads = loadAds();
  const activeAds = ads.filter((a) => a.is_active);
  if (activeAds.length === 0) {
    return res.status(404).json({ status: 'empty', message: 'No active ads currently available.' });
  }

  const randomAd = activeAds[Math.floor(Math.random() * activeAds.length)];
  const baseUrl = getEffectiveBaseUrl(req);

  res.setHeader('Cache-Control', 'no-cache');
  return res.status(200).json({
    status: 'success',
    ad: {
      id: randomAd.id,
      name: randomAd.name,
      aspect_ratio: randomAd.aspect_ratio || '16:9',
      poster_url: randomAd.poster_url.startsWith('http') ? randomAd.poster_url : `${baseUrl}${randomAd.poster_url}`,
      target_url: randomAd.target_url,
      click_url: `${baseUrl}/api/v1/click/${randomAd.id}`,
      impression_url: `${baseUrl}/api/v1/impression/${randomAd.id}`,
      placement: randomAd.placement || 'all',
    },
  });
});

// 3. AD CLICK TRACKING & 302 REDIRECT
app.get('/api/v1/click/:id', (req, res) => {
  const { id } = req.params;
  const ads = loadAds();
  const ad = ads.find((a) => a.id === id);
  if (!ad) {
    return res.status(404).send('Ad not found or expired.');
  }

  ad.clicks = (ad.clicks || 0) + 1;
  saveAds(ads);

  const dest = ad.target_url.startsWith('http') ? ad.target_url : `https://${ad.target_url}`;
  return res.redirect(302, dest);
});

// 4. AD IMPRESSION TRACKING
app.post('/api/v1/impression/:id', (req, res) => {
  const { id } = req.params;
  const ads = loadAds();
  const ad = ads.find((a) => a.id === id);
  if (ad) {
    ad.impressions = (ad.impressions || 0) + 1;
    saveAds(ads);
  }
  return res.status(200).json({ success: true });
});

// 5. PUBLIC STATUS CHECK
app.get('/api/v1/status', (_req, res) => {
  const ads = loadAds();
  const activeCount = ads.filter((a) => a.is_active).length;
  return res.status(200).json({
    status: 'online',
    service: 'movieads',
    active_campaigns: activeCount,
    timestamp: new Date().toISOString(),
  });
});

// SPA Fallback: serve index.html for unknown routes
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Express server
app.listen(PORT, HOST, () => {
  console.log(`[MovieAds] Server listening on http://${HOST}:${PORT}`);
  console.log(`[MovieAds] Admin Key: configured in env (length: ${ADMIN_KEY.length})`);
  console.log(`[MovieAds] Secret Ad Key: configured in env (length: ${ADS_SECRET_KEY.length})`);
});
