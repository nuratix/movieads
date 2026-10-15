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
const posterFileInput = document.getElementById('posterFileInput');
const posterUrlInput = document.getElementById('posterUrlInput');
const dropPrompt = document.getElementById('dropPrompt');
const previewContainer = document.getElementById('previewContainer');
const livePreviewImg = document.getElementById('livePreviewImg');
const clearImageBtn = document.getElementById('clearImageBtn');
const previewMetaBadge = document.getElementById('previewMetaBadge');
const submitAdBtn = document.getElementById('submitAdBtn');
const createError = document.getElementById('createError');
const createSuccess = document.getElementById('createSuccess');

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

function showLogin() {
  loginSection.classList.remove('hidden');
  dashboardSection.classList.add('hidden');
  logoutBtn.classList.add('hidden');
}

function showDashboard() {
  loginSection.classList.add('hidden');
  dashboardSection.classList.remove('hidden');
  logoutBtn.classList.remove('hidden');
  loadAds();
}

// ─── Login Form Submission ───────────────────────────────────────────────────
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');
    loginError.textContent = '';

    const key = document.getElementById('adminKey').value.trim();
    const password = adminPasswordInput.value.trim();
    const submitBtn = document.getElementById('loginSubmitBtn');

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
        loginError.textContent = data.error || 'Authentication failed. Please verify key and password.';
        loginError.classList.remove('hidden');
        return;
      }

      showToast('Welcome back, Admin!');
      showDashboard();
    } catch (err) {
      loginError.textContent = err.message || 'Connection error. Check your network.';
      loginError.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Sign In to Dashboard</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
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

// ─── 16:9 Image Upload & Live Preview ────────────────────────────────────────
function setPreviewImage(src, meta = '16:9 Preview Active') {
  livePreviewImg.src = src;
  previewMetaBadge.textContent = meta;
  dropPrompt.classList.add('hidden');
  previewContainer.classList.remove('hidden');
}

function clearPreview() {
  livePreviewImg.src = '';
  posterFileInput.value = '';
  posterUrlInput.value = '';
  dropPrompt.classList.remove('hidden');
  previewContainer.classList.add('hidden');
}

if (clearImageBtn) {
  clearImageBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearPreview();
  });
}

if (posterFileInput) {
  posterFileInput.addEventListener('change', () => {
    const file = posterFileInput.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const ratio = (img.width / img.height).toFixed(2);
          const isStandard169 = Math.abs(ratio - 1.78) < 0.15;
          const badgeText = isStandard169
            ? `${img.width}x${img.height} (16:9 Widescreen)`
            : `${img.width}x${img.height} (Aspect ratio: ${ratio}:1)`;
          setPreviewImage(e.target.result, badgeText);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  });
}

if (posterUrlInput) {
  posterUrlInput.addEventListener('input', () => {
    const url = posterUrlInput.value.trim();
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const img = new Image();
      img.onload = () => {
        const ratio = (img.width / img.height).toFixed(2);
        setPreviewImage(url, `${img.width}x${img.height} (Remote URL)`);
      };
      img.onerror = () => {
        setPreviewImage(url, 'Remote URL (Image preview)');
      };
      img.src = url;
    } else if (!posterFileInput.files.length) {
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
      posterFileInput.files = files;
      const event = new Event('change');
      posterFileInput.dispatchEvent(event);
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
    const placement = document.getElementById('adPlacement').value;
    const file = posterFileInput.files[0];
    const remoteUrl = posterUrlInput.value.trim();

    if (!name || !targetUrl) {
      createError.textContent = 'Please fill out all required fields (Name and Destination URL).';
      createError.classList.remove('hidden');
      return;
    }

    if (!file && !remoteUrl) {
      createError.textContent = 'Please upload a 16:9 poster image or enter a poster URL.';
      createError.classList.remove('hidden');
      return;
    }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('target_url', targetUrl);
    formData.append('is_active', isActive);
    formData.append('placement', placement);

    if (file) {
      formData.append('poster_file', file);
    } else if (remoteUrl) {
      formData.append('poster_url', remoteUrl);
    }

    submitAdBtn.disabled = true;
    submitAdBtn.innerHTML = '<span>Uploading and publishing...</span>';

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
    return `
      <div class="ad-card" data-id="${ad.id}">
        <!-- 16:9 Banner Image Frame -->
        <div class="ad-banner-16-9">
          <img src="${ad.full_poster_url}" alt="${escapeHtml(ad.name)}" class="ad-banner-img" loading="lazy">
          <span class="ad-status-pill ${ad.is_active ? 'pill-active' : 'pill-paused'}">
            ${ad.is_active ? 'Active' : 'Paused'}
          </span>
          <span class="ad-aspect-badge">16:9</span>
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
    showToast('Click tracking link copied to clipboard!');
  }).catch(() => {
    prompt('Copy ad link:', url);
  });
};

window.copySnippet = function(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const text = el.innerText || el.textContent;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Code snippet copied to clipboard!');
  }).catch(() => {
    showToast('Unable to copy code');
  });
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Initialize on page load
checkAuth();
