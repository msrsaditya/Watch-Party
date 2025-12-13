import './style.css';
import { inject } from '@vercel/analytics';
import { Controller } from './core/controller.js';
import { UI } from './components/ui.js';
import { registerRenderer } from './core/state.js';
inject();
registerRenderer(UI.render);
Controller.init();
