import { getDatabase, ref, set, get, update, remove, onValue, onDisconnect, push } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

let _voiceDb = null;
let _voiceCurrentUser = null;
let _voiceMyUid = null;

let voiceLocalStream = null;
let voicePeer = null;
let voiceMyPeerId = null;
let voiceActiveRoom = null;
let voiceRoomRef = null;
let voiceAudioCtx = null;
let voiceAudioSource = null;
let voiceAudioDest = null;
let voiceCurrentFilter = null;
let voiceIsMuted = false;
let voiceCalls = {};
let voiceRoomOwnerId = null;
let voiceKnownPeers = new Set();
let voiceCurrentRoomListener = null;

export function initVoiceModule(db, currentUser, myUid) {
    _voiceDb = db;
    _voiceCurrentUser = currentUser;
    _voiceMyUid = myUid;

    window.openVoiceRooms    = openVoiceRooms;
    window.closeVoiceRooms   = closeVoiceRooms;
    window.voiceCreateRoom   = voiceCreateRoom;
    window.voiceJoinRoom     = voiceJoinRoom;
    window.voiceConfirmEntry = voiceConfirmEntry;
    window.voiceToggleMic    = voiceToggleMic;
    window.voiceExitRoom     = voiceExitRoom;
    window.voiceToggleFilters= voiceToggleFilters;
    window.voiceApplyFilter  = voiceApplyFilter;
    window.voiceKickUser     = voiceKickUser;
    window.voiceShareRoom    = voiceShareRoom;
    window.closeVoiceGate    = closeVoiceGate;

    loadPublicRooms();

    const urlRoom = new URLSearchParams(location.search).get('voiceRoom');
    if (urlRoom) {
        voiceActiveRoom = urlRoom;
        setTimeout(() => { openVoiceRooms(); showVoiceGate(); }, 600);
    }
}

function openVoiceRooms() {
    document.getElementById('voice-rooms-panel').classList.add('open');
    loadPublicRooms();
}
function closeVoiceRooms() {
    document.getElementById('voice-rooms-panel').classList.remove('open');
}

async function loadPublicRooms() {
    const list = document.getElementById('voice-rooms-list');
    if (!list) return;
    list.innerHTML = `<div class="vr-loading"><div class="vr-spin"></div></div>`;

    const snap = await get(ref(_voiceDb, 'voice_rooms')).catch(() => null);
    list.innerHTML = '';

    if (!snap || !snap.exists()) {
        list.innerHTML = `<div class="vr-empty"><i class="ph-bold ph-speaker-slash"></i><p>لا توجد غرف مفتوحة الآن</p></div>`;
        return;
    }

    const rooms = snap.val();
    let count = 0;
    for (const [roomId, roomData] of Object.entries(rooms)) {
        const userCount = roomData.users ? Object.keys(roomData.users).length : 0;
        if (userCount === 0) continue;
        count++;
        const card = document.createElement('div');
        card.className = 'vr-room-card';
        card.innerHTML = `
            <div class="vr-room-icon"><i class="ph-bold ph-microphone"></i></div>
            <div class="vr-room-info">
                <div class="vr-room-name">${roomData.name || 'غرفة #' + roomId}</div>
                <div class="vr-room-meta"><i class="ph-bold ph-users"></i> ${userCount} مشارك</div>
            </div>
            <button class="vr-join-btn" onclick="voiceJoinRoom('${roomId}')">انضم</button>
        `;
        list.appendChild(card);
    }
    if (count === 0) {
        list.innerHTML = `<div class="vr-empty"><i class="ph-bold ph-speaker-slash"></i><p>لا توجد غرف مفتوحة الآن</p></div>`;
    }
}

window.voiceCreateRoom = async () => {
    const nameInput = document.getElementById('voice-room-name-input');
    const name = nameInput?.value.trim() || `غرفة ${_voiceCurrentUser}`;
    voiceActiveRoom = Math.random().toString(36).substr(2, 6).toUpperCase();
    await set(ref(_voiceDb, `voice_rooms/${voiceActiveRoom}/owner`), _voiceMyUid);
    await set(ref(_voiceDb, `voice_rooms/${voiceActiveRoom}/name`), name);
    if (nameInput) nameInput.value = '';
    showVoiceGate();
};

window.voiceJoinRoom = (roomId) => {
    voiceActiveRoom = roomId;
    showVoiceGate();
};

function showVoiceGate() {
    document.getElementById('voice-audio-gate').classList.add('show');
}

window.closeVoiceGate = () => {
    document.getElementById('voice-audio-gate').classList.remove('show');
    voiceActiveRoom = null;
};

window.voiceConfirmEntry = async () => {
    const btn = document.getElementById('voice-gate-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="ph-bold ph-circle-notch"></i> جاري الاتصال...';

    try {
        voiceAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (voiceAudioCtx.state === 'suspended') await voiceAudioCtx.resume();

        voiceLocalStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
            video: false
        });

        voiceAudioSource = voiceAudioCtx.createMediaStreamSource(voiceLocalStream);
        voiceAudioDest   = voiceAudioCtx.createMediaStreamDestination();
        voiceAudioSource.connect(voiceAudioDest);

        const peerConfig = {
            debug: 0,
            config: {
                iceServers: [
                    { urls: "stun:stun.relay.metered.ca:80" },
                    { urls: "turn:global.relay.metered.ca:80",      username: "14d6a892afc9dbe41c8e0de2", credential: "jWoQ1RL0jVlh/dNY" },
                    { urls: "turn:global.relay.metered.ca:443",     username: "14d6a892afc9dbe41c8e0de2", credential: "jWoQ1RL0jVlh/dNY" },
                    { urls: "turns:global.relay.metered.ca:443?transport=tcp", username: "14d6a892afc9dbe41c8e0de2", credential: "jWoQ1RL0jVlh/dNY" }
                ]
            }
        };

        voicePeer = new Peer(_voiceMyUid + '_v_' + Date.now().toString(36), peerConfig);

        voicePeer.on('open', id => {
            voiceMyPeerId = id;
            startVoiceRoom();
        });

        voicePeer.on('call', call => {
            call.answer(voiceAudioDest.stream);
            call.on('stream', stream => handleVoiceRemoteStream(stream, call.peer));
            voiceCalls[call.peer] = call;
        });

        voicePeer.on('error', err => {
            if (err.type !== 'peer-unavailable') showVoiceToast('⚠️ خطأ في الاتصال');
        });

        document.getElementById('voice-audio-gate').classList.remove('show');
        document.getElementById('voice-rooms-panel').classList.remove('open');
        document.getElementById('voice-room-screen').classList.add('open');
        window.history.replaceState({}, '', `${location.pathname}?voiceRoom=${voiceActiveRoom}#${location.hash.replace('#','')}`);

        voiceKnownPeers.clear();
        voiceKnownPeers.add(_voiceMyUid);

    } catch (e) {
        console.error(e);
        btn.disabled = false;
        btn.innerHTML = '<i class="ph-bold ph-microphone"></i> دخول الغرفة';
        showVoiceToast('❌ يرجى السماح بالوصول للمايكروفون');
    }
};

function startVoiceRoom() {
    voiceRoomRef = ref(_voiceDb, `voice_rooms/${voiceActiveRoom}/users/${_voiceMyUid}`);
    set(voiceRoomRef, { name: _voiceCurrentUser, peerId: voiceMyPeerId, online: true, isMuted: false });
    onDisconnect(voiceRoomRef).remove();

    get(ref(_voiceDb, `voice_rooms/${voiceActiveRoom}/owner`)).then(snap => {
        voiceRoomOwnerId = snap.exists() ? snap.val() : _voiceMyUid;
        if (!snap.exists()) set(ref(_voiceDb, `voice_rooms/${voiceActiveRoom}/owner`), _voiceMyUid);
    });

    get(ref(_voiceDb, `voice_rooms/${voiceActiveRoom}/name`)).then(snap => {
        if (snap.exists()) {
            const nameEl = document.getElementById('vroom-name');
            if (nameEl) nameEl.innerText = snap.val();
        }
    });

    voiceCurrentRoomListener = onValue(ref(_voiceDb, `voice_rooms/${voiceActiveRoom}/users`), (snap) => {
        const users = snap.val() || {};
        const roomOpen = document.getElementById('voice-room-screen').classList.contains('open');
        const miniBar = document.getElementById('mini-call-bar');
        const isInCall = roomOpen || (miniBar && miniBar.style.display !== 'none');

        if (isInCall && !users[_voiceMyUid]) {
            if (window.showInAppNotif) showInAppNotif('المكالمة', 'تم إزالتك من الغرفة');
            setTimeout(voiceExitRoom, 800);
            return;
        }

        Object.keys(users).forEach(uid => {
            if (!voiceKnownPeers.has(uid)) {
                voiceKnownPeers.add(uid);
                playVoiceJoinSound();
            }
        });

        renderVoiceUsers(users);

        Object.values(users).forEach(u => {
            if (u.peerId && u.peerId !== voiceMyPeerId && !voiceCalls[u.peerId]) {
                const call = voicePeer.call(u.peerId, voiceAudioDest.stream);
                if (call) {
                    call.on('stream', stream => handleVoiceRemoteStream(stream, u.peerId));
                    voiceCalls[u.peerId] = call;
                }
            }
        });
    });
}

function handleVoiceRemoteStream(stream, peerId) {
    let audio = document.getElementById('vaudio-' + peerId);
    if (!audio) {
        audio = document.createElement('audio');
        audio.id = 'vaudio-' + peerId;
        audio.autoplay = true;
        audio.playsInline = true;
        document.getElementById('voice-audio-container').appendChild(audio);
    }
    audio.srcObject = stream;
    audio.play().catch(() => {});

    try {
        const remoteCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = remoteCtx.createMediaStreamSource(stream);
        voiceMonitorVolume(source, peerId, remoteCtx);
    } catch (e) {}
}

function voiceMonitorVolume(source, id, ctx) {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.5;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const check = () => {
        if (!document.getElementById('voice-room-screen').classList.contains('open')) return;
        analyser.getByteFrequencyData(data);
        const vol = data.reduce((a, b) => a + b) / data.length;
        const card = document.querySelector(`.vr-user-card[data-peer="${id}"]`);
        if (card) card.classList.toggle('speaking', vol > 10);
        requestAnimationFrame(check);
    };
    check();
}

function renderVoiceUsers(users) {
    const grid = document.getElementById('voice-users-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const list = Object.entries(users);

    document.getElementById('vroom-count').innerText = list.length + ' مشارك';

    const isOwner = (_voiceMyUid === voiceRoomOwnerId);

    list.forEach(([uid, u]) => {
        const isMe = uid === _voiceMyUid;
        const initials = (u.name || 'U').substring(0, 2).toUpperCase();
        const hue = Math.abs(hashCode(uid)) % 360;

        const card = document.createElement('div');
        card.className = `vr-user-card${isMe ? ' me' : ''}`;
        card.dataset.peer = u.peerId;
        card.innerHTML = `
            <div class="vr-avatar" style="--av-hue:${hue}deg">
                ${initials}
                ${u.isMuted ? '<div class="vr-mute-dot"><i class="ph-bold ph-microphone-slash"></i></div>' : ''}
            </div>
            <div class="vr-waves" id="vwave-${u.peerId}">
                <span></span><span></span><span></span><span></span>
            </div>
            <div class="vr-username">${u.name || 'مجهول'}${isMe ? ' <span class="vr-me-tag">أنت</span>' : ''}</div>
            ${isOwner && !isMe ? `<button class="vr-kick-btn" onclick="voiceKickUser('${uid}')"><i class="ph-bold ph-user-minus"></i></button>` : ''}
        `;
        grid.appendChild(card);
    });

    if (voiceAudioSource) voiceMonitorVolume(voiceAudioSource, _voiceMyUid, voiceAudioCtx);
}

window.voiceKickUser = (uid) => {
    if (confirm('إزالة هذا المستخدم؟')) {
        remove(ref(_voiceDb, `voice_rooms/${voiceActiveRoom}/users/${uid}`))
            .then(() => showVoiceToast('تم الإزالة'));
    }
};

window.voiceToggleMic = () => {
    voiceIsMuted = !voiceIsMuted;
    if (voiceLocalStream) voiceLocalStream.getAudioTracks()[0].enabled = !voiceIsMuted;
    if (voiceRoomRef) update(voiceRoomRef, { isMuted: voiceIsMuted });

    const btn = document.getElementById('vr-mic-btn');
    if (voiceIsMuted) {
        btn.innerHTML = '<i class="ph-bold ph-microphone-slash"></i>';
        btn.classList.remove('active');
        showVoiceToast('🔇 الميكروفون مكتوم');
    } else {
        btn.innerHTML = '<i class="ph-bold ph-microphone"></i>';
        btn.classList.add('active');
        showVoiceToast('🎙️ الميكروفون مفعّل');
    }
};

window.voiceExitRoom = () => {
    if (voiceRoomRef) remove(voiceRoomRef);
    if (voiceLocalStream) { voiceLocalStream.getTracks().forEach(t => t.stop()); voiceLocalStream = null; }
    if (voicePeer) { voicePeer.destroy(); voicePeer = null; }
    if (voiceCurrentRoomListener) { voiceCurrentRoomListener(); voiceCurrentRoomListener = null; }

    Object.values(voiceCalls).forEach(c => { try { c.close(); } catch(e){} });
    voiceCalls = {}; voiceMyPeerId = null; voiceActiveRoom = null; voiceIsMuted = false;
    voiceRoomOwnerId = null; voiceKnownPeers.clear();

    const audioContainer = document.getElementById('voice-audio-container');
    if (audioContainer) audioContainer.innerHTML = '';
    document.getElementById('voice-room-screen').classList.remove('open');
    document.getElementById('mini-call-bar')?.remove();

    const url = location.href.replace(/[?&]voiceRoom=[^&#]*/g, '').replace(/\?$/, '');
    window.history.replaceState({}, '', url);

    const btn = document.getElementById('voice-gate-btn');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph-bold ph-microphone"></i> دخول الغرفة'; }
};

window.voiceShareRoom = () => {
    const url = `${location.origin}${location.pathname}?voiceRoom=${voiceActiveRoom}`;
    if (navigator.share) {
        navigator.share({ title: 'غرفة صوتية - SA EDU', text: 'انضم معي في غرفة صوتية على SA EDU', url }).catch(() => {});
    } else {
        navigator.clipboard.writeText(url).then(() => showVoiceToast('تم نسخ رابط الغرفة ✓'));
    }
};

window.voiceToggleFilters = () => {
    document.getElementById('vr-filter-menu').classList.toggle('show');
};

window.voiceApplyFilter = (type, el) => {
    document.querySelectorAll('.vr-filter-opt').forEach(o => o.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('vr-filter-menu').classList.remove('show');
    if (!voiceAudioSource) return;

    voiceAudioSource.disconnect();
    if (voiceCurrentFilter) { try { voiceCurrentFilter.disconnect(); } catch(e){} voiceCurrentFilter = null; }

    if (type === 'none') {
        voiceAudioSource.connect(voiceAudioDest);
        showVoiceToast('🔊 بدون فلتر');
    } else if (type === 'deep') {
        const f = voiceAudioCtx.createBiquadFilter();
        f.type = 'lowshelf'; f.frequency.value = 200; f.gain.value = 12;
        voiceAudioSource.connect(f); f.connect(voiceAudioDest);
        voiceCurrentFilter = f;
        showVoiceToast('🎚️ صوت عميق');
    } else if (type === 'echo') {
        const delay = voiceAudioCtx.createDelay(); delay.delayTime.value = 0.15;
        const fb = voiceAudioCtx.createGain(); fb.gain.value = 0.2;
        delay.connect(fb); fb.connect(delay);
        voiceAudioSource.connect(voiceAudioDest);
        voiceAudioSource.connect(delay); delay.connect(voiceAudioDest);
        voiceCurrentFilter = delay;
        showVoiceToast('🎵 صدى صوت');
    } else if (type === 'robot') {
        const osc = voiceAudioCtx.createOscillator();
        osc.frequency.value = 50;
        const ring = voiceAudioCtx.createGain(); ring.gain.value = 0.5;
        osc.connect(ring);
        const gain = voiceAudioCtx.createGain(); gain.gain.value = 0.5;
        voiceAudioSource.connect(gain); gain.connect(voiceAudioDest);
        ring.connect(voiceAudioDest);
        osc.start();
        voiceCurrentFilter = { disconnect: () => { try { osc.stop(); } catch(e){} } };
        showVoiceToast('🤖 صوت روبوت');
    }
};

function showVoiceToast(msg) {
    if (window.showToast) { window.showToast(msg, '', 'info', 2000); return; }
    let t = document.getElementById('voice-toast');
    if (!t) { t = document.createElement('div'); t.id = 'voice-toast'; document.body.appendChild(t); }
    t.innerText = msg; t.classList.add('show');
    clearTimeout(t._tid);
    t._tid = setTimeout(() => t.classList.remove('show'), 2200);
}

function playVoiceJoinSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.frequency.value = 880; osc.type = 'sine';
        g.gain.setValueAtTime(0.3, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(); osc.stop(ctx.currentTime + 0.4);
    } catch (e) {}
}

function hashCode(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = Math.imul(31, h) + str.charCodeAt(i) | 0; }
    return h;
}
