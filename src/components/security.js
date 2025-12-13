import { State } from '../core/state.js';
export const Security = {
  isHost: () => State.user && State.room.host === State.user.uid,
  validateRoomId: (id) => /^[A-Z0-9]{12}$/.test(id),
  ensureAuth: () => {
    if (!State.user) throw new Error('Unauthorized');
  },
};
