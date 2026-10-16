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

// ─── Environment & Secrets (Configured via Environment Variables) ─────────
const ADMIN_KEY = (process.env.ADMIN_KEY || '').trim();
const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD || '').trim();
const ADS_SECRET_KEY = (process.env.ADS_SECRET_KEY || '').trim();
const JWT_SECRET = (process.env.JWT_SECRET || 'movieads_jwt_sec_sign_key_99x').trim();
const BASE_URL = (process.env.BASE_URL || '').trim().replace(/\/+$/, '');

// ─── Storage Directories ─────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'ads.json');
const PROMOS_FILE = path.join(DATA_DIR, 'promos.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Initialize database files if not exist
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ ads: [] }, null, 2), 'utf-8');
}
if (!fs.existsSync(PROMOS_FILE)) {
  fs.writeFileSync(PROMOS_FILE, JSON.stringify({ promos: [] }, null, 2), 'utf-8');
}

function loadAds() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const data = JSON.parse(raw);
    const list = Array.isArray(data) ? data : (Array.isArray(data.ads) ? data.ads : []);
    return list.filter(ad => ad && ad.placement !== 'shorts' && ad.aspect_ratio !== '9:16');
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

function loadPromos() {
  try {
    const raw = fs.readFileSync(PROMOS_FILE, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : (Array.isArray(data.promos) ? data.promos : []);
  } catch (err) {
    console.error('Error reading promos database:', err);
    return [];
  }
}

function savePromos(promos) {
  const tmpFile = `${PROMOS_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify({ promos }, null, 2), 'utf-8');
  fs.renameSync(tmpFile, PROMOS_FILE);
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
app.set('trust proxy', true);
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static file servers: uploads & assets
app.use('/uploads', express.static(UPLOADS_DIR));

// ─── Client IP Helper ────────────────────────────────────────────────────────
function getClientIp(req) {
  const cfIp = req.headers['cf-connecting-ip'];
  if (cfIp && typeof cfIp === 'string') return cfIp.trim();
  const realIp = req.headers['x-real-ip'];
  if (realIp && typeof realIp === 'string') return realIp.trim();
  const fwd = req.headers['x-forwarded-for'];
  if (fwd && typeof fwd === 'string') return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || '127.0.0.1';
}

function isPrivateIp(ip) {
  if (!ip) return true;
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === 'localhost' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip) ||
    ip.startsWith('fc00:') ||
    ip.startsWith('fe80:')
  );
}

// ─── VPN / Proxy Blocking Middleware (Only for Admin Login & Dashboard Pages) ─
// CRITICAL: Ads endpoints (/api/v1/ads, /uploads/*, /click, /impression) are NEVER blocked.
const vpnCache = new Map();
const VPN_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

async function detectVpnOrProxy(req) {
  const ip = getClientIp(req);
  if (isPrivateIp(ip)) {
    return { isVpn: false };
  }

  // 1. Cloudflare Country & Threat Indicators
  const cfCountry = (req.headers['cf-ipcountry'] || '').toString().trim().toUpperCase();
  if (cfCountry === 'T1' || cfCountry === 'XX' || cfCountry === 'TOR') {
    return { isVpn: true, reason: 'Tor / Anonymous Proxy network detected' };
  }
  const cfThreat = parseInt(req.headers['cf-threat-score'] || '0', 10);
  if (cfThreat > 25) {
    return { isVpn: true, reason: 'High-risk threat / abusive network detected' };
  }

  // 2. Suspicious Proxy Headers
  if (req.headers['via'] || req.headers['x-proxyuser-ip']) {
    return { isVpn: true, reason: 'HTTP Proxy detected in request headers' };
  }

  // 3. Cache check
  const cached = vpnCache.get(ip);
  if (cached && Date.now() < cached.expiresAt) {
    return { isVpn: cached.isVpn, reason: cached.reason };
  }

  // 4. IP Intelligence Lookup (with 1.8s timeout)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1800);
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,proxy,hosting,query`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data && data.status === 'success') {
        const isVpn = Boolean(data.proxy || data.hosting);
        const reason = data.proxy
          ? 'VPN or Proxy network detected'
          : data.hosting
          ? 'Datacenter or Hosting IP detected'
          : '';
        vpnCache.set(ip, { isVpn, reason, expiresAt: Date.now() + VPN_CACHE_TTL_MS });
        return { isVpn, reason };
      }
    }
  } catch (_) {
    // Fail-open on lookup error so network timeouts do not block legitimate users
  }

  vpnCache.set(ip, { isVpn: false, reason: '', expiresAt: Date.now() + 30 * 60 * 1000 });
  return { isVpn: false };
}

async function blockVpnForAdminPages(req, res, next) {
  // RULE: NEVER block ads or impression / click endpoints!
  const p = req.path.toLowerCase();
  if (
    p.startsWith('/api/v1/') ||
    p.startsWith('/uploads/') ||
    /\.(css|js|png|jpg|jpeg|gif|ico|svg|mp4|webm|woff2?)$/i.test(p)
  ) {
    return next();
  }

  try {
    const check = await detectVpnOrProxy(req);
    if (check.isVpn) {
      if (req.path.startsWith('/api/')) {
        return res.status(403).json({
          error: 'Access Denied: VPN, Proxy, or Datacenter connections are strictly prohibited for the Admin Dashboard.',
          blocked: true,
          reason: check.reason,
        });
      }

      return res.status(403).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Access Restricted - MovieAds</title>
  <style>
    body { background: #0a0a0a; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .box { max-width: 480px; background: #141414; border: 1px solid #2a2a2a; border-radius: 12px; padding: 32px; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.5); }
    .icon { font-size: 48px; margin-bottom: 16px; color: #e50914; }
    h1 { font-size: 22px; margin: 0 0 12px; color: #ffffff; }
    p { font-size: 14px; line-height: 1.6; color: #a3a3a3; margin: 0 0 20px; }
    .badge { display: inline-block; background: rgba(229, 9, 20, 0.15); color: #ff4d4d; border: 1px solid rgba(229, 9, 20, 0.3); padding: 4px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-bottom: 16px; }
    .btn { display: inline-block; background: #262626; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 13px; font-weight: 600; border: 1px solid #404040; cursor: pointer; }
    .btn:hover { background: #333333; }
  </style>
</head>
<body>
  <div class="box">
    <div class="icon">&#128737;&#65039;</div>
    <div class="badge">VPN / Proxy Restricted</div>
    <h1>Access to Admin Portal Blocked</h1>
    <p>Access to the MovieAds administrative dashboard is strictly restricted from VPN, proxy, Tor, or datacenter IP addresses for platform security.</p>
    <p>Please disconnect from your VPN or proxy and refresh this page to access the login portal.</p>
    <button class="btn" onclick="location.reload()">Retry Connection</button>
  </div>
</body>
</html>`);
    }
  } catch (err) {
    console.warn('[Security] VPN check error:', err?.message);
  }

  next();
}

app.use(blockVpnForAdminPages);
app.use(express.static(path.join(__dirname, 'public')));

// ─── General API Rate Limiting ───────────────────────────────────────────────
const apiRateLimits = new Map();
const API_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const API_RATE_LIMIT_MAX = 120;

function checkApiRateLimit(req, res, next) {
  const ip = getClientIp(req);
  const now = Date.now();
  const windowStart = now - API_RATE_LIMIT_WINDOW_MS;
  let timestamps = apiRateLimits.get(ip) || [];
  timestamps = timestamps.filter(t => t > windowStart);
  if (timestamps.length >= API_RATE_LIMIT_MAX) {
    return res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please wait a moment before trying again.',
      retryAfterSeconds: Math.ceil((timestamps[0] + API_RATE_LIMIT_WINDOW_MS - now) / 1000),
    });
  }
  timestamps.push(now);
  apiRateLimits.set(ip, timestamps);
  next();
}

// ─── Admin Login Rate Limiting (3 attempts max -> 3-hour lockout) ─────────────
const loginAttempts = new Map(); // ip -> { count: number, lockedUntil: number, lastAttempt: number }
const LOGIN_LOCK_TIME_MS = 3 * 60 * 60 * 1000; // 3 hours
const MAX_LOGIN_ATTEMPTS = 3;

function getLoginLockStatus(ip) {
  const record = loginAttempts.get(ip);
  if (!record) return null;
  const now = Date.now();
  if (record.lockedUntil && now < record.lockedUntil) {
    const remainingMs = record.lockedUntil - now;
    const remainingHours = Math.floor(remainingMs / (60 * 60 * 1000));
    const remainingMins = Math.ceil((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
    const timeStr = remainingHours > 0 ? `${remainingHours}h ${remainingMins}m` : `${remainingMins} minute(s)`;
    return { locked: true, remainingMs, timeStr, lockedUntil: record.lockedUntil };
  }
  if (record.lockedUntil && now >= record.lockedUntil) {
    loginAttempts.delete(ip);
  }
  return null;
}

// Clean up stale lockout records every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of loginAttempts.entries()) {
    if (data.lockedUntil && now > data.lockedUntil) {
      loginAttempts.delete(ip);
    } else if (!data.lockedUntil && now - data.lastAttempt > 60 * 60 * 1000) {
      loginAttempts.delete(ip);
    }
  }
}, 30 * 60 * 1000);

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
  if (!ADS_SECRET_KEY) {
    return res.status(500).json({
      error: 'Server Misconfiguration',
      detail: 'ADS_SECRET_KEY environment variable is not configured on the server.',
    });
  }

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
    skip_seconds: Math.max(30, Number(a.skip_seconds) || 30),
    created_at: a.created_at,
    updated_at: a.updated_at,
    is_active: a.is_active,
    impressions: a.impressions || 0,
    clicks: a.clicks || 0,
  };
}

// ─── Auth Endpoints ──────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const clientIp = getClientIp(req);
  const lockStatus = getLoginLockStatus(clientIp);

  if (lockStatus && lockStatus.locked) {
    return res.status(429).json({
      error: `Admin login locked due to 3 consecutive failed attempts. Please try again in ${lockStatus.timeStr}.`,
      locked: true,
      remainingMs: lockStatus.remainingMs,
      lockedUntil: lockStatus.lockedUntil,
    });
  }

  const { key, password } = req.body || {};
  const cleanKey = String(key || '').trim();
  const cleanPass = String(password || '').trim();

  if (!cleanKey || !cleanPass) {
    return res.status(400).json({ error: 'Both Admin Key and Password are required.' });
  }

  if (!ADMIN_KEY || !ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'Server misconfiguration: ADMIN_KEY or ADMIN_PASSWORD env missing.' });
  }

  if (cleanKey !== ADMIN_KEY || cleanPass !== ADMIN_PASSWORD) {
    const existing = loginAttempts.get(clientIp) || { count: 0, lockedUntil: 0 };
    const newCount = existing.count + 1;
    const now = Date.now();

    if (newCount >= MAX_LOGIN_ATTEMPTS) {
      const lockedUntil = now + LOGIN_LOCK_TIME_MS;
      loginAttempts.set(clientIp, { count: newCount, lockedUntil, lastAttempt: now });
      return res.status(429).json({
        error: 'Too many failed login attempts (3/3). Admin login is now locked for 3 hours.',
        locked: true,
        remainingMs: LOGIN_LOCK_TIME_MS,
        lockedUntil,
      });
    }

    loginAttempts.set(clientIp, { count: newCount, lockedUntil: 0, lastAttempt: now });
    const remaining = MAX_LOGIN_ATTEMPTS - newCount;
    return res.status(401).json({
      error: `Invalid Admin Key or Password. ${remaining} attempt${remaining > 1 ? 's' : ''} remaining before a 3-hour lockout.`,
      attemptsRemaining: remaining,
      locked: false,
    });
  }

  // Authentication succeeded: clear failed attempts for this IP
  loginAttempts.delete(clientIp);

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

app.get('/api/admin/config', requireAdmin, (req, res) => {
  return res.status(200).json({
    success: true,
    ads_secret_key: ADS_SECRET_KEY,
    admin_key: ADMIN_KEY,
    base_url: getEffectiveBaseUrl(req),
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
      skip_seconds: Math.max(30, Number(skip_seconds) || 30),
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
  if (skip_seconds !== undefined) ad.skip_seconds = Math.max(30, Number(skip_seconds) || 30);
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
app.get('/api/v1/ads', checkApiRateLimit, verifyAdSecretKey, (req, res) => {
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
app.get('/api/v1/ads/random', checkApiRateLimit, verifyAdSecretKey, (req, res) => {
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

// ─── VIP Promo Codes Management (Admin Protected) ───────────────────────────
// 1. GET ALL PROMO CODES
app.get('/api/promos', requireAdmin, (_req, res) => {
  const promos = loadPromos();
  return res.status(200).json({ success: true, promos });
});

// 2. CREATE NEW PROMO CODE
app.post('/api/promos', requireAdmin, (req, res) => {
  let { code, duration_months } = req.body || {};
  let months = parseInt(duration_months, 10);
  if (isNaN(months) || months < 1) months = 1;
  if (months > 36) months = 36;

  let promoCode = (code || '').toString().trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!promoCode) {
    const p1 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const p2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    promoCode = `VIP-${p1}-${p2}`;
  }

  const promos = loadPromos();
  if (promos.some((p) => p.code.toUpperCase() === promoCode)) {
    return res.status(400).json({ error: `Promo code "${promoCode}" already exists.` });
  }

  const newPromo = {
    code: promoCode,
    duration_months: months,
    created_at: new Date().toISOString(),
    created_by: req.admin?.username || 'admin',
    is_claimed: false,
    claimed_at: null,
    claimed_by: null,
  };

  promos.unshift(newPromo);
  savePromos(promos);

  return res.status(201).json({ success: true, promo: newPromo });
});

// 3. DELETE / REVOKE PROMO CODE
app.delete('/api/promos/:code', requireAdmin, (req, res) => {
  const targetCode = (req.params.code || '').trim().toUpperCase();
  const promos = loadPromos();
  const idx = promos.findIndex((p) => p.code.toUpperCase() === targetCode);
  if (idx === -1) {
    return res.status(404).json({ error: 'Promo code not found.' });
  }

  const [removed] = promos.splice(idx, 1);
  savePromos(promos);
  return res.status(200).json({ success: true, message: `Promo code ${removed.code} deleted successfully.` });
});

// ─── Private Promo Code Redemption API (Server-to-Server) ───────────────────
// Called by MovieFlix backend /api/subscription?action=redeem_promo
app.post('/api/v1/promo/redeem', verifyAdSecretKey, (req, res) => {
  const { code, user_id, email, account_id } = req.body || {};
  const cleanCode = (code || '').toString().trim().toUpperCase();

  if (!cleanCode) {
    return res.status(400).json({ error: 'Promo code is required.' });
  }

  const promos = loadPromos();
  const promo = promos.find((p) => p.code.toUpperCase() === cleanCode);

  if (!promo) {
    return res.status(404).json({ error: 'Invalid VIP promo code. Please double-check and try again.' });
  }

  if (promo.is_claimed) {
    return res.status(400).json({
      error: 'This VIP promo code has already been claimed and has expired.',
      claimed_at: promo.claimed_at,
    });
  }

  // Mark code claimed (expires immediately)
  promo.is_claimed = true;
  promo.claimed_at = new Date().toISOString();
  promo.claimed_by = {
    user_id: user_id || null,
    email: email || null,
    account_id: account_id || null,
    claimed_ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null,
  };

  savePromos(promos);

  return res.status(200).json({
    success: true,
    code: promo.code,
    duration_months: promo.duration_months || 1,
    claimed_at: promo.claimed_at,
    message: `Successfully claimed VIP Pro for ${promo.duration_months || 1} month(s)!`,
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
