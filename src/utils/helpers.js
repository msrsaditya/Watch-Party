import { DOM } from '../components/ui.js';
export const Utils = {
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
    if (window.toastTimer) clearTimeout(window.toastTimer);
    t.classList.remove('opacity-100', 'translate-y-0');
    t.classList.add('opacity-0', '-translate-y-10');
    void t.offsetWidth;
    let displayMsg = msg;
    if (msg.toLowerCase() === 'id copied') displayMsg = 'ID Copied';
    else displayMsg = msg;
    t.textContent = displayMsg;
    t.className = `fixed top-[15%] left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-2xl z-[30000] transition-all duration-300 font-semibold pointer-events-none whitespace-nowrap opacity-100 translate-y-0 text-sm tracking-wide ${type === 'error' ? 'bg-red-600/90 backdrop-blur text-white' : 'bg-white/90 backdrop-blur text-black'}`;
    window.toastTimer = setTimeout(() => {
      t.classList.remove('opacity-100', 'translate-y-0');
      t.classList.add('opacity-0', '-translate-y-10');
    }, 4000);
  },
};
