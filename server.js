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
    return Array.isArray(data) ? data : (Array.isArray(data.ads) ? data.ads : []);
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

// ─── Multer Setup: 16:9 & 9:16 Images and Videos (up to 100MB) ───────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    const isVid = /mp4|webm|mov|mkv|ogg/.test(ext) || (file.mimetype && file.mimetype.startsWith('video/'));
    const prefix = isVid ? 'ad_vid_' : 'ad_img_';
    const cleanName = `${prefix}${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    cb(null, cleanName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max for video ads
  fileFilter: (_req, file, cb) => {
    const allowedImages = /jpeg|jpg|png|webp|gif/;
    const allowedVideos = /mp4|webm|mov|mkv|ogg|quicktime/;
    const mime = (file.mimetype || '').toLowerCase();
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    if (
      allowedImages.test(mime) ||
      allowedImages.test(ext) ||
      allowedVideos.test(mime) ||
      allowedVideos.test(ext) ||
      mime.startsWith('image/') ||
      mime.startsWith('video/')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only images (JPEG, PNG, WEBP, GIF) and videos (MP4, WebM, MOV) are allowed.'));
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
    return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid token' });
  }
}

// ─── Ad API Key Verification Middleware ──────────────────────────────────────
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

// ─── Helper: Format Enriched Ad Payload ──────────────────────────────────────
function formatAdPayload(a, baseUrl) {
  const posterUrl = a.poster_url
    ? (a.poster_url.startsWith('http') ? a.poster_url : `${baseUrl}${a.poster_url}`)
    : '';
  const videoUrl = a.video_url
    ? (a.video_url.startsWith('http') ? a.video_url : `${baseUrl}${a.video_url}`)
    : '';

  return {
    id: a.id,
    name: a.name,
    media_type: a.media_type || (videoUrl ? 'video' : 'image'),
    aspect_ratio: a.aspect_ratio || '16:9',
    poster_url: posterUrl,
    video_url: videoUrl,
    target_url: a.target_url,
    click_url: `${baseUrl}/api/v1/click/${a.id}`,
    impression_url: `${baseUrl}/api/v1/impression/${a.id}`,
    placement: a.placement || 'all',
    skip_seconds: a.skip_seconds || 10,
    created_at: a.created_at,
    updated_at: a.updated_at,
    is_active: a.is_active,
    impressions: a.impressions || 0,
    clicks: a.clicks || 0,
  };
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
    return res.status(200).json({ authenticated: true, key: decoded.key });
  } catch (_) {
    return res.status(401).json({ authenticated: false });
  }
});

// ─── Admin Ad Management Endpoints ───────────────────────────────────────────
app.get('/api/ads', requireAdmin, (req, res) => {
  const ads = loadAds();
  const baseUrl = getEffectiveBaseUrl(req);
  const enriched = ads.map((ad) => formatAdPayload(ad, baseUrl));
  return res.status(200).json({ success: true, count: enriched.length, ads: enriched });
});

app.post('/api/ads', requireAdmin, upload.any(), (req, res) => {
  try {
    const {
      name,
      target_url,
      poster_url,
      video_url,
      aspect_ratio,
      media_type,
      placement,
      is_active,
      skip_seconds,
    } = req.body || {};

    const cleanName = String(name || '').trim();
    const cleanTarget = String(target_url || '').trim();
    const ratio = '16:9';

    const files = req.files || [];
    let finalPosterUrl = (poster_url || '').trim();
    let finalVideoUrl = (video_url || '').trim();
    let detectedType = (media_type || '').toLowerCase();

    for (const file of files) {
      const isVid = (file.mimetype && file.mimetype.startsWith('video/')) || /mp4|webm|mov|mkv|ogg/.test(file.filename);
      if (isVid) {
        finalVideoUrl = `/uploads/${file.filename}`;
        detectedType = 'video';
      } else {
        finalPosterUrl = `/uploads/${file.filename}`;
        if (!detectedType) detectedType = 'image';
      }
    }

    if (!detectedType) {
      if (finalVideoUrl) detectedType = 'video';
      else detectedType = 'image';
    }

    if (!cleanName) {
      return res.status(400).json({ error: 'Ad Name / Title is required.' });
    }
    if (!cleanTarget) {
      return res.status(400).json({ error: 'Target destination URL is required.' });
    }
    if (!finalPosterUrl && !finalVideoUrl) {
      return res.status(400).json({ error: 'Please upload an image/video file or provide a media URL.' });
    }

    let finalPlacement = (placement || '').trim().toLowerCase();
    if (!finalPlacement || finalPlacement === 'auto' || finalPlacement === 'shorts') {
      finalPlacement = 'player';
    }

    const ads = loadAds();
    const id = `ad_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newAd = {
      id,
      name: cleanName,
      target_url: cleanTarget,
      poster_url: finalPosterUrl,
      video_url: finalVideoUrl,
      media_type: detectedType,
      aspect_ratio: ratio,
      placement: finalPlacement,
      skip_seconds: Number(skip_seconds) || 10,
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
      ad: formatAdPayload(newAd, baseUrl),
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

app.put('/api/ads/:id', requireAdmin, upload.any(), (req, res) => {
  const { id } = req.params;
  const {
    name,
    target_url,
    poster_url,
    video_url,
    aspect_ratio,
    media_type,
    is_active,
    placement,
    skip_seconds,
  } = req.body || {};

  const ads = loadAds();
  const ad = ads.find((a) => a.id === id);
  if (!ad) {
    return res.status(404).json({ error: 'Ad not found.' });
  }

  const files = req.files || [];
  for (const file of files) {
    const isVid = (file.mimetype && file.mimetype.startsWith('video/')) || /mp4|webm|mov|mkv|ogg/.test(file.filename);
    if (isVid) {
      ad.video_url = `/uploads/${file.filename}`;
      ad.media_type = 'video';
    } else {
      ad.poster_url = `/uploads/${file.filename}`;
      if (!ad.media_type) ad.media_type = 'image';
    }
  }

  if (name) ad.name = String(name).trim();
  if (target_url) ad.target_url = String(target_url).trim();
  if (poster_url !== undefined) ad.poster_url = String(poster_url).trim();
  if (video_url !== undefined) {
    ad.video_url = String(video_url).trim();
    if (ad.video_url) ad.media_type = 'video';
  }
  if (aspect_ratio) ad.aspect_ratio = aspect_ratio === '9:16' ? '9:16' : '16:9';
  if (media_type) ad.media_type = media_type;
  if (is_active !== undefined) ad.is_active = Boolean(is_active);
  if (placement) ad.placement = String(placement).trim();
  if (skip_seconds) ad.skip_seconds = Number(skip_seconds);
  ad.updated_at = new Date().toISOString();

  saveAds(ads);
  const baseUrl = getEffectiveBaseUrl(req);
  return res.status(200).json({
    success: true,
    message: 'Ad updated successfully.',
    ad: formatAdPayload(ad, baseUrl),
  });
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

  // Clean up uploaded files if local
  for (const field of ['poster_url', 'video_url']) {
    if (removed && removed[field] && removed[field].startsWith('/uploads/')) {
      const filename = removed[field].replace('/uploads/', '');
      const filePath = path.join(UPLOADS_DIR, filename);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (_) {}
      }
    }
  }

  return res.status(200).json({ success: true, message: 'Ad campaign deleted successfully.' });
});

// ─── Public Ad Serving API (Protected by ADS_SECRET_KEY) ─────────────────────
// 1. GET ALL ACTIVE ADS (Optional filters: aspect_ratio, placement, media_type)
app.get('/api/v1/ads', verifyAdSecretKey, (req, res) => {
  const ads = loadAds();
  const baseUrl = getEffectiveBaseUrl(req);
  const { aspect_ratio, format, placement, media_type } = req.query || {};

  let activeAds = ads.filter((a) => a.is_active);

  const targetRatio = (aspect_ratio || format || '').trim();
  if (targetRatio) {
    activeAds = activeAds.filter((a) => (a.aspect_ratio || '16:9') === targetRatio);
  }

  const targetPlacement = (placement || '').trim().toLowerCase();
  if (targetPlacement && targetPlacement !== 'all') {
    activeAds = activeAds.filter((a) => {
      const p = (a.placement || 'all').toLowerCase();
      return p === 'all' || p === targetPlacement;
    });
  }

  const targetType = (media_type || '').trim().toLowerCase();
  if (targetType) {
    activeAds = activeAds.filter((a) => {
      const t = (a.media_type || (a.video_url ? 'video' : 'image')).toLowerCase();
      return t === targetType;
    });
  }

  const formatted = activeAds.map((a) => formatAdPayload(a, baseUrl));

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');

  return res.status(200).json({
    status: 'success',
    count: formatted.length,
    ads: formatted,
  });
});

// 2. GET RANDOM ACTIVE AD (Optional filters: aspect_ratio, placement, media_type, exclude_id)
app.get('/api/v1/ads/random', verifyAdSecretKey, (req, res) => {
  const ads = loadAds();
  const { aspect_ratio, format, placement, media_type, exclude_id, last_id, exclude } = req.query || {};

  let activeAds = ads.filter((a) => a.is_active);

  const targetRatio = (aspect_ratio || format || '').trim();
  if (targetRatio) {
    activeAds = activeAds.filter((a) => (a.aspect_ratio || '16:9') === targetRatio);
  }

  const targetPlacement = (placement || '').trim().toLowerCase();
  if (targetPlacement && targetPlacement !== 'all') {
    activeAds = activeAds.filter((a) => {
      const p = (a.placement || 'all').toLowerCase();
      return p === 'all' || p === targetPlacement;
    });
  }

  const targetType = (media_type || '').trim().toLowerCase();
  if (targetType) {
    activeAds = activeAds.filter((a) => {
      const t = (a.media_type || (a.video_url ? 'video' : 'image')).toLowerCase();
      return t === targetType;
    });
  }

  // Fallback: if no ad matches specific placement, try any active ad with that aspect ratio
  if (activeAds.length === 0 && targetRatio) {
    activeAds = ads.filter((a) => a.is_active && (a.aspect_ratio || '16:9') === targetRatio);
  }
  // Ultimate fallback: any active ad
  if (activeAds.length === 0) {
    activeAds = ads.filter((a) => a.is_active);
  }

  if (activeAds.length === 0) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    return res.status(404).json({ status: 'empty', message: 'No active ads currently available.' });
  }

  const excluded = String(exclude_id || last_id || exclude || '').trim();
  let pool = activeAds;
  if (excluded && pool.length > 1) {
    const candidatePool = pool.filter((a) => a.id !== excluded);
    if (candidatePool.length > 0) {
      pool = candidatePool;
    }
  }

  const randomAd = pool[Math.floor(Math.random() * pool.length)];
  const baseUrl = getEffectiveBaseUrl(req);

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');

  return res.status(200).json({
    status: 'success',
    ad: formatAdPayload(randomAd, baseUrl),
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
    supported_formats: ['16:9 Image', '16:9 Video'],
    timestamp: new Date().toISOString(),
  });
});

// ─── SPA Fallback ────────────────────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start Server ────────────────────────────────────────────────────────────
app.listen(PORT, HOST, () => {
  console.log(`[MovieAds] Server listening on http://${HOST}:${PORT}`);
  console.log(`[MovieAds] Admin Key: ${ADMIN_KEY ? 'configured in env' : 'MISSING'}`);
  console.log(`[MovieAds] Secret Ad Key: ${ADS_SECRET_KEY ? 'configured in env' : 'MISSING'}`);
  console.log(`[MovieAds] Formats Supported: 16:9 Video/Poster`);
});
