import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth } from './firebase.js';
import { Utils } from '../utils/helpers.js';
export const AuthService = {
  init(onAuthChange) {
    onAuthStateChanged(auth, (u) => {
      const user = u
        ? {
            uid: u.uid,
            name: u.displayName || 'Anon',
            emailVerified: u.emailVerified,
          }
        : null;
      onAuthChange(user, u);
    });
  },
  async login(email, password) {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      Utils.toast('Welcome Back');
    } catch (e) {
      this.handleAuthError(e);
      throw e;
    }
  },
  async signup(email, password, name) {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
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
      await sendPasswordResetEmail(auth, email);
      Utils.toast('Reset Link Sent');
    } catch (e) {
      Utils.toast(e.message, 'error');
    }
  },
  async logout() {
    await signOut(auth);
    location.reload();
  },
  get currentUser() {
    return auth.currentUser;
  },
};
