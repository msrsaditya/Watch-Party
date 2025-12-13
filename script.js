import './style.css';
import { inject } from '@vercel/analytics';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  signInWithCustomToken,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  setPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
inject();
let toastTimer;
let interactionTimer;
let singleTapTimer;
let typingTimer;
let lastChatTimestamp = Date.now();
let pendingModalOpen = false;
const SYSTEM_PROMPT = `<role>
You are Friday, a watch party AI assistant. Your sole purpose is to execute watch party control actions and answer factual queries with maximum efficiency.
</role>

<core_directive>
Convert natural language requests into watch party actions. Execute commands via JSON. Respond in ONE LINE ONLY with robotic brevity.
You are ALLOWED to answer general knowledge and factual questions (e.g., "Who is...?", "What is...?", "Height of...?").
</core_directive>

<context_awareness>
You will receive a [Current State Context] block. Use this to answer queries about the room, video, or chat. You are 'Friday'.
It contains room info, video state, current users, and chat history. Use this to be all-knowing.
</context_awareness>

<permissions>
- CRITICAL ACTIONS (kick, clear): ONLY execute if context.room.isModerator is true.
- If a non-moderator asks for a critical action, reply text: "I'm sorry, I can't do that. Only the host has permission."
- GLOBAL ACTIONS (brightness, volume, aspect, orient, lock, sidebar, play, pause, seek, speed, subtitle): Execute for everyone if requested.
</permissions>

<response_protocol>
- If the user greets (e.g., "Hello", "Hi"), greet back politely and casually. DO NOT ask for commands.
- Default response for successful actions: "Done." + command
- For factual queries: Direct answer only, no elaboration.
- NO explanations unless explicitly requested
- NO subjective opinions, suggestions, or follow-up questions
- ONE LINE maximum for all responses
- Robotic, direct, unbiased tone (except for greetings)
</response_protocol>

<command_execution>
Append ALL commands using this format:
|||{"action": "...", ...}|||

For multiple commands:
|||[{"action": "..."}, {"action": "..."}]|||

Available actions:
1. Play/Pause: {"action": "play"} | {"action": "pause"}
2. Seek: {"action": "seek", "time": 120} | {"action": "seek", "delta": 30}
3. Speed: {"action": "speed", "value": 1.5}
4. Aspect: {"action": "aspect", "value": "Fill"|"Original"|"16:9"|"16:10"|"4:3"|"2.35:1"}
5. Orient: {"action": "orient", "value": "landscape"|"portrait"|"auto"}
6. Sidebar: {"action": "sidebar", "value": true|false}
7. Subtitles: {"action": "subtitle", "index": 0} (use -1 to disable)
8. Kick: {"action": "kick", "uid": "user_id"}
9. Lock: {"action": "lock", "value": true|false}
10. Clear: {"action": "clear"} (clears chat)
11. Logout: {"action": "logout"}
12. Copy: {"action": "copy"} (copies room ID)
13. Volume: {"action": "volume", "value": 0.5} (0.0-1.0)
14. Brightness: {"action": "brightness", "value": 0.5} (0.0-1.0)
15. Fullscreen: {"action": "fullscreen"}
</command_execution>

<natural_language_interpretation>
Common user phrases and their actions:
- "bigger screen" / "zoom in" -> aspect: Fill or 16:9
- "too dark" -> increase brightness
- "too bright" -> decrease brightness
- "skip forward/back" -> seek with delta
- "too fast/slow" -> adjust speed
- "can't hear" / "louder" -> increase volume
- "mute" -> volume: 0
- "turn off chat" -> clear chat
- "hide sidebar" -> sidebar: false
</natural_language_interpretation>

<constraints>
- NEVER provide opinions on content, preferences, or recommendations
- NEVER engage in conversation beyond the task (except greetings and general knowledge)
- NEVER explain actions unless explicitly asked "why" or "how."
- NEVER use multiple lines
- Token efficiency is critical: be maximally concise
</constraints>`;
const Utils = {
  esc: (str) =>
    (str || '').replace(
      /[&<>'"]/g,
      (t) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          "'": '&#39;',
          '"': '&quot;',
        })[t]
    ),
  toTitleCase: (str) => {
    if (!str) return '';
    const lower = new Set([
      'a',
      'an',
      'the',
      'and',
      'but',
      'for',
      'nor',
      'or',
      'of',
      'to',
      'in',
      'at',
      'by',
      'with',
      'from',
      'as',
      'into',
      'over',
      'under',
      'on',
      'off',
      'up',
      'out',
    ]);
    return str
      .toLowerCase()
      .split(' ')
      .map((w, i, arr) => {
        if (w.includes('-'))
          return w
            .split('-')
            .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
            .join('-');
        const clean = w.replace(/[^a-z0-9]/gi, '');
        if (i === 0 || i === arr.length - 1)
          return w.charAt(0).toUpperCase() + w.slice(1);
        if (lower.has(clean)) return w.toLowerCase();
        return w.charAt(0).toUpperCase() + w.slice(1);
      })
      .join(' ');
  },
  formatTime: (s) => {
    if (!s || isNaN(s)) return '0:00';
    const isNeg = s < 0;
    s = Math.abs(s);
    const h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60),
      sec = Math.floor(s % 60);
    const time =
      h > 0
        ? `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
        : `${m}:${sec.toString().padStart(2, '0')}`;
    return isNeg ? `-${time}` : time;
  },
  genId: () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 12; i++)
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
  },
  toast: (msg, type = 'normal') => {
    const t = DOM.toast;
    if (toastTimer) clearTimeout(toastTimer);
    let displayMsg = msg;
    if (msg.toLowerCase() === 'id copied') displayMsg = 'ID Copied';
    else displayMsg = Utils.toTitleCase(msg);
    t.textContent = displayMsg;
    t.className = `fixed top-[15%] left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-2xl z-[20000] transition-all duration-300 font-semibold pointer-events-none whitespace-nowrap opacity-100 translate-y-0 text-sm tracking-wide ${type === 'error' ? 'bg-red-600/90 backdrop-blur text-white' : 'bg-white/90 backdrop-blur text-black'}`;
    toastTimer = setTimeout(() => {
      t.classList.remove('opacity-100', 'translate-y-0');
      t.classList.add('opacity-0', '-translate-y-10');
    }, 2000);
  },
};
const DOM = {
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
const _state = {
  user: null,
  room: {
    id: null,
    host: null,
    participants: {},
    presence: {},
  },
  playback: {
    status: 'paused',
    time: 0,
    speed: 1,
    trigger: null,
  },
  local: {
    volume: 1,
    brightness: 1,
    locked: false,
    sidebarOpen: window.innerWidth > 768,
    aspect: 'Original',
    orientation: 'auto',
    loaded: false,
    sessionId: Utils.genId(),
    hostHash: null,
    myHash: null,
    showRemaining: false,
    longPressActive: false,
    isDragging: false,
    controlsVisible: true,
    isProcessingRemote: false,
    subtitles: [],
    subtitleSize: 100,
  },
  chatLog: [],
};
const State = new Proxy(_state, {
  set(target, prop, value) {
    target[prop] = value;
    UI.render(prop, value);
    return true;
  },
});
const Security = {
  isHost: () => State.user && State.room.host === State.user.uid,
  validateRoomId: (id) => /^[A-Z0-9]{12}$/.test(id),
  ensureAuth: () => {
    if (!State.user) throw new Error('Unauthorized');
  },
};
const Gemini = {
  getAppContext() {
    try {
      return {
        room: {
          name: DOM.headerRoomName ? DOM.headerRoomName.innerText : 'N/A',
          code: State.room.id,
          hostId: State.room.host,
          isModerator: Security.isHost(),
          members: State.room.participants,
        },
        user: {
          id: State.user?.uid,
          name: State.user?.name,
        },
        video: {
          currentTime: DOM.video.currentTime,
          duration: DOM.video.duration,
          paused: DOM.video.paused,
          volume: State.local.volume,
          speed: DOM.video.playbackRate,
          src: DOM.video.src,
        },
        ui: {
          locked: State.local.locked,
          sidebar: State.local.sidebarOpen,
          fullscreen:
            !!document.fullscreenElement ||
            document.body.classList.contains('pseudo-fs'),
          brightness: State.local.brightness,
        },
        chat: State.chatLog.slice(-50),
      };
    } catch {
      return {};
    }
  },
  async ask(prompt) {
    const context = this.getAppContext();
    const fullPrompt = `[Current State Context]\n${JSON.stringify(context, null, 2)}\n[End Context]\n\nUser Query: ${prompt}`;

    try {
      // Call our own secure Vercel API route
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: fullPrompt,
          systemInstruction: SYSTEM_PROMPT,
        }),
      });

      if (!response.ok) throw new Error('AI Server Error');

      const data = await response.json();
      return (
        data.candidates?.[0]?.content?.parts?.[0]?.text ||
        "I couldn't think of a response."
      );
    } catch (e) {
      console.error(e);
      return "Sorry, I'm having trouble connecting to my brain right now.";
    }
  },
};
const Network = {
  db: null,
  auth: null,
  rtdb: null,
  FS: null,
  RT: null,
  unsubRoom: null,
  unsubChat: null,
  unsubTyping: null,
  unsubCommands: null,
  unsubPlayback: null,
  unsubPresence: null,
  async init(onAuthChange) {
    this.onAuthChangeCallback = onAuthChange;
    try {
      const cfg =
        typeof __firebase_config !== 'undefined'
          ? JSON.parse(__firebase_config)
          : {
              apiKey: 'AIzaSyBjeW-nAi37lh5Qlr0LpFgLk_MDZWi7mdw',
              authDomain: 'media-watch-party.firebaseapp.com',
              projectId: 'media-watch-party',
              appId: '1:161348561290:web:79828961203a2d2d2b4073',
              databaseURL:
                'https://media-watch-party-default-rtdb.asia-southeast1.firebasedatabase.app',
            };
      const app = initializeApp(cfg);
      this.auth = getAuth(app);
      this.app = app;
      await setPersistence(this.auth, browserSessionPersistence);
      onAuthStateChanged(this.auth, (u) => {
        const user = u
          ? {
              uid: u.uid,
              name: u.displayName || 'Anon',
              emailVerified: u.emailVerified,
            }
          : null;
        onAuthChange(user, u);
      });
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token)
        await signInWithCustomToken(this.auth, __initial_auth_token);
    } catch {
      Utils.toast('Network Init Error', 'error');
    }
  },
  async ensureDB() {
    if (this.db && this.rtdb && this.FS && this.RT) return;
    UI.toggleSpinner(true);
    try {
      const [fsModule, rtModule] = await Promise.all([
        import('firebase/firestore'),
        import('firebase/database'),
      ]);
      this.FS = fsModule;
      this.RT = rtModule;
      this.db = this.FS.initializeFirestore(this.app, {
        localCache: this.FS.persistentLocalCache({
          tabManager: this.FS.persistentMultipleTabManager(),
        }),
      });
      this.rtdb = this.RT.getDatabase(this.app);
    } catch (e) {
      console.error('Failed to load DB chunks', e);
      Utils.toast('Failed to load resources', 'error');
      throw e;
    } finally {
      UI.toggleSpinner(false);
    }
  },
  async login(email, password) {
    try {
      await signInWithEmailAndPassword(this.auth, email, password);
      Utils.toast('Welcome Back');
    } catch (e) {
      this.handleAuthError(e);
      throw e;
    }
  },
  async signup(email, password, name) {
    try {
      const cred = await createUserWithEmailAndPassword(
        this.auth,
        email,
        password
      );
      await updateProfile(cred.user, { displayName: name });
      await sendEmailVerification(cred.user);
      return cred.user;
    } catch (e) {
      this.handleAuthError(e);
      throw e;
    }
  },
  handleAuthError(e) {
    if (
      e.code === 'auth/wrong-password' ||
      e.code === 'auth/invalid-credential'
    ) {
      Utils.toast('Invalid Email or Password', 'error');
    } else if (e.code === 'auth/user-not-found') {
      Utils.toast('User Not Found', 'error');
    } else if (e.code === 'auth/email-already-in-use') {
      Utils.toast('Email Exists. Please Login.', 'error');
    } else if (e.code === 'auth/weak-password') {
      Utils.toast('Password too weak', 'error');
    } else {
      Utils.toast(e.message, 'error');
    }
  },
  async resetPassword(email) {
    try {
      await sendPasswordResetEmail(this.auth, email);
      Utils.toast('Reset Link Sent');
    } catch (e) {
      Utils.toast(e.message, 'error');
    }
  },
  async logout() {
    await signOut(this.auth);
    location.reload();
  },
  async joinRoom(
    id,
    isHost,
    name,
    onUpdate,
    onPlayback,
    onPresence,
    onChat,
    onTyping,
    onCommand
  ) {
    await this.ensureDB();
    const roomRef = this.FS.doc(
      this.db,
      'artifacts',
      typeof __app_id !== 'undefined' ? __app_id : 'default-app',
      'public',
      'data',
      'rooms',
      id
    );
    const playbackRef = this.RT.ref(this.rtdb, `rooms/${id}/playback`);
    const presenceRef = this.RT.ref(this.rtdb, `rooms/${id}/presence`);
    const myPresenceRef = this.RT.ref(
      this.rtdb,
      `rooms/${id}/presence/${State.user.uid}`
    );
    const connectedRef = this.RT.ref(this.rtdb, '.info/connected');
    this.RT.onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        this.RT.set(myPresenceRef, true);
        this.RT.onDisconnect(myPresenceRef).set(false);
      }
    });
    this.unsubPresence = this.RT.onValue(presenceRef, (snap) => {
      const val = snap.val();
      if (val) onPresence(val);
    });
    const userPayload = {
      name: State.user.name,
      active: isHost,
      kicked: false,
      fileHash: null,
    };
    if (isHost) {
      await this.RT.set(playbackRef, {
        status: 'paused',
        time: 0,
        speed: 1,
        trigger: State.local.sessionId,
        timestamp: Date.now(),
      });
      await this.FS.setDoc(roomRef, {
        host: State.user.uid,
        name: name,
        participants: {
          [State.user.uid]: userPayload,
        },
      });
    } else {
      await this.FS.setDoc(
        roomRef,
        {
          participants: {
            [State.user.uid]: userPayload,
          },
        },
        {
          merge: true,
        }
      );
    }
    this.unsubRoom = this.FS.onSnapshot(roomRef, (snap) => {
      if (!snap.exists()) return location.reload();
      const data = snap.data();
      onUpdate(data);
    });
    this.unsubPlayback = this.RT.onValue(playbackRef, (snapshot) => {
      const val = snapshot.val();
      if (val) onPlayback(val);
    });
    const chatRef = this.FS.collection(roomRef, 'messages');
    this.unsubChat = this.FS.onSnapshot(chatRef, (snap) => {
      const msgs = [];
      snap.forEach((d) => msgs.push(d.data()));
      onChat(msgs);
    });
    const typingRef = this.FS.collection(roomRef, 'typing');
    this.unsubTyping = this.FS.onSnapshot(typingRef, (snap) => {
      const typers = [];
      snap.forEach((d) =>
        typers.push({
          uid: d.id,
          ...d.data(),
        })
      );
      onTyping(typers);
    });
    const cmdRef = this.FS.collection(roomRef, 'commands');
    this.unsubCommands = this.FS.onSnapshot(cmdRef, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const cmdData = change.doc.data();
          if (Date.now() - cmdData.timestamp < 10000) {
            onCommand(cmdData.command, cmdData.senderName);
          }
        }
      });
    });
  },
  async sync(data) {
    if (!State.room.id) return;
    Security.ensureAuth();
    const rtdbData = {};
    const firestoreData = { ...data };
    if (firestoreData.playback) {
      rtdbData.playback = firestoreData.playback;
      delete firestoreData.playback;
    }
    if (rtdbData.playback) {
      const playbackRef = this.RT.ref(
        this.rtdb,
        `rooms/${State.room.id}/playback`
      );
      this.RT.update(playbackRef, rtdbData.playback);
    }
    if (Object.keys(firestoreData).length > 0) {
      const roomRef = this.FS.doc(
        this.db,
        'artifacts',
        typeof __app_id !== 'undefined' ? __app_id : 'default-app',
        'public',
        'data',
        'rooms',
        State.room.id
      );
      await this.FS.updateDoc(roomRef, firestoreData);
    }
  },
  async broadcastCommand(cmd) {
    if (!State.room.id) return;
    const roomRef = this.FS.doc(
      this.db,
      'artifacts',
      typeof __app_id !== 'undefined' ? __app_id : 'default-app',
      'public',
      'data',
      'rooms',
      State.room.id
    );
    await this.FS.addDoc(this.FS.collection(roomRef, 'commands'), {
      command: cmd,
      senderName: State.user.name,
      timestamp: Date.now(),
    });
  },
  async sendChat(text, senderName = null, senderUid = null) {
    Security.ensureAuth();
    const roomRef = this.FS.doc(
      this.db,
      'artifacts',
      typeof __app_id !== 'undefined' ? __app_id : 'default-app',
      'public',
      'data',
      'rooms',
      State.room.id
    );
    await this.FS.addDoc(this.FS.collection(roomRef, 'messages'), {
      text: text.trim(),
      sender: senderName || State.user.name,
      uid: senderUid || State.user.uid,
      timestamp: Date.now(),
    });
  },
  async setTyping(isTyping) {
    if (!State.room.id) return;
    const roomRef = this.FS.doc(
      this.db,
      'artifacts',
      typeof __app_id !== 'undefined' ? __app_id : 'default-app',
      'public',
      'data',
      'rooms',
      State.room.id
    );
    const typeRef = this.FS.doc(roomRef, 'typing', State.user.uid);
    if (isTyping)
      await this.FS.setDoc(typeRef, {
        name: State.user.name,
        timestamp: Date.now(),
      });
    else await this.FS.deleteDoc(typeRef);
  },
  async clearChat() {
    if (!State.room.id) return;
    const roomRef = this.FS.doc(
      this.db,
      'artifacts',
      typeof __app_id !== 'undefined' ? __app_id : 'default-app',
      'public',
      'data',
      'rooms',
      State.room.id
    );
    const chatRef = this.FS.collection(roomRef, 'messages');
    const snap = await this.FS.getDocs(chatRef);
    const promises = [];
    snap.forEach((d) => promises.push(this.FS.deleteDoc(d.ref)));
    await Promise.all(promises);
  },
  async updatePresence(hash) {
    if (!State.room.id) return;
    const roomRef = this.FS.doc(
      this.db,
      'artifacts',
      typeof __app_id !== 'undefined' ? __app_id : 'default-app',
      'public',
      'data',
      'rooms',
      State.room.id
    );
    await this.FS.updateDoc(roomRef, {
      [`participants.${State.user.uid}.fileHash`]: hash,
    });
  },
  async kickUser(uid) {
    Security.ensureAuth();
    const roomRef = this.FS.doc(
      this.db,
      'artifacts',
      typeof __app_id !== 'undefined' ? __app_id : 'default-app',
      'public',
      'data',
      'rooms',
      State.room.id
    );
    await this.FS.updateDoc(roomRef, {
      [`participants.${uid}.kicked`]: true,
    });
  },
  async acceptUser(uid) {
    Security.ensureAuth();
    const roomRef = this.FS.doc(
      this.db,
      'artifacts',
      typeof __app_id !== 'undefined' ? __app_id : 'default-app',
      'public',
      'data',
      'rooms',
      State.room.id
    );
    await this.FS.updateDoc(roomRef, {
      [`participants.${uid}.active`]: true,
    });
  },
  async rejectUser(uid) {
    this.kickUser(uid);
  },
  async leaveRoom() {
    if (!State.room.id) return;
    if (this.unsubRoom) {
      this.unsubRoom();
      this.unsubRoom = null;
    }
    if (this.unsubChat) {
      this.unsubChat();
      this.unsubChat = null;
    }
    if (this.unsubTyping) {
      this.unsubTyping();
      this.unsubTyping = null;
    }
    if (this.unsubCommands) {
      this.unsubCommands();
      this.unsubCommands = null;
    }
    if (this.unsubPlayback) {
      this.unsubPlayback();
      this.unsubPlayback = null;
    }
    if (this.unsubPresence) {
      this.unsubPresence();
      this.unsubPresence = null;
    }
    const roomRef = this.FS.doc(
      this.db,
      'artifacts',
      typeof __app_id !== 'undefined' ? __app_id : 'default-app',
      'public',
      'data',
      'rooms',
      State.room.id
    );
    try {
      await this.FS.updateDoc(roomRef, {
        [`participants.${State.user.uid}`]: this.FS.deleteField(),
      });
    } catch {
      console.warn('Offline, cannot remove participant');
    }
  },
};
const UI = {
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
    if (interactionTimer) clearTimeout(interactionTimer);
    if (State.local.loaded && !DOM.video.paused && !State.local.isDragging) {
      interactionTimer = setTimeout(() => {
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
const Player = {
  wakeLock: null,
  init() {
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
      Controller.onPlaybackUpdate('playing', DOM.video.currentTime, 'Played');
      const playBtnSvg = document.querySelector('[data-action="play"] i');
      if (playBtnSvg) playBtnSvg.className = 'fas fa-pause text-xl';
      UI.animateTap('icon-play-pause');
      UI.showControls();
      Player.loop();
    });
    DOM.video.addEventListener('pause', () => {
      Player.toggleWakeLock(false);
      Controller.onPlaybackUpdate('paused', DOM.video.currentTime, 'Paused');
      const playBtnSvg = document.querySelector('[data-action="play"] i');
      if (playBtnSvg) playBtnSvg.className = 'fas fa-play text-xl';
      UI.animateTap('icon-play-pause');
      UI.showControls();
    });
    DOM.video.addEventListener('seeked', () => {
      UI.updateProgress(DOM.video.currentTime, DOM.video.duration);
      if (State.local.loaded && !State.local.isProcessingRemote) {
        Controller.onPlaybackUpdate(
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
    if (State.room.id) Network.updatePresence(State.local.myHash);
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
      if (!State.local.locked) Controller.toggleSidebar();
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
      if (!State.local.locked) Controller.toggleSidebar();
    },
    'toggle-quick-chat': () => {
      if (State.local.locked) return;
      DOM.quickChat.classList.toggle('ui-hidden');
      DOM.quickChat.classList.toggle('pointer-events-none');
      DOM.quickChat.classList.toggle('translate-y-20');
      if (!DOM.quickChat.classList.contains('ui-hidden')) {
        DOM.quickChatInput.focus();
        if (interactionTimer) clearTimeout(interactionTimer);
      }
    },
  },
};
const Controller = {
  init() {
    window.Controller = this;
    Network.init(this.onAuthChange.bind(this));
    Player.init();
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
    await Network.login(email, pass);
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

    await Network.signup(email, pass, name);
    DOM.verifyModal.classList.remove('hidden');
  },
  async forgotPassword() {
    const email = document.getElementById('login-email').value.trim();
    if (!email) return Utils.toast('Enter your Email first', 'error');
    await Network.resetPassword(email);
  },
  async checkVerification() {
    const user = this.auth.currentUser;
    if (user) {
      await user.reload();
      if (user.emailVerified) {
        DOM.verifyModal.classList.add('hidden');
        this.onAuthChangeCallback({
          uid: user.uid,
          name: user.displayName || 'Anon',
          emailVerified: true,
        });
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
    Network.logout();
  },
  onPlaybackUpdate(status, time, action) {
    if (!State.local.loaded || !State.room.id || State.local.isProcessingRemote)
      return;
    Network.sync({
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
          Network.acceptUser(pendingUser[0]);
          DOM.modal.classList.add('hidden');
          pendingModalOpen = false;
        };
        DOM.modalCancel.onclick = () => {
          Network.rejectUser(pendingUser[0]);
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
    Network.setTyping(true);
    typingTimer = setTimeout(() => Network.setTyping(false), 2000);
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
      Network.joinRoom(
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
    Network.kickUser(uid);
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
        Network.broadcastCommand(cmd);
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
          if (Security.isHost()) Network.clearChat();
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
        await Network.clearChat();
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
      Network.clearChat();
      return;
    }
    await Network.sendChat(text);
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
          await Network.sendChat(cleanText, 'Friday', 'gemini-ai-bot');
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
      if (e.key === 'Enter') Controller.handleLogin();
    });
    DOM.signupConfirm?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') Controller.handleSignup();
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
      Network.checkVerification();
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
        await Network.leaveRoom();
        await Network.logout();
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
  },
};
Controller.init();
