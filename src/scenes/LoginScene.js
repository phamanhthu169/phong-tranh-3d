import * as THREE from 'three';
import { BaseScene } from './BaseScene.js';
import { HEADER_H }  from '../core/SceneManager.js';

export class LoginScene extends BaseScene {
  async init() {
    this.threeScene.background = new THREE.Color(0xffffff);
    this.camera.position.set(0, 0, 5);
    this.threeScene.add(new THREE.AmbientLight(0xffffff, 0.3));
    this._createParticles();
    this._buildForm();
  }

  _createParticles() {
    const count = 200, pos = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) pos[i] = (Math.random() - 0.5) * 20;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this._particles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xcccccc, size: 0.03, transparent: true, opacity: 0.5 })
    );
    this.threeScene.add(this._particles);
  }

  _buildForm() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:relative;width:100%;min-height:calc(100vh - ${HEADER_H}px);display:flex;align-items:center;justify-content:center;z-index:100;pointer-events:none;`;

    const card = document.createElement('div');
    card.style.cssText = 'background:#ffffff;border:1px solid rgba(0,0,0,.12);border-radius:6px;padding:32px;width:340px;display:flex;flex-direction:column;gap:14px;font-family:monospace;pointer-events:all;box-shadow:0 4px 24px rgba(0,0,0,.08);';
    card.innerHTML = `
      <div style="color:#2222C6;font-family:'Montserrat',sans-serif;font-size:40px;font-weight:800;line-height:1.1;text-align:center;margin-bottom:4px">Đăng nhập</div>

      <div style="display:flex;flex-direction:column;gap:4px">
        <label style="color:#555;font-size:9px;letter-spacing:.12em;text-transform:uppercase">Tên của bạn</label>
        <input id="li-name" type="text" autocomplete="username" placeholder="Nhập tên hiển thị..."
          style="background:rgba(0,0,0,.04);border:1px solid rgba(0,0,0,.12);color:#1a1a1a;font-family:monospace;font-size:12px;padding:9px 10px;border-radius:3px;outline:none;">
      </div>

      <div style="display:flex;flex-direction:column;gap:4px">
        <label style="color:#555;font-size:9px;letter-spacing:.12em;text-transform:uppercase">Mật khẩu</label>
        <input id="li-password" type="password" autocomplete="current-password" placeholder="Nhập mật khẩu..."
          style="background:rgba(0,0,0,.04);border:1px solid rgba(0,0,0,.12);color:#1a1a1a;font-family:monospace;font-size:12px;padding:9px 10px;border-radius:3px;outline:none;">
      </div>

      <div id="li-msg" style="font-size:10px;letter-spacing:.06em;display:none;padding:6px 8px;border-radius:3px;"></div>

      <button id="li-submit"
        style="background:rgba(200,169,110,.15);border:1px solid rgba(200,169,110,.5);color:#c8a96e;font-family:monospace;font-size:12px;letter-spacing:.12em;text-transform:uppercase;padding:11px;border-radius:3px;cursor:pointer;transition:background .2s;">
        Vào ngay
      </button>

      <div style="border-top:1px solid rgba(0,0,0,.08);padding-top:12px;display:flex;align-items:center;justify-content:space-between">
        <span style="color:#666;font-size:10px;letter-spacing:.06em">Chưa có hồ sơ?</span>
        <button id="li-to-register"
          style="background:none;border:1px solid rgba(0,0,0,.12);color:#333;font-family:monospace;font-size:10px;padding:5px 12px;border-radius:3px;cursor:pointer;letter-spacing:.06em;transition:all .2s;">
          Đăng ký
        </button>
      </div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    this._el(overlay);

    const sub = document.getElementById('li-submit');
    sub.addEventListener('mouseenter', () => sub.style.background = 'rgba(200,169,110,.3)');
    sub.addEventListener('mouseleave', () => sub.style.background = 'rgba(200,169,110,.15)');

    sub.addEventListener('click', () => this._handleLogin());
    card.addEventListener('keydown', e => { if (e.key === 'Enter') this._handleLogin(); });
    document.getElementById('li-to-register').addEventListener('click', () => this.manager.navigateTo('register'));
  }

  _showMsg(text, type = 'error') {
    const el = document.getElementById('li-msg');
    el.textContent = text;
    el.style.display = 'block';
    el.style.color      = type === 'success' ? '#6aaa7a' : '#b54a3a';
    el.style.background = type === 'success' ? 'rgba(106,170,122,.08)' : 'rgba(181,74,58,.08)';
    el.style.border     = type === 'success' ? '1px solid rgba(106,170,122,.25)' : '1px solid rgba(181,74,58,.25)';
  }

  async _handleLogin() {
    const name     = document.getElementById('li-name').value.trim();
    const password = document.getElementById('li-password').value;

    if (!name)     { this._showMsg('Vui lòng nhập tên của bạn'); return; }
    if (!password) { this._showMsg('Vui lòng nhập mật khẩu'); return; }

    const sub = document.getElementById('li-submit');
    sub.disabled = true;
    sub.textContent = 'Đang xử lý...';

    try {
      await this.manager.auth.login(name, password);
      this.manager.navigateTo('landing');
    } catch (err) {
      this._showMsg(err.message || 'Có lỗi xảy ra, vui lòng thử lại');
      sub.disabled = false;
      sub.textContent = 'Vào ngay';
    }
  }

  update(_dt) {
    if (this._particles) this._particles.rotation.y += _dt * 0.01;
  }
}
