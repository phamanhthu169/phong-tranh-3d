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
          margin-bottom:22px;
        }
        #room-loading-overlay .rl-text {
          color:rgba(212,197,169,0.65);
          font-family:monospace;
          font-size:11px;
          letter-spacing:0.18em;
          text-transform:uppercase;
        }
      </style>
      <div class="rl-ring"></div>
      <div class="rl-text">${text}</div>
    `;
    document.body.appendChild(overlay);
    this._loadingOverlay = overlay;
    requestAnimationFrame(() => { overlay.style.opacity = '1'; });
  }

  _hideLoadingScreen() {
    const overlay = this._loadingOverlay;
    if (!overlay) return;
    this._loadingOverlay = null;
    overlay.style.opacity = '0';
    setTimeout(() => overlay.parentNode?.removeChild(overlay), 380);
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
}
