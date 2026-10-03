/**
 * clara.js — Clara AI embeddable widget v3
 * ─────────────────────────────────────────────────────────────────────────────
 * Three modes controlled by server config (widgetMode):
 *
 *   floating  (default) — FAB button + slide-up panel, Shadow DOM isolated
 *   inline              — Full-page chat, used inside an <iframe>
 *   headless            — Zero DOM. Exposes window.ClaraSDK for custom UIs.
 *
 * Full design control:
 *   customCss          — Injected into Shadow DOM after default styles
 *   customLauncherSvg  — Replaces the default chat-bubble FAB icon
 *   customHeaderHtml   — Appended inside the widget header bar
 *   customPoweredBy    — Override or hide the branding footer text
 *
 * Script-tag attributes (fallbacks if server config doesn't override):
 *   data-key       (required) API key starting with clr_
 *   data-position  bottom-right | bottom-left
 *   data-theme     light | dark
 *   data-mode      floating | inline | headless
 */
(function () {
  'use strict';

  /* ── 1. Bootstrap ─────────────────────────────────────────────────────────── */
  var scriptEl = document.currentScript;
  if (!scriptEl) {
    var all = document.querySelectorAll('script');
    for (var si = all.length - 1; si >= 0; si--) {
      if ((all[si].src || '').indexOf('clara.js') !== -1) { scriptEl = all[si]; break; }
    }
  }
  if (!scriptEl) return;

  var API_KEY        = (scriptEl.getAttribute('data-key')      || '').trim();
  var FALLBACK_POS   = (scriptEl.getAttribute('data-position') || 'bottom-right').trim();
  var FALLBACK_THEME = (scriptEl.getAttribute('data-theme')    || 'light').trim();
  var FALLBACK_MODE  = (scriptEl.getAttribute('data-mode')     || 'floating').trim();
  if (!API_KEY) { console.warn('[Clara] data-key attribute is required'); return; }

  var BASE_URL   = (scriptEl.src || '').replace(/\/embed\/clara\.js[^]*$/, '');
  var FRAME_ORIGIN = (function() {
    try { return new URL(BASE_URL).origin; }
    catch (e) { return window.location.origin; }
  })();
  var SESSION_ID = 'cs_' + Math.random().toString(36).slice(2, 10);

  /* ── 2. Runtime state ────────────────────────────────────────────────────── */
  var cfg        = null;
  var isOpen     = false;
  var isThinking = false;
  var frameLoaded = false;
  var voiceOn    = false;
  var voiceState = 'idle';
  var history    = [];
  var refreshTimer = null;
  var frameCommandQueue = [];
  var $hostEl, $shellStyle, $frame, $launcherLabel;
  var $panel, $toggleBtn, $msgs, $textarea, $sendBtn, $voiceBtn;
  var voiceWs = null;
  var voicePeer = null;
  var voiceDataChannel = null;
  var voiceRemoteStream = null;
  var voiceRemoteAudioEl = null;
  var voiceMicStream = null;
  var voiceCaptureCtx = null;
  var voicePlaybackCtx = null;
  var voiceMicSource = null;
  var voiceWorklet = null;
  var voicePingTimer = null;
  var voiceNextPlayTime = 0;
  var voicePendingAssistantId = null;
  var voicePendingAssistantText = '';
  var voicePendingUserTranscript = '';
  var voiceSendQueue = [];
  var voiceStoppedManually = false;
  var voiceLastUserTranscript = '';

  /* ── 3. Utilities ────────────────────────────────────────────────────────── */
  function uid()     { return Math.random().toString(36).slice(2, 9); }
  function authHdr() { return { 'Authorization': 'Bearer ' + API_KEY, 'Content-Type': 'application/json' }; }
  function svg(i)    { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' + i + '</svg>'; }
  function base64ToInt16(b64) {
    var binary = atob(b64 || '');
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Int16Array(bytes.buffer);
  }

  /* ── 4. CSS builder ──────────────────────────────────────────────────────── */
  function buildCSS(c) {
    var primary  = c.primaryColour  || '#6366f1';
    var accent   = c.accentColour   || '#818cf8';
    var launcher = c.launcherColour || primary;
    var theme    = c.widgetTheme    || FALLBACK_THEME;
    var pos      = c.widgetPosition || FALLBACK_POS;
    var btnSize  = (c.widgetButtonSize  || 56) + 'px';
    var radius   = ((c.widgetBorderRadius !== undefined ? c.widgetBorderRadius : 20)) + 'px';
    var font     = c.widgetFontFamily || 'system-ui,sans-serif';
    var chatH    = (c.widgetChatHeight || 580) + 'px';
    var dark     = theme === 'dark';
    var bg       = dark ? '#1c1c2a' : '#ffffff';
    var surface  = dark ? '#27273b' : '#f5f5fb';
    var txt      = dark ? '#e2e2f0' : '#1a1a2e';
    var sub      = dark ? '#9898b8' : '#6b7280';
    var bdr      = dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';
    var right    = pos !== 'bottom-left';
    var css = [
      '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}',
      '#launcher{position:fixed;z-index:2147483647;bottom:24px;'+(right?'right:24px':'left:24px')+
        ';display:flex;flex-direction:column;align-items:'+(right?'flex-end':'flex-start')+';gap:8px}',
      '#tbtn{width:'+btnSize+';height:'+btnSize+';border-radius:50%;background:'+launcher+';'+
        'border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;'+
        'box-shadow:0 4px 20px rgba(0,0,0,0.28);transition:transform .2s,box-shadow .2s}',
      '#tbtn:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(0,0,0,0.36)}',
      '#tbtn svg{width:calc('+btnSize+' * 0.46);height:calc('+btnSize+' * 0.46);'+
        'fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
      '#launcher-lbl{font-family:'+font+';font-size:13px;font-weight:600;color:#fff;'+
        'background:'+launcher+';border-radius:20px;padding:6px 14px;cursor:pointer;'+
        'box-shadow:0 2px 10px rgba(0,0,0,0.22);transition:opacity .15s;white-space:nowrap}',
      '#launcher-lbl:hover{opacity:.88}',
      '#panel{width:380px;max-width:calc(100vw - 32px);height:'+chatH+';max-height:calc(100dvh - 100px);'+
        'border-radius:'+radius+';background:'+bg+';border:1px solid '+bdr+';'+
        'box-shadow:0 12px 48px rgba(0,0,0,0.24);display:flex;flex-direction:column;overflow:hidden;'+
        'transform:scale(0.88) translateY(20px);opacity:0;pointer-events:none;font-family:'+font+';'+
        'transform-origin:bottom '+(right?'right':'left')+';'+
        'transition:transform .28s cubic-bezier(.34,1.56,.64,1),opacity .2s}',
      '#panel.open{transform:scale(1) translateY(0);opacity:1;pointer-events:all}',
      '#hdr{padding:14px 16px;background:'+primary+';display:flex;align-items:center;gap:11px;flex-shrink:0}',
      '#av{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,0.22);'+
        'display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden}',
      '#av img{width:100%;height:100%;object-fit:cover}',
      '#av svg{width:17px;height:17px;stroke:#fff;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
      '#hn{font-size:14px;font-weight:600;color:#fff;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '#hdr-extra{display:flex;align-items:center;gap:6px}',
      '#cbtn{width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,0.18);border:none;cursor:pointer;'+
        'display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s}',
      '#cbtn:hover{background:rgba(255,255,255,0.3)}',
      '#cbtn svg{width:13px;height:13px;stroke:#fff;fill:none;stroke-width:2.5;stroke-linecap:round}',
      '#msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:9px;scroll-behavior:smooth}',
      '#msgs::-webkit-scrollbar{width:4px}',
      '#msgs::-webkit-scrollbar-thumb{background:'+bdr+';border-radius:2px}',
      '.m{max-width:84%;padding:9px 13px;border-radius:14px;font-size:13.5px;line-height:1.55;word-break:break-word;white-space:pre-wrap}',
      '.mu{align-self:flex-end;background:'+primary+';color:#fff;border-bottom-right-radius:3px}',
      '.ma{align-self:flex-start;background:'+surface+';color:'+txt+';border:1px solid '+bdr+';border-bottom-left-radius:3px}',
      '.mt{align-self:flex-start;background:'+surface+';border:1px solid '+bdr+';border-bottom-left-radius:3px;padding:12px 14px}',
      '.dots{display:inline-flex;gap:4px}',
      '.dots i{display:block;width:6px;height:6px;border-radius:50%;background:'+sub+';animation:bounce .85s infinite}',
      '.dots i:nth-child(2){animation-delay:.15s}.dots i:nth-child(3){animation-delay:.3s}',
      '@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}',
      '#irow{padding:10px 12px;border-top:1px solid '+bdr+';display:flex;gap:7px;align-items:flex-end;flex-shrink:0;background:'+bg+'}',
      '#itxt{flex:1;border:1.5px solid '+bdr+';border-radius:11px;padding:8px 11px;'+
        'font-size:13.5px;background:'+surface+';color:'+txt+';outline:none;resize:none;'+
        'max-height:88px;min-height:36px;line-height:1.45;font-family:'+font+'}',
      '#itxt:focus{border-color:'+accent+'}#itxt::placeholder{color:'+sub+'}',
      '.ibtn{width:34px;height:34px;border-radius:50%;border:none;cursor:pointer;flex-shrink:0;'+
        'display:flex;align-items:center;justify-content:center;transition:opacity .15s,background .15s}',
      '#sbtn{background:'+primary+'}#sbtn:disabled{opacity:.4;cursor:not-allowed}',
      '#sbtn svg{width:15px;height:15px;fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}',
      '#vbtn{background:'+surface+';border:1.5px solid '+bdr+'}',
      '#vbtn.von{background:#ef4444;border-color:#ef4444}',
      '#vbtn.vconnecting{background:'+accent+';border-color:'+accent+';animation:voicePulse 1.2s ease-in-out infinite}',
      '#vbtn.vlistening{background:'+primary+';border-color:'+primary+'}',
      '#vbtn.vspeaking{background:#10b981;border-color:#10b981;animation:voicePulse 1s ease-in-out infinite}',
      '#vbtn svg{width:15px;height:15px;fill:none;stroke:'+sub+';stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
      '#vbtn.von svg,#vbtn.vconnecting svg,#vbtn.vlistening svg,#vbtn.vspeaking svg{stroke:#fff}',
      '#pw{text-align:center;font-size:10px;color:'+sub+';padding:4px 0 9px;flex-shrink:0}',
      '#pw a{color:'+sub+';text-decoration:none}#pw a:hover{text-decoration:underline}',
      '@keyframes voicePulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}',
    ].join('\n');
    // Inject custom CSS AFTER defaults — overrides anything
    if (c.customCss) css += '\n/* === custom === */\n' + c.customCss;
    return css;
  }

  /* ── 5. SVG icons ────────────────────────────────────────────────────────── */
  var I_CHAT  = '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>';
  var I_CLOSE = '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>';
  var I_SEND  = '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>';
  var I_MIC   = '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>'+
                '<path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>'+
                '<line x1="8" y1="23" x2="16" y2="23"/>';
  var I_BOT   = '<rect x="3" y="11" width="18" height="10" rx="2"/>'+
                '<path d="M9 11V7a3 3 0 0 1 6 0v4"/>'+
                '<circle cx="9" cy="16" r="1" fill="currentColor" stroke="none"/>'+
                '<circle cx="15" cy="16" r="1" fill="currentColor" stroke="none"/>';
  var I_STOP  = '<rect x="6" y="6" width="12" height="12" rx="2"/>';

  /* ── 6. Message helpers ──────────────────────────────────────────────────── */
  function scrollBottom() { if ($msgs) $msgs.scrollTop = $msgs.scrollHeight; }

  function addMsg(role, text) {
    var id  = 'cm-' + uid();
    var div = document.createElement('div');
    div.id  = id;
    if (role === 'thinking') {
      div.className = 'm mt';
      div.innerHTML = '<div class="dots"><i></i><i></i><i></i></div>';
    } else {
      div.className = 'm ' + (role === 'user' ? 'mu' : 'ma');
      div.textContent = text || '';
    }
    $msgs.appendChild(div); scrollBottom(); return id;
  }

  function setMsg(id, text) {
    var el = $msgs.querySelector('#' + id);
    if (!el) return;
    el.className = 'm ma'; el.textContent = text; scrollBottom();
  }

  function addNote(text) {
    var div = document.createElement('div');
    div.style.cssText = 'font-size:11px;color:#9898b8;text-align:center;padding:2px 0';
    div.textContent = text; $msgs.appendChild(div); scrollBottom();
  }

  function setVoiceState(nextState) {
    voiceState = nextState || 'idle';
    voiceOn = voiceState !== 'idle';
    if ($voiceBtn) {
      $voiceBtn.classList.toggle('von', voiceOn);
      $voiceBtn.classList.toggle('vconnecting', voiceState === 'connecting');
      $voiceBtn.classList.toggle('vlistening', voiceState === 'connected' || voiceState === 'listening');
      $voiceBtn.classList.toggle('vspeaking', voiceState === 'speaking');
      $voiceBtn.setAttribute(
        'aria-label',
        voiceOn ? ('Stop voice (' + voiceState + ')') : 'Start voice'
      );
      $voiceBtn.setAttribute('title', voiceOn ? ('Voice: ' + voiceState) : 'Start voice');
      $voiceBtn.innerHTML = svg(voiceOn ? I_STOP : I_MIC);
    }
    _emit('voiceState', { state: voiceState, active: voiceOn });
    try {
      document.dispatchEvent(new CustomEvent('clara:voiceState', {
        detail: { state: voiceState, active: voiceOn }
      }));
    } catch (e) {}
  }

  /* ── 7. Streaming chat ───────────────────────────────────────────────────── */
  function sendMessage() {
    if (!$textarea) return;
    var text = $textarea.value.trim();
    if (!text || isThinking) return;
    $textarea.value = ''; $textarea.style.height = 'auto';
    history.push({ role: 'user', content: text });
    addMsg('user', text);
    isThinking = true; $sendBtn.disabled = true;
    if ($voiceBtn) $voiceBtn.disabled = true;
    var thinkId = addMsg('thinking', '');
    var accumulated = ''; var started = false;

    fetch(BASE_URL + '/api/embed/chat', {
      method: 'POST', headers: authHdr(),
      body: JSON.stringify({ messages: history.map(function(m){return{role:m.role,content:m.content};}), sessionId: SESSION_ID }),
    })
    .then(function(res) {
      if (!res.ok || !res.body) return res.json().then(function(d){throw new Error(d.error||('HTTP '+res.status));});
      var reader = res.body.getReader(); var decoder = new TextDecoder(); var buffer = '';
      function pump() {
        reader.read().then(function(chunk) {
          if (chunk.done) {
            if (!started) setMsg(thinkId, '(no response)');
            history.push({ role:'assistant', content:accumulated });
            isThinking = false; $sendBtn.disabled = false;
            if ($voiceBtn) $voiceBtn.disabled = false;
            // Emit to Headless SDK
            _emit('done', { text: accumulated });
            return;
          }
          buffer += decoder.decode(chunk.value, { stream: true });
          var lines = buffer.split('\n'); buffer = lines.pop();
          lines.forEach(function(line) {
            if (!line.trim()) return;
            try {
              var evt = JSON.parse(line);
              if (evt.type === 'token' && typeof evt.payload === 'string') {
                if (!started) { setMsg(thinkId, ''); started = true; }
                accumulated += evt.payload; setMsg(thinkId, accumulated);
                _emit('token', evt.payload);
              } else if (evt.type === 'sources') {
                _emit('sources', evt.payload);
              } else if (evt.type === 'error') {
                setMsg(thinkId, '\u26a0 ' + (evt.payload||'Error'));
                isThinking = false; $sendBtn.disabled = false;
                if ($voiceBtn) $voiceBtn.disabled = false;
              }
            } catch(e){}
          });
          pump();
        }).catch(function(err){
          setMsg(thinkId, '\u26a0 Connection lost: '+(err.message||'unknown'));
          isThinking = false; $sendBtn.disabled = false;
          if ($voiceBtn) $voiceBtn.disabled = false;
        });
      }
      pump();
    })
    .catch(function(err){
      setMsg(thinkId, '\u26a0 '+(err.message||'Failed to connect'));
      isThinking = false; $sendBtn.disabled = false;
      if ($voiceBtn) $voiceBtn.disabled = false;
    });
  }

  /* ── 8. Voice session ────────────────────────────────────────────────────── */
  function getVoiceRelayUrl() {
    var wsBase = BASE_URL.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
    return wsBase + '/api/embed/voice?key=' + encodeURIComponent(API_KEY);
  }

  function getVoiceProvider() {
    return cfg && cfg.voiceProvider === 'gemini' ? 'gemini' : 'openai';
  }

  /* Providers the WS relay can serve today. ElevenLabs voice-chat runs on
   * Clara's own Mode A endpoints, which the relay cannot bridge yet — the
   * iframe surfaces (/embed/voice + /embed/widget) carry it instead. */
  function isRelaySupportedVoiceProvider() {
    var p = cfg && cfg.voiceProvider;
    return p === 'openai' || p === 'gemini' || !p;
  }

  function voiceSendJson(payload) {
    var msg = JSON.stringify(payload);
    var dc = voiceDataChannel;
    if (dc && dc.readyState === 'open') {
      try {
        dc.send(msg);
        return true;
      } catch (e) {}
    }
    voiceSendQueue.push(msg);
    return false;
  }

  function flushVoiceAssistantTurn() {
    if (voicePendingAssistantText.trim()) {
      history.push({ role: 'assistant', content: voicePendingAssistantText });
    }
    voicePendingAssistantId = null;
    voicePendingAssistantText = '';
  }

  function appendVoiceAssistantDelta(delta) {
    if (!delta) return;
    if (!voicePendingAssistantId) {
      voicePendingAssistantId = addMsg('assistant', '');
      voicePendingAssistantText = '';
    }
    voicePendingAssistantText += delta;
    setMsg(voicePendingAssistantId, voicePendingAssistantText);
    _emit('voiceTranscript', { role: 'assistant', text: voicePendingAssistantText, delta: delta });
  }

  function addVoiceUserTranscript(text) {
    if (!text || !text.trim()) return;
    history.push({ role: 'user', content: text });
    addMsg('user', text);
    _emit('voiceTranscript', { role: 'user', text: text });
  }

  function createVoiceRemoteAudioEl() {
    if (voiceRemoteAudioEl) return voiceRemoteAudioEl;
    var audio = document.createElement('audio');
    audio.autoplay = true;
    audio.playsInline = true;
    audio.style.display = 'none';
    document.body.appendChild(audio);
    voiceRemoteAudioEl = audio;
    return audio;
  }

  function waitForIceGathering(pc) {
    if (!pc || pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise(function(resolve) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        pc.removeEventListener('icegatheringstatechange', onStateChange);
        resolve();
      }
      function onStateChange() {
        if (pc.iceGatheringState === 'complete') finish();
      }
      pc.addEventListener('icegatheringstatechange', onStateChange);
      if (pc.iceGatheringState === 'complete') {
        finish();
        return;
      }
      setTimeout(finish, 8000);
    });
  }

  function runVoiceRagAndRespond(query) {
    var trimmed = (query || '').trim();
    if (!trimmed || trimmed === voiceLastUserTranscript) return;
    voiceLastUserTranscript = trimmed;
    addVoiceUserTranscript(trimmed);

    fetch(BASE_URL + '/api/embed/search', {
      method: 'POST',
      headers: authHdr(),
      body: JSON.stringify({ query: trimmed, limit: 6 })
    })
    .then(function(res) {
      if (!res.ok) return res.json().then(function(d){ throw new Error(d.error || ('HTTP ' + res.status)); });
      return res.json();
    })
    .then(function(payload) {
      var context = payload && typeof payload.context === 'string' ? payload.context.trim() : '';
      if (context) {
        voiceSendJson({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'system',
            content: [{ type: 'input_text', text: 'Context from knowledge base:\n' + context }]
          }
        });
      }

      voiceSendJson({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Customer question:\n' + trimmed }]
        }
      });

      voiceSendJson({
        type: 'response.create',
        response: {
          instructions: 'Answer the customer clearly and concisely using the provided knowledge base context when relevant.',
          tool_choice: 'none'
        }
      });
    })
    .catch(function(err) {
      voiceSendJson({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: trimmed }]
        }
      });
      voiceSendJson({
        type: 'response.create',
        response: {
          instructions: 'Answer the customer clearly and concisely.',
          tool_choice: 'none'
        }
      });
      _emit('voiceError', { message: (err && err.message) || 'Voice search failed' });
    });
  }

  function startOpenAIVoiceRuntime() {
    var mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : null;
    var RTC = window.RTCPeerConnection;
    if (voicePeer && voiceDataChannel && voiceDataChannel.readyState === 'open') {
      return Promise.resolve({ transport: 'webrtc-sdp-proxy', status: voiceState || 'connected' });
    }
    if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
      return Promise.reject(new Error('Microphone access is unavailable in this browser.'));
    }
    if (!RTC) {
      return Promise.reject(new Error('Live voice is unavailable in this browser.'));
    }

    setVoiceState('connecting');
    voiceStoppedManually = false;
    voiceLastUserTranscript = '';
    voicePendingUserTranscript = '';

    return mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      }
    }).then(function(mic) {
      voiceMicStream = mic;
      var pc = new RTC({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      voicePeer = pc;
      voiceRemoteStream = new MediaStream();

      pc.ontrack = function(event) {
        var incoming = event.streams && event.streams[0];
        if (!incoming) return;
        incoming.getTracks().forEach(function(track) {
          if (!voiceRemoteStream.getTracks().includes(track)) {
            voiceRemoteStream.addTrack(track);
          }
        });
        var audioEl = createVoiceRemoteAudioEl();
        audioEl.srcObject = voiceRemoteStream;
        audioEl.muted = false;
        audioEl.play().catch(function(){});
      };

      var dc = pc.createDataChannel('oai-events');
      voiceDataChannel = dc;

      return new Promise(function(resolve, reject) {
        var settled = false;
        function resolveSession() {
          if (settled) return;
          settled = true;
          resolve({ transport: 'webrtc-sdp-proxy', status: 'connected' });
        }
        function rejectSession(err) {
          if (settled) return;
          settled = true;
          reject(err);
        }

        dc.onopen = function() {
          // CRITICAL: include transcription config so OpenAI transcribes
          // user speech and sends conversation.item.input_audio_transcription.completed.
          // Without this, session.update may reset transcription to disabled,
          // causing the AI to receive audio but never fire transcription events.
          voiceSendJson({
            type: 'session.update',
            session: {
              instructions: 'You are Clara, a helpful voice assistant for this knowledge base. Answer naturally, briefly, and use provided knowledge base context when it is available.',
              tools: [{
                type: 'function',
                name: 'rag_search',
                description: 'Search the active knowledge base for relevant information.',
                parameters: {
                  type: 'object',
                  properties: { query: { type: 'string' } },
                  required: ['query']
                }
              }],
              tool_choice: 'auto',
              type: 'realtime',
              output_modalities: ['audio'],
              audio: {
                input: {
                  // Explicit transcription config so the update never
                  // accidentally disables speech transcripts.
                  transcription: {
                    model: 'gpt-4o-mini-transcribe',
                  },
                  turn_detection: {
                    type: 'server_vad',
                    threshold: 0.4,           // slightly more sensitive than 0.5
                    prefix_padding_ms: 300,
                    silence_duration_ms: 700,  // 700ms pause = end of utterance
                    create_response: false,    // we drive response.create manually
                  },
                },
              },
            }
          });

          var queued = voiceSendQueue;
          voiceSendQueue = [];
          for (var i = 0; i < queued.length; i++) {
            try { dc.send(queued[i]); } catch (e) {}
          }

          setVoiceState('connected');
          resolveSession();
        };

        dc.onclose = function() {
          var manual = voiceStoppedManually;
          releaseVoiceRuntime(false);
          setVoiceState('idle');
          if (!manual) {
            rejectSession(new Error('Voice connection closed'));
            addNote('\u26a0 Voice connection closed');
            _emit('voiceEnd', {});
          }
          voiceStoppedManually = false;
        };

        dc.onmessage = function(event) {
          var msg;
          try { msg = JSON.parse(event.data); } catch (e) { return; }
          if (!msg || !msg.type) return;

          if (msg.type === 'input_audio_buffer.speech_started') {
            if (voiceState === 'speaking') voiceSendJson({ type: 'response.cancel' });
            setVoiceState('listening');
            voiceLastUserTranscript = '';
            voicePendingUserTranscript = '';
            return;
          }

          if (msg.type === 'conversation.item.input_audio_transcription.delta') {
            var userDelta = typeof msg.delta === 'string' ? msg.delta : '';
            if (userDelta) voicePendingUserTranscript += userDelta;
            return;
          }

          if (msg.type === 'conversation.item.input_audio_transcription.completed') {
            var userText = typeof msg.transcript === 'string' && msg.transcript.trim()
              ? msg.transcript.trim()
              : voicePendingUserTranscript.trim();
            voicePendingUserTranscript = '';
            if (userText) runVoiceRagAndRespond(userText);
            return;
          }

          if (msg.type === 'response.created') {
            setVoiceState('speaking');
            return;
          }

          // GA names (response.output_*) first; beta names kept for older models.
          if (msg.type === 'response.output_audio_transcript.delta' || msg.type === 'response.output_text.delta' ||
              msg.type === 'response.audio_transcript.delta' || msg.type === 'response.text.delta') {
            appendVoiceAssistantDelta(typeof msg.delta === 'string' ? msg.delta : '');
            setVoiceState('speaking');
            return;
          }

          if (msg.type === 'response.done') {
            flushVoiceAssistantTurn();
            setVoiceState('listening');
            return;
          }

          // Handle rag_search tool call if the model calls it autonomously.
          // Without this, the model waits forever for a tool response.
          if (msg.type === 'response.function_call_arguments.done') {
            var callId = typeof msg.call_id === 'string' ? msg.call_id : '';
            var fnName  = typeof msg.name    === 'string' ? msg.name    : '';
            if (fnName === 'rag_search' && callId) {
              var fnArgs = {};
              try { fnArgs = JSON.parse(typeof msg.arguments === 'string' ? msg.arguments : '{}'); } catch(e) {}
              var q = (typeof fnArgs.query === 'string' ? fnArgs.query : '').trim() || voiceLastUserTranscript;
              fetch(BASE_URL + '/api/embed/search', {
                method: 'POST', headers: authHdr(),
                body: JSON.stringify({ query: q, limit: 6 })
              })
              .then(function(r){ return r.ok ? r.json() : { context: '', sources: [] }; })
              .then(function(p){
                voiceSendJson({ type: 'conversation.item.create', item: {
                  type: 'function_call_output', call_id: callId,
                  output: JSON.stringify({ context: p.context || '', sources: p.sources || [] })
                }});
                voiceSendJson({ type: 'response.create', response: { tool_choice: 'none' } });
              })
              .catch(function(){
                voiceSendJson({ type: 'conversation.item.create', item: {
                  type: 'function_call_output', call_id: callId,
                  output: JSON.stringify({ error: 'search failed' })
                }});
                voiceSendJson({ type: 'response.create', response: { tool_choice: 'none' } });
              });
            }
            return;
          }

          if (msg.type === 'error') {
            rejectSession(new Error((msg.error && msg.error.message) || msg.message || 'Voice connection failed'));
          }
        };

        pc.addTrack(mic.getAudioTracks()[0], mic);

        pc.createOffer()
          .then(function(offer) {
            return pc.setLocalDescription(offer).then(function() { return offer; });
          })
          .then(function(offer) {
            return waitForIceGathering(pc).then(function() { return offer; });
          })
          .then(function(offer) {
            var sdpOffer = (pc.localDescription && pc.localDescription.sdp) || offer.sdp || '';
            return fetch(BASE_URL + '/api/embed/voice-connect', {
              method: 'POST',
              headers: authHdr(),
              body: JSON.stringify({ sdpOffer: sdpOffer })
            });
          })
          .then(function(res) {
            if (!res.ok) return res.json().then(function(d){ throw new Error(d.error || ('HTTP ' + res.status)); });
            return res.json();
          })
          .then(function(payload) {
            if (!payload || !payload.sdpAnswer) throw new Error('Voice connection failed');
            return pc.setRemoteDescription({ type: 'answer', sdp: payload.sdpAnswer }).then(function() {
              var welcomeMessage = typeof payload.welcomeMessage === 'string' ? payload.welcomeMessage.trim() : '';
              if (welcomeMessage) {
                voicePendingAssistantId = addMsg('assistant', '');
                voicePendingAssistantText = '';
                voiceSendJson({
                  type: 'response.create',
                  response: {
                    instructions: 'Greet the user with this message verbatim: ' + JSON.stringify(welcomeMessage),
                    tool_choice: 'none'
                  }
                });
              } else {
                setVoiceState('listening');
              }
            });
          })
          .catch(function(err) {
            rejectSession(err);
            releaseVoiceRuntime(false);
            setVoiceState('idle');
          });
      });
    }).catch(function(err) {
      releaseVoiceRuntime(false);
      setVoiceState('idle');
      throw err;
    });
  }

  function startRelayVoiceRuntime() {
    var mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : null;
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (voiceWs && (voiceWs.readyState === 0 || voiceWs.readyState === 1)) {
      return Promise.resolve({ transport: 'websocket-relay', status: voiceState || 'connected' });
    }
    if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
      return Promise.reject(new Error('Microphone access is unavailable in this browser.'));
    }
    if (!AudioCtx || typeof window.WebSocket !== 'function') {
      return Promise.reject(new Error('Live voice is unavailable in this browser.'));
    }

    setVoiceState('connecting');
    voiceStoppedManually = false;

    return mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      }
    }).then(function(mic) {
      voiceMicStream = mic;
      voiceCaptureCtx = new AudioCtx({ sampleRate: 16000 });
      voicePlaybackCtx = new AudioCtx({ sampleRate: 24000 });
      return Promise.all([
        voiceCaptureCtx.resume(),
        voicePlaybackCtx.resume(),
        voiceCaptureCtx.audioWorklet.addModule(BASE_URL + '/api/embed/worklet')
      ]).then(function() {
        voiceMicSource = voiceCaptureCtx.createMediaStreamSource(mic);
        voiceWorklet = new AudioWorkletNode(voiceCaptureCtx, 'audio-recorder-worklet');
        voiceWorklet.port.onmessage = function(ev) {
          var ws = voiceWs;
          var chunk = ev && ev.data;
          if (!ws || ws.readyState !== 1 || !chunk) return;
          try {
            ws.send(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength));
          } catch (e) {}
        };
        voiceMicSource.connect(voiceWorklet);

        return new Promise(function(resolve, reject) {
          var settled = false;
          var ws = new WebSocket(getVoiceRelayUrl());
          voiceWs = ws;

          function resolveSession(statusValue) {
            if (settled) return;
            settled = true;
            resolve({ transport: 'websocket-relay', status: statusValue || 'connected' });
          }

          function rejectSession(err) {
            if (settled) return;
            settled = true;
            if (voiceWs && voiceWs.readyState < 2) {
              try { voiceWs.close(1011, 'voice error'); } catch (e) {}
            }
            reject(err);
          }

          ws.onopen = function() {
            voicePingTimer = setInterval(function() {
              if (voiceWs && voiceWs.readyState === 1) {
                try { voiceWs.send(JSON.stringify({ type: 'ping' })); } catch (e) {}
              }
            }, 15000);
          };

          ws.onmessage = function(event) {
            var msg;
            try { msg = JSON.parse(event.data); } catch (e) { return; }
            if (!msg || !msg.type) return;

            if (msg.type === 'status') {
              var nextState = msg.value || 'connected';
              setVoiceState(nextState);
              if (nextState === 'connected' || nextState === 'listening' || nextState === 'speaking') {
                resolveSession(nextState);
              }
              return;
            }

            if (msg.type === 'audio' && typeof msg.data === 'string') {
              queueVoiceAudio(msg.data, msg.sampleRate);
              return;
            }

            if (msg.type === 'transcript.user' && typeof msg.text === 'string' && msg.text.trim()) {
              addVoiceUserTranscript(msg.text);
              return;
            }

            if (msg.type === 'transcript.ai.delta' && typeof msg.delta === 'string') {
              appendVoiceAssistantDelta(msg.delta);
              return;
            }

            if (msg.type === 'transcript.ai.done') {
              if (typeof msg.text === 'string' && msg.text.trim() && !voicePendingAssistantText) {
                appendVoiceAssistantDelta(msg.text);
              }
              flushVoiceAssistantTurn();
              return;
            }

            if (msg.type === 'error') {
              rejectSession(new Error(msg.message || 'Voice connection failed'));
            }
          };

          ws.onerror = function() {
            rejectSession(new Error('Voice connection failed'));
          };

          ws.onclose = function() {
            var manual = voiceStoppedManually;
            releaseVoiceRuntime(false);
            setVoiceState('idle');
            if (!manual) {
              rejectSession(new Error('Voice connection closed'));
              addNote('\u26a0 Voice connection closed');
              _emit('voiceEnd', {});
            }
            voiceStoppedManually = false;
          };
        });
      });
    }).catch(function(err) {
      releaseVoiceRuntime(false);
      setVoiceState('idle');
      throw err;
    });
  }

  function queueVoiceAudio(base64, sampleRate) {
    if (!voicePlaybackCtx || !base64) return;
    var int16 = base64ToInt16(base64);
    if (!int16.length) return;
    var float32 = new Float32Array(int16.length);
    for (var i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }
    var rate = sampleRate || 24000;
    var buffer = voicePlaybackCtx.createBuffer(1, float32.length, rate);
    buffer.getChannelData(0).set(float32);
    var source = voicePlaybackCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(voicePlaybackCtx.destination);
    var now = voicePlaybackCtx.currentTime;
    if (voiceNextPlayTime < now) voiceNextPlayTime = now;
    source.start(voiceNextPlayTime);
    voiceNextPlayTime += buffer.duration;
  }

  function releaseVoiceRuntime(closeSocket) {
    if (voicePingTimer) {
      clearInterval(voicePingTimer);
      voicePingTimer = null;
    }
    if (voiceWorklet) {
      try { voiceWorklet.port.onmessage = null; } catch (e) {}
      try { voiceWorklet.disconnect(); } catch (e) {}
      voiceWorklet = null;
    }
    if (voiceMicSource) {
      try { voiceMicSource.disconnect(); } catch (e) {}
      voiceMicSource = null;
    }
    if (voiceMicStream) {
      try { voiceMicStream.getTracks().forEach(function(t){ t.stop(); }); } catch (e) {}
      voiceMicStream = null;
    }
    if (voiceCaptureCtx) {
      try { voiceCaptureCtx.close(); } catch (e) {}
      voiceCaptureCtx = null;
    }
    if (voicePlaybackCtx) {
      try { voicePlaybackCtx.close(); } catch (e) {}
      voicePlaybackCtx = null;
    }
    if (voiceDataChannel) {
      try { voiceDataChannel.close(); } catch (e) {}
      voiceDataChannel = null;
    }
    if (voicePeer) {
      try { voicePeer.close(); } catch (e) {}
      voicePeer = null;
    }
    if (voiceRemoteStream) {
      try { voiceRemoteStream.getTracks().forEach(function(t){ t.stop(); }); } catch (e) {}
      voiceRemoteStream = null;
    }
    if (voiceRemoteAudioEl) {
      try { voiceRemoteAudioEl.pause(); } catch (e) {}
      try { voiceRemoteAudioEl.srcObject = null; } catch (e) {}
      try { if (voiceRemoteAudioEl.parentNode) voiceRemoteAudioEl.parentNode.removeChild(voiceRemoteAudioEl); } catch (e) {}
      voiceRemoteAudioEl = null;
    }
    if (closeSocket && voiceWs) {
      try { voiceWs.close(1000, 'voice ended'); } catch (e) {}
    }
    voiceWs = null;
    voiceNextPlayTime = 0;
    voiceLastUserTranscript = '';
    voicePendingUserTranscript = '';
    voiceSendQueue = [];
    voicePendingAssistantId = null;
    voicePendingAssistantText = '';
  }

  function stopVoiceRuntime(announce) {
    voiceStoppedManually = true;
    releaseVoiceRuntime(true);
    setVoiceState('idle');
    if (announce !== false) addNote('\uD83C\uDF99 Voice session ended');
    _emit('voiceEnd', {});
  }

  function startVoiceRuntime() {
    if (getVoiceProvider() === 'gemini') return startRelayVoiceRuntime();
    return startOpenAIVoiceRuntime();
  }

  function toggleVoice() {
    if (!$voiceBtn) return;
    if (!isRelaySupportedVoiceProvider()) {
      addNote('\uD83C\uDF99 This assistant speaks with its own voice provider \u2014 use the chat bubble / voice demo on the platform site for live voice');
      return;
    }
    if (voiceOn) {
      stopVoiceRuntime(true);
      return;
    }
    $voiceBtn.disabled = true;
    startVoiceRuntime()
      .then(function(session) {
        $voiceBtn.disabled = false;
        addNote('\uD83C\uDF99 Voice ready');
        _emit('voiceSession', session);
        document.dispatchEvent(new CustomEvent('clara:voiceSession', { detail: session }));
      })
      .catch(function(err) {
        $voiceBtn.disabled = false;
        addNote('\u26a0 ' + ((err && err.message) || 'Could not start voice session'));
      });
  }

  /* ── 9. Headless SDK event emitter ──────────────────────────────────────── */
  var _listeners = {};
  function _emit(event, data) {
    var fns = _listeners[event] || [];
    for (var i = 0; i < fns.length; i++) { try { fns[i](data); } catch(e){} }
  }

  function widgetFrameUrl() {
    return BASE_URL + '/embed/widget?key=' + encodeURIComponent(API_KEY);
  }

  function destroyMountedUi() {
    frameLoaded = false;
    frameCommandQueue = [];
    $frame = null;
    $launcherLabel = null;
    $shellStyle = null;
    $toggleBtn = null;
    $panel = null;
    $hostEl = null;
    $msgs = null;
    $textarea = null;
    $sendBtn = null;
    $voiceBtn = null;
    isOpen = false;

    var oldFloating = document.getElementById('clara-widget-host');
    if (oldFloating && oldFloating.parentNode) oldFloating.parentNode.removeChild(oldFloating);
    var oldInline = document.getElementById('clara-inline-host');
    if (oldInline && oldInline.parentNode) oldInline.parentNode.removeChild(oldInline);
  }

  function buildShellCSS(c) {
    var primary  = c.primaryColour || '#6366f1';
    var launcher = c.launcherColour || primary;
    var pos      = c.widgetPosition || FALLBACK_POS;
    var btnSize  = (c.widgetButtonSize || 56) + 'px';
    var radius   = ((c.widgetBorderRadius !== undefined ? c.widgetBorderRadius : 20)) + 'px';
    var chatH    = (c.widgetChatHeight || 580) + 'px';
    var right    = pos !== 'bottom-left';
    return [
      '*,*::before,*::after{box-sizing:border-box}',
      '#launcher{position:fixed;z-index:2147483647;bottom:24px;' + (right ? 'right:24px' : 'left:24px') + ';display:flex;flex-direction:column;align-items:' + (right ? 'flex-end' : 'flex-start') + ';gap:8px}',
      '#launcher-lbl{font-family:system-ui,sans-serif;font-size:13px;font-weight:600;color:#fff;background:' + launcher + ';border-radius:20px;padding:6px 14px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,0.22);transition:opacity .15s;white-space:nowrap}',
      '#launcher-lbl:hover{opacity:.88}',
      '#panel{width:380px;max-width:calc(100vw - 32px);height:' + chatH + ';max-height:calc(100dvh - 100px);border-radius:' + radius + ';box-shadow:0 12px 48px rgba(0,0,0,0.24);overflow:hidden;background:transparent;transform:scale(0.88) translateY(20px);opacity:0;pointer-events:none;transform-origin:bottom ' + (right ? 'right' : 'left') + ';transition:transform .28s cubic-bezier(.34,1.56,.64,1),opacity .2s}',
      '#panel.open{transform:scale(1) translateY(0);opacity:1;pointer-events:all}',
      '#frame{display:block;width:100%;height:100%;border:0;background:transparent;border-radius:' + radius + '}',
      '#tbtn{width:' + btnSize + ';height:' + btnSize + ';border-radius:50%;background:' + launcher + ';border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 4px 20px rgba(0,0,0,0.28);transition:transform .2s,box-shadow .2s}',
      '#tbtn:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(0,0,0,0.36)}',
      '#tbtn svg{width:calc(' + btnSize + ' * 0.46);height:calc(' + btnSize + ' * 0.46);fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
    ].join('\n');
  }

  function frameCommand(payload) {
    if (!payload) return;
    if ($frame && frameLoaded && $frame.contentWindow) {
      try {
        $frame.contentWindow.postMessage({ type: 'clara-widget-command', payload: payload }, FRAME_ORIGIN);
        return;
      } catch (e) {}
    }
    frameCommandQueue.push(payload);
  }

  function flushFrameCommands() {
    if (!$frame || !$frame.contentWindow || !frameLoaded) return;
    while (frameCommandQueue.length) {
      var payload = frameCommandQueue.shift();
      try {
        $frame.contentWindow.postMessage({ type: 'clara-widget-command', payload: payload }, FRAME_ORIGIN);
      } catch (e) {}
    }
  }

  function setLauncherVisual() {
    if (!$toggleBtn) return;
    $toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    $toggleBtn.setAttribute('aria-label', isOpen ? 'Close chat' : 'Open chat');
    if (isOpen || !(cfg && cfg.customLauncherSvg)) { $toggleBtn.innerHTML = svg(isOpen ? I_CLOSE : I_CHAT); return; }
    // The custom launcher icon is admin-authored markup running on the HOST
    // page, so it is never parsed as HTML: an <img> with an SVG data URI
    // renders it without executing scripts or event handlers.
    var img = document.createElement('img');
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(String(cfg.customLauncherSvg));
    var iconPx = Math.round((cfg.widgetButtonSize || 56) * 0.46) + 'px';
    img.style.width = iconPx;
    img.style.height = iconPx;
    $toggleBtn.textContent = '';
    $toggleBtn.appendChild(img);
  }

  function buildFloatingShell(c) {
    var host = document.createElement('div');
    host.id = 'clara-widget-host';
    document.body.appendChild(host);
    $hostEl = host;

    var shadow = host.attachShadow({ mode: 'open' });
    var style = document.createElement('style');
    style.textContent = buildShellCSS(c);
    shadow.appendChild(style);
    $shellStyle = style;

    var launcher = document.createElement('div');
    launcher.id = 'launcher';
    shadow.appendChild(launcher);

    $panel = document.createElement('div');
    $panel.id = 'panel';
    $panel.setAttribute('role', 'dialog');
    $panel.setAttribute('aria-modal', 'true');
    $panel.setAttribute('aria-label', (c.assistantName || 'Clara') + ' chat');

    $frame = document.createElement('iframe');
    $frame.id = 'frame';
    $frame.title = (c.assistantName || 'Clara') + ' widget';
    $frame.allow = 'microphone *; autoplay *';
    $frame.referrerPolicy = 'strict-origin-when-cross-origin';
    $frame.src = widgetFrameUrl();
    $frame.onload = function() { frameLoaded = true; flushFrameCommands(); };
    $panel.appendChild($frame);
    launcher.appendChild($panel);

    if (c.widgetLauncherLabel) {
      var lbl = document.createElement('div');
      lbl.id = 'launcher-lbl';
      lbl.textContent = c.widgetLauncherLabel;
      lbl.onclick = togglePanel;
      launcher.appendChild(lbl);
      $launcherLabel = lbl;
    }

    $toggleBtn = document.createElement('button');
    $toggleBtn.id = 'tbtn';
    $toggleBtn.setAttribute('aria-controls', 'panel');
    $toggleBtn.onclick = togglePanel;
    launcher.appendChild($toggleBtn);
    setLauncherVisual();
  }

  function buildInlineEmbed(c) {
    var host = document.createElement('div');
    host.id = 'clara-inline-host';
    host.style.width = '100%';
    host.style.maxWidth = '100%';
    host.style.height = (c.widgetChatHeight || 580) + 'px';
    host.style.borderRadius = ((c.widgetBorderRadius !== undefined ? c.widgetBorderRadius : 20)) + 'px';
    host.style.overflow = 'hidden';
    host.style.background = 'transparent';

    $frame = document.createElement('iframe');
    $frame.id = 'clara-inline-frame';
    $frame.title = (c.assistantName || 'Clara') + ' widget';
    $frame.allow = 'microphone *; autoplay *';
    $frame.referrerPolicy = 'strict-origin-when-cross-origin';
    $frame.src = widgetFrameUrl();
    $frame.style.width = '100%';
    $frame.style.height = '100%';
    $frame.style.border = '0';
    $frame.style.display = 'block';
    $frame.onload = function() { frameLoaded = true; flushFrameCommands(); };
    host.appendChild($frame);

    if (scriptEl.parentNode) scriptEl.parentNode.insertBefore(host, scriptEl.nextSibling);
    else document.body.appendChild(host);
    $hostEl = host;
  }

  function renderEmbeddedMode(c, preserveOpen) {
    var wasOpen = !!preserveOpen && isOpen;
    destroyMountedUi();
    if ((c.widgetMode || FALLBACK_MODE) === 'inline') buildInlineEmbed(c);
    else buildFloatingShell(c);
    if (wasOpen && $panel) {
      isOpen = true;
      $panel.classList.add('open');
      setLauncherVisual();
    }
  }

  function togglePanel() {
    if (!$panel) return;
    isOpen = !isOpen;
    if (isOpen) $panel.classList.add('open');
    else $panel.classList.remove('open');
    setLauncherVisual();
    _emit('toggle', { open: isOpen });
  }

  function buildHeadlessSDK(c) {
    // In headless mode nothing is rendered. The site builds its own UI and calls
    // ClaraSDK methods. Tokens stream via event callbacks.
    window.ClaraSDK = {
      config: c,

      // Event subscription
      on: function(event, fn) {
        _listeners[event] = _listeners[event] || [];
        _listeners[event].push(fn);
        return window.ClaraSDK; // chainable
      },
      off: function(event, fn) {
        if (!_listeners[event]) return window.ClaraSDK;
        _listeners[event] = _listeners[event].filter(function(f){return f!==fn;});
        return window.ClaraSDK;
      },

      // Send a chat message — streams tokens via on('token', fn) and on('sources', fn)
      sendMessage: function(text) {
        if (!text || !text.trim()) return;
        history.push({ role:'user', content:text.trim() });
        _emit('userMessage', { text: text.trim() });
        isThinking = true; _emit('thinking', { on: true });

        var accumulated = ''; var started = false;
        fetch(BASE_URL + '/api/embed/chat', {
          method:'POST', headers:authHdr(),
          body: JSON.stringify({ messages:history.map(function(m){return{role:m.role,content:m.content};}), sessionId:SESSION_ID }),
        })
        .then(function(res){
          if (!res.ok || !res.body) return res.json().then(function(d){throw new Error(d.error||('HTTP '+res.status));});
          var reader = res.body.getReader(); var decoder = new TextDecoder(); var buffer = '';
          function pump() {
            reader.read().then(function(chunk){
              if (chunk.done) {
                history.push({ role:'assistant', content:accumulated });
                isThinking = false; _emit('thinking',{on:false}); _emit('done',{text:accumulated}); return;
              }
              buffer += decoder.decode(chunk.value,{stream:true});
              var lines = buffer.split('\n'); buffer = lines.pop();
              lines.forEach(function(line){
                if (!line.trim()) return;
                try {
                  var evt = JSON.parse(line);
                  if (evt.type==='token' && typeof evt.payload==='string') {
                    accumulated += evt.payload; _emit('token', evt.payload);
                  } else if (evt.type==='sources') {
                    _emit('sources', evt.payload);
                  } else if (evt.type==='error') {
                    _emit('error', evt.payload);
                    isThinking=false; _emit('thinking',{on:false});
                  }
                } catch(e){}
              });
              pump();
            }).catch(function(err){ isThinking=false; _emit('thinking',{on:false}); _emit('error',err.message||'network'); });
          }
          pump();
        })
        .catch(function(err){ isThinking=false; _emit('thinking',{on:false}); _emit('error',err.message||'failed'); });
      },

      // Request a voice session token (OpenAI or Gemini)
      startVoice: function() {
        return startVoiceRuntime().then(function(session){
          _emit('voiceSession', session); return session;
        });
      },
      stopVoice: function() {
        stopVoiceRuntime(false);
      },

      // Clear conversation history
      clearHistory: function() { history = []; _emit('historyCleared',{}); },

      // Get current config
      getConfig: function() { return c; },

      // Re-fetch design config from server (useful after a PATCH /api/embed/design)
      refreshConfig: function() {
        return fetch(BASE_URL + '/api/embed/config', { headers:{'Authorization':'Bearer '+API_KEY}, cache:'no-store' })
          .then(function(r){return r.json();})
          .then(function(data){ window.ClaraSDK.config = data; _emit('configRefreshed', data); return data; });
      },

      isThinking: function() { return isThinking; },
      getHistory:  function() { return history.slice(); },
    };

    _emit('ready', { config: c });
  }

  function init() {
    fetch(BASE_URL + '/api/embed/config', { headers: { 'Authorization': 'Bearer ' + API_KEY }, cache:'no-store' })
      .then(function(r){ if(!r.ok) throw new Error('Config error ('+r.status+')'); return r.json(); })
      .then(function(data){
        if (data.error) throw new Error(data.error);
        cfg = data;
        var mode = cfg.widgetMode || FALLBACK_MODE;

        if (mode === 'headless') {
          destroyMountedUi();
          buildHeadlessSDK(cfg);
        } else {
          renderEmbeddedMode(cfg, false);
        }
      })
      .catch(function(err){ console.warn('[Clara] Widget failed to initialise:', err.message||err); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('pagehide', function() {
    if (voiceOn) stopVoiceRuntime(false);
  });

  window.ClaraWidget = {
    open:   function(){ if ($panel && !isOpen) togglePanel(); },
    close:  function(){ if ($panel && isOpen)  togglePanel(); },
    send:   function(text){
      if ($panel && !isOpen) togglePanel();
      frameCommand({ action: 'send', text: text || '' });
    },
    isOpen: function(){ return isOpen; },
    getConfig: function(){ return cfg; },
    startVoice: function(){ frameCommand({ action: 'startVoice' }); return Promise.resolve({ delegated: true }); },
    stopVoice: function(){ frameCommand({ action: 'stopVoice' }); return Promise.resolve(); },
    refreshDesign: function() {
      return fetch(BASE_URL + '/api/embed/config', { headers:{'Authorization':'Bearer '+API_KEY}, cache:'no-store' })
        .then(function(r){return r.json();})
        .then(function(data){
          cfg = data;
          if ((cfg.widgetMode || FALLBACK_MODE) === 'headless') {
            destroyMountedUi();
            buildHeadlessSDK(cfg);
            return data;
          }
          renderEmbeddedMode(cfg, true);
          return data;
        });
    },
    on:  function(e, fn){ _listeners[e]=_listeners[e]||[]; _listeners[e].push(fn); return window.ClaraWidget; },
    off: function(e, fn){ if (_listeners[e]) _listeners[e]=_listeners[e].filter(function(f){return f!==fn;}); return window.ClaraWidget; },
  };

})();
