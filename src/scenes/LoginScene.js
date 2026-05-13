import * as THREE from 'three';
import { BaseScene } from './BaseScene.js';
import { HEADER_H }  from '../core/SceneManager.js';

export class LoginScene extends BaseScene {
  async init() {
    this.threeScene.background = new THREE.Color(0x0d0b09);
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
      new THREE.PointsMaterial({ color: 0xc8a96e, size: 0.03, transparent: true, opacity: 0.25 })
    );
    this.threeScene.add(this._particles);
  }

  _buildForm() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;top:${HEADER_H}px;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;z-index:100;pointer-events:none;`;

    const card = document.createElement('div');
    card.style.cssText = 'background:rgba(15,13,12,.97);border:1px solid rgba(212,197,169,.2);border-radius:6px;padding:32px;width:340px;display:flex;flex-direction:column;gap:14px;font-family:monospace;pointer-events:all;';
    card.innerHTML = `
      <div style="color:#d4c5a9;font-size:15px;font-weight:bold;letter-spacing:.18em;text-transform:uppercase;text-align:center;margin-bottom:4px">Đăng nhập</div>

      <div style="display:flex;flex-direction:column;gap:4px">
        <label style="color:#7a6e5c;font-size:9px;letter-spacing:.12em;text-transform:uppercase">Tên của bạn</label>
        <input id="li-name" type="text" autocomplete="name" placeholder="Nhập tên hiển thị..."
          style="background:rgba(212,197,169,.05);border:1px solid rgba(212,197,169,.18);color:#d4c5a9;font-family:monospace;font-size:12px;padding:9px 10px;border-radius:3px;outline:none;">
      </div>

      <div style="display:flex;flex-direction:column;gap:8px">
        <label style="color:#7a6e5c;font-size:9px;letter-spacing:.12em;text-transform:uppercase">Vai trò</label>
        <div style="display:flex;gap:16px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;color:#d4c5a9;font-size:11px;letter-spacing:.06em;">
            <input type="radio" name="li-role" value="user" checked
              style="accent-color:#c8a96e;width:14px;height:14px;cursor:pointer;">
            Người dùng
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;color:#d4c5a9;font-size:11px;letter-spacing:.06em;">
            <input type="radio" name="li-role" value="artist"
              style="accent-color:#c8a96e;width:14px;height:14px;cursor:pointer;">
            Artist
          </label>
        </div>
        <div style="color:#555;font-size:9px;letter-spacing:.06em;line-height:1.6">
          Artist có thể tạo & publish phòng tranh 3D.
        </div>
      </div>

      <div id="li-msg" style="font-size:10px;letter-spacing:.06em;display:none;padding:6px 8px;border-radius:3px;"></div>

      <button id="li-submit"
        style="background:rgba(200,169,110,.15);border:1px solid rgba(200,169,110,.5);color:#c8a96e;font-family:monospace;font-size:12px;letter-spacing:.12em;text-transform:uppercase;padding:11px;border-radius:3px;cursor:pointer;transition:background .2s;">
        Vào ngay
      </button>

      <div style="border-top:1px solid rgba(212,197,169,.1);padding-top:12px;display:flex;align-items:center;justify-content:space-between">
        <span style="color:#555;font-size:10px;letter-spacing:.06em">Chưa có hồ sơ?</span>
        <button id="li-to-register"
          style="background:none;border:1px solid rgba(212,197,169,.2);color:#d4c5a9;font-family:monospace;font-size:10px;padding:5px 12px;border-radius:3px;cursor:pointer;letter-spacing:.06em;transition:all .2s;">
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

  _handleLogin() {
    const name = document.getElementById('li-name').value.trim();
    const role = document.querySelector('input[name="li-role"]:checked')?.value ?? 'user';

    if (!name) { this._showMsg('Vui lòng nhập tên của bạn'); return; }

    this.manager.auth.setProfile(name, role);
    this.manager.navigateTo('landing');
  }

  update(_dt) {
    if (this._particles) this._particles.rotation.y += _dt * 0.01;
  }
}
