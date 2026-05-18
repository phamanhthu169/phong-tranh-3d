import * as THREE from 'three';
import { BaseScene } from './BaseScene.js';
import { HEADER_H } from '../core/SceneManager.js';

const STEPS = [
  { key: 'placed',    label: 'Đặt hàng',       icon: '📦' },
  { key: 'confirmed', label: 'Xác nhận',        icon: '✅' },
  { key: 'packing',   label: 'Đóng gói',        icon: '🎁' },
  { key: 'shipping',  label: 'Vận chuyển',      icon: '🚚' },
  { key: 'delivered', label: 'Giao thành công', icon: '🏠' },
];

const STATUS_INDEX = { placed: 0, confirmed: 1, packing: 2, shipping: 3, delivered: 4 };

const CHIP_STYLE = {
  placed:    'background:rgba(200,169,110,.1);border:1px solid rgba(200,169,110,.3);color:#c8a96e',
  confirmed: 'background:rgba(90,150,200,.1);border:1px solid rgba(90,150,200,.3);color:#7ab0e0',
  packing:   'background:rgba(150,120,200,.1);border:1px solid rgba(150,120,200,.3);color:#b090e0',
  shipping:  'background:rgba(90,170,200,.1);border:1px solid rgba(90,170,200,.3);color:#7ac8e0',
  delivered: 'background:rgba(90,170,122,.1);border:1px solid rgba(90,170,122,.3);color:#6aaa7a',
};

export class OrderTrackingScene extends BaseScene {
  async init() {
    await this.manager.auth.ready();
    if (this._disposed) return;

    if (!this.manager.auth.isLoggedIn) { this.manager.navigateTo('login'); return; }

    const profile = this.manager.auth.profile;
    const all = JSON.parse(localStorage.getItem('gallery_orders') || '[]');
    this._orders = all.filter(o => o.userId === profile?.id);

    this.threeScene.background = new THREE.Color(0x0c0a09);
    this.camera.position.set(0, 0, 5);
    this.threeScene.add(new THREE.AmbientLight(0xffffff, 0.1));

    this._buildOverlay();
  }

  _buildOverlay() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;top:${HEADER_H}px;left:0;right:0;bottom:0;overflow-y:auto;z-index:100;background:#0c0a09;font-family:monospace;padding:40px;box-sizing:border-box;`;
    document.body.appendChild(overlay);
    this._el(overlay);

    const ordersHtml = this._orders.length === 0
      ? `<div style="text-align:center;padding:80px 0;color:#333;font-size:11px;letter-spacing:.14em;text-transform:uppercase">Chưa có đơn hàng nào</div>`
      : this._orders.map(o => this._orderCard(o)).join('');

    overlay.innerHTML = `
      <style>
        .ot-wrap{max-width:720px;margin:0 auto}
        .ot-heading{color:#d4c5a9;font-size:16px;font-weight:bold;letter-spacing:.2em;text-transform:uppercase;margin-bottom:32px}
        .ot-card{background:rgba(255,255,255,.03);border:1px solid rgba(212,197,169,.1);border-radius:6px;padding:24px;margin-bottom:20px}
        .ot-card-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;flex-wrap:wrap;gap:10px}
        .ot-id{color:#c8a96e;font-size:12px;letter-spacing:.1em}
        .ot-date{color:#444;font-size:9px;letter-spacing:.08em;margin-top:4px}
        .ot-chip{padding:4px 10px;border-radius:3px;font-size:9px;letter-spacing:.1em;text-transform:uppercase}
        .ot-timeline{display:flex;align-items:flex-start;margin:20px 0 24px}
        .ot-step{display:flex;flex-direction:column;align-items:center;flex:1;position:relative}
        .ot-line{position:absolute;top:14px;left:50%;right:-50%;height:2px;z-index:0}
        .ot-step:last-child .ot-line{display:none}
        .ot-dot{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;z-index:1;border:2px solid;position:relative}
        .ot-step-label{font-size:7px;letter-spacing:.08em;margin-top:7px;text-align:center;text-transform:uppercase;line-height:1.4}
        .ot-item{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(212,197,169,.06);font-size:10px}
        .ot-item:last-child{border-bottom:none}
        .ot-item-name{color:#d4c5a9}
        .ot-item-price{color:#c8a96e;white-space:nowrap}
        .ot-delivery{margin-top:16px;padding-top:14px;border-top:1px solid rgba(212,197,169,.06);font-size:9px;color:#555;letter-spacing:.08em;line-height:1.8}
        .ot-delivery b{color:#7a6e5c}
      </style>

      <div class="ot-wrap">
        <div class="ot-heading">Đơn hàng của tôi</div>
        ${ordersHtml}
      </div>
    `;
  }

  _orderCard(order) {
    const stepIdx = STATUS_INDEX[order.status] ?? 0;
    const date = new Date(order.createdAt).toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const statusLabel = STEPS.find(s => s.key === order.status)?.label || order.status;
    const chipStyle   = CHIP_STYLE[order.status] || CHIP_STYLE.placed;

    const timelineHtml = STEPS.map((step, i) => {
      const done   = i <= stepIdx;
      const active = i === stepIdx;
      const dotBg     = done   ? '#c8a96e'              : 'transparent';
      const dotBorder = done   ? '#c8a96e'              : 'rgba(212,197,169,.15)';
      const labelColor = done  ? '#c8a96e'              : '#333';
      const lineColor  = i < stepIdx ? '#c8a96e'        : 'rgba(212,197,169,.08)';
      const dotContent = active ? step.icon : (done ? '✓' : '');
      const glow = active ? 'box-shadow:0 0 10px rgba(200,169,110,.5)' : '';
      return `
        <div class="ot-step">
          <div class="ot-line" style="background:${lineColor}"></div>
          <div class="ot-dot" style="background:${dotBg};border-color:${dotBorder};${glow}">${dotContent}</div>
          <div class="ot-step-label" style="color:${labelColor}">${step.label}</div>
        </div>
      `;
    }).join('');

    const itemsHtml = (order.items || []).map(item => `
      <div class="ot-item">
        <span class="ot-item-name">${item.title || 'Untitled'}</span>
        <span class="ot-item-price">${item.price || '—'}</span>
      </div>
    `).join('');

    return `
      <div class="ot-card">
        <div class="ot-card-head">
          <div>
            <div class="ot-id"># ${order.id}</div>
            <div class="ot-date">${date}</div>
          </div>
          <span class="ot-chip" style="${chipStyle}">${statusLabel}</span>
        </div>
        <div class="ot-timeline">${timelineHtml}</div>
        <div>${itemsHtml}</div>
        <div class="ot-delivery">
          <b>Người nhận:</b> ${order.delivery?.name || '—'} &nbsp;·&nbsp; ${order.delivery?.phone || ''}<br>
          <b>Địa chỉ:</b> ${order.delivery?.address || '—'}
        </div>
      </div>
    `;
  }
}
