import * as THREE from 'three';
import { BaseScene } from './BaseScene.js';
import { HEADER_H } from '../core/SceneManager.js';
import { supabase } from '../utils/supabase.js';
import { VN_DISTRICTS } from '../data/vn-districts.js';

function parsePrice(str) {
  if (!str) return NaN;
  const digits = str.replace(/[^\d]/g, '');
  if (!digits) return NaN;
  return parseInt(digits, 10);
}
function formatPrice(n) {
  return n.toLocaleString('vi-VN') + ' ₫';
}

// ── Vietnam regions for SPX zone lookup ─────────────────────────────────────
const REGION_NORTH = [
  'Hà Nội','Hải Phòng','Quảng Ninh','Hải Dương','Hưng Yên','Thái Bình','Nam Định',
  'Ninh Bình','Hà Nam','Vĩnh Phúc','Bắc Ninh','Bắc Giang','Thái Nguyên','Phú Thọ',
  'Lạng Sơn','Cao Bằng','Bắc Kạn','Tuyên Quang','Hà Giang','Lào Cai','Yên Bái',
  'Sơn La','Điện Biên','Lai Châu','Hòa Bình',
];
const REGION_CENTRAL = [
  'Thanh Hóa','Nghệ An','Hà Tĩnh','Quảng Bình','Quảng Trị','Thừa Thiên Huế','Đà Nẵng',
  'Quảng Nam','Quảng Ngãi','Bình Định','Phú Yên','Khánh Hòa','Ninh Thuận','Bình Thuận',
  'Kon Tum','Gia Lai','Đắk Lắk','Đắk Nông','Lâm Đồng',
];
const REGION_SOUTH = [
  'TP. Hồ Chí Minh','Bình Dương','Đồng Nai','Bà Rịa - Vũng Tàu','Long An','Tiền Giang',
  'Bến Tre','Đồng Tháp','An Giang','Kiên Giang','Cần Thơ','Hậu Giang','Sóc Trăng',
  'Bạc Liêu','Cà Mau','Vĩnh Long','Trà Vinh','Tây Ninh','Bình Phước',
];


function getRegion(province) {
  if (REGION_NORTH.includes(province)) return 'north';
  if (REGION_CENTRAL.includes(province)) return 'central';
  if (REGION_SOUTH.includes(province)) return 'south';
  return '';
}

// SPX Express rates (VND) — bảng giá bưu chính áp dụng từ 01/02/2024
// Nội thành = Ngoại thành (cùng giá), mỗi 0.5kg tiếp theo tính thêm từ mốc >2kg
function calcSPXFee(totalWeightKg, buyerProvince, sellerProvince) {
  const weight = Math.max(0.1, totalWeightKg);

  let zone = 'inter-region';
  if (!buyerProvince || !sellerProvince) {
    zone = 'inter-region';
  } else if (buyerProvince === sellerProvince) {
    zone = 'same-province';
  } else {
    const br = getRegion(buyerProvince);
    const sr = getRegion(sellerProvince);
    zone = (br && sr && br === sr) ? 'same-region' : 'inter-region';
  }

  // b1=0-1kg, b2=1-1.5kg, b3=1.5-2kg, extra=mỗi 0.5kg tiếp theo
  const rates = {
    'same-province': { b1: 18000, b2: 20500, b3: 23000, extra: 2500 },
    'same-region':   { b1: 22000, b2: 24500, b3: 27000, extra: 2500 },
    'inter-region':  { b1: 22000, b2: 27000, b3: 30000, extra: 5000 },
  };
  const r = rates[zone];
  let fee;
  if (weight <= 1)        fee = r.b1;
  else if (weight <= 1.5) fee = r.b2;
  else if (weight <= 2)   fee = r.b3;
  else                    fee = r.b3 + Math.ceil((weight - 2) / 0.5) * r.extra;

  const zoneLabel = { 'same-province': 'Nội tỉnh', 'same-region': 'Nội miền', 'inter-region': 'Liên miền' };
  return { fee, zone, zoneLabel: zoneLabel[zone] };
}

export class CheckoutScene extends BaseScene {
  async init() {
    await this.manager.auth.ready();
    if (this._disposed) return;

    if (!this.manager.auth.isLoggedIn) { this.manager.navigateTo('login'); return; }

    this._cart = JSON.parse(localStorage.getItem('gallery_cart') || '[]');
    this._shippingFee = 0;
    this._artistProvince = '';

    this.threeScene.background = new THREE.Color(0xF1FAFF);
    this.camera.position.set(0, 0, 5);
    this.threeScene.add(new THREE.AmbientLight(0xffffff, 0.1));

    this._buildOverlay();
  }

  _totalWeight() {
    return this._cart.reduce((sum, item) => sum + (parseFloat(item.weight) || 0), 0);
  }

  _onProvinceChange() {
    const province = document.getElementById('co-province')?.value || '';
    const districtSel = document.getElementById('co-district');
    if (!districtSel) return;
    if (!province) {
      districtSel.innerHTML = '<option value="">-- Chọn tỉnh trước --</option>';
      districtSel.disabled = true;
    } else {
      const districts = VN_DISTRICTS[province] || [];
      districtSel.innerHTML = '<option value="">-- Chọn quận/huyện --</option>' +
        districts.map(d => `<option value="${d}">${d}</option>`).join('');
      districtSel.disabled = false;
    }
    this._recalcShipping();
  }

  _recalcShipping() {
    const buyerProvince = document.getElementById('co-province')?.value || '';
    const totalWeight = this._totalWeight();
    const result = calcSPXFee(totalWeight, buyerProvince, this._artistProvince);
    this._shippingFee = result.fee;

    const feeEl = document.getElementById('co-ship-fee');
    const feeRow = document.getElementById('co-ship-row');
    const totalEl = document.getElementById('co-grand-total');
    const noteEl = document.getElementById('co-ship-note');

    if (feeRow) feeRow.style.display = totalWeight > 0 ? 'flex' : 'none';
    if (feeEl) feeEl.textContent = formatPrice(result.fee);

    if (noteEl && totalWeight > 0) {
      const zone = buyerProvince && this._artistProvince
        ? `${result.zoneLabel} · ${totalWeight.toFixed(1)} kg`
        : `${totalWeight.toFixed(1)} kg · (chọn tỉnh/thành để xác định vùng)`;
      noteEl.textContent = zone;
    }

    // Update grand total
    let itemTotal = 0, allParsed = true;
    this._cart.forEach(item => {
      const n = parsePrice(item.price || '');
      if (isNaN(n)) allParsed = false; else itemTotal += n;
    });
    if (totalEl) {
      totalEl.textContent = allParsed
        ? formatPrice(itemTotal + this._shippingFee)
        : '— (Liên hệ)';
    }
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

    let itemTotal = 0, allParsed = true;
    this._cart.forEach(item => {
      const n = parsePrice(item.price || '');
      if (isNaN(n)) allParsed = false; else itemTotal += n;
    });
    const itemTotalStr = allParsed ? formatPrice(itemTotal) : '— (Liên hệ)';
    const totalWeight = this._totalWeight();

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
        .co-row{display:flex;justify-content:space-between;align-items:center;padding:8px 0}
        .co-row-label{color:#182D58;font-family:'Montserrat',sans-serif;font-size:11px;letter-spacing:.1em;opacity:.7}
        .co-row-val{color:#182D58;font-family:'Montserrat',sans-serif;font-size:13px;font-weight:600}
        .co-total{display:flex;justify-content:space-between;align-items:center;padding:14px 0 0;margin-top:4px;border-top:2px solid rgba(24,45,88,.15)}
        .co-total-label{color:#182D58;font-family:'Montserrat',sans-serif;font-size:11px;letter-spacing:.16em;text-transform:uppercase;font-weight:700}
        .co-total-value{color:#182D58;font-family:'Montserrat',sans-serif;font-size:24px;letter-spacing:.04em;font-weight:800}
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
        .co-warning{background:rgba(255,180,0,.08);border:1px solid rgba(255,180,0,.3);border-radius:4px;padding:14px 16px;margin-top:4px}
        .co-warning-title{color:#b87800;font-family:'Montserrat',sans-serif;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px}
        .co-warning-body{color:#8a5a00;font-family:'Montserrat',sans-serif;font-size:12px;line-height:1.8;letter-spacing:.04em}
        .co-confirm{width:100%;padding:14px;background:linear-gradient(135deg,rgba(18,47,106,1),rgba(118,170,171,.89));border:1px solid rgba(255,255,255,.3);color:#fff;font-family:'Montserrat',sans-serif;font-size:14px;font-weight:bold;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;border-radius:4px;transition:all .25s;margin-top:4px}
        .co-confirm:hover{box-shadow:0 4px 24px rgba(118,170,171,.4)}
        .co-confirm:disabled{opacity:.4;cursor:default}
        .co-ship-hint{color:#182D58;font-family:'Montserrat',sans-serif;font-size:10px;letter-spacing:.06em;margin-top:6px;opacity:.55}
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
              <div style="text-align:right">
                <div class="co-item-price">${item.price || '—'}</div>
                ${item.weight ? `<div style="color:#182D58;font-family:'Montserrat',sans-serif;font-size:10px;opacity:.45;margin-top:2px">${parseFloat(item.weight).toFixed(1)} kg</div>` : ''}
              </div>
            </div>
          `).join('')}

          <div class="co-row" style="border-top:1px solid rgba(24,45,88,.08);margin-top:8px">
            <span class="co-row-label">Tổng tiền hàng</span>
            <span class="co-row-val">${itemTotalStr}</span>
          </div>
          <div class="co-row" id="co-ship-row" style="display:${totalWeight > 0 ? 'flex' : 'none'}">
            <span class="co-row-label">Phí vận chuyển (SPX Express)<br><span id="co-ship-note" style="font-size:10px;opacity:.55;font-family:'Montserrat',sans-serif;letter-spacing:.04em"></span></span>
            <span class="co-row-val" id="co-ship-fee">—</span>
          </div>
          <div class="co-total">
            <span class="co-total-label">Tổng thanh toán</span>
            <span class="co-total-value" id="co-grand-total">${itemTotalStr}</span>
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
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
            <div class="co-field" style="margin-bottom:0">
              <div class="co-label">Tỉnh / Thành phố *</div>
              <select id="co-province" class="co-input" style="cursor:pointer;background-image:url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 10 6%22><path d=%22M0 0l5 6 5-6z%22 fill=%22%23182D58%22 opacity=%22.4%22/></svg>');background-repeat:no-repeat;background-position:right 10px center;background-size:10px;appearance:none;padding-right:28px">
                <option value="">-- Chọn tỉnh/thành --</option>
                ${Object.keys(VN_DISTRICTS).map(p => `<option value="${p}">${p}</option>`).join('')}
              </select>
              <div id="co-province-err" class="co-err">Vui lòng chọn tỉnh/thành</div>
            </div>
            <div class="co-field" style="margin-bottom:0">
              <div class="co-label">Quận / Huyện *</div>
              <select id="co-district" class="co-input" style="cursor:pointer;background-image:url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 10 6%22><path d=%22M0 0l5 6 5-6z%22 fill=%22%23182D58%22 opacity=%22.4%22/></svg>');background-repeat:no-repeat;background-position:right 10px center;background-size:10px;appearance:none;padding-right:28px" disabled>
                <option value="">-- Chọn tỉnh trước --</option>
              </select>
              <div id="co-district-err" class="co-err">Vui lòng chọn quận/huyện</div>
            </div>
          </div>
          <div class="co-field">
            <div class="co-label">Phường / Xã</div>
            <input id="co-ward" class="co-input" placeholder="VD: Phường Bến Nghé" />
          </div>
          <div class="co-field" style="margin-bottom:0">
            <div class="co-label">Số nhà, đường *</div>
            <input id="co-street" class="co-input" placeholder="VD: 123 Nguyễn Huệ" />
            <div id="co-street-err" class="co-err">Vui lòng nhập số nhà, đường</div>
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
          <div class="co-warning" style="margin-top:14px">
            <div class="co-warning-title">⚠ Lưu ý thanh toán</div>
            <div class="co-warning-body">
              Vui lòng <b>chuyển khoản và gửi minh chứng thanh toán</b> cho nghệ sĩ ngay sau khi bấm "Xác nhận đặt hàng".<br>
              Nếu sau <b>24 giờ</b> không nhận được tiền chuyển khoản, nghệ sĩ có quyền <b>từ chối đơn hàng</b>.
            </div>
          </div>
        </div>

        <button id="co-confirm" class="co-confirm">✦ Xác nhận đặt hàng →</button>
      </div>
    `;

    const profile = this.manager.auth.profile;
    if (profile?.name) document.getElementById('co-name').value = profile.name;

    document.getElementById('co-province').addEventListener('change', () => this._onProvinceChange());
    document.getElementById('co-confirm').addEventListener('click', () => this._placeOrder());

    this._loadArtistBankInfo();
  }

  async _loadArtistBankInfo() {
    const artistIds   = [...new Set(this._cart.map(it => it.artistId).filter(Boolean))];
    const artistNames = [...new Set(this._cart.map(it => it.artist).filter(Boolean))];
    if (!artistIds.length && !artistNames.length) {
      const el = document.getElementById('co-bank-name');
      if (el) el.textContent = '— (không xác định nghệ sĩ)';
      return;
    }

    let query = supabase
      .from('profiles')
      .select('id, display_name, bank_name, bank_account_number, bank_account_holder, province');
    if (artistIds.length) {
      query = query.in('id', artistIds);
    } else {
      query = query.in('display_name', artistNames);
    }
    const { data, error } = await query;

    if (this._disposed) return;

    if (error) {
      console.error('Bank info query error:', error);
      const el = document.getElementById('co-bank-name');
      if (el) el.textContent = '— (lỗi tải dữ liệu)';
      return;
    }

    const all = data || [];
    // Store artist province for shipping calc (use first artist with province)
    const withProvince = all.find(p => p.province);
    if (withProvince) {
      this._artistProvince = withProvince.province;
      this._recalcShipping();
    }

    const artists = all.filter(p => p.bank_name || p.bank_account_number);

    if (!artists.length) {
      const el = document.getElementById('co-bank-name');
      if (el) el.textContent = '— (nghệ sĩ chưa cập nhật thông tin ngân hàng)';
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
      <div class="co-warning" style="margin-top:14px">
        <div class="co-warning-title">⚠ Lưu ý thanh toán</div>
        <div class="co-warning-body">
          Vui lòng <b>chuyển khoản và gửi minh chứng thanh toán</b> cho nghệ sĩ ngay sau khi bấm "Xác nhận đặt hàng".<br>
          Nếu sau <b>24 giờ</b> không nhận được tiền chuyển khoản, nghệ sĩ có quyền <b>từ chối đơn hàng</b>.
        </div>
      </div>
    `;
  }

  async _placeOrder() {
    const nameEl     = document.getElementById('co-name');
    const phoneEl    = document.getElementById('co-phone');
    const provinceEl = document.getElementById('co-province');
    const districtEl = document.getElementById('co-district');
    const wardEl     = document.getElementById('co-ward');
    const streetEl   = document.getElementById('co-street');

    const name     = nameEl.value.trim();
    const phone    = phoneEl.value.trim();
    const province = provinceEl.value;
    const district = districtEl.value;
    const ward     = wardEl?.value.trim() || '';
    const street   = streetEl.value.trim();

    let valid = true;
    const check = (el, errId, val) => {
      const err = document.getElementById(errId);
      if (!val) { el.classList.add('err'); if (err) err.style.display = 'block'; valid = false; }
      else { el.classList.remove('err'); if (err) err.style.display = 'none'; }
    };
    check(nameEl,     'co-name-err',     name);
    check(phoneEl,    'co-phone-err',    phone);
    check(provinceEl, 'co-province-err', province);
    check(districtEl, 'co-district-err', district);
    check(streetEl,   'co-street-err',   street);
    if (!valid) return;

    const addressParts = [street, ward, district, province].filter(Boolean);
    const address = addressParts.join(', ');

    this._recalcShipping();

    const btn = document.getElementById('co-confirm');
    if (btn) { btn.disabled = true; btn.textContent = 'Đang xử lý...'; }

    const profile = this.manager.auth.profile;
    let itemTotal = 0, allParsed = true;
    this._cart.forEach(item => {
      const n = parsePrice(item.price || '');
      if (isNaN(n)) allParsed = false; else itemTotal += n;
    });
    const grandTotal = allParsed ? itemTotal + this._shippingFee : null;

    const order = {
      order_id:       this._orderId,
      user_id:        profile?.id || null,
      buyer_name:     name,
      buyer_phone:    phone,
      buyer_email:    profile?.email || null,
      buyer_address:  address,
      artworks:       this._cart,
      total:          grandTotal !== null ? String(grandTotal) : null,
      payment_method: 'bank_transfer',
      status:         'placed',
      note:           this._shippingFee > 0 ? `Phí ship: ${formatPrice(this._shippingFee)} (SPX Express)` : null,
    };

    const { error } = await supabase.from('orders').insert(order);

    if (error) {
      console.error('Order insert error:', error);
      if (btn) { btn.disabled = false; btn.textContent = '✦ Xác nhận đặt hàng →'; }
      alert('Có lỗi khi đặt hàng. Vui lòng thử lại.\n\nChi tiết: ' + error.message);
      return;
    }

    localStorage.removeItem('gallery_cart');
    window.dispatchEvent(new CustomEvent('cart-updated'));

    this.manager.navigateTo('my-orders');
  }
}
