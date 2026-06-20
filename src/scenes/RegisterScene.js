import * as THREE from 'three';
import { BaseScene } from './BaseScene.js';
import { HEADER_H }  from '../core/SceneManager.js';
import { SECURITY_QUESTIONS } from '../core/AuthManager.js';

export class RegisterScene extends BaseScene {
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
    card.style.cssText = 'background:#ffffff;border:1px solid rgba(0,0,0,.12);border-radius:6px;padding:32px;width:360px;display:flex;flex-direction:column;gap:14px;font-family:monospace;pointer-events:all;box-shadow:0 4px 24px rgba(0,0,0,.08);';
    card.innerHTML = `
      <div style="color:#2222C6;font-family:'Montserrat',sans-serif;font-size:40px;font-weight:800;line-height:1.1;text-align:center;margin-bottom:4px">Tạo hồ sơ</div>

      <div style="display:flex;flex-direction:column;gap:4px">
        <label style="color:#555;font-size:9px;letter-spacing:.12em;text-transform:uppercase">Tên hiển thị</label>
        <input id="re-name" type="text" autocomplete="username" placeholder="Tên của bạn..."
          style="background:rgba(0,0,0,.04);border:1px solid rgba(0,0,0,.12);color:#1a1a1a;font-family:monospace;font-size:12px;padding:9px 10px;border-radius:3px;outline:none;">
      </div>

      <div style="display:flex;flex-direction:column;gap:8px">
        <label style="color:#555;font-size:9px;letter-spacing:.12em;text-transform:uppercase">Loại tài khoản</label>
        <div style="display:flex;gap:16px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;color:#1a1a1a;font-size:11px;letter-spacing:.06em;">
            <input type="radio" name="re-role" value="user" checked
              style="accent-color:#c8a96e;width:14px;height:14px;cursor:pointer;">
            Khách trải nghiệm
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;color:#1a1a1a;font-size:11px;letter-spacing:.06em;">
            <input type="radio" name="re-role" value="artist"
              style="accent-color:#c8a96e;width:14px;height:14px;cursor:pointer;">
            Nghệ sĩ
          </label>
        </div>
        <div style="color:#666;font-size:9px;letter-spacing:.06em;line-height:1.6">
          Nghệ sĩ có thể tạo & publish phòng tranh 3D.
        </div>
      </div>

      <div id="re-artist-fields" style="display:none;flex-direction:column;gap:14px;padding:14px;background:rgba(200,169,110,.06);border:1px solid rgba(200,169,110,.25);border-radius:5px;">
        <div style="color:#c8a96e;font-size:9px;letter-spacing:.12em;text-transform:uppercase;font-weight:700">Đơn xin cấp duyệt tài khoản Nghệ sĩ</div>

        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="color:#555;font-size:9px;letter-spacing:.12em;text-transform:uppercase">Họ và tên</label>
          <input id="re-fullname" type="text" placeholder="Họ và tên đầy đủ..."
            style="background:rgba(0,0,0,.04);border:1px solid rgba(0,0,0,.12);color:#1a1a1a;font-family:monospace;font-size:12px;padding:9px 10px;border-radius:3px;outline:none;">
        </div>

        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="color:#555;font-size:9px;letter-spacing:.12em;text-transform:uppercase">Số điện thoại</label>
          <input id="re-phone" type="tel" placeholder="Số điện thoại liên hệ..."
            style="background:rgba(0,0,0,.04);border:1px solid rgba(0,0,0,.12);color:#1a1a1a;font-family:monospace;font-size:12px;padding:9px 10px;border-radius:3px;outline:none;">
        </div>

        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="color:#555;font-size:9px;letter-spacing:.12em;text-transform:uppercase">Link Facebook</label>
          <input id="re-facebook" type="text" placeholder="https://facebook.com/..."
            style="background:rgba(0,0,0,.04);border:1px solid rgba(0,0,0,.12);color:#1a1a1a;font-family:monospace;font-size:12px;padding:9px 10px;border-radius:3px;outline:none;">
        </div>

        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="color:#555;font-size:9px;letter-spacing:.12em;text-transform:uppercase">Link portfolio / samples</label>
          <input id="re-portfolio" type="text" placeholder="https://..."
            style="background:rgba(0,0,0,.04);border:1px solid rgba(0,0,0,.12);color:#1a1a1a;font-family:monospace;font-size:12px;padding:9px 10px;border-radius:3px;outline:none;">
        </div>

        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="color:#555;font-size:9px;letter-spacing:.12em;text-transform:uppercase">Địa chỉ liên lạc</label>
          <input id="re-address" type="text" placeholder="Số nhà, tên đường, quận/huyện..."
            style="background:rgba(0,0,0,.04);border:1px solid rgba(0,0,0,.12);color:#1a1a1a;font-family:monospace;font-size:12px;padding:9px 10px;border-radius:3px;outline:none;margin-bottom:6px;">
          <input id="re-province" type="text" placeholder="Tỉnh/Thành phố..."
            style="background:rgba(0,0,0,.04);border:1px solid rgba(0,0,0,.12);color:#1a1a1a;font-family:monospace;font-size:12px;padding:9px 10px;border-radius:3px;outline:none;">
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:4px">
        <label style="color:#555;font-size:9px;letter-spacing:.12em;text-transform:uppercase">Mật khẩu</label>
        <input id="re-password" type="password" autocomplete="new-password" placeholder="Tối thiểu 6 ký tự..."
          style="background:rgba(0,0,0,.04);border:1px solid rgba(0,0,0,.12);color:#1a1a1a;font-family:monospace;font-size:12px;padding:9px 10px;border-radius:3px;outline:none;">
      </div>

      <div style="display:flex;flex-direction:column;gap:4px">
        <label style="color:#555;font-size:9px;letter-spacing:.12em;text-transform:uppercase">Xác nhận mật khẩu</label>
        <input id="re-password2" type="password" autocomplete="new-password" placeholder="Nhập lại mật khẩu..."
          style="background:rgba(0,0,0,.04);border:1px solid rgba(0,0,0,.12);color:#1a1a1a;font-family:monospace;font-size:12px;padding:9px 10px;border-radius:3px;outline:none;">
      </div>

      <div style="display:flex;flex-direction:column;gap:4px">
        <label style="color:#555;font-size:9px;letter-spacing:.12em;text-transform:uppercase">Câu hỏi bí mật</label>
        <select id="re-secquestion"
          style="background:rgba(0,0,0,.04);border:1px solid rgba(0,0,0,.12);color:#1a1a1a;font-family:monospace;font-size:12px;padding:9px 10px;border-radius:3px;outline:none;">
          <option value="" disabled selected>-- Chọn câu hỏi --</option>
          ${SECURITY_QUESTIONS.map(q => `<option value="${q}">${q}</option>`).join('')}
        </select>
        <div style="color:#666;font-size:9px;letter-spacing:.06em;line-height:1.6">
          Dùng để khôi phục mật khẩu nếu bạn quên sau này.
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:4px">
        <label style="color:#555;font-size:9px;letter-spacing:.12em;text-transform:uppercase">Câu trả lời</label>
        <input id="re-secanswer" type="text" autocomplete="off" placeholder="Câu trả lời của bạn..."
          style="background:rgba(0,0,0,.04);border:1px solid rgba(0,0,0,.12);color:#1a1a1a;font-family:monospace;font-size:12px;padding:9px 10px;border-radius:3px;outline:none;">
      </div>

      <div id="re-msg" style="font-size:10px;letter-spacing:.06em;display:none;padding:6px 8px;border-radius:3px;"></div>

      <button id="re-submit"
        style="background:rgba(200,169,110,.15);border:1px solid rgba(200,169,110,.5);color:#c8a96e;font-family:monospace;font-size:12px;letter-spacing:.12em;text-transform:uppercase;padding:11px;border-radius:3px;cursor:pointer;transition:background .2s;">
        Tạo hồ sơ
      </button>

      <div style="border-top:1px solid rgba(0,0,0,.08);padding-top:12px;display:flex;align-items:center;justify-content:space-between">
        <span style="color:#666;font-size:10px;letter-spacing:.06em">Đã có hồ sơ?</span>
        <button id="re-to-login"
          style="background:none;border:1px solid rgba(0,0,0,.12);color:#333;font-family:monospace;font-size:10px;padding:5px 12px;border-radius:3px;cursor:pointer;letter-spacing:.06em;transition:all .2s;">
          Đăng nhập
        </button>
      </div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    this._el(overlay);

    const sub = document.getElementById('re-submit');
    sub.addEventListener('mouseenter', () => sub.style.background = 'rgba(200,169,110,.3)');
    sub.addEventListener('mouseleave', () => sub.style.background = 'rgba(200,169,110,.15)');

    card.querySelectorAll('input[name="re-role"]').forEach(r => {
      r.addEventListener('change', () => {
        const isArtist = document.querySelector('input[name="re-role"]:checked')?.value === 'artist';
        document.getElementById('re-artist-fields').style.display = isArtist ? 'flex' : 'none';
      });
    });

    sub.addEventListener('click', () => this._handleRegister());
    card.addEventListener('keydown', e => { if (e.key === 'Enter') this._handleRegister(); });
    document.getElementById('re-to-login').addEventListener('click', () => this.manager.navigateTo('login'));
  }

  _showMsg(text, type = 'error') {
    const el = document.getElementById('re-msg');
    el.textContent = text;
    el.style.display = 'block';
    el.style.color      = type === 'success' ? '#6aaa7a' : '#b54a3a';
    el.style.background = type === 'success' ? 'rgba(106,170,122,.08)' : 'rgba(181,74,58,.08)';
    el.style.border     = type === 'success' ? '1px solid rgba(106,170,122,.25)' : '1px solid rgba(181,74,58,.25)';
  }

  async _handleRegister() {
    const name        = document.getElementById('re-name').value.trim();
    const role        = document.querySelector('input[name="re-role"]:checked')?.value ?? 'user';
    const password    = document.getElementById('re-password').value;
    const password2   = document.getElementById('re-password2').value;
    const secQuestion = document.getElementById('re-secquestion').value;
    const secAnswer   = document.getElementById('re-secanswer').value.trim();

    if (!name)               { this._showMsg('Vui lòng nhập tên hiển thị'); return; }
    if (!password)           { this._showMsg('Vui lòng nhập mật khẩu'); return; }
    if (password.length < 6) { this._showMsg('Mật khẩu phải có ít nhất 6 ký tự'); return; }
    if (password !== password2) { this._showMsg('Mật khẩu xác nhận không khớp'); return; }
    if (!secQuestion)         { this._showMsg('Vui lòng chọn câu hỏi bí mật'); return; }
    if (!secAnswer)           { this._showMsg('Vui lòng nhập câu trả lời cho câu hỏi bí mật'); return; }

    let artistInfo = null;
    if (role === 'artist') {
      const full_name      = document.getElementById('re-fullname').value.trim();
      const phone          = document.getElementById('re-phone').value.trim();
      const facebook_link  = document.getElementById('re-facebook').value.trim();
      const portfolio_link = document.getElementById('re-portfolio').value.trim();
      const address        = document.getElementById('re-address').value.trim();
      const province       = document.getElementById('re-province').value.trim();

      if (!full_name) { this._showMsg('Vui lòng nhập họ và tên'); return; }
      if (!phone)     { this._showMsg('Vui lòng nhập số điện thoại'); return; }
      if (!address)   { this._showMsg('Vui lòng nhập địa chỉ liên lạc'); return; }
      if (!province)  { this._showMsg('Vui lòng nhập Tỉnh/Thành phố'); return; }

      artistInfo = { full_name, phone, facebook_link, portfolio_link, address, province };
    }

    const sub = document.getElementById('re-submit');
    sub.disabled = true;
    sub.textContent = 'Đang tạo...';

    try {
      const security = { question: secQuestion, answer: secAnswer };
      await this.manager.auth.register(name, role, password, artistInfo, security);
      this._showMsg(
        role === 'artist'
          ? 'Tạo hồ sơ thành công! Đơn xin cấp duyệt Nghệ sĩ đã được gửi, vui lòng chờ admin xét duyệt.'
          : 'Tạo hồ sơ thành công!',
        'success'
      );
      setTimeout(() => this.manager.navigateTo('landing'), 1200);
    } catch (err) {
      this._showMsg(err.message || 'Có lỗi xảy ra, vui lòng thử lại');
      sub.disabled = false;
      sub.textContent = 'Tạo hồ sơ';
    }
  }

  update(_dt) {
    if (this._particles) this._particles.rotation.y += _dt * 0.01;
  }
}