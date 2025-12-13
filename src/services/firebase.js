import { initializeApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
import { FIREBASE_CONFIG, INITIAL_AUTH_TOKEN } from '../config.js';
import { Utils } from '../utils/helpers.js';
import { signInWithCustomToken } from 'firebase/auth';
const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export { app };
let db = null;
let rtdb = null;
let FS = null;
let RT = null;
export const ensureDB = async () => {
  if (db && rtdb && FS && RT) return { db, rtdb, FS, RT };
  try {
    await setPersistence(auth, browserSessionPersistence);
  } catch (e) {
    console.warn('Persistence error', e);
  }
  try {
    const [fsModule, rtModule] = await Promise.all([
      import('firebase/firestore'),
      import('firebase/database'),
    ]);
    FS = fsModule;
    RT = rtModule;
    db = FS.initializeFirestore(app, {
      localCache: FS.persistentLocalCache({
        tabManager: FS.persistentMultipleTabManager(),
      }),
    });
    rtdb = RT.getDatabase(app);
    if (INITIAL_AUTH_TOKEN) {
      try {
        await signInWithCustomToken(auth, INITIAL_AUTH_TOKEN);
      } catch (e) {
        console.warn('Initial token error', e);
      }
    }
    return { db, rtdb, FS, RT };
  } catch (e) {
    console.error('Failed to load DB chunks', e);
    Utils.toast('Failed to load resources', 'error');
    throw e;
  }
};
