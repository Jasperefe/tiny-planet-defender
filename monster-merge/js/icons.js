// Hand-drawn SVG icon set (replaces emoji so the UI looks the same on every device).
// All icons use a 64x64 grid, a dark outline and flat cartoon fills.

const O = 'stroke="#2b1d4f" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';

const PATHS = {
  book: `<path d="M8 14c8-3 16-3 24 2v38c-8-5-16-5-24-2z" fill="#9a6aff" ${O}/><path d="M56 14c-8-3-16-3-24 2v38c8-5 16-5 24-2z" fill="#b48cff" ${O}/><path d="M14 22c5-1 9-1 13 1M14 30c5-1 9-1 13 1M37 23c4-2 8-2 13-1M37 31c4-2 8-2 13-1" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none"/>`,
  gear: `<path d="M28 6h8l2 7 6 3 7-3 5 6-4 6 2 6 7 3v8l-7 2-2 6 4 6-5 6-7-4-6 3-2 7h-8l-2-7-6-3-7 4-5-6 4-6-2-6-7-2v-8l7-3 2-6-4-6 5-6 7 3 6-3z" fill="#9aa8c0" ${O}/><circle cx="32" cy="32" r="9" fill="#e6ecf7" ${O}/>`,
  sword: `<path d="M44 8l12 0 0 12-24 24-12-12z" fill="#e6ecf7" ${O}/><path d="M48 14L28 34" stroke="#b8c4d8" stroke-width="3" stroke-linecap="round"/><path d="M14 30l20 20" fill="none" stroke="#ffb400" stroke-width="7" stroke-linecap="round"/><path d="M14 30l20 20" fill="none" stroke="#2b1d4f" stroke-width="2" stroke-linecap="round" opacity=".25"/><path d="M22 42l-10 10" stroke="#8a4a1c" stroke-width="7" stroke-linecap="round"/><circle cx="10" cy="54" r="5" fill="#ffb400" ${O}/>`,
  wing: `<path d="M10 50C12 26 28 10 54 8c-2 8-6 13-12 16 6 0 10-1 13-3-3 9-9 14-17 16 5 1 9 0 12-1-5 9-14 14-26 14z" fill="#fff" ${O}/><path d="M18 46c8-12 18-22 30-30" fill="none" stroke="#b8c4d8" stroke-width="3" stroke-linecap="round"/>`,
  gift: `<rect x="8" y="24" width="48" height="12" rx="3" fill="#ff5a7a" ${O}/><rect x="12" y="36" width="40" height="22" rx="3" fill="#ff7a94" ${O}/><path d="M32 24v34" stroke="#ffd23a" stroke-width="8"/><path d="M32 24v34" stroke="#2b1d4f" stroke-width="2" opacity=".2"/><path d="M32 22c-6-10-18-12-17-4 1 6 10 5 17 4zM32 22c6-10 18-12 17-4-1 6-10 5-17 4z" fill="#ffd23a" ${O}/>`,
  trash: `<path d="M14 18h36l-4 40H18z" fill="#8ad0ff" ${O}/><rect x="10" y="12" width="44" height="8" rx="3" fill="#5ab0f0" ${O}/><path d="M26 12V7h12v5" fill="none" ${O}/><path d="M26 28v22M38 28v22" stroke="#2b1d4f" stroke-width="4" stroke-linecap="round"/>`,
  skull: `<path d="M32 6C18 6 9 15 9 28c0 8 4 13 9 16v10h28V44c5-3 9-8 9-16C55 15 46 6 32 6z" fill="#f4ecd8" ${O}/><circle cx="23" cy="29" r="6" fill="#2b1d4f"/><circle cx="41" cy="29" r="6" fill="#2b1d4f"/><path d="M32 36l-3 6h6z" fill="#2b1d4f"/><path d="M26 54v-6M32 54v-6M38 54v-6" stroke="#2b1d4f" stroke-width="3"/>`,
  chest: `<path d="M8 28c0-10 10-16 24-16s24 6 24 16z" fill="#c97a2e" ${O}/><rect x="8" y="28" width="48" height="26" rx="3" fill="#a85e1e" ${O}/><path d="M8 36h48" stroke="#ffd23a" stroke-width="5"/><rect x="27" y="30" width="10" height="12" rx="2" fill="#ffd23a" ${O}/>`,
  map: `<path d="M6 14l16-6 20 6 16-6v42l-16 6-20-6-16 6z" fill="#fff2c8" ${O}/><path d="M22 8v42M42 14v42" stroke="#2b1d4f" stroke-width="3"/><path d="M28 26l6 6m0-6l-6 6" stroke="#e0344a" stroke-width="4" stroke-linecap="round"/><path d="M12 40c4-4 8-2 12-6" stroke="#2a86e8" stroke-width="3" fill="none" stroke-dasharray="3 4" stroke-linecap="round"/>`,
  question: `<circle cx="32" cy="32" r="26" fill="#9a6aff" ${O}/><path d="M24 25c0-6 4-9 8-9 5 0 9 3 9 8 0 7-9 7-9 14" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/><circle cx="32" cy="48" r="4" fill="#fff"/>`,
  restart: `<path d="M50 30a18 18 0 1 1-6-14" fill="none" stroke="#2b1d4f" stroke-width="12" stroke-linecap="round"/><path d="M50 30a18 18 0 1 1-6-14" fill="none" stroke="#5fdc3c" stroke-width="6" stroke-linecap="round"/><path d="M38 6l12 10-14 6z" fill="#5fdc3c" ${O}/>`,
  warning: `<path d="M32 6L60 56H4z" fill="#ffd23a" ${O}/><path d="M32 22v18" stroke="#2b1d4f" stroke-width="6" stroke-linecap="round"/><circle cx="32" cy="48" r="4" fill="#2b1d4f"/>`,
  close: `<path d="M16 16l32 32M48 16L16 48" stroke="#2b1d4f" stroke-width="9" stroke-linecap="round"/>`,
  arrow: `<path d="M8 26h28V14l22 18-22 18V38H8z" fill="#ffd23a" ${O}/>`,
  bulb: `<path d="M32 6c-11 0-19 8-19 18 0 7 4 11 7 14 2 2 3 5 3 8h18c0-3 1-6 3-8 3-3 7-7 7-14 0-10-8-18-19-18z" fill="#ffe066" ${O}/><rect x="23" y="46" width="18" height="10" rx="3" fill="#b8c4d8" ${O}/><path d="M26 22c2-4 6-6 10-5" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none"/>`,
  hand: `<path d="M24 32V10a5 5 0 0 1 10 0v18l4-1c3 0 5 1 6 3l4-1c3 0 5 2 5 5v12c0 9-7 14-15 14h-6c-6 0-9-3-12-8l-8-12c-2-3 0-6 3-6 2 0 4 1 5 3z" fill="#ffd6b0" ${O}/>`,
  star: `<path d="M32 4l8 17 18 2-13 13 4 19-17-9-17 9 4-19L6 23l18-2z" fill="#ffd23a" ${O}/>`,
  user: `<circle cx="32" cy="22" r="12" fill="#6ccbff" ${O}/><path d="M10 56c0-12 10-20 22-20s22 8 22 20z" fill="#2a86e8" ${O}/>`,
  // Elements
  poison: `<path d="M32 6c10 14 18 24 18 34a18 18 0 0 1-36 0c0-10 8-20 18-34z" fill="#7dff5a" ${O}/><circle cx="25" cy="40" r="4" fill="#2b1d4f"/><circle cx="39" cy="40" r="4" fill="#2b1d4f"/><path d="M25 50c4 3 10 3 14 0" stroke="#2b1d4f" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="26" cy="22" r="3" fill="#fff" opacity=".8"/>`,
  swift: `<path d="M38 4L12 36h16l-6 24 30-36H36z" fill="#ffd23a" ${O}/>`,
  ice: `<g stroke="#2b1d4f" stroke-width="10" stroke-linecap="round"><path d="M32 6v52M9 19l46 26M9 45l46-26"/></g><g stroke="#8ad8ff" stroke-width="5" stroke-linecap="round"><path d="M32 6v52M9 19l46 26M9 45l46-26M24 10l8 8 8-8M24 54l8-8 8 8"/></g>`,
  fire: `<path d="M32 4c4 12 18 18 18 34a18 18 0 0 1-36 0c0-8 4-13 8-17 0 6 3 9 6 10-2-11 2-20 4-27z" fill="#ff6a1f" ${O}/><path d="M32 30c3 6 9 9 9 16a9 9 0 0 1-18 0c0-5 5-8 9-16z" fill="#ffd23a"/>`,
  shadow: `<path d="M40 6a26 26 0 1 0 18 40A22 22 0 0 1 40 6z" fill="#9a5aff" ${O}/><circle cx="24" cy="30" r="3" fill="#2b1d4f"/><circle cx="34" cy="34" r="2.5" fill="#2b1d4f"/>`,
  cosmic: `<path d="M32 4l6 20 20 8-20 8-6 20-6-20-20-8 20-8z" fill="#ff6ad8" ${O}/><circle cx="32" cy="32" r="6" fill="#fff"/><circle cx="52" cy="12" r="4" fill="#8af6ff" ${O}/><circle cx="12" cy="52" r="3" fill="#8af6ff" ${O}/>`,
};

export function icon(name, cls = '') {
  return `<svg class="ico ${cls}" viewBox="0 0 64 64" aria-hidden="true">${PATHS[name] || ''}</svg>`;
}

// Fill every <i data-ico="name"></i> placeholder in the page
export function applyIcons(root = document) {
  root.querySelectorAll('[data-ico]').forEach((el) => { if (!el.dataset.done) { el.innerHTML = icon(el.dataset.ico); el.dataset.done = '1'; } });
}
