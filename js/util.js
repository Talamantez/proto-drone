// Small shared helpers: DOM lookup, formatting, hint line, safe localStorage.
import { S } from './state.js';

export const $ = id => document.getElementById(id);
export const fmtT = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const pct = set => S.P.cells.length ? Math.round(100 * set.size / S.P.cells.length) : 0;
export const linkColor = l => l === 'lte' ? '#4a9fd8' : l === 'lora' ? '#d98b3a' : '#d4605a';
export const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
export const isNarrow = () => window.matchMedia('(max-width: 800px)').matches;
export function setHint(t) { $('hint').textContent = t; }
export const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
