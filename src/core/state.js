import { Utils } from '../utils/helpers.js';
let renderFn = null;
export const registerRenderer = (fn) => {
  renderFn = fn;
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
export const State = new Proxy(_state, {
  set(target, prop, value) {
    target[prop] = value;
    if (renderFn) renderFn(prop, value);
    return true;
  },
});
