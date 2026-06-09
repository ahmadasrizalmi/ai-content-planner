// AI Content Planner — Background Service Worker
// Handles Google OAuth + Gemini API calls

const CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'openid'
];

// ─── OAuth ────────────────────────────────────────────────────────

async function getAuthToken(interactive = true) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(token);
      }
    });
  });
}

async function getUserInfo(token) {
  const resp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!resp.ok) throw new Error('Failed to get user info');
  return resp.json();
}

// ─── Gemini API ───────────────────────────────────────────────────

async function callGemini(token, prompt, imageBase64 = null) {
  const parts = [{ text: prompt }];
  
  if (imageBase64) {
    parts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: imageBase64
      }
    });
  }
  
  const body = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 2048
    }
  };
  
  // Try endpoints in order
  const endpoints = [
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent'
  ];
  
  for (const endpoint of endpoints) {
    try {
      const resp = await fetch(`${endpoint}?key=`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      
      if (resp.ok) {
        const data = await resp.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }
      
      // If 429 (quota), try next endpoint
      if (resp.status === 429) continue;
      
      const err = await resp.text();
      throw new Error(`API error ${resp.status}: ${err}`);
    } catch (e) {
      if (e.message.includes('API error')) throw e;
      continue;
    }
  }
  
  throw new Error('All Gemini endpoints failed');
}

// ─── Message Handler ──────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'LOGIN') {
    (async () => {
      try {
        const token = await getAuthToken(true);
        const user = await getUserInfo(token);
        
        // Save account
        const accounts = await chrome.storage.local.get('accounts');
        const all = accounts.accounts || {};
        all[user.email] = {
          email: user.email,
          name: user.name,
          picture: user.picture,
          token: token,
          addedAt: new Date().toISOString()
        };
        await chrome.storage.local.set({ 
          accounts: all,
          activeAccount: user.email 
        });
        
        sendResponse({ success: true, user });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }
  
  if (msg.type === 'LOGOUT') {
    (async () => {
      try {
        const token = await getAuthToken(false);
        if (token) {
          chrome.identity.removeCachedAuthToken({ token });
        }
        const accounts = await chrome.storage.local.get(['accounts', 'activeAccount']);
        const all = accounts.accounts || {};
        const email = accounts.activeAccount;
        if (email && all[email]) {
          delete all[email];
        }
        await chrome.storage.local.set({ 
          accounts: all,
          activeAccount: null 
        });
        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }
  
  if (msg.type === 'GET_ACCOUNTS') {
    (async () => {
      const data = await chrome.storage.local.get(['accounts', 'activeAccount']);
      sendResponse({ 
        accounts: data.accounts || {}, 
        activeAccount: data.activeAccount || null 
      });
    })();
    return true;
  }
  
  if (msg.type === 'SWITCH_ACCOUNT') {
    (async () => {
      await chrome.storage.local.set({ activeAccount: msg.email });
      sendResponse({ success: true });
    })();
    return true;
  }
  
  if (msg.type === 'GENERATE_CAPTION') {
    (async () => {
      try {
        const accounts = await chrome.storage.local.get(['accounts', 'activeAccount']);
        const email = accounts.activeAccount;
        if (!email || !accounts.accounts?.[email]) {
          throw new Error('Please login first');
        }
        
        const token = accounts.accounts[email].token;
        const prompt = buildCaptionPrompt(msg.context);
        const result = await callGemini(token, prompt, msg.imageBase64);
        
        sendResponse({ success: true, result });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }
  
  if (msg.type === 'GENERATE_DESIGN') {
    (async () => {
      try {
        const accounts = await chrome.storage.local.get(['accounts', 'activeAccount']);
        const email = accounts.activeAccount;
        if (!email || !accounts.accounts?.[email]) {
          throw new Error('Please login first');
        }
        
        const token = accounts.accounts[email].token;
        const prompt = buildDesignPrompt(msg.context);
        const result = await callGemini(token, prompt, msg.imageBase64);
        
        sendResponse({ success: true, result });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }
});

// ─── Prompt Builders ──────────────────────────────────────────────

function buildCaptionPrompt(ctx) {
  const toneMap = {
    professional: 'profesional dan formal, cocok untuk klien corporate',
    casual: 'santai dan friendly, cocok untuk audience umum',
    engaging: 'menarik dan interaktif, pakai pertanyaan untuk boost engagement'
  };
  
  return `Kamu adalah social media manager expert untuk fotografer interior di Yogyakarta, Indonesia.

Foto ini adalah hasil fotografi interior untuk: ${ctx.businessType || 'properti'}
${ctx.businessName ? `Nama bisnis: ${ctx.businessName}` : ''}
${ctx.location ? `Lokasi: ${ctx.location}` : ''}

Buatkan 3 variasi caption Instagram dengan tone ${toneMap[ctx.tone] || toneMap.profesional}:

FORMAT OUTPUT (WAJIB IKUTI):
===VARIASI 1===
[caption lengkap dengan emoji, maksimal 2200 karakter]

===VARIASI 2===
[caption lengkap dengan emoji, angle berbeda]

===VARIASI 3===
[caption lengkap dengan emoji, angle berbeda]

===HASHTAG===
[10-15 hashtag relevan, pisahkan dengan spasi]

ATURAN:
- Gunakan bahasa Indonesia yang natural
- Maksimal 3 emoji per caption
- Sertakan call-to-action
- Fokuskan pada value fotografi interior profesional
- Jangan gunakan hashtag di dalam caption, pisahkan di section HASHTAG`;
}

function buildDesignPrompt(ctx) {
  return `Kamu adalah desainer grafis untuk social media fotografer interior.

Foto ini akan dijadikan post ${ctx.platform || 'Instagram'} dengan template "${ctx.template || 'minimal'}".

Buatkan rekomendasi desain dalam format JSON:
{
  "title": "judul pendek yang eye-catching",
  "subtitle": "subtitle yang mendukung",
  "textPosition": "bottom|top|center|left",
  "overlayColor": "#hex color untuk text overlay",
  "overlayOpacity": 0.3-0.8,
  "fontStyle": "bold|elegant|modern",
  "suggestedCaption": "caption singkat untuk overlay (max 10 kata)",
  "cta": "call to action text"
}

Gunakan warna yang kontras dengan foto. Prioritaskan readability.`;
}

// ─── Open Side Panel ──────────────────────────────────────────────

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

console.log('[AI Content Planner] Background loaded');
