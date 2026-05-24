import * as THREE from 'three';
import { BaseScene } from './BaseScene.js';
import { HEADER_H } from '../core/SceneManager.js';
import { supabase } from '../utils/supabase.js';

const STEPS = [
  { key: 'placed',    label: 'Đặt hàng',       icon: '📦' },
  { key: 'confirmed', label: 'Xác nhận',        icon: '✅' },
  { key: 'packing',   label: 'Đóng gói',        icon: '🎁' },
  { key: 'shipping',  label: 'Vận chuyển',      icon: '🚚' },
  { key: 'delivered', label: 'Giao thành công', icon: '🏠' },
];

const STATUS_INDEX = { placed: 0, confirmed: 1, packing: 2, shipping: 3, delivering: 3, delivered: 4 };

const CHIP_STYLE = {
  placed:    'background:rgba(24,45,88,.08);border:1px solid rgba(24,45,88,.25);color:#182D58',
  confirmed: 'background:rgba(90,150,200,.1);border:1px solid rgba(90,150,200,.3);color:#3a7bbf',
  packing:   'background:rgba(118,170,171,.12);border:1px solid rgba(118,170,171,.35);color:#4d9ea0',
  shipping:  'background:rgba(60,120,200,.1);border:1px solid rgba(60,120,200,.3);color:#3a70c8',
  delivering: 'background:rgba(118,170,171,.12);border:1px solid rgba(118,170,171,.35);color:#4d9ea0',
  delivered: 'background:rgba(90,170,122,.1);border:1px solid rgba(90,170,122,.3);color:#4a9a6a',
  cancelled: 'background:rgba(200,50,50,.08);border:1px solid rgba(200,50,50,.25);color:#c0392b',
};

export class OrderTrackingScene extends BaseScene {
  async init() {
    await this.manager.auth.ready();
    if (this._disposed) return;

    if (!this.manager.auth.isLoggedIn) { this.manager.navigateTo('login'); return; }

    this.threeScene.background = new THREE.Color(0xF1FAFF);
    this.camera.position.set(0, 0, 5);
    this.threeScene.add(new THREE.AmbientLight(0xffffff, 0.1));

    const overlay = document.createElement('div');
    overlay.id = 'ot-overlay';
    overlay.style.cssText = `position:fixed;top:${HEADER_H}px;left:0;right:0;bottom:0;overflow-y:auto;z-index:100;background:#F1FAFF;font-family:'Montserrat',sans-serif;padding:40px;box-sizing:border-box;`;
    document.body.appendChild(overlay);
    this._el(overlay);

    await this._render();
  }

  async _render() {
    const overlay = document.getElementById('ot-overlay');
    if (!overlay) return;

    overlay.innerHTML = `<div style="text-align:center;padding:80px 0;color:#182D58;font-family:'Montserrat',sans-serif;font-size:13px;letter-spacing:.14em;text-transform:uppercase;opacity:.5">Đang tải...</div>`;

    const userId = this.manager.auth.user?.id;
    const [{ data: ordersData }, { data: complaintsData }] = await Promise.all([
      supabase.from('orders').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('complaints').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    ]);
    this._orders     = ordersData    || [];
    this._complaints = complaintsData || [];

    // Tự động xác nhận sau 5 ngày nếu người mua không phản hồi
    for (const order of this._orders) {
      if (order.status === 'delivering' && order.seller_delivered_at) {
        const elapsed = Date.now() - new Date(order.seller_delivered_at).getTime();
        if (elapsed >= 5 * 24 * 60 * 60 * 1000) {
          await supabase.from('orders').update({ status: 'delivered' }).eq('order_id', order.order_id);
          order.status = 'delivered';
        }
      }
    }

    const ordersHtml = this._orders.length === 0
      ? `<div style="text-align:center;padding:80px 0;color:#182D58;font-family:'Montserrat',sans-serif;font-size:13px;letter-spacing:.14em;text-transform:uppercase;opacity:.5">Chưa có đơn hàng nào</div>`
      : this._orders.map(o => this._orderCard(o)).join('');

    overlay.innerHTML = `
      <style>
        .ot-wrap{max-width:720px;margin:0 auto}
        .ot-heading{color:#2222C6;font-family:'Montserrat',sans-serif;font-size:40px;font-weight:800;line-height:1.1;margin-bottom:32px}
        .ot-card{background:#fff;border:1px solid rgba(24,45,88,.12);border-radius:6px;padding:24px;margin-bottom:20px;box-shadow:0 2px 8px rgba(24,45,88,.06)}
        .ot-card-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;flex-wrap:wrap;gap:10px}
        .ot-id{color:#182D58;font-family:'Montserrat',sans-serif;font-size:14px;letter-spacing:.1em;font-weight:700}
        .ot-date{color:#182D58;font-family:'Montserrat',sans-serif;font-size:11px;letter-spacing:.08em;margin-top:4px;opacity:.6}
        .ot-chip{padding:4px 10px;border-radius:3px;font-family:'Montserrat',sans-serif;font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:600}
        .ot-timeline{display:flex;align-items:flex-start;margin:20px 0 24px}
        .ot-step{display:flex;flex-direction:column;align-items:center;flex:1;position:relative}
        .ot-line{position:absolute;top:14px;left:50%;right:-50%;height:2px;z-index:0}
        .ot-step:last-child .ot-line{display:none}
        .ot-dot{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;z-index:1;border:2px solid;position:relative}
        .ot-step-label{font-family:'Montserrat',sans-serif;font-size:9px;letter-spacing:.08em;margin-top:7px;text-align:center;text-transform:uppercase;line-height:1.4}
        .ot-item{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(24,45,88,.07);font-family:'Montserrat',sans-serif;font-size:12px}
        .ot-item:last-child{border-bottom:none}
        .ot-item-name{color:#182D58}
        .ot-item-price{color:#182D58;white-space:nowrap;font-weight:600}
        .ot-delivery{margin-top:16px;padding-top:14px;border-top:1px solid rgba(24,45,88,.08);font-family:'Montserrat',sans-serif;font-size:11px;color:#182D58;letter-spacing:.08em;line-height:1.8;opacity:.75}
        .ot-delivery b{color:#182D58;opacity:1;font-weight:700}
        .ot-actions{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}
        .ot-btn-cancel{padding:7px 16px;font-family:'Montserrat',sans-serif;font-size:11px;letter-spacing:.12em;text-transform:uppercase;border-radius:3px;cursor:pointer;background:rgba(200,50,50,.06);border:1px solid rgba(200,50,50,.3);color:#c0392b;transition:all .2s;font-weight:600}
        .ot-btn-cancel:hover{background:rgba(200,50,50,.14)}
        .ot-btn-cancel:disabled{opacity:.5;cursor:default}
        .ot-track-box{margin-top:16px;padding:14px 16px;background:rgba(118,170,171,.08);border:1px solid rgba(118,170,171,.3);border-radius:5px}
        .ot-track-label{font-family:'Montserrat',sans-serif;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#182D58;opacity:.6;margin-bottom:6px;font-weight:600}
        .ot-track-code{font-family:'Montserrat',sans-serif;font-size:16px;font-weight:700;letter-spacing:.08em;color:#182D58}
        .ot-track-hint{font-family:'Montserrat',sans-serif;font-size:11px;color:#182D58;opacity:.5;margin-top:4px;letter-spacing:.04em}
        .ot-btn-complain{padding:7px 16px;font-family:'Montserrat',sans-serif;font-size:11px;letter-spacing:.12em;text-transform:uppercase;border-radius:3px;cursor:pointer;background:rgba(200,100,0,.06);border:1px solid rgba(200,100,0,.3);color:#b86000;transition:all .2s;font-weight:600}
        .ot-btn-complain:hover{background:rgba(200,100,0,.13)}
        .ot-btn-complain:disabled{opacity:.5;cursor:default}
        .ot-complained{padding:8px 12px;background:rgba(200,100,0,.07);border:1px solid rgba(200,100,0,.25);border-radius:3px;font-family:'Montserrat',sans-serif;font-size:11px;color:#b86000;letter-spacing:.06em}
        .ot-proof-section{margin-top:16px;padding-top:14px;border-top:1px solid rgba(24,45,88,.08)}
        .ot-proof-label{font-family:'Montserrat',sans-serif;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#182D58;opacity:.55;margin-bottom:8px;font-weight:600}
        .ot-proof-hint{font-family:'Montserrat',sans-serif;font-size:11px;color:#182D58;opacity:.5;letter-spacing:.04em;margin-bottom:10px}
        .ot-proof-img{max-width:260px;max-height:180px;object-fit:contain;border-radius:5px;border:1px solid rgba(24,45,88,.15);display:block;cursor:pointer}
        .ot-btn-upload{display:inline-block;padding:7px 16px;font-family:'Montserrat',sans-serif;font-size:11px;letter-spacing:.1em;text-transform:uppercase;border-radius:3px;cursor:pointer;background:rgba(24,45,88,.06);border:1px solid rgba(24,45,88,.2);color:#182D58;transition:all .2s;font-weight:600}
        .ot-btn-upload:hover{background:rgba(24,45,88,.13)}
        .ot-deliver-notice{margin-top:16px;padding:14px 16px;background:rgba(118,170,171,.08);border:1px solid rgba(118,170,171,.3);border-radius:5px;font-family:'Montserrat',sans-serif;font-size:12px;color:#182D58;letter-spacing:.04em;line-height:1.7}
        .ot-deliver-notice strong{color:#c0392b}
        .ot-auto-confirm{font-family:'Montserrat',sans-serif;font-size:11px;color:#182D58;opacity:.45;letter-spacing:.06em;margin-top:8px}
        .ot-btn-confirm-received{padding:9px 20px;font-family:'Montserrat',sans-serif;font-size:11px;letter-spacing:.12em;text-transform:uppercase;border-radius:3px;cursor:pointer;background:rgba(90,170,122,.12);border:1px solid rgba(90,170,122,.4);color:#3d8a5e;transition:all .2s;font-weight:700}
        .ot-btn-confirm-received:hover{background:rgba(90,170,122,.22)}
        .ot-btn-confirm-received:disabled{opacity:.5;cursor:default}
        .ot-complaint-section{margin-top:16px;padding:16px;background:rgba(200,100,0,.04);border:1px solid rgba(200,100,0,.2);border-radius:6px}
        .ot-complaint-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:6px}
        .ot-complaint-title{font-family:'Montserrat',sans-serif;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#b86000}
        .ot-complaint-chip-open{padding:3px 9px;border-radius:3px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:600;background:rgba(200,100,0,.1);border:1px solid rgba(200,100,0,.3);color:#b86000}
        .ot-complaint-chip-resolved{padding:3px 9px;border-radius:3px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:600;background:rgba(90,170,122,.1);border:1px solid rgba(90,170,122,.3);color:#4a9a6a}
        .ot-complaint-chip-dismissed{padding:3px 9px;border-radius:3px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:600;background:rgba(24,45,88,.08);border:1px solid rgba(24,45,88,.2);color:#182D58}
        .ot-complaint-desc{font-family:'Montserrat',sans-serif;font-size:12px;color:#182D58;opacity:.75;letter-spacing:.03em;line-height:1.6;margin-bottom:8px;white-space:pre-wrap}
        .ot-complaint-shot{max-width:200px;max-height:140px;object-fit:contain;border-radius:4px;border:1px solid rgba(24,45,88,.15);display:block;cursor:pointer;margin-bottom:8px}
        .ot-complaint-admin{margin-top:10px;padding:10px 12px;background:#fff;border-radius:4px;border-left:3px solid #4a9a6a}
        .ot-complaint-admin-label{font-family:'Montserrat',sans-serif;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#4a9a6a;font-weight:700;margin-bottom:4px}
        .ot-complaint-admin-note{font-family:'Montserrat',sans-serif;font-size:12px;color:#182D58;line-height:1.6;letter-spacing:.03em}
      </style>

      <div class="ot-wrap">
        <div class="ot-heading">Đơn hàng của tôi</div>
        ${ordersHtml}
      </div>
    `;

    overlay.querySelectorAll('.ot-btn-cancel[data-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        await supabase.from('orders').update({ status: 'cancelled' }).eq('order_id', btn.dataset.id);
        await this._render();
      });
    });

    overlay.querySelectorAll('.ot-btn-confirm-received[data-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Đang xác nhận...';
        await supabase.from('orders').update({ status: 'delivered' }).eq('order_id', btn.dataset.id);
        await this._render();
      });
    });

    overlay.querySelectorAll('.ot-btn-complain[data-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const order = this._orders.find(o => o.order_id === btn.dataset.id);
        if (order) this._openComplaintModal(order);
      });
    });

    overlay.querySelectorAll('input[type="file"][data-orderid]').forEach(input => {
      input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) return;
        const orderId = input.dataset.orderid;
        const label = overlay.querySelector(`label[for="ot-proof-${orderId}"]`);
        if (label) { label.textContent = 'Đang tải lên...'; label.style.pointerEvents = 'none'; label.style.opacity = '0.6'; }

        const ext  = file.name.split('.').pop() || 'jpg';
        const path = `payment-proofs/${orderId}_${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('patbk').upload(path, file, { upsert: true });
        if (upErr) {
          if (label) { label.textContent = '⚠ Lỗi tải lên — thử lại'; label.style.pointerEvents = ''; label.style.opacity = '1'; }
          return;
        }
        const { data: { publicUrl } } = supabase.storage.from('patbk').getPublicUrl(path);
        await supabase.from('orders').update({ payment_proof_url: publicUrl }).eq('order_id', orderId);
        await this._render();
      });
    });
  }

  _openComplaintModal(order) {
    const existing = document.getElementById('ot-complaint-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'ot-complaint-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.52);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:\'Montserrat\',sans-serif;';

    modal.innerHTML = `
      <div style="background:#fff;border-radius:8px;padding:32px;max-width:480px;width:90%;box-shadow:0 12px 40px rgba(0,0,0,0.22);position:relative">
        <button id="ot-modal-close" style="position:absolute;top:12px;right:16px;background:none;border:none;font-size:18px;cursor:pointer;color:#182D58;opacity:.4;line-height:1">✕</button>
        <div style="color:#182D58;font-size:18px;font-weight:800;letter-spacing:.05em;margin-bottom:4px">Gửi khiếu nại</div>
        <div style="color:#182D58;font-size:11px;opacity:.45;letter-spacing:.08em;margin-bottom:22px">Đơn hàng # ${order.order_id}</div>
        <label style="display:block;color:#182D58;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px">Mô tả vấn đề <span style="color:#c0392b">*</span></label>
        <textarea id="ot-complaint-desc" placeholder="Mô tả chi tiết vấn đề bạn gặp phải..." style="width:100%;box-sizing:border-box;height:110px;padding:10px 12px;border:1px solid rgba(24,45,88,.2);border-radius:5px;font-family:'Montserrat',sans-serif;font-size:13px;color:#182D58;resize:vertical;outline:none;margin-bottom:16px"></textarea>
        <label style="display:block;color:#182D58;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">Ảnh chụp màn hình <span style="color:#182D58;opacity:.4;font-weight:400">(tùy chọn)</span></label>
        <div style="margin-bottom:18px">
          <label for="ot-complaint-file" id="ot-complaint-file-label" style="display:inline-block;padding:7px 16px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;border-radius:3px;cursor:pointer;background:rgba(24,45,88,.06);border:1px solid rgba(24,45,88,.2);color:#182D58;font-weight:600">📎 Chọn ảnh</label>
          <span id="ot-complaint-file-name" style="margin-left:10px;font-size:11px;color:#182D58;opacity:.55;letter-spacing:.04em"></span>
          <input type="file" id="ot-complaint-file" accept="image/*" style="display:none" />
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button id="ot-modal-cancel" style="padding:9px 20px;font-family:'Montserrat',sans-serif;font-size:11px;letter-spacing:.12em;text-transform:uppercase;border-radius:3px;cursor:pointer;background:rgba(24,45,88,.06);border:1px solid rgba(24,45,88,.2);color:#182D58;font-weight:600">Hủy</button>
          <button id="ot-modal-submit" style="padding:9px 20px;font-family:'Montserrat',sans-serif;font-size:11px;letter-spacing:.12em;text-transform:uppercase;border-radius:3px;cursor:pointer;background:rgba(200,100,0,.1);border:1px solid rgba(200,100,0,.3);color:#b86000;font-weight:600">⚠ Gửi khiếu nại</button>
        </div>
        <div id="ot-modal-error" style="color:#c0392b;font-size:11px;letter-spacing:.06em;margin-top:10px;display:none"></div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('#ot-modal-close').addEventListener('click', close);
    modal.querySelector('#ot-modal-cancel').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    const fileInput = modal.querySelector('#ot-complaint-file');
    fileInput.addEventListener('change', () => {
      modal.querySelector('#ot-complaint-file-name').textContent = fileInput.files[0]?.name || '';
    });

    modal.querySelector('#ot-modal-submit').addEventListener('click', async () => {
      const desc = modal.querySelector('#ot-complaint-desc').value.trim();
      const errEl = modal.querySelector('#ot-modal-error');
      if (!desc) {
        errEl.textContent = 'Vui lòng mô tả vấn đề trước khi gửi.';
        errEl.style.display = 'block';
        return;
      }
      const submitBtn = modal.querySelector('#ot-modal-submit');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Đang gửi...';
      errEl.style.display = 'none';

      let screenshotUrl = null;
      const file = fileInput.files[0];
      if (file) {
        const ext  = file.name.split('.').pop() || 'jpg';
        const path = `complaint-screenshots/${order.order_id}_${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('patbk').upload(path, file, { upsert: true });
        if (!upErr) {
          const { data: { publicUrl } } = supabase.storage.from('patbk').getPublicUrl(path);
          screenshotUrl = publicUrl;
        }
      }

      const { error: insertErr } = await supabase.from('complaints').insert({
        order_id:       order.order_id,
        user_id:        this.manager.auth.user?.id || null,
        buyer_name:     order.buyer_name || '',
        description:    desc,
        screenshot_url: screenshotUrl,
      });

      if (insertErr) {
        console.error('Lỗi gửi khiếu nại:', insertErr);
        errEl.textContent = `Lỗi: ${insertErr.message || 'Không thể gửi khiếu nại, vui lòng thử lại.'}`;
        errEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = '⚠ Gửi khiếu nại';
        return;
      }

      await supabase.from('orders').update({ is_complained: true }).eq('order_id', order.order_id);

      close();
      await this._render();
    });
  }

  _orderCard(order) {
    const date = new Date(order.created_at).toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const statusLabel = STEPS.find(s => s.key === order.status)?.label || order.status;
    const chipStyle   = CHIP_STYLE[order.status] || CHIP_STYLE.placed;

    const itemsHtml = (order.artworks || []).map(item => `
      <div class="ot-item">
        <span class="ot-item-name">${item.title || 'Untitled'}</span>
        <span class="ot-item-price">${item.price || '—'}</span>
      </div>
    `).join('');

    const proofHtml = order.status !== 'cancelled' ? `
      <div class="ot-proof-section">
        <div class="ot-proof-label">Minh chứng chuyển khoản</div>
        ${order.payment_proof_url
          ? `<a href="${order.payment_proof_url}" target="_blank" rel="noopener">
               <img src="${order.payment_proof_url}" class="ot-proof-img" />
             </a>
             <label for="ot-proof-${order.order_id}" class="ot-btn-upload" style="margin-top:8px;display:inline-block">↺ Tải lại ảnh khác</label>`
          : `<div class="ot-proof-hint">Vui lòng tải lên ảnh chụp màn hình hoặc biên lai chuyển khoản</div>
             <label for="ot-proof-${order.order_id}" class="ot-btn-upload">📤 Tải minh chứng lên</label>`
        }
        <input type="file" id="ot-proof-${order.order_id}" accept="image/*" style="display:none" data-orderid="${order.order_id}" />
      </div>
    ` : (order.payment_proof_url ? `
      <div class="ot-proof-section">
        <div class="ot-proof-label">Minh chứng chuyển khoản</div>
        <a href="${order.payment_proof_url}" target="_blank" rel="noopener">
          <img src="${order.payment_proof_url}" class="ot-proof-img" />
        </a>
      </div>
    ` : '');

    const totalFormatted = order.total
      ? Number(order.total).toLocaleString('vi-VN') + ' ₫'
      : '—';
    const deliveryHtml = `
      <div class="ot-delivery">
        <b>Người nhận:</b> ${order.buyer_name || '—'} &nbsp;·&nbsp; ${order.buyer_phone || ''}<br>
        <b>Địa chỉ:</b> ${order.buyer_address || '—'}<br>
        ${order.note ? `<b>Phí vận chuyển:</b> ${order.note}<br>` : ''}
        <b>Tổng thanh toán:</b> <span style="color:#182D58;font-weight:700;opacity:1">${totalFormatted}</span>
      </div>
    `;

    if (order.status === 'cancelled') {
      return `
        <div class="ot-card">
          <div class="ot-card-head">
            <div>
              <div class="ot-id"># ${order.order_id}</div>
              <div class="ot-date">${date}</div>
            </div>
            <span class="ot-chip" style="${chipStyle}">Đã hủy</span>
          </div>
          <div>${itemsHtml}</div>
          ${deliveryHtml}
          ${proofHtml}
        </div>
      `;
    }

    const stepIdx = STATUS_INDEX[order.status] ?? 0;
    const timelineHtml = STEPS.map((step, i) => {
      const done   = i <= stepIdx;
      const active = i === stepIdx;
      const dotBg     = done   ? '#182D58'                     : 'transparent';
      const dotBorder = done   ? '#182D58'                     : 'rgba(24,45,88,.15)';
      const labelColor = done  ? '#182D58'                     : 'rgba(24,45,88,.35)';
      const lineColor  = i < stepIdx ? '#76AAAB'               : 'rgba(24,45,88,.1)';
      const dotContent = active ? step.icon : (done ? '✓' : '');
      const glow = active ? 'box-shadow:0 0 10px rgba(118,170,171,.6)' : '';
      return `
        <div class="ot-step">
          <div class="ot-line" style="background:${lineColor}"></div>
          <div class="ot-dot" style="background:${dotBg};border-color:${dotBorder};${glow}">${dotContent}</div>
          <div class="ot-step-label" style="color:${labelColor}">${step.label}</div>
        </div>
      `;
    }).join('');

    const trackingBox = order.tracking_code
      ? `<div class="ot-track-box">
           <div class="ot-track-label">Mã vận đơn SPX</div>
           <div class="ot-track-code">${order.tracking_code}</div>
           <div class="ot-track-hint">Dùng mã này để theo dõi đơn hàng trên website SPX Express</div>
         </div>`
      : '';

    const canComplain = ['confirmed', 'packing', 'shipping', 'delivering'].includes(order.status);
    const complainBtn = canComplain
      ? `<button class="ot-btn-complain" data-id="${order.order_id}">⚠ Khiếu nại</button>`
      : '';

    const deliverConfirmHtml = order.status === 'delivering' ? (() => {
      let countdownHtml = '';
      if (order.seller_delivered_at) {
        const deadline  = new Date(order.seller_delivered_at).getTime() + 5 * 24 * 60 * 60 * 1000;
        const remaining = Math.max(0, deadline - Date.now());
        const days  = Math.floor(remaining / (24 * 60 * 60 * 1000));
        const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        countdownHtml = `<div class="ot-auto-confirm">⏱ Tự động xác nhận hoàn tất sau: ${days} ngày ${hours} giờ</div>`;
      }
      return `
        <div class="ot-deliver-notice">
          🚚 Người bán đã xác nhận giao hàng.<br>
          Vui lòng kiểm tra kỹ sản phẩm trước khi bấm xác nhận.<br>
          <strong>Sau khi bấm "Đã nhận hàng", bạn sẽ không thể khiếu nại nữa.</strong>
        </div>
        ${countdownHtml}
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="ot-btn-confirm-received" data-id="${order.order_id}">✓ Đã nhận được hàng</button>
          ${complainBtn}
        </div>
      `;
    })() : '';

    const orderComplaints = (this._complaints || []).filter(c => c.order_id === order.order_id);
    const complaintSection = orderComplaints.length > 0 ? orderComplaints.map((c, idx) => {
      const chipClass = c.status === 'resolved'  ? 'ot-complaint-chip-resolved'
                      : c.status === 'dismissed' ? 'ot-complaint-chip-dismissed'
                      : 'ot-complaint-chip-open';
      const chipLabel = c.status === 'resolved'  ? 'Đã giải quyết'
                      : c.status === 'dismissed' ? 'Bỏ qua'
                      : 'Chờ xử lý';
      const cDate = new Date(c.created_at).toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
      const shotHtml = c.screenshot_url
        ? `<a href="${c.screenshot_url}" target="_blank" rel="noopener"><img src="${c.screenshot_url}" class="ot-complaint-shot" /></a>`
        : '';
      const adminHtml = c.admin_note
        ? `<div class="ot-complaint-admin">
             <div class="ot-complaint-admin-label">Phản hồi từ Creatory</div>
             <div class="ot-complaint-admin-note">${c.admin_note}</div>
           </div>`
        : (c.status === 'resolved'
            ? `<div class="ot-complaint-admin">
                 <div class="ot-complaint-admin-label">Phản hồi từ Creatory</div>
                 <div class="ot-complaint-admin-note">Khiếu nại của bạn đã được xử lý.</div>
               </div>`
            : '');
      return `
        <div class="ot-complaint-section" style="${idx > 0 ? 'margin-top:10px' : ''}">
          <div class="ot-complaint-header">
            <div class="ot-complaint-title">Khiếu nại #${orderComplaints.length - idx}</div>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-family:'Montserrat',sans-serif;font-size:10px;color:#182D58;opacity:.4;letter-spacing:.04em">${cDate}</span>
              <span class="${chipClass}">${chipLabel}</span>
            </div>
          </div>
          <div class="ot-complaint-desc">${c.description || ''}</div>
          ${shotHtml}
          ${adminHtml}
        </div>`;
    }).join('') : '';

    const cancelBtn = order.status === 'placed'
      ? `<button class="ot-btn-cancel" data-id="${order.order_id}">✕ Hủy đơn</button>`
      : '';

    return `
      <div class="ot-card">
        <div class="ot-card-head">
          <div>
            <div class="ot-id"># ${order.order_id}</div>
            <div class="ot-date">${date}</div>
          </div>
          <span class="ot-chip" style="${chipStyle}">${statusLabel}</span>
        </div>
        <div class="ot-timeline">${timelineHtml}</div>
        <div>${itemsHtml}</div>
        ${deliveryHtml}
        ${trackingBox}
        ${proofHtml}
        ${deliverConfirmHtml}
        ${complaintSection}
        ${(cancelBtn || (complainBtn && order.status !== 'delivering')) ? `<div class="ot-actions">${cancelBtn}${order.status !== 'delivering' ? complainBtn : ''}</div>` : ''}
      </div>
    `;
  }
}
