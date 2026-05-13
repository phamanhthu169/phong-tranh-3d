import * as THREE from 'three';
import { Header }      from '../ui/Header.js';
import { AuthManager } from './AuthManager.js';

export const HEADER_H = 48; // chiều cao header — dùng chung toàn app

export class SceneManager {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(innerWidth, innerHeight - HEADER_H);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;

    // đẩy canvas xuống dưới header
    const canvas = this.renderer.domElement;
    canvas.style.position = 'fixed';
    canvas.style.top      = HEADER_H + 'px';
    canvas.style.left     = '0';
    document.body.appendChild(canvas);

    // base body style
    document.body.style.margin   = '0';
    document.body.style.overflow = 'hidden';

    this.current          = null;
    this._registry        = {};
    this._clock           = new THREE.Clock();
    this.auth             = new AuthManager();
    this.currentRoom      = null;   // phòng đang mở trong Studio
    this.previousScene    = null;   // scene trước đó (để nút Back biết về đâu)
    this._currentSceneName = null;
    this.profileTarget    = null;   // set trước khi navigateTo('profile') để xem profile người khác
    this._header          = new Header(this);

    // nút Back / Forward của trình duyệt
    window.addEventListener('popstate', (e) => {
      const name = e.state?.scene ?? 'landing';
      this.navigateTo(name, false);
    });

    window.addEventListener('resize', () => this._onResize());
    this._loop();
  }

  // đăng ký một màn hình với cái tên
  register(name, SceneClass) {
    this._registry[name] = SceneClass;
    return this; // cho phép chain: manager.register(...).register(...)
  }

  // chuyển sang màn hình khác
  // addHistory = false khi gọi từ popstate (nút Back) để không push thêm vào history
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

    // cập nhật URL
    if (addHistory) {
      const path = name === 'landing' ? '/' : '/' + name;
      history.pushState({ scene: name }, '', path);
    }

    this._currentSceneName = name;
    this.current = new SceneClass(this.renderer, this);
    await this.current.init();
  }

  // đọc URL hiện tại để biết nên mở màn hình nào khi load lần đầu
  sceneFromCurrentPath() {
    const path = location.pathname.replace(/^\//, '').replace(/\/$/, '');
    return path || 'landing';
  }

  _onResize() {
    this.renderer.setSize(innerWidth, innerHeight - HEADER_H);
    if (this.current) this.current.onResize();
  }

  _loop() {
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(this._clock.getDelta(), 0.1);
    if (this.current) {
      this.current.update(dt);
      this.renderer.render(this.current.threeScene, this.current.camera);
    }
  }
}
