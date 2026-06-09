# AI Content Planner Chrome Extension

AI-powered social media content planner Chrome Extension for interior photographers. Generate captions and designs using Gemini Pro subscription.

## Features

- Google OAuth login (same as agy - uses Gemini Pro subscription)
- AI caption generator with 3 tone variants (Professional, Casual, Engaging)
- AI design generator with 3 templates (Minimal, Split, Story)
- Auto-resize for Instagram Post, Instagram Story, TikTok, Facebook
- Auto-hashtag suggestion for interior photography Indonesia
- Multi-account support (switch between Google accounts)
- Brand settings (name, logo, colors, watermark)
- Copy caption, download design as PNG
- Apple-style UI (light theme, no AI slop)

## Install

1. Clone this repo
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the `ai-content-planner` folder

## Usage

1. Click extension icon → Side panel opens
2. Click "Login with Google" → Select Gemini Pro account
3. Upload interior photo
4. Select property type (hotel/villa/restaurant/cafe)
5. Select tone (Professional/Casual/Engaging)
6. Click Generate → 3 caption variants + hashtag suggestions
7. Copy caption or download design

## Tech

- Chrome Extension Manifest V3
- Google OAuth via `chrome.identity`
- Gemini API for AI generation
- Canvas API for design composition
- No external dependencies
