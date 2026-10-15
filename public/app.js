// MovieAds Interactive Client Application
let currentAds = [];

// DOM Elements
const loginSection = document.getElementById('loginSection');
const dashboardSection = document.getElementById('dashboardSection');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const togglePasswordBtn = document.getElementById('togglePasswordBtn');
const adminPasswordInput = document.getElementById('adminPassword');

// Form & Upload Elements
const createAdForm = document.getElementById('createAdForm');
const uploadDropZone = document.getElementById('uploadDropZone');
const mediaFileInput = document.getElementById('mediaFileInput') || document.getElementById('posterFileInput');
const mediaUrlInput = document.getElementById('mediaUrlInput') || document.getElementById('posterUrlInput');
const dropPrompt = document.getElementById('dropPrompt');
const previewContainer = document.getElementById('previewContainer');
const livePreviewImg = document.getElementById('livePreviewImg');
const livePreviewVid = document.getElementById('livePreviewVid');
const clearImageBtn = document.getElementById('clearImageBtn');
const previewMetaBadge = document.getElementById('previewMetaBadge');
const submitAdBtn = document.getElementById('submitAdBtn');
const createError = document.getElementById('createError');
const createSuccess = document.getElementById('createSuccess');
const aspectRatioFrame = document.getElementById('aspectRatioFrame');
const adAspectRatio = document.getElementById('adAspectRatio');
const adPlacement = document.getElementById('adPlacement');
const aspectBadgeText = document.getElementById('aspectBadgeText');
const uploadFieldLabel = document.getElementById('uploadFieldLabel');
const dropTitle = document.getElementById('dropTitle');

// Stats & List Elements
const adsListContainer = document.getElementById('adsListContainer');
const emptyAdsState = document.getElementById('emptyAdsState');
const statTotalAds = document.getElementById('statTotalAds');
const statActiveAds = document.getElementById('statActiveAds');
const statTotalImpressions = document.getElementById('statTotalImpressions');
const statTotalClicks = document.getElementById('statTotalClicks');
const campaignsCountBadge = document.getElementById('campaignsCountBadge');
const toastEl = document.getElementById('toast');

// ─── Toast Notification Helper ───────────────────────────────────────────────
function showToast(message, duration = 3000) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.remove('hidden');
  setTimeout(() => {
    toastEl.classList.add('hidden');
  }, duration);
}

// ─── Format & Aspect Ratio Selector (16:9 vs 9:16) ───────────────────────────
window.selectFormat = function(ratio, defaultPlacement) {
  const btn169 = document.getElementById('formatBtn169');
  const btn916 = document.getElementById('formatBtn916');

  if (ratio === '9:16') {
    if (btn169) btn169.classList.remove('active');
    if (btn916) btn916.classList.add('active');
    if (adAspectRatio) adAspectRatio.value = '9:16';
    if (aspectRatioFrame) {
      aspectRatioFrame.classList.remove('aspect-16-9-frame');
      aspectRatioFrame.classList.add('aspect-9-16-frame');
    }
    if (aspectBadgeText) aspectBadgeText.textContent = '9:16 Shorts Ratio';
    if (uploadFieldLabel) uploadFieldLabel.textContent = 'Ad Media File (9:16 Shorts Video or Vertical Poster) *';
    if (dropTitle) dropTitle.textContent = 'Tap to browse or drop 9:16 video or poster';
    if (adPlacement) adPlacement.value = defaultPlacement || 'shorts';
    const skipSelect = document.getElementById('adSkipSeconds');
    if (skipSelect) skipSelect.value = '5';
  } else {
    if (btn169) btn169.classList.add('active');
    if (btn916) btn916.classList.remove('active');
    if (adAspectRatio) adAspectRatio.value = '16:9';
    if (aspectRatioFrame) {
      aspectRatioFrame.classList.remove('aspect-9-16-frame');
      aspectRatioFrame.classList.add('aspect-16-9-frame');
    }
    if (aspectBadgeText) aspectBadgeText.textContent = '16:9 Aspect Ratio';
    if (uploadFieldLabel) uploadFieldLabel.textContent = 'Ad Media File (16:9 Video or Widescreen Poster) *';
    if (dropTitle) dropTitle.textContent = 'Tap to browse or drop 16:9 video or poster';
    if (adPlacement) adPlacement.value = defaultPlacement || 'player';
    const skipSelect = document.getElementById('adSkipSeconds');
    if (skipSelect) skipSelect.value = '10';
  }
};

// ─── Password Visibility Toggle ──────────────────────────────────────────────
if (togglePasswordBtn && adminPasswordInput) {
  togglePasswordBtn.addEventListener('click', () => {
    const isPassword = adminPasswordInput.getAttribute('type') === 'password';
    adminPasswordInput.setAttribute('type', isPassword ? 'text' : 'password');
  });
}

// ─── Tab Switching ───────────────────────────────────────────────────────────
window.switchTab = function(tabName) {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
  });
  document.querySelectorAll('.tab-content').forEach((content) => {
    content.classList.remove('active');
  });

  const targetId = tabName === 'campaigns'
    ? 'tabContentCampaigns'
    : tabName === 'create'
    ? 'tabContentCreate'
    : 'tabContentApi';

  const targetContent = document.getElementById(targetId);
  if (targetContent) targetContent.classList.add('active');

  if (tabName === 'campaigns') {
    loadAds();
  }
};

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    switchTab(btn.getAttribute('data-tab'));
  });
});

// ─── Auth Verification on Launch ─────────────────────────────────────────────
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      if (data.authenticated) {
        showDashboard();
        return;
      }
    }
    showLogin();
  } catch {
    showLogin();
  }
}

function showDashboard() {
  if (loginSection) loginSection.classList.add('hidden');
  if (dashboardSection) dashboardSection.classList.remove('hidden');
  loadAds();
}

function showLogin() {
  if (loginSection) loginSection.classList.remove('hidden');
  if (dashboardSection) dashboardSection.classList.add('hidden');
}

// ─── Login Form Submission ───────────────────────────────────────────────────
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');

    const key = document.getElementById('adminKey').value.trim();
    const password = adminPasswordInput.value.trim();
    const submitBtn = document.getElementById('loginSubmitBtn');

    if (!key || !password) {
      loginError.textContent = 'Please enter both your Admin Key and Password.';
      loginError.classList.remove('hidden');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Verifying credentials...</span>';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        loginError.textContent = data.error || 'Authentication failed.';
        loginError.classList.remove('hidden');
        return;
      }

      showToast('Login successful! Welcome to MovieAds.');
      showDashboard();
    } catch (err) {
      loginError.textContent = 'Network error connecting to auth server.';
      loginError.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>Sign In to Dashboard</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>';
    }
  });
}

// ─── Logout Handler ──────────────────────────────────────────────────────────
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (_) {}
    showToast('Signed out successfully');
    showLogin();
  });
}

// ─── Media Upload & Live Preview (Video & Image) ──────────────────────────────
function setPreviewMedia(type, src, meta = 'Preview Active') {
  if (type === 'video') {
    if (livePreviewImg) livePreviewImg.classList.add('hidden');
    if (livePreviewVid) {
      livePreviewVid.src = src;
      livePreviewVid.classList.remove('hidden');
      livePreviewVid.play().catch(() => {});
    }
  } else {
    if (livePreviewVid) {
      livePreviewVid.pause();
      livePreviewVid.src = '';
      livePreviewVid.classList.add('hidden');
    }
    if (livePreviewImg) {
      livePreviewImg.src = src;
      livePreviewImg.classList.remove('hidden');
    }
  }

  if (previewMetaBadge) previewMetaBadge.textContent = meta;
  if (dropPrompt) dropPrompt.classList.add('hidden');
  if (previewContainer) previewContainer.classList.remove('hidden');
}

function clearPreview() {
  if (livePreviewVid) {
    livePreviewVid.pause();
    livePreviewVid.src = '';
    livePreviewVid.classList.add('hidden');
  }
  if (livePreviewImg) {
    livePreviewImg.src = '';
    livePreviewImg.classList.add('hidden');
  }
  if (mediaFileInput) mediaFileInput.value = '';
  if (mediaUrlInput) mediaUrlInput.value = '';
  if (dropPrompt) dropPrompt.classList.remove('hidden');
  if (previewContainer) previewContainer.classList.add('hidden');
}

if (clearImageBtn) {
  clearImageBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearPreview();
  });
}

if (mediaFileInput) {
  mediaFileInput.addEventListener('change', () => {
    const file = mediaFileInput.files[0];
    if (file) {
      const isVid = (file.type && file.type.startsWith('video/')) || /mp4|webm|mov|mkv|ogg/.test(file.name);
      if (isVid) {
        const objectUrl = URL.createObjectURL(file);
        const ratio = adAspectRatio ? adAspectRatio.value : '16:9';
        setPreviewMedia('video', objectUrl, `Video Ad (${ratio}) • ${file.name}`);
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const ratio = (img.width / img.height).toFixed(2);
            const badgeText = `${img.width}x${img.height} (${adAspectRatio ? adAspectRatio.value : 'Poster'})`;
            setPreviewMedia('image', e.target.result, badgeText);
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      }
    }
  });
}

if (mediaUrlInput) {
  mediaUrlInput.addEventListener('input', () => {
    const url = mediaUrlInput.value.trim();
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const isVid = /\.(mp4|webm|mov|ogg)($|\?)/i.test(url);
      if (isVid) {
        setPreviewMedia('video', url, 'Remote Video Ad Preview');
      } else {
        setPreviewMedia('image', url, 'Remote Image Preview');
      }
    } else if (!mediaFileInput.files.length) {
      clearPreview();
    }
  });
}

// Drag and drop handling
if (uploadDropZone) {
  ['dragenter', 'dragover'].forEach((eventName) => {
    uploadDropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      uploadDropZone.classList.add('drag-active');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    uploadDropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      uploadDropZone.classList.remove('drag-active');
    });
  });

  uploadDropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length) {
      mediaFileInput.files = files;
      const event = new Event('change');
      mediaFileInput.dispatchEvent(event);
    }
  });
}

// ─── Create Ad Form Submission ───────────────────────────────────────────────
if (createAdForm) {
  createAdForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    createError.classList.add('hidden');
    createSuccess.classList.add('hidden');

    const name = document.getElementById('adName').value.trim();
    const targetUrl = document.getElementById('adTargetUrl').value.trim();
    const isActive = document.getElementById('adIsActive').checked;
    const placement = adPlacement ? adPlacement.value : 'player';
    const aspectRatio = adAspectRatio ? adAspectRatio.value : '16:9';
    const skipSeconds = document.getElementById('adSkipSeconds')?.value || (aspectRatio === '9:16' ? 5 : 10);
    const file = mediaFileInput.files[0];
    const remoteUrl = mediaUrlInput.value.trim();

    if (!name || !targetUrl) {
      createError.textContent = 'Please fill out all required fields (Name and Destination URL).';
      createError.classList.remove('hidden');
      return;
    }

    if (!file && !remoteUrl) {
      createError.textContent = 'Please upload a video/image file or enter a media URL.';
      createError.classList.remove('hidden');
      return;
    }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('target_url', targetUrl);
    formData.append('aspect_ratio', aspectRatio);
    formData.append('placement', placement);
    formData.append('skip_seconds', skipSeconds);
    formData.append('is_active', isActive);

    if (file) {
      const isVid = (file.type && file.type.startsWith('video/')) || /mp4|webm|mov|mkv|ogg/.test(file.name);
      formData.append('media_type', isVid ? 'video' : 'image');
      formData.append('media_file', file);
    } else if (remoteUrl) {
      const isVid = /\.(mp4|webm|mov|ogg)($|\?)/i.test(remoteUrl);
      formData.append('media_type', isVid ? 'video' : 'image');
      if (isVid) {
        formData.append('video_url', remoteUrl);
      } else {
        formData.append('poster_url', remoteUrl);
      }
    }

    submitAdBtn.disabled = true;
    submitAdBtn.innerHTML = '<span>Uploading and publishing media...</span>';

    try {
      const res = await fetch('/api/ads', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        createError.textContent = data.error || 'Failed to create ad campaign.';
        createError.classList.remove('hidden');
        return;
      }

      showToast(`Ad "${name}" published successfully!`);
      createAdForm.reset();
      clearPreview();

      // Return to campaigns list
      switchTab('campaigns');
    } catch (err) {
      createError.textContent = err.message || 'Error uploading ad. Check network.';
      createError.classList.remove('hidden');
    } finally {
      submitAdBtn.disabled = false;
      submitAdBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg><span>Upload & Publish Ad</span>`;
    }
  });
}

// ─── Load & Render Ads ───────────────────────────────────────────────────────
async function loadAds() {
  try {
    const res = await fetch('/api/ads');
    if (!res.ok) {
      if (res.status === 401) showLogin();
      return;
    }
    const data = await res.json();
    currentAds = data.ads || [];
    renderDashboard();
  } catch (err) {
    console.error('Failed to load ads:', err);
  }
}

function renderDashboard() {
  // Update Stats Counters
  const total = currentAds.length;
  const active = currentAds.filter((a) => a.is_active).length;
  const impressions = currentAds.reduce((sum, a) => sum + (a.impressions || 0), 0);
  const clicks = currentAds.reduce((sum, a) => sum + (a.clicks || 0), 0);

  if (statTotalAds) statTotalAds.textContent = total;
  if (statActiveAds) statActiveAds.textContent = active;
  if (statTotalImpressions) statTotalImpressions.textContent = impressions.toLocaleString();
  if (statTotalClicks) statTotalClicks.textContent = clicks.toLocaleString();
  if (campaignsCountBadge) campaignsCountBadge.textContent = total;

  if (total === 0) {
    adsListContainer.innerHTML = '';
    emptyAdsState.classList.remove('hidden');
    return;
  }

  emptyAdsState.classList.add('hidden');
  adsListContainer.innerHTML = currentAds.map((ad) => {
    const ctr = ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(1) : '0.0';
    const isVideo = ad.media_type === 'video' || Boolean(ad.video_url);
    const isShorts = ad.aspect_ratio === '9:16';
    const mediaSource = ad.video_url || ad.poster_url || '';

    const formatBadge = isShorts
      ? (isVideo ? '9:16 Shorts Video' : '9:16 Shorts Poster')
      : (isVideo ? '16:9 Video Ad' : '16:9 Player Poster');

    return `
      <div class="ad-card" data-id="${ad.id}">
        <!-- Media Frame -->
        <div class="${isShorts ? 'ad-banner-16-9' : 'ad-banner-16-9'}">
          ${isVideo ? `
            <video src="${escapeHtml(mediaSource)}" class="ad-banner-img" muted loop playsinline onmouseover="this.play()" onmouseout="this.pause()"></video>
            <div style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.7); padding: 2px 6px; border-radius: 4px; font-size: 10px; color: #fff;">🎬 Video</div>
          ` : `
            <img src="${escapeHtml(mediaSource)}" alt="${escapeHtml(ad.name)}" class="ad-banner-img" loading="lazy">
          `}
          <span class="ad-status-pill ${ad.is_active ? 'pill-active' : 'pill-paused'}">
            ${ad.is_active ? 'Active' : 'Paused'}
          </span>
          <span class="ad-aspect-badge">${formatBadge}</span>
        </div>

        <div class="ad-card-body">
          <h4 class="ad-title">${escapeHtml(ad.name)}</h4>
          <a href="${escapeHtml(ad.target_url)}" target="_blank" rel="noopener noreferrer" class="ad-target-link" title="${escapeHtml(ad.target_url)}">
            ${escapeHtml(ad.target_url)}
          </a>

          <!-- Performance Analytics -->
          <div class="ad-stats-row">
            <div class="ad-stat-item">
              <span class="ad-stat-num">${(ad.impressions || 0).toLocaleString()}</span>
              <span class="ad-stat-title">Views</span>
            </div>
            <div class="ad-stat-item">
              <span class="ad-stat-num">${(ad.clicks || 0).toLocaleString()}</span>
              <span class="ad-stat-title">Clicks</span>
            </div>
            <div class="ad-stat-item">
              <span class="ad-stat-num">${ctr}%</span>
              <span class="ad-stat-title">CTR</span>
            </div>
          </div>

          <!-- Actions -->
          <div class="ad-card-actions">
            <button class="btn btn-sm ${ad.is_active ? 'btn-outline' : 'btn-primary'}" onclick="toggleAdStatus('${ad.id}')">
              ${ad.is_active ? 'Pause Ad' : 'Activate Ad'}
            </button>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-outline btn-xs" onclick="copyAdLink('${ad.click_url}')" title="Copy Click URL">
                Link
              </button>
              <button class="btn btn-outline btn-xs btn-danger" onclick="deleteAd('${ad.id}')" title="Delete Ad">
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ─── Ad Card Actions ─────────────────────────────────────────────────────────
window.toggleAdStatus = async function(id) {
  try {
    const res = await fetch(`/api/ads/${id}/toggle`, { method: 'PATCH' });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'Status updated');
      loadAds();
    } else {
      showToast(data.error || 'Failed to toggle status');
    }
  } catch (err) {
    showToast('Network error');
  }
};

window.deleteAd = async function(id) {
  if (!confirm('Are you sure you want to delete this ad campaign? This action cannot be undone.')) {
    return;
  }
  try {
    const res = await fetch(`/api/ads/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Ad campaign deleted');
      loadAds();
    } else {
      const data = await res.json();
      showToast(data.error || 'Failed to delete ad');
    }
  } catch {
    showToast('Network error');
  }
};

window.copyAdLink = function(url) {
  navigator.clipboard.writeText(url).then(() => {
    showToast('Click URL copied to clipboard!');
  }).catch(() => {
    prompt('Copy Click URL:', url);
  });
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Initialize
checkAuth();
