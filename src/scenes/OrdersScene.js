import * as THREE from 'three';
import { BaseScene } from './BaseScene.js';
import { HEADER_H } from '../core/SceneManager.js';

const STEPS = [
  { key: 'placed',    label: 'Đặt hàng' },
  { key: 'confirmed', label: 'Xác nhận' },
  { key: 'packing',   label: 'Đóng gói' },
  { key: 'shipping',  label: 'Vận chuyển' },
  { key: 'delivered', label: 'Giao thành công' },
];

const NEXT_STATUS = {
  placed:    'confirmed',
  confirmed: 'packing',
  packing:   'shipping',
  shipping:  'delivered',
};

const CHIP_STYLE = {
  placed:    'background:rgba(200,169,110,.1);border:1px solid rgba(200,169,110,.3);color:#c8a96e',
  confirmed: 'background:rgba(90,150,200,.1);border:1px solid rgba(90,150,200,.3);color:#7ab0e0',
  packing:   'background:rgba(150,120,200,.1);border:1px solid rgba(150,120,200,.3);color:#b090e0',
  shipping:  'background:rgba(90,170,200,.1);border:1px solid rgba(90,170,200,.3);color:#7ac8e0',
  delivered: 'background:rgba(90,170,122,.1);border:1px solid rgba(90,170,122,.3);color:#6aaa7a',
};

export class OrdersScene extends BaseScene {
  async init() {
    await this.manager.auth.ready();
    if (this._disposed) return;

    if (!this.manager.auth.isLoggedIn) { this.manager.navigateTo('login'); return; }
    if (!this.manager.auth.isArtist)   { this.manager.navigateTo('landing'); return; }

    this.threeScene.background = new THREE.Color(0x0c0a09);
    this.camera.position.set(0, 0, 5);
    this.threeScene.add(new THREE.AmbientLight(0xffffff, 0.1));

    const overlay = document.createElement('div');
    overlay.id = 'os-overlay';
    overlay.style.cssText = `position:fixed;top:${HEADER_H}px;left:0;right:0;bottom:0;overflow-y:auto;z-index:100;background:#0c0a09;font-family:monospace;padding:40px;box-sizing:border-box;`;
    document.body.appendChild(overlay);
    this._el(overlay);

    this._render();
  }

  _loadOrders() {
    return JSON.parse(localStorage.getItem('gallery_orders') || '[]');
  }

  _render() {
    const overlay = document.getElementById('os-overlay');
    if (!overlay) return;

    const orders = this._loadOrders();

    const ordersHtml = orders.length === 0
      ? `<div style="text-align:center;padding:80px 0;color:#333;font-size:11px;letter-spacing:.14em;text-transform:uppercase">Chưa có đơn hàng nào</div>`
      : orders.map(o => this._orderCard(o)).join('');

    overlay.innerHTML = `
      <style>
        .os-wrap{max-width:840px;margin:0 auto}
        .os-heading{color:#d4c5a9;font-size:16px;font-weight:bold;letter-spacing:.2em;text-transform:uppercase;margin-bottom:32px}
        .os-card{background:rgba(255,255,255,.03);border:1px solid rgba(212,197,169,.1);border-radius:6px;padding:24px;margin-bottom:20px}
        .os-card-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:10px}
        .os-id{color:#c8a96e;font-size:12px;letter-spacing:.1em}
        .os-meta{color:#444;font-size:9px;letter-spacing:.08em;margin-top:4px}
        .os-chip{padding:4px 10px;border-radius:3px;font-size:9px;letter-spacing:.1em;text-transform:uppercase}
        .os-item{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(212,197,169,.06);font-size:10px}
        .os-item:last-child{border-bottom:none}
        .os-item-name{color:#d4c5a9}
        .os-item-price{color:#c8a96e;white-space:nowrap}
        .os-delivery{font-size:9px;color:#555;letter-spacing:.08em;margin-top:14px;padding-top:14px;border-top:1px solid rgba(212,197,169,.06)}
        .os-delivery b{color:#7a6e5c}
        .os-actions{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}
        .os-btn-next{padding:7px 16px;font-family:monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;border-radius:3px;cursor:pointer;background:rgba(200,169,110,.1);border:1px solid rgba(200,169,110,.4);color:#c8a96e;transition:all .2s}
        .os-btn-next:hover{background:rgba(200,169,110,.25)}
        .os-btn-done{padding:7px 16px;font-family:monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;border-radius:3px;background:rgba(90,170,122,.06);border:1px solid rgba(90,170,122,.25);color:#6aaa7a;cursor:default}
      </style>
      <div class="os-wrap">
        <div class="os-heading">Quản lý đơn hàng</div>
        ${ordersHtml}
      </div>
    `;

    overlay.querySelectorAll('.os-btn-next[data-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const orders = this._loadOrders();
        const idx = orders.findIndex(o => o.id === btn.dataset.id);
        if (idx !== -1) {
          orders[idx].status = btn.dataset.next;
          localStorage.setItem('gallery_orders', JSON.stringify(orders));
        }
        this._render();
      });
    });
  }

  _orderCard(order) {
    const date = new Date(order.createdAt).toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const statusLabel = STEPS.find(s => s.key === order.status)?.label || order.status;
    const chipStyle   = CHIP_STYLE[order.status] || CHIP_STYLE.placed;

    const itemsHtml = (order.items || []).map(item => `
      <div class="os-item">
        <span class="os-item-name">${item.title || 'Untitled'}${item.artist ? ` <span style="color:#444;font-size:8px">— ${item.artist}</span>` : ''}</span>
        <span class="os-item-price">${item.price || '—'}</span>
      </div>
    `).join('');

    const next = NEXT_STATUS[order.status];
    const nextLabel = next ? STEPS.find(s => s.key === next)?.label : null;
    const actionBtn = order.status === 'delivered'
      ? `<span class="os-btn-done">✓ Đã giao thành công</span>`
      : `<button class="os-btn-next" data-id="${order.id}" data-next="${next}">→ ${nextLabel}</button>`;

    return `
      <div class="os-card">
        <div class="os-card-head">
          <div>
            <div class="os-id"># ${order.id}</div>
            <div class="os-meta">${date} &nbsp;·&nbsp; ${order.userName || ''} &nbsp;·&nbsp; ${order.userPhone || ''}</div>
          </div>
          <span class="os-chip" style="${chipStyle}">${statusLabel}</span>
        </div>
        <div>${itemsHtml}</div>
        <div class="os-delivery">
          <b>Địa chỉ:</b> ${order.delivery?.address || '—'}
        </div>
        <div class="os-actions">${actionBtn}</div>
      </div>
    `;
  }
}
