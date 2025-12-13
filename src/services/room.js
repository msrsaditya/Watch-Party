import { ensureDB } from './firebase.js';
import { State } from '../core/state.js';
import { Security } from '../components/security.js';
import { APP_ID } from '../config.js';
let unsubRoom = null;
let unsubChat = null;
let unsubTyping = null;
let unsubCommands = null;
let unsubPlayback = null;
let unsubPresence = null;
export const RoomService = {
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
    const { db, rtdb, FS, RT } = await ensureDB();
    const roomRef = FS.doc(
      db,
      'artifacts',
      APP_ID,
      'public',
      'data',
      'rooms',
      id
    );
    const playbackRef = RT.ref(rtdb, `rooms/${id}/playback`);
    const presenceRef = RT.ref(rtdb, `rooms/${id}/presence`);
    const myPresenceRef = RT.ref(
      rtdb,
      `rooms/${id}/presence/${State.user.uid}`
    );
    const connectedRef = RT.ref(rtdb, '.info/connected');
    RT.onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        RT.set(myPresenceRef, true);
        RT.onDisconnect(myPresenceRef).set(false);
      }
    });
    unsubPresence = RT.onValue(presenceRef, (snap) => {
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
      await RT.set(playbackRef, {
        status: 'paused',
        time: 0,
        speed: 1,
        trigger: State.local.sessionId,
        timestamp: Date.now(),
      });
      await FS.setDoc(roomRef, {
        host: State.user.uid,
        name: name,
        participants: {
          [State.user.uid]: userPayload,
        },
      });
    } else {
      await FS.setDoc(
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
    unsubRoom = FS.onSnapshot(roomRef, (snap) => {
      if (!snap.exists()) return location.reload();
      const data = snap.data();
      onUpdate(data);
    });
    unsubPlayback = RT.onValue(playbackRef, (snapshot) => {
      const val = snapshot.val();
      if (val) onPlayback(val);
    });
    const chatRef = FS.collection(roomRef, 'messages');
    unsubChat = FS.onSnapshot(chatRef, (snap) => {
      const msgs = [];
      snap.forEach((d) => msgs.push(d.data()));
      onChat(msgs);
    });
    const typingRef = FS.collection(roomRef, 'typing');
    unsubTyping = FS.onSnapshot(typingRef, (snap) => {
      const typers = [];
      snap.forEach((d) =>
        typers.push({
          uid: d.id,
          ...d.data(),
        })
      );
      onTyping(typers);
    });
    const cmdRef = FS.collection(roomRef, 'commands');
    unsubCommands = FS.onSnapshot(cmdRef, (snap) => {
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
    const { db, rtdb, FS, RT } = await ensureDB();
    const rtdbData = {};
    const firestoreData = { ...data };
    if (firestoreData.playback) {
      rtdbData.playback = firestoreData.playback;
      delete firestoreData.playback;
    }
    if (rtdbData.playback) {
      const playbackRef = RT.ref(rtdb, `rooms/${State.room.id}/playback`);
      RT.update(playbackRef, rtdbData.playback);
    }
    if (Object.keys(firestoreData).length > 0) {
      const roomRef = FS.doc(
        db,
        'artifacts',
        APP_ID,
        'public',
        'data',
        'rooms',
        State.room.id
      );
      await FS.updateDoc(roomRef, firestoreData);
    }
  },
  async broadcastCommand(cmd) {
    if (!State.room.id) return;
    const { db, FS } = await ensureDB();
    const roomRef = FS.doc(
      db,
      'artifacts',
      APP_ID,
      'public',
      'data',
      'rooms',
      State.room.id
    );
    await FS.addDoc(FS.collection(roomRef, 'commands'), {
      command: cmd,
      senderName: State.user.name,
      timestamp: Date.now(),
    });
  },
  async sendChat(text, senderName = null, senderUid = null) {
    Security.ensureAuth();
    const { db, FS } = await ensureDB();
    const roomRef = FS.doc(
      db,
      'artifacts',
      APP_ID,
      'public',
      'data',
      'rooms',
      State.room.id
    );
    await FS.addDoc(FS.collection(roomRef, 'messages'), {
      text: text.trim(),
      sender: senderName || State.user.name,
      uid: senderUid || State.user.uid,
      timestamp: Date.now(),
    });
  },
  async setTyping(isTyping) {
    if (!State.room.id) return;
    const { db, FS } = await ensureDB();
    const roomRef = FS.doc(
      db,
      'artifacts',
      APP_ID,
      'public',
      'data',
      'rooms',
      State.room.id
    );
    const typeRef = FS.doc(roomRef, 'typing', State.user.uid);
    if (isTyping)
      await FS.setDoc(typeRef, {
        name: State.user.name,
        timestamp: Date.now(),
      });
    else await FS.deleteDoc(typeRef);
  },
  async clearChat() {
    if (!State.room.id) return;
    const { db, FS } = await ensureDB();
    const roomRef = FS.doc(
      db,
      'artifacts',
      APP_ID,
      'public',
      'data',
      'rooms',
      State.room.id
    );
    const chatRef = FS.collection(roomRef, 'messages');
    const snap = await FS.getDocs(chatRef);
    const promises = [];
    snap.forEach((d) => promises.push(FS.deleteDoc(d.ref)));
    await Promise.all(promises);
  },
  async updatePresence(hash) {
    if (!State.room.id) return;
    const { db, FS } = await ensureDB();
    const roomRef = FS.doc(
      db,
      'artifacts',
      APP_ID,
      'public',
      'data',
      'rooms',
      State.room.id
    );
    await FS.updateDoc(roomRef, {
      [`participants.${State.user.uid}.fileHash`]: hash,
    });
  },
  async kickUser(uid) {
    Security.ensureAuth();
    const { db, FS } = await ensureDB();
    const roomRef = FS.doc(
      db,
      'artifacts',
      APP_ID,
      'public',
      'data',
      'rooms',
      State.room.id
    );
    await FS.updateDoc(roomRef, {
      [`participants.${uid}.kicked`]: true,
    });
  },
  async acceptUser(uid) {
    Security.ensureAuth();
    const { db, FS } = await ensureDB();
    const roomRef = FS.doc(
      db,
      'artifacts',
      APP_ID,
      'public',
      'data',
      'rooms',
      State.room.id
    );
    await FS.updateDoc(roomRef, {
      [`participants.${uid}.active`]: true,
    });
  },
  async rejectUser(uid) {
    this.kickUser(uid);
  },
  async leaveRoom() {
    if (!State.room.id) return;
    if (unsubRoom) {
      unsubRoom();
      unsubRoom = null;
    }
    if (unsubChat) {
      unsubChat();
      unsubChat = null;
    }
    if (unsubTyping) {
      unsubTyping();
      unsubTyping = null;
    }
    if (unsubCommands) {
      unsubCommands();
      unsubCommands = null;
    }
    if (unsubPlayback) {
      unsubPlayback();
      unsubPlayback = null;
    }
    if (unsubPresence) {
      unsubPresence();
      unsubPresence = null;
    }
    const { db, FS } = await ensureDB();
    const roomRef = FS.doc(
      db,
      'artifacts',
      APP_ID,
      'public',
      'data',
      'rooms',
      State.room.id
    );
    try {
      await FS.updateDoc(roomRef, {
        [`participants.${State.user.uid}`]: FS.deleteField(),
      });
    } catch {
      console.warn('Offline, cannot remove participant');
    }
  },
};
