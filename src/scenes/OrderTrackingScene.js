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

const STATUS_INDEX = { placed: 0, confirmed: 1, packing: 2, shipping: 3, delivered: 4 };

const CHIP_STYLE = {
  placed:    'background:rgba(24,45,88,.08);border:1px solid rgba(24,45,88,.25);color:#182D58',
  confirmed: 'background:rgba(90,150,200,.1);border:1px solid rgba(90,150,200,.3);color:#3a7bbf',
  packing:   'background:rgba(118,170,171,.12);border:1px solid rgba(118,170,171,.35);color:#4d9ea0',
  shipping:  'background:rgba(60,120,200,.1);border:1px solid rgba(60,120,200,.3);color:#3a70c8',
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
    const { data } = await supabase.from('orders').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    this._orders = data || [];

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

    const deliveryHtml = `
      <div class="ot-delivery">
        <b>Người nhận:</b> ${order.buyer_name || '—'} &nbsp;·&nbsp; ${order.buyer_phone || ''}<br>
        <b>Địa chỉ:</b> ${order.buyer_address || '—'}
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

    const cancelBtn = order.status === 'placed'
      ? `<div class="ot-actions"><button class="ot-btn-cancel" data-id="${order.order_id}">✕ Hủy đơn</button></div>`
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
        ${cancelBtn}
      </div>
    `;
  }
}
