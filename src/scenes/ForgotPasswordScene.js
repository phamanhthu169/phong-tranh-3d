import * as THREE from 'three';
import { BaseScene } from './BaseScene.js';
import { HEADER_H }  from '../core/SceneManager.js';

export class ForgotPasswordScene extends BaseScene {
  async init() {
    this._step = 1;
    this._name = '';

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
      <div style="color:#2222C6;font-family:'Montserrat',sans-serif;font-size:32px;font-weight:800;line-height:1.1;text-align:center;margin-bottom:4px">Quên mật khẩu</div>

      <div id="fp-step1" style="display:flex;flex-direction:column;gap:14px">
        <div style="color:#666;font-size:10px;letter-spacing:.06em;line-height:1.6">
          Nhập tên hiển thị của bạn, hệ thống sẽ hiện câu hỏi bí mật để xác minh danh tính.
        </div>

        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="color:#555;font-size:9px;letter-spacing:.12em;text-transform:uppercase">Tên hiển thị</label>
          <input id="fp-name" type="text" autocomplete="username" placeholder="Nhập tên hiển thị..."
            style="background:rgba(0,0,0,.04);border:1px solid rgba(0,0,0,.12);color:#1a1a1a;font-family:monospace;font-size:12px;padding:9px 10px;border-radius:3px;outline:none;">
        </div>

        <button id="fp-next"
          style="background:rgba(200,169,110,.15);border:1px solid rgba(200,169,110,.5);color:#c8a96e;font-family:monospace;font-size:12px;letter-spacing:.12em;text-transform:uppercase;padding:11px;border-radius:3px;cursor:pointer;transition:background .2s;">
          Tiếp theo
        </button>
      </div>

      <div id="fp-step2" style="display:none;flex-direction:column;gap:14px">
        <div id="fp-question" style="color:#1a1a1a;font-size:11px;letter-spacing:.04em;line-height:1.6;padding:10px 12px;background:rgba(0,0,0,.03);border-radius:4px;border:1px solid rgba(0,0,0,.08)"></div>

        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="color:#555;font-size:9px;letter-spacing:.12em;text-transform:uppercase">Câu trả lời</label>
          <input id="fp-answer" type="text" autocomplete="off" placeholder="Câu trả lời của bạn..."
            style="background:rgba(0,0,0,.04);border:1px solid rgba(0,0,0,.12);color:#1a1a1a;font-family:monospace;font-size:12px;padding:9px 10px;border-radius:3px;outline:none;">
        </div>

        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="color:#555;font-size:9px;letter-spacing:.12em;text-transform:uppercase">Mật khẩu mới</label>
          <input id="fp-password" type="password" autocomplete="new-password" placeholder="Tối thiểu 6 ký tự..."
            style="background:rgba(0,0,0,.04);border:1px solid rgba(0,0,0,.12);color:#1a1a1a;font-family:monospace;font-size:12px;padding:9px 10px;border-radius:3px;outline:none;">
        </div>

        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="color:#555;font-size:9px;letter-spacing:.12em;text-transform:uppercase">Xác nhận mật khẩu mới</label>
          <input id="fp-password2" type="password" autocomplete="new-password" placeholder="Nhập lại mật khẩu mới..."
            style="background:rgba(0,0,0,.04);border:1px solid rgba(0,0,0,.12);color:#1a1a1a;font-family:monospace;font-size:12px;padding:9px 10px;border-radius:3px;outline:none;">
        </div>

        <button id="fp-submit"
          style="background:rgba(200,169,110,.15);border:1px solid rgba(200,169,110,.5);color:#c8a96e;font-family:monospace;font-size:12px;letter-spacing:.12em;text-transform:uppercase;padding:11px;border-radius:3px;cursor:pointer;transition:background .2s;">
          Đặt lại mật khẩu
        </button>

        <button id="fp-back" type="button"
          style="background:none;border:none;color:#666;font-family:monospace;font-size:9px;letter-spacing:.06em;cursor:pointer;text-decoration:underline;">
          ← Quay lại, nhập tên khác
        </button>
      </div>

      <div id="fp-msg" style="font-size:10px;letter-spacing:.06em;display:none;padding:6px 8px;border-radius:3px;"></div>

      <div style="border-top:1px solid rgba(0,0,0,.08);padding-top:12px;display:flex;align-items:center;justify-content:space-between">
        <span style="color:#666;font-size:10px;letter-spacing:.06em">Đã nhớ ra mật khẩu?</span>
        <button id="fp-to-login"
          style="background:none;border:1px solid rgba(0,0,0,.12);color:#333;font-family:monospace;font-size:10px;padding:5px 12px;border-radius:3px;cursor:pointer;letter-spacing:.06em;transition:all .2s;">
          Đăng nhập
        </button>
      </div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    this._el(overlay);

    const next = document.getElementById('fp-next');
    const sub  = document.getElementById('fp-submit');
    [next, sub].forEach(btn => {
      btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(200,169,110,.3)');
      btn.addEventListener('mouseleave', () => btn.style.background = 'rgba(200,169,110,.15)');
    });

    next.addEventListener('click', () => this._handleNext());
    sub.addEventListener('click', () => this._handleReset());
    card.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      if (this._step === 1) this._handleNext();
      else this._handleReset();
    });

    document.getElementById('fp-back').addEventListener('click', () => this._goToStep(1));
    document.getElementById('fp-to-login').addEventListener('click', () => this.manager.navigateTo('login'));
  }

  _showMsg(text, type = 'error') {
    const el = document.getElementById('fp-msg');
    el.textContent = text;
    el.style.display = 'block';
    el.style.color      = type === 'success' ? '#6aaa7a' : '#b54a3a';
    el.style.background = type === 'success' ? 'rgba(106,170,122,.08)' : 'rgba(181,74,58,.08)';
    el.style.border     = type === 'success' ? '1px solid rgba(106,170,122,.25)' : '1px solid rgba(181,74,58,.25)';
  }

  _hideMsg() {
    document.getElementById('fp-msg').style.display = 'none';
  }

  _goToStep(step) {
    this._step = step;
    document.getElementById('fp-step1').style.display = step === 1 ? 'flex' : 'none';
    document.getElementById('fp-step2').style.display = step === 2 ? 'flex' : 'none';
    this._hideMsg();
  }

  async _handleNext() {
    const name = document.getElementById('fp-name').value.trim();
    if (!name) { this._showMsg('Vui lòng nhập tên hiển thị'); return; }

    const next = document.getElementById('fp-next');
    next.disabled = true;
    next.textContent = 'Đang kiểm tra...';

    try {
      const question = await this.manager.auth.getSecurityQuestion(name);
      this._name = name;
      document.getElementById('fp-question').textContent = question;
      this._goToStep(2);
    } catch (err) {
      this._showMsg(err.message || 'Có lỗi xảy ra, vui lòng thử lại');
    } finally {
      next.disabled = false;
      next.textContent = 'Tiếp theo';
    }
  }

  async _handleReset() {
    const answer    = document.getElementById('fp-answer').value.trim();
    const password  = document.getElementById('fp-password').value;
    const password2 = document.getElementById('fp-password2').value;

    if (!answer)              { this._showMsg('Vui lòng nhập câu trả lời'); return; }
    if (!password)            { this._showMsg('Vui lòng nhập mật khẩu mới'); return; }
    if (password.length < 6)  { this._showMsg('Mật khẩu phải có ít nhất 6 ký tự'); return; }
    if (password !== password2) { this._showMsg('Mật khẩu xác nhận không khớp'); return; }

    const sub = document.getElementById('fp-submit');
    sub.disabled = true;
    sub.textContent = 'Đang xử lý...';

    try {
      await this.manager.auth.resetPasswordWithSecurityAnswer(this._name, answer, password);
      this._showMsg('Đặt lại mật khẩu thành công! Đang chuyển đến trang đăng nhập...', 'success');
      setTimeout(() => this.manager.navigateTo('login'), 1200);
    } catch (err) {
      this._showMsg(err.message || 'Có lỗi xảy ra, vui lòng thử lại');
      sub.disabled = false;
      sub.textContent = 'Đặt lại mật khẩu';
    }
  }

  update(_dt) {
    if (this._particles) this._particles.rotation.y += _dt * 0.01;
  }
}
