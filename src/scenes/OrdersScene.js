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

const NEXT_STATUS = {
  placed:    'confirmed',
  confirmed: 'packing',
  packing:   'shipping',
  shipping:  'delivering',
};

const CHIP_STYLE = {
  placed:    'background:rgba(24,45,88,.08);border:1px solid rgba(24,45,88,.25);color:#182D58',
  confirmed: 'background:rgba(90,150,200,.1);border:1px solid rgba(90,150,200,.3);color:#3a7bbf',
  packing:   'background:rgba(118,170,171,.12);border:1px solid rgba(118,170,171,.35);color:#4d9ea0',
  shipping:  'background:rgba(60,120,200,.1);border:1px solid rgba(60,120,200,.3);color:#3a70c8',
  delivering: 'background:rgba(118,170,171,.12);border:1px solid rgba(118,170,171,.35);color:#4d9ea0',
  delivered: 'background:rgba(90,170,122,.1);border:1px solid rgba(90,170,122,.3);color:#4a9a6a',
  cancelled: 'background:rgba(200,50,50,.08);border:1px solid rgba(200,50,50,.25);color:#c0392b',
};

export class OrdersScene extends BaseScene {
  async init() {
    await this.manager.auth.ready();
    if (this._disposed) return;

    if (!this.manager.auth.isLoggedIn) { this.manager.navigateTo('login'); return; }
    if (!this.manager.auth.isArtist)   { this.manager.navigateTo('landing'); return; }

    this.threeScene.background = new THREE.Color(0xF1FAFF);
    this.camera.position.set(0, 0, 5);
    this.threeScene.add(new THREE.AmbientLight(0xffffff, 0.1));

    const overlay = document.createElement('div');
    overlay.id = 'os-overlay';
    overlay.style.cssText = `position:fixed;top:${HEADER_H}px;left:0;right:0;bottom:0;overflow-y:auto;z-index:100;background:#F1FAFF;font-family:'Montserrat',sans-serif;padding:40px;box-sizing:border-box;`;
    document.body.appendChild(overlay);
    this._el(overlay);

    await this._render();
  }

  async _loadOrders() {
    const currentId   = this.manager.auth.user?.id;
    const currentName = this.manager.auth.profile?.display_name;
    const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    return (data || []).filter(o =>
      (o.artworks || []).some(item =>
        (item.artistId && item.artistId === currentId) ||
        (!item.artistId && currentName && item.artist === currentName)
      )
    );
  }

  async _render() {
    const overlay = document.getElementById('os-overlay');
    if (!overlay) return;

    overlay.innerHTML = `<div style="text-align:center;padding:80px 0;color:#182D58;font-family:'Montserrat',sans-serif;font-size:13px;letter-spacing:.14em;text-transform:uppercase;opacity:.5">Đang tải...</div>`;

    const orders = await this._loadOrders();

    const orderIds = orders.map(o => o.order_id);
    if (orderIds.length > 0) {
      const { data: cData } = await supabase.from('complaints').select('*').in('order_id', orderIds);
      this._allComplaints = cData || [];
    } else {
      this._allComplaints = [];
    }

    const ordersHtml = orders.length === 0
      ? `<div style="text-align:center;padding:80px 0;color:#182D58;font-family:'Montserrat',sans-serif;font-size:13px;letter-spacing:.14em;text-transform:uppercase;opacity:.5">Chưa có đơn hàng nào</div>`
      : orders.map(o => this._orderCard(o)).join('');

    overlay.innerHTML = `
      <style>
        .os-wrap{max-width:840px;margin:0 auto}
        .os-heading{color:#2222C6;font-family:'Montserrat',sans-serif;font-size:40px;font-weight:800;line-height:1.1;margin-bottom:32px}
        .os-card{background:#fff;border:1px solid rgba(24,45,88,.12);border-radius:6px;padding:24px;margin-bottom:20px;box-shadow:0 2px 8px rgba(24,45,88,.06)}
        .os-card-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:10px}
        .os-id{color:#182D58;font-family:'Montserrat',sans-serif;font-size:14px;letter-spacing:.1em;font-weight:700}
        .os-meta{color:#182D58;font-family:'Montserrat',sans-serif;font-size:11px;letter-spacing:.08em;margin-top:4px;opacity:.6}
        .os-chip{padding:4px 10px;border-radius:3px;font-family:'Montserrat',sans-serif;font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:600}
        .os-item{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(24,45,88,.07);font-family:'Montserrat',sans-serif;font-size:12px}
        .os-item:last-child{border-bottom:none}
        .os-item-name{color:#182D58}
        .os-item-price{color:#182D58;white-space:nowrap;font-weight:600}
        .os-delivery{font-family:'Montserrat',sans-serif;font-size:11px;color:#182D58;letter-spacing:.08em;margin-top:14px;padding-top:14px;border-top:1px solid rgba(24,45,88,.08);opacity:.7}
        .os-delivery b{color:#182D58;opacity:1;font-weight:700}
        .os-actions{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}
        .os-btn-next{padding:7px 16px;font-family:'Montserrat',sans-serif;font-size:11px;letter-spacing:.12em;text-transform:uppercase;border-radius:3px;cursor:pointer;background:rgba(24,45,88,.07);border:1px solid rgba(24,45,88,.25);color:#182D58;transition:all .2s;font-weight:600}
        .os-btn-next:hover{background:rgba(24,45,88,.15)}
        .os-btn-done{padding:7px 16px;font-family:'Montserrat',sans-serif;font-size:11px;letter-spacing:.12em;text-transform:uppercase;border-radius:3px;background:rgba(90,170,122,.08);border:1px solid rgba(90,170,122,.3);color:#4a9a6a;cursor:default;font-weight:600}
        .os-btn-reject{padding:7px 16px;font-family:'Montserrat',sans-serif;font-size:11px;letter-spacing:.12em;text-transform:uppercase;border-radius:3px;cursor:pointer;background:rgba(200,50,50,.06);border:1px solid rgba(200,50,50,.3);color:#c0392b;transition:all .2s;font-weight:600}
        .os-btn-reject:hover{background:rgba(200,50,50,.14)}
        .os-btn-reject:disabled{opacity:.5;cursor:default}
        .os-btn-cancelled{padding:7px 16px;font-family:'Montserrat',sans-serif;font-size:11px;letter-spacing:.12em;text-transform:uppercase;border-radius:3px;background:rgba(200,50,50,.06);border:1px solid rgba(200,50,50,.25);color:#c0392b;cursor:default;font-weight:600}
        .os-timeline{display:flex;align-items:flex-start;margin:16px 0 20px}
        .os-step{display:flex;flex-direction:column;align-items:center;flex:1;position:relative}
        .os-line{position:absolute;top:14px;left:50%;right:-50%;height:2px;z-index:0}
        .os-step:last-child .os-line{display:none}
        .os-dot{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;z-index:1;border:2px solid;position:relative}
        .os-step-label{font-family:'Montserrat',sans-serif;font-size:9px;letter-spacing:.08em;margin-top:7px;text-align:center;text-transform:uppercase;line-height:1.4}
        .os-track-wrap{display:flex;gap:8px;align-items:center;margin-top:16px}
        .os-track-input{flex:1;padding:8px 11px;font-family:'Montserrat',sans-serif;font-size:12px;letter-spacing:.06em;border:1px solid rgba(24,45,88,.22);border-radius:3px;color:#182D58;outline:none;transition:border-color .2s}
        .os-track-input:focus{border-color:rgba(24,45,88,.5)}
        .os-track-input.err{border-color:rgba(200,50,50,.5)}
        .os-btn-ship{padding:7px 16px;font-family:'Montserrat',sans-serif;font-size:11px;letter-spacing:.12em;text-transform:uppercase;border-radius:3px;cursor:pointer;background:#122F6A;border:none;color:#fff;transition:all .2s;font-weight:600;white-space:nowrap}
        .os-btn-ship:hover{background:#1a3d82}
        .os-btn-ship:disabled{opacity:.5;cursor:default}
        .os-complaint-badge{margin-top:10px;padding:8px 12px;background:rgba(200,100,0,.07);border:1px solid rgba(200,100,0,.25);border-radius:3px;font-family:'Montserrat',sans-serif;font-size:11px;color:#b86000;letter-spacing:.06em}
        .os-btn-update-track{padding:7px 16px;font-family:'Montserrat',sans-serif;font-size:11px;letter-spacing:.12em;text-transform:uppercase;border-radius:3px;cursor:pointer;background:rgba(200,100,0,.1);border:1px solid rgba(200,100,0,.35);color:#b86000;transition:all .2s;font-weight:600;white-space:nowrap}
        .os-btn-update-track:hover{background:rgba(200,100,0,.2)}
        .os-btn-update-track:disabled{opacity:.5;cursor:default}
        .os-suspend-warning{margin-top:10px;padding:10px 14px;background:rgba(200,50,50,.06);border:1px solid rgba(200,50,50,.28);border-radius:4px;font-family:'Montserrat',sans-serif;font-size:11px;color:#c0392b;letter-spacing:.05em;line-height:1.6}
        .os-suspend-caution{margin-top:10px;padding:10px 14px;background:rgba(200,100,0,.06);border:1px solid rgba(200,100,0,.25);border-radius:4px;font-family:'Montserrat',sans-serif;font-size:11px;color:#b86000;letter-spacing:.05em;line-height:1.6}
        .os-proof-section{margin-top:14px;padding-top:12px;border-top:1px solid rgba(24,45,88,.08)}
        .os-proof-label{font-family:'Montserrat',sans-serif;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#182D58;opacity:.55;margin-bottom:8px;font-weight:600}
        .os-proof-img{max-width:220px;max-height:160px;object-fit:contain;border-radius:5px;border:1px solid rgba(24,45,88,.15);display:block;cursor:pointer}
        .os-no-proof{font-family:'Montserrat',sans-serif;font-size:11px;color:#182D58;opacity:.35;letter-spacing:.06em;margin-top:10px;padding-top:10px;border-top:1px solid rgba(24,45,88,.07)}
      </style>
      <div class="os-wrap">
        <div class="os-heading">Quản lý đơn hàng</div>
        ${ordersHtml}
      </div>
    `;

    overlay.querySelectorAll('.os-btn-next[data-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const payload = { status: btn.dataset.next };
        if (btn.dataset.next === 'delivering') payload.seller_delivered_at = new Date().toISOString();
        await supabase.from('orders').update(payload).eq('order_id', btn.dataset.id);
        await this._render();
      });
    });

    overlay.querySelectorAll('.os-btn-ship[data-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const orderId = btn.dataset.id;
        const inp = overlay.querySelector(`.os-track-input[data-orderid="${orderId}"]`);
        const code = inp?.value.trim();
        if (!code) {
          inp?.classList.add('err');
          inp?.focus();
          return;
        }
        btn.disabled = true;
        btn.textContent = 'Đang lưu...';
        await supabase.from('orders').update({ status: 'shipping', tracking_code: code }).eq('order_id', orderId);
        await this._render();
      });
    });

    overlay.querySelectorAll('.os-btn-update-track[data-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const orderId = btn.dataset.id;
        const inp = overlay.querySelector(`.os-track-input[data-orderid="${orderId}"]`);
        const code = inp?.value.trim();
        if (!code) { inp?.classList.add('err'); inp?.focus(); return; }
        btn.disabled = true;
        btn.textContent = 'Đang lưu...';
        await supabase.from('orders').update({ tracking_code: code }).eq('order_id', orderId);
        await this._render();
      });
    });

    overlay.querySelectorAll('.os-btn-reject[data-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        await supabase.from('orders').update({ status: 'cancelled' }).eq('order_id', btn.dataset.id);
        await this._render();
      });
    });
  }

  _orderCard(order) {
    const date = new Date(order.created_at).toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const statusLabel = STEPS.find(s => s.key === order.status)?.label || order.status;
    const chipStyle   = CHIP_STYLE[order.status] || CHIP_STYLE.placed;

    const itemsHtml = (order.artworks || []).map(item => `
      <div class="os-item">
        <span class="os-item-name">${item.title || 'Untitled'}${item.artist ? ` <span style="color:#182D58;font-family:'Montserrat',sans-serif;font-size:10px;opacity:.55">— ${item.artist}</span>` : ''}</span>
        <span class="os-item-price">${item.price || '—'}</span>
      </div>
    `).join('');

    const next = NEXT_STATUS[order.status];
    const nextLabel = next ? STEPS.find(s => s.key === next)?.label : null;

    const orderComplaints    = (this._allComplaints || []).filter(c => c.order_id === order.order_id);
    const totalSellerComplaints = (this._allComplaints || []).length;

    const suspendHtml = totalSellerComplaints >= 3
      ? `<div class="os-suspend-warning">⛔ Cảnh báo nghiêm trọng: Tài khoản của bạn đã nhận ${totalSellerComplaints} khiếu nại — admin có thể đình chỉ tài khoản 30 ngày</div>`
      : totalSellerComplaints === 2
        ? `<div class="os-suspend-caution">⚠ Lưu ý: Bạn đã có ${totalSellerComplaints} khiếu nại — thêm 1 lần nữa admin có thể đình chỉ tài khoản 30 ngày</div>`
        : '';

    let actionBtn;
    if (order.status === 'delivered') {
      actionBtn = `<span class="os-btn-done">✓ Đã giao thành công</span>`;
    } else if (order.status === 'cancelled') {
      actionBtn = `<span class="os-btn-cancelled">✕ Đã hủy</span>`;
    } else if (order.status === 'packing') {
      actionBtn = `
        <div class="os-track-wrap">
          <input class="os-track-input" data-orderid="${order.order_id}" placeholder="Nhập mã vận đơn SPX *" value="${(order.tracking_code || '').replace(/"/g,'&quot;')}" />
          <button class="os-btn-ship" data-id="${order.order_id}">🚚 Xác nhận vận chuyển</button>
        </div>
        ${order.is_complained ? `<div class="os-complaint-badge">⚠ Khách hàng đã khiếu nại — vui lòng gửi mã vận đơn sớm</div>` : ''}
        ${suspendHtml}
      `;
    } else if (order.status === 'shipping') {
      const complainCount = orderComplaints.length;
      const complainWarn = complainCount > 0
        ? `<div class="os-complaint-badge">⚠ Khách hàng đã khiếu nại mã vận đơn ${complainCount} lần — kiểm tra và cập nhật lại nếu sai</div>
           <div class="os-track-wrap" style="margin-top:10px">
             <input class="os-track-input" data-orderid="${order.order_id}" placeholder="Nhập lại mã vận đơn đúng *" value="${(order.tracking_code || '').replace(/"/g,'&quot;')}" />
             <button class="os-btn-update-track" data-id="${order.order_id}">↺ Cập nhật mã</button>
           </div>`
        : '';
      actionBtn = `
        ${complainWarn}
        ${suspendHtml}
        <button class="os-btn-next" data-id="${order.order_id}" data-next="delivering" style="margin-top:${complainCount > 0 ? '10' : '0'}px">✓ Xác nhận đã giao hàng</button>
      `;
    } else if (order.status === 'delivering') {
      const complainCount = orderComplaints.length;
      const complainInfo = complainCount > 0
        ? `<div class="os-complaint-badge">⚠ Khách hàng có ${complainCount} khiếu nại — đang chờ admin xử lý trong khi chờ xác nhận</div>`
        : '';
      actionBtn = `
        ${complainInfo}
        ${suspendHtml}
        <span class="os-btn-done" style="background:rgba(118,170,171,.08);border:1px solid rgba(118,170,171,.3);color:#4d9ea0">⏳ Chờ người mua xác nhận nhận hàng</span>
      `;
    } else {
      actionBtn = `
        <button class="os-btn-next" data-id="${order.order_id}" data-next="${next}">→ ${nextLabel}</button>
        ${order.status === 'placed' ? `<button class="os-btn-reject" data-id="${order.order_id}">✕ Từ chối</button>` : ''}
      `;
    }

    const stepIdx = STATUS_INDEX[order.status] ?? 0;
    const timelineHtml = order.status === 'cancelled' ? '' : `
      <div class="os-timeline">
        ${STEPS.map((step, i) => {
          const done   = i <= stepIdx;
          const active = i === stepIdx;
          const dotBg      = done   ? '#182D58'                 : 'transparent';
          const dotBorder  = done   ? '#182D58'                 : 'rgba(24,45,88,.15)';
          const labelColor = done   ? '#182D58'                 : 'rgba(24,45,88,.35)';
          const lineColor  = i < stepIdx ? '#76AAAB'            : 'rgba(24,45,88,.1)';
          const dotContent = active ? step.icon : (done ? '✓' : '');
          const glow = active ? 'box-shadow:0 0 10px rgba(118,170,171,.6)' : '';
          return `<div class="os-step">
            <div class="os-line" style="background:${lineColor}"></div>
            <div class="os-dot" style="background:${dotBg};border-color:${dotBorder};${glow}">${dotContent}</div>
            <div class="os-step-label" style="color:${labelColor}">${step.label}</div>
          </div>`;
        }).join('')}
      </div>
    `;

    const proofHtml = order.payment_proof_url
      ? `<div class="os-proof-section">
           <div class="os-proof-label">Minh chứng chuyển khoản</div>
           <a href="${order.payment_proof_url}" target="_blank" rel="noopener">
             <img src="${order.payment_proof_url}" class="os-proof-img" title="Nhấn để xem ảnh đầy đủ" />
           </a>
         </div>`
      : `<div class="os-no-proof">Chưa có minh chứng chuyển khoản</div>`;

    return `
      <div class="os-card">
        <div class="os-card-head">
          <div>
            <div class="os-id"># ${order.order_id}</div>
            <div class="os-meta">${date} &nbsp;·&nbsp; ${order.buyer_name || ''} &nbsp;·&nbsp; ${order.buyer_phone || ''}</div>
          </div>
          <span class="os-chip" style="${chipStyle}">${statusLabel}</span>
        </div>
        ${timelineHtml}
        <div>${itemsHtml}</div>
        <div class="os-delivery">
          <b>Địa chỉ:</b> ${order.buyer_address || '—'}
          ${order.note ? `<br><b>Phí ship:</b> ${order.note}` : ''}
          ${order.total ? `<br><b>Tổng:</b> <span style="font-weight:700">${Number(order.total).toLocaleString('vi-VN')} ₫</span>` : ''}
        </div>
        ${proofHtml}
        <div class="os-actions">${actionBtn}</div>
      </div>
    `;
  }
}