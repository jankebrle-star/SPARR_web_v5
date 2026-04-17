// ui.js — sdílené UI helpery
// Import: import { initUI, showToast, openModal, closeModal } from './ui.js';

export function initUI() {
  // ── Page loader ────────────────────────────────────────
  window.addEventListener('load', () => {
    const pl = document.getElementById('sPageLoader');
    if (pl) { pl.style.opacity = '0'; setTimeout(() => pl.remove(), 500); }
  });

  // ── EmailJS init ───────────────────────────────────────
  window.addEventListener('load', () => {
    if (window.emailjs) {
      window.emailjs.init("HAijP0Nkt2ktswUcA");
      console.log("✅ EmailJS ready");
    } else {
      console.warn("⚠️ EmailJS not loaded");
    }
  });

  // ── Cursor ─────────────────────────────────────────────
  const cur  = document.getElementById('sCursor');
  const ring = document.getElementById('sCursorRing');
  if (cur && ring) {
    let mx=0, my=0, rx=0, ry=0;
    document.addEventListener('mousemove', e => {
      mx = e.clientX; my = e.clientY;
      cur.style.transform = `translate(${mx}px,${my}px)`;
    });
    (function animRing() {
      rx += (mx - rx) * .12;
      ry += (my - ry) * .12;
      ring.style.transform = `translate(${rx}px,${ry}px)`;
      requestAnimationFrame(animRing);
    })();
  }

  // ── Nav scroll ─────────────────────────────────────────
  const nav = document.getElementById('mainNav');
  if (nav) window.addEventListener('scroll', () =>
    nav.classList.toggle('scrolled', scrollY > 50));

  // ── Reveal on scroll ───────────────────────────────────
  const rObs = new IntersectionObserver(
    entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
    { threshold: .08, rootMargin: '0px 0px -30px 0px' }
  );
  document.querySelectorAll('.reveal').forEach(el => rObs.observe(el));
  // Hero elements visible immediately
  setTimeout(() => document.querySelectorAll('.hero .reveal').forEach(el => el.classList.add('visible')), 150);

  // ── Escape closes modals ────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.s-modal-overlay.open').forEach(m => m.classList.remove('open'));
  });
}

// ── TOAST — správná animace ────────────────────────────────
export function showToast(msg, type = 'info') {
  const wrap = document.getElementById('toastWrap');
  if (!wrap) return;

  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const t = document.createElement('div');
  t.className = `s-toast ${type}`;
  t.innerHTML = `
    <span style="font-size:15px;flex-shrink:0">${icons[type] || 'ℹ️'}</span>
    <span style="flex:1;font-size:14px">${msg}</span>
    <button style="background:none;border:none;color:rgba(240,240,240,.4);cursor:none;font-size:16px;padding:2px 4px;margin-left:4px;line-height:1"
      onclick="hideToast(this.parentElement)">✕</button>`;
  wrap.appendChild(t);

  // OPRAVA: dva rAF zajistí, že browser vykreslí element PŘED přidáním .show
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')));

  // Auto-remove: odeber .show → počkej na transition → odstraň element
  const timer = setTimeout(() => hideToast(t), 5000);
  t._timer = timer;
}

export function hideToast(el) {
  if (!el) return;
  clearTimeout(el._timer);
  el.classList.remove('show');
  // Čekej na CSS transition (400ms) pak odstraň DOM element
  setTimeout(() => { if (el.parentElement) el.remove(); }, 420);
}

// Globální reference (pro inline onclick)
window.showToast = showToast;
window.hideToast = hideToast;

// ── MODAL ──────────────────────────────────────────────────
export function openModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closeModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.remove('open');
  document.body.style.overflow = '';
}

export function switchModal(a, b) {
  closeModal(a);
  setTimeout(() => openModal(b), 300);
}

window.openModal   = openModal;
window.closeModal  = closeModal;
window.switchModal = switchModal;
