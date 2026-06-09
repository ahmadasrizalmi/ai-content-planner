// AI Content Planner — Side Panel Logic

const $ = id => document.getElementById(id);

let currentPhoto = null; // base64
let currentTone = 'professional';
let currentPlatform = 'instagram-post';
let currentTemplate = 'minimal';
let captionResults = [];

// ─── Init ──────────────────────────────────────────────────────────

async function init() {
  // Check if logged in
  chrome.runtime.sendMessage({ type: 'GET_ACCOUNTS' }, (resp) => {
    if (resp?.activeAccount && resp.accounts?.[resp.activeAccount]) {
      showApp(resp.accounts[resp.activeAccount]);
    } else {
      showLogin();
    }
  });
  
  setupEvents();
}

// ─── Auth ──────────────────────────────────────────────────────────

function showLogin() {
  $('login-screen').classList.remove('hidden');
  $('app').classList.remove('active');
}

function showApp(user) {
  $('login-screen').classList.add('hidden');
  $('app').classList.add('active');
  
  // Update account chip
  if (user.picture) {
    $('avatar-placeholder').outerHTML = `<img class="account-avatar" src="${user.picture}" id="avatar-placeholder">`;
  } else {
    $('avatar-placeholder').textContent = (user.name || user.email || 'A')[0].toUpperCase();
  }
  $('account-name').textContent = user.name || user.email?.split('@')[0] || 'Account';
  
  // Load brand settings
  chrome.storage.local.get('brandSettings', (data) => {
    if (data.brandSettings) {
      $('brand-name').value = data.brandSettings.name || 'Ahmad Asri Photography';
      $('brand-color').value = data.brandColor || '#1D1D1F';
      $('brand-color-text').value = data.brandColor || '#1D1D1F';
      $('brand-watermark').value = data.brandSettings.watermark || 'bottom-right';
    }
  });
}

function doLogin() {
  showLoading('Login ke Google...');
  chrome.runtime.sendMessage({ type: 'LOGIN' }, (resp) => {
    hideLoading();
    if (resp?.success) {
      showApp(resp.user);
      toast('Login berhasil');
    } else {
      showError(resp?.error || 'Login gagal');
    }
  });
}

function doLogout() {
  chrome.runtime.sendMessage({ type: 'LOGOUT' }, () => {
    showLogin();
    toggleDropdown(false);
    toast('Logged out');
  });
}

// ─── Account Dropdown ──────────────────────────────────────────────

function toggleDropdown(show) {
  const dropdown = $('account-dropdown');
  if (show === undefined) {
    dropdown.classList.toggle('show');
  } else {
    dropdown.classList.toggle('show', show);
  }
  
  if (dropdown.classList.contains('show')) {
    renderAccountList();
  }
}

function renderAccountList() {
  chrome.runtime.sendMessage({ type: 'GET_ACCOUNTS' }, (resp) => {
    const list = $('account-list');
    list.innerHTML = '';
    
    const accounts = resp.accounts || {};
    const active = resp.activeAccount;
    
    for (const [email, acc] of Object.entries(accounts)) {
      const isActive = email === active;
      const item = document.createElement('div');
      item.className = `account-item${isActive ? ' active' : ''}`;
      item.innerHTML = `
        ${acc.picture 
          ? `<img class="account-avatar" src="${acc.picture}">` 
          : `<div class="account-avatar-placeholder">${(acc.name || email)[0].toUpperCase()}</div>`}
        <div class="account-item-info">
          <div class="account-item-name">${esc(acc.name || email.split('@')[0])}</div>
          <div class="account-item-email">${esc(email)}</div>
        </div>
        ${isActive ? '<svg class="account-item-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
      `;
      
      if (!isActive) {
        item.addEventListener('click', () => {
          chrome.runtime.sendMessage({ type: 'SWITCH_ACCOUNT', email }, () => {
            showApp(acc);
            toggleDropdown(false);
            toast(`Switched to ${acc.name || email}`);
          });
        });
      }
      
      list.appendChild(item);
    }
  });
}

// ─── Photo Upload ──────────────────────────────────────────────────

function handlePhoto(file) {
  if (!file || !file.type.startsWith('image/')) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    currentPhoto = e.target.result; // base64 data URL
    
    const upload = $('photo-upload');
    upload.classList.add('has-photo');
    upload.innerHTML = `
      <img class="photo-preview" src="${currentPhoto}">
      <div class="photo-preview-actions">
        <button class="btn-small btn-outline" id="btn-change-photo">Ganti Foto</button>
        <button class="btn-small btn-danger-outline" id="btn-remove-photo">Hapus</button>
      </div>
    `;
    
    $('btn-change-photo').addEventListener('click', (e) => {
      e.stopPropagation();
      $('photo-input').click();
    });
    
    $('btn-remove-photo').addEventListener('click', (e) => {
      e.stopPropagation();
      removePhoto();
    });
  };
  reader.readAsDataURL(file);
}

function removePhoto() {
  currentPhoto = null;
  const upload = $('photo-upload');
  upload.classList.remove('has-photo');
  upload.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
    <div class="photo-upload-text">Upload foto interior</div>
    <div class="photo-upload-hint">Drag & drop atau klik untuk pilih</div>
    <input type="file" id="photo-input" accept="image/*" style="display:none">
  `;
  setupPhotoInput();
}

function setupPhotoInput() {
  const input = $('photo-input');
  if (input) {
    input.addEventListener('change', (e) => {
      if (e.target.files[0]) handlePhoto(e.target.files[0]);
    });
  }
}

// ─── Generate Caption ──────────────────────────────────────────────

async function generateCaption() {
  if (!currentPhoto) {
    showError('Upload foto terlebih dahulu');
    return;
  }
  
  const context = {
    businessType: $('business-type').value,
    businessName: $('business-name').value,
    location: $('location').value,
    tone: currentTone
  };
  
  showLoading('AI sedang membuat caption...');
  
  chrome.runtime.sendMessage({
    type: 'GENERATE_CAPTION',
    imageBase64: currentPhoto.split(',')[1], // remove data:image/jpeg;base64, prefix
    context
  }, (resp) => {
    hideLoading();
    
    if (resp?.success) {
      parseCaptionResults(resp.result);
    } else {
      showError(resp?.error || 'Gagal generate caption');
    }
  });
}

function parseCaptionResults(text) {
  captionResults = [];
  let hashtags = '';
  
  // Parse variations
  const variations = text.split(/===VARIASI \d+===/).filter(v => v.trim());
  
  for (const v of variations) {
    const parts = v.split(/===HASHTAG===/);
    captionResults.push(parts[0].trim());
    if (parts[1]) hashtags = parts[1].trim();
  }
  
  // If no hashtag section found in last variation, try to find it separately
  if (!hashtags) {
    const hashtagMatch = text.match(/===HASHTAG===\s*([\s\S]*?)$/);
    if (hashtagMatch) hashtags = hashtagMatch[1].trim();
  }
  
  // If still no structured results, use raw text
  if (captionResults.length === 0) {
    captionResults = [text];
  }
  
  renderCaptionResults(hashtags);
}

function renderCaptionResults(hashtags) {
  const container = $('caption-cards');
  container.innerHTML = '';
  
  const labels = ['Variasi 1 — Profesional', 'Variasi 2 — Casual', 'Variasi 3 — Engaging'];
  
  captionResults.forEach((caption, i) => {
    const card = document.createElement('div');
    card.className = 'caption-card';
    card.innerHTML = `
      <div class="caption-card-header">
        <span class="caption-card-label">${labels[i] || `Variasi ${i+1}`}</span>
        <button class="btn-copy" data-index="${i}">Copy</button>
      </div>
      <div class="caption-text">${esc(caption)}</div>
    `;
    container.appendChild(card);
  });
  
  // Hashtags
  if (hashtags) {
    const section = $('hashtag-section');
    section.style.display = 'block';
    
    const chips = $('hashtag-chips');
    chips.innerHTML = '';
    
    const tags = hashtags.match(/#[\w\u00C0-\u024F]+/g) || hashtags.split(/\s+/).filter(t => t);
    tags.forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'hashtag-chip';
      chip.textContent = tag.startsWith('#') ? tag : `#${tag}`;
      chips.appendChild(chip);
    });
    
    // Store for copy
    $('btn-copy-hashtags').dataset.tags = tags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ');
  }
  
  $('caption-results').classList.add('visible');
}

// ─── Generate Design ───────────────────────────────────────────────

async function generateDesign() {
  if (!currentPhoto) {
    showError('Upload foto terlebih dahulu di tab Caption');
    return;
  }
  
  const context = {
    platform: currentPlatform,
    template: currentTemplate,
    businessName: $('business-name')?.value || '',
    brandName: $('brand-name').value,
    brandColor: $('brand-color').value
  };
  
  showLoading('AI sedang membuat desain...');
  
  chrome.runtime.sendMessage({
    type: 'GENERATE_DESIGN',
    imageBase64: currentPhoto.split(',')[1],
    context
  }, (resp) => {
    hideLoading();
    
    if (resp?.success) {
      try {
        const designData = JSON.parse(resp.result.replace(/```json\n?|\n?```/g, ''));
        renderDesign(designData);
      } catch (e) {
        // If not valid JSON, render with defaults
        renderDesign({
          title: context.businessName || 'Interior Design',
          subtitle: 'Profesional Photography',
          textPosition: 'bottom',
          overlayColor: context.brandColor,
          overlayOpacity: 0.6,
          fontStyle: 'bold',
          suggestedCaption: '',
          cta: ''
        });
      }
    } else {
      showError(resp?.error || 'Gagal generate desain');
    }
  });
}

function renderDesign(data) {
  const canvas = $('design-canvas');
  const ctx = canvas.getContext('2d');
  
  // Get platform dimensions
  const dims = getPlatformDimensions(currentPlatform);
  canvas.width = dims.w;
  canvas.height = dims.h;
  
  // Draw photo
  const img = new Image();
  img.onload = () => {
    // Cover fit
    const imgRatio = img.width / img.height;
    const canvasRatio = canvas.width / canvas.height;
    
    let sx, sy, sw, sh;
    if (imgRatio > canvasRatio) {
      sh = img.height;
      sw = sh * canvasRatio;
      sx = (img.width - sw) / 2;
      sy = 0;
    } else {
      sw = img.width;
      sh = sw / canvasRatio;
      sx = 0;
      sy = (img.height - sh) / 2;
    }
    
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    
    // Apply template
    applyTemplate(ctx, canvas, data);
  };
  img.src = currentPhoto;
}

function applyTemplate(ctx, canvas, data) {
  const { width: w, height: h } = canvas;
  const overlayColor = data.overlayColor || $('brand-color').value || '#1D1D1F';
  const opacity = data.overlayOpacity || 0.6;
  
  if (currentTemplate === 'minimal') {
    // Bottom gradient overlay
    const gradient = ctx.createLinearGradient(0, h * 0.6, 0, h);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${opacity})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    
    // Text
    ctx.fillStyle = 'white';
    ctx.font = `bold ${Math.round(w * 0.04)}px -apple-system, sans-serif`;
    ctx.fillText(data.title || '', w * 0.06, h * 0.85);
    
    ctx.font = `${Math.round(w * 0.025)}px -apple-system, sans-serif`;
    ctx.globalAlpha = 0.8;
    ctx.fillText(data.subtitle || '', w * 0.06, h * 0.9);
    ctx.globalAlpha = 1;
    
  } else if (currentTemplate === 'split') {
    // Right panel
    ctx.fillStyle = overlayColor;
    ctx.globalAlpha = 0.95;
    ctx.fillRect(w * 0.55, 0, w * 0.45, h);
    ctx.globalAlpha = 1;
    
    // Text on right panel
    ctx.fillStyle = 'white';
    ctx.font = `bold ${Math.round(w * 0.04)}px -apple-system, sans-serif`;
    wrapText(ctx, data.title || '', w * 0.62, h * 0.4, w * 0.32, Math.round(w * 0.05));
    
  } else if (currentTemplate === 'story') {
    // Full bottom area
    ctx.fillStyle = overlayColor;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(0, h * 0.55, w, h * 0.45);
    ctx.globalAlpha = 1;
    
    // Text
    ctx.fillStyle = 'white';
    ctx.font = `bold ${Math.round(w * 0.05)}px -apple-system, sans-serif`;
    wrapText(ctx, data.title || '', w * 0.08, h * 0.7, w * 0.84, Math.round(w * 0.06));
    
    ctx.font = `${Math.round(w * 0.03)}px -apple-system, sans-serif`;
    ctx.globalAlpha = 0.8;
    ctx.fillText(data.subtitle || '', w * 0.08, h * 0.85);
    ctx.globalAlpha = 1;
  }
  
  // Brand watermark
  const watermarkPos = $('brand-watermark').value;
  if (watermarkPos !== 'none') {
    const brandName = $('brand-name').value;
    ctx.font = `600 ${Math.round(w * 0.02)}px -apple-system, sans-serif`;
    ctx.fillStyle = 'white';
    ctx.globalAlpha = 0.6;
    
    const textW = ctx.measureText(brandName).width;
    const padding = w * 0.04;
    
    let tx, ty;
    if (watermarkPos === 'bottom-right') { tx = w - textW - padding; ty = h - padding; }
    else if (watermarkPos === 'bottom-left') { tx = padding; ty = h - padding; }
    else if (watermarkPos === 'top-right') { tx = w - textW - padding; ty = padding + Math.round(w * 0.02); }
    
    ctx.fillText(brandName, tx, ty);
    ctx.globalAlpha = 1;
  }
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let currentY = y;
  
  for (const word of words) {
    const testLine = line + word + ' ';
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line.trim(), x, currentY);
      line = word + ' ';
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), x, currentY);
}

function getPlatformDimensions(platform) {
  const dims = {
    'instagram-post': { w: 1080, h: 1080 },
    'instagram-story': { w: 1080, h: 1920 },
    'tiktok': { w: 1080, h: 1920 },
    'facebook': { w: 1200, h: 630 }
  };
  return dims[platform] || dims['instagram-post'];
}

function downloadDesign() {
  const canvas = $('design-canvas');
  const link = document.createElement('a');
  link.download = `design_${currentPlatform}_${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  toast('Design downloaded');
}

// ─── UI Helpers ────────────────────────────────────────────────────

function showLoading(text) {
  $('loading-text').textContent = text || 'Loading...';
  $('loading').classList.add('visible');
}

function hideLoading() {
  $('loading').classList.remove('visible');
}

function showError(msg) {
  const banner = $('error-banner');
  banner.textContent = msg;
  banner.classList.add('visible');
  setTimeout(() => banner.classList.remove('visible'), 5000);
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    toast('Copied!');
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast('Copied!');
  });
}

// ─── Event Setup ───────────────────────────────────────────────────

function setupEvents() {
  // Login
  $('btn-login').addEventListener('click', doLogin);
  
  // Account
  $('account-chip').addEventListener('click', () => toggleDropdown());
  $('btn-add-account').addEventListener('click', () => {
    toggleDropdown(false);
    doLogin();
  });
  $('btn-logout').addEventListener('click', doLogout);
  
  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#account-chip') && !e.target.closest('#account-dropdown')) {
      toggleDropdown(false);
    }
  });
  
  // Tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      $(`panel-${tab.dataset.tab}`).classList.add('active');
    });
  });
  
  // Photo upload
  $('photo-upload').addEventListener('click', () => {
    if (!$('photo-upload').classList.contains('has-photo')) {
      $('photo-input').click();
    }
  });
  setupPhotoInput();
  
  // Drag and drop
  $('photo-upload').addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  $('photo-upload').addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files[0]) handlePhoto(e.dataTransfer.files[0]);
  });
  
  // Tone chips
  document.querySelectorAll('.tone-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.tone-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentTone = chip.dataset.tone;
    });
  });
  
  // Platform chips
  document.querySelectorAll('.platform-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.platform-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentPlatform = chip.dataset.platform;
    });
  });
  
  // Template options
  document.querySelectorAll('.template-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.template-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      currentTemplate = opt.dataset.template;
    });
  });
  
  // Generate buttons
  $('btn-generate-caption').addEventListener('click', generateCaption);
  $('btn-generate-design').addEventListener('click', generateDesign);
  $('btn-download-design').addEventListener('click', downloadDesign);
  
  // Copy buttons (delegated)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-copy');
    if (!btn) return;
    
    if (btn.id === 'btn-copy-hashtags') {
      copyText(btn.dataset.tags);
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
      return;
    }
    
    const index = parseInt(btn.dataset.index);
    if (!isNaN(index) && captionResults[index]) {
      copyText(captionResults[index]);
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
    }
  });
  
  // Brand color sync
  $('brand-color').addEventListener('input', (e) => {
    $('brand-color-text').value = e.target.value;
  });
  $('brand-color-text').addEventListener('change', (e) => {
    $('brand-color').value = e.target.value;
  });
  
  // Brand settings save
  $('brand-name').addEventListener('change', saveBrandSettings);
  $('brand-color').addEventListener('change', saveBrandSettings);
  $('brand-watermark').addEventListener('change', saveBrandSettings);
}

function saveBrandSettings() {
  chrome.storage.local.set({
    brandSettings: {
      name: $('brand-name').value,
      watermark: $('brand-watermark').value
    },
    brandColor: $('brand-color').value
  });
}

// ─── Start ─────────────────────────────────────────────────────────

init();
