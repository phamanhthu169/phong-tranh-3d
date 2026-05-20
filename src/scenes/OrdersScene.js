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
  placed:    'background:rgba(24,45,88,.08);border:1px solid rgba(24,45,88,.25);color:#182D58',
  confirmed: 'background:rgba(90,150,200,.1);border:1px solid rgba(90,150,200,.3);color:#3a7bbf',
  packing:   'background:rgba(118,170,171,.12);border:1px solid rgba(118,170,171,.35);color:#4d9ea0',
  shipping:  'background:rgba(60,120,200,.1);border:1px solid rgba(60,120,200,.3);color:#3a70c8',
  delivered: 'background:rgba(90,170,122,.1);border:1px solid rgba(90,170,122,.3);color:#4a9a6a',
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

    this._render();
  }

  _loadOrders() {
    const currentId   = this.manager.auth.user?.id;
    const currentName = this.manager.auth.profile?.display_name;
    return JSON.parse(localStorage.getItem('gallery_orders') || '[]').filter(o =>
      (o.items || []).some(item =>
        (item.artistId && item.artistId === currentId) ||
        (!item.artistId && currentName && item.artist === currentName)
      )
    );
  }

  _render() {
    const overlay = document.getElementById('os-overlay');
    if (!overlay) return;

    const orders = this._loadOrders();

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
        <span class="os-item-name">${item.title || 'Untitled'}${item.artist ? ` <span style="color:#182D58;font-family:'Montserrat',sans-serif;font-size:10px;opacity:.55">— ${item.artist}</span>` : ''}</span>
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