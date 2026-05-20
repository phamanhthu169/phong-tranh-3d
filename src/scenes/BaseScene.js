import * as THREE from 'three';

// Bản mẫu chung — mọi màn hình đều kế thừa từ đây
export class BaseScene {
  constructor(renderer, manager) {
    this.renderer   = renderer;
    this.manager    = manager;
    this.threeScene = new THREE.Scene();
    this.camera     = new THREE.PerspectiveCamera(70, innerWidth / manager.canvasH, 0.05, 500);

    this._listeners = []; // danh sách event listener để dọn dẹp khi rời màn hình
    this._elements  = []; // danh sách HTML element để xoá khi rời màn hình
    this._disposed  = false;
  }

  // gọi khi vào màn hình — mỗi màn hình tự override
  async init() {}

  // gọi mỗi frame — mỗi màn hình tự override
  update(_dt) {}

  // gọi khi resize cửa sổ
  onResize() {
    this.camera.aspect = innerWidth / this.manager.canvasH;
    this.camera.updateProjectionMatrix();
  }

  // gọi khi rời màn hình — tự động dọn dẹp listener và element
  dispose() {
    this._disposed = true;
    this._listeners.forEach(([target, type, fn]) => target.removeEventListener(type, fn));
    this._listeners = [];
    this._elements.forEach(el => el.parentNode?.removeChild(el));
    this._elements = [];
    // Dọn loading screen nếu còn tồn tại
    this._loadingOverlay?.parentNode?.removeChild(this._loadingOverlay);
    this._loadingOverlay = null;
  }

  _showLoadingScreen(text = 'Đang tải phòng tranh...') {
    const overlay = document.createElement('div');
    overlay.id = 'room-loading-overlay';
    overlay.style.cssText = [
      'position:fixed;top:0;left:0;width:100%;height:100%',
      'background:rgba(12,10,8,0.97)',
      'display:flex;flex-direction:column;align-items:center;justify-content:center',
      'z-index:9999',
      'opacity:0;transition:opacity 0.35s ease',
    ].join(';');
    overlay.innerHTML = `
      <style>
        @keyframes _room_spin { to { transform:rotate(360deg); } }
        #room-loading-overlay .rl-ring {
          width:52px;height:52px;border-radius:50%;
          border:3px solid rgba(212,197,169,0.12);
          border-top-color:#c8a96e;
          animation:_room_spin 0.85s linear infinite;
          margin-bottom:28px;
        }
        #room-loading-overlay .rl-bar-wrap {
          width:220px;height:3px;
          background:rgba(212,197,169,0.1);
          border-radius:2px;
          overflow:hidden;
          margin-bottom:14px;
        }
        #room-loading-overlay .rl-bar-fill {
          height:100%;width:0%;
          background:linear-gradient(90deg,#a07840,#c8a96e);
          border-radius:2px;
          transition:width 0.25s ease;
        }
        #room-loading-overlay .rl-pct {
          color:#c8a96e;
          font-family:monospace;
          font-size:13px;
          font-weight:600;
          margin-bottom:8px;
          letter-spacing:0.05em;
        }
        #room-loading-overlay .rl-text {
          color:rgba(212,197,169,0.5);
          font-family:monospace;
          font-size:10px;
          letter-spacing:0.18em;
          text-transform:uppercase;
        }
      </style>
      <div class="rl-ring"></div>
      <div class="rl-pct" id="rl-pct-label">0%</div>
      <div class="rl-bar-wrap"><div class="rl-bar-fill" id="rl-bar-fill"></div></div>
      <div class="rl-text" id="rl-status-text">${text}</div>
    `;
    document.body.appendChild(overlay);
    this._loadingOverlay = overlay;
    requestAnimationFrame(() => { overlay.style.opacity = '1'; });
  }

  _setLoadingProgress(pct, label) {
    if (!this._loadingOverlay) return;
    const clamped = Math.min(100, Math.max(0, Math.round(pct)));
    const fill = this._loadingOverlay.querySelector('#rl-bar-fill');
    const pctEl = this._loadingOverlay.querySelector('#rl-pct-label');
    const textEl = this._loadingOverlay.querySelector('#rl-status-text');
    if (fill) fill.style.width = clamped + '%';
    if (pctEl) pctEl.textContent = clamped + '%';
    if (textEl && label) textEl.textContent = label;
  }

  _hideLoadingScreen() {
    this._setLoadingProgress(100);
    const overlay = this._loadingOverlay;
    if (!overlay) return;
    this._loadingOverlay = null;
    setTimeout(() => {
      overlay.style.opacity = '0';
      setTimeout(() => overlay.parentNode?.removeChild(overlay), 380);
    }, 120);
  }

  // thêm event listener có quản lý (tự xoá khi dispose)
  _on(target, type, fn) {
    target.addEventListener(type, fn);
    this._listeners.push([target, type, fn]);
  }

  // đăng ký HTML element để tự xoá khi dispose
  _el(el) {
    this._elements.push(el);
    return el;
  }

  // Đặt SVG làm body background và tự động tính chiều cao theo viewBox của SVG
  async _svgBodyBackground(svgUrl) {
    document.body.style.backgroundImage    = `url('${svgUrl}')`;
    document.body.style.backgroundSize     = '100% auto';
    document.body.style.backgroundPosition = 'top center';
    document.body.style.backgroundRepeat   = 'no-repeat';

    let ratio = null;
    try {
      const text = await fetch(svgUrl, { cache: 'no-cache' }).then(r => r.text());
      const doc  = new DOMParser().parseFromString(text, 'image/svg+xml');
      const svg  = doc.querySelector('svg');
      const vb   = svg?.getAttribute('viewBox');
      if (vb) {
        const parts = vb.trim().split(/[\s,]+/).map(Number);
        const w = parts[2], h = parts[3];
        if (w && h) ratio = h / w;
      }
      if (!ratio) {
        const w = parseFloat(svg?.getAttribute('width')  || 0);
        const h = parseFloat(svg?.getAttribute('height') || 0);
        if (w && h) ratio = h / w;
      }
    } catch (_) {}

    const spacer = this._el(document.createElement('div'));
    spacer.style.cssText = `width:100%;flex-shrink:0;` +
      (ratio ? `height:calc(100vw * ${ratio});` : 'height:100vh;');
    document.body.appendChild(spacer);
  }
}
