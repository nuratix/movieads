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

// ─── Format & Aspect Ratio Selector (16:9 Standard) ───────────────────────────
window.selectFormat = function(ratio, defaultPlacement) {
  if (adAspectRatio) adAspectRatio.value = '16:9';
  if (aspectRatioFrame) {
    aspectRatioFrame.classList.remove('aspect-9-16-frame');
    aspectRatioFrame.classList.add('aspect-16-9-frame');
  }
  if (aspectBadgeText) aspectBadgeText.textContent = '16:9 Aspect Ratio';
  if (uploadFieldLabel) uploadFieldLabel.textContent = 'Ad Media File (16:9 Video or Widescreen Poster) *';
  if (dropTitle) dropTitle.textContent = 'Tap to browse or drop 16:9 video or poster';
  if (adPlacement) adPlacement.value = 'player';
  const skipSelect = document.getElementById('adSkipSeconds');
  if (skipSelect) skipSelect.value = '30';
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
    : tabName === 'promos'
    ? 'tabContentPromos'
    : 'tabContentApi';

  const targetContent = document.getElementById(targetId);
  if (targetContent) targetContent.classList.add('active');

  if (tabName === 'campaigns') {
    loadAds();
  } else if (tabName === 'promos') {
    loadPromos();
  }
};

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    switchTab(btn.getAttribute('data-tab'));
  });
});

// ─── Auth Verification on Launch ─────────────────────────────────────────────
function getAuthToken() {
  try {
    return localStorage.getItem('movieads_token') || '';
  } catch (_) {
    return '';
  }
}

async function authFetch(url, options = {}) {
  const token = getAuthToken();
  const headers = { ...(options.headers || {}) };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
}

async function checkAuth() {
  try {
    const res = await authFetch('/api/auth/me');
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
  loadAdminConfig();
}

async function loadAdminConfig() {
  try {
    const res = await authFetch('/api/admin/config');
    if (res.ok) {
      const data = await res.json();
      if (data && data.ads_secret_key) {
        window.activeAdsSecretKey = data.ads_secret_key;
        const curlSnippet = document.getElementById('curlExample');
        if (curlSnippet) {
          curlSnippet.innerHTML = `<code>curl -H "X-Ad-Secret-Key: ${data.ads_secret_key}" \\\n  https://ads.wallpaperdomain.xyz/api/v1/ads</code>`;
        }
        const rnSnippet = document.getElementById('rnExample');
        if (rnSnippet) {
          rnSnippet.innerHTML = `<code>// Fetch active 16:9 ads in Movieflix
export async function fetchMovieAds() {
  const res = await fetch('https://ads.wallpaperdomain.xyz/api/v1/ads', {
    headers: {
      'X-Ad-Secret-Key': process.env.ADS_SECRET_KEY,
    },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.ads || [];
}</code>`;
        }
      }
    }
  } catch (_) {}
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
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok) {
        loginError.textContent = data.error || 'Authentication failed.';
        loginError.classList.remove('hidden');
        if (data.locked) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<span>🔒 Login Locked (3 Hours)</span>';
          return;
        }
        return;
      }

      if (data.token) {
        try {
          localStorage.setItem('movieads_token', data.token);
        } catch (_) {}
      }

      showToast('Login successful! Welcome to MovieAds.');
      showDashboard();
    } catch (err) {
      loginError.textContent = 'Network error connecting to auth server.';
      loginError.classList.remove('hidden');
    } finally {
      if (!submitBtn.disabled || !submitBtn.innerHTML.includes('Locked')) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Sign In to Dashboard</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>';
      }
    }
  });
}

// ─── Logout Handler ──────────────────────────────────────────────────────────
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' });
    } catch (_) {}
    try {
      localStorage.removeItem('movieads_token');
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
    const skipSeconds = Math.max(30, Number(document.getElementById('adSkipSeconds')?.value || 30));
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
      const res = await authFetch('/api/ads', {
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
    const res = await authFetch('/api/ads');
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
    const mediaSource = ad.video_url || ad.poster_url || '';
    const formatBadge = isVideo ? '16:9 Video Ad' : '16:9 Player Poster';

    return `
      <div class="ad-card" data-id="${ad.id}">
        <!-- Media Frame -->
        <div class="ad-banner-16-9">
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
              ${ad.is_active ? 'Pause' : 'Activate'}
            </button>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-outline btn-xs" onclick="openEditModal('${ad.id}')" title="Edit Campaign Details">
                Edit
              </button>
              <button class="btn btn-outline btn-xs" onclick="copyAdLink('${escapeHtml(ad.click_url || '')}')" title="Copy Click URL">
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

// ─── Edit Ad Modal Logic ────────────────────────────────────────────────────
window.openEditModal = function(id) {
  const ad = currentAds.find((a) => a.id === id);
  if (!ad) return;

  const modal = document.getElementById('editAdModal');
  const errorEl = document.getElementById('editError');
  if (errorEl) errorEl.classList.add('hidden');

  document.getElementById('editAdId').value = ad.id;
  document.getElementById('editAdName').value = ad.name || '';
  document.getElementById('editAdTargetUrl').value = ad.target_url || '';
  document.getElementById('editAdSkipSeconds').value = Math.max(30, Number(ad.skip_seconds) || 30);
  document.getElementById('editAdStatus').value = ad.is_active ? 'true' : 'false';
  document.getElementById('editAdFile').value = '';

  if (modal) modal.classList.remove('hidden');
};

window.closeEditModal = function() {
  const modal = document.getElementById('editAdModal');
  if (modal) modal.classList.add('hidden');
};

const editAdForm = document.getElementById('editAdForm');
if (editAdForm) {
  editAdForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editAdId').value;
    const saveBtn = document.getElementById('saveAdBtn');
    const errorEl = document.getElementById('editError');
    if (errorEl) errorEl.classList.add('hidden');

    const formData = new FormData(editAdForm);
    const fileInput = document.getElementById('editAdFile');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      formData.delete('media');
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span>Saving changes...</span>';

    try {
      const res = await authFetch(`/api/ads/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        if (errorEl) {
          errorEl.textContent = data.error || 'Failed to update ad campaign.';
          errorEl.classList.remove('hidden');
        }
        return;
      }

      showToast('Ad campaign updated successfully!');
      closeEditModal();
      loadAds();
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = 'Network error saving ad changes.';
        errorEl.classList.remove('hidden');
      }
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<span>Save Changes</span>';
    }
  });
}

// ─── Ad Card Actions ─────────────────────────────────────────────────────────
window.toggleAdStatus = async function(id) {
  try {
    const res = await authFetch(`/api/ads/${id}/toggle`, { method: 'PATCH' });
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
    const res = await authFetch(`/api/ads/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Ad campaign deleted successfully');
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
  if (!url) {
    showToast('No click URL available');
    return;
  }
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

// ─── VIP Promo Codes Management ─────────────────────────────────────────────
let currentPromos = [];
let activePromoFilter = 'all';

const promosTableBody = document.getElementById('promosTableBody');
const promosCountBadge = document.getElementById('promosCountBadge');
const promoFilterAllCount = document.getElementById('promoFilterAllCount');
const promoFilterActiveCount = document.getElementById('promoFilterActiveCount');
const promoFilterClaimedCount = document.getElementById('promoFilterClaimedCount');
const createPromoForm = document.getElementById('createPromoForm');
const promoCustomCode = document.getElementById('promoCustomCode');
const promoDurationMonths = document.getElementById('promoDurationMonths');
const generatePromoBtn = document.getElementById('generatePromoBtn');
const promoCreateError = document.getElementById('promoCreateError');
const promoCreateSuccess = document.getElementById('promoCreateSuccess');

window.loadPromos = async function() {
  if (!promosTableBody) return;
  try {
    const res = await authFetch('/api/promos');
    if (!res.ok) {
      if (res.status === 401) showLogin();
      return;
    }
    const data = await res.json();
    currentPromos = data.promos || [];
    renderPromos();
  } catch (err) {
    console.error('Failed to load promos:', err);
    promosTableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 24px; color: #ef4444;">
          Failed to load promo codes. Please refresh.
        </td>
      </tr>
    `;
  }
};

window.filterPromos = function(filter) {
  activePromoFilter = filter;
  document.querySelectorAll('.promo-filter-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
  });
  renderPromos();
};

window.renderPromos = function() {
  if (!promosTableBody) return;

  const total = currentPromos.length;
  const activeCount = currentPromos.filter((p) => !p.is_claimed).length;
  const claimedCount = currentPromos.filter((p) => p.is_claimed).length;

  if (promosCountBadge) promosCountBadge.textContent = total;
  if (promoFilterAllCount) promoFilterAllCount.textContent = total;
  if (promoFilterActiveCount) promoFilterActiveCount.textContent = activeCount;
  if (promoFilterClaimedCount) promoFilterClaimedCount.textContent = claimedCount;

  let filtered = currentPromos;
  if (activePromoFilter === 'active') {
    filtered = currentPromos.filter((p) => !p.is_claimed);
  } else if (activePromoFilter === 'claimed') {
    filtered = currentPromos.filter((p) => p.is_claimed);
  }

  if (filtered.length === 0) {
    promosTableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 32px; color: var(--text-muted);">
          No promo codes found${activePromoFilter !== 'all' ? ` for "${activePromoFilter}" filter` : ''}.
        </td>
      </tr>
    `;
    return;
  }

  promosTableBody.innerHTML = filtered.map((promo) => {
    const durationLabel = `${promo.duration_months} Month${promo.duration_months > 1 ? 's' : ''}`;
    const isClaimed = Boolean(promo.is_claimed);
    const createdDate = promo.created_at ? new Date(promo.created_at).toLocaleDateString() : '—';
    const claimedDate = promo.claimed_at ? new Date(promo.claimed_at).toLocaleString() : '—';

    let claimedByHtml = '<span style="color: var(--text-muted);">Not Claimed</span>';
    if (isClaimed && promo.claimed_by) {
      const email = promo.claimed_by.email || promo.claimed_by.user_id || 'Unknown';
      const acctId = promo.claimed_by.account_id ? `ID: ${promo.claimed_by.account_id}` : '';
      claimedByHtml = `
        <div class="user-claim-info">
          <span class="user-claim-email">${escapeHtml(email)}</span>
          ${acctId ? `<span class="user-claim-id">${escapeHtml(acctId)}</span>` : ''}
        </div>
      `;
    }

    return `
      <tr>
        <td style="padding: 12px;">
          <div class="promo-code-badge" onclick="copyPromoCode('${escapeHtml(promo.code)}')" title="Click to copy code">
            <span>${escapeHtml(promo.code)}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </div>
        </td>
        <td style="padding: 12px; font-weight: 600; color: var(--text-primary); font-size: 13px;">
          ${durationLabel}
        </td>
        <td style="padding: 12px;">
          <span class="promo-status-badge ${isClaimed ? 'claimed' : 'active'}">
            ${isClaimed ? 'Claimed / Expired' : 'Active'}
          </span>
        </td>
        <td style="padding: 12px;">
          ${claimedByHtml}
        </td>
        <td style="padding: 12px; font-size: 12px; color: var(--text-secondary);">
          ${claimedDate}
        </td>
        <td style="padding: 12px; font-size: 12px; color: var(--text-secondary);">
          ${createdDate}
        </td>
        <td style="padding: 12px; text-align: right;">
          <button type="button" class="btn btn-xs btn-outline" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.3);" onclick="deletePromo('${escapeHtml(promo.code)}')">
            Delete
          </button>
        </td>
      </tr>
    `;
  }).join('');
};

window.copyPromoCode = function(code) {
  if (!code) return;
  navigator.clipboard.writeText(code).then(() => {
    showToast(`Code "${code}" copied to clipboard!`);
  }).catch(() => {
    prompt('Copy Promo Code:', code);
  });
};

window.deletePromo = async function(code) {
  if (!confirm(`Are you sure you want to delete promo code "${code}"?`)) return;
  try {
    const res = await authFetch(`/api/promos/${encodeURIComponent(code)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Failed to delete promo code.');
      return;
    }
    showToast(`Promo code "${code}" deleted.`);
    loadPromos();
  } catch (err) {
    alert(err.message || 'Network error deleting promo code.');
  }
};

if (createPromoForm) {
  createPromoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (promoCreateError) promoCreateError.classList.add('hidden');
    if (promoCreateSuccess) promoCreateSuccess.classList.add('hidden');

    const code = (promoCustomCode?.value || '').trim();
    const duration_months = parseInt(promoDurationMonths?.value || '1', 10);

    if (generatePromoBtn) generatePromoBtn.disabled = true;

    try {
      const res = await authFetch('/api/promos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, duration_months }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (promoCreateError) {
          promoCreateError.textContent = data.error || 'Failed to generate promo code.';
          promoCreateError.classList.remove('hidden');
        }
        return;
      }

      if (promoCreateSuccess) {
        promoCreateSuccess.textContent = `Promo code "${data.promo.code}" created for ${data.promo.duration_months} month(s)!`;
        promoCreateSuccess.classList.remove('hidden');
      }

      if (promoCustomCode) promoCustomCode.value = '';
      showToast(`Promo code "${data.promo.code}" created!`);
      loadPromos();
    } catch (err) {
      if (promoCreateError) {
        promoCreateError.textContent = err.message || 'Error generating promo code.';
        promoCreateError.classList.remove('hidden');
      }
    } finally {
      if (generatePromoBtn) generatePromoBtn.disabled = false;
    }
  });
}

// Initialize
checkAuth();
