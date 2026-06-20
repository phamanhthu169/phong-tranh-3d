import * as THREE from 'three';
import { Header }      from '../ui/Header.js';
import { Footer }      from '../ui/Footer.js';
import { AuthManager } from './AuthManager.js';

// Chiều cao header thực tế — dùng bởi các 2D scene để offset overlay
export const HEADER_H = 90;

// Scene dùng document-flow (body cuộn, footer hiện, header trong suốt)
const PAGE_SCENES     = ['landing', 'pricing', 'support'];
// Scene dùng overlay relative (body cuộn, footer ở đáy, header đặc)
const APP_PAGE_SCENES = ['forum', 'dashboard', 'explore', 'profile', 'settings', 'login', 'register', 'forgot-password'];
// Scene dùng Three.js canvas full-screen, ẩn mọi UI
const FULL3D_SCENES   = ['studio', 'viewer', 'preview'];

export class SceneManager {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping      = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;

    const canvas = this.renderer.domElement;
    canvas.style.position = 'fixed';
    canvas.style.top      = HEADER_H + 'px';
    canvas.style.left     = '0';
    canvas.style.display  = 'none'; // ẩn mặc định, _setSceneMode sẽ bật lên
    document.body.appendChild(canvas);

    document.body.style.margin = '0';

    this.current           = null;
    this._registry         = {};
    this._clock            = new THREE.Clock();
    this.auth              = new AuthManager();
    this.currentRoom       = null;
    this.previousScene     = null;
    this._currentSceneName = null;
    this.profileTarget     = null;
    this._is3D             = false;
    this._header           = new Header(this);
    this._footer           = new Footer(this);  // bắt đầu ẩn (xem Footer.js)

    window.addEventListener('popstate', (e) => {
      const name = e.state?.scene ?? 'landing';
      this.navigateTo(name, false);
    });

    window.addEventListener('resize', () => this._onResize());
    this._loop();
  }

  register(name, SceneClass) {
    this._registry[name] = SceneClass;
    return this;
  }

  // Chiều cao vùng canvas (dưới header)
  get canvasH() { return innerHeight - HEADER_H; }

  // ── Chế độ layout theo loại scene ────────────────────────────────────────────
  _setSceneMode(name) {
    const canvas = this.renderer.domElement;

    if (window.$crisp) {
      if (name === 'viewer') window.$crisp.push(['do', 'chat:hide']);
      else window.$crisp.push(['do', 'chat:show']);
    }

    if (FULL3D_SCENES.includes(name)) {
      // ── Full 3D: canvas chiếm toàn màn hình, ẩn header + footer ──
      document.body.style.overflow   = 'hidden';
      document.body.style.paddingTop = '';
      document.body.style.background = '';
      canvas.style.display = 'block';
      canvas.style.top     = '0';
      this.renderer.setSize(innerWidth, innerHeight);
      this._header.hide();
      this._footer.hide();
      this._is3D = true;

    } else if (PAGE_SCENES.includes(name)) {
      // ── Page 2D: document flow, body cuộn, header + footer hiện ──
      document.body.style.overflow        = 'auto';
      document.body.style.paddingTop      = HEADER_H + 'px';
      document.body.style.background      = '';
      document.body.style.backgroundColor = '#F1FAFF';
      canvas.style.display = 'none';
      this._header.show();
      this._header.setTransparentBg();
      this._footer.show();
      window.scrollTo(0, 0);
      this._is3D = false;

    } else if (APP_PAGE_SCENES.includes(name)) {
      // ── App Page 2D: body cuộn, canvas cố định làm nền, footer ở đáy ──
      document.body.style.overflow        = 'auto';
      document.body.style.paddingTop      = HEADER_H + 'px';
      document.body.style.background      = '';
      document.body.style.backgroundColor = '#F1FAFF';
      canvas.style.display = 'block';
      canvas.style.top     = HEADER_H + 'px';
      this.renderer.setSize(innerWidth, this.canvasH);
      this._header.show();
      this._header.setOpaqueBg();
      this._footer.show();
      window.scrollTo(0, 0);
      this._is3D = false;

    } else {
      // ── App 2D: canvas dưới header, overlay fixed, footer ẩn ──
      document.body.style.overflow   = 'hidden';
      document.body.style.paddingTop = '';
      document.body.style.background = '#F1FAFF';
      canvas.style.display = 'block';
      canvas.style.top     = HEADER_H + 'px';
      this.renderer.setSize(innerWidth, this.canvasH);
      this._header.show();
      this._header.setOpaqueBg();
      this._footer.hide();
      this._is3D = false;
    }
  }

  // ── Chuyển màn hình ──────────────────────────────────────────────────────────
  async navigateTo(name, addHistory = true) {
    if (this.current) {
      this.previousScene = this._currentSceneName;
      this.current.dispose();
      this.current = null;
    }

    const SceneClass = this._registry[name];
    if (!SceneClass) {
      console.warn('[SceneManager] Chưa có màn hình:', name);
      return;
    }

    if (addHistory) {
      let path = name === 'landing' ? '/' : '/' + name;
      if ((name === 'viewer' || name === 'studio') && this.currentRoom?.id) {
        path += '?room=' + encodeURIComponent(this.currentRoom.id);
      }
      history.pushState({ scene: name }, '', path);
    }

    this._currentSceneName = name;
    this._setSceneMode(name);

    this.current = new SceneClass(this.renderer, this);
    await this.current.init();

    // Footer luôn phải là element cuối cùng trong body (sau content của scene)
    document.body.appendChild(this._footer._el);
  }

  sceneFromCurrentPath() {
    const path = location.pathname.replace(/^\//, '').replace(/\/$/, '');
    return path || 'landing';
  }

  _onResize() {
    const canvas = this.renderer.domElement;
    if (canvas.style.display !== 'none') {
      const h = this._is3D ? innerHeight : this.canvasH;
      this.renderer.setSize(innerWidth, h);
    }
    if (this.current) this.current.onResize();
  }

  _loop() {
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(this._clock.getDelta(), 0.1);
    if (this.current) {
      this.current.update(dt);
      if (this.renderer.domElement.style.display !== 'none') {
        this.renderer.render(this.current.threeScene, this.current.camera);
      }
    }
  }
}