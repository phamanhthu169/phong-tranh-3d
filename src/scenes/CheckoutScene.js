import * as THREE from 'three';
import { BaseScene } from './BaseScene.js';
import { HEADER_H } from '../core/SceneManager.js';
import { supabase } from '../utils/supabase.js';

function parsePrice(str) {
  if (!str) return NaN;
  const digits = str.replace(/[^\d]/g, '');
  if (!digits) return NaN;
  return parseInt(digits, 10);
}
function formatPrice(n) {
  return n.toLocaleString('vi-VN') + ' ₫';
}

export class CheckoutScene extends BaseScene {
  async init() {
    await this.manager.auth.ready();
    if (this._disposed) return;

    if (!this.manager.auth.isLoggedIn) { this.manager.navigateTo('login'); return; }

    this._cart = JSON.parse(localStorage.getItem('gallery_cart') || '[]');

    this.threeScene.background = new THREE.Color(0xF1FAFF);
    this.camera.position.set(0, 0, 5);
    this.threeScene.add(new THREE.AmbientLight(0xffffff, 0.1));

    this._buildOverlay();
  }

  _buildOverlay() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;top:${HEADER_H}px;left:0;right:0;bottom:0;overflow-y:auto;z-index:100;background:#F1FAFF;font-family:'Montserrat',sans-serif;padding:40px;box-sizing:border-box;`;
    document.body.appendChild(overlay);
    this._el(overlay);

    if (this._cart.length === 0) {
      overlay.innerHTML = `
        <div style="max-width:600px;margin:80px auto;text-align:center">
          <div style="color:#182D58;font-family:'Montserrat',sans-serif;font-size:14px;letter-spacing:.16em;text-transform:uppercase">Giỏ hàng trống</div>
          <div style="color:#182D58;font-family:'Montserrat',sans-serif;font-size:12px;margin-top:12px;letter-spacing:.06em">Hãy ghé thăm phòng tranh và thêm tác phẩm trước.</div>
          <button id="co-back" style="margin-top:24px;background:none;border:1px solid rgba(24,45,88,.3);color:#182D58;font-family:'Montserrat',sans-serif;font-size:12px;padding:8px 20px;border-radius:3px;cursor:pointer;letter-spacing:.08em;">← Khám phá phòng tranh</button>
        </div>`;
      document.getElementById('co-back').addEventListener('click', () => this.manager.navigateTo('explore'));
      return;
    }

    let total = 0, allParsed = true;
    this._cart.forEach(item => {
      const n = parsePrice(item.price || '');
      if (isNaN(n)) allParsed = false; else total += n;
    });
    const totalStr = allParsed ? formatPrice(total) : '— (Liên hệ)';

    const orderId = 'DH' + Date.now().toString(36).toUpperCase();
    this._orderId = orderId;

    overlay.innerHTML = `
      <style>
        .co-wrap{max-width:720px;margin:0 auto}
        .co-heading{color:#2222C6;font-family:'Montserrat',sans-serif;font-size:40px;font-weight:800;line-height:1.1;margin-bottom:32px}
        .co-card{background:rgba(24,45,88,.04);border:1px solid rgba(24,45,88,.12);border-radius:6px;padding:24px;margin-bottom:20px}
        .co-card-title{color:#182D58;font-family:'Montserrat',sans-serif;font-size:11px;letter-spacing:.2em;text-transform:uppercase;margin-bottom:16px}
        .co-item{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(24,45,88,.08)}
        .co-item:last-child{border-bottom:none}
        .co-item-name{color:#182D58;font-family:'Montserrat',sans-serif;font-size:13px}
        .co-item-sub{color:#182D58;font-family:'Montserrat',sans-serif;font-size:11px;letter-spacing:.06em;margin-top:2px;opacity:.65}
        .co-item-price{color:#182D58;font-family:'Montserrat',sans-serif;font-size:13px;white-space:nowrap;font-weight:600}
        .co-total{display:flex;justify-content:space-between;align-items:center;padding:14px 0 0;margin-top:4px;border-top:1px solid rgba(24,45,88,.1)}
        .co-total-label{color:#182D58;font-family:'Montserrat',sans-serif;font-size:11px;letter-spacing:.16em;text-transform:uppercase}
        .co-total-value{color:#182D58;font-family:'Montserrat',sans-serif;font-size:22px;letter-spacing:.04em;font-weight:700}
        .co-field{margin-bottom:16px}
        .co-label{color:#182D58;font-family:'Montserrat',sans-serif;font-size:11px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px}
        .co-input{width:100%;padding:10px 12px;background:#fff;border:1px solid rgba(24,45,88,.18);border-radius:4px;color:#182D58;font-family:'Montserrat',sans-serif;font-size:13px;box-sizing:border-box;outline:none;transition:border-color .2s}
        .co-input:focus{border-color:rgba(24,45,88,.45)}
        .co-input::placeholder{color:rgba(24,45,88,.35)}
        .co-input.err{border-color:rgba(255,80,80,.5)}
        .co-err{color:#e05555;font-family:'Montserrat',sans-serif;font-size:11px;letter-spacing:.1em;margin-top:5px;display:none}
        .co-bank{background:rgba(24,45,88,.05);border:1px solid rgba(24,45,88,.12);border-radius:4px;padding:16px}
        .co-bank-row{display:flex;justify-content:space-between;align-items:center;padding:5px 0}
        .co-bank-key{color:#182D58;font-family:'Montserrat',sans-serif;font-size:11px;letter-spacing:.1em;opacity:.6}
        .co-bank-val{color:#182D58;font-family:'Montserrat',sans-serif;font-size:12px;letter-spacing:.06em;font-weight:600}
        .co-note{color:#182D58;font-family:'Montserrat',sans-serif;font-size:11px;letter-spacing:.08em;margin-top:12px;line-height:1.9;opacity:.7}
        .co-confirm{width:100%;padding:14px;background:linear-gradient(135deg,rgba(18,47,106,1),rgba(118,170,171,.89));border:1px solid rgba(255,255,255,.3);color:#fff;font-family:'Montserrat',sans-serif;font-size:14px;font-weight:bold;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;border-radius:4px;transition:all .25s;margin-top:4px}
        .co-confirm:hover{box-shadow:0 4px 24px rgba(118,170,171,.4)}
        .co-confirm:disabled{opacity:.4;cursor:default}
      </style>

      <div class="co-wrap">
        <div class="co-heading">Xác nhận đặt hàng</div>

        <div class="co-card">
          <div class="co-card-title">Đơn hàng — ${this._cart.length} tác phẩm</div>
          ${this._cart.map(item => `
            <div class="co-item">
              <div>
                <div class="co-item-name">${item.title || 'Untitled'}</div>
                ${item.artist ? `<div class="co-item-sub">${item.artist}</div>` : ''}
              </div>
              <div class="co-item-price">${item.price || '—'}</div>
            </div>
          `).join('')}
          <div class="co-total">
            <span class="co-total-label">Tổng cộng</span>
            <span class="co-total-value">${totalStr}</span>
          </div>
        </div>

        <div class="co-card">
          <div class="co-card-title">Thông tin nhận hàng</div>
          <div class="co-field">
            <div class="co-label">Họ và tên *</div>
            <input id="co-name" class="co-input" placeholder="Nguyễn Văn A" />
            <div id="co-name-err" class="co-err">Vui lòng nhập họ tên</div>
          </div>
          <div class="co-field">
            <div class="co-label">Số điện thoại *</div>
            <input id="co-phone" class="co-input" placeholder="0912 345 678" />
            <div id="co-phone-err" class="co-err">Vui lòng nhập số điện thoại</div>
          </div>
          <div class="co-field" style="margin-bottom:0">
            <div class="co-label">Địa chỉ giao hàng *</div>
            <input id="co-address" class="co-input" placeholder="Số nhà, đường, phường, quận, tỉnh/thành phố" />
            <div id="co-address-err" class="co-err">Vui lòng nhập địa chỉ</div>
          </div>
        </div>

        <div class="co-card">
          <div class="co-card-title">Thanh toán — Chuyển khoản ngân hàng</div>
          <div id="co-bank-wrap">
            <div class="co-bank">
              <div class="co-bank-row"><span class="co-bank-key">Ngân hàng</span><span class="co-bank-val" id="co-bank-name">Đang tải...</span></div>
              <div class="co-bank-row"><span class="co-bank-key">Số tài khoản</span><span class="co-bank-val" id="co-bank-number">—</span></div>
              <div class="co-bank-row"><span class="co-bank-key">Chủ tài khoản</span><span class="co-bank-val" id="co-bank-holder">—</span></div>
              <div class="co-bank-row"><span class="co-bank-key">Nội dung CK</span><span class="co-bank-val" id="co-ref">${orderId}</span></div>
            </div>
            <div class="co-note">
              Sau khi đặt hàng, vui lòng chuyển khoản với nội dung <b style="color:#182D58">${orderId}</b>.<br>
              Đơn hàng sẽ được xác nhận trong vòng 24 giờ sau khi nhận được thanh toán.
            </div>
          </div>
        </div>

        <button id="co-confirm" class="co-confirm">✦ Xác nhận đặt hàng →</button>
      </div>
    `;

    const profile = this.manager.auth.profile;
    if (profile?.name) document.getElementById('co-name').value = profile.name;

    document.getElementById('co-confirm').addEventListener('click', () => this._placeOrder());

    this._loadArtistBankInfo();
  }

  async _loadArtistBankInfo() {
    const artistIds   = [...new Set(this._cart.map(it => it.artistId).filter(Boolean))];
    const artistNames = [...new Set(this._cart.map(it => it.artist).filter(Boolean))];
    if (!artistIds.length && !artistNames.length) {
      const el = document.getElementById('co-bank-name');
      if (el) el.textContent = '—';
      return;
    }

    let query = supabase
      .from('profiles')
      .select('display_name, bank_name, bank_account_number, bank_account_holder');
    if (artistIds.length) {
      query = query.in('id', artistIds);
    } else {
      query = query.in('display_name', artistNames);
    }
    const { data } = await query;

    if (this._disposed) return;

    const artists = (data || []).filter(p => p.bank_name || p.bank_account_number);

    if (!artists.length) {
      const el = document.getElementById('co-bank-name');
      if (el) el.textContent = '— (nghệ sĩ chưa cập nhật)';
      return;
    }

    if (artists.length === 1) {
      const a = artists[0];
      document.getElementById('co-bank-name').textContent   = a.bank_name           || '—';
      document.getElementById('co-bank-number').textContent = a.bank_account_number  || '—';
      document.getElementById('co-bank-holder').textContent = a.bank_account_holder  || '—';
      return;
    }

    // Nhiều nghệ sĩ — render theo từng người
    const wrap = document.getElementById('co-bank-wrap');
    if (!wrap) return;
    const orderId = this._orderId;
    wrap.innerHTML = artists.map(a => `
      <div style="margin-bottom:14px">
        <div style="color:#182D58;font-family:'Montserrat',sans-serif;font-size:10px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px;opacity:.6">${a.display_name}</div>
        <div class="co-bank">
          <div class="co-bank-row"><span class="co-bank-key">Ngân hàng</span><span class="co-bank-val">${a.bank_name || '—'}</span></div>
          <div class="co-bank-row"><span class="co-bank-key">Số tài khoản</span><span class="co-bank-val">${a.bank_account_number || '—'}</span></div>
          <div class="co-bank-row"><span class="co-bank-key">Chủ tài khoản</span><span class="co-bank-val">${a.bank_account_holder || '—'}</span></div>
        </div>
      </div>
    `).join('') + `
      <div class="co-bank-row" style="padding-top:8px;border-top:1px solid rgba(24,45,88,.08)">
        <span class="co-bank-key">Nội dung CK</span>
        <span class="co-bank-val">${orderId}</span>
      </div>
      <div class="co-note">
        Ghi nội dung <b style="color:#182D58">${orderId}</b> khi chuyển khoản cho từng nghệ sĩ.<br>
        Đơn hàng sẽ được xác nhận trong vòng 24 giờ sau khi nhận được thanh toán.
      </div>
    `;
  }

  async _placeOrder() {
    const nameEl    = document.getElementById('co-name');
    const phoneEl   = document.getElementById('co-phone');
    const addressEl = document.getElementById('co-address');
    const name    = nameEl.value.trim();
    const phone   = phoneEl.value.trim();
    const address = addressEl.value.trim();

    let valid = true;
    const check = (el, errId, val) => {
      const err = document.getElementById(errId);
      if (!val) { el.classList.add('err'); err.style.display = 'block'; valid = false; }
      else { el.classList.remove('err'); err.style.display = 'none'; }
    };
    check(nameEl, 'co-name-err', name);
    check(phoneEl, 'co-phone-err', phone);
    check(addressEl, 'co-address-err', address);
    if (!valid) return;

    const btn = document.getElementById('co-confirm');
    if (btn) { btn.disabled = true; btn.textContent = 'Đang xử lý...'; }

    const profile = this.manager.auth.profile;
    let total = 0, allParsed = true;
    this._cart.forEach(item => {
      const n = parsePrice(item.price || '');
      if (isNaN(n)) allParsed = false; else total += n;
    });

    const order = {
      order_id:       this._orderId,
      user_id:        profile?.id || null,
      buyer_name:     name,
      buyer_phone:    phone,
      buyer_email:    this.manager.auth.user?.email || null,
      buyer_address:  address,
      artworks:       this._cart,
      total:          allParsed ? String(total) : null,
      payment_method: 'bank_transfer',
      status:         'placed',
    };

    const { error } = await supabase.from('orders').insert(order);

    if (error) {
      console.error('Order insert error:', error);
      if (btn) { btn.disabled = false; btn.textContent = '✦ Xác nhận đặt hàng →'; }
      alert('Có lỗi khi đặt hàng. Vui lòng thử lại.');
      return;
    }

    localStorage.removeItem('gallery_cart');
    window.dispatchEvent(new CustomEvent('cart-updated'));

    this.manager.navigateTo('my-orders');
  }
}