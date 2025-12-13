import { DOM } from '../components/ui.js';
import { State } from '../core/state.js';
import { Security } from '../components/security.js';
import { SYSTEM_PROMPT } from '../config.js';
export const Gemini = {
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
