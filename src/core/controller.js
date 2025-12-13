import { DOM, UI } from '../components/ui.js';
import { State } from './state.js';
import { Player } from '../components/player.js';
import { AuthService } from '../services/auth.js';
import { RoomService } from '../services/room.js';
import { Gemini } from '../services/gemini.js';
import { Security } from '../components/security.js';
import { Utils } from '../utils/helpers.js';
let pendingModalOpen = false;
let singleTapTimer;
let typingTimer;
let lastChatTimestamp = Date.now();
export const Controller = {
  init() {
    AuthService.init(this.onAuthChange.bind(this));
    Player.init({
      onPlaybackUpdate: this.onPlaybackUpdate.bind(this),
      toggleSidebar: this.toggleSidebar.bind(this),
      toggleMenu: UI.toggleMenu.bind(UI),
    });
    this.setupDOMEvents();
    this.setupKeyboardHandling();
    this.setupLongPressCopy();
  },
  onAuthChange(user, rawUser) {
    this.currentUser = rawUser;
    State.user = user;
    if (user && user.emailVerified) {
      DOM.authScreen.classList.add('hidden');
      DOM.lobby.classList.remove('hidden');
      DOM.lobby.classList.add('flex');
      Utils.toast(`Welcome ${user.name}`);
      UI.render('user', user);
    } else if (user && !user.emailVerified) {
      DOM.authScreen.classList.remove('hidden');
      DOM.lobby.classList.add('hidden');
      DOM.verifyModal.classList.remove('hidden');
    } else {
      DOM.authScreen.classList.remove('hidden');
      DOM.lobby.classList.add('hidden');
      DOM.verifyModal.classList.add('hidden');
    }
  },
  switchAuthTab(tab) {
    document
      .querySelectorAll('[data-auth-tab]')
      .forEach((b) => (b.dataset.active = b.dataset.authTab === tab));
    if (tab === 'login') {
      DOM.loginForm.classList.remove('hidden');
      DOM.signupForm.classList.add('hidden');
    } else {
      DOM.loginForm.classList.add('hidden');
      DOM.signupForm.classList.remove('hidden');
    }
  },
  async handleLogin() {
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-password').value.trim();
    if (!email || !pass)
      return Utils.toast('Email and Password Required', 'error');
    await AuthService.login(email, pass);
  },
  async handleSignup() {
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const pass = document.getElementById('signup-pass').value.trim();
    const confirm = document.getElementById('signup-confirm').value.trim();
    if (!name || !email || !pass)
      return Utils.toast('All fields required', 'error');
    if (pass.length < 6)
      return Utils.toast('Password is not strong enough', 'error');
    if (pass !== confirm) return Utils.toast('Passwords do not match', 'error');

    await AuthService.signup(email, pass, name);
    DOM.verifyModal.classList.remove('hidden');
  },
  async forgotPassword() {
    const email = document.getElementById('login-email').value.trim();
    if (!email) return Utils.toast('Enter your Email first', 'error');
    await AuthService.resetPassword(email);
  },
  async checkVerification() {
    const user = AuthService.currentUser;
    if (user) {
      await user.reload();
      if (user.emailVerified) {
        DOM.verifyModal.classList.add('hidden');
        this.onAuthChange(
          {
            uid: user.uid,
            name: user.displayName || 'Anon',
            emailVerified: true,
          },
          user
        );
        Utils.toast('Email Verified!');
        return true;
      } else {
        Utils.toast('Not Verified Yet', 'error');
        return false;
      }
    }
    return false;
  },
  logout() {
    AuthService.logout();
  },
  onPlaybackUpdate(status, time, action) {
    if (!State.local.loaded || !State.room.id || State.local.isProcessingRemote)
      return;
    RoomService.sync({
      playback: {
        status,
        time,
        speed: DOM.video.playbackRate,
        trigger: State.local.sessionId,
        timestamp: Date.now(),
        action,
        senderName: State.user.name,
        senderUid: State.user.uid,
      },
    });
  },
  onPresenceUpdate(presenceData) {
    if (State.local.loaded) {
      const oldPresence = State.room.presence || {};
      Object.keys(oldPresence).forEach((uid) => {
        if (oldPresence[uid] === true && presenceData[uid] === false) {
          const name = State.room.participants[uid]?.name || 'Someone';
          if (uid !== State.user.uid) Utils.toast(`${name} Disconnected`);
        }
      });
    }
    State.room.presence = presenceData;
    UI.renderMembers(State.room.participants);
  },
  onRemoteUpdate(data) {
    const myUser = data.participants[State.user.uid];
    if (!myUser) return;
    if (myUser.kicked) {
      alert('You have been kicked from the room.');
      location.reload();
      return;
    }
    if (!myUser.active) {
      DOM.waitingScreen.classList.remove('hidden');
      DOM.waitingScreen.classList.add('flex');
    } else {
      DOM.waitingScreen.classList.add('hidden');
      DOM.waitingScreen.classList.remove('flex');
    }
    if (Security.isHost() && !pendingModalOpen) {
      const pendingUser = Object.entries(data.participants).find(
        ([, p]) => !p.active && !p.kicked
      );
      if (pendingUser) {
        pendingModalOpen = true;
        DOM.modalTitle.innerText = 'Join Request';
        DOM.modalText.innerText = `${pendingUser[1].name} wants to join.`;
        DOM.modalConfirm.innerText = 'Accept';
        DOM.modalCancel.innerText = 'Deny';
        DOM.modalConfirm.onclick = () => {
          RoomService.acceptUser(pendingUser[0]);
          DOM.modal.classList.add('hidden');
          pendingModalOpen = false;
        };
        DOM.modalCancel.onclick = () => {
          RoomService.rejectUser(pendingUser[0]);
          DOM.modal.classList.add('hidden');
          pendingModalOpen = false;
        };
        DOM.modal.classList.remove('hidden');
      }
    }
    State.room.host = data.host;
    State.room.participants = data.participants;
    State.local.hostHash = data.participants[data.host]?.fileHash;
    UI.renderMembers(data.participants);

    if (DOM.headerRoomId) DOM.headerRoomId.innerText = '#' + State.room.id;
    if (data.name && DOM.headerRoomName)
      DOM.headerRoomName.innerText = Utils.toTitleCase(data.name);
  },
  onChatUpdate(msgs) {
    if (msgs.length === 0) {
      DOM.chatList.innerHTML = '';
      lastChatTimestamp = 0;
      State.chatLog = [];
      const welcomeDiv = document.createElement('div');
      welcomeDiv.className =
        'p-3 text-[14px] max-w-[80%] break-words chat-bubble-ai mb-2';
      welcomeDiv.innerHTML = `<div class="font-bold text-[11px] mb-0.5 text-white/80">Friday</div>Hello! I am Friday, your helpful AI assistant. You can talk to me by using the <span class="cmd-pill">/AI</span> command.`;
      DOM.chatList.appendChild(welcomeDiv);
      return;
    }
    const newMsgs = msgs.filter((m) => m.timestamp > lastChatTimestamp);
    if (newMsgs.length > 0) {
      newMsgs.sort((a, b) => a.timestamp - b.timestamp);
      newMsgs.forEach((m) => {
        const isMe = m.uid === State.user.uid;
        const div = document.createElement('div');
        const isAi = m.uid === 'gemini-ai-bot';
        if (isAi)
          div.className =
            'p-3 text-[14px] max-w-[80%] break-words chat-bubble-ai mb-2';
        else
          div.className = isMe
            ? 'p-3 text-[14px] max-w-[80%] break-words chat-bubble-me mb-2'
            : 'p-3 text-[14px] max-w-[80%] break-words chat-bubble-other mb-2';
        let msgText = Utils.esc(m.text);
        if (msgText.toLowerCase().startsWith('/ai '))
          msgText = `<span class="cmd-pill">/AI</span>${msgText.substring(4)}`;
        div.innerHTML = `<div class="font-bold text-[11px] mb-0.5 ${isMe ? 'text-blue-200' : isAi ? 'text-white/80' : 'text-gray-400'}">${Utils.esc(m.sender)}</div>${msgText}`;
        DOM.chatList.appendChild(div);
        if (!isMe) UI.addChatBubble(m);
        lastChatTimestamp = Math.max(lastChatTimestamp, m.timestamp);
      });
      DOM.chatList.scrollTop = DOM.chatList.scrollHeight;
      this.setupLongPressCopy();
    } else if (DOM.chatList.children.length === 0) {
      const welcomeDiv = document.createElement('div');
      welcomeDiv.className =
        'p-3 text-[14px] max-w-[80%] break-words chat-bubble-ai mb-2';
      welcomeDiv.innerHTML = `<div class="font-bold text-[11px] mb-0.5 text-white/80">Friday</div>Hello! I am Friday, your helpful AI assistant. You can talk to me by using the <span class="cmd-pill">/AI</span> command.`;
      DOM.chatList.appendChild(welcomeDiv);
    }
    State.chatLog = msgs;
  },
  onTypingUpdate(typers) {
    const others = typers.filter(
      (t) => t.uid !== State.user.uid && Date.now() - t.timestamp < 3000
    );
    if (others.length > 0) {
      DOM.typingIndicator.classList.remove('hidden');
      DOM.videoTypingIndicator.classList.remove('hidden');
      const names = others.map((t) => t.name).join(', ');
      DOM.typingIndicator.querySelector('span').innerText =
        `${names} is typing...`;
      DOM.videoTypingIndicator.querySelector('span').innerText =
        `${names} is typing...`;
    } else {
      DOM.typingIndicator.classList.add('hidden');
      DOM.videoTypingIndicator.classList.add('hidden');
    }
  },
  onCommandUpdate(cmd, sender) {
    if (!State.local.loaded) return;
    const selfSender = sender === State.user.name;
    if (selfSender) return;
    Utils.toast(`${sender} triggered global ${cmd.action}`);
    this.executeAiCommand(cmd, true);
  },
  handleInput(el, source) {
    el.style.height = 'auto';
    const newHeight = Math.min(el.scrollHeight, 120);
    el.style.height = newHeight + 'px';
    const otherEl = source === 'sidebar' ? DOM.quickChatInput : DOM.chatInput;
    if (otherEl && otherEl.innerText !== el.innerText)
      otherEl.innerText = el.innerText;
    if (typingTimer) clearTimeout(typingTimer);
    RoomService.setTyping(true);
    typingTimer = setTimeout(() => RoomService.setTyping(false), 2000);
    this.handleAutocomplete(el, source);
    if (source === 'quick' && window.visualViewport) {
      const height = window.visualViewport.height;
      const offset = window.innerHeight - height;
      if (offset > 0) {
        const quickChat = document.getElementById('quick-chat');
        quickChat.style.transform = `translateY(-${offset}px)`;
        quickChat.style.bottom = '0px';
      }
    }
  },
  handleAutocomplete(el, source) {
    if (source === 'quick') return;
    const text = el.innerText.trim();
    const menu =
      source === 'sidebar'
        ? document.getElementById('sidebar-autocomplete')
        : document.getElementById('quick-chat-autocomplete');
    if (text.startsWith('/')) {
      const query = text.substring(1).toLowerCase();
      const commands = ['ai', 'clear', 'movie'];
      const matches = commands.filter((c) => c.startsWith(query));
      if (matches.length > 0) {
        menu.innerHTML = '';
        matches.forEach((cmd) => {
          const div = document.createElement('div');
          div.className =
            'px-4 py-2 hover:bg-element cursor-pointer text-sm flex items-center gap-2 border-b border-border/50 last:border-0';
          div.innerHTML = `<span class="cmd-pill">/${cmd.toUpperCase()}</span>`;
          div.onclick = () => {
            this.completeCommand(el, cmd, menu, source);
          };
          menu.appendChild(div);
        });
        menu.classList.remove('hidden');
      } else menu.classList.add('hidden');
    } else menu.classList.add('hidden');
  },
  completeCommand(el, cmd, menu, source) {
    el.innerText = `/${cmd} `;
    this.handleInput(el, source);
    menu.classList.add('hidden');
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    el.focus();
  },
  handleInputKeydown(e, source) {
    const menu =
      source === 'sidebar'
        ? document.getElementById('sidebar-autocomplete')
        : document.getElementById('quick-chat-autocomplete');
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!menu.classList.contains('hidden') && menu.children.length === 1) {
        menu.children[0].click();
      } else {
        this.submitChat(source);
      }
    }
  },
  handleRemotePlayback(pb) {
    if (pb.trigger === State.local.sessionId) return;
    const isSelf = pb.senderUid === State.user?.uid;
    const elapsed = (Date.now() - pb.timestamp) / 1000;
    const targetTime = pb.status === 'playing' ? pb.time + elapsed : pb.time;
    State.local.isProcessingRemote = true;
    if (Math.abs(DOM.video.currentTime - targetTime) > 1.5)
      DOM.video.currentTime = targetTime;
    if (pb.status === 'playing' && DOM.video.paused) {
      DOM.video.safePlay();
    } else if (pb.status === 'paused' && !DOM.video.paused) {
      DOM.video.pause();
    }
    if (!isSelf && pb.senderName && pb.action) {
      if (State.playback.lastHandledTrigger !== pb.trigger) {
        Utils.toast(`${pb.senderName}: ${pb.action}`);
        State.playback.lastHandledTrigger = pb.trigger;
      }
    }
    setTimeout(() => (State.local.isProcessingRemote = false), 500);
  },
  async joinRoom() {
    const isHost =
      document.querySelector('button[data-tab="host"]').dataset.active ===
      'true';
    const roomId = isHost
      ? Utils.genId()
      : DOM.roomCode.value.trim().toUpperCase();
    if (!roomId && !isHost) return Utils.toast('Room Code Required', 'error');
    const roomName = isHost ? DOM.roomCode.value || 'Watch Party' : null;
    UI.toggleSpinner(true);
    try {
      State.room.id = roomId;
      RoomService.joinRoom(
        roomId,
        isHost,
        roomName,
        (data) => this.onRemoteUpdate(data),
        (playback) => this.handleRemotePlayback(playback),
        (presence) => this.onPresenceUpdate(presence),
        (chat) => this.onChatUpdate(chat),
        (typers) => this.onTypingUpdate(typers),
        (cmd, sender) => this.onCommandUpdate(cmd, sender)
      )
        .then(() => {
          DOM.lobby.classList.add('hidden');
          DOM.room.classList.remove('hidden');
          DOM.room.classList.add('flex');
          if (window.innerWidth > 768) State.local.sidebarOpen = true;
          else State.local.sidebarOpen = false;
          UI.render('local', State.local);
          Utils.toast(
            isHost ? `Created Room ${roomId}` : `Joined Room ${roomId}`
          );
        })
        .catch(() => {
          Utils.toast('Connection Failed', 'error');
          UI.toggleSpinner(false);
        });
    } catch (e) {
      Utils.toast(e.message, 'error');
      UI.toggleSpinner(false);
    }
  },
  kick(uid) {
    if (!Security.isHost()) return Utils.toast('Unauthorized Action', 'error');
    RoomService.kickUser(uid);
  },
  setSpeed(v) {
    State.playback.speed = parseFloat(v);
    DOM.video.playbackRate = State.playback.speed;
    document.getElementById('disp-speed').innerText = v + 'x';
    Utils.toast(`Speed: ${v}x`);
  },
  setAspect(v) {
    State.local.aspect = v;
    State.local = {
      ...State.local,
    };
    document
      .querySelectorAll('.control-menu')
      .forEach((m) => m.classList.remove('active'));
    Utils.toast(`Aspect: ${v}`);
  },
  setSubtitleSize(v) {
    State.local.subtitleSize = parseInt(v);
    State.local = { ...State.local };
  },
  setOrient(v) {
    State.local.orientation = v;
    if (screen.orientation && screen.orientation.lock) {
      if (v === 'auto') {
        screen.orientation.unlock();
      } else {
        screen.orientation.lock(v).catch(() => {
          console.log('Native orientation lock failed, falling back to CSS');
        });
      }
    }
    State.local = { ...State.local };
    if (v !== 'auto') Utils.toast(`Locked ${Utils.toTitleCase(v)}`);
    else Utils.toast('Orientation: Auto');
    document
      .querySelectorAll('.control-menu')
      .forEach((m) => m.classList.remove('active'));
  },
  loadSub(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.src = url;
    track.label = file.name;
    track.default = true;
    Array.from(DOM.video.textTracks).forEach((t) => (t.mode = 'disabled'));
    track.track.mode = 'showing';
    DOM.video.appendChild(track);
    State.local.subtitles.push({
      label: file.name,
      track: track.track,
    });
    State.local = {
      ...State.local,
    };
    Utils.toast('Subtitle Loaded');
  },
  switchTab(tab) {
    document
      .querySelectorAll('[data-tab]')
      .forEach((b) => (b.dataset.active = b.dataset.tab === tab));
    DOM.roomCode.parentElement.classList.remove('hidden');
    if (tab === 'host') {
      document.getElementById('label-room').innerText = 'Room Name';
      DOM.roomCode.placeholder = 'Enter Room Name';
      DOM.btnEnter.innerText = 'Create Room';
    } else {
      document.getElementById('label-room').innerText = 'Room Code';
      DOM.roomCode.placeholder = 'Enter Room Code';
      DOM.btnEnter.innerText = 'Enter Room';
    }
  },
  togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('i');
    if (input.type === 'password') {
      input.type = 'text';
      icon.classList.remove('fa-eye');
      icon.classList.add('fa-eye-slash');
    } else {
      input.type = 'password';
      icon.classList.remove('fa-eye-slash');
      icon.classList.add('fa-eye');
    }
  },
  toggleSidebar() {
    State.local.sidebarOpen = !State.local.sidebarOpen;
    State.local = {
      ...State.local,
    };
  },
  setupKeyboardHandling() {
    document.addEventListener('keydown', (e) => {
      const active = document.activeElement;
      if (
        active &&
        (active.isContentEditable ||
          active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA')
      )
        return;
      switch (e.code) {
        case 'Space':
        case 'KeyK':
          e.preventDefault();
          Player.actions.play();
          break;
        case 'ArrowLeft':
        case 'KeyJ':
          e.preventDefault();
          Player.actions['seek-back']();
          break;
        case 'ArrowRight':
        case 'KeyL':
          e.preventDefault();
          Player.actions['seek-fwd']();
          break;
        case 'ArrowUp':
          e.preventDefault();
          State.local.volume = Math.min(1, State.local.volume + 0.1);
          State.local = { ...State.local };
          Utils.toast(`Volume: ${Math.round(State.local.volume * 100)}%`);
          break;
        case 'ArrowDown':
          e.preventDefault();
          State.local.volume = Math.max(0, State.local.volume - 0.1);
          State.local = { ...State.local };
          Utils.toast(`Volume: ${Math.round(State.local.volume * 100)}%`);
          break;
        case 'KeyF':
          e.preventDefault();
          Player.actions.fullscreen();
          break;
        case 'KeyM':
          e.preventDefault();
          if (State.local.volume > 0) {
            State.local.lastVolume = State.local.volume;
            State.local.volume = 0;
            Utils.toast('Muted');
          } else {
            State.local.volume = State.local.lastVolume || 1;
            Utils.toast('Unmuted');
          }
          State.local = { ...State.local };
          break;
      }
    });
    if (window.visualViewport) {
      const handleResize = () => {
        const height = window.visualViewport.height;
        const offset = window.innerHeight - height;
        const isKeyboardOpen = offset > 100;
        const sidebarContainer = document.getElementById(
          'chat-input-container'
        );
        if (sidebarContainer) {
          sidebarContainer.style.bottom = isKeyboardOpen
            ? `${offset}px`
            : '0px';
        }
        const quickChat = document.getElementById('quick-chat');
        if (quickChat && !quickChat.classList.contains('ui-hidden')) {
          if (isKeyboardOpen) {
            quickChat.style.bottom = '0px';
            quickChat.style.transform = `translateY(-${offset}px)`;
            const availableHeight = height - 60;
            quickChat.style.maxHeight = `${availableHeight}px`;
          } else {
            quickChat.style.bottom = '32px';
            quickChat.style.transform = 'translateY(0)';
            quickChat.style.maxHeight = '';
          }
        }
      };
      window.visualViewport.addEventListener('resize', handleResize);
      window.visualViewport.addEventListener('scroll', handleResize);
    }
  },
  setupLongPressCopy() {
    document
      .querySelectorAll('.chat-bubble-me, .chat-bubble-other, .chat-bubble-ai')
      .forEach((el) => {
        el.oncontextmenu = (e) => {
          e.preventDefault();
          navigator.clipboard
            .writeText(el.innerText)
            .then(() => Utils.toast('Message Copied'));
        };
      });
  },
  executeAiCommand(cmd, isRemote = false) {
    try {
      if (
        !isRemote &&
        [
          'brightness',
          'volume',
          'aspect',
          'orient',
          'seek',
          'play',
          'pause',
          'speed',
          'lock',
          'sidebar',
          'subtitle',
        ].includes(cmd.action)
      ) {
        RoomService.broadcastCommand(cmd);
      }
      switch (cmd.action) {
        case 'play':
          if (DOM.video.paused) {
            DOM.video.safePlay();
          }
          break;
        case 'pause':
          if (!DOM.video.paused) DOM.video.pause();
          break;
        case 'seek':
          if (cmd.time !== undefined) DOM.video.currentTime = cmd.time;
          else if (cmd.delta !== undefined) DOM.video.currentTime += cmd.delta;
          break;
        case 'speed':
          this.setSpeed(cmd.value);
          break;
        case 'aspect':
          this.setAspect(cmd.value);
          break;
        case 'orient':
          this.setOrient(cmd.value);
          break;
        case 'sidebar':
          if (cmd.value !== State.local.sidebarOpen) this.toggleSidebar();
          break;
        case 'subtitle':
          if (cmd.index === -1)
            Array.from(DOM.video.textTracks).forEach(
              (t) => (t.mode = 'disabled')
            );
          else if (State.local.subtitles[cmd.index]) {
            Array.from(DOM.video.textTracks).forEach(
              (t) => (t.mode = 'disabled')
            );
            State.local.subtitles[cmd.index].track.mode = 'showing';
            State.local = {
              ...State.local,
            };
          }
          break;
        case 'kick':
          if (Security.isHost()) this.kick(cmd.uid);
          break;
        case 'lock':
          if (State.local.locked !== cmd.value) Player.actions.lock();
          break;
        case 'clear':
          if (Security.isHost()) RoomService.clearChat();
          break;
        case 'logout':
          DOM.btnLeave.click();
          break;
        case 'copy':
          DOM.btnCopy.click();
          break;
        case 'volume':
          State.local.volume = Math.max(0, Math.min(1, cmd.value));
          State.local = {
            ...State.local,
          };
          break;
        case 'brightness':
          State.local.brightness = Math.max(0, Math.min(1, cmd.value));
          State.local = {
            ...State.local,
          };
          break;
        case 'fullscreen':
          Player.actions.fullscreen();
          break;
      }
    } catch (e) {
      console.error('AI Command Error', e);
    }
  },
  submitChat: async (source) => {
    const el = source === 'sidebar' ? DOM.chatInput : DOM.quickChatInput;
    const text = el.innerText.trim();
    if (!text) return;
    DOM.chatInput.innerText = '';
    DOM.quickChatInput.innerText = '';
    DOM.chatInput.style.height = 'auto';
    DOM.quickChatInput.style.height = 'auto';
    if (source === 'quick' && DOM.quickChat)
      DOM.quickChat.classList.add(
        'ui-hidden',
        'pointer-events-none',
        'translate-y-20'
      );
    const cmd = text.toLowerCase();
    if (cmd === '/clear') {
      if (Security.isHost()) {
        await RoomService.clearChat();
        Utils.toast('Chat Cleared');
      } else Utils.toast('Host Only Command', 'error');
      return;
    }
    if (cmd === '/movie') {
      Utils.toast('Setting up Movie Mode...');
      const sequence = [
        {
          action: 'volume',
          value: 1.0,
        },
        {
          action: 'brightness',
          value: 1.0,
        },
        {
          action: 'aspect',
          value: 'Fill',
        },
        {
          action: 'orient',
          value: 'landscape',
        },
        {
          action: 'seek',
          time: 0,
        },
        {
          action: 'pause',
        },
        {
          action: 'fullscreen',
        },
        {
          action: 'speed',
          value: 1.0,
        },
      ];
      sequence.forEach((c) => Controller.executeAiCommand(c));
      RoomService.clearChat();
      return;
    }
    await RoomService.sendChat(text);
    if (cmd.startsWith('/ai ')) {
      const prompt = text.substring(4).trim();
      if (prompt) {
        const aiResponse = await Gemini.ask(prompt);
        const jsonMatch = aiResponse.match(/\|\|\|(.*)\|\|\|/);
        let cleanText = aiResponse;
        if (jsonMatch) {
          try {
            const jsonStr = jsonMatch[1];
            const cmds = JSON.parse(jsonStr);
            if (Array.isArray(cmds))
              cmds.forEach((c) => Controller.executeAiCommand(c));
            else Controller.executeAiCommand(cmds);
            cleanText = aiResponse.replace(/\|\|\|.*\|\|\|/, '').trim();
          } catch (e) {
            console.warn('Failed to parse AI command', e);
          }
        }
        if (cleanText)
          await RoomService.sendChat(cleanText, 'Friday', 'gemini-ai-bot');
      }
    }
  },
  setupDOMEvents() {
    window.onerror = (msg) => Utils.toast(`Error: ${msg}`, 'error');
    window.onbeforeunload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    DOM.signupName?.addEventListener('input', (e) => {
      e.target.value = Utils.toTitleCase(e.target.value);
    });
    DOM.loginPass?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleLogin();
    });
    DOM.signupConfirm?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleSignup();
    });
    DOM.signupName?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') DOM.signupEmail.focus();
    });
    DOM.signupEmail?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') DOM.signupPass.focus();
    });
    DOM.signupPass?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') DOM.signupConfirm.focus();
    });
    DOM.loginEmail?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') DOM.loginPass.focus();
    });
    DOM.roomCode?.addEventListener('input', (e) => {
      const isHost =
        document.querySelector('button[data-tab="host"]')?.dataset.active ===
        'true';
      if (isHost) {
        e.target.value = Utils.toTitleCase(e.target.value);
      } else {
        e.target.value = e.target.value.toUpperCase();
      }
    });
    DOM.roomCode?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') DOM.btnEnter.click();
    });
    DOM.btnVerifyCheck?.addEventListener('click', () => {
      this.checkVerification();
    });
    DOM.btnEnter?.addEventListener('click', () => this.joinRoom());
    DOM.btnUpload?.addEventListener('click', () => DOM.fileVideo.click());
    DOM.btnCopy?.addEventListener('click', () => {
      if (State.room.id) {
        const ta = document.createElement('textarea');
        ta.value = State.room.id;
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          Utils.toast('ID Copied');
        } catch {
          Utils.toast('Copy Failed', 'error');
        }
        document.body.removeChild(ta);
      }
    });
    DOM.btnLeave?.addEventListener('click', () => {
      DOM.modalTitle.innerText = 'Leave Room?';
      DOM.modalText.innerText = 'You Will Be Disconnected.';
      DOM.modalConfirm.innerText = 'Leave';
      DOM.modalCancel.innerText = 'Cancel';
      DOM.modalConfirm.onclick = async () => {
        await RoomService.leaveRoom();
        await AuthService.logout();
      };
      DOM.modalCancel.onclick = () => DOM.modal.classList.add('hidden');
      DOM.modal.classList.remove('hidden');
    });
    DOM.fileVideo.onchange = (e) =>
      e.target.files[0] && Player.load(e.target.files[0]);
    DOM.fileSub.onchange = (e) =>
      e.target.files[0] && this.loadSub(e.target.files[0]);
    document.getElementById('btn-load-sub')?.addEventListener('click', (e) => {
      e.stopPropagation();
      DOM.fileSub.click();
    });
    let touchStartY = 0;
    let startVal = 0;
    let lastTapTime = 0;
    const doubleTapDelay = 300;
    const handleTapAction = (type) => {
      const now = Date.now();
      if (now - lastTapTime < doubleTapDelay) {
        if (singleTapTimer) clearTimeout(singleTapTimer);
        singleTapTimer = null;
        if (type === 'left') Player.actions['seek-back']();
        else if (type === 'right') Player.actions['seek-fwd']();
        else if (type === 'center') Player.actions.play();
      } else {
        if (type === 'center' || type === 'left' || type === 'right') {
          singleTapTimer = setTimeout(() => {
            if (
              DOM.controls.classList.contains('ui-instant-hide') ||
              DOM.controls.classList.contains('ui-hidden') ||
              DOM.controls.classList.contains('translate-y-full')
            ) {
              UI.showControls();
            } else {
              DOM.controls.classList.add('ui-instant-hide');
              DOM.btnUnlock.classList.add('ui-instant-hide');
              DOM.quickChat.classList.add('ui-instant-hide');
            }
          }, doubleTapDelay);
        }
      }
      lastTapTime = now;
    };
    const handleTouch = (e, type) => {
      if (State.local.locked) {
        if (e.type === 'touchend' || e.type === 'mouseup') {
          DOM.btnUnlock.classList.remove('ui-instant-hide', 'ui-hidden');
          setTimeout(() => {
            if (State.local.locked)
              DOM.btnUnlock.classList.add('ui-instant-hide');
          }, 2000);
        }
        return;
      }
      const isTouch = e.type.startsWith('touch');
      if (e.type === 'touchend' || e.type === 'mouseup') {
        if (isTouch) {
          if (!State.local.mouseGestureActive) handleTapAction(type);
        }
        State.local.mouseGestureActive = false;
        DOM.gestureFeedback.style.opacity = '0';
        return;
      }
      const clientY = isTouch ? e.touches?.[0]?.clientY : e.clientY;
      if (clientY === undefined) return;
      if (e.type === 'touchstart' || e.type === 'mousedown') {
        touchStartY = clientY;
        startVal =
          type === 'left' ? State.local.brightness : State.local.volume;
        State.local.mouseGestureActive = false;
      } else if (
        e.type === 'touchmove' ||
        (e.type === 'mousemove' && (e.buttons === 1 || isTouch))
      ) {
        e.preventDefault();
        const delta = touchStartY - clientY;
        if (Math.abs(delta) > 10) {
          State.local.mouseGestureActive = true;
          DOM.gestureFeedback.style.opacity = '1';
          const pct = (delta / window.innerHeight) * 2;
          const val = Math.max(0, Math.min(1, startVal + pct));
          if (type === 'left') {
            State.local.brightness = val;
            DOM.gestureText.innerText = `Brightness: ${Math.round(val * 100)}%`;
            State.local = {
              ...State.local,
            };
          } else if (type === 'right') {
            State.local.volume = val;
            DOM.gestureText.innerText = `Volume: ${Math.round(val * 100)}%`;
            State.local = {
              ...State.local,
            };
          }
        }
      }
    };
    const zoneLeft = document.getElementById('zone-left');
    const zoneRight = document.getElementById('zone-right');
    const zoneCenter = document.getElementById('zone-center');
    if (zoneLeft && zoneRight && zoneCenter) {
      [
        'touchstart',
        'touchmove',
        'touchend',
        'mousedown',
        'mousemove',
        'mouseup',
      ].forEach((evt) => {
        zoneLeft.addEventListener(evt, (e) => handleTouch(e, 'left'), {
          passive: false,
        });
        zoneRight.addEventListener(evt, (e) => handleTouch(e, 'right'), {
          passive: false,
        });
      });
      zoneCenter.addEventListener('click', () => {
        if (State.local.locked) {
          DOM.btnUnlock.classList.remove('ui-instant-hide', 'ui-hidden');
          setTimeout(() => {
            if (State.local.locked)
              DOM.btnUnlock.classList.add('ui-instant-hide');
          }, 2000);
          return;
        }
        handleTapAction('center');
      });
    }
    DOM.btnUnlock.onclick = () => {
      State.local.locked = !State.local.locked;
      State.local = { ...State.local };
    };
    DOM.controls?.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (
        btn &&
        btn.dataset.action &&
        Player.actions[btn.dataset.action] &&
        !State.local.longPressActive
      ) {
        Player.actions[btn.dataset.action](e);
      }
    });
    document.addEventListener('click', (e) => {
      const inQuickChat = e.target.closest('#quick-chat');
      const inToggleBtn = e.target.closest(
        'button[data-action="toggle-quick-chat"]'
      );
      if (!inQuickChat && !inToggleBtn) {
        if (!DOM.quickChat.classList.contains('ui-hidden')) {
          DOM.quickChat.classList.add(
            'ui-hidden',
            'pointer-events-none',
            'translate-y-20'
          );
        }
      }
      if (
        !e.target.closest('.control-menu') &&
        !e.target.closest('button[data-action]') &&
        !e.target.closest('#menu-sub')
      ) {
        document
          .querySelectorAll('.control-menu')
          .forEach((m) => m.classList.remove('active'));
        DOM.menuSub.classList.add('hidden');
      }
    });
    window.Controller = {
      switchAuthTab: this.switchAuthTab.bind(this),
      switchTab: this.switchTab.bind(this),
      togglePassword: this.togglePassword.bind(this),
      handleInput: this.handleInput.bind(this),
      handleInputKeydown: this.handleInputKeydown.bind(this),
      kick: this.kick.bind(this),
    };
  },
};
