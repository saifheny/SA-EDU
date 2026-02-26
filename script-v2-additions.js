/* ============================================================
   SA EDU v2 — JavaScript Additions
   Add this AFTER your main script.js
   ============================================================ */

// ========================================================
// 1. GEMINI-LIKE AI THINKING SYSTEM
// ========================================================

const thinkingPhrases = [
  'جاري التفكير...', 'أحلل سؤالك...', 'أبحث في معلوماتي...',
  'أفكر في أفضل إجابة...', 'لحظة من فضلك...', 'أجهز ردًا ذكيًا...'
];
const deepThinkingPhrases = [
  'تفكير عميق...', 'أحلل المعطيات...', 'مسألة معقدة، أفكر بعناية...',
  'أبني الإجابة خطوة بخطوة...', 'أتحقق من الدقة...'
];

function isComplexQuestion(text) {
  const complexSignals = ['اشرح', 'لخص', 'حلل', 'قارن', 'ما أسباب', 'كيف يعمل', 'ما الفرق', 'اكتب', 'خطة', 'مقالة', 'رأيك', 'إيجابيات', 'سلبيات'];
  return complexSignals.some(s => text.includes(s)) || text.length > 80;
}

function createAiThinkingUI(prefix, isDeep = false) {
  const container = document.getElementById(`${prefix}-ai-msgs`);
  const id = 'thinking-' + Date.now();
  const wrap = document.createElement('div');
  wrap.className = 'chat-msg-wrap ai';
  wrap.id = id;

  if (isDeep) {
    const phrase = deepThinkingPhrases[Math.floor(Math.random() * deepThinkingPhrases.length)];
    wrap.innerHTML = `
      <div class="ai-deep-thinking">
        <div class="ai-deep-spinner-wrap">
          <div class="ai-deep-ring"></div>
          <div class="ai-deep-ring"></div>
          <div class="ai-deep-ring"></div>
          <div class="ai-deep-dot"></div>
        </div>
        <div class="ai-deep-text">
          <div class="ai-deep-label">SA AI يفكر...</div>
          <div class="ai-deep-sub">${phrase}</div>
        </div>
      </div>`;
  } else {
    const phrase = thinkingPhrases[Math.floor(Math.random() * thinkingPhrases.length)];
    wrap.innerHTML = `
      <div class="ai-thinking-wrap">
        <div class="ai-typing-sticks">
          <div class="ai-stick"></div><div class="ai-stick"></div>
          <div class="ai-stick"></div><div class="ai-stick"></div>
          <div class="ai-stick"></div>
        </div>
        <span class="ai-thinking-text">${phrase}</span>
      </div>`;
  }

  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
  return id;
}

// Override sendAiMsg to use new thinking UI
const _origSendAiMsg = window.sendAiMsg;
window.sendAiMsg = async function(prefix) {
  const input = document.getElementById(`${prefix}-ai-input`);
  const fileInput = document.getElementById(`${prefix}-ai-file`);
  const msgs = document.getElementById(`${prefix}-ai-msgs`);
  let txt = input.value.trim();

  if (!txt && !fileInput?.files[0]) return;

  playSound('sent');

  // Shorthand command detection
  if (!fileInput?.files[0]) {
    if (txt.includes("أنشئ اختبار") || txt.includes("create exam") || txt.includes("امتحان")) {
      if (selectedRole !== 'teacher') return saAlert("عذراً، هذه الميزة للمعلمين فقط.", "error");
      toggleAiGenerator();
      const topic = txt.replace(/أنشئ اختبار|عن|create exam|about/g, '').trim();
      if (topic) document.getElementById('ai-gen-text').value = topic;
      return;
    }
    if (txt.includes("انشر") || txt.includes("بوست") || txt.includes("post")) {
      openReeseCompose();
      const content = txt.replace(/انشر|بوست|post|عن/g, '').trim();
      if (content) document.getElementById('reese-text-input').value = content;
      return;
    }
  }

  const welcomeScreen = msgs.querySelector('.ai-welcome-screen');
  if (welcomeScreen) welcomeScreen.remove();

  // Correct common Arabic spelling mistakes
  const corrected = correctArabicSpelling(txt);
  if (corrected !== txt) {
    const correction = document.createElement('div');
    correction.className = 'chat-msg-wrap ai';
    correction.innerHTML = `<div style="font-size:0.75rem; color:#555; padding:4px 18px; font-style:italic;">تم تصحيح: "${corrected}"</div>`;
    msgs.appendChild(correction);
  }

  let imgB64 = null, ocrText = '';

  if (fileInput?.files[0]) {
    const ocrId = createAiThinkingUI(prefix, false);
    try {
      imgB64 = await getBase64(fileInput.files[0]);
      ocrText = await recognizeImageText(imgB64);
      document.getElementById(ocrId)?.remove();
      clearChatImg(prefix);
    } catch (e) {
      document.getElementById(ocrId)?.remove();
      console.error(e);
    }
  }

  currentChatMessages.push({ role: 'user', content: txt, image: imgB64 });
  renderMessageUI(prefix, 'user', txt, imgB64);
  input.value = '';
  window.toggleAiSendMic(prefix, '');
  saveChatToLocal();

  const isDeep = isComplexQuestion(corrected || txt);
  const thinkingId = createAiThinkingUI(prefix, isDeep);

  try {
    let finalPrompt = '';
    if (selectedRole === 'student') {
      finalPrompt = `أنت مساعد دراسي ذكي اسمه SA AI للطلاب. أجب باللغة العربية. حجم إجابتك يتناسب مع السؤال: الأسئلة البسيطة ردود قصيرة (جملة أو اثنتان)، الأسئلة التفسيرية شرح متوسط، والمعقدة إجابة مفصلة. افهم الأخطاء الإملائية وأجب بشكل طبيعي. `;
    } else {
      finalPrompt = `أنت مساعد معلمين ذكي اسمه SA AI. أجب باللغة العربية. حجم إجابتك يتناسب مع السؤال. افهم الأخطاء الإملائية. `;
    }

    if (ocrText) finalPrompt += `محتوى الصورة: "${ocrText.substring(0, 500)}". `;
    finalPrompt += (corrected || txt);

    const reply = await callPollinationsAI(finalPrompt);

    playSound('recv');
    document.getElementById(thinkingId)?.remove();
    currentChatMessages.push({ role: 'ai', content: reply });
    renderMessageUI(prefix, 'ai', reply, null);
    saveChatToLocal();
  } catch (e) {
    document.getElementById(thinkingId)?.remove();
    const errDiv = document.createElement('div');
    errDiv.className = 'chat-msg-wrap ai';
    errDiv.innerHTML = `<div class="ai-thinking-wrap" style="color:var(--danger)"><i class="fas fa-exclamation-triangle"></i> حدث خطأ، حاول مجددًا</div>`;
    msgs.appendChild(errDiv);
    console.error(e);
  }
};

// Arabic spell correction helper
function correctArabicSpelling(text) {
  const fixes = {
    'كيمياء': ['كيميا', 'كيمياء', 'الكيميا'],
    'رياضيات': ['رياضيت', 'رياضيات', 'الرياضيت'],
    'فيزياء': ['فيزيا', 'فيزياء'],
    'أحياء': ['احياء', 'الاحياء'],
    'اشرح': ['شرح لي', 'شرحلي', 'شرح'],
    'لخص': ['تلخيص', 'لخصلي', 'ملخص'],
    'ساعدني': ['ساعدني', 'ساعده', 'ساعد'],
    'ما هو': ['ايه', 'ايش', 'ما هي', 'وش'],
    'كيف': ['كيفاش', 'ازاي', 'اكيف']
  };
  let result = text;
  // Simple normalization: alef variants
  result = result.replace(/[أإآا]/g, 'ا');
  return result;
}

// ========================================================
// 2. GEMINI STAR LOGO
// ========================================================

window.renderAiWelcome = function(prefix) {
  const msgs = document.getElementById(`${prefix}-ai-msgs`);
  const firstName = currentUser?.split(' ')[0] || 'مرحباً';

  let roleChips = '';
  if (selectedRole === 'teacher') {
    roleChips = `
      <div class="ai-chip" onclick="fillAiInput('${prefix}', 'أنشئ اختبار عن الكيمياء العضوية')"><i class="fas fa-flask"></i> إنشاء اختبار</div>
      <div class="ai-chip" onclick="fillAiInput('${prefix}', 'اكتب خطة درس عن التاريخ الحديث')"><i class="fas fa-book"></i> تحضير درس</div>
      <div class="ai-chip" onclick="fillAiInput('${prefix}', 'كيف أجعل الحصة تفاعلية أكثر؟')"><i class="fas fa-users"></i> نصائح تفاعلية</div>
      <div class="ai-chip" onclick="fillAiInput('${prefix}', 'أنشئ أسئلة مراجعة للفصل الأول')"><i class="fas fa-question-circle"></i> أسئلة مراجعة</div>`;
  } else {
    roleChips = `
      <div class="ai-chip" onclick="fillAiInput('${prefix}', 'اشرح لي قانون نيوتن الثاني ببساطة')"><i class="fas fa-atom"></i> شرح درس</div>
      <div class="ai-chip" onclick="fillAiInput('${prefix}', 'لخص لي أحداث الحرب العالمية الأولى')"><i class="fas fa-history"></i> تلخيص</div>
      <div class="ai-chip" onclick="fillAiInput('${prefix}', 'ساعدني في تنظيم وقت المذاكرة')"><i class="fas fa-clock"></i> تنظيم الوقت</div>
      <div class="ai-chip" onclick="fillAiInput('${prefix}', 'اعطني امتحان تجريبي في الرياضيات')"><i class="fas fa-pen"></i> اختبار تجريبي</div>`;
  }

  msgs.innerHTML = `
    <div class="ai-welcome-screen">
      <div style="margin-bottom:24px;">
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" style="animation:starRotate 8s linear infinite;">
          <defs>
            <linearGradient id="geminiGrad" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#8b5cf6"/>
              <stop offset="50%" stop-color="#3b82f6"/>
              <stop offset="100%" stop-color="#ec4899"/>
            </linearGradient>
          </defs>
          <path d="M40 4C40 4 42 20 52 28C62 36 76 36 76 36C76 36 62 36 52 44C42 52 40 68 40 68C40 68 38 52 28 44C18 36 4 36 4 36C4 36 18 36 28 28C38 20 40 4 40 4Z" fill="url(#geminiGrad)" opacity="0.9"/>
          <path d="M40 20C40 20 41 28 45 32C49 36 57 36 57 36C57 36 49 36 45 40C41 44 40 52 40 52C40 52 39 44 35 40C31 36 23 36 23 36C23 36 31 36 35 32C39 28 40 20 40 20Z" fill="url(#geminiGrad)" opacity="0.5"/>
        </svg>
      </div>
      <h3 class="ai-welcome-title">مرحباً ${firstName} 👋</h3>
      <p class="ai-welcome-text">أنا SA AI مساعدك الذكي.<br>${selectedRole === 'teacher' ? 'يمكنني مساعدتك في إنشاء الاختبارات وتحضير الدروس.' : 'أنا هنا لمساعدتك في المذاكرة وشرح الدروس وحل المسائل.'}</p>
      <div class="ai-chips">${roleChips}</div>
      <div style="margin-top:20px; font-size:0.72rem; color:#333; display:flex; align-items:center; gap:5px;">
        <span>✦</span> يفهم الأخطاء الإملائية <span>✦</span> يحلل الصور <span>✦</span>
      </div>
    </div>`;
};

// ========================================================
// 3. VOICE CALL IN CHAT (WebRTC Peer-to-Peer)
// ========================================================

let vrcPeer = null;
let vrcLocalStream = null;
let vrcActiveCall = null;
let vrcCallTimer = null;
let vrcCallSeconds = 0;
let vrcCallPartnerId = null;
let vrcCallPartnerName = '';
let vrcCallPartnerIcon = '';
let vrcIsMuted = false;
let vrcIsSpeakerOn = true;

function initVoiceCallSystem() {
  // Create call modal in DOM
  if (document.getElementById('vrc-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'vrc-modal';
  modal.className = 'vrc-modal';
  modal.innerHTML = `
    <div class="vrc-bg"></div>
    <div class="vrc-avatar-wrap">
      <div class="vrc-ripple"></div>
      <div class="vrc-ripple"></div>
      <div class="vrc-ripple"></div>
      <div class="vrc-avatar" id="vrc-avatar"><i class="fas fa-user"></i></div>
    </div>
    <div class="vrc-name" id="vrc-partner-name">...</div>
    <div class="vrc-status calling" id="vrc-status">
      <div class="vrc-status-dot"></div>
      <span id="vrc-status-text">جاري الاتصال...</span>
    </div>
    <div class="vrc-timer" id="vrc-timer"></div>
    <div class="vrc-controls">
      <button class="vrc-btn vrc-btn-mute" id="vrc-mute-btn" onclick="vrcToggleMute()">
        <i class="ph-bold ph-microphone"></i>
      </button>
      <button class="vrc-btn vrc-btn-end" onclick="vrcEndCall()">
        <i class="ph-bold ph-phone-x"></i>
      </button>
      <button class="vrc-btn vrc-btn-speaker" id="vrc-speaker-btn" onclick="vrcToggleSpeaker()">
        <i class="ph-bold ph-speaker-high"></i>
      </button>
    </div>
    <audio id="vrc-remote-audio" autoplay playsinline></audio>
  `;
  document.body.appendChild(modal);

  // Create incoming call notification
  const incoming = document.createElement('div');
  incoming.id = 'vrc-incoming';
  incoming.className = 'vrc-incoming';
  incoming.innerHTML = `
    <div class="vrc-incoming-avatar" id="vrc-inc-avatar"><i class="fas fa-user"></i></div>
    <div class="vrc-incoming-info">
      <div class="vrc-incoming-name" id="vrc-inc-name">مجهول</div>
      <div class="vrc-incoming-sub">اتصال صوتي</div>
    </div>
    <div class="vrc-incoming-btns">
      <button class="vrc-answer-btn" onclick="vrcAnswerCall()"><i class="ph-bold ph-phone-call"></i></button>
      <button class="vrc-decline-btn" onclick="vrcDeclineCall()"><i class="ph-bold ph-phone-x"></i></button>
    </div>
  `;
  document.body.appendChild(incoming);
}

async function vrcInitPeer() {
  if (vrcPeer && !vrcPeer.destroyed) return;
  const peerId = 'vrc_' + myUid + '_' + Date.now().toString(36);
  vrcPeer = new Peer(peerId, {
    debug: 0,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun.relay.metered.ca:80' },
        { urls: 'turn:global.relay.metered.ca:80', username: '14d6a892afc9dbe41c8e0de2', credential: 'jWoQ1RL0jVlh/dNY' }
      ]
    }
  });

  await new Promise((res, rej) => {
    vrcPeer.on('open', res);
    vrcPeer.on('error', rej);
    setTimeout(rej, 8000);
  });

  // Listen for incoming calls
  vrcPeer.on('call', (call) => {
    vrcActiveCall = call;
    // Get caller info from Firebase
    const callerParts = call.peer.split('_');
    const callerUid = callerParts[1] || 'unknown';
    vrcShowIncoming(callerUid, call);
  });
}

async function vrcStartCall(otherUid, otherName, otherIcon) {
  vrcCallPartnerId = otherUid;
  vrcCallPartnerName = otherName;
  vrcCallPartnerIcon = otherIcon;

  // Show call modal
  document.getElementById('vrc-partner-name').innerText = otherName;
  document.getElementById('vrc-avatar').innerHTML = `<i class="fas ${otherIcon}"></i>`;
  document.getElementById('vrc-status').className = 'vrc-status calling';
  document.getElementById('vrc-status-text').innerText = 'جاري الاتصال...';
  document.getElementById('vrc-timer').innerText = '';
  document.getElementById('vrc-modal').classList.add('open');

  try {
    await vrcInitPeer();
    vrcLocalStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

    // Store my peer ID in Firebase so the other person can call me back
    await update(ref(db, `users/${selectedRole}s/${currentUser}`), { callPeerId: vrcPeer.id, callStatus: 'calling', callTo: otherUid });
    
    // Get other person's peer ID
    let otherPeerId = null;
    const tries = 8;
    for (let i = 0; i < tries; i++) {
      const sSnap = await get(ref(db, `users/students`)).catch(() => null);
      const tSnap = await get(ref(db, `users/teachers`)).catch(() => null);
      if (sSnap?.exists()) {
        Object.entries(sSnap.val()).forEach(([name, data]) => {
          if (data.uid === otherUid && data.callPeerId) otherPeerId = data.callPeerId;
        });
      }
      if (tSnap?.exists()) {
        Object.entries(tSnap.val()).forEach(([name, data]) => {
          if (data.uid === otherUid && data.callPeerId) otherPeerId = data.callPeerId;
        });
      }
      if (otherPeerId) break;
      await new Promise(r => setTimeout(r, 1500));
    }

    if (!otherPeerId) {
      saAlert('لم يرد المستخدم أو غير متاح', 'error');
      vrcEndCall();
      return;
    }

    const call = vrcPeer.call(otherPeerId, vrcLocalStream);
    vrcActiveCall = call;

    call.on('stream', (remoteStream) => {
      document.getElementById('vrc-remote-audio').srcObject = remoteStream;
      document.getElementById('vrc-status').className = 'vrc-status connected';
      document.getElementById('vrc-status-text').innerText = 'متصل';
      vrcStartTimer();
    });

    call.on('close', () => vrcEndCall());
    call.on('error', () => vrcEndCall());

    setTimeout(() => {
      if (document.getElementById('vrc-status-text').innerText === 'جاري الاتصال...') {
        saAlert('لم يرد المستخدم', 'info');
        vrcEndCall();
      }
    }, 30000);

  } catch (e) {
    console.error(e);
    saAlert('فشل الاتصال، تأكد من إذن الميكروفون', 'error');
    vrcEndCall();
  }
}

function vrcShowIncoming(callerUid, call) {
  // Find caller info
  get(ref(db, `users/students`)).then(snap => {
    let name = 'مجهول', icon = 'fa-user';
    if (snap.exists()) {
      Object.entries(snap.val()).forEach(([n, d]) => {
        if (d.uid === callerUid || d.callTo === myUid) { name = n; icon = d.icon || 'fa-user'; }
      });
    }
    document.getElementById('vrc-inc-name').innerText = name;
    document.getElementById('vrc-inc-avatar').innerHTML = `<i class="fas ${icon}"></i>`;
    vrcCallPartnerName = name;
    vrcCallPartnerIcon = icon;
    vrcCallPartnerId = callerUid;
    document.getElementById('vrc-incoming').classList.add('show');

    // Ring tone
    playVrcRingTone();
  });
}

let vrcRingInterval = null;
function playVrcRingTone() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const ring = () => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 440;
      g.gain.setValueAtTime(0.3, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      o.start(); o.stop(ctx.currentTime + 0.6);
    };
    ring();
    vrcRingInterval = setInterval(ring, 2000);
  } catch (e) {}
}

window.vrcAnswerCall = async () => {
  clearInterval(vrcRingInterval);
  document.getElementById('vrc-incoming').classList.remove('show');
  
  try {
    vrcLocalStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    vrcActiveCall.answer(vrcLocalStream);
    
    vrcActiveCall.on('stream', (remoteStream) => {
      document.getElementById('vrc-remote-audio').srcObject = remoteStream;
    });

    document.getElementById('vrc-partner-name').innerText = vrcCallPartnerName;
    document.getElementById('vrc-avatar').innerHTML = `<i class="fas ${vrcCallPartnerIcon}"></i>`;
    document.getElementById('vrc-status').className = 'vrc-status connected';
    document.getElementById('vrc-status-text').innerText = 'متصل';
    document.getElementById('vrc-modal').classList.add('open');
    vrcStartTimer();
  } catch (e) {
    saAlert('لا يمكن الوصول للميكروفون', 'error');
  }
};

window.vrcDeclineCall = () => {
  clearInterval(vrcRingInterval);
  document.getElementById('vrc-incoming').classList.remove('show');
  if (vrcActiveCall) { vrcActiveCall.close(); vrcActiveCall = null; }
};

window.vrcEndCall = async () => {
  clearInterval(vrcRingInterval);
  clearInterval(vrcCallTimer);
  vrcCallSeconds = 0;
  if (vrcActiveCall) { try { vrcActiveCall.close(); } catch(e){} vrcActiveCall = null; }
  if (vrcLocalStream) { vrcLocalStream.getTracks().forEach(t => t.stop()); vrcLocalStream = null; }
  document.getElementById('vrc-modal').classList.remove('open');
  document.getElementById('vrc-incoming').classList.remove('show');
  if (vrcPeer) { try { vrcPeer.destroy(); } catch(e){} vrcPeer = null; }
  // Clean up firebase
  if (currentUser && selectedRole) {
    update(ref(db, `users/${selectedRole}s/${currentUser}`), { callPeerId: null, callStatus: null, callTo: null }).catch(() => {});
  }
};

function vrcStartTimer() {
  vrcCallSeconds = 0;
  clearInterval(vrcCallTimer);
  vrcCallTimer = setInterval(() => {
    vrcCallSeconds++;
    const m = Math.floor(vrcCallSeconds / 60);
    const s = vrcCallSeconds % 60;
    document.getElementById('vrc-timer').innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
  }, 1000);
}

window.vrcToggleMute = () => {
  vrcIsMuted = !vrcIsMuted;
  if (vrcLocalStream) vrcLocalStream.getAudioTracks()[0].enabled = !vrcIsMuted;
  const btn = document.getElementById('vrc-mute-btn');
  if (vrcIsMuted) {
    btn.innerHTML = '<i class="ph-bold ph-microphone-slash"></i>';
    btn.classList.add('muted');
  } else {
    btn.innerHTML = '<i class="ph-bold ph-microphone"></i>';
    btn.classList.remove('muted');
  }
};

window.vrcToggleSpeaker = () => {
  vrcIsSpeakerOn = !vrcIsSpeakerOn;
  const audio = document.getElementById('vrc-remote-audio');
  if (audio) audio.muted = !vrcIsSpeakerOn;
  const btn = document.getElementById('vrc-speaker-btn');
  btn.classList.toggle('active', vrcIsSpeakerOn);
};

// Hook into chat window open to add call button
const _origOpenChatRoom = window.openChatRoom;
window.openChatRoom = function(chatId, name, icon, uid) {
  _origOpenChatRoom.call(this, chatId, name, icon, uid);
  // Add call button to chat header
  setTimeout(() => {
    const header = document.querySelector('.chat-header');
    if (!header || header.querySelector('.chat-call-btn')) return;
    const callBtn = document.createElement('button');
    callBtn.className = 'chat-call-btn';
    callBtn.title = 'اتصال صوتي';
    callBtn.innerHTML = '<i class="ph-bold ph-phone-call"></i>';
    callBtn.onclick = () => vrcStartCall(uid, name, icon);
    const actionsDiv = header.querySelector('[style*="margin-right:auto"]');
    if (actionsDiv) actionsDiv.insertBefore(callBtn, actionsDiv.firstChild);
    
    // Add typing indicator to msg area
    addTypingIndicator(chatId, uid);
  }, 200);
};

// ========================================================
// 4. TYPING INDICATOR
// ========================================================

let _typingTimeout = null;

function addTypingIndicator(chatId, otherUid) {
  const input = document.getElementById(`chat-input-${chatId}`);
  if (!input) return;

  // Create typing indicator UI
  const msgArea = document.getElementById(`chat-msgs-${chatId}`);
  if (!msgArea) return;
  
  let typingEl = document.getElementById(`typing-${chatId}`);
  if (!typingEl) {
    typingEl = document.createElement('div');
    typingEl.id = `typing-${chatId}`;
    typingEl.className = 'chat-typing-indicator';
    typingEl.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
    msgArea.appendChild(typingEl);
  }

  input.addEventListener('input', () => {
    // Set typing in firebase
    update(ref(db, `typing/${chatId}/${myUid}`), { typing: true, ts: Date.now() }).catch(() => {});
    clearTimeout(_typingTimeout);
    _typingTimeout = setTimeout(() => {
      update(ref(db, `typing/${chatId}/${myUid}`), { typing: false }).catch(() => {});
    }, 2000);
  });

  // Listen for other person's typing
  onValue(ref(db, `typing/${chatId}/${otherUid}`), (snap) => {
    const data = snap.val();
    const indicator = document.getElementById(`typing-${chatId}`);
    if (!indicator) return;
    if (data?.typing && (Date.now() - (data.ts || 0)) < 5000) {
      indicator.classList.add('show');
      const ma = document.getElementById(`chat-msgs-${chatId}`);
      if (ma) ma.scrollTop = ma.scrollHeight;
    } else {
      indicator.classList.remove('show');
    }
  });
}

// ========================================================
// 5. ANIMATED AVATARS ON EXAM CARDS
// ========================================================

const EXAM_AVATARS = ['🎓', '📚', '✏️', '🔬', '🧮', '🌟', '🏆', '💡', '🚀', '🎯', '⚡', '🧠'];
const SUBJECT_AVATARS = {
  'فيزياء': '⚡', 'كيمياء': '🧪', 'رياضيات': '🔢', 'أحياء': '🌿',
  'عربي': '📖', 'انجليزي': '🌍', 'تاريخ': '🏛️', 'جغرافيا': '🌏',
  'فلسفة': '🤔', 'علوم': '🔬', 'default': '📝'
};

function getSubjectAvatar(subject) {
  return SUBJECT_AVATARS[subject] || SUBJECT_AVATARS.default;
}

function addAvatarToCards() {
  document.querySelectorAll('.card-wrapper').forEach((wrapper, i) => {
    if (wrapper.querySelector('.exam-avatar-badge')) return;
    const badge = document.createElement('div');
    badge.className = 'exam-avatar-badge';
    badge.style.animationDelay = `${i * 0.15}s`;
    
    // Try to get subject from card
    const subjectBadge = wrapper.querySelector('.subject-badge');
    const subject = subjectBadge?.innerText || '';
    badge.innerText = getSubjectAvatar(subject);
    wrapper.prepend(badge);
  });
}

// Observe DOM for new cards
const cardObserver = new MutationObserver(() => addAvatarToCards());
cardObserver.observe(document.body, { childList: true, subtree: true });

// ========================================================
// 6. SMART AD PLACEMENT
// ========================================================

const SA_ADS = [
  {
    icon: '📱',
    title: 'حمّل تطبيق SA EDU',
    sub: 'تعلم في أي وقت وأي مكان',
    btn: 'حمّل الآن',
    action: () => window.installPWA && installPWA()
  },
  {
    icon: '🎯',
    title: 'رفع مستواك مع SA AI',
    sub: 'استخدم الذكاء الاصطناعي لتحسين درجاتك',
    btn: 'جرب الآن',
    action: () => {
      const prefix = selectedRole === 'teacher' ? 't' : 's';
      const navBtns = document.querySelectorAll(`#${selectedRole === 'teacher' ? 'teacher-app' : 'student-app'} .nav-btn`);
      switchTab(`${prefix}-ai`, navBtns[3]);
    }
  },
  {
    icon: '👥',
    title: 'تواصل مع زملائك',
    sub: 'ابدأ محادثة وتعاون في المذاكرة',
    btn: 'ابدأ الآن',
    action: () => toggleUserSearchModal()
  },
  {
    icon: '🏆',
    title: 'تحدى أصدقاءك',
    sub: 'شارك اختبارك وقارن نتائجك',
    btn: 'شارك',
    action: () => saAlert('شارك اختبارك مع أصدقائك!', 'info')
  }
];

let _adIndex = 0;
function createSmartAd() {
  const ad = SA_ADS[_adIndex % SA_ADS.length];
  _adIndex++;
  
  const div = document.createElement('div');
  div.className = 'smart-ad card-wrapper';
  div.innerHTML = `
    <div class="smart-ad-icon">${ad.icon}</div>
    <div class="smart-ad-text">
      <div class="smart-ad-title">${ad.title}</div>
      <div class="smart-ad-sub">${ad.sub}</div>
    </div>
    <button class="smart-ad-btn">${ad.btn}</button>
  `;
  div.querySelector('.smart-ad-btn').onclick = ad.action;
  div.querySelector('.smart-ad-btn').addEventListener('click', (e) => e.stopPropagation());
  return div;
}

// Override createAdBanner to use smart ads sometimes
const _origCreateAdBanner = window.createAdBanner;
let _adCallCount = 0;
window.createAdBanner = function() {
  _adCallCount++;
  // Every 3rd ad, show a smart native ad instead of iframe
  if (_adCallCount % 3 === 0) {
    return createSmartAd();
  }
  return _origCreateAdBanner();
};

// ========================================================
// 7. ENHANCED EXAM SEARCH
// ========================================================

function injectExamSearch() {
  const studentExamSection = document.getElementById('s-exams');
  if (!studentExamSection) return;
  
  let searchHero = studentExamSection.querySelector('.exam-search-hero');
  if (searchHero) return;
  
  // Insert after the XP hud or CTA
  const xpHud = studentExamSection.querySelector('.xp-hud');
  const insertAfter = xpHud || studentExamSection.querySelector('.create-exam-cta');
  if (!insertAfter) return;

  searchHero = document.createElement('div');
  searchHero.className = 'exam-search-hero';
  searchHero.innerHTML = `
    <div class="exam-search-glow"></div>
    <div class="exam-search-bar">
      <i class="ph-bold ph-magnifying-glass exam-search-icon"></i>
      <input type="text" class="exam-search-input" placeholder="ابحث في الاختبارات..." id="exam-live-search" oninput="filterExamCards(this.value)">
      <i class="ph-bold ph-x" style="color:#444; cursor:pointer; font-size:0.9rem;" onclick="document.getElementById('exam-live-search').value=''; filterExamCards('')"></i>
    </div>
    <div class="exam-filter-pills" id="exam-filter-pills">
      <div class="filter-pill active" onclick="setExamFilter('all', this)">الكل</div>
      <div class="filter-pill" onclick="setExamFilter('فيزياء', this)">⚡ فيزياء</div>
      <div class="filter-pill" onclick="setExamFilter('كيمياء', this)">🧪 كيمياء</div>
      <div class="filter-pill" onclick="setExamFilter('رياضيات', this)">🔢 رياضيات</div>
      <div class="filter-pill" onclick="setExamFilter('أحياء', this)">🌿 أحياء</div>
      <div class="filter-pill" onclick="setExamFilter('عربي', this)">📖 عربي</div>
    </div>
  `;
  insertAfter.insertAdjacentElement('afterend', searchHero);
}

window.filterExamCards = (term) => {
  const cards = document.querySelectorAll('#s-exams-list .card-wrapper');
  const lower = term.toLowerCase();
  cards.forEach(card => {
    const text = card.innerText.toLowerCase();
    card.style.display = text.includes(lower) ? '' : 'none';
  });
};

let _activeExamFilter = 'all';
window.setExamFilter = (subject, el) => {
  _activeExamFilter = subject;
  document.querySelectorAll('#exam-filter-pills .filter-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  const cards = document.querySelectorAll('#s-exams-list .card-wrapper');
  cards.forEach(card => {
    if (subject === 'all') { card.style.display = ''; return; }
    const badge = card.querySelector('.subject-badge');
    card.style.display = (badge?.innerText?.includes(subject)) ? '' : 'none';
  });
};

// ========================================================
// 8. IMPROVED SWIPE NAVIGATION (all sections + chat)
// ========================================================

// Enhanced swipe with visual feedback
const _origInitSwipeNavigation = window.initSwipeNavigation;
window.initSwipeNavigation = function(portalId) {
  const portal = document.getElementById(portalId);
  if (!portal) return;
  
  let startX = 0, startY = 0, startTarget = null;
  let swipeIndicator = null;

  portal.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startTarget = e.target;
  }, { passive: true });

  portal.addEventListener('touchmove', (e) => {
    if (!startTarget) return;
    if (startTarget.closest('.chat-window') ||
        startTarget.closest('.chat-sidebar') ||
        startTarget.closest('input') ||
        startTarget.closest('textarea') ||
        startTarget.closest('.ai-messages') ||
        startTarget.closest('.full-screen-overlay') ||
        startTarget.closest('.chat-msgs-area')) return;

    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) {
      // Show swipe indicator
      if (!swipeIndicator) {
        swipeIndicator = document.createElement('div');
        swipeIndicator.style.cssText = `
          position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
          background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1);
          border-radius:50%; width:60px; height:60px;
          display:flex; align-items:center; justify-content:center;
          font-size:1.5rem; pointer-events:none; z-index:9000;
          transition:opacity 0.2s; opacity:0.8;
        `;
        swipeIndicator.innerText = dx > 0 ? '→' : '←';
        document.body.appendChild(swipeIndicator);
      } else {
        swipeIndicator.innerText = dx > 0 ? '→' : '←';
      }
    }
  }, { passive: true });

  portal.addEventListener('touchend', (e) => {
    if (swipeIndicator) { swipeIndicator.remove(); swipeIndicator = null; }
    if (!startTarget) return;
    if (startTarget.closest('.chat-window') ||
        startTarget.closest('.chat-sidebar') ||
        startTarget.closest('input') ||
        startTarget.closest('textarea') ||
        startTarget.closest('.ai-messages') ||
        startTarget.closest('.full-screen-overlay') ||
        startTarget.closest('.chat-msgs-area')) return;

    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) < 60 || Math.abs(dx) <= Math.abs(dy) * 1.5) return;

    const tabs = selectedRole === 'teacher' ? TEACHER_TABS : STUDENT_TABS;
    const currentHash = window.location.hash.replace('#', '');
    let idx = tabs.indexOf(currentHash);
    if (idx === -1) idx = 0;
    // RTL: swipe right = previous, swipe left = next
    const newIdx = dx < 0 ? idx + 1 : idx - 1;
    if (newIdx >= 0 && newIdx < tabs.length) {
      const navBtns = document.querySelectorAll(`#${portalId} .nav-btn`);
      switchTabWithDirection(tabs[newIdx], navBtns[newIdx], dx < 0 ? 'right' : 'left');
    }
    startTarget = null;
  }, { passive: true });
};

// ========================================================
// 9. CELEBRATION ANIMATIONS
// ========================================================

function launchConfetti(duration = 2500) {
  const container = document.createElement('div');
  container.className = 'streak-celebration';
  document.body.appendChild(container);

  const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#fff'];
  const count = 50;

  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-particle';
    p.style.cssText = `
      left: ${Math.random() * 100}%;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      width: ${Math.random() * 8 + 4}px;
      height: ${Math.random() * 8 + 4}px;
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
      animation-duration: ${Math.random() * 2 + 1.5}s;
      animation-delay: ${Math.random() * 0.8}s;
    `;
    container.appendChild(p);
  }
  setTimeout(() => container.remove(), duration + 800);
}

// Enhanced score display
const _origSubmitExamOrig = window.submitExam;
// Wrap score display with celebration
const _wrapSubmitExam = () => {
  const orig = window.submitExam;
  window.submitExam = async function() {
    await orig.call(this);
    // Check if high score
    const lastResult = await get(ref(db, `results/${activeTest?.id}/${currentUser}`)).catch(() => null);
    if (lastResult?.exists()) {
      const pct = lastResult.val().percentage;
      if (pct >= 80) {
        setTimeout(() => launchConfetti(3000), 300);
        if (pct === 100) {
          showToast('💯 اجابة مثالية!', 'حصلت على 100%!', 'success', 5000);
        } else if (pct >= 90) {
          showToast('🏆 ممتاز!', `${pct}% درجة رائعة!`, 'success', 4000);
        }
      }
    }
  };
};

// ========================================================
// 10. LANDING PAGE PARTICLES
// ========================================================

function initLandingParticles() {
  const landing = document.getElementById('landing-layer');
  if (!landing) return;
  
  const particles = document.createElement('div');
  particles.className = 'landing-particles';
  landing.insertBefore(particles, landing.firstChild);
  
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'lp-particle';
    const size = Math.random() * 4 + 1;
    p.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      left: ${Math.random() * 100}%;
      animation-duration: ${Math.random() * 12 + 8}s;
      animation-delay: ${Math.random() * 5}s;
    `;
    particles.appendChild(p);
  }
}

// ========================================================
// 11. DAILY CHALLENGE WIDGET
// ========================================================

function injectDailyChallenge() {
  if (selectedRole !== 'student') return;
  const examsSection = document.getElementById('s-exams');
  if (!examsSection || examsSection.querySelector('.daily-challenge-banner')) return;
  
  const today = new Date().toDateString();
  const doneKey = `daily_challenge_${currentUser}_${today}`;
  if (localStorage.getItem(doneKey) === 'done') return;
  
  const challenges = [
    { emoji: '⚡', title: 'تحدي اليوم', desc: 'حل 3 اختبارات اليوم وحصل على بونص XP' },
    { emoji: '🔥', title: 'تحدي السرعة', desc: 'أكمل اختبار في نصف الوقت المحدد' },
    { emoji: '🎯', title: 'تحدي الدقة', desc: 'احصل على 100% في أي اختبار اليوم' },
    { emoji: '📚', title: 'تحدي المعرفة', desc: 'جرب اختبار في مادة جديدة اليوم' }
  ];
  const c = challenges[Math.floor(Math.random() * challenges.length)];
  
  const banner = document.createElement('div');
  banner.className = 'daily-challenge-banner';
  banner.innerHTML = `
    <div class="daily-challenge-icon">${c.emoji}</div>
    <div class="daily-challenge-text">
      <h4>${c.title}</h4>
      <p>${c.desc}</p>
    </div>
    <div style="font-size:1.2rem; color:#666;">›</div>
  `;
  banner.onclick = () => {
    localStorage.setItem(doneKey, 'started');
    saAlert(c.desc, 'info');
    banner.remove();
  };
  
  const list = document.getElementById('s-exams-list');
  if (list) list.insertAdjacentElement('beforebegin', banner);
}

// ========================================================
// 12. USER STATUS SYSTEM
// ========================================================

function updateUserStatus(status) {
  if (!currentUser || !selectedRole) return;
  update(ref(db, `users/${selectedRole}s/${currentUser}`), {
    status: status,
    lastSeen: Date.now()
  }).catch(() => {});
}

// Auto-update status
function initStatusSystem() {
  updateUserStatus('online');
  
  // Set status to studying when on exam
  document.addEventListener('visibilitychange', () => {
    updateUserStatus(document.hidden ? 'away' : 'online');
  });
  
  // Update on logout
  window.addEventListener('beforeunload', () => {
    updateUserStatus('offline');
  });
}

// ========================================================
// 13. STUDY TIMER WIDGET
// ========================================================

let studyTimerInterval = null;
let studyTimerSeconds = 0;
let studyTimerActive = false;

function injectStudyTimer() {
  if (selectedRole !== 'student') return;
  const aiSection = document.getElementById('s-ai');
  if (!aiSection || aiSection.querySelector('.study-timer-widget')) return;
  
  const timer = document.createElement('div');
  timer.className = 'study-timer-widget';
  timer.innerHTML = `
    <div style="flex:1;">
      <div style="font-size:0.78rem; color:#555; margin-bottom:4px;">⏱️ وقت المذاكرة</div>
      <div class="study-timer-clock" id="study-clock">00:00</div>
    </div>
    <div class="study-timer-btns">
      <button class="study-timer-btn timer-start" id="study-start-btn" onclick="toggleStudyTimer()">ابدأ</button>
    </div>
    <div style="text-align:left; font-size:0.72rem; color:#555;">
      <div id="study-xp-preview">+XP بعد 25 دقيقة</div>
    </div>
  `;
  
  const msgs = aiSection.querySelector('.ai-messages');
  if (msgs) msgs.insertAdjacentElement('beforebegin', timer);
}

window.toggleStudyTimer = () => {
  studyTimerActive = !studyTimerActive;
  const btn = document.getElementById('study-start-btn');
  
  if (studyTimerActive) {
    btn.textContent = 'إيقاف';
    btn.className = 'study-timer-btn timer-stop';
    studyTimerInterval = setInterval(() => {
      studyTimerSeconds++;
      const m = Math.floor(studyTimerSeconds / 60);
      const s = studyTimerSeconds % 60;
      const clock = document.getElementById('study-clock');
      if (clock) clock.innerText = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      
      // Award XP every 25 minutes
      if (studyTimerSeconds % 1500 === 0) {
        awardXP && awardXP(25, '📚 مذاكرة مستمرة', { examCompleted: false });
        launchConfetti(2000);
        showToast('🎉 مكافأة!', 'حصلت على 25 XP لمذاكرة 25 دقيقة!', 'success', 4000);
      }
    }, 1000);
  } else {
    clearInterval(studyTimerInterval);
    btn.textContent = 'ابدأ';
    btn.className = 'study-timer-btn timer-start';
  }
};

// ========================================================
// 14. QUICK EMOJI REACTIONS ON POSTS
// ========================================================

const REACTIONS = ['👍', '❤️', '🔥', '😂', '😮', '🎉'];

function addReactionPickerToPost(postId, postEl) {
  if (postEl.querySelector('.post-reactions')) return;
  
  const actionsDiv = postEl.querySelector('.reese-actions');
  if (!actionsDiv) return;
  
  // Replace like button with reactions
  const likeBtn = actionsDiv.querySelector('.reese-btn');
  if (!likeBtn) return;
  
  const reactBtn = document.createElement('button');
  reactBtn.className = 'reese-btn';
  reactBtn.style.position = 'relative';
  reactBtn.innerHTML = '👍 <span>إعجاب</span>';
  
  const picker = document.createElement('div');
  picker.className = 'reaction-picker';
  REACTIONS.forEach(emoji => {
    const em = document.createElement('span');
    em.className = 'reaction-emoji';
    em.innerText = emoji;
    em.onclick = (e) => {
      e.stopPropagation();
      addReactionToPost(postId, emoji);
      picker.classList.remove('show');
    };
    picker.appendChild(em);
  });
  reactBtn.appendChild(picker);
  
  let holdTimer;
  reactBtn.addEventListener('touchstart', () => {
    holdTimer = setTimeout(() => picker.classList.toggle('show'), 500);
  }, { passive: true });
  reactBtn.addEventListener('touchend', () => clearTimeout(holdTimer), { passive: true });
  reactBtn.addEventListener('click', () => {
    addReactionToPost(postId, '👍');
  });
  
  likeBtn.replaceWith(reactBtn);
}

async function addReactionToPost(postId, emoji) {
  playSound('like');
  const reactionKey = `reactions_${postId}_${currentUser}`;
  const current = localStorage.getItem(reactionKey);
  if (current === emoji) {
    localStorage.removeItem(reactionKey);
    await update(ref(db, `posts/${postId}/reactions/${emoji}`), { count: firebase.database.ServerValue.increment(-1) }).catch(() => {});
  } else {
    if (current) await update(ref(db, `posts/${postId}/reactions/${current}`), { count: firebase.database.ServerValue.increment(-1) }).catch(() => {});
    localStorage.setItem(reactionKey, emoji);
    await update(ref(db, `posts/${postId}/reactions/${emoji}`), { count: firebase.database.ServerValue.increment(1) }).catch(() => {});
  }
}

// ========================================================
// 15. INITIALIZATION
// ========================================================

const _origLoginSuccess = window.loginSuccess || (() => {});

// Patch loginSuccess - call after existing code
const _patchInit = () => {
  // Run after a short delay to let DOM settle
  setTimeout(() => {
    initVoiceCallSystem();
    initLandingParticles();
    
    if (currentUser) {
      initStatusSystem();
      injectExamSearch();
      injectDailyChallenge();
      injectStudyTimer();
      _wrapSubmitExam();
      
      // Show swipe hint once
      const hintKey = `swipe_hint_${currentUser}`;
      if (!localStorage.getItem(hintKey)) {
        const hint = document.createElement('div');
        hint.className = 'swipe-hint';
        hint.innerHTML = '<i class="ph-bold ph-arrows-left-right"></i> اسحب للتنقل بين الأقسام';
        document.body.appendChild(hint);
        setTimeout(() => hint.remove(), 3500);
        localStorage.setItem(hintKey, '1');
      }
    }
  }, 800);
};

// Hook into tab switches
const _origSwitchTab = window.switchTab;
window.switchTab = function(tabId, btn) {
  _origSwitchTab.call(this, tabId, btn);
  setTimeout(() => {
    addAvatarToCards();
    if (tabId === 's-exams') {
      injectExamSearch();
      injectDailyChallenge();
    }
    if (tabId === 's-ai') injectStudyTimer();
  }, 300);
};

// Fire on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _patchInit);
} else {
  _patchInit();
}

// Also fire when user logs in
const _origLoginSuccessGlobal = window.loginSuccess;
if (_origLoginSuccessGlobal) {
  window.loginSuccess = function(...args) {
    _origLoginSuccessGlobal.apply(this, args);
    setTimeout(_patchInit, 1000);
  };
}

console.log('✅ SA EDU v2 Additions Loaded');
