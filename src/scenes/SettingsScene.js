import * as THREE from 'three';
import { BaseScene } from './BaseScene.js';
import { HEADER_H } from '../core/SceneManager.js';

export class SettingsScene extends BaseScene {
  async init() {
    await this.manager.auth.ready();
    if (this._disposed) return;

    if (!this.manager.auth.isLoggedIn) { this.manager.navigateTo('login'); return; }

    this.threeScene.background = new THREE.Color(0xF1FAFF);
    this.camera.position.set(0, 0, 5);
    this.threeScene.add(new THREE.AmbientLight(0xffffff, 0.2));

    this._buildOverlay();
  }

  _buildOverlay() {
    const isArtist = this.manager.auth.isArtist;
    const profile  = this.manager.auth.profile;

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;top:${HEADER_H}px;left:0;right:0;bottom:0;
      overflow-y:auto;z-index:100;background:#F1FAFF;
      font-family:'Montserrat',sans-serif;padding:40px 100px;
      box-sizing:border-box;
    `;

    overlay.innerHTML = `
      <style>
        #st-overlay, #st-overlay * { font-family:'Montserrat',sans-serif !important; color:#182D58; }
        #st-overlay .st-btn { padding:9px 22px;font-size:12px;cursor:pointer;font-weight:700;letter-spacing:.08em;border-radius:26px;transition:all .2s;border:2px solid rgba(255,255,255,.25);background:#122F6A;color:#FFFFFF !important;box-shadow:0 4px 12px rgba(118,170,171,.45); }
        #st-overlay .st-btn:hover { box-shadow:0 6px 18px rgba(118,170,171,.7);transform:translateY(-1px); }
        #st-overlay .st-btn.ghost { background:none;border:2px solid rgba(0,0,0,.15);color:#555 !important;box-shadow:none; }
        #st-overlay .st-btn.ghost:hover { border-color:rgba(0,0,0,.3);color:#222 !important;transform:none; }
        #st-overlay .st-btn.danger { background:none;border:1.5px solid rgba(181,74,58,.3);color:rgba(181,74,58,.7) !important;box-shadow:none; }
        #st-overlay .st-btn.danger:hover { background:rgba(181,74,58,.08);color:#e05040 !important;border-color:rgba(181,74,58,.55); }
        #st-overlay .st-card { background:#fff;border:1px solid rgba(0,0,0,.09);border-radius:8px;padding:28px 32px;margin-bottom:18px;box-shadow:0 2px 8px rgba(0,0,0,.05); }
        #st-overlay .st-label { color:#888;font-size:11px;letter-spacing:.18em;text-transform:uppercase;margin-bottom:6px; }
        #st-overlay .st-input { background:rgba(0,0,0,.04);border:1px solid rgba(0,0,0,.12);border-radius:4px;color:#1a1a1a;font-family:'Montserrat',sans-serif;font-size:14px;padding:9px 13px;width:100%;box-sizing:border-box;outline:none;transition:border-color .2s; }
        #st-overlay .st-input:focus { border-color:rgba(118,170,171,.55); }
        #st-overlay .st-input::placeholder { color:#bbb; }
        #st-overlay .st-err { color:#c0392b !important;font-size:12px;margin-top:6px;display:none; }
        #st-overlay .st-ok  { color:#4a9a6a !important;font-size:12px;margin-top:6px;display:none; }
        #st-overlay .st-title { font-size:15px;font-weight:700;letter-spacing:.06em;margin-bottom:4px; }
        #st-overlay .st-desc  { color:#888 !important;font-size:12px;letter-spacing:.04em;margin-bottom:18px; }
      </style>

      <div id="st-overlay">
        <!-- Back -->
        <div style="display:flex;align-items:center;margin-bottom:28px">
          <button id="st-back" class="st-btn ghost" style="font-size:13px">← Quay lại</button>
          <div style="font-size:20px;font-weight:700;letter-spacing:.04em;margin-left:20px">Cài đặt tài khoản</div>
        </div>

        <!-- Edit info -->
        <div class="st-card">
          <div class="st-title">Thông tin cá nhân</div>
          <div class="st-desc">Chỉnh sửa tên, địa điểm, website và giới thiệu</div>
          <button id="st-edit-info-btn" class="st-btn">Chỉnh sửa thông tin</button>
        </div>

        ${isArtist ? `
        <!-- Bank account (artist only) -->
        <div class="st-card" id="st-bank-card">
          <div class="st-title">Tài khoản ngân hàng</div>
          <div class="st-desc">Dùng để nhận thanh toán từ các đơn hàng <span style="color:#aaa;font-size:11px">(chỉ bạn thấy)</span></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
            <div>
              <div class="st-label">Ngân hàng</div>
              <input id="st-bank-name" class="st-input" placeholder="VD: Vietcombank" value="${(profile.bank_name || '').replace(/"/g, '&quot;')}" />
            </div>
            <div>
              <div class="st-label">Số tài khoản</div>
              <input id="st-bank-account" class="st-input" placeholder="VD: 1234 5678 9012" value="${(profile.bank_account_number || '').replace(/"/g, '&quot;')}" />
            </div>
          </div>
          <div style="margin-bottom:16px">
            <div class="st-label">Chủ tài khoản</div>
            <input id="st-bank-holder" class="st-input" placeholder="VD: NGUYEN VAN A" value="${(profile.bank_account_holder || '').replace(/"/g, '&quot;')}" />
          </div>
          <div class="st-err" id="st-bank-err"></div>
          <div class="st-ok"  id="st-bank-ok">✓ Đã lưu</div>
          <button id="st-bank-save" class="st-btn" style="margin-top:4px">Lưu tài khoản ngân hàng</button>
        </div>
        ` : ''}

        <!-- Change password -->
        <div class="st-card">
          <div class="st-title">Đổi mật khẩu</div>
          <div class="st-desc">Nhập mật khẩu hiện tại và mật khẩu mới</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:16px">
            <div>
              <div class="st-label">Mật khẩu cũ</div>
              <input id="st-pw-old" class="st-input" type="password" placeholder="••••••••" />
            </div>
            <div>
              <div class="st-label">Mật khẩu mới</div>
              <input id="st-pw-new" class="st-input" type="password" placeholder="••••••••" />
            </div>
            <div>
              <div class="st-label">Xác nhận mật khẩu mới</div>
              <input id="st-pw-confirm" class="st-input" type="password" placeholder="••••••••" />
            </div>
          </div>
          <div class="st-err" id="st-pw-err"></div>
          <div class="st-ok"  id="st-pw-ok">✓ Đã đổi mật khẩu</div>
          <button id="st-pw-save" class="st-btn">Đổi mật khẩu</button>
        </div>

        <!-- Delete account -->
        <div class="st-card" style="border-color:rgba(181,74,58,.2)">
          <div class="st-title" style="color:rgba(181,74,58,.8) !important">Xóa tài khoản</div>
          <div class="st-desc">Thao tác này không thể hoàn tác. Tất cả dữ liệu sẽ bị xóa vĩnh viễn.</div>
          <div class="st-err" id="st-del-err" style="margin-bottom:8px"></div>
          <button id="st-del-btn" class="st-btn danger">Xóa tài khoản của tôi</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this._el(overlay);
    this._overlay = overlay;

    this._bindEvents(isArtist);
  }

  _bindEvents(isArtist) {
    document.getElementById('st-back').addEventListener('click', () => {
      this.manager.navigateTo(this.manager.previousScene || 'landing');
    });

    document.getElementById('st-edit-info-btn').addEventListener('click', () => {
      this.manager.navigateTo('profile');
    });

    // Bank (artist only)
    if (isArtist) {
      document.getElementById('st-bank-save').addEventListener('click', async () => {
        const btn = document.getElementById('st-bank-save');
        const errEl = document.getElementById('st-bank-err');
        const okEl  = document.getElementById('st-bank-ok');
        errEl.style.display = 'none';
        okEl.style.display  = 'none';
        btn.disabled = true;
        btn.textContent = 'Đang lưu...';
        try {
          await this.manager.auth.updateProfile({
            bank_name:           document.getElementById('st-bank-name').value.trim(),
            bank_account_number: document.getElementById('st-bank-account').value.trim(),
            bank_account_holder: document.getElementById('st-bank-holder').value.trim(),
          });
          okEl.style.display = 'block';
          setTimeout(() => { okEl.style.display = 'none'; }, 2500);
        } catch (e) {
          errEl.textContent = e.message;
          errEl.style.display = 'block';
        } finally {
          btn.disabled = false;
          btn.textContent = 'Lưu tài khoản ngân hàng';
        }
      });
    }

    // Change password
    document.getElementById('st-pw-save').addEventListener('click', async () => {
      const btn     = document.getElementById('st-pw-save');
      const errEl   = document.getElementById('st-pw-err');
      const okEl    = document.getElementById('st-pw-ok');
      const oldPw   = document.getElementById('st-pw-old').value;
      const newPw   = document.getElementById('st-pw-new').value;
      const confirm = document.getElementById('st-pw-confirm').value;

      errEl.style.display = 'none';
      okEl.style.display  = 'none';

      if (!oldPw || !newPw) {
        errEl.textContent = 'Vui lòng điền đầy đủ thông tin';
        errEl.style.display = 'block';
        return;
      }
      if (newPw.length < 6) {
        errEl.textContent = 'Mật khẩu mới phải có ít nhất 6 ký tự';
        errEl.style.display = 'block';
        return;
      }
      if (newPw !== confirm) {
        errEl.textContent = 'Mật khẩu xác nhận không khớp';
        errEl.style.display = 'block';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Đang xử lý...';
      try {
        await this.manager.auth.changePassword(oldPw, newPw);
        document.getElementById('st-pw-old').value = '';
        document.getElementById('st-pw-new').value = '';
        document.getElementById('st-pw-confirm').value = '';
        okEl.style.display = 'block';
        setTimeout(() => { okEl.style.display = 'none'; }, 2500);
      } catch (e) {
        errEl.textContent = e.message;
        errEl.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Đổi mật khẩu';
      }
    });

    // Delete account
    const delBtn = document.getElementById('st-del-btn');
    delBtn.addEventListener('click', async () => {
      const errEl = document.getElementById('st-del-err');
      errEl.style.display = 'none';

      if (delBtn.dataset.confirm !== '1') {
        delBtn.textContent = '? Xác nhận — nhấn lại để xóa';
        delBtn.dataset.confirm = '1';
        setTimeout(() => {
          if (delBtn.dataset.confirm === '1') {
            delBtn.textContent = 'Xóa tài khoản của tôi';
            delBtn.dataset.confirm = '';
          }
        }, 3000);
        return;
      }

      delBtn.disabled = true;
      delBtn.textContent = 'Đang xóa...';
      try {
        await this.manager.auth.deleteAccount();
        this.manager.navigateTo('landing');
      } catch (e) {
        errEl.textContent = e.message;
        errEl.style.display = 'block';
        delBtn.disabled = false;
        delBtn.textContent = 'Xóa tài khoản của tôi';
        delBtn.dataset.confirm = '';
      }
    });
  }
}
