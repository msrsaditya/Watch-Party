import { DOM, UI } from './ui.js';
import { State } from '../core/state.js';
import { Utils } from '../utils/helpers.js';
import { RoomService } from '../services/room.js';
export const Player = {
  wakeLock: null,
  callbacks: {
    onPlaybackUpdate: () => {},
    toggleSidebar: () => {},
    toggleMenu: () => {},
  },
  init(callbacks) {
    if (callbacks) this.callbacks = { ...this.callbacks, ...callbacks };
    DOM.video.safePlay = async () => {
      try {
        await DOM.video.play();
      } catch (e) {
        console.warn(e);
      }
    };
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) {
        DOM.controls.classList.add('fs-controls');
        if (
          State.local.orientation &&
          State.local.orientation !== 'auto' &&
          screen.orientation &&
          screen.orientation.lock
        ) {
          screen.orientation
            .lock(State.local.orientation)
            .catch((e) => console.log('Lock fail in FS', e));
        }
      } else {
        DOM.controls.classList.remove('fs-controls');
      }
    });
    DOM.video.addEventListener('play', () => {
      Player.toggleWakeLock(true);
      this.callbacks.onPlaybackUpdate(
        'playing',
        DOM.video.currentTime,
        'Played'
      );
      const playBtnSvg = document.querySelector('[data-action="play"] i');
      if (playBtnSvg) playBtnSvg.className = 'fas fa-pause text-xl';
      UI.animateTap('icon-play-pause');
      UI.showControls();
      Player.loop();
    });
    DOM.video.addEventListener('pause', () => {
      Player.toggleWakeLock(false);
      this.callbacks.onPlaybackUpdate(
        'paused',
        DOM.video.currentTime,
        'Paused'
      );
      const playBtnSvg = document.querySelector('[data-action="play"] i');
      if (playBtnSvg) playBtnSvg.className = 'fas fa-play text-xl';
      UI.animateTap('icon-play-pause');
      UI.showControls();
    });
    DOM.video.addEventListener('seeked', () => {
      UI.updateProgress(DOM.video.currentTime, DOM.video.duration);
      if (State.local.loaded && !State.local.isProcessingRemote) {
        this.callbacks.onPlaybackUpdate(
          DOM.video.paused ? 'paused' : 'playing',
          DOM.video.currentTime,
          'Seeked'
        );
      }
    });
    const handleScrubStart = (e) => {
      if (!State.local.loaded || State.local.locked) return;
      State.local.isDragging = true;
      handleScrubMove(e);
    };
    const handleScrubMove = (e) => {
      if (!State.local.isDragging || !State.local.loaded || State.local.locked)
        return;
      const rect = DOM.progressContainer.getBoundingClientRect();
      const clientX =
        e.type.includes('touch') && e.touches[0]
          ? e.touches[0].clientX
          : e.clientX;
      if (clientX === undefined) return;
      const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      UI.updateProgress(pos * DOM.video.duration, DOM.video.duration);
      DOM.video.currentTime = pos * DOM.video.duration;
    };
    const handleScrubEnd = () => {
      if (State.local.isDragging) {
        State.local.isDragging = false;
        UI.showControls();
      }
    };
    DOM.progressContainer.addEventListener('mousedown', handleScrubStart);
    DOM.progressContainer.addEventListener('touchstart', handleScrubStart, {
      passive: false,
    });
    document.addEventListener('mousemove', handleScrubMove);
    document.addEventListener('touchmove', handleScrubMove, {
      passive: false,
    });
    document.addEventListener('mouseup', handleScrubEnd);
    document.addEventListener('touchend', handleScrubEnd);
    DOM.timeDur.addEventListener('click', () => {
      if (State.local.locked) return;
      State.local.showRemaining = !State.local.showRemaining;
      UI.updateProgress(DOM.video.currentTime, DOM.video.duration);
    });
    Player.loop = () => {
      if (!DOM.video.paused) {
        if (!State.local.isDragging)
          UI.updateProgress(DOM.video.currentTime, DOM.video.duration);
        requestAnimationFrame(Player.loop);
      }
    };
  },
  load(file) {
    if (State.local.currentObjectUrl)
      URL.revokeObjectURL(State.local.currentObjectUrl);
    State.local.currentObjectUrl = URL.createObjectURL(file);
    DOM.video.src = State.local.currentObjectUrl;
    DOM.placeholder.classList.add('hidden');
    State.local.loaded = true;
    State.local.myHash = file.name + file.size;
    if (State.room.id) RoomService.updatePresence(State.local.myHash);
    Utils.toast('Video Loaded');
  },
  async toggleWakeLock(on) {
    if (!('wakeLock' in navigator)) return;
    try {
      if (on && !Player.wakeLock)
        Player.wakeLock = await navigator.wakeLock.request('screen');
      else if (!on && Player.wakeLock) {
        await Player.wakeLock.release();
        Player.wakeLock = null;
      }
    } catch {
      /* ignore */
    }
  },
  actions: {
    play: () => {
      if (!State.local.locked)
        DOM.video.paused ? DOM.video.safePlay() : DOM.video.pause();
    },
    'seek-back': () => {
      if (!State.local.locked) {
        DOM.video.currentTime -= 10;
        UI.animateTap('icon-seek-back');
      }
    },
    'seek-fwd': () => {
      if (!State.local.locked) {
        DOM.video.currentTime += 10;
        UI.animateTap('icon-seek-fwd');
      }
    },
    'toggle-more': (e) => {
      if (!State.local.locked) {
        if (e && e.stopPropagation) e.stopPropagation();
        UI.toggleMenu('menu-more');
      }
    },
    'open-menu-speed': (e) => {
      if (!State.local.locked) {
        if (e && e.stopPropagation) e.stopPropagation();
        UI.toggleMenu('menu-speed');
      }
    },
    'open-menu-aspect': (e) => {
      if (!State.local.locked) {
        if (e && e.stopPropagation) e.stopPropagation();
        UI.toggleMenu('menu-aspect');
      }
    },
    'open-menu-orient': (e) => {
      if (!State.local.locked) {
        if (e && e.stopPropagation) e.stopPropagation();
        UI.toggleMenu('menu-orient');
      }
    },
    'open-menu-sub': (e) => {
      if (!State.local.locked) {
        if (e && e.stopPropagation) e.stopPropagation();
        UI.toggleMenu('menu-sub');
      }
    },
    'back-to-more': (e) => {
      if (!State.local.locked) {
        if (e && e.stopPropagation) e.stopPropagation();
        document
          .querySelectorAll('.control-menu')
          .forEach((m) => m.classList.remove('active'));
        document.getElementById('menu-more').classList.add('active');
        UI.showControls();
      }
    },
    'toggle-sidebar': () => {
      if (!State.local.locked) Player.callbacks.toggleSidebar();
    },
    lock: () => {
      State.local.locked = !State.local.locked;
      State.local = {
        ...State.local,
      };
    },
    fullscreen: async () => {
      if (State.local.locked) return;
      const isIOS =
        /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      if (isIOS) {
        DOM.wrapper.classList.toggle('ios-fullscreen');
        if (DOM.wrapper.classList.contains('ios-fullscreen')) {
          DOM.controls.style.zIndex = '9001';
          document.querySelector('header').style.zIndex = '9001';
        } else {
          DOM.controls.style.zIndex = '';
          document.querySelector('header').style.zIndex = '';
        }
        Utils.toast(
          DOM.wrapper.classList.contains('ios-fullscreen')
            ? 'Fullscreen (iOS)'
            : 'Exit Fullscreen'
        );
      } else {
        try {
          if (!document.fullscreenElement)
            await DOM.wrapper.requestFullscreen();
          else await document.exitFullscreen();
        } catch {
          document.body.classList.toggle('pseudo-fs');
          Utils.toast(
            document.body.classList.contains('pseudo-fs')
              ? 'Fullscreen (Mode)'
              : 'Exit Fullscreen'
          );
        }
      }
    },
    'toggle-chat': () => {
      if (!State.local.locked) Player.callbacks.toggleSidebar();
    },
    'toggle-quick-chat': () => {
      if (State.local.locked) return;
      DOM.quickChat.classList.toggle('ui-hidden');
      DOM.quickChat.classList.toggle('pointer-events-none');
      DOM.quickChat.classList.toggle('translate-y-20');
      if (!DOM.quickChat.classList.contains('ui-hidden')) {
        DOM.quickChatInput.focus();
        if (window.interactionTimer) clearTimeout(window.interactionTimer);
      }
    },
  },
};
