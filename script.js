import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, get, onValue, push, remove, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { initVoiceModule } from "./voice.js";

const firebaseConfig = {
    apiKey: "AIzaSyAjE-2q6PONBkCin9ZN22gDp9Q8pAH9ZW8",
    authDomain: "story-97cf7.firebaseapp.com",
    databaseURL: "https://story-97cf7-default-rtdb.firebaseio.com",
    projectId: "story-97cf7",
    storageBucket: "story-97cf7.firebasestorage.app",
    messagingSenderId: "742801388214",
    appId: "1:742801388214:web:32a305a8057b0582c5ec17"
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let selectedRole = 'student'; 
let currentUser = null;
let currentQuestions = [];
let currentImgBase64 = null;
let aiGenImgBase64 = null;
let currentChatId = null;
let currentChatMessages = [];
let isIncognito = false;
let isEditingMode = false;
let editingTestId = null;
let isMyPostsView = false;
let reeseImages = []; 
let myUid = null;
let activeChatRoomId = null;

const TEACHER_TABS = ['t-library', 't-reese', 't-dardasha', 't-ai'];
const STUDENT_TABS = ['s-exams', 's-reese', 's-dardasha', 's-ai'];
let _suppressHistoryPush = false;

let _swipeStartX = 0;
let _swipeStartY = 0;
let _swipeStartTarget = null;

let lastScrollTop = 0;
function handleNavScroll(st) {
    const nav = document.querySelector('.top-nav');
    if (!nav) return;
    if (st > lastScrollTop && st > 60) {
        nav.classList.add('nav-hidden');
    } else if (st < lastScrollTop - 5) {
        nav.classList.remove('nav-hidden');
    }
    lastScrollTop = st <= 0 ? 0 : st;
}
window.addEventListener('scroll', () => handleNavScroll(window.pageYOffset || document.documentElement.scrollTop), { passive: true });
document.addEventListener('scroll', (e) => {
    const t = e.target;
    if (t && t.nodeType === 1 && t.classList && (t.classList.contains('app-section') || t.classList.contains('chat-msgs-area') || t.classList.contains('feed-container'))) {
        handleNavScroll(t.scrollTop);
    }
}, true);

window.addEventListener('popstate', (e) => {
    if (!currentUser) return;
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;
    
    const tabs = selectedRole === 'teacher' ? TEACHER_TABS : STUDENT_TABS;
    const portal = selectedRole === 'teacher' ? 'teacher-app' : 'student-app';
    const idx = tabs.indexOf(hash);
    
    if (idx !== -1) {
        _suppressHistoryPush = true;
        const navBtns = document.querySelectorAll(`#${portal} .nav-btn`);
        switchTab(hash, navBtns[idx]);
        _suppressHistoryPush = false;
    }
});

function initKeyboardFix() {
    if (!window.visualViewport) return;
    
    let lastViewportHeight = window.visualViewport.height;
    
    window.visualViewport.addEventListener('resize', () => {
        const vvHeight = window.visualViewport.height;
        const vvTop = window.visualViewport.offsetTop;
        const diff = window.innerHeight - vvHeight - vvTop;
        
        const geminiWrapper = document.querySelector('.gemini-input-wrapper');
        if (geminiWrapper) {
            geminiWrapper.style.bottom = Math.max(0, diff) + 'px';
        }
        
        const chatInputAreas = document.querySelectorAll('.chat-input-area');
        chatInputAreas.forEach(area => {
            area.style.bottom = Math.max(0, diff) + 'px';
            area.style.position = diff > 50 ? 'sticky' : 'absolute';
        });
        
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
            setTimeout(() => {
                activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 100);
        }
        
        lastViewportHeight = vvHeight;
    });
}

function initSwipeNavigation(portalId) {
    let startX = 0, startY = 0, startTarget = null, startTime = 0;
    const THRESHOLD = 40;

    document.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        startTarget = e.target;
        startTime = Date.now();
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (document.getElementById('call-ui') || document.getElementById('voice-room-screen')?.classList.contains('open')) return;
        if (startTarget?.closest('input,textarea,.msg-ctx-menu,.vr-panel,#voice-audio-gate,#ai-history-sidebar')) return;

        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        const dt = Date.now() - startTime;

        if (Math.abs(dx) < THRESHOLD || Math.abs(dy) > Math.abs(dx) * 1.2 || dt > 800) return;

        const tabs = selectedRole === 'teacher' ? TEACHER_TABS : STUDENT_TABS;
        const currentHash = window.location.hash.replace('#','');
        let idx = tabs.indexOf(currentHash);
        if (idx === -1) idx = 0;

        const newIdx = dx < 0 ? idx + 1 : idx - 1;
        if (newIdx < 0 || newIdx >= tabs.length) return;

        const portal = selectedRole === 'teacher' ? 'teacher-app' : 'student-app';
        const navBtns = document.querySelectorAll(`#${portal} .nav-btn`);
        switchTab(tabs[newIdx], navBtns[newIdx]);
    }, { passive: true });
}

function updateTabDots(activeTabId) {
    const dotsContainer = document.getElementById('tab-dots');
    if (!dotsContainer) return;
    
    const tabs = selectedRole === 'teacher' ? TEACHER_TABS : STUDENT_TABS;
    dotsContainer.innerHTML = '';
    
    tabs.forEach((tab, idx) => {
        const dot = document.createElement('div');
        dot.className = 'tab-dot' + (tab === activeTabId ? ' active' : '');
        dotsContainer.appendChild(dot);
    });
}

function showTabDots() {
    const dotsContainer = document.getElementById('tab-dots');
    if (dotsContainer) dotsContainer.classList.remove('hidden');
}

function hideTabDots() {
    const dotsContainer = document.getElementById('tab-dots');
    if (dotsContainer) dotsContainer.classList.add('hidden');
}

window.addEventListener('click', function(e) {
    const searchModal = document.getElementById('user-search-modal');
    const profileModal = document.getElementById('profile-info-modal');
    const teacherDetailModal = document.getElementById('teacher-detail-modal');
    const phoneModal = document.getElementById('phone-modal');

    if (e.target === searchModal) {
        searchModal.classList.add('hidden');
    }
    if (e.target === profileModal) {
        profileModal.classList.add('hidden');
    }
    if (e.target === teacherDetailModal) {
        teacherDetailModal.classList.add('hidden');
    }
});

function playSound(type) {
    const chatOnlySounds = ['sent', 'recv'];
    if (!chatOnlySounds.includes(type)) return;
    
    const soundMap = {
        'sent': 'snd-sent',
        'recv': 'snd-recv',
    };
    const id = soundMap[type];
    if(id) {
        const audio = document.getElementById(id);
        if(audio) {
            audio.currentTime = 0;
            audio.play().catch(e => {});
        }
    }
}

function showToast(title, sub = '', type = 'msg', duration = 3000) {
    let container = document.getElementById('sa-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'sa-toast-container';
        document.body.appendChild(container);
    }
    
    const icons = {
        msg:     'fas fa-comment-dots',
        success: 'fas fa-check',
        error:   'fas fa-exclamation',
        info:    'fas fa-bell',
    };
    
    const toast = document.createElement('div');
    toast.className = `sa-toast ${type}`;
    toast.innerHTML = `
        <div class="sa-toast-icon"><i class="${icons[type] || icons.msg}"></i></div>
        <div class="sa-toast-body">
            <div class="sa-toast-title">${title}</div>
            ${sub ? `<div class="sa-toast-sub">${sub}</div>` : ''}
        </div>
    `;
    
    toast.onclick = () => removeToast(toast);
    container.appendChild(toast);
    
    setTimeout(() => removeToast(toast), duration);
}

function removeToast(toast) {
    if (!toast || toast.classList.contains('removing')) return;
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 280);
}

function makeLinksClickable(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, function(url) {
        return `<a href="${url}" target="_blank" class="clickable-link">${url}</a>`;
    });
}

function toggleConstructionOverlay(show, title="SA AI Building...", sub="جاري المعالجة") {
    const ol = document.getElementById('construction-overlay');
    if (show) {
        ol.querySelector('.construction-text').innerText = title;
        ol.querySelector('.construction-sub').innerText = sub;
        ol.classList.add('active');
    } else {
        ol.classList.remove('active');
    }
}

function getSkeletonHTML() {
    return `
    <div class="skeleton-loader">
        <div class="skeleton-header">
            <div class="skeleton-circle"></div>
            <div class="skeleton-text">
                <div class="skeleton-line short"></div>
                <div class="skeleton-line" style="width:30%"></div>
            </div>
        </div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-rect"></div>
    </div>`;
}
function getMultipleSkeletons(count = 3) {
    let html = ''; for(let i=0; i<count; i++) html += getSkeletonHTML(); return html;
}

function getEmptyStateHTML(type) {
    if(type === 'posts') {
        return `<div class="empty-state-container"><div class="empty-avatar"><i class="fas fa-box-open" style="color:#666;"></i></div><h3 style="color:#888;">لا توجد منشورات حالياً</h3><p style="color:#555; font-size:0.9rem;">كن أول من يشارك أفكاره!</p></div>`;
    } else if (type === 'exams') {
        return `<div class="empty-state-container"><div class="empty-avatar"><i class="fas fa-folder-open" style="color:#666;"></i></div><h3 style="color:#888;">لا توجد اختبارات</h3><p style="color:#555; font-size:0.9rem;">استمتع بوقتك، لا يوجد ضغط الآن.</p></div>`;
    } else if (type === 'chats') {
        return `<div class="empty-state-container dardasha-empty-state">
            <div class="dardasha-empty-avatar">
                <div class="dardasha-orb-pulse"></div>
                <i class="fab fa-telegram-plane dardasha-empty-icon"></i>
            </div>
            <h3 style="color:#888; margin: 15px 0 8px;">لا توجد محادثات بعد</h3>
            <p style="color:#555; font-size:0.9rem; margin-bottom: 20px;">ابدأ محادثة مع أي شخص الآن</p>
            <button class="dardasha-start-btn" onclick="toggleUserSearchModal()">
                <i class="fas fa-plus"></i> ابدأ محادثة جديدة
            </button>
        </div>`;
    }
    return '';
}

window.saAlert = (msg, type = 'info', title = null) => {
    const simpleTypes = ['success', 'info'];
    if (simpleTypes.includes(type) && !title) {
        const toastType = type === 'success' ? 'success' : 'info';
        showToast(msg, '', toastType, 3000);
        return;
    }
    
    const modal = document.getElementById('sa-custom-alert');
    const iconDiv = document.getElementById('sa-alert-icon');
    const titleDiv = document.getElementById('sa-alert-title');
    const msgDiv = document.getElementById('sa-alert-msg');
    const actionsDiv = document.getElementById('sa-alert-actions');
    actionsDiv.innerHTML = `<button class="sa-btn sa-btn-primary" onclick="closeSaAlert()">حسناً</button>`;
    let iconHtml = ''; let color = '#fff';
    if(type === 'success') { iconHtml = '<i class="fas fa-check-circle"></i>'; color = 'var(--success)'; if(!title) title = 'نجاح'; } 
    else if (type === 'error') { iconHtml = '<i class="fas fa-times-circle"></i>'; color = 'var(--danger)'; if(!title) title = 'خطأ'; } 
    else { iconHtml = '<i class="fas fa-info-circle"></i>'; color = 'var(--accent-primary)'; if(!title) title = 'تنبيه'; }
    iconDiv.innerHTML = iconHtml; iconDiv.style.color = color;
    titleDiv.innerText = title; msgDiv.innerText = msg;
    modal.classList.add('active');
};

window.saConfirm = (msg, onConfirm) => {
    playSound('click');
    const modal = document.getElementById('sa-custom-alert');
    document.getElementById('sa-alert-icon').innerHTML = '<i class="fas fa-question-circle" style="color:var(--warning)"></i>';
    document.getElementById('sa-alert-title').innerText = 'تأكيد';
    document.getElementById('sa-alert-msg').innerText = msg;
    const actionsDiv = document.getElementById('sa-alert-actions');
    actionsDiv.innerHTML = '';
    const btnYes = document.createElement('button');
    btnYes.className = 'sa-btn sa-btn-primary'; btnYes.innerText = 'نعم، متابعة'; btnYes.style.background = 'var(--warning)';
    btnYes.onclick = () => { closeSaAlert(); onConfirm(); };
    const btnNo = document.createElement('button');
    btnNo.className = 'sa-btn sa-btn-secondary'; btnNo.innerText = 'إلغاء';
    btnNo.onclick = closeSaAlert;
    actionsDiv.appendChild(btnNo); actionsDiv.appendChild(btnYes);
    modal.classList.add('active');
};

window.closeSaAlert = () => { playSound('click'); document.getElementById('sa-custom-alert').classList.remove('active'); };

function createAdBanner() {
    return document.createElement('span');
}

const getBase64 = (file) => new Promise((resolve) => {
    const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = () => resolve(reader.result);
});

async function recognizeImageText(imageBase64) {
    try {
        const worker = Tesseract.createWorker({ logger: m => {} });
        await worker.load();
        await worker.loadLanguage('ara+eng');
        await worker.initialize('ara+eng');
        const { data: { text } } = await worker.recognize(imageBase64);
        await worker.terminate();
        return text;
    } catch (error) {
        console.error("OCR Error:", error);
        throw new Error("فشل في قراءة النص من الصورة.");
    }
}

async function callPollinationsAI(messages) {
    const tryFetch = async (model) => {
        const r = await fetch('https://text.pollinations.ai/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages, model, private: true, seed: Math.floor(Math.random()*9999) })
        });
        if (!r.ok) throw new Error(r.status);
        const txt = await r.text();
        if (!txt || txt.trim().length === 0) throw new Error('empty');
        return txt;
    };
    try { return await tryFetch('openai'); }
    catch(e) {
        try { return await tryFetch('mistral'); }
        catch(e2) { throw new Error('فشل الاتصال بالذكاء الاصطناعي: ' + e2.message); }
    }
}

window.goToAuth = () => {
        playSound('click');
        document.getElementById('landing-layer').classList.add('hidden');
        document.getElementById('auth-layer').classList.remove('hidden');
        setAuthRole('student');
};

window.setAuthRole = (role) => {
    playSound('click');
    selectedRole = role;
    const icon = role === 'student' ? 'fa-user-astronaut' : 'fa-user-tie';
    const color = role === 'student' ? 'var(--accent-primary)' : 'var(--accent-gold)';
    document.getElementById('btn-role-student').classList.toggle('active', role === 'student');
    document.getElementById('btn-role-teacher').classList.toggle('active', role === 'teacher');
    const display = document.getElementById('auth-avatar-display');
    display.innerHTML = `<i class="fas ${icon}"></i>`;
    display.style.color = color; display.style.borderColor = color;
    display.className = `avatar-frame avatar-${role}`;
};

window.backToLanding = () => {
    playSound('click');
    document.getElementById('auth-layer').classList.add('hidden');
    document.getElementById('landing-layer').classList.remove('hidden');
};

window.handleSmartAuth = async () => {
    playSound('click');
    const name1 = document.getElementById('auth-name-1').value.trim();
    const name2 = document.getElementById('auth-name-2').value.trim();
    const name3 = document.getElementById('auth-name-3').value.trim();
    const pass = document.getElementById('auth-pass').value.trim();
    const status = document.getElementById('auth-status');
    if (!name1 || !name2 || !name3 || !pass) return status.innerText = "يرجى ملء جميع الحقول";
    const passRegex = /^[a-zA-Z0-9]+$/;
    if (pass.length !== 6 || !passRegex.test(pass)) return status.innerText = "كلمة المرور يجب أن تكون 6 خانات (حروف إنجليزية وأرقام فقط)";
    const fullName = `${name1} ${name2} ${name3}`;
    status.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> جارِ الاتصال...';
    const userRef = ref(db, `users/${selectedRole}s/${fullName}`);
    try {
        const snap = await get(userRef);
        if (snap.exists()) {
            if (snap.val().password === pass) {
                const savedIcon = snap.val().icon;
                let uid = snap.val().uid;
                if(!uid) {
                    uid = generateUID();
                    await update(userRef, { uid: uid });
                }
                loginSuccess(fullName, savedIcon, uid);
            } else status.innerText = "كلمة المرور غير صحيحة";
        } else {
            const defaultIcon = selectedRole === 'student' ? 'fa-user-astronaut' : 'fa-user-tie';
            const uid = generateUID();
            await set(userRef, { password: pass, joined: Date.now(), icon: defaultIcon, uid: uid });
            loginSuccess(fullName, defaultIcon, uid);
        }
    } catch (e) { console.error(e); status.innerText = "حدث خطأ في الاتصال"; }
};

function generateUID() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function loginSuccess(name, icon, uid) {
    playSound('success');
    currentUser = name;
    myUid = uid || null;
    localStorage.setItem('sa_user', name);
    localStorage.setItem('sa_role', selectedRole);
    localStorage.setItem('sa_icon', icon || (selectedRole === 'student' ? 'fa-user-astronaut' : 'fa-user-tie'));
    if (uid) localStorage.setItem('sa_uid', uid);
    
    document.getElementById('landing-layer').classList.add('hidden');
    document.getElementById('auth-layer').classList.add('hidden');
    updateMenuInfo();

    const portalId = selectedRole === 'teacher' ? 'teacher-app' : 'student-app';
    const portalEl = document.getElementById(portalId);
    const allTabs = selectedRole === 'teacher' ? TEACHER_TABS : STUDENT_TABS;

    if (portalEl) {
        portalEl.querySelectorAll('.app-section').forEach(s => s.classList.remove('active'));
        portalEl.classList.remove('hidden');
    }

    const defaultTab = selectedRole === 'teacher' ? 't-library' : 's-exams';
    const hashTab = window.location.hash.replace('#', '');
    const startTab = (hashTab && allTabs.includes(hashTab)) ? hashTab : defaultTab;

    const startSection = document.getElementById(startTab);
    if (startSection) startSection.classList.add('active');
    _currentTabId = startTab;
    updateTabDots(startTab);

    const navBtns = portalEl ? portalEl.querySelectorAll('.nav-btn') : [];
    const startIdx = allTabs.indexOf(startTab);
    navBtns.forEach((b, i) => b.classList.toggle('active', i === startIdx));

    if (selectedRole === 'teacher') {
        initTeacherApp();
        setTimeout(() => initSwipeNavigation('teacher-app'), 500);
    } else {
        loadStudentExams(); loadStudentGrades(); initStudentReese();
        updateStreakOnLogin();
        setTimeout(() => renderXPHud(), 300);
        setTimeout(() => initSwipeNavigation('student-app'), 500);
        setTimeout(() => { if (!currentChatId) startNewChat('s'); }, 100);
    }
    initDardasha();
    initVoiceModule(db, currentUser, myUid);
    initGlobalCallListener();
    initKeyboardFix();
    handleDeepLinksAndRouting();
    showTabDots();
    if (selectedRole === 'student') {
        setTimeout(() => {
            startTypewriter('student-type-text', 'تحليل المستوى الدراسي');
            triggerAIAnalysisBadge();
        }, 600);
        setTimeout(() => renderXPHud(), 300);
    }
    if (selectedRole === 'teacher') startTypewriter('cta-type-text', 'اضغط هنا لكتابة الامتحان');
    checkOnboarding();
}

function updateOGMeta(title, description, imageUrl) {
    const baseUrl = window.location.href.split('?')[0];
    const fullUrl = window.location.href;

    const set = (selector, attr, val) => {
        const el = document.querySelector(selector);
        if (el) el.setAttribute(attr, val);
    };

    document.title = title + ' | SA EDU';
    set('meta[property="og:title"]', 'content', title);
    set('meta[property="og:description"]', 'content', description);
    set('meta[property="og:url"]', 'content', fullUrl);
    set('meta[name="twitter:title"]', 'content', title);
    set('meta[name="twitter:description"]', 'content', description);
    if (imageUrl) {
        set('meta[property="og:image"]', 'content', imageUrl);
        set('meta[name="twitter:image"]', 'content', imageUrl);
    }
    set('link[rel="canonical"]', 'href', fullUrl);
}

async function handleDeepLinks() {
    const params = new URLSearchParams(window.location.search);
    const shareId  = params.get('shareId');
    const examId   = params.get('examId');
    const postId   = params.get('postId');
    const chatUid  = params.get('chat');
    const chatRoom = params.get('room');
    const aiTab    = params.get('aiTab');

    if (!shareId && !examId && !postId && !chatUid && !chatRoom && !aiTab) return;

    showDeepLinkLoader();

    if (aiTab) {
        const prefix = selectedRole === 'teacher' ? 't' : 's';
        updateOGMeta('المساعد الذكي SA AI', 'تحدث مع مساعد الذكاء الاصطناعي على SA EDU');
        switchTab(`${prefix}-ai`);
        hideDeepLinkLoader();
        return;
    }

    if (shareId) {
        const prefix = selectedRole === 'teacher' ? 't' : 's';
        updateOGMeta('محادثة AI مشاركة', 'شاهد هذه المحادثة مع الذكاء الاصطناعي على SA EDU');
        switchTab(`${prefix}-ai`);
        loadSharedChat(shareId, prefix);
        hideDeepLinkLoader();
        return;
    }

    if (examId) {
        const snap = await get(ref(db, `tests/${examId}`));
        if (snap.exists()) {
            const d = snap.val();
            const subjectLabel = d.subject || 'اختبار';
            updateOGMeta(
                `${subjectLabel}: ${d.title}`,
                `اختبار ${subjectLabel} • ${d.questions?.length || 0} سؤال • ${d.duration} دقيقة • أعده ${d.teacher}`,
            );

            if (selectedRole === 'student') {
                switchTab('s-exams');
                hideDeepLinkLoader();
                checkPhoneAndStart(examId);
            } else {
                switchTab('t-library');
                hideDeepLinkLoader();
                await new Promise(r => setTimeout(r, 300));
                const card = document.querySelector(`[data-exam-id="${examId}"]`);
                if (card) { card.scrollIntoView({ behavior: 'smooth' }); card.style.border = '2px solid var(--accent-gold)'; setTimeout(() => card.style.border = '', 3000); }
                saAlert("هذا رابط امتحان. كمعلم يمكنك تعديله من المكتبة.", "info");
            }
        } else {
            hideDeepLinkLoader();
            saAlert("الامتحان غير موجود أو تم حذفه", "error");
        }
        return;
    }

    if (postId) {
        const prefix = selectedRole === 'teacher' ? 't' : 's';
        const postSnap = await get(ref(db, `posts/${postId}`));
        if (postSnap.exists()) {
            const pd = postSnap.val();
            updateOGMeta(
                `منشور من ${pd.author || 'مستخدم'} على Reese`,
                (pd.content || pd.text || '').substring(0, 160) || 'منشور على منصة SA EDU',
                pd.images?.[0] || pd.image || null
            );
        }
        switchTab(`${prefix}-reese`);
        hideDeepLinkLoader();
        const tryScroll = (attempts = 0) => {
            const el = document.getElementById(`post-${postId}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.style.transition = 'box-shadow 0.4s';
                el.style.boxShadow = '0 0 0 3px var(--accent-primary)';
                setTimeout(() => { el.style.boxShadow = ''; }, 3000);
            } else if (attempts < 10) {
                setTimeout(() => tryScroll(attempts + 1), 200);
            }
        };
        tryScroll();
        return;
    }

    if (chatRoom) {
        const prefix = selectedRole === 'teacher' ? 't' : 's';
        const roomSnap = await get(ref(db, `chat_room_meta/${chatRoom}`));
        if (roomSnap.exists()) {
            const rm = roomSnap.val();
            const otherUid = rm.members?.find(m => m !== myUid);
            const otherName = rm.names?.[otherUid] || 'مستخدم';
            const otherIcon = rm.icons?.[otherUid] || 'fa-user';
            updateOGMeta(`محادثة مع ${otherName}`, `افتح المحادثة مع ${otherName} على SA EDU`);
            switchTab(`${prefix}-dardasha`);
            hideDeepLinkLoader();
            openChatRoom(chatRoom, otherName, otherIcon, otherUid);
        } else {
            switchTab(`${prefix}-dardasha`);
            hideDeepLinkLoader();
        }
        return;
    }

    if (chatUid && chatUid !== myUid) {
        const prefix = selectedRole === 'teacher' ? 't' : 's';
        const usnap = await get(ref(db, `users/students/${chatUid}`)).catch(() => null)
            || await get(ref(db, `users/teachers/${chatUid}`)).catch(() => null);
        let otherName = 'مستخدم', otherIcon = 'fa-user';
        if (usnap?.exists()) {
            const ud = usnap.val();
            otherName = ud.username || 'مستخدم';
            otherIcon = ud.icon || 'fa-user';
            updateOGMeta(`تواصل مع ${otherName}`, `ابدأ محادثة مع ${otherName} على SA EDU`);
        }
        switchTab(`${prefix}-dardasha`);
        hideDeepLinkLoader();
        const existingSnap = await get(ref(db, `user_chats/${myUid}`)).catch(() => null);
        let existingChatId = null;
        if (existingSnap?.exists()) {
            for (const [cid, cinfo] of Object.entries(existingSnap.val())) {
                if (cinfo.otherUid === chatUid) { existingChatId = cid; break; }
            }
        }
        if (existingChatId) {
            openChatRoom(existingChatId, otherName, otherIcon, chatUid);
        } else {
            searchUserById(chatUid);
        }
        return;
    }

    hideDeepLinkLoader();
}

function showDeepLinkLoader() {
    let el = document.getElementById('deeplink-loader');
    if (!el) {
        el = document.createElement('div');
        el.id = 'deeplink-loader';
        el.innerHTML = `<div class="dl-spinner"></div><p>جاري الفتح...</p>`;
        document.body.appendChild(el);
    }
    el.style.display = 'flex';
}

function hideDeepLinkLoader() {
    const el = document.getElementById('deeplink-loader');
    if (el) el.style.display = 'none';
}

function handleDeepLinksAndRouting() {
    const params = new URLSearchParams(window.location.search);
    const hasDeepLink = params.get('shareId') || params.get('examId') || params.get('postId') || params.get('chat') || params.get('room') || params.get('aiTab');
    
    if (hasDeepLink) {
        handleDeepLinks();
        return;
    }
    
    const hash = window.location.hash.replace('#', '');
    const allTabs = selectedRole === 'teacher' ? TEACHER_TABS : STUDENT_TABS;
    const portal = selectedRole === 'teacher' ? 'teacher-app' : 'student-app';
    
    if (hash && allTabs.includes(hash)) {
        const idx = allTabs.indexOf(hash);
        const navBtns = document.querySelectorAll(`#${portal} .nav-btn`);
        _suppressHistoryPush = true;
        switchTab(hash, navBtns[idx]);
        _suppressHistoryPush = false;
    } else {
        const defaultTab = selectedRole === 'teacher' ? 't-library' : 's-exams';
        window.history.replaceState({ tab: defaultTab }, '', '#' + defaultTab);
    }
}

window.toggleMenu = () => {
    playSound('click');
    document.getElementById('menu-modal').classList.toggle('open');
    document.getElementById('menu-edit-section').classList.add('hidden');
    document.getElementById('menu-avatar-section').classList.add('hidden');
};

function updateMenuInfo() {
    document.getElementById('menu-username').innerText = currentUser;
    document.getElementById('menu-role').innerText = selectedRole === 'teacher' ? 'معلم' : 'طالب';
    const iconClass = localStorage.getItem('sa_icon');
    const color = selectedRole === 'teacher' ? 'var(--accent-gold)' : 'var(--accent-primary)';
    document.getElementById('menu-avatar').innerHTML = `<i class="fas ${iconClass}"></i>`;
    document.getElementById('menu-avatar').style.color = color;
    document.getElementById('menu-avatar').style.borderColor = color;
    document.getElementById('edit-name-input').value = currentUser;
    const reeseAvs = document.querySelectorAll('.reese-avatar-mini');
    reeseAvs.forEach(el => { el.innerHTML = `<i class="fas ${iconClass}" style="color:${color}"></i>`; });
    
    document.getElementById('pi-name').innerText = currentUser;
    document.getElementById('pi-avatar').innerHTML = `<i class="fas ${iconClass}"></i>`;
    document.getElementById('pi-avatar').style.color = color;
    document.getElementById('pi-avatar').style.borderColor = color;
    document.getElementById('pi-id-box').innerText = myUid;
    
    const prefix = selectedRole === 'teacher' ? 't' : 's';
    const chatAv = document.getElementById(`${prefix}-chat-my-avatar`);
    if(chatAv) {
        chatAv.innerHTML = `<i class="fas ${iconClass}"></i>`;
        chatAv.style.color = color;
        chatAv.style.borderColor = color;
    }
}

window.toggleEditProfile = () => {
    playSound('click');
    document.getElementById('menu-edit-section').classList.toggle('hidden');
    document.getElementById('menu-avatar-section').classList.add('hidden');
};

window.saveProfileName = async () => {
    playSound('click');
    const newName = document.getElementById('edit-name-input').value.trim();
    if(!newName || newName === currentUser) return;
    saConfirm("تغيير الاسم؟ هيتم نقل بياناتك للاسم الجديد.", async () => {
        try {
            const oldRef = ref(db, `users/${selectedRole}s/${currentUser}`);
            const snapshot = await get(oldRef);
            const data = snapshot.val();
            // Preserve UID when moving to new name
            await set(ref(db, `users/${selectedRole}s/${newName}`), data);
            await remove(oldRef);
            currentUser = newName; 
            localStorage.setItem('sa_user', newName);
            updateMenuInfo(); 
            saAlert("تم تغيير الاسم بنجاح", "success"); 
            toggleEditProfile();
        } catch(e) {
            saAlert("فشل في تغيير الاسم", "error");
        }
    });
};

window.toggleAvatarSelect = () => {
    playSound('click');
    document.getElementById('menu-avatar-section').classList.toggle('hidden');
    document.getElementById('menu-edit-section').classList.add('hidden');
};

window.saveAvatar = async (iconClass) => {
    playSound('click');
    localStorage.setItem('sa_icon', iconClass);
    await update(ref(db, `users/${selectedRole}s/${currentUser}`), { icon: iconClass });
    updateMenuInfo(); toggleAvatarSelect();
};

window.logout = () => { playSound('click'); localStorage.clear(); location.reload(); };

window.shareApp = () => {
    playSound('click');
    const url = window.location.href.split('?')[0]; 
    const text = "انضم لمنصة SA EDU التعليمية المتطورة!";
    if (navigator.share) navigator.share({ title: 'SA EDU', text: text, url: url }).catch(err => console.log(err));
    else { navigator.clipboard.writeText(url).then(() => saAlert("تم نسخ رابط المنصة!", "success")); }
};

function initTeacherApp() {
    loadTeacherTests(); renderOptionFields(); startNewChat('t'); loadReesePosts('t');
    startTypewriter("cta-type-text", "اضغط هنا لكتابة الامتحان");
}
function initStudentReese() { loadReesePosts('s'); }

function startTypewriter(elementId, text) {
    const el = document.getElementById(elementId);
    if(!el) return;
    el.innerHTML = ""; let i = 0;
    function type() { if (i < text.length) { el.innerHTML += text.charAt(i); i++; setTimeout(type, 80); } }
    type();
}
if(document.getElementById('landing-type-text')) { startTypewriter("landing-type-text", "منصة تعليمية ذكية تنقلك إلى آفاق المستقبل"); }

let _currentTabId = null;

// Firebase listener unsubscribe trackers - prevent duplicate listeners
let _reeseListener = null;
let _testsListener = null;
let _dardashaListener = null;
let _chatRoomListener = null;
let _studentExamsListener = null;
let _studentGradesListener = null;
window.switchTab = (tabId, btn) => {
    playSound('click');
    const portal = selectedRole === 'teacher' ? 'teacher-app' : 'student-app';
    const newSection = document.getElementById(tabId);
    if (!newSection) return;
    if (_currentTabId && tabId === _currentTabId) return;

    const tabs = selectedRole === 'teacher' ? TEACHER_TABS : STUDENT_TABS;
    const isAI = tabId.endsWith('-ai');
    const portalEl = document.getElementById(portal);

    if (portalEl) {
        portalEl.querySelectorAll('.app-section').forEach(s => s.classList.remove('active'));
    }

    newSection.classList.add('active');
    _currentTabId = tabId;

    if (btn) {
        document.querySelectorAll(`#${portal} .nav-btn`).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
    if (!_suppressHistoryPush && tabs.includes(tabId)) {
        window.history.pushState({ tab: tabId }, '', '#' + tabId);
    }

    updateTabDots(tabId);

    if (tabId === 's-grades') loadStudentGrades();
    if (tabId === 's-exams') {
        loadStudentExams();
        startTypewriter('student-type-text', 'تحليل المستوى الدراسي');
        if (selectedRole === 'student') setTimeout(() => renderXPHud(), 200);
    }
    if (tabId === 't-library') { loadTeacherTests(); startTypewriter('cta-type-text', 'اضغط هنا لكتابة الامتحان'); }
    if (tabId === 't-reese' || tabId === 's-reese') loadReesePosts(selectedRole === 'teacher' ? 't' : 's');
    if (isAI) {
        const p = tabId.charAt(0);
        const msgsEl = document.getElementById(`${p}-ai-msgs`);
        if (!currentChatId || !msgsEl || msgsEl.children.length === 0) {
            startNewChat(p);
        }
    }
    if (tabId.endsWith('-dardasha')) {
        const prefix = selectedRole === 'teacher' ? 't' : 's';
        const chatList = document.getElementById(`${prefix}-chat-list`);
        if (chatList && chatList.children.length === 0) {
            initDardasha();
        }
    }
};

function initDardasha() {
    const prefix = selectedRole === 'teacher' ? 't' : 's';
    const list = document.getElementById(`${prefix}-chat-list`);
    list.innerHTML = getMultipleSkeletons(2);
    if (_dardashaListener) { _dardashaListener(); _dardashaListener = null; }
    if (!myUid) { list.innerHTML = getEmptyStateHTML('chats'); return; }
    _dardashaListener = onValue(ref(db, `user_chats/${myUid}`), (snap) => {
        list.innerHTML = '';
        if (!snap.exists()) {
            list.innerHTML = getEmptyStateHTML('chats');
            return;
        }

        const chats = snap.val();
        const chatEntries = Object.entries(chats).sort((a, b) => (b[1].lastMsgTime || 0) - (a[1].lastMsgTime || 0));

        chatEntries.forEach(([chatId, chatInfo]) => {
            const el = document.createElement('div');
            el.className = 'chat-item';
            el.onclick = () => openChatRoom(chatId, chatInfo.otherName, chatInfo.otherIcon, chatInfo.otherUid);

            let lastMsgPreview = 'ابدأ المحادثة...';
            if (chatInfo.lastMsg) {
                if (chatInfo.lastMsg.startsWith('data:image')) lastMsgPreview = '📷 صورة';
                else if (chatInfo.lastMsg.startsWith('data:audio')) lastMsgPreview = '🎤 صوت';
                else lastMsgPreview = chatInfo.lastMsg.substring(0, 35) + (chatInfo.lastMsg.length > 35 ? '...' : '');
            }

            const timeStr = chatInfo.lastMsgTime ? new Date(chatInfo.lastMsgTime).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }) : '';

            el.innerHTML = `
                <div class="chat-item-avatar"><i class="fas ${chatInfo.otherIcon || 'fa-user'}"></i></div>
                <div class="chat-item-info">
                    <div class="chat-item-row">
                        <span class="chat-item-name">${chatInfo.otherName}</span>
                        <span class="chat-item-time">${timeStr}</span>
                    </div>
                    <div class="chat-item-preview">${lastMsgPreview}</div>
                </div>
            `;
            list.appendChild(el);
            list.appendChild(createAdBanner());
        });

        chatEntries.forEach(([chatId, chatInfo]) => {
            if (chatInfo.lastMsgTime > Date.now() - 5000 && activeChatRoomId !== chatId) {
                if (chatInfo.lastMsg && !chatInfo.lastMsg.startsWith('data:')) {
                    playSound('recv');
                    showInAppNotif(chatInfo.otherName, chatInfo.lastMsg.substring(0, 50));
                }
            }
        });
    });
}

window.openMyProfileModal = () => {
    playSound('click');
    document.getElementById('profile-info-modal').classList.remove('hidden');
};

window.copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => saAlert("تم النسخ: " + text, "success"));
};

window.copyProfileLink = () => {
    playSound('click');
    const url = `${window.location.href.split('?')[0]}?chat=${myUid}`;
    navigator.clipboard.writeText(url).then(() => saAlert("تم نسخ رابط المحادثة المباشر!", "success"));
};

window.toggleUserSearchModal = () => {
    playSound('click');
    document.getElementById('user-search-modal').classList.remove('hidden');
    document.getElementById('user-search-result').innerHTML = '';
    document.getElementById('user-search-id-input').value = '';
};

window.searchUserById = async (forcedId = null) => {
    playSound('click');
    const id = forcedId || document.getElementById('user-search-id-input').value.trim();
    if(!id) return;
    
    const resultDiv = document.getElementById('user-search-result');
    if(!forcedId) resultDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري البحث...';
    
    let foundUser = null;
    let foundRole = '';
    
    try {
        const sSnap = await get(ref(db, `users/students`));
        if(sSnap.exists()) {
            Object.entries(sSnap.val()).forEach(([name, data]) => {
                if(data && data.uid && String(data.uid) === String(id)) { foundUser = {name, ...data}; foundRole = 'student'; }
            });
        }
        
        if(!foundUser) {
            const tSnap = await get(ref(db, `users/teachers`));
            if(tSnap.exists()) {
                Object.entries(tSnap.val()).forEach(([name, data]) => {
                    if(data && data.uid && String(data.uid) === String(id)) { foundUser = {name, ...data}; foundRole = 'teacher'; }
                });
            }
        }
    } catch(e) {
        if(!forcedId) resultDiv.innerHTML = '<p style="color:var(--danger); text-align:center;">خطأ في البحث</p>';
        return;
    }
    
    if(foundUser) {
        if(forcedId) {
             document.getElementById('user-search-modal').classList.add('hidden');
             startChatWithUser(foundUser.name, foundUser.icon, foundUser.uid);
             return;
        }

        const roleColor = foundRole === 'teacher' ? 'var(--accent-gold)' : 'var(--accent-primary)';
        resultDiv.innerHTML = `
            <div style="background:#222; padding:15px; border-radius:15px; text-align:center; margin-top:15px;">
                <div class="avatar-frame mini-frame" style="margin:0 auto 10px; color:${roleColor}; border-color:${roleColor};">
                    <i class="fas ${foundUser.icon}"></i>
                </div>
                <h4 style="margin:0 0 10px;">${foundUser.name}</h4>
                <button class="modern-btn" onclick="startChatWithUser('${foundUser.name}', '${foundUser.icon}', '${foundUser.uid}')">بدء المحادثة</button>
            </div>
        `;
    } else {
        if(!forcedId) resultDiv.innerHTML = '<p style="color:var(--danger); text-align:center;">المستخدم غير موجود</p>';
    }
};

window.startChatWithUser = async (otherName, otherIcon, otherUid) => {
    document.getElementById('user-search-modal').classList.add('hidden');
    const chatId = myUid < otherUid ? `${myUid}_${otherUid}` : `${otherUid}_${myUid}`;
    
    const myUpdate = { otherName, otherIcon, otherUid, lastMsg: '', lastMsgTime: Date.now() };
    const otherUpdate = { otherName: currentUser, otherIcon: localStorage.getItem('sa_icon'), otherUid: myUid, lastMsg: '', lastMsgTime: Date.now() };
    
    await update(ref(db, `user_chats/${myUid}/${chatId}`), myUpdate);
    await update(ref(db, `user_chats/${otherUid}/${chatId}`), otherUpdate);
    
    openChatRoom(chatId, otherName, otherIcon, otherUid);
};

let _activeChatMsgKeys = {};
let _voiceRec = null;
let _voiceChunks = [];
let _voiceRecording = false;
let _voiceTimerInt = null;
let _voiceSeconds = 0;

window.startChatSpeech = async (chatId, otherUid) => {
    if (_voiceRecording) {
        stopAndSendVoiceMsg(chatId, otherUid);
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : 'audio/ogg';

        _voiceRec = new MediaRecorder(stream, { mimeType });
        _voiceChunks = [];
        _voiceSeconds = 0;
        _voiceRecording = true;

        _voiceRec.ondataavailable = (e) => { if (e.data && e.data.size > 0) _voiceChunks.push(e.data); };
        _voiceRec.start(200);

        const bar = document.getElementById(`voice-recording-bar-${chatId}`);
        const timerEl = document.getElementById(`voice-timer-${chatId}`);
        const micBtn = document.getElementById(`chat-mic-btn-${chatId}`);
        if (bar) bar.classList.remove('hidden');
        if (micBtn) { micBtn.style.background = '#ef4444'; micBtn.style.color = '#fff'; }

        _voiceTimerInt = setInterval(() => {
            _voiceSeconds++;
            const m = Math.floor(_voiceSeconds / 60);
            const s = _voiceSeconds % 60;
            if (timerEl) timerEl.innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
            if (_voiceSeconds >= 120) stopAndSendVoiceMsg(chatId, otherUid);
        }, 1000);

    } catch(e) {
        saAlert('لم يُسمح بالوصول للمايكروفون', 'error');
    }
};

window.cancelChatSpeech = (chatId) => {
    clearInterval(_voiceTimerInt);
    if (_voiceRec && _voiceRecording) {
        _voiceRec.stream?.getTracks().forEach(t => t.stop());
        try { _voiceRec.stop(); } catch(e) {}
    }
    _voiceRec = null; _voiceChunks = []; _voiceRecording = false; _voiceSeconds = 0;
    const bar = document.getElementById(`voice-recording-bar-${chatId}`);
    if (bar) bar.classList.add('hidden');
    const micBtn = document.getElementById(`chat-mic-btn-${chatId}`);
    if (micBtn) { micBtn.style.background = 'rgba(255,255,255,0.08)'; micBtn.style.color = '#aaa'; }
};

window.stopAndSendVoiceMsg = async function(chatId, otherUid) {
    if (!_voiceRec || !_voiceRecording) return;
    clearInterval(_voiceTimerInt);
    const seconds = _voiceSeconds;
    const mimeType = _voiceRec.mimeType || 'audio/webm';

    return new Promise((resolve) => {
        _voiceRec.onstop = async () => {
            if (_voiceChunks.length === 0) { resolve(); return; }
            const blob = new Blob(_voiceChunks, { type: mimeType });
            const reader = new FileReader();
            reader.onload = async () => {
                const b64 = reader.result;
                const dur = `${Math.floor(seconds/60)}:${(seconds%60)<10?'0':''}${seconds%60}`;
                playSound('sent');
                await push(ref(db, `chats/${chatId}`), {
                    sender: myUid, text: b64, type: 'voice',
                    duration: dur, mimeType, timestamp: Date.now()
                });
                await update(ref(db, `user_chats/${myUid}/${chatId}`), { lastMsg: '🎤 رسالة صوتية', lastMsgTime: Date.now() });
                await update(ref(db, `user_chats/${otherUid}/${chatId}`), { lastMsg: '🎤 رسالة صوتية', lastMsgTime: Date.now() });
                resolve();
            };
            reader.readAsDataURL(blob);
        };
        _voiceRec.stream?.getTracks().forEach(t => t.stop());
        try { _voiceRec.stop(); } catch(e) {}
        _voiceRec = null; _voiceChunks = []; _voiceRecording = false; _voiceSeconds = 0;

        const bar = document.getElementById(`voice-recording-bar-${chatId}`);
        if (bar) bar.classList.add('hidden');
        const micBtn = document.getElementById(`chat-mic-btn-${chatId}`);
        if (micBtn) { micBtn.style.background = 'rgba(255,255,255,0.08)'; micBtn.style.color = '#aaa'; }
    });
}

let _activePeerCall = null;
let _peerCallPeer = null;
let _peerCallStream = null;
let _miniCallMinimized = false;

window.initiatePeerCall = async (otherUid, otherName, otherIcon) => {
    await set(ref(db, `call_requests/${otherUid}`), {
        from: myUid, fromName: currentUser,
        fromIcon: localStorage.getItem('sa_icon') || 'fa-user',
        fromUid: myUid, status: 'pending', timestamp: Date.now()
    });
    showOutgoingCallUI(otherName, otherIcon, otherUid);
};

function showOutgoingCallUI(name, icon, otherUid) {
    removeCallUI();
    const div = document.createElement('div');
    div.id = 'call-ui';
    div.className = 'call-ui-overlay outgoing';
    div.innerHTML = `
        <div class="call-card">
            <div class="call-avatar"><i class="fas ${icon}"></i></div>
            <div class="call-name">${name}</div>
            <div class="call-status-txt">جاري الاتصال...</div>
            <div class="call-actions">
                <button class="call-btn end" onclick="endPeerCall('${otherUid}')"><i class="ph-bold ph-phone-disconnect"></i></button>
            </div>
        </div>
    `;
    document.body.appendChild(div);

    onValue(ref(db, `call_requests/${myUid}`), (snap) => {
        if (snap.exists() && snap.val().status === 'accepted') {
            startActualCall(otherUid, snap.val().peerStreamId, true);
        } else if (snap.exists() && snap.val().status === 'rejected') {
            showInAppNotif('مكالمة', `${name} رفض المكالمة`);
            endPeerCall(otherUid);
        }
    });
};

function showIncomingCallUI(fromName, fromIcon, fromUid, chatPartnerId) {
    if (document.getElementById('call-ui')) return;
    const div = document.createElement('div');
    div.id = 'call-ui';
    div.className = 'call-ui-overlay incoming';
    div.innerHTML = `
        <div class="call-card">
            <div class="call-avatar incoming-ring"><i class="fas ${fromIcon}"></i></div>
            <div class="call-name">${fromName}</div>
            <div class="call-status-txt">مكالمة واردة...</div>
            <div class="call-actions">
                <button class="call-btn accept" onclick="acceptPeerCall('${fromUid}')"><i class="ph-bold ph-phone"></i></button>
                <button class="call-btn end" onclick="rejectPeerCall('${fromUid}')"><i class="ph-bold ph-phone-disconnect"></i></button>
            </div>
        </div>
    `;
    document.body.appendChild(div);
    playRingtone();
}

window.acceptPeerCall = async (fromUid) => {
    stopRingtone();
    try {
        _peerCallStream = await getMicStream();
    } catch(e) {
        saAlert('لا يمكن الوصول للمايكروفون', 'error');
        rejectPeerCall(fromUid);
        return;
    }
    const roomId = 'call_' + [myUid, fromUid].sort().join('_');
    await update(ref(db, `call_requests/${fromUid}`), { status: 'accepted', peerStreamId: roomId });
    await remove(ref(db, `call_requests/${myUid}`));
    startActualCall(fromUid, roomId, false);
};

window.rejectPeerCall = async (fromUid) => {
    stopRingtone();
    await update(ref(db, `call_requests/${fromUid}`), { status: 'rejected' });
    await remove(ref(db, `call_requests/${myUid}`));
    removeCallUI();
};

async function startActualCall(otherUid, roomId, isCaller) {
    if (!_peerCallStream) {
        try { _peerCallStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); }
        catch(e) { endPeerCall(otherUid); return; }
    }
    removeCallUI();
    showActiveCallUI(roomId, otherUid);
    voiceJoinRoom(roomId);
}

function showActiveCallUI(roomId, otherUid) {
    document.getElementById('mini-call-bar')?.remove();
    const mini = document.createElement('div');
    mini.id = 'mini-call-bar';
    mini.className = 'mini-call-bar';
    mini.innerHTML = `
        <div class="mini-call-left">
            <span class="mini-live-dot"></span>
            <span class="mini-call-label">مكالمة جارية</span>
        </div>
        <button class="mini-call-btn expand" onclick="expandVoiceRoom()" title="فتح المكالمة">
            <i class="ph-bold ph-arrows-out"></i>
        </button>
        <button class="mini-call-btn end" onclick="endPeerCall('${otherUid}')" title="إنهاء">
            <i class="ph-bold ph-phone-disconnect"></i>
        </button>
    `;
    document.body.appendChild(mini);
    requestAnimationFrame(() => mini.classList.add('visible'));
}

window.expandVoiceRoom = () => {
    const screen = document.getElementById('voice-room-screen');
    if (screen) screen.classList.add('open');
    const bar = document.getElementById('mini-call-bar');
    if (bar) bar.style.display = 'none';
};

window.minimizeVoiceRoom = () => {
    const screen = document.getElementById('voice-room-screen');
    if (screen) screen.classList.remove('open');
    const bar = document.getElementById('mini-call-bar');
    if (bar) { bar.style.display = ''; bar.classList.add('visible'); }
};

window.endPeerCall = async (otherUid) => {
    stopRingtone();
    if (_peerCallStream) { _peerCallStream.getTracks().forEach(t => t.stop()); _peerCallStream = null; }
    await remove(ref(db, `call_requests/${myUid}`)).catch(() => {});
    await remove(ref(db, `call_requests/${otherUid}`)).catch(() => {});
    removeCallUI();
    if (window.voiceExitRoom) voiceExitRoom();
};

function removeCallUI() {
    document.getElementById('call-ui')?.remove();
    document.getElementById('mini-call-bar')?.remove();
}

let _ringtoneOsc = null;
function playRingtone() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.type = 'sine'; osc.frequency.value = 440;
        g.gain.value = 0.15;
        osc.start();
        _ringtoneOsc = { osc, ctx };
    } catch(e) {}
}
function stopRingtone() {
    if (_ringtoneOsc) {
        try { _ringtoneOsc.osc.stop(); _ringtoneOsc.ctx.close(); } catch(e) {}
        _ringtoneOsc = null;
    }
}

let _micStream = null;
async function getMicStream() {
    if (_micStream && _micStream.active) return _micStream;
    _micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    return _micStream;
}
window.getMicStream = getMicStream;

function triggerAIAnalysisBadge() {
    // Robot icon removed as requested
}

function checkOnboarding() {
    const key = `sa_onboarded_${selectedRole}`;
    if (localStorage.getItem(key)) return;
    setTimeout(() => startOnboardingTour(), 800);
}

function startOnboardingTour() {
    const role = selectedRole;
    const steps = role === 'student' ? [
        { target: 's-exams-list', icon: '📚', title: 'الاختبارات', text: 'هنا بتلاقي كل الاختبارات اللي رفعها المعلمين. ادخل واحد وحل!' },
        { target: 'xp-hud', icon: '⚡', title: 'نقاط XP', text: 'كل اختبار بتعمله بيكسبك XP وبتتدرج في المستويات. وصّل للقمة!' },
        { target: 's-reese-btn', icon: '✍️', title: 'Reese', text: 'شارك أفكارك ومذاكرتك مع باقي الطلاب في مجتمع Reese.' },
        { target: 's-dardasha-btn', icon: '💬', title: 'الدردشة', text: 'تكلم مع زملائك ومعلميك مباشرة. وفيه غرف صوتية كمان!' },
        { target: 's-ai-btn', icon: '🤖', title: 'AI المساعد', text: 'المساعد الذكي بيحلل مستواك ويساعدك في المذاكرة 24/7.' },
    ] : [
        { target: 't-library', icon: '📖', title: 'المكتبة', text: 'كل اختباراتك هنا. ضغط + لإنشاء اختبار جديد في ثواني.' },
        { target: 't-reese', icon: '✍️', title: 'Reese', text: 'انشر إعلانات وملاحظات للطلاب بسهولة.' },
        { target: 't-dardasha', icon: '💬', title: 'الدردشة', text: 'تواصل مع طلابك ومعلمين آخرين مباشرة.' },
        { target: 't-ai', icon: '🤖', title: 'AI', text: 'المساعد الذكي بيساعدك في إنشاء أسئلة وتحليل نتائج الطلاب.' },
    ];

    let currentStep = 0;
    const overlay = document.createElement('div');
    overlay.id = 'onboard-overlay';
    overlay.className = 'onboard-overlay';

    const card = document.createElement('div');
    card.className = 'onboard-card';

    function render(i) {
        const s = steps[i];
        card.innerHTML = `
            <div class="onboard-icon">${s.icon}</div>
            <div class="onboard-title">${s.title}</div>
            <div class="onboard-text">${s.text}</div>
            <div class="onboard-dots">
                ${steps.map((_, j) => `<div class="onboard-dot ${j===i?'active':''}"></div>`).join('')}
            </div>
            <div class="onboard-actions">
                <button class="onboard-skip" onclick="finishOnboarding()">تخطي</button>
                <button class="onboard-next" onclick="nextOnboardStep(${i+1},${steps.length})">
                    ${i === steps.length-1 ? 'ابدأ! 🚀' : 'التالي →'}
                </button>
            </div>
        `;
    }

    window.nextOnboardStep = (i, total) => {
        if (i >= total) { finishOnboarding(); return; }
        currentStep = i;
        card.classList.remove('onboard-card-in');
        void card.offsetWidth;
        card.classList.add('onboard-card-in');
        render(i);
    };

    window.finishOnboarding = () => {
        overlay.classList.remove('onboard-show');
        setTimeout(() => overlay.remove(), 400);
        localStorage.setItem(`sa_onboarded_${selectedRole}`, '1');
    };

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    render(0);
    requestAnimationFrame(() => {
        overlay.classList.add('onboard-show');
        card.classList.add('onboard-card-in');
    });
}

function initGlobalCallListener() {
    if (!myUid) return;
    onValue(ref(db, `call_requests/${myUid}`), (snap) => {
        if (!snap.exists()) return;
        const req = snap.val();
        if (req.status === 'pending' && req.from !== myUid) {
            if (!document.getElementById('call-ui')) {
                showIncomingCallUI(req.fromName, req.fromIcon, req.fromUid);
            }
        }
    });
}

function showInAppNotif(title, body) {
    let container = document.getElementById('inapp-notif-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'inapp-notif-container';
        document.body.appendChild(container);
    }
    const notif = document.createElement('div');
    notif.className = 'inapp-notif';
    notif.innerHTML = `<div class="inapp-notif-title">${title}</div><div class="inapp-notif-body">${body}</div>`;
    container.appendChild(notif);
    requestAnimationFrame(() => notif.classList.add('show'));
    setTimeout(() => { notif.classList.remove('show'); setTimeout(() => notif.remove(), 300); }, 4000);
    notif.onclick = () => notif.remove();
}

window.voiceToggleMic = () => {
    const btn = document.getElementById('vr-mic-btn');
    const isActive = btn?.classList.contains('active');
    if (window.voiceToggleMic_impl) { window.voiceToggleMic_impl(); return; }
    if (btn) btn.classList.toggle('active');
};

window.openChatRoom = (chatId, name, icon, uid) => {
    playSound('click');
    activeChatRoomId = chatId;
    _activeChatMsgKeys = {};
    if (_chatRoomListener) { _chatRoomListener(); _chatRoomListener = null; }
    const prefix = selectedRole === 'teacher' ? 't' : 's';
    const win = document.getElementById(`${prefix}-chat-window`);

    if (window.innerWidth < 768) {
        document.getElementById(`${prefix}-chat-sidebar`).classList.add('hidden');
    }
    win.classList.remove('hidden');

    win.innerHTML = `
        <div class="chat-header">
            <button class="icon-btn-small" onclick="closeChatWindow('${prefix}')"><i class="ph-bold ph-arrow-right"></i></button>
            <div class="avatar-frame mini-frame" style="width:38px;height:38px;font-size:1.1rem;border-width:1px;"><i class="fas ${icon}"></i></div>
            <div style="flex:1;min-width:0;">
                <div style="font-weight:700;font-size:0.95rem;">${name}</div>
                <div id="chat-online-${chatId}" style="font-size:0.7rem;color:#25d366;">متصل</div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">
                <button class="icon-btn-small call-icon-btn" onclick="initiatePeerCall('${uid}','${name}','${icon}')" title="مكالمة صوتية">
                    <i class="ph-bold ph-phone"></i>
                </button>
                <button class="icon-btn-small" onclick="copyProfileLinkFor('${uid}')" title="نسخ رابط">
                    <i class="ph-bold ph-link"></i>
                </button>
            </div>
        </div>
        <div class="chat-msgs-area" id="chat-msgs-${chatId}"></div>
        <div class="chat-input-area" id="chat-input-area-${chatId}">
            <label class="chat-img-attach-btn" title="إرسال صور">
                <i class="ph-bold ph-camera"></i>
                <input type="file" hidden accept="image/*" multiple onchange="sendChatImages(this,'${chatId}','${uid}')">
            </label>
            <input type="text" id="chat-input-${chatId}" placeholder="اكتب رسالة..."
                onkeypress="handleChatEnter(event,'${chatId}','${uid}')"
                oninput="toggleChatMicSend('${chatId}')"
                onfocus="handleChatInputFocus(this)">
            <button id="chat-send-btn-${chatId}" class="send-btn" style="display:none" onclick="sendChatMessage('${chatId}','${uid}')"><i class="ph-bold ph-paper-plane-tilt"></i></button>
            <button id="chat-mic-btn-${chatId}" class="send-btn mic-idle-btn" onclick="startChatSpeech('${chatId}','${uid}')"><i class="ph-bold ph-microphone"></i></button>
        </div>
        <div id="voice-recording-bar-${chatId}" class="voice-recording-bar hidden">
            <div class="voice-wave-anim"><span></span><span></span><span></span><span></span><span></span></div>
            <span id="voice-timer-${chatId}" style="color:#ef4444;font-weight:700;font-size:0.85rem;min-width:38px;">0:00</span>
            <div style="flex:1;"></div>
            <button onclick="cancelChatSpeech('${chatId}')" class="speech-cancel-btn"><i class="ph-bold ph-x"></i></button>
            <button onclick="stopAndSendVoiceMsg('${chatId}','${uid}')" class="speech-send-btn"><i class="ph-bold ph-paper-plane-tilt"></i></button>
        </div>
    `;

    const msgContainer = document.getElementById(`chat-msgs-${chatId}`);
    let isFirstLoad = true;
    let prevCount = 0;

    _chatRoomListener = onValue(ref(db, `chats/${chatId}`), (snap) => {
        msgContainer.innerHTML = '';
        _activeChatMsgKeys = {};
        if (!snap.exists()) { isFirstLoad = false; return; }

        const msgs = snap.val();
        const msgArr = Object.entries(msgs).map(([k, v]) => ({ ...v, _key: k })).sort((a, b) => a.timestamp - b.timestamp);

        let lastDateLabel = '';
        msgArr.forEach(msg => {
            const dateStr = new Date(msg.timestamp).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });
            if (dateStr !== lastDateLabel) {
                lastDateLabel = dateStr;
                const sep = document.createElement('div');
                sep.className = 'chat-date-separator';
                sep.innerText = dateStr;
                msgContainer.appendChild(sep);
            }
            _activeChatMsgKeys[msg._key] = true;
            appendChatMsg(msgContainer, msg, chatId, uid, name);
        });

        msgContainer.scrollTop = msgContainer.scrollHeight;

        if (!isFirstLoad && msgArr.length > prevCount) {
            const lastMsg = msgArr[msgArr.length - 1];
            if (lastMsg && lastMsg.sender !== myUid) {
                playSound('recv');
                showInAppNotif(name, lastMsg.type === 'images' ? '📷 صورة' : lastMsg.type === 'voice' ? '🎤 رسالة صوتية' : (lastMsg.text?.substring(0, 60) || ''));
                update(ref(db, `chats/${chatId}/${lastMsg._key}`), { readBy: myUid });
            }
        }
        prevCount = msgArr.length;
        isFirstLoad = false;
    });

    update(ref(db, `users/${selectedRole}s/${currentUser}`), { online: true, lastSeen: Date.now() });
};

function appendChatMsg(container, msg, chatId, otherUid, otherName) {
    const isMe = msg.sender === myUid;
    const isDeleted = msg.deleted === true;

    const wrap = document.createElement('div');
    wrap.className = `wapp-msg-wrap ${isMe ? 'me' : 'them'}`;
    wrap.id = `msg-wrap-${msg._key}`;

    let content = '';
    if (isDeleted) {
        content = `<div class="wapp-msg deleted-msg"><i class="ph-bold ph-prohibit" style="color:#aaa;margin-left:5px;"></i><span style="color:#aaa;font-style:italic;">تم حذف هذه الرسالة</span></div>`;
    } else if (msg.type === 'images' && msg.images) {
        const imgs = msg.images;
        const grid = imgs.length === 1 ? 'one' : imgs.length === 2 ? 'two' : imgs.length === 3 ? 'three' : 'four';
        const imgHtml = imgs.map(src => `<img src="${src}" onclick="openImageViewer(this.src)" style="width:100%;height:100%;object-fit:cover;cursor:pointer;">`).join('');
        content = `<div class="wapp-msg"><div class="wapp-img-grid grid-${grid}">${imgHtml}</div>${buildMsgFooter(msg, isMe)}</div>`;
    } else if (msg.type === 'voice') {
        const durLabel = msg.duration || '0:00';
        content = `<div class="wapp-msg">
            <div class="wapp-voice-player">
                <button class="voice-play-btn" onclick="toggleVoicePlay(this,'${msg._key}')"><i class="ph-bold ph-play"></i></button>
                <div class="voice-waveform">${generateWaveform()}</div>
                <span class="voice-duration" id="vdur-${msg._key}">${durLabel}</span>
            </div>
            ${buildMsgFooter(msg, isMe)}
        </div>`;
        const audioStore = msg.text;
        const audioKey = msg._key;
        setTimeout(() => {
            const playerEl = document.querySelector(`#msg-wrap-${audioKey} .wapp-voice-player`);
            if (playerEl && !playerEl.querySelector('audio')) {
                const aud = document.createElement('audio');
                aud.id = `audio-${audioKey}`;
                aud.preload = 'metadata';
                aud.onloadedmetadata = () => {
                    const dur = aud.duration;
                    if (dur && isFinite(dur)) {
                        const m = Math.floor(dur / 60);
                        const s = Math.floor(dur % 60);
                        const durEl = document.getElementById(`vdur-${audioKey}`);
                        if (durEl && durEl.innerText === '0:00') durEl.innerText = `${m}:${s < 10 ? '0'+s : s}`;
                    }
                };
                aud.ontimeupdate = () => {
                    const dur = aud.duration;
                    const cur = aud.currentTime;
                    const durEl = document.getElementById(`vdur-${audioKey}`);
                    if (durEl && dur && isFinite(dur)) {
                        const rem = dur - cur;
                        const m = Math.floor(rem / 60);
                        const s = Math.floor(rem % 60);
                        durEl.innerText = `${m}:${s < 10 ? '0'+s : s}`;
                    }
                };
                aud.onended = () => {
                    resetVoiceBtn(audioKey);
                    const durEl = document.getElementById(`vdur-${audioKey}`);
                    if (durEl && aud.duration && isFinite(aud.duration)) {
                        const m = Math.floor(aud.duration / 60);
                        const s = Math.floor(aud.duration % 60);
                        durEl.innerText = `${m}:${s < 10 ? '0'+s : s}`;
                    }
                };
                aud.src = audioStore;
                playerEl.appendChild(aud);
            }
        }, 100);
    } else {
        content = `<div class="wapp-msg"><div class="wapp-text">${makeLinksClickable(msg.text || '')}</div>${buildMsgFooter(msg, isMe)}</div>`;
    }

    wrap.innerHTML = content;

    if (!isDeleted) {
        let holdTimer = null;
        const onTouchStart = (e) => {
            holdTimer = setTimeout(() => { showMsgContextMenu(e.touches[0], msg._key, chatId, otherUid, msg.text, isMe); }, 550);
        };
        const clearHold = () => clearTimeout(holdTimer);
        wrap.addEventListener('touchstart', onTouchStart, { passive: true });
        wrap.addEventListener('touchend', clearHold);
        wrap.addEventListener('touchmove', clearHold);
        wrap.addEventListener('contextmenu', (e) => { e.preventDefault(); showMsgContextMenu(e, msg._key, chatId, otherUid, msg.text, isMe); });
    }

    container.appendChild(wrap);
}

function buildMsgFooter(msg, isMe) {
    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const readIcon = isMe ? `<i class="ph-bold ph-checks" style="color:${msg.readBy ? '#53bdeb' : '#aaa'};font-size:0.85rem;margin-right:2px;"></i>` : '';
    return `<div class="msg-footer-row">${readIcon}<span class="msg-time-wapp">${time}</span></div>`;
}

function generateWaveform() {
    const bars = 20;
    let html = '';
    for (let i = 0; i < bars; i++) {
        const h = Math.random() * 20 + 4;
        html += `<div class="waveform-bar" style="height:${h}px"></div>`;
    }
    return html;
}

window.toggleVoicePlay = (btn, key) => {
    const audio = document.getElementById(`audio-${key}`);
    if (!audio) return;
    if (audio.paused) {
        document.querySelectorAll('audio').forEach(a => { if (a !== audio) { a.pause(); a.currentTime = 0; } });
        document.querySelectorAll('.voice-play-btn').forEach(b => b.innerHTML = '<i class="ph-bold ph-play"></i>');
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                btn.innerHTML = '<i class="ph-bold ph-pause"></i>';
            }).catch(err => {
                audio.load();
                audio.play().then(() => {
                    btn.innerHTML = '<i class="ph-bold ph-pause"></i>';
                }).catch(() => {});
            });
        } else {
            btn.innerHTML = '<i class="ph-bold ph-pause"></i>';
        }
    } else {
        audio.pause();
        btn.innerHTML = '<i class="ph-bold ph-play"></i>';
    }
};

window.resetVoiceBtn = (key) => {
    const btn = document.querySelector(`#msg-wrap-${key} .voice-play-btn`);
    if (btn) btn.innerHTML = '<i class="ph-bold ph-play"></i>';
};

function showMsgContextMenu(e, msgKey, chatId, otherUid, text, isMe) {
    document.querySelectorAll('.msg-ctx-menu').forEach(el => el.remove());
    const menu = document.createElement('div');
    menu.className = 'msg-ctx-menu';
    menu.style.top = (e.clientY || e.pageY) + 'px';
    menu.style.left = (e.clientX || e.pageX) + 'px';
    const copyBtn = `<div class="ctx-item" onclick="navigator.clipboard.writeText('${(text||'').replace(/'/g,"\\'")}').then(()=>showToast('تم النسخ','','success',1500)); document.querySelector('.msg-ctx-menu').remove()"><i class="ph-bold ph-copy"></i> نسخ</div>`;
    const deleteBtn = isMe ? `<div class="ctx-item danger" onclick="deleteChatMsg('${chatId}','${msgKey}','${otherUid}'); document.querySelector('.msg-ctx-menu').remove()"><i class="ph-bold ph-trash"></i> حذف للجميع</div>` : '';
    menu.innerHTML = copyBtn + deleteBtn;
    document.body.appendChild(menu);
    setTimeout(() => { document.addEventListener('click', () => menu.remove(), { once: true }); }, 100);
}

window.deleteChatMsg = async (chatId, msgKey, otherUid) => {
    await update(ref(db, `chats/${chatId}/${msgKey}`), { deleted: true, text: '', type: 'text' });
    showToast('تم حذف الرسالة', '', 'success', 2000);
};

window.toggleChatMicSend = (chatId) => {
    const inp = document.getElementById(`chat-input-${chatId}`);
    const send = document.getElementById(`chat-send-btn-${chatId}`);
    const mic = document.getElementById(`chat-mic-btn-${chatId}`);
    if (!inp || !send || !mic) return;
    if (inp.value.trim()) { send.style.display = 'flex'; mic.style.display = 'none'; }
    else { send.style.display = 'none'; mic.style.display = 'flex'; }
};

window.sendChatImages = async (input, chatId, otherUid) => {
    if (!input.files || input.files.length === 0) return;
    const today = new Date().toDateString();
    const usageKey = `img_usage_${myUid}_${today}`;
    let count = parseInt(localStorage.getItem(usageKey) || '0');
    const files = Array.from(input.files).slice(0, 4);
    if (count + files.length > 10) { saAlert('تجاوزت حد الصور اليوم', 'error'); input.value = ''; return; }

    const images = [];
    for (const f of files) { images.push(await getBase64(f)); }
    playSound('sent');
    await push(ref(db, `chats/${chatId}`), { sender: myUid, images, type: 'images', timestamp: Date.now() });
    count += files.length;
    localStorage.setItem(usageKey, count);
    await update(ref(db, `user_chats/${myUid}/${chatId}`), { lastMsg: `📷 ${images.length} صور`, lastMsgTime: Date.now() });
    await update(ref(db, `user_chats/${otherUid}/${chatId}`), { lastMsg: `📷 ${images.length} صور`, lastMsgTime: Date.now() });
    input.value = '';
};

window.closeChatWindow = (prefix) => {
    playSound('click');
    if (_chatRoomListener) { _chatRoomListener(); _chatRoomListener = null; }
    document.getElementById(`${prefix}-chat-window`).classList.add('hidden');
    document.getElementById(`${prefix}-chat-sidebar`).classList.remove('hidden');
    activeChatRoomId = null;
};

window.handleChatInputFocus = (input) => {
    // Add focused class to parent input area for visual enhancement
    const inputArea = input.closest('.chat-input-area');
    if (inputArea) {
        inputArea.classList.add('focused');
        input.addEventListener('blur', () => inputArea.classList.remove('focused'), { once: true });
    }

    if (window.innerWidth > 768) return;
    
    setTimeout(() => {
        input.scrollIntoView({ behavior: 'smooth', block: 'end' });
        const chatId = input.id.replace('chat-input-', '');
        const msgArea = document.getElementById(`chat-msgs-${chatId}`);
        if (msgArea) msgArea.scrollTop = msgArea.scrollHeight;
    }, 350);
};

window.handleChatEnter = (e, chatId, otherUid) => {
    if(e.key === 'Enter') sendChatMessage(chatId, otherUid);
};

window.sendChatMessage = async (chatId, otherUid) => {
    const input = document.getElementById(`chat-input-${chatId}`);
    const text = input.value.trim();
    if(!text) return;
    
    playSound('sent');
    
    await push(ref(db, `chats/${chatId}`), {
        sender: myUid,
        text: text,
        type: 'text',
        timestamp: Date.now()
    });
    
    await update(ref(db, `user_chats/${myUid}/${chatId}`), { lastMsg: text, lastMsgTime: Date.now() });
    await update(ref(db, `user_chats/${otherUid}/${chatId}`), { lastMsg: text, lastMsgTime: Date.now() });
    
    input.value = '';
    toggleChatMicSend(chatId);
};

window.sendChatImage = async (input, chatId, otherUid) => {
    if(input.files && input.files[0]) {
        const today = new Date().toDateString();
        const usageKey = `img_usage_${myUid}_${today}`;
        let count = parseInt(localStorage.getItem(usageKey) || '0');
        
        if(count >= 5) {
            saAlert("عفواً، لقد تجاوزت الحد الأقصى لإرسال الصور اليوم (5 صور).", "error");
            input.value = '';
            return;
        }
        
        const b64 = await getBase64(input.files[0]);
        playSound('sent');
        
        await push(ref(db, `chats/${chatId}`), {
            sender: myUid,
            text: b64,
            type: 'image',
            timestamp: Date.now()
        });
        
        count++;
        localStorage.setItem(usageKey, count);
        
        await update(ref(db, `user_chats/${myUid}/${chatId}`), { lastMsg: '📷 صورة', lastMsgTime: Date.now() });
        await update(ref(db, `user_chats/${otherUid}/${chatId}`), { lastMsg: '📷 صورة', lastMsgTime: Date.now() });
        
        input.value = '';
    }
};

window.copyProfileLinkFor = async (otherUid) => {
    playSound('click');
    if (!activeChatRoomId) {
        const url = `${window.location.href.split('?')[0]}?chat=${otherUid}`;
        navigator.clipboard.writeText(url).then(() => saAlert("تم نسخ رابط المستخدم!", "success"));
        return;
    }
    const roomId = activeChatRoomId;
    const myIcon = localStorage.getItem('sa_icon') || 'fa-user';

    // Save room meta using data already known from openChatRoom call
    await update(ref(db, `chat_room_meta/${roomId}`), {
        members: [myUid, otherUid],
        names: { [myUid]: currentUser },
        icons: { [myUid]: myIcon }
    });

    const url = `${window.location.href.split('?')[0]}?room=${roomId}`;
    if (navigator.share) {
        navigator.share({ title: `محادثة على SA EDU`, text: `افتح محادثتنا على SA EDU`, url }).catch(() => {});
    } else {
        navigator.clipboard.writeText(url).then(() => saAlert("تم نسخ رابط الدردشة المباشر!", "success"));
    }
};

window.filterChats = (prefix, term) => {
    const items = document.querySelectorAll(`#${prefix}-chat-list .chat-item`);
    items.forEach(item => {
        const nameEl = item.querySelector('.chat-item-name') || item.querySelector('span');
        const name = (nameEl ? nameEl.innerText : item.innerText).toLowerCase();
        if(name.includes(term.toLowerCase())) item.classList.remove('hidden');
        else item.classList.add('hidden');
    });
};

window.openReeseCompose = () => {
    document.getElementById('reese-compose-modal').classList.add('open');
    const icon = localStorage.getItem('sa_icon');
    const color = selectedRole === 'teacher' ? 'var(--accent-gold)' : 'var(--accent-primary)';
    const frame = document.getElementById('compose-avatar');
    frame.innerHTML = `<i class="fas ${icon}"></i>`;
    frame.style.color = color; frame.style.borderColor = color;
    document.getElementById('compose-name').innerText = currentUser;
    reeseImages = []; renderReeseMediaPreview();
    
    const container = document.getElementById('ai-reese-suggestions');
    container.innerHTML = '';
    container.classList.remove('hidden');
    
    const placeholders = ['✨ جاري التوليد...', '🧠 ...', '💡 ...'];
    placeholders.forEach(ph => {
        const chip = document.createElement('div');
        chip.className = 'suggestion-chip';
        chip.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> ${ph}`;
        chip.style.opacity = '0.4';
        chip.style.pointerEvents = 'none';
        container.appendChild(chip);
    });
    
    loadReeseAiSuggestionsAuto();
};

let _lastReeseSuggestions = [];

async function loadReeseAiSuggestionsAuto() {
    const container = document.getElementById('ai-reese-suggestions');
    if (!container) return;

    const roleAr = selectedRole === 'teacher' ? 'معلم' : 'طالب';
    const prevStr = _lastReeseSuggestions.length > 0 ? `اقتراحات سابقة (لا تكررها أبداً): ${_lastReeseSuggestions.join(' | ')}` : '';
    const categories = selectedRole === 'teacher'
        ? ['تحفيز الطلاب', 'نصيحة تعليمية', 'فكرة درس مبتكرة', 'سؤال تفاعلي للطلاب']
        : ['تحفيز ذاتي', 'نصيحة مذاكرة', 'إنجاز شخصي', 'سؤال للمجتمع'];

    const prompt = `أنت مساعد منصة SA EDU التعليمية المتحمس. اقترح 4 منشورات قصيرة وذكية لـ ${roleAr} على منصة تعليمية اجتماعية. كل اقتراح في فئة مختلفة: ${categories.join(', ')}. ${prevStr}. القواعد المهمة: لا تعتذر أبداً، لا تقل "آسف" أو "لا أستطيع"، دائماً أعط 4 اقتراحات بدون مقدمات. أعد فقط JSON array من 4 strings باللغة العربية. كل منشور أقل من 130 حرف.`;

    try {
        let text = await callPollinationsAI(prompt);
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const first = text.indexOf('[');
        const last = text.lastIndexOf(']');
        if (first !== -1 && last !== -1) text = text.substring(first, last + 1);
        let suggestions = [];
        try { suggestions = JSON.parse(text); } catch(e) { suggestions = [text]; }
        if (!Array.isArray(suggestions)) suggestions = [text];

        suggestions = suggestions.filter(s => typeof s === 'string' && s.trim().length > 5);
        _lastReeseSuggestions = suggestions.slice(0, 4);

        container.innerHTML = '';
        const catIcons = ['✨', '💡', '🔥', '🎯'];
        suggestions.slice(0, 4).forEach((sug, i) => {
            const chip = document.createElement('div');
            chip.className = 'suggestion-chip';
            chip.innerHTML = `<span style="font-size:1rem;">${catIcons[i] || '✨'}</span> ${sug}`;
            chip.onclick = () => {
                document.getElementById('reese-text-input').value = sug;
                document.getElementById('reese-text-input').focus();
            };
            container.appendChild(chip);
        });
    } catch(e) {
        const defaults = selectedRole === 'teacher'
            ? ['مَن لا يتعلم في صغره لا يتقدم في كبره — شجّعوا طلابكم على القراءة اليومية', 'نصيحتي: خصّص 10 دقائق يومياً للمراجعة الصامتة', 'سؤال لطلابي: ما الهدف الذي تسعون إليه هذا العام؟', 'أقوى درس تعلّمته: الصبر على الطالب البطيء هو استثمار في مستقبله']
            : ['اليوم حفظت 10 معادلات — كل خطوة صغيرة تُراكم النجاح', 'نصيحة: لا تذاكر وأنت متعب، استرح ثم ابدأ من جديد', 'أصعب سؤال في الاختبار صار سهلاً بعد المراجعة مرتين', 'مَن منكم يذاكر مع موسيقى؟ جربوها مع الأناشيد'];
        container.innerHTML = '';
        defaults.forEach(sug => {
            const chip = document.createElement('div');
            chip.className = 'suggestion-chip';
            chip.innerText = sug;
            chip.onclick = () => { document.getElementById('reese-text-input').value = sug; };
            container.appendChild(chip);
        });
    }
}

window.closeReeseCompose = () => {
    playSound('click');
    document.getElementById('reese-compose-modal').classList.remove('open');
    document.getElementById('reese-text-input').value = '';
    document.getElementById('reese-text-input').style.height = 'auto';
    reeseImages = []; renderReeseMediaPreview();
};

window.handleReeseImageSelect = async (input) => {
    if (input.files) {
        if (input.files.length + reeseImages.length > 2) {
            saAlert("يمكنك اختيار صورتين فقط كحد أقصى", "error");
            return;
        }
        for (let i = 0; i < input.files.length; i++) {
            const base64 = await getBase64(input.files[i]);
            reeseImages.push(base64);
        }
        renderReeseMediaPreview();
        input.value = '';
    }
};

function renderReeseMediaPreview() {
    const div = document.getElementById('reese-media-preview');
    div.innerHTML = '';
    if (reeseImages.length > 0) div.classList.remove('hidden'); else div.classList.add('hidden');
    reeseImages.forEach((img, idx) => {
        const item = document.createElement('div');
        item.className = 'preview-item';
        item.innerHTML = `<img src="${img}"><div class="remove-preview" onclick="removeReeseImage(${idx})"><i class="fas fa-times"></i></div>`;
        div.appendChild(item);
    });
}

window.removeReeseImage = (idx) => { reeseImages.splice(idx, 1); renderReeseMediaPreview(); };

window.publishReese = async () => {
    const text = document.getElementById('reese-text-input').value.trim();
    if(!text && reeseImages.length === 0) return saAlert("اكتب شيئاً أو أضف صورة", "error");
    playSound('sent');
    const postData = { author: currentUser, role: selectedRole, icon: localStorage.getItem('sa_icon'), content: text, images: reeseImages, timestamp: Date.now(), likes: 0 };
    await push(ref(db, 'posts'), postData);
    closeReeseCompose(); saAlert("تم النشر بنجاح!", "success");
};

window.loadReesePosts = (prefix) => {
    const container = document.getElementById(`reese-feed-container-${prefix}`);
    container.innerHTML = getMultipleSkeletons(3);
    if (_reeseListener) { _reeseListener(); _reeseListener = null; }
    _reeseListener = onValue(ref(db, 'posts'), (snap) => {
        container.innerHTML = '';
        const data = snap.val();
        if(!data) return container.innerHTML = getEmptyStateHTML('posts');
        const hiddenPosts = JSON.parse(localStorage.getItem(`hidden_posts_${currentUser}`) || '[]');
        const posts = Object.entries(data).map(([k,v]) => ({id:k, ...v})).sort((a,b) => b.timestamp - a.timestamp);
        let visibleCount = 0;
        posts.forEach(post => {
            if(hiddenPosts.includes(post.id)) return;
            if(isMyPostsView && post.author !== currentUser) return;
            visibleCount++;
            const date = new Date(post.timestamp).toLocaleDateString();
            const roleColor = post.role === 'teacher' ? 'var(--accent-gold)' : 'var(--accent-primary)';
            const isAuthor = post.author === currentUser;
            const likedPosts = JSON.parse(localStorage.getItem(`liked_posts_${currentUser}`) || '[]');
            const isLiked = likedPosts.includes(post.id);
            let imagesHtml = '';
            if(post.images && post.images.length > 0) {
                const gridClass = post.images.length === 1 ? 'one-img' : 'two-imgs';
                imagesHtml = `<div class="reese-images-grid ${gridClass}" ondblclick="doubleTapLike('${post.id}', ${post.likes || 0}, this)">${post.images.map(img => `<img src="${img}" class="reese-post-img" onclick="openImageViewer(this.src)">`).join('')}</div>`;
            }
            const div = document.createElement('div');
            div.className = 'reese-card';
            div.id = `post-${post.id}`;
            div.innerHTML = `
                <div class="reese-header">
                    <div class="reese-user">
                        <div class="avatar-frame" style="width:40px; height:40px; font-size:1.2rem; border-width:1px; margin:0; border-color:${roleColor}; color:${roleColor};">
                            <i class="fas ${post.icon}"></i>
                        </div>
                        <div><div style="font-weight:bold; font-size:0.95rem;">${post.author}</div><div style="font-size:0.7rem; color:#666;">${date}</div></div>
                    </div>
                    <div style="display:flex; gap:10px;">
                        ${isAuthor ? `<button onclick="deleteReese('${post.id}')" title="حذف نهائي" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size:1rem;"><i class="fas fa-trash-alt"></i></button>` : ''}
                        <button onclick="hideReese('${post.id}')" title="إخفاء من هنا" style="background:none; border:none; color:#666; cursor:pointer; font-size:1rem;"><i class="fas fa-eye-slash"></i></button>
                    </div>
                </div>
                <div class="reese-content">${makeLinksClickable(post.content)}</div>${imagesHtml}
                <div class="reese-actions">
                    <button class="reese-btn ${isLiked ? 'liked' : ''}" onclick="likeReese('${post.id}', ${post.likes || 0})"><i class="fas ${isLiked ? 'fa-thumbs-up' : 'fa-thumbs-up'}" style="font-size:1.3rem;"></i> <span style="font-size:1.1rem;">${post.likes || 0}</span></button>
                    <button class="reese-btn" onclick="shareReese('${post.id}')"><i class="fas fa-share"></i> مشاركة</button>
                </div>`;
            container.appendChild(div); container.appendChild(createAdBanner());
        });
        if(visibleCount === 0) container.innerHTML = getEmptyStateHTML('posts');
    });
};

window.toggleMyPostsView = () => {
    playSound('click');
    isMyPostsView = !isMyPostsView;
    const prefix = selectedRole === 'teacher' ? 't' : 's';
    const icon = document.getElementById(`${prefix}-eraser-icon`);
    if(isMyPostsView) { icon.style.color = 'var(--danger)'; } else { icon.style.color = '#aaa'; }
    loadReesePosts(prefix);
    saAlert(isMyPostsView ? "عرض منشوراتك فقط (وضع الإدارة)" : "عرض كل المنشورات", "info");
};

window.doubleTapLike = async (id, currentLikes, el) => {
    const likedPosts = JSON.parse(localStorage.getItem(`liked_posts_${currentUser}`) || '[]');
    if (likedPosts.includes(id)) return;
    const heart = document.createElement('div');
    heart.innerHTML = '<i class="fas fa-heart" style="color:#ef4444; font-size:3rem;"></i>';
    heart.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;animation:heartPop 0.7s ease forwards;z-index:10;';
    el.style.position = 'relative';
    el.appendChild(heart);
    setTimeout(() => heart.remove(), 700);
    likeReese(id, currentLikes);
};

window.likeReese = async (id, currentLikes) => {
    playSound('click');
    const likedPosts = JSON.parse(localStorage.getItem(`liked_posts_${currentUser}`) || '[]');
    const index = likedPosts.indexOf(id);
    const wasLiked = index !== -1;
    
    // Get fresh likes count from Firebase to avoid race conditions
    let freshLikes = currentLikes;
    try {
        const snap = await get(ref(db, `posts/${id}/likes`));
        if (snap.exists()) freshLikes = snap.val() || 0;
    } catch(e) {}
    
    const newLikes = wasLiked ? Math.max(0, freshLikes - 1) : freshLikes + 1;
    if(wasLiked) { likedPosts.splice(index, 1); } else { likedPosts.push(id); }
    localStorage.setItem(`liked_posts_${currentUser}`, JSON.stringify(likedPosts));
    await update(ref(db, `posts/${id}`), { likes: newLikes });
};

window.hideReese = (id) => {
    saConfirm("إخفاء هذا المنشور من صفحتك؟", () => {
        const hiddenPosts = JSON.parse(localStorage.getItem(`hidden_posts_${currentUser}`) || '[]');
        hiddenPosts.push(id);
        localStorage.setItem(`hidden_posts_${currentUser}`, JSON.stringify(hiddenPosts));
        loadReesePosts(selectedRole === 'teacher' ? 't' : 's');
    });
};

window.deleteReese = (id) => {
    saConfirm("حذف هذا المنشور نهائياً؟ لا يمكن التراجع.", async () => {
        await remove(ref(db, `posts/${id}`)); saAlert("تم الحذف", "success");
    });
};

window.openImageViewer = (src) => {
    const modal = document.createElement('div');
    modal.style = "position:fixed; inset:0; background:rgba(0,0,0,0.9); z-index:9999; display:flex; justify-content:center; align-items:center; cursor:pointer;";
    modal.innerHTML = `<img src="${src}" style="max-width:95%; max-height:95%; border-radius:10px;">`;
    modal.onclick = () => modal.remove();
    document.body.appendChild(modal);
};

window.shareReese = (id) => {
    playSound('click');
    const url = `${window.location.href.split('?')[0]}?postId=${id}`;
    if(navigator.share) { navigator.share({ title: 'Reese SA', text: 'شاهد هذا المنشور', url: url }).catch(e=>console.log(e)); } 
    else { navigator.clipboard.writeText(url).then(() => saAlert("تم نسخ رابط المنشور", "success")); }
};

window.generateAiReese = async () => {
    const container = document.getElementById('ai-reese-suggestions');
    container.innerHTML = '<div class="suggestion-chip" style="opacity:0.5; pointer-events:none;"><i class="fas fa-circle-notch fa-spin"></i> جاري التوليد...</div>';
    await loadReeseAiSuggestionsAuto();
};

function generateChatId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); }

window.startNewChat = (prefix) => {
    playSound('click');
    currentChatId = generateChatId(); currentChatMessages = []; isIncognito = false;
    document.getElementById(`${prefix}-ai-msgs`).innerHTML = ''; 
    document.getElementById(`${prefix}-incognito-btn`).classList.remove('active');
    window.toggleAiSendMic(prefix, '');
    renderAiWelcome(prefix); toggleHistory(false);
};

window.renderAiWelcome = (prefix) => {
    const msgs = document.getElementById(`${prefix}-ai-msgs`);
    const firstName = currentUser.split(' ')[0];
    
    let roleSpecificChips = '';
    let roleDesc = '';

    if (selectedRole === 'teacher') {
        roleDesc = 'يمكنني مساعدتك في إنشاء الاختبارات، تحضير الدروس، وإدارة الطلاب.';
        roleSpecificChips = `
            <div class="ai-chip" onclick="fillAiInput('${prefix}', 'أنشئ اختبار عن الكيمياء العضوية')"><i class="fas fa-flask"></i> إنشاء اختبار</div>
            <div class="ai-chip" onclick="fillAiInput('${prefix}', 'اكتب خطة درس عن التاريخ الحديث')"><i class="fas fa-book"></i> تحضير درس</div>
            <div class="ai-chip" onclick="fillAiInput('${prefix}', 'كيف أجعل الحصة تفاعلية أكثر؟')"><i class="fas fa-users"></i> نصائح تفاعلية</div>
        `;
    } else {
        roleDesc = 'أنا هنا لمساعدتك في المذاكرة، شرح الدروس، وحل المسائل الصعبة.';
        roleSpecificChips = `
            <div class="ai-chip" onclick="fillAiInput('${prefix}', 'اشرح لي قانون نيوتن الثاني ببساطة')"><i class="fas fa-atom"></i> شرح درس</div>
            <div class="ai-chip" onclick="fillAiInput('${prefix}', 'لخص لي أحداث الحرب العالمية الأولى')"><i class="fas fa-history"></i> تلخيص</div>
            <div class="ai-chip" onclick="fillAiInput('${prefix}', 'ساعدني في تنظيم وقت المذاكرة')"><i class="fas fa-clock"></i> تنظيم الوقت</div>
        `;
    }

    msgs.innerHTML = `
        <div class="ai-welcome-screen">
            <div class="ai-logo-large"><i class="fas fa-wand-magic-sparkles"></i></div>
            <h3 class="ai-welcome-title">مرحباً ${firstName} 👋</h3>
            <p class="ai-welcome-text">أنا مساعدك الذكي SA AI. <br>${roleDesc}</p>
            <div class="ai-chips" id="ai-welcome-chips-${prefix}">
            </div>
        </div>`;

    // Add chips safely via JS to avoid quote escaping issues
    const chipsContainer = document.getElementById(`ai-welcome-chips-${prefix}`);
    const chipsData = selectedRole === 'teacher' ? [
        { icon: 'fas fa-flask', text: 'أنشئ اختبار عن الكيمياء العضوية' },
        { icon: 'fas fa-book', text: 'اكتب خطة درس عن التاريخ الحديث' },
        { icon: 'fas fa-users', text: 'كيف أجعل الحصة تفاعلية أكثر؟' },
    ] : [
        { icon: 'fas fa-atom', text: 'اشرح لي قانون نيوتن الثاني ببساطة' },
        { icon: 'fas fa-history', text: 'لخص لي أحداث الحرب العالمية الأولى' },
        { icon: 'fas fa-clock', text: 'ساعدني في تنظيم وقت المذاكرة' },
    ];
    chipsData.forEach(c => {
        const chip = document.createElement('div');
        chip.className = 'ai-chip';
        chip.innerHTML = `<i class="${c.icon}"></i> ${c.text}`;
        chip.addEventListener('click', () => fillAiInput(prefix, c.text));
        chipsContainer.appendChild(chip);
    });
};

window.fillAiInput = (prefix, text) => {
    const input = document.getElementById(`${prefix}-ai-input`);
    if (input) {
        input.value = text;
        window.toggleAiSendMic(prefix, text);
        input.focus();
    }
};

window.toggleIncognito = (prefix) => {
    playSound('click');
    isIncognito = !isIncognito;
    document.getElementById(`${prefix}-incognito-btn`).classList.toggle('active', isIncognito);
    if(isIncognito) saAlert("الوضع المخفي: لن يتم حفظ هذه المحادثة في السجل", "info");
    else saAlert("تم إيقاف الوضع المخفي", "info");
};

async function saveChatToFirebase() {
    if(isIncognito || currentChatMessages.length === 0) return;
    const firstUserMsg = currentChatMessages.find(m => m.role === 'user');
    const title = firstUserMsg ? (firstUserMsg.content.substring(0, 30) + '...') : 'محادثة جديدة';
    const chatObj = { id: currentChatId, title, timestamp: Date.now(), messages: currentChatMessages };
    try {
        await set(ref(db, `ai_chats/${currentUser}/${currentChatId}`), chatObj);
    } catch(e) {
        // Fallback to localStorage
        const storageKey = `sa_chat_history_${currentUser}`;
        let history = JSON.parse(localStorage.getItem(storageKey) || '[]');
        const existingIndex = history.findIndex(c => c.id === currentChatId);
        if(existingIndex > -1) { history[existingIndex] = chatObj; } else { history.unshift(chatObj); }
        localStorage.setItem(storageKey, JSON.stringify(history));
    }
}
// Keep saveChatToLocal as alias for compatibility
function saveChatToLocal() { saveChatToFirebase(); }

window.toggleHistory = (show) => {
    playSound('click');
    const sidebar = document.getElementById('ai-history-sidebar');
    if(show) { 
        renderHistoryList(); 
        sidebar.classList.add('open'); 
    } else { 
        sidebar.classList.remove('open'); 
    }
};

function renderHistoryList() {
    const list = document.getElementById('ai-history-list');
    list.innerHTML = '<div style="text-align:center;color:#666;"><i class="fas fa-circle-notch fa-spin"></i></div>';
    
    get(ref(db, `ai_chats/${currentUser}`)).then(snap => {
        list.innerHTML = '';
        let history = [];
        if(snap.exists()) {
            const data = snap.val();
            history = Object.values(data).sort((a, b) => b.timestamp - a.timestamp);
        } else {
            // Fallback from localStorage
            history = JSON.parse(localStorage.getItem(`sa_chat_history_${currentUser}`) || '[]');
        }
        if(history.length === 0) { list.innerHTML = '<p style="color:#666; text-align:center; margin-top:20px;">لا يوجد سجل محادثات</p>'; return; }
        history.forEach(chat => {
            const item = document.createElement('div');
            item.className = 'history-item';
            item.innerHTML = `<div onclick="loadFirebaseChat('${chat.id}')"><div class="history-title">${chat.title}</div><span class="history-date">${new Date(chat.timestamp).toLocaleDateString('ar-EG')}</span></div><i class="fas fa-trash" style="color:#666; font-size:0.8rem; padding:5px;" onclick="deleteFirebaseChat('${chat.id}')"></i>`;
            list.appendChild(item);
        });
    }).catch(() => {
        const history = JSON.parse(localStorage.getItem(`sa_chat_history_${currentUser}`) || '[]');
        list.innerHTML = '';
        if(history.length === 0) { list.innerHTML = '<p style="color:#666; text-align:center; margin-top:20px;">لا يوجد سجل محادثات</p>'; return; }
        history.forEach(chat => {
            const item = document.createElement('div');
            item.className = 'history-item';
            item.innerHTML = `<div onclick="loadLocalChat('${chat.id}')"><div class="history-title">${chat.title}</div><span class="history-date">${new Date(chat.timestamp).toLocaleDateString('ar-EG')}</span></div><i class="fas fa-trash" style="color:#666; font-size:0.8rem; padding:5px;" onclick="deleteLocalChat('${chat.id}')"></i>`;
            list.appendChild(item);
        });
    });
}

window.loadFirebaseChat = async (id) => {
    const snap = await get(ref(db, `ai_chats/${currentUser}/${id}`)).catch(() => null);
    if(snap && snap.exists()) {
        const chat = snap.val();
        currentChatId = chat.id; currentChatMessages = chat.messages || []; isIncognito = false;
        const prefix = selectedRole === 'teacher' ? 't' : 's';
        document.getElementById(`${prefix}-ai-msgs`).innerHTML = '';
        currentChatMessages.forEach(msg => { renderMessageUI(prefix, msg.role, msg.content, msg.image); });
        toggleHistory(false);
        window.toggleAiSendMic(prefix, document.getElementById(`${prefix}-ai-input`)?.value || '');
    }
};

window.deleteFirebaseChat = (id) => {
    event.stopPropagation();
    saConfirm("حذف هذه المحادثة من السجل؟", async () => {
        await remove(ref(db, `ai_chats/${currentUser}/${id}`)).catch(() => {});
        renderHistoryList();
        if(currentChatId === id) startNewChat(selectedRole === 'teacher' ? 't' : 's');
    });
};

window.loadLocalChat = (id) => {
    const history = JSON.parse(localStorage.getItem(`sa_chat_history_${currentUser}`) || '[]');
    const chat = history.find(c => c.id === id);
    if(chat) {
        currentChatId = chat.id; currentChatMessages = chat.messages; isIncognito = false;
        const prefix = selectedRole === 'teacher' ? 't' : 's';
        document.getElementById(`${prefix}-ai-msgs`).innerHTML = '';
        currentChatMessages.forEach(msg => { renderMessageUI(prefix, msg.role, msg.content, msg.image); });
        toggleHistory(false);
        window.toggleAiSendMic(prefix, document.getElementById(`${prefix}-ai-input`)?.value || '');
    }
};

window.deleteLocalChat = (id) => {
    event.stopPropagation();
    saConfirm("حذف هذه المحادثة من السجل؟", () => {
        const storageKey = `sa_chat_history_${currentUser}`;
        let history = JSON.parse(localStorage.getItem(storageKey) || '[]');
        history = history.filter(c => c.id !== id);
        localStorage.setItem(storageKey, JSON.stringify(history));
        renderHistoryList();
        if(currentChatId === id) startNewChat(selectedRole === 'teacher' ? 't' : 's');
    });
};

window.shareCurrentChat = async () => {
    playSound('click');
    if(currentChatMessages.length === 0) return saAlert("لا يمكن مشاركة محادثة فارغة", "info");
    saAlert("جاري إنشاء رابط للمشاركة...", "info");
    // Save chat to firebase for sharing
    const shareRef = ref(db, `shared_chats/${currentChatId}`);
    await set(shareRef, { author: currentUser, authorUid: myUid, timestamp: Date.now(), messages: currentChatMessages, chatId: currentChatId });
    const shareLink = `${window.location.href.split('?')[0]}?shareId=${currentChatId}`;
    navigator.clipboard.writeText(shareLink).then(() => { saAlert("تم نسخ رابط المحادثة! أرسله لمن تريد.", "success"); });
};

window.loadSharedChat = async (shareId, prefix) => {
    const msgs = document.getElementById(`${prefix}-ai-msgs`);
    msgs.innerHTML = '<div style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> جاري استرجاع المحادثة المشاركة...</div>';
    const snap = await get(ref(db, `shared_chats/${shareId}`));
    if(snap.exists()) {
        const data = snap.val();
        currentChatMessages = data.messages || [];
        // Same user: restore same chatId; different user: new chatId
        if(data.author === currentUser) {
            currentChatId = data.chatId || shareId;
        } else {
            currentChatId = generateChatId();
        }
        isIncognito = false;
        saveChatToFirebase();
        msgs.innerHTML = `<div style="text-align:center; background:#222; padding:5px; margin-bottom:10px; font-size:0.8rem; border-radius:10px; color:#aaa;">📨 محادثة مشاركة من ${data.author || 'مجهول'} — يمكنك الاستمرار في المحادثة</div>`;
        currentChatMessages.forEach(msg => { renderMessageUI(prefix, msg.role, msg.content, msg.image); });
        window.history.replaceState({}, document.title, window.location.pathname);
    } else { saAlert("رابط المشاركة غير صالح أو منتهي", "error"); startNewChat(prefix); }
};

function formatAiResponseText(text) {
    if(!text) return '';
    let safeText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    safeText = safeText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    safeText = safeText.replace(/```(.*?)```/gs, '<pre><code>$1</code></pre>');
    safeText = safeText.replace(/`(.*?)`/g, '<code>$1</code>');
    safeText = safeText.replace(/^\s*-\s+(.*)$/gm, '<li>$1</li>');
    if(safeText.includes('<li>')) {
        safeText = safeText.replace(/((<li>.*<\/li>\s*)+)/g, '<ul>$1</ul>');
    }
    safeText = safeText.replace(/\n/g, '<br>');
    return makeLinksClickable(safeText);
}

function renderMessageUI(prefix, role, text, imgB64, useTypewriter = false) {
    const msgs = document.getElementById(`${prefix}-ai-msgs`);
    const wrap = document.createElement('div');
    wrap.className = `chat-msg-wrap ${role}`;

    if (role === 'ai') {
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'ai-msg-avatar';
        avatarDiv.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i>';
        wrap.appendChild(avatarDiv);
    }

    const div = document.createElement('div');
    div.className = `chat-msg ${role}`;

    if (role === 'ai') {
        if (useTypewriter && text) {
            const formattedText = formatAiResponseText(text);
            div.innerHTML = '';
            // Typewriter: reveal HTML character by character safely
            let i = 0;
            const chars = text.split('');
            const typeNext = () => {
                if (i < chars.length) {
                    i++;
                    div.innerHTML = formatAiResponseText(text.substring(0, i));
                    msgs.scrollTop = msgs.scrollHeight;
                    setTimeout(typeNext, 8);
                }
            };
            typeNext();
        } else {
            div.innerHTML = formatAiResponseText(text);
        }
    } else {
        div.innerHTML = makeLinksClickable(text);
    }

    if (imgB64) {
        const img = document.createElement('img');
        img.src = imgB64.startsWith('data:') ? imgB64 : `data:image/jpeg;base64,${imgB64}`;
        div.appendChild(img);
    }

    wrap.appendChild(div);

    if (role === 'ai' && text) {
        const actions = document.createElement('div');
        actions.className = 'msg-ai-actions';
        actions.innerHTML = `
            <button class="msg-action-btn like-btn" title="إعجاب" onclick="this.classList.toggle('liked'); this.querySelector('.like-count').innerText = this.classList.contains('liked') ? '1' : '0';">
                <i class="ph-bold ph-thumbs-up"></i> <span class="like-count">0</span>
            </button>
            <button class="msg-action-btn ai-share-btn" title="مشاركة"><i class="ph-bold ph-share-network"></i></button>
            <button class="msg-action-btn ai-copy-btn" title="نسخ"><i class="ph-bold ph-copy"></i></button>
        `;
        // Use dataset to avoid JS injection in inline handlers
        const shareBtn = actions.querySelector('.ai-share-btn');
        const copyBtn = actions.querySelector('.ai-copy-btn');
        shareBtn.addEventListener('click', () => {
            const snippet = text.substring(0, 200);
            if(navigator.share) navigator.share({text: snippet}).catch(()=>{});
            else navigator.clipboard.writeText(text).then(()=>showToast('تم النسخ','','success',2000));
        });
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(text).then(()=>showToast('تم نسخ الرد','','success',2000));
        });
        wrap.appendChild(actions);
    }

    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
}

function loadTeacherTests() {
    const list = document.getElementById('t-tests-list');
    const resultSelect = document.getElementById('t-result-select');
    list.innerHTML = getMultipleSkeletons(3);
    if (_testsListener) { _testsListener(); _testsListener = null; }
    _testsListener = onValue(ref(db, 'tests'), (snap) => {
        list.innerHTML = ''; resultSelect.innerHTML = '<option>اختر الاختبار للعرض</option>';
        const data = snap.val() || {};
        let count = 0;
        Object.entries(data).forEach(([key, val]) => {
            if (val.teacher === currentUser) {
                count++;
                const opt = document.createElement('option'); opt.value = key; opt.innerText = val.title; resultSelect.appendChild(opt);
                const hiddenStyle = val.isHidden ? 'opacity:0.6; border:1px dashed #666;' : '';
                const cardWrapper = document.createElement('div'); cardWrapper.className = 'card-wrapper';
                cardWrapper.setAttribute('data-exam-id', key);
                const subjectBadge = val.subject ? `<span class="subject-badge">${val.subject}</span>` : '';
                cardWrapper.innerHTML = `
                    <div class="mini-card" style="${hiddenStyle}">
                        <div class="card-header">
                            <div><h3 class="card-title">${val.title}</h3><div class="card-meta">${subjectBadge}<span>${getGradeLabel(val.grade)}</span> • <span>${val.duration} دقيقة</span></div></div>
                            <div class="teacher-badge">نشط</div>
                        </div>
                        <div class="icon-actions">
                            <button class="action-icon edit" onclick="editTest('${key}')" title="تعديل"><i class="fas fa-pen"></i></button>
                            <button class="action-icon share" onclick="shareTest('${val.title}', '${key}')" title="مشاركة"><i class="fas fa-share-alt"></i></button>
                            <button class="action-icon gold" onclick="toggleTestVisibility('${key}', ${!val.isHidden})" title="إخفاء/إظهار"><i class="fas fa-eye${val.isHidden ? '' : '-slash'}"></i></button>
                            <button class="action-icon results-icon" onclick="openResultsTab('${key}')" title="النتائج"><i class="fas fa-chart-bar"></i></button>
                            <button class="action-icon delete" onclick="deleteTest('${key}')" title="حذف"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>`;
                list.appendChild(cardWrapper); list.appendChild(createAdBanner());
            }
        });
        if(count === 0) list.innerHTML = getEmptyStateHTML('exams');
    });
    resultSelect.onchange = (e) => loadTestResults(e.target.value);
}

window.openResultsTab = (testId) => { playSound('click'); switchTab('t-results'); document.getElementById('t-result-select').value = testId; loadTestResults(testId); };

let currentQType = 'mcq';

window.setQType = (type, label) => {
    playSound('click');
    currentQType = type;
    document.querySelectorAll('.type-radio-label').forEach(l => l.classList.remove('active'));
    label.classList.add('active');
    const mcqSection = document.getElementById('mcq-section-wrapper');
    if (type === 'essay') {
        mcqSection.classList.add('hidden');
        // Essay defaults to 2 points
        const ptsInput = document.getElementById('q-points');
        if(ptsInput && ptsInput.value === '1') ptsInput.value = '2';
    } else {
        mcqSection.classList.remove('hidden');
        if(document.getElementById('mcq-options-container').children.length === 0) renderOptionFields();
    }
};

let optionCount = 2; 
window.renderOptionFields = (preloadOptions = null, correctVal = null) => {
    const container = document.getElementById('mcq-options-container'); container.innerHTML = '';
    if(preloadOptions) { preloadOptions.forEach(opt => { addOptionField(opt === correctVal, opt); }); } 
    else { addOptionField(true); addOptionField(); }
};

window.addOptionField = (isCorrect = false, value = '') => {
    const container = document.getElementById('mcq-options-container');
    if(container.children.length >= 6) return saAlert("الحد الأقصى 6 خيارات", "info");
    const div = document.createElement('div'); div.className = 'option-row';
    div.innerHTML = `
        <input type="radio" name="correct_ans_select" class="option-radio" ${isCorrect ? 'checked' : ''}>
        <input type="text" class="smart-input option-input ${isCorrect ? 'correct' : ''}" value="${value}" placeholder="خيار">
        <button onclick="removeOption(this)" class="icon-btn-small" style="color:var(--danger); background:rgba(239,68,68,0.1);"><i class="fas fa-times"></i></button>
    `;
    div.querySelector('input[type="radio"]').addEventListener('change', () => {
        document.querySelectorAll('.option-input').forEach(i => i.classList.remove('correct'));
        div.querySelector('.option-input').classList.add('correct');
    });
    container.appendChild(div);
};

window.removeOption = (btn) => { if(document.getElementById('mcq-options-container').children.length <= 2) return saAlert("يجب وجود خيارين على الأقل", "info"); btn.parentElement.remove(); };

document.getElementById('q-image-input').onchange = async (e) => {
    if(e.target.files[0]) {
        currentImgBase64 = await getBase64(e.target.files[0]);
        document.getElementById('q-img-preview').classList.remove('hidden');
        document.getElementById('q-img-preview').querySelector('img').src = currentImgBase64;
        document.getElementById('q-img-label').innerText = "تم إرفاق صورة";
    }
};

window.addQuestionToList = () => {
    playSound('click');
    const text = document.getElementById('q-text').value; const points = document.getElementById('q-points').value;
    let options = []; let correctVal = null;
    
    if (currentQType === 'mcq') {
        const rows = document.querySelectorAll('.option-row');
        let hasEmpty = false;
        rows.forEach(row => {
            const val = row.querySelector('.option-input').value.trim();
            const isChecked = row.querySelector('input[type="radio"]').checked;
            if(!val) hasEmpty = true; options.push(val); if(isChecked) correctVal = val;
        });
        if(hasEmpty) return saAlert("يرجى ملء جميع الخيارات", "error");
        if(!correctVal) return saAlert("يرجى تحديد الإجابة الصحيحة", "error");
    } else {
        options = null;
        correctVal = 'essay_evaluation'; 
    }

    if(!text && !currentImgBase64) return saAlert("يجب إضافة نص للسؤال أو صورة", "error");
    
    const questionObj = { 
        type: currentQType, 
        text, 
        points, 
        image: currentImgBase64, 
        options: options, 
        correct: correctVal 
    };
    currentQuestions.push(questionObj); renderAddedQuestions(); clearQuestionForm();
};

function clearQuestionForm() {
    document.getElementById('q-text').value = ''; document.getElementById('q-points').value = '1';
    currentImgBase64 = null; document.getElementById('q-image-input').value = '';
    document.getElementById('q-img-preview').classList.add('hidden'); document.getElementById('q-img-label').innerText = "إرفاق صورة";
    renderOptionFields();
}

function renderAddedQuestions() {
    const list = document.getElementById('added-questions-list'); list.innerHTML = '';
    currentQuestions.forEach((q, idx) => {
        const typeLabel = q.type === 'essay' ? '<span style="color:var(--accent-primary); font-size:0.8rem;">(مقالي)</span>' : '';
        const div = document.createElement('div'); div.className = 'mini-card';
        div.style = "flex-direction:row; justify-content:space-between; align-items:center;";
        div.innerHTML = `
            <div style="flex:1;"><span style="font-weight:bold;">س${idx + 1}:</span> ${q.text || 'سؤال صورة'} ${typeLabel} ${q.image ? '<i class="fas fa-image" style="color:var(--accent-primary); margin-right:5px;"></i>' : ''}</div>
            <div style="display:flex; gap:10px;">
                <button onclick="editQuestion(${idx})" class="icon-btn-small" style="color:var(--accent-primary); background:rgba(59,130,246,0.1);"><i class="fas fa-pen"></i></button>
                <button onclick="deleteQuestion(${idx})" class="icon-btn-small" style="color:var(--danger); background:rgba(239,68,68,0.1);"><i class="fas fa-trash"></i></button>
            </div>`;
        list.appendChild(div);
    });
}

window.deleteQuestion = (idx) => { saConfirm("حذف السؤال؟", () => { currentQuestions.splice(idx, 1); renderAddedQuestions(); }); };

window.editQuestion = (idx) => {
    playSound('click');
    const q = currentQuestions[idx];
    document.getElementById('q-text').value = q.text; document.getElementById('q-points').value = q.points;
    
    const typeLabels = document.querySelectorAll('.type-radio-label');
    if (q.type === 'essay') {
        setQType('essay', typeLabels[1]);
        typeLabels[1].querySelector('input').checked = true;
    } else {
        setQType('mcq', typeLabels[0]);
        typeLabels[0].querySelector('input').checked = true;
        renderOptionFields(q.options, q.correct);
    }

    if(q.image) {
        currentImgBase64 = q.image;
        document.getElementById('q-img-preview').classList.remove('hidden');
        document.getElementById('q-img-preview').querySelector('img').src = currentImgBase64;
        document.getElementById('q-img-label').innerText = "صورة موجودة";
    }
    
    currentQuestions.splice(idx, 1); renderAddedQuestions();
    document.getElementById('q-editor-box').scrollIntoView({behavior: 'smooth'});
};

window.resetCreateForm = () => {
    document.getElementById('new-test-name').value = ''; document.getElementById('new-test-grade').value = ''; document.getElementById('new-test-duration').value = '';
    const subj = document.getElementById('new-test-subject'); if(subj) subj.value = '';
    document.getElementById('custom-grade-input').classList.add('hidden');
    const customSubjInput = document.getElementById('custom-subject-input'); if(customSubjInput) { customSubjInput.value = ''; customSubjInput.classList.add('hidden'); }
    document.getElementById('create-page-title').innerText = "اختبار جديد";
    document.getElementById('btn-save-test').innerHTML = '<i class="fas fa-save"></i> نشر الاختبار النهائي';
    currentQuestions = []; renderAddedQuestions(); clearQuestionForm(); isEditingMode = false; editingTestId = null;
};

window.editTest = async (testId) => {
    playSound('click');
    const snap = await get(ref(db, `tests/${testId}`));
    if(!snap.exists()) return saAlert("الاختبار غير موجود", "error");
    const data = snap.val(); isEditingMode = true; editingTestId = testId;
    switchTab('t-create');
    document.getElementById('create-page-title').innerText = "تعديل الاختبار: " + data.title;
    document.getElementById('btn-save-test').innerHTML = '<i class="fas fa-save"></i> حفظ التعديلات';
    document.getElementById('new-test-name').value = data.title; document.getElementById('new-test-duration').value = data.duration;
    const gradeSelect = document.getElementById('new-test-grade'); const options = Array.from(gradeSelect.options).map(o => o.value);
    if(options.includes(data.grade)) { gradeSelect.value = data.grade; document.getElementById('custom-grade-input').classList.add('hidden'); } 
    else { gradeSelect.value = 'custom'; document.getElementById('custom-grade-input').classList.remove('hidden'); document.getElementById('custom-grade-input').value = data.grade; }
    currentQuestions = data.questions || []; if(!Array.isArray(currentQuestions)) currentQuestions = Object.values(currentQuestions);
    renderAddedQuestions();
    const subjectEl = document.getElementById('new-test-subject');
    if(subjectEl && data.subject) { subjectEl.value = data.subject; }
};

window.saveTest = async () => {
    playSound('click');
    const title = document.getElementById('new-test-name').value;
    let grade = document.getElementById('new-test-grade').value; if(grade === 'custom') grade = document.getElementById('custom-grade-input').value;
    const duration = document.getElementById('new-test-duration').value;
    let subject = document.getElementById('new-test-subject').value;
    if(subject === 'custom_subject') subject = document.getElementById('custom-subject-input').value.trim();
    if(!title || !grade || !duration || !subject || currentQuestions.length === 0) {
        if (!subject) {
            const el = document.getElementById('new-test-subject');
            el.classList.add('new-test-subject-required');
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => el.classList.remove('new-test-subject-required'), 1500);
        }
        return saAlert("البيانات ناقصة — تأكد من اختيار المادة وإضافة سؤال واحد على الأقل", "error");
    }
    const payload = { teacher: currentUser, title, grade, duration, subject, questions: currentQuestions, timestamp: Date.now(), isHidden: false };
    if (isEditingMode && editingTestId) { await update(ref(db, `tests/${editingTestId}`), payload); saAlert("تم تعديل الاختبار بنجاح!", "success"); } 
    else { await push(ref(db, 'tests'), payload); saAlert("تم نشر الاختبار بنجاح!", "success"); }
    resetCreateForm(); switchTab('t-library');
};

window.checkCustomGrade = (el) => { document.getElementById('custom-grade-input').classList.toggle('hidden', el.value !== 'custom'); };
window.checkCustomSubject = (el) => { document.getElementById('custom-subject-input').classList.toggle('hidden', el.value !== 'custom_subject'); };
window.toggleTestVisibility = (k, s) => { playSound('click'); update(ref(db, `tests/${k}`), { isHidden: s }); saAlert(s ? "تم إخفاء الاختبار عن الطلاب" : "الاختبار الآن مرئي للطلاب", "info"); };
window.deleteTest = (k) => { saConfirm("هل أنت متأكد من حذف هذا الاختبار؟", () => { remove(ref(db, `tests/${k}`)); remove(ref(db, `results/${k}`)); saAlert("تم الحذف بنجاح", "success"); }); };

window.shareTest = async (title, id) => {
    playSound('click');
    const url = `${window.location.href.split('?')[0]}?examId=${id}`;
    const snap = await get(ref(db, `tests/${id}`)).catch(() => null);
    const subject = snap?.val()?.subject || '';
    const questionCount = snap?.val()?.questions?.length || 0;
    const duration = snap?.val()?.duration || '';
    const teacher = snap?.val()?.teacher || '';
    const shareText = `📚 ${subject ? subject + ' - ' : ''}${title}\n👤 ${teacher}\n❓ ${questionCount} سؤال • ⏱ ${duration} دقيقة\n\nاضغط للدخول للاختبار:`;
    if (navigator.share) {
        navigator.share({ title: `اختبار: ${title}`, text: shareText, url }).catch(() => {});
    } else {
        navigator.clipboard.writeText(`${shareText}\n${url}`).then(() => saAlert("تم نسخ رابط الاختبار!", "success"));
    }
};
function getGradeLabel(c) { return ({'1p':'1 ابتدائي','3s':'3 ثانوي'})[c] || c; }

window.loadTestResults = (testId) => {
    if(!testId || testId.includes('اختر')) return;
    const div = document.getElementById('t-results-container'); div.innerHTML = '<div style="text-align:center;"><i class="fas fa-spinner fa-spin"></i></div>';
    get(ref(db, `results/${testId}`)).then(async snap => {
        div.innerHTML = '';
        if(!snap.exists()) return div.innerHTML = '<p style="text-align:center; color:#666;">لا توجد نتائج لهذا الاختبار بعد</p>';
        snap.forEach(c => {
            const studentName = c.key; const v = c.val(); const color = v.percentage >= 50 ? 'var(--success)' : 'var(--danger)';
            const el = document.createElement('div'); el.className = 'mini-card';
            el.style = "flex-direction:row; justify-content:space-between; align-items:center; margin-bottom:10px;";
            el.innerHTML = `
                <div><span style="font-weight:bold; display:block;">${studentName}</span><span style="font-size:0.8rem; color:#888;">${new Date(v.timestamp).toLocaleDateString()}</span></div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-weight:bold; color:${color}; font-size:1.1rem;">${v.percentage}%</span>
                    <button class="action-icon view" onclick="viewStudentDetails('${testId}', '${studentName}')"><i class="fas fa-eye"></i></button>
                </div>`;
            div.appendChild(el);
        });
    });
};

window.viewStudentDetails = async (testId, studentName) => {
    playSound('click');
    let phone = "غير مسجل"; const userSnap = await get(ref(db, `users/students/${studentName}`));
    if(userSnap.exists() && userSnap.val().phone) phone = userSnap.val().phone;
    const resSnap = await get(ref(db, `results/${testId}/${studentName}`)); const res = resSnap.val();
    document.getElementById('td-name').innerText = studentName; document.getElementById('td-phone').innerText = phone;
    const list = document.getElementById('td-answers-list'); list.innerHTML = '';
    if (res.details && Array.isArray(res.details)) {
        res.details.forEach((d, i) => {
            const isEssay = d.type === 'essay';
            let statusColor;
            if (isEssay) statusColor = 'var(--accent-primary)'; 
            else statusColor = d.isCorrect ? 'var(--success)' : 'var(--danger)';
            
            const essayBadge = isEssay ? '<span style="font-size:0.7rem; background:rgba(255,255,255,0.1); padding:2px 5px; border-radius:4px;">مقالي</span>' : '';

            list.innerHTML += `
                <div style="background:#222; padding:10px; border-radius:10px; margin-bottom:10px; border-right:3px solid ${statusColor}">
                    <p style="margin:0 0 5px; font-weight:bold;">س${i+1}: ${d.q} ${essayBadge}</p>
                    ${d.image ? `<img src="${d.image}" style="max-width:100%; height:auto; border-radius:8px; margin-bottom:10px;">` : ''}
                    <div style="font-size:0.9rem; color:#aaa;">إجابة الطالب: <span style="color:#fff; white-space: pre-wrap;">${d.user}</span></div>
                    ${!d.isCorrect && !isEssay ? `<div style="font-size:0.9rem; color:var(--success);">الصحيحة: ${d.correct}</div>` : ''}
                    ${isEssay ? `<div style="font-size:0.9rem; color:var(--accent-primary); margin-top:5px;">الإجابة النموذجية (AI): ${d.correct || 'غير متوفرة'}</div>` : ''}
                </div>`;
        });
    } else { list.innerHTML = '<p>لا توجد تفاصيل.</p>'; }
    document.getElementById('teacher-detail-modal').classList.remove('hidden');
};

function loadStudentExams() {
    const list = document.getElementById('s-exams-list');
    list.innerHTML = getMultipleSkeletons(3);
    if (_studentExamsListener) { _studentExamsListener(); _studentExamsListener = null; }
    _studentExamsListener = onValue(ref(db, 'tests'), async (snap) => {
        list.innerHTML = ''; const tests = snap.val();
        if (!tests) return list.innerHTML = getEmptyStateHTML('exams');
        let foundExam = false;
        const promises = Object.entries(tests).map(async ([key, val]) => {
            if (val.isHidden === true) return null;
            const resSnap = await get(ref(db, `results/${key}/${currentUser}/latest`)).catch(() => null)
                || await get(ref(db, `results/${key}/${currentUser}`)).catch(() => null);
            if (resSnap && resSnap.exists()) {
                const resVal = resSnap.val();
                return { key, val, hasTaken: true, score: resVal.percentage != null ? resVal.percentage : null };
            }
            return { key, val, hasTaken: false, score: null };
        });
        const results = await Promise.all(promises);
        results.forEach(item => {
            if(!item) return; foundExam = true; const { key, val, hasTaken, score } = item;
            const cardWrapper = document.createElement('div'); cardWrapper.className = 'card-wrapper';
            cardWrapper.setAttribute('data-exam-id', key);
            const subjectBadge = val.subject ? `<span class="subject-badge">${val.subject}</span>` : '';
            let buttonsHtml = hasTaken ? 
                `<button class="action-icon share" onclick="shareTest('${val.title}', '${key}')" title="مشاركة"><i class="fas fa-share-alt"></i></button>
                    <button class="action-icon edit" onclick="checkPhoneAndStart('${key}')" title="إعادة الاختبار"><i class="fas fa-redo"></i></button>
                    <button class="action-icon gold" onclick="reviewTest('${key}')" title="مراجعة"><i class="fas fa-file-alt"></i></button>` :
                `<button class="action-icon share" onclick="shareTest('${val.title}', '${key}')" title="مشاركة"><i class="fas fa-share-alt"></i></button>
                    <button class="action-icon edit" style="width:100%; border-radius:15px; background:var(--accent-primary); color:white; justify-content:center;" onclick="checkPhoneAndStart('${key}')"><i class="fas fa-rocket"></i> ابدأ الآن</button>`;
            cardWrapper.innerHTML = `
                <div class="mini-card">
                    <div class="card-header">
                        <div><h3 class="card-title">${val.title}</h3><div class="card-meta">${subjectBadge}<span>${val.teacher}</span> • ${val.duration} دقيقة</div></div>
                        ${hasTaken ? `<span style="color:var(--success); font-weight:bold;">${score}%</span>` : ''}
                    </div>
                    <div class="icon-actions">${buttonsHtml}</div>
                </div>`;
            list.appendChild(cardWrapper); list.appendChild(createAdBanner());
        });
        if(!foundExam) list.innerHTML = getEmptyStateHTML('exams');
    });
}

window.loadStudentGrades = () => {
        const list = document.getElementById('s-grades-list');
        list.innerHTML = getMultipleSkeletons(2);
        get(ref(db, 'tests')).then(async (testSnap) => {
            list.innerHTML = ''; const tests = testSnap.val() || {}; let foundAny = false;
            for(const [testId, testData] of Object.entries(tests)) {
            const resSnap = await get(ref(db, `results/${testId}/${currentUser}/latest`)).catch(() => null)
                || await get(ref(db, `results/${testId}/${currentUser}`)).catch(() => null);
                if(resSnap && resSnap.exists() && resSnap.val().percentage != null) {
                    foundAny = true; const res = resSnap.val();
                    const color = res.percentage >= 90 ? 'var(--accent-gold)' : (res.percentage >= 50 ? 'var(--success)' : 'var(--danger)');
                    const div = document.createElement('div'); div.className = 'mini-card';
                    div.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div><h3 style="font-size:1rem; margin:0;">${testData.title}</h3><span style="font-size:0.8rem; color:#888;">${new Date(res.timestamp).toLocaleDateString()}</span></div>
                        <div style="text-align:left;"><div style="font-weight:bold; font-size:1.4rem; color:${color};">${res.percentage}%</div><div style="font-size:0.8rem; color:#aaa;">${res.score} / ${res.total}</div></div>
                    </div>
                    <button onclick="reviewTest('${testId}')" class="modern-btn secondary" style="margin-top:10px; font-size:0.8rem; padding:8px; justify-content: center;"><i class="fas fa-list-alt"></i> مراجعة التفاصيل</button>`;
                    list.appendChild(div);
                }
            }
            if(!foundAny) list.innerHTML = '<p style="text-align:center; padding:20px; color:#666;">لم تقم بأي اختبارات بعد.</p>';
        });
};

let tempTestId = null;
window.checkPhoneAndStart = async (id) => {
    playSound('click');
    tempTestId = id; const userSnap = await get(ref(db, `users/students/${currentUser}`));
    if(userSnap.exists() && userSnap.val().phone) startTest(id); else document.getElementById('phone-modal').classList.remove('hidden');
};

window.savePhoneAndStart = async () => {
    playSound('click');
    const phone = document.getElementById('student-phone-input').value.trim();
    if(!phone || phone.length < 10) return saAlert("يرجى إدخال رقم صحيح", "error");
    await update(ref(db, `users/students/${currentUser}`), { phone: phone });
    document.getElementById('phone-modal').classList.add('hidden'); startTest(tempTestId);
};

let activeTest = null; let timerInt = null; let answers = {};

window.startTest = async (id) => {
    const snap = await get(ref(db, `tests/${id}`));
    if (!snap.exists()) return saAlert("عذراً، هذا الاختبار لم يعد موجوداً.", "error");
    activeTest = snap.val(); activeTest.id = id;
    if (!activeTest.questions) activeTest.questions = []; else if (!Array.isArray(activeTest.questions)) activeTest.questions = Object.values(activeTest.questions);
    answers = {};
    document.getElementById('s-taking-test').classList.remove('hidden'); document.getElementById('active-test-title').innerText = activeTest.title;
    const div = document.getElementById('test-questions-render'); div.innerHTML = '';
    if (activeTest.questions.length === 0) { div.innerHTML = '<p style="text-align:center;">لا توجد أسئلة في هذا الاختبار.</p>'; } else {
        activeTest.questions.forEach((q, i) => {
            const isEssay = q.type === 'essay';
            let inputHtml = '';
            
            if (isEssay) {
                inputHtml = `<textarea class="smart-input" style="min-height:80px; margin-top:10px;" placeholder="اكتب إجابتك هنا..." onchange="saveAns(${i}, this.value)"></textarea>`;
            } else {
                if (!q.options) q.options = []; const shuffled = [...q.options].sort(() => Math.random() - 0.5);
                inputHtml = shuffled.map((o, oi) => {
                    const safeDisplay = String(o).replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    const dataAttr = String(o).replace(/"/g, '&quot;');
                    return `<label class="mini-card" style="flex-direction:row; align-items:center; gap:10px; cursor:pointer; margin-bottom:8px; padding:12px;"><input type="radio" name="q${i}" data-ans="${dataAttr}" onchange="saveAns(${i}, this.dataset.ans)"><span>${safeDisplay}</span></label>`;
                }).join('');
            }

            div.innerHTML += `
                <div style="margin-bottom:25px;">
                    <p style="font-weight:bold; font-size:1.1rem; margin-bottom:10px;">${i+1}. ${q.text}</p>
                    ${q.image ? `<img src="${q.image}" style="max-width:100%; border-radius:10px; margin-bottom:10px;">` : ''}
                    ${inputHtml}
                </div>`;
        });
    }
    let time = activeTest.duration * 60; clearInterval(timerInt);
    timerInt = setInterval(() => {
        time--; const m = Math.floor(time/60), s = time%60; document.getElementById('test-timer').innerText = `${m}:${s<10?'0'+s:s}`;
        if(time<=0) submitExam();
    }, 1000);
};

window.saveAns = (i, v) => answers[i] = v;
window.closeExam = () => { saConfirm("خروج من الامتحان؟ ستفقد تقدمك.", () => { clearInterval(timerInt); timerInt = null; activeTest = null; answers = {}; document.getElementById('s-taking-test').classList.add('hidden'); }); };

window.submitExam = async () => {
    playSound('success');
    clearInterval(timerInt);
    let score = 0, total = 0, details = [];
    const questions = activeTest.questions || [];
    const hasEssay = questions.some(q => q.type === 'essay');

    questions.forEach((q, i) => {
        const pts = parseInt(q.points) || 1;
        total += pts;
        let isCorrect = false;
        if (q.type === 'essay') {
            // Don't add essay points here - AI will grade later
            isCorrect = false;
        } else {
            isCorrect = answers[i] === q.correct;
            if (isCorrect) score += pts;
        }
        details.push({ q: q.text, image: q.image || null, user: answers[i]||'-', correct: q.correct, isCorrect, type: q.type || 'mcq' });
    });

    let pct = total === 0 ? 0 : Math.round((score/total)*100);

    if (hasEssay) {
        const overlay = document.getElementById('exam-grading-overlay');
        overlay.classList.remove('hidden');
        try {
            const essayPromises = questions.map(async (q, i) => {
                if (q.type !== 'essay' || !answers[i] || answers[i].trim().length < 3) return;
                const pts = parseInt(q.points) || 2;
                const aiPrompt = `أنت مصحح اختبار. سؤال مقالي: "${q.text}"\nإجابة الطالب: "${answers[i]}"\nالإجابة النموذجية: "${q.correct || 'غير محددة'}"\n\nقيّم الإجابة من 2 فقط (0 = خطأ كامل، 1 = نصف صح، 2 = صح كامل). أجب برقم فقط: 0 أو 1 أو 2`;
                try {
                    const result = await callPollinationsAI([{role:'user', content: aiPrompt}]);
                    const match = result.match(/[012]/);
                    const earnedPts = match ? parseInt(match[0]) : (result.includes('صح') || result.includes('correct') ? 2 : 0);
                    const scaledPts = Math.round((earnedPts / 2) * pts);
                    score += scaledPts;
                    details[i].isCorrect = earnedPts >= 1;
                    details[i].aiGrading = `${earnedPts}/2 — ${result.substring(0, 80)}`;
                    details[i].earnedPts = scaledPts;
                } catch(e) {
                    // On error, give full points if answered
                    if(answers[i] && answers[i].trim().length > 2) score += pts;
                }
            });
            await Promise.all(essayPromises);
            pct = total === 0 ? 0 : Math.round((score/total)*100);
        } catch(e) {}
        overlay.classList.add('hidden');
    }

    const attemptKey = `attempt_${Date.now()}`;
    const resultData = { score, total, percentage: pct, timestamp: Date.now(), details };
    await set(ref(db, `results/${activeTest.id}/${currentUser}/${attemptKey}`), resultData);
    await set(ref(db, `results/${activeTest.id}/${currentUser}/latest`), resultData);

    document.getElementById('s-taking-test').classList.add('hidden');
    showExamResultScreen(pct, score, total, details, activeTest.id);
    loadStudentExams(); loadStudentGrades();
};

window.showExamResultScreen = (pct, score, total, details, testId) => {
    playSound('success');
    const screen = document.getElementById('s-exam-result');
    document.getElementById('exam-result-pct').innerText = pct + '%';
    
    let gradeColor, gradeTitle, suggestion;
    if (pct >= 90) { gradeColor = 'var(--accent-gold)'; gradeTitle = 'ممتاز! أداء رائع 🏆'; suggestion = 'استمر في هذا المستوى الرائع وساعد زملاءك.'; }
    else if (pct >= 75) { gradeColor = 'var(--success)'; gradeTitle = 'جيد جداً! 🌟'; suggestion = 'أنت قريب من التميز، راجع النقاط الضعيفة.'; }
    else if (pct >= 60) { gradeColor = 'var(--accent-primary)'; gradeTitle = 'جيد 👍'; suggestion = 'مراجعة الدروس مع الأسئلة الخاطئة ستحسّن نتيجتك.'; }
    else if (pct >= 40) { gradeColor = 'var(--warning)'; gradeTitle = 'مقبول - يحتاج مراجعة 📚'; suggestion = 'ركز على المواد الضعيفة واستشر مساعد الذكاء الاصطناعي.'; }
    else { gradeColor = 'var(--danger)'; gradeTitle = 'يحتاج مجهود أكبر 💪'; suggestion = 'لا تيأس! راجع الدروس من البداية واطلب المساعدة من المعلم.'; }

    const circle = document.getElementById('exam-result-score-circle');
    circle.style.borderColor = gradeColor;
    document.getElementById('exam-result-title').innerText = gradeTitle;
    document.getElementById('exam-result-title').style.color = gradeColor;
    document.getElementById('exam-result-suggestion').innerText = suggestion;

    const wrongList = document.getElementById('exam-result-wrong-list');
    wrongList.innerHTML = '';
    const wrongQuestions = details.filter(d => !d.isCorrect);
    if (wrongQuestions.length === 0) {
        wrongList.innerHTML = '<p style="color:var(--success); text-align:center;"><i class="fas fa-check-circle"></i> أحسنت! لم تخطئ في أي سؤال.</p>';
    } else {
        wrongQuestions.forEach((d, i) => {
            const div = document.createElement('div');
            div.className = 'mini-card';
            div.style.borderRight = '4px solid var(--danger)';
            div.style.marginBottom = '12px';
            div.innerHTML = `
                <p style="margin:0 0 8px; font-weight:bold; font-size:0.9rem;"><i class="fas fa-times-circle" style="color:var(--danger);margin-left:5px;"></i>${d.q}</p>
                <div style="background:rgba(255,255,255,0.05); padding:8px; border-radius:8px; font-size:0.85rem; color:#aaa;">إجابتك: <span style="color:#fff;">${d.user}</span></div>
                ${d.type !== 'essay' && d.correct ? `<div style="background:rgba(16,185,129,0.1); padding:8px; border-radius:8px; font-size:0.85rem; margin-top:6px; color:var(--success);">الصحيحة: ${d.correct}</div>` : ''}
            `;
            wrongList.appendChild(div);
        });
    }

    window._lastExamResultTestId = testId;
    screen.classList.remove('hidden');
};

window.closeExamResult = () => {
    document.getElementById('s-exam-result').classList.add('hidden');
    activeTest = null; answers = {};
};

window.retryExamFromResult = () => {
    const testId = window._lastExamResultTestId;
    document.getElementById('s-exam-result').classList.add('hidden');
    if (testId) checkPhoneAndStart(testId);
};

window.reviewTest = async (id) => {
    playSound('click');
    const resSnap = await get(ref(db, `results/${id}/${currentUser}/latest`)).catch(() => null)
        || await get(ref(db, `results/${id}/${currentUser}`)).catch(() => null);
    if(!resSnap || !resSnap.exists()) return saAlert("لم تقم بهذا الاختبار", "info");
    const res = resSnap.val();
    const pct = res.percentage || 0;
    const div = document.getElementById('review-content');
    div.innerHTML = `<h1 style="text-align:center; color:var(--accent-primary); margin-bottom:20px;">${pct}%</h1>`;
    if (res.details && Array.isArray(res.details)) {
        res.details.forEach((d, i) => {
            const isEssay = d.type === 'essay';
            const borderColor = d.isCorrect ? 'var(--success)' : (isEssay ? 'var(--accent-primary)' : 'var(--danger)');
            const icon = d.isCorrect ? '<i class="fas fa-check-circle" style="color:var(--success)"></i>' : (isEssay ? '<i class="fas fa-pen" style="color:var(--accent-primary)"></i>' : '<i class="fas fa-times-circle" style="color:var(--danger)"></i>');
            div.innerHTML += `
                <div class="mini-card" style="border-right:4px solid ${borderColor}">
                    <div style="display:flex; justify-content:space-between;"><strong>س${i+1}: ${d.q}</strong>${icon}</div>
                    ${d.image ? `<img src="${d.image}" style="max-width:100%; height:auto; border-radius:8px; margin-top:10px;">` : ''}
                    <div style="margin-top:10px; background:rgba(255,255,255,0.05); padding:10px; border-radius:8px;"><p style="margin:0; font-size:0.9rem; color:#aaa;">إجابتك:</p><p style="margin:5px 0 0 0; font-weight:bold; color:${d.isCorrect ? 'var(--success)' : '#fff'}">${d.user}</p></div>
                    ${!isEssay && !d.isCorrect ? `<div style="margin-top:5px; background:rgba(16, 185, 129, 0.1); padding:10px; border-radius:8px;"><p style="margin:0; font-size:0.9rem; color:var(--success);">الإجابة الصحيحة:</p><p style="margin:5px 0 0 0; font-weight:bold;">${d.correct}</p></div>` : ''}
                </div>`;
        });
    } else { div.innerHTML += '<p>لا توجد تفاصيل متاحة للمراجعة.</p>'; }
    document.getElementById('s-review-test').classList.remove('hidden');
};

window.toggleAiGenerator = () => { playSound('click'); document.getElementById('ai-gen-modal').classList.toggle('open'); };

window.previewChatImg = async (prefix) => {
    const input = document.getElementById(`${prefix}-ai-file`);
    if(input.files[0]) {
        const b64 = await getBase64(input.files[0]);
        document.getElementById(`${prefix}-chat-preview`).style.display = 'block';
        document.getElementById(`${prefix}-chat-img-tag`).src = b64;
    }
};

window.previewAiGenImg = async (input) => {
    if(input.files[0]) {
        const b64 = await getBase64(input.files[0]);
        aiGenImgBase64 = b64;
        document.getElementById('ai-gen-preview').classList.remove('hidden');
        document.getElementById('ai-gen-preview').querySelector('img').src = b64;
    }
};

window.clearChatImg = (prefix) => {
    document.getElementById(`${prefix}-ai-file`).value = '';
    document.getElementById(`${prefix}-chat-preview`).style.display = 'none';
};

window.toggleAiSendMic = (role, value) => {
    const micBtn = document.getElementById(role + '-mic-btn');
    const sendBtn = document.getElementById(role + '-send-btn');
    if (!micBtn || !sendBtn) return;
    if (value && value.trim()) {
        micBtn.style.display = 'none';
        sendBtn.style.display = 'flex';
    } else {
        micBtn.style.display = 'flex';
        sendBtn.style.display = 'none';
    }
};

let _isRecording = false;
window._speechRecog = null;

window.startVoiceInput = (role) => {
    const micBtn = document.getElementById(role + '-mic-btn');
    const input = document.getElementById(role + '-ai-input');

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        saAlert('الإدخال الصوتي غير مدعوم على هذا المتصفح. جرب Chrome أو Edge.', 'error');
        return;
    }

    if (_isRecording) {
        if (window._speechRecog) window._speechRecog.stop();
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recog = new SpeechRecognition();
    window._speechRecog = recog;
    recog.lang = 'ar-SA';
    recog.continuous = false;
    recog.interimResults = false;

    recog.onstart = () => {
        _isRecording = true;
        if (micBtn) micBtn.classList.add('recording');
        showToast('جاري الاستماع...', 'تحدث الآن', 'info', 5000);
    };

    recog.onresult = (e) => {
        const text = e.results[0][0].transcript;
        if (input) {
            input.value = (input.value + ' ' + text).trim();
            window.toggleAiSendMic(role, input.value);
        }
    };

    recog.onerror = (e) => {
        _isRecording = false;
        if (micBtn) micBtn.classList.remove('recording');
        if (e.error !== 'no-speech') showToast('فشل الإدخال الصوتي', '', 'error', 2000);
    };

    recog.onend = () => {
        _isRecording = false;
        if (micBtn) micBtn.classList.remove('recording');
    };

    recog.start();
};

window.sendAiMsg = async (prefix) => {
    const input = document.getElementById(`${prefix}-ai-input`); 
    const fileInput = document.getElementById(`${prefix}-ai-file`);
    const msgs = document.getElementById(`${prefix}-ai-msgs`); 
    let txt = input.value.trim();
    
    if(!txt && !fileInput.files[0]) return;
    
    playSound('sent');

    if (!fileInput.files[0]) {
        if (txt.includes("أنشئ اختبار") || txt.includes("create exam") || txt.includes("امتحان")) {
            if(selectedRole !== 'teacher') {
                return saAlert("عذراً، هذه الميزة للمعلمين فقط.", "error");
            }
            toggleAiGenerator();
            const topic = txt.replace("أنشئ اختبار", "").replace("عن", "").replace("create exam", "").replace("about", "").trim();
            if(topic) document.getElementById('ai-gen-text').value = topic;
            return; 
        }
        if (txt.includes("انشر") || txt.includes("بوست") || txt.includes("post")) {
            openReeseCompose();
            const content = txt.replace("انشر", "").replace("بوست", "").replace("post", "").replace("عن", "").trim();
            if(content) document.getElementById('reese-text-input').value = content;
            return;
        }
    }

    const welcomeScreen = msgs.querySelector('.ai-welcome-screen'); 
    if(welcomeScreen) welcomeScreen.remove();
    
    let imgB64 = null;
    let ocrText = "";

    if(fileInput.files[0]) {
        const ocrLoadId = 'ocr-loading-' + Date.now();
        const ocrLoader = document.createElement('div');
        ocrLoader.className = 'chat-msg ai';
        ocrLoader.id = ocrLoadId;
        ocrLoader.innerHTML = '<i class="fas fa-eye fa-spin"></i> جاري تحليل الصورة...';
        msgs.appendChild(ocrLoader);
        
        try {
            imgB64 = await getBase64(fileInput.files[0]);
            ocrText = await recognizeImageText(imgB64);
            document.getElementById(ocrLoadId).remove();
            clearChatImg(prefix);
        } catch (e) {
            document.getElementById(ocrLoadId).innerHTML = "فشل تحليل الصورة.";
            console.error(e);
            return;
        }
    }
    
    currentChatMessages.push({ role: 'user', content: ocrText ? txt + '\n[صورة مرفقة: ' + ocrText + ']' : txt, image: imgB64 });
    renderMessageUI(prefix, 'user', txt, imgB64);
    input.value = '';
    window.toggleAiSendMic(prefix, '');
    saveChatToFirebase();

    // Thinking avatar loader
    const loadId = 'loading-' + Date.now();
    const loaderDiv = document.createElement('div');
    loaderDiv.className = 'chat-msg-wrap ai';
    loaderDiv.id = loadId;
    loaderDiv.innerHTML = `
        <div class="ai-thinking-wrap">
            <div class="ai-thinking-orb">
                <div class="ai-orb-ring"></div>
                <div class="ai-orb-ring ai-orb-ring2"></div>
                <div class="ai-orb-ring ai-orb-ring3"></div>
                <i class="fas fa-wand-magic-sparkles ai-orb-icon"></i>
            </div>
            <div class="ai-thinking-dots"><span></span><span></span><span></span></div>
        </div>`;
    msgs.appendChild(loaderDiv);
    msgs.scrollTop = msgs.scrollHeight;

    try {
        const userFirstName = currentUser ? currentUser.split(' ')[0] : '';
        const userIcon = localStorage.getItem('sa_icon') || '';
        const userUid = myUid || '';
        const roleAr = selectedRole === 'teacher' ? 'معلم' : 'طالب';

        const sysContent = selectedRole === 'student'
            ? `أنت SA AI، مساعد دراسي ذكي تم تصميمه وتطويره بواسطة سيف هاني. أجب بالعربية دائماً. اجعل إجابتك متناسبة مع السؤال: قصيرة للأسئلة البسيطة، مفصلة للمعقدة. استخدم **نص** للتمييز و- للقوائم. منصة SA EDU هي منصة تعليمية متكاملة تضم: مكتبة الاختبارات، دردشة مباشرة، Reese (مجتمع أفكار)، وذكاء اصطناعي. صممها سيف هاني. المستخدم الحالي اسمه "${currentUser}"، ${roleAr}، معرفه ${userUid}.`
            : `أنت SA AI، مساعد معلمين ذكي تم تصميمه وتطويره بواسطة سيف هاني. أجب بالعربية دائماً. ساعد في إنشاء الاختبارات وتحضير الدروس وتحليل الطلاب. منصة SA EDU تضم: مكتبة الاختبارات، إنشاء اختبارات، نتائج الطلاب، دردشة مباشرة، Reese، وذكاء اصطناعي. صممها سيف هاني. المعلم الحالي اسمه "${currentUser}"، معرفه ${userUid}.`;

        const messages = [
            { role: 'system', content: sysContent },
            ...currentChatMessages.slice(-10).map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }))
        ];

        const reply = await callPollinationsAI(messages);

        playSound('recv');
        const loaderEl = document.getElementById(loadId);
        if (loaderEl) loaderEl.remove();
        currentChatMessages.push({ role: 'ai', content: reply, image: null });
        renderMessageUI(prefix, 'ai', reply, null, true);
        saveChatToFirebase();
    } catch (e) {
        const loaderEl = document.getElementById(loadId);
        if (loaderEl) loaderEl.innerHTML = '<div class="chat-msg ai" style="color:#ef4444;">⚠️ خطأ في الاتصال. تحقق من الإنترنت وحاول مرة أخرى.</div>';
    }
};

window.generateAiQuestions = async () => {
    playSound('click');
    const topic = document.getElementById('ai-gen-text').value;
    const mcqCount = document.getElementById('ai-mcq-count').value || 0;
    const essayCount = document.getElementById('ai-essay-count').value || 0;
    const total = parseInt(mcqCount) + parseInt(essayCount);
    
    if (!topic && !aiGenImgBase64) return saAlert("أدخل الموضوع أو ارفع صورة", "error");
    if (total === 0) return saAlert("يجب تحديد عدد الأسئلة", "error");

    toggleConstructionOverlay(true);
    toggleAiGenerator(); 
    
    let contextData = topic;
    if (aiGenImgBase64) {
        try {
            const textFromImage = await recognizeImageText(aiGenImgBase64);
            contextData += "\nContent from image: " + textFromImage;
        } catch(e) {
            toggleConstructionOverlay(false);
            return saAlert("فشل في قراءة الصورة", "error");
        }
    }
    
    const prompt = `Create a strict JSON array of ${total} questions based on: "${contextData}". 
    Language: Arabic. 
    Requirements: Exactly ${mcqCount} MCQ questions and ${essayCount} Essay questions.
    Structure: [{"type":"mcq", "text":"Question?", "options":["A","B"], "correct":"A", "points":1}, {"type":"essay", "text":"Question?", "correct":"Model Answer for Teacher", "points":1}].
    Return ONLY raw JSON.`;
    
    try {
        let jsonStr = await callPollinationsAI(prompt);
        jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
        
        const firstBracket = jsonStr.indexOf('[');
        const lastBracket = jsonStr.lastIndexOf(']');
        if(firstBracket !== -1 && lastBracket !== -1) {
            jsonStr = jsonStr.substring(firstBracket, lastBracket + 1);
        }

        const questions = JSON.parse(jsonStr);
        
        if (Array.isArray(questions)) {
            questions.forEach(q => {
                if(!q.type) q.type = (q.options && q.options.length > 1) ? 'mcq' : 'essay';
            });

            currentQuestions = [...currentQuestions, ...questions];
            renderAddedQuestions();
            
            toggleConstructionOverlay(false);
            saAlert(`تم بناء ${questions.length} سؤال بنجاح!`, "success");
            switchTab('t-create'); 
        } else {
            throw new Error("Invalid format");
        }
    } catch (e) { 
        console.error(e);
        toggleConstructionOverlay(false);
        saAlert("فشل البناء. حاول مرة أخرى.", "error"); 
    }
};

window.openStudentAnalytics = async () => {
    playSound('click');
    switchTab('s-analytics');
    const content = document.getElementById('student-analytics-content');
    content.innerHTML = '<div style="text-align:center;padding:40px;"><div class="analytics-loading-spin"></div><p style="color:#888;margin-top:15px;">جاري تحليل مستواك...</p></div>';

    const testSnap = await get(ref(db, 'tests'));
    const allTests = testSnap.val() || {};
    let totalScore = 0, totalPossible = 0, examCount = 0;
    let grades = {}, subjectStats = {}, weeklyData = {};

    for (const [testId, testData] of Object.entries(allTests)) {
        const resSnap = await get(ref(db, `results/${testId}/${currentUser}`));
        if (resSnap.exists()) {
            const res = resSnap.val();
            examCount++;
            totalScore += res.score;
            totalPossible += res.total;
            if (testData.grade) grades[testData.grade] = (grades[testData.grade] || 0) + 1;

            let subject = testData.subject || "عام";
            if (!testData.subject && testData.title) {
                if (testData.title.includes("فيزياء")) subject = "فيزياء";
                else if (testData.title.includes("كيمياء")) subject = "كيمياء";
                else if (testData.title.includes("أحياء")) subject = "أحياء";
                else if (testData.title.includes("رياضيات")) subject = "رياضيات";
                else if (testData.title.includes("عربي")) subject = "لغة عربية";
                else if (testData.title.includes("نجليزي") || testData.title.includes("انجليزي")) subject = "إنجليزية";
            }
            if (!subjectStats[subject]) subjectStats[subject] = { score: 0, total: 0, count: 0 };
            subjectStats[subject].score += res.score;
            subjectStats[subject].total += res.total;
            subjectStats[subject].count++;

            const weekKey = new Date(res.timestamp).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
            if (!weeklyData[weekKey]) weeklyData[weekKey] = { score: 0, total: 0 };
            weeklyData[weekKey].score += res.score;
            weeklyData[weekKey].total += res.total;
        }
    }

    if (examCount === 0) {
        content.innerHTML = '<div style="text-align:center;padding:40px;color:#888;"><div style="font-size:3rem;margin-bottom:15px;">📊</div><p>لم تقم بأي اختبارات بعد</p></div>';
        return;
    }

    const overallPct = Math.round((totalScore / totalPossible) * 100);
    let levelLabel = "مبتدئ", levelColor = "#aaa";
    if (overallPct >= 90) { levelLabel = "عبقري"; levelColor = "var(--accent-gold)"; }
    else if (overallPct >= 75) { levelLabel = "ممتاز"; levelColor = "var(--success)"; }
    else if (overallPct >= 60) { levelLabel = "جيد جداً"; levelColor = "var(--accent-primary)"; }
    else if (overallPct >= 50) { levelLabel = "جيد"; levelColor = "var(--warning)"; }
    else { levelLabel = "يحتاج تحسين"; levelColor = "var(--danger)"; }

    const xpData = getXPData();
    const xpLevel = getCurrentLevel(xpData.totalXP);

    const subjectEntries = Object.entries(subjectStats);
    const worstSubject = subjectEntries.reduce((w, [s, d]) => {
        const p = d.total > 0 ? d.score / d.total : 1;
        return p < (w.pct ?? 1) ? { name: s, pct: p } : w;
    }, { name: '-', pct: 1 });

    const weeklyEntries = Object.entries(weeklyData).slice(-7);
    const maxWeekly = Math.max(...weeklyEntries.map(([, d]) => d.total > 0 ? Math.round(d.score / d.total * 100) : 0), 1);

    const subjectBars = subjectEntries.map(([subj, data]) => {
        const pct = Math.round((data.score / data.total) * 100);
        const col = pct >= 75 ? 'var(--success)' : pct >= 50 ? 'var(--accent-gold)' : 'var(--danger)';
        return `<div class="ana-subject-row">
            <div class="ana-subject-label">${subj}</div>
            <div class="ana-bar-wrap"><div class="ana-bar-fill" style="width:${pct}%;background:${col};"></div></div>
            <div class="ana-subject-pct" style="color:${col};">${pct}%</div>
        </div>`;
    }).join('');

    const weeklyBars = weeklyEntries.map(([dateKey, data]) => {
        const pct = data.total > 0 ? Math.round(data.score / data.total * 100) : 0;
        const h = Math.round((pct / maxWeekly) * 100);
        const col = pct >= 75 ? 'var(--success)' : pct >= 50 ? 'var(--accent-gold)' : 'var(--danger)';
        return `<div class="ana-chart-bar-wrap">
            <div class="ana-chart-bar-pct">${pct}%</div>
            <div class="ana-chart-bar" style="height:${Math.max(h, 5)}%;background:${col};"></div>
            <div class="ana-chart-label">${dateKey}</div>
        </div>`;
    }).join('');

    const donutOffset = 100 - overallPct;

    content.innerHTML = `
        <div class="ana-hero">
            <div class="ana-donut-wrap">
                <svg viewBox="0 0 36 36" class="ana-donut-svg">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1a1a1a" stroke-width="3.8"/>
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="${levelColor}" stroke-width="3.8"
                        stroke-dasharray="${overallPct} ${100-overallPct}" stroke-dashoffset="25"
                        stroke-linecap="round" class="ana-donut-ring"/>
                </svg>
                <div class="ana-donut-center">
                    <div class="ana-donut-pct" style="color:${levelColor};">${overallPct}%</div>
                    <div class="ana-donut-lbl">${levelLabel}</div>
                </div>
            </div>
            <div class="ana-hero-stats">
                <div class="ana-stat-chip"><span class="ana-stat-val">${examCount}</span><span class="ana-stat-name">اختبار</span></div>
                <div class="ana-stat-chip"><span class="ana-stat-val" style="color:var(--accent-gold);">⚡${xpData.totalXP}</span><span class="ana-stat-name">XP</span></div>
                <div class="ana-stat-chip"><span class="ana-stat-val" style="color:#f97316;">🔥${xpData.streak}</span><span class="ana-stat-name">أيام</span></div>
                <div class="ana-stat-chip"><span class="ana-stat-val">${xpLevel.icon}</span><span class="ana-stat-name">${xpLevel.name}</span></div>
            </div>
        </div>

        <div class="ana-section-title"><i class="ph-bold ph-chart-bar"></i> أداء المواد</div>
        <div class="ana-subjects">${subjectBars}</div>

        <div class="ana-section-title"><i class="ph-bold ph-trend-up"></i> التقدم الأسبوعي</div>
        <div class="ana-chart-area">${weeklyBars}</div>

        <div class="ana-insights">
            <div class="ana-insight-card warn">
                <i class="ph-bold ph-warning-circle"></i>
                <div>
                    <div style="font-weight:700;margin-bottom:3px;">أضعف مادة</div>
                    <div style="color:#aaa;font-size:0.85rem;">${worstSubject.name !== '-' ? worstSubject.name + ' · ' + Math.round(worstSubject.pct*100) + '%' : 'لا بيانات'}</div>
                </div>
            </div>
            <div class="ana-insight-card ok">
                <i class="ph-bold ph-medal"></i>
                <div>
                    <div style="font-weight:700;margin-bottom:3px;">الشارات</div>
                    <div style="color:#aaa;font-size:0.85rem;">${xpData.earnedBadges.length} شارة مكتسبة</div>
                </div>
            </div>
        </div>
        <div style="text-align:center;font-size:0.75rem;color:#555;margin-top:15px;">بناءً على ${examCount} اختبار</div>
    `;
};

const XP_LEVELS = [
    { name: 'مبتدئ', minXP: 0, maxXP: 200, cssClass: 'level-1', icon: '🌱', unlocks: 'اختبارات سهلة' },
    { name: 'متوسط', minXP: 200, maxXP: 600, cssClass: 'level-2', icon: '📘', unlocks: 'تحديات أصعب' },
    { name: 'متقدم', minXP: 600, maxXP: 1200, cssClass: 'level-3', icon: '⚡', unlocks: 'وضع تحدي الوقت' },
    { name: 'خبير', minXP: 1200, maxXP: Infinity, cssClass: 'level-4', icon: '👑', unlocks: 'لوحة الشرف الذهبية' }
];

const BADGES_DEF = [
    { id: 'first_exam', label: '🥇 أول اختبار', condition: (s) => s.totalExams >= 1 },
    { id: 'streak5', label: '🔥 5 أيام متتالية', condition: (s) => s.streak >= 5 },
    { id: 'correct100', label: '🎯 100 إجابة صحيحة', condition: (s) => s.correctAnswers >= 100 },
    { id: 'speed_demon', label: '⚡ منهي سريع', condition: (s) => s.fastFinishes >= 1 },
    { id: 'perfect', label: '💯 إجابة مثالية', condition: (s) => s.perfectExams >= 1 },
    { id: 'streak3', label: '🔥 3 أيام متتالية', condition: (s) => s.streak >= 3 },
];

const DAILY_XP_GOAL = 50;
const REWARD_BOX_THRESHOLD = 200;

function getXPData() {
    const key = `xp_data_${currentUser}`;
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
    return {
        totalXP: 0,
        dailyXP: 0,
        dailyDate: '',
        streak: 0,
        lastPlayDate: '',
        totalExams: 0,
        correctAnswers: 0,
        fastFinishes: 0,
        perfectExams: 0,
        earnedBadges: [],
        lifetimeXP: 0,
        rewardBoxCount: 0,
        lastRewardAt: 0,
    };
}

function saveXPData(data) {
    localStorage.setItem(`xp_data_${currentUser}`, JSON.stringify(data));
}

function getCurrentLevel(xp) {
    for (let i = XP_LEVELS.length - 1; i >= 0; i--) {
        if (xp >= XP_LEVELS[i].minXP) return XP_LEVELS[i];
    }
    return XP_LEVELS[0];
}

function updateStreakOnLogin() {
    const data = getXPData();
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (data.lastPlayDate === today) return data;
    if (data.lastPlayDate === yesterday) {
        data.streak += 1;
    } else if (data.lastPlayDate !== '') {
        data.streak = 1;
    } else {
        data.streak = 1;
    }
    data.lastPlayDate = today;
    if (today !== data.dailyDate) {
        data.dailyXP = 0;
        data.dailyDate = today;
    }
    saveXPData(data);
    return data;
}

function showXPGainToast(amount, reason) {
    const el = document.createElement('div');
    el.className = 'xp-gain-toast';
    el.innerHTML = `+${amount} XP ${reason}`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2100);
}

function checkAndAwardBadges(data) {
    let newBadge = false;
    BADGES_DEF.forEach(b => {
        if (!data.earnedBadges.includes(b.id) && b.condition(data)) {
            data.earnedBadges.push(b.id);
            newBadge = true;
            showToast('شارة جديدة! ' + b.label, '', 'success', 4000);
        }
    });
    return newBadge;
}

function checkRewardBox(data) {
    const boxes = Math.floor(data.lifetimeXP / REWARD_BOX_THRESHOLD);
    if (boxes > data.rewardBoxCount) {
        data.rewardBoxCount = boxes;
        const rewards = [
            { title: '🎉 +30 XP مجاني!', msg: 'حظ سعيد! حصلت على مكافأة XP.', xp: 30 },
            { title: '🏅 لقب خاص: نجم ساطع', msg: 'أنت تستحق هذا اللقب!', xp: 0 },
            { title: '⚡ +50 XP بونص!', msg: 'استمر في التقدم!', xp: 50 },
        ];
        const r = rewards[Math.floor(Math.random() * rewards.length)];
        if (r.xp > 0) { data.totalXP += r.xp; data.lifetimeXP += r.xp; data.dailyXP += r.xp; }
        document.getElementById('xp-reward-title').innerText = r.title;
        document.getElementById('xp-reward-msg').innerText = r.msg;
        document.getElementById('xp-reward-modal').classList.remove('hidden');
        document.getElementById('xp-reward-icon').style.animation = 'none';
        setTimeout(() => { document.getElementById('xp-reward-icon').style.animation = 'rewardPop 0.5s ease'; }, 50);
    }
    return data;
}

function awardXP(baseXP, reason, opts = {}) {
    if (selectedRole !== 'student') return;
    let data = getXPData();
    const today = new Date().toDateString();
    if (today !== data.dailyDate) { data.dailyXP = 0; data.dailyDate = today; }

    let bonus = 0;
    let bonusMsg = '';
    if (opts.allCorrect) { bonus += Math.round(baseXP * 0.5); bonusMsg += ' 🎯بونص مثالي'; }
    if (opts.fast) { bonus += Math.round(baseXP * 0.3); bonusMsg += ' ⚡بونص سرعة'; }

    let multiplier = 1;
    if (data.streak >= 3) { multiplier = 1.5; bonusMsg += ' 🔥×1.5'; }

    const earned = Math.round((baseXP + bonus) * multiplier);
    data.totalXP += earned;
    data.lifetimeXP += earned;
    data.dailyXP += earned;
    if (opts.examCompleted) data.totalExams += 1;
    if (opts.correctCount) data.correctAnswers += opts.correctCount;
    if (opts.fast) data.fastFinishes += 1;
    if (opts.allCorrect) data.perfectExams += 1;

    checkAndAwardBadges(data);
    data = checkRewardBox(data);
    saveXPData(data);

    showXPGainToast(earned, reason + bonusMsg);
    renderXPHud();
}

function renderXPHud() {
    if (selectedRole !== 'student') return;
    const data = getXPData();
    const level = getCurrentLevel(data.totalXP);
    const el = document.getElementById('xp-level-badge');
    if (el) {
        el.className = 'xp-level-badge ' + level.cssClass;
        document.getElementById('xp-level-name').innerText = level.icon + ' ' + level.name;
    }
    const sc = document.getElementById('xp-streak-count');
    if (sc) sc.innerText = data.streak;
    const tc = document.getElementById('xp-total-count');
    if (tc) tc.innerText = data.totalXP;
    const pct = Math.min(100, Math.round((data.dailyXP / DAILY_XP_GOAL) * 100));
    const fill = document.getElementById('xp-daily-fill');
    if (fill) fill.style.width = pct + '%';
    const lbl = document.getElementById('xp-daily-label');
    if (lbl) lbl.innerText = `${data.dailyXP} / ${DAILY_XP_GOAL} XP`;

    const badgesRow = document.getElementById('xp-badges-row');
    if (badgesRow) {
        badgesRow.innerHTML = '';
        data.earnedBadges.forEach(bid => {
            const def = BADGES_DEF.find(b => b.id === bid);
            if (def) {
                const chip = document.createElement('div');
                chip.className = 'xp-badge-chip';
                chip.innerText = def.label;
                badgesRow.appendChild(chip);
            }
        });
    }
}

window.openLeaderboard = async () => {
    document.getElementById('leaderboard-modal').classList.remove('hidden');
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '<div style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';

    const myData = getXPData();
    await update(ref(db, `xp_scores/${currentUser}`), { xp: myData.totalXP, name: currentUser });

    const snap = await get(ref(db, 'xp_scores'));
    list.innerHTML = '';
    if (!snap.exists()) { list.innerHTML = '<p style="color:#666; text-align:center;">لا يوجد بيانات بعد</p>'; return; }

    const entries = [];
    snap.forEach(child => { entries.push({ name: child.val().name || child.key, xp: child.val().xp || 0 }); });
    entries.sort((a, b) => b.xp - a.xp);

    const medals = ['🥇', '🥈', '🥉'];
    entries.slice(0, 10).forEach((entry, i) => {
        const div = document.createElement('div');
        div.className = 'leaderboard-item' + (i < 3 ? ` top-${i+1}` : '');
        const isMe = entry.name === currentUser;
        div.innerHTML = `
            <div class="leaderboard-rank">${medals[i] || (i+1)}</div>
            <div class="leaderboard-name">${entry.name}${isMe ? ' <span style="color:var(--accent-primary); font-size:0.75rem;">(أنت)</span>' : ''}</div>
            <div class="leaderboard-xp"><i class="fas fa-bolt"></i> ${entry.xp} XP</div>
        `;
        list.appendChild(div);
    });
    if (entries.length === 0) list.innerHTML = '<p style="color:#666; text-align:center;">لا يوجد بيانات كافية بعد</p>';
};

const _origSubmitExam = window.submitExam;
window.submitExam = async function() {
    const startTime = window._examStartTime || Date.now();
    const durationMs = (activeTest ? activeTest.duration * 60 * 1000 : 999999999);
    const elapsed = Date.now() - startTime;
    const fast = elapsed < durationMs * 0.5;

    let score = 0, total = 0;
    const questions = activeTest ? activeTest.questions || [] : [];
    questions.forEach((q, i) => {
        const pts = parseInt(q.points) || 1;
        total += pts;
        if (q.type === 'essay') { if (answers[i] && answers[i].trim().length > 2) score += pts; }
        else { if (answers[i] === q.correct) score += pts; }
    });
    const allCorrect = total > 0 && score === total;
    const correctCount = questions.filter((q, i) => {
        if (q.type === 'essay') return answers[i] && answers[i].trim().length > 2;
        return answers[i] === q.correct;
    }).length;
    const baseXP = Math.max(10, Math.round((score / Math.max(total, 1)) * 50));

    await _origSubmitExam.call(this);

    const xpData = getXPData();
    const streakMultiplier = xpData.streak >= 3 ? 1.5 : 1;
    awardXP(baseXP, '🎓 إتمام اختبار', {
        allCorrect,
        fast,
        examCompleted: true,
        correctCount,
    });
    renderXPHud();
};

const _origStartTest = window.startTest;
window.startTest = async function(id) {
    window._examStartTime = Date.now();
    await _origStartTest.call(this, id);
};

const savedUser = localStorage.getItem('sa_user'); const savedRole = localStorage.getItem('sa_role'); const savedIcon = localStorage.getItem('sa_icon'); const savedUid = localStorage.getItem('sa_uid');
if (savedUser && savedRole) {
    currentUser = savedUser; selectedRole = savedRole; 
    myUid = (savedUid && savedUid !== 'null' && savedUid !== 'undefined') ? savedUid : null;
    document.getElementById('landing-layer').classList.add('hidden');
    loginSuccess(currentUser, savedIcon, myUid);
} else { document.getElementById('landing-layer').classList.remove('hidden'); }

let deferredPrompt;
const pwaBanner = document.getElementById('pwa-install-banner');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    setTimeout(() => {
        pwaBanner.classList.add('visible');
    }, 2000); 
});

window.installPWA = async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            deferredPrompt = null;
        }
        closePWA();
    }
};

window.closePWA = () => {
    pwaBanner.classList.remove('visible');
};

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js');
    });
}

// =================== SMART EDITOR ===================
let _editorActivePrefix = null;

window.editorFormat = (cmd) => { document.execCommand(cmd, false, null); };
window.editorFontSize = (size) => { document.execCommand('fontSize', false, size); };
window.editorColor = (color) => { document.execCommand('foreColor', false, color); };

window.editorInsertImage = () => {
    const prefix = selectedRole === 'teacher' ? 't' : 's';
    _editorActivePrefix = prefix;
    document.getElementById(`${prefix}-editor-img-input`).click();
};

window.editorHandleImage = async (input) => {
    if (!input.files || !input.files[0]) return;
    const prefix = _editorActivePrefix || (selectedRole === 'teacher' ? 't' : 's');
    const pagesEl = document.getElementById(`${prefix}-editor-pages`);
    const activePage = pagesEl.querySelector('.editor-page:focus') || pagesEl.querySelector('.editor-page:last-child');
    const b64 = await getBase64(input.files[0]);
    const img = document.createElement('img');
    img.src = b64;
    img.style.cssText = 'max-width:100%; border-radius:8px; margin:10px 0; cursor:pointer; resize:both; display:block;';
    img.onclick = () => { const cur = img.style.width === '100%' ? '60%' : '100%'; img.style.width = cur; };
    if (activePage) { activePage.focus(); activePage.appendChild(img); } else { pagesEl.lastElementChild.appendChild(img); }
    input.value = '';
};

window.editorAddPage = () => {
    const prefix = selectedRole === 'teacher' ? 't' : 's';
    const pagesEl = document.getElementById(`${prefix}-editor-pages`);
    const newPage = document.createElement('div');
    const pageNum = pagesEl.children.length + 1;
    newPage.className = 'editor-page';
    newPage.contentEditable = 'true';
    newPage.dir = 'rtl';
    newPage.dataset.page = pageNum;
    pagesEl.appendChild(newPage);
    newPage.focus();
    showToast(`صفحة ${pageNum}`, 'تمت الإضافة', 'success', 1500);
};

window.editorSave = () => {
    const prefix = selectedRole === 'teacher' ? 't' : 's';
    const pagesEl = document.getElementById(`${prefix}-editor-pages`);
    const content = Array.from(pagesEl.children).map(p => p.innerHTML);
    localStorage.setItem(`sa_editor_${currentUser}`, JSON.stringify(content));
    showToast('تم الحفظ', '', 'success', 1500);
};

window.editorExportPDF = () => {
    const prefix = selectedRole === 'teacher' ? 't' : 's';
    const pagesEl = document.getElementById(`${prefix}-editor-pages`);
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><style>body{font-family:Cairo,sans-serif;background:#fff;color:#000;padding:40px;} img{max-width:100%;} .page{page-break-after:always;margin-bottom:40px;min-height:297mm;}</style></head><body>`);
    Array.from(pagesEl.children).forEach(p => { win.document.write(`<div class="page">${p.innerHTML}</div>`); });
    win.document.write('</body></html>');
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
};

function loadEditorContent(prefix) {
    const saved = localStorage.getItem(`sa_editor_${currentUser}`);
    if (!saved) return;
    try {
        const content = JSON.parse(saved);
        const pagesEl = document.getElementById(`${prefix}-editor-pages`);
        pagesEl.innerHTML = '';
        content.forEach((html, i) => {
            const page = document.createElement('div');
            page.className = 'editor-page';
            page.contentEditable = 'true';
            page.dir = 'rtl';
            page.dataset.page = i + 1;
            page.innerHTML = html;
            pagesEl.appendChild(page);
        });
    } catch(e) {}
}

// Load editor when switching to editor tab
const _origSwitchTab = window.switchTab;
window.switchTab = function(tabId, btn) {
    _origSwitchTab.call(this, tabId, btn);
    if (tabId.endsWith('-editor')) {
        const prefix = tabId.charAt(0);
        setTimeout(() => loadEditorContent(prefix), 100);
    }
};

// =================== PROFILE DEEPLINK PREVIEW ===================
const _origHandleDeepLinks = window.handleDeepLinks;
window.handleDeepLinks = async function() {
    const params = new URLSearchParams(window.location.search);
    const chatUid = params.get('chat');
    
    if (chatUid && chatUid !== myUid && currentUser) {
        let foundUser = null, foundRole = '';
        try {
            const sSnap = await get(ref(db, 'users/students'));
            if (sSnap?.exists()) { Object.entries(sSnap.val()).forEach(([n, d]) => { if (d?.uid === chatUid) { foundUser = {name:n,...d}; foundRole='student'; } }); }
            if (!foundUser) {
                const tSnap = await get(ref(db, 'users/teachers'));
                if (tSnap?.exists()) { Object.entries(tSnap.val()).forEach(([n, d]) => { if (d?.uid === chatUid) { foundUser = {name:n,...d}; foundRole='teacher'; } }); }
            }
        } catch(e) {}

        if (foundUser) {
            const modal = document.getElementById('profile-deeplink-modal');
            const color = foundRole === 'teacher' ? 'var(--accent-gold)' : 'var(--accent-primary)';
            const avatar = document.getElementById('pdl-avatar');
            avatar.innerHTML = `<i class="fas ${foundUser.icon || 'fa-user'}"></i>`;
            avatar.style.color = color; avatar.style.borderColor = color;
            document.getElementById('pdl-name').innerText = foundUser.name;
            document.getElementById('pdl-role').innerText = foundRole === 'teacher' ? 'معلم' : 'طالب';
            document.getElementById('pdl-chat-btn').onclick = () => {
                modal.classList.add('hidden');
                const prefix = selectedRole === 'teacher' ? 't' : 's';
                switchTab(`${prefix}-dardasha`);
                setTimeout(() => startChatWithUser(foundUser.name, foundUser.icon, foundUser.uid), 400);
            };
            modal.classList.remove('hidden');
            hideDeepLinkLoader();
            return;
        }
    }
    
    if (_origHandleDeepLinks) return _origHandleDeepLinks.call(this);
};
