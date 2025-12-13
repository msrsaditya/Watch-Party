import { Utils } from '../utils/helpers.js';
import { State } from '../core/state.js';
export const DOM = {
  authScreen: document.getElementById('auth-screen'),
  lobby: document.getElementById('lobby'),
  verifyModal: document.getElementById('verify-modal'),
  loginForm: document.getElementById('form-login'),
  signupForm: document.getElementById('form-signup'),
  loginEmail: document.getElementById('login-email'),
  loginPass: document.getElementById('login-password'),
  signupName: document.getElementById('signup-name'),
  signupEmail: document.getElementById('signup-email'),
  signupPass: document.getElementById('signup-pass'),
  signupConfirm: document.getElementById('signup-confirm'),
  room: document.getElementById('room'),
  modal: document.getElementById('modal'),
  modalTitle: document.getElementById('modal-title'),
  modalText: document.getElementById('modal-text'),
  modalCancel: document.getElementById('modal-cancel'),
  modalConfirm: document.getElementById('modal-confirm'),
  toast: document.getElementById('toast'),
  roomCode: document.getElementById('input-room'),
  btnEnter: document.getElementById('btn-enter'),
  btnText: document.getElementById('btn-enter-text'),
  spinner: document.getElementById('spinner'),
  fileVideo: document.getElementById('file-video'),
  fileSub: document.getElementById('file-sub'),
  video: document.getElementById('video'),
  wrapper: document.getElementById('video-wrapper'),
  placeholder: document.getElementById('placeholder'),
  btnUpload: document.getElementById('btn-upload'),
  controls: document.getElementById('controls'),
  progressContainer: document.getElementById('progress-container'),
  progressFill: document.getElementById('progress-fill'),
  progressHandle: document.getElementById('progress-handle'),
  timeCur: document.getElementById('time-cur'),
  timeDur: document.getElementById('time-dur'),
  menuSub: document.getElementById('menu-sub'),
  trackList: document.getElementById('track-list'),
  btnUnlock: document.getElementById('btn-unlock'),
  iconLock: document.getElementById('icon-lock'),
  gestureFeedback: document.getElementById('gesture-feedback'),
  gestureText: document.getElementById('gesture-text'),
  sidebar: document.getElementById('sidebar'),
  chatList: document.getElementById('chat-list'),
  chatInput: document.getElementById('chat-input'),
  quickChat: document.getElementById('quick-chat'),
  quickChatInput: document.getElementById('quick-chat-input'),
  videoChatOverlay: document.getElementById('chat-overlay'),
  memberList: document.getElementById('member-list'),
  memberCount: document.getElementById('member-count'),
  headerRoomId: document.getElementById('header-room-id'),
  headerRoomName: document.getElementById('header-room-name'),
  btnCopy: document.getElementById('btn-copy'),
  btnLeave: document.getElementById('btn-leave'),
  btnVerifyCheck: document.getElementById('btn-verify-check'),
  typingIndicator: document.getElementById('typing-indicator'),
  videoTypingIndicator: document.getElementById('video-typing-indicator'),
  btnHeaderSidebarToggle: document.getElementById('btn-header-sidebar-toggle'),
  iconMenu: document.getElementById('icon-menu'),
  waitingScreen: document.getElementById('waiting-screen'),
};
export const UI = {
  render(prop, val) {
    if (!prop) return;
    switch (prop) {
      case 'user':
        if (val) {
          DOM.btnEnter.disabled = false;
          DOM.btnEnter.classList.remove('opacity-50', 'cursor-not-allowed');
          const activeHost = document.querySelector(
            'button[data-tab="host"][data-active="true"]'
          );
          DOM.btnText.innerText = activeHost ? 'Create Room' : 'Enter Room';
          DOM.spinner.classList.add('hidden');
        }
        break;
      case 'local':
        if (DOM.video) {
          DOM.video.style.filter = `brightness(${val.brightness})`;
          DOM.video.volume = val.volume;

          if (val.aspect === 'Fill') {
            DOM.video.style.objectFit = 'cover';
            DOM.video.style.aspectRatio = 'auto';
            DOM.video.style.width = '100%';
            DOM.video.style.height = '100%';
          } else if (val.aspect === 'Original') {
            DOM.video.style.objectFit = 'contain';
            DOM.video.style.aspectRatio = 'auto';
            DOM.video.style.width = '100%';
            DOM.video.style.height = '100%';
          } else {
            DOM.video.style.objectFit = 'contain';
            DOM.video.style.width = '100%';
            DOM.video.style.height = 'auto';
            if (val.aspect === '16:9') DOM.video.style.aspectRatio = '16/9';
            else if (val.aspect === '16:10')
              DOM.video.style.aspectRatio = '16/10';
            else if (val.aspect === '4:3') DOM.video.style.aspectRatio = '4/3';
            else if (val.aspect === '2.35:1')
              DOM.video.style.aspectRatio = '2.35/1';
          }
        }
        document
          .querySelectorAll('.active-check')
          .forEach((el) => el.classList.add('hidden'));
        if (val.aspect) {
          const a = document.querySelector(
            `.active-check[data-val="${val.aspect}"]`
          );
          if (a) a.classList.remove('hidden');
        }
        if (val.orientation) {
          const o = document.querySelector(
            `.active-check[data-val="${val.orientation}"]`
          );
          if (o) o.classList.remove('hidden');
          const wrapper = document.getElementById('room');
          wrapper.classList.remove('rotate-landscape', 'rotate-portrait');
          if (val.orientation === 'landscape') {
            if (
              window.innerHeight > window.innerWidth &&
              (!screen.orientation || !screen.orientation.lock)
            ) {
              wrapper.classList.add('rotate-landscape');
            }
          } else if (val.orientation === 'portrait') {
            if (
              window.innerWidth > window.innerHeight &&
              (!screen.orientation || !screen.orientation.lock)
            ) {
              wrapper.classList.add('rotate-portrait');
            }
          }
        }
        if (val.subtitleSize) {
          let style = document.getElementById('sub-style');
          if (!style) {
            style = document.createElement('style');
            style.id = 'sub-style';
            document.head.appendChild(style);
          }
          style.innerHTML = `video::cue { font-size: ${val.subtitleSize}% !important; }`;
          const disp = document.getElementById('disp-sub-size');
          if (disp) disp.innerText = val.subtitleSize + '%';
        }
        if (val.locked) {
          DOM.iconLock.className = 'fas fa-lock text-white text-lg';
          DOM.controls.classList.add('ui-instant-hide');
          DOM.quickChat.classList.add('ui-instant-hide');
        } else {
          DOM.iconLock.className = 'fas fa-lock-open text-white text-lg';
          DOM.controls.classList.remove('ui-instant-hide');
          DOM.quickChat.classList.remove('ui-instant-hide');
        }
        const isDesktop = window.innerWidth > 768;
        if (isDesktop) {
          if (val.sidebarOpen) {
            DOM.sidebar.classList.remove('translate-x-full', 'hidden');
            DOM.sidebar.classList.add('translate-x-0', 'flex');
          } else {
            DOM.sidebar.classList.add('hidden');
            DOM.sidebar.classList.remove('flex');
          }
        } else {
          DOM.sidebar.classList.remove('hidden');
          DOM.sidebar.classList.add('flex');
          if (val.sidebarOpen) {
            DOM.sidebar.classList.remove('translate-x-full');
            DOM.sidebar.classList.add('translate-x-0');
          } else {
            DOM.sidebar.classList.remove('translate-x-0');
            DOM.sidebar.classList.add('translate-x-full');
          }
        }
        if (val.sidebarOpen) {
          if (DOM.iconMenu) DOM.iconMenu.classList.remove('fa-bars');
          if (DOM.iconMenu) DOM.iconMenu.classList.add('fa-times');
        } else {
          if (DOM.iconMenu) DOM.iconMenu.classList.remove('fa-times');
          if (DOM.iconMenu) DOM.iconMenu.classList.add('fa-bars');
        }
        if (val.subtitles) {
          DOM.trackList.innerHTML = '';
          val.subtitles.forEach((sub) => {
            const div = document.createElement('div');
            div.className =
              'px-3 py-2 text-xs hover:bg-element rounded cursor-pointer mb-1 flex justify-between items-center';
            const isShowing = sub.track.mode === 'showing';
            div.innerHTML = `<span>${Utils.esc(sub.label)}</span>${isShowing ? '<span class="text-accent-blue"><i class="fas fa-check"></i></span>' : ''}`;
            div.onclick = () => {
              Array.from(DOM.video.textTracks).forEach(
                (t) => (t.mode = 'disabled')
              );
              sub.track.mode = 'showing';
              State.local = {
                ...State.local,
              };
              Utils.toast(`Subtitle: ${sub.label}`);
            };
            DOM.trackList.appendChild(div);
          });
        }
        break;
    }
  },
  updateProgress(curr, total) {
    if (!total || !DOM.progressFill) return;
    const pct = (curr / total) * 100;
    DOM.progressFill.style.width = `${pct}%`;
    if (DOM.progressHandle) DOM.progressHandle.style.left = `${pct}%`;
    if (DOM.timeCur) DOM.timeCur.innerText = Utils.formatTime(curr);
    if (DOM.timeDur)
      DOM.timeDur.innerText = State.local.showRemaining
        ? Utils.formatTime(curr - total)
        : Utils.formatTime(total);
  },
  animateTap(iconId) {
    const el = document.getElementById(iconId);
    if (el) {
      if (iconId === 'icon-play-pause') {
        el.className = DOM.video.paused
          ? 'fas fa-pause text-7xl opacity-0 transition-opacity absolute text-white drop-shadow-lg scale-150'
          : 'fas fa-play text-7xl opacity-0 transition-opacity absolute text-white drop-shadow-lg scale-150';
      }
      el.classList.remove('animate-ping-fast');
      void el.offsetWidth;
      el.classList.add('animate-ping-fast');
    }
  },
  addChatBubble(msg) {
    const isFullscreen =
      document.fullscreenElement ||
      document.body.classList.contains('pseudo-fs') ||
      (DOM.wrapper && DOM.wrapper.classList.contains('ios-fullscreen'));
    if (!isFullscreen) return;
    if (msg.uid === State.user.uid) return;
    const bub = document.createElement('div');
    bub.className =
      'bg-element/90 backdrop-blur border border-border px-4 py-2 rounded-2xl text-[14px] animate-float-up break-words text-white shadow-xl mb-2 self-end max-w-[80%] opacity-0 transition-opacity duration-500';
    bub.innerHTML = `<span class="font-bold text-accent-blue mr-1.5">${Utils.esc(msg.sender)}:</span>${Utils.esc(msg.text)}`;
    DOM.videoChatOverlay.appendChild(bub);
    requestAnimationFrame(() => bub.classList.remove('opacity-0'));
    setTimeout(() => {
      bub.classList.add('opacity-0');
      setTimeout(() => bub.remove(), 500);
    }, 2000);
  },
  renderMembers(parts) {
    DOM.memberList.innerHTML = '';
    const activeParts = Object.entries(parts).filter(
      ([, p]) => !p.kicked && p.active
    );
    DOM.memberCount.innerText = activeParts.length;
    activeParts.forEach(([uid, p]) => {
      const div = document.createElement('div');
      div.className =
        'bg-element px-3 py-2 rounded-xl flex justify-between items-center';
      const isHost = uid === State.room.host;
      const isOnline = State.room.presence[uid] === true;
      const warning =
        State.local.hostHash &&
        p.fileHash &&
        p.fileHash !== State.local.hostHash
          ? '<i class="fas fa-exclamation-triangle text-danger-text mr-2" title="File Mismatch"></i>'
          : '';
      div.innerHTML = `
        <div class="flex items-center gap-2 min-w-0">
          <div class="w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'} shrink-0"></div>
          <span class="text-[14px] text-gray-200 font-medium truncate max-w-[120px]">${Utils.esc(p.name)}</span>
        </div>
        <div class="flex items-center gap-2 text-secondary">
          ${warning}
          ${isHost ? '<i class="fas fa-crown text-yellow-500 text-xs"></i>' : ''}
          ${State.user.uid === State.room.host && !isHost ? `<button onclick="Controller.kick('${uid}')" class="text-danger-text hover:opacity-80"><i class="fas fa-times"></i></button>` : ''}
        </div>
      `;
      DOM.memberList.appendChild(div);
    });
  },
  toggleSpinner(show) {
    if (show) {
      DOM.spinner.classList.remove('hidden');
      DOM.btnText.innerText = 'Processing...';
      DOM.btnEnter.disabled = true;
    } else {
      DOM.spinner.classList.add('hidden');
      DOM.btnText.innerText = 'Enter Room';
      DOM.btnEnter.disabled = false;
    }
  },
  showControls() {
    if (State.local.locked) {
      DOM.btnUnlock.classList.remove('ui-hidden', 'ui-instant-hide');
      DOM.controls.classList.add('ui-instant-hide');
      DOM.quickChat.classList.add('ui-instant-hide');
    } else {
      DOM.controls.classList.remove(
        'ui-hidden',
        'translate-y-full',
        'ui-instant-hide'
      );
      DOM.btnUnlock.classList.remove('ui-hidden', 'ui-instant-hide');
      DOM.quickChat.classList.remove('ui-instant-hide');
    }
    if (window.interactionTimer) clearTimeout(window.interactionTimer);
    if (State.local.loaded && !DOM.video.paused && !State.local.isDragging) {
      window.interactionTimer = setTimeout(() => {
        const hasActiveMenu = document.querySelector('.control-menu.active');
        if (hasActiveMenu) return;
        DOM.controls.classList.add(
          'ui-hidden',
          'translate-y-full',
          'ui-instant-hide'
        );
        DOM.btnUnlock.classList.add('ui-hidden', 'ui-instant-hide');
        DOM.quickChat.classList.add(
          'ui-hidden',
          'translate-y-20',
          'ui-instant-hide'
        );
        document
          .querySelectorAll('.control-menu')
          .forEach((m) => m.classList.remove('active'));
      }, 5000);
    }
  },
  toggleMenu(menuId) {
    if (State.local.locked) return;
    document.querySelectorAll('.control-menu').forEach((m) => {
      if (m.id !== menuId && m.id !== 'menu-more') m.classList.remove('active');
    });
    const menu = document.getElementById(menuId);
    if (!menu) return;
    if (menuId === 'menu-more') {
      document.querySelectorAll('.control-menu').forEach((m) => {
        if (m.id !== 'menu-more') m.classList.remove('active');
      });
      menu.classList.toggle('active');
    } else {
      document.getElementById('menu-more').classList.remove('active');
      menu.classList.add('active');
    }
    this.showControls();
  },
};
