import * as THREE from 'three';
import { BaseScene } from './BaseScene.js';
import { HEADER_H } from '../core/SceneManager.js';
import { supabase } from '../utils/supabase.js';

const STATUS_LABELS = { open: 'Chờ xử lý', resolved: 'Đã giải quyết', dismissed: 'Bỏ qua' };
const STATUS_CHIP = {
  open:      'background:rgba(200,100,0,.1);border:1px solid rgba(200,100,0,.3);color:#b86000',
  resolved:  'background:rgba(90,170,122,.1);border:1px solid rgba(90,170,122,.3);color:#4a9a6a',
  dismissed: 'background:rgba(24,45,88,.08);border:1px solid rgba(24,45,88,.2);color:#182D58',
};

export class AdminScene extends BaseScene {
  async init() {
    await this.manager.auth.ready();
    if (this._disposed) return;

    if (!this.manager.auth.isLoggedIn) { this.manager.navigateTo('login'); return; }
    if (this.manager.auth.profile?.role !== 'admin') { this.manager.navigateTo('landing'); return; }

    this.threeScene.background = new THREE.Color(0xF1FAFF);
    this.camera.position.set(0, 0, 5);
    this.threeScene.add(new THREE.AmbientLight(0xffffff, 0.1));

    const overlay = document.createElement('div');
    overlay.id = 'admin-overlay';
    overlay.style.cssText = `position:fixed;top:${HEADER_H}px;left:0;right:0;bottom:0;overflow-y:auto;z-index:100;background:#F1FAFF;font-family:'Montserrat',sans-serif;padding:40px;box-sizing:border-box;`;
    document.body.appendChild(overlay);
    this._el(overlay);

    await this._render();
  }

  async _render() {
    const overlay = document.getElementById('admin-overlay');
    if (!overlay) return;

    overlay.innerHTML = `<div style="text-align:center;padding:80px 0;color:#182D58;font-family:'Montserrat',sans-serif;font-size:13px;letter-spacing:.14em;text-transform:uppercase;opacity:.5">Đang tải...</div>`;

    const { data } = await supabase.from('complaints').select('*').order('created_at', { ascending: false });
    this._complaints = data || [];

    const total    = this._complaints.length;
    const open     = this._complaints.filter(c => c.status === 'open').length;
    const resolved = this._complaints.filter(c => c.status === 'resolved').length;

    const listHtml = total === 0
      ? `<div style="text-align:center;padding:80px 0;color:#182D58;font-size:13px;letter-spacing:.14em;text-transform:uppercase;opacity:.5">Chưa có khiếu nại nào</div>`
      : this._complaints.map(c => this._complaintCard(c)).join('');

    overlay.innerHTML = `
      <style>
        .adm-wrap{max-width:800px;margin:0 auto}
        .adm-heading{color:#2222C6;font-family:'Montserrat',sans-serif;font-size:40px;font-weight:800;line-height:1.1;margin-bottom:6px}
        .adm-sub{color:#182D58;font-size:13px;opacity:.5;letter-spacing:.08em;margin-bottom:28px}
        .adm-stats{display:flex;gap:16px;margin-bottom:28px;flex-wrap:wrap}
        .adm-stat{background:#fff;border:1px solid rgba(24,45,88,.12);border-radius:6px;padding:16px 24px;flex:1;min-width:90px}
        .adm-stat-n{font-size:28px;font-weight:800;color:#182D58;letter-spacing:.02em}
        .adm-stat-l{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#182D58;opacity:.5;margin-top:2px;font-weight:600}
        .adm-card{background:#fff;border:1px solid rgba(24,45,88,.12);border-radius:6px;padding:24px;margin-bottom:16px;box-shadow:0 2px 8px rgba(24,45,88,.06)}
        .adm-card-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:8px}
        .adm-order-id{color:#182D58;font-size:13px;font-weight:700;letter-spacing:.08em}
        .adm-buyer{color:#182D58;font-size:11px;opacity:.6;margin-top:3px;letter-spacing:.06em}
        .adm-date{color:#182D58;font-size:10px;opacity:.4;letter-spacing:.06em;margin-top:3px}
        .adm-chip{padding:4px 10px;border-radius:3px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:600;white-space:nowrap}
        .adm-desc{color:#182D58;font-size:13px;line-height:1.65;padding:12px 14px;background:rgba(24,45,88,.04);border-radius:5px;margin-bottom:14px;letter-spacing:.02em;white-space:pre-wrap}
        .adm-screenshot{margin-bottom:14px}
        .adm-screenshot img{max-width:320px;max-height:200px;object-fit:contain;border-radius:5px;border:1px solid rgba(24,45,88,.15);cursor:pointer;display:block}
        .adm-note-existing{color:#182D58;font-size:11px;opacity:.6;letter-spacing:.04em;padding:8px 12px;background:rgba(24,45,88,.04);border-radius:4px;margin-bottom:8px;font-style:italic}
        .adm-note-wrap{display:flex;gap:8px;margin-top:4px;flex-wrap:wrap}
        .adm-note-input{flex:1;min-width:160px;padding:8px 12px;font-family:'Montserrat',sans-serif;font-size:12px;border:1px solid rgba(24,45,88,.2);border-radius:4px;color:#182D58;outline:none;letter-spacing:.02em}
        .adm-btn{padding:8px 16px;font-family:'Montserrat',sans-serif;font-size:11px;letter-spacing:.1em;text-transform:uppercase;border-radius:3px;cursor:pointer;font-weight:600;transition:all .2s;white-space:nowrap}
        .adm-btn:disabled{opacity:.5;cursor:default}
        .adm-btn-resolve{background:rgba(90,170,122,.1);border:1px solid rgba(90,170,122,.3);color:#4a9a6a}
        .adm-btn-resolve:hover:not(:disabled){background:rgba(90,170,122,.2)}
        .adm-btn-dismiss{background:rgba(24,45,88,.06);border:1px solid rgba(24,45,88,.2);color:#182D58}
        .adm-btn-dismiss:hover:not(:disabled){background:rgba(24,45,88,.12)}
      </style>
      <div class="adm-wrap">
        <div class="adm-heading">Quản lý khiếu nại</div>
        <div class="adm-sub">Khiếu nại từ người dùng</div>
        <div class="adm-stats">
          <div class="adm-stat"><div class="adm-stat-n">${total}</div><div class="adm-stat-l">Tổng cộng</div></div>
          <div class="adm-stat"><div class="adm-stat-n" style="color:#b86000">${open}</div><div class="adm-stat-l">Chờ xử lý</div></div>
          <div class="adm-stat"><div class="adm-stat-n" style="color:#4a9a6a">${resolved}</div><div class="adm-stat-l">Đã giải quyết</div></div>
        </div>
        ${listHtml}
      </div>
    `;

    overlay.querySelectorAll('.adm-btn-resolve[data-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id   = btn.dataset.id;
        const note = overlay.querySelector(`.adm-note-input[data-id="${id}"]`)?.value.trim() || null;
        btn.disabled = true;
        btn.textContent = 'Đang lưu...';
        await supabase.from('complaints').update({ status: 'resolved', admin_note: note }).eq('id', id);
        await this._render();
      });
    });

    overlay.querySelectorAll('.adm-btn-dismiss[data-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id   = btn.dataset.id;
        const note = overlay.querySelector(`.adm-note-input[data-id="${id}"]`)?.value.trim() || null;
        btn.disabled = true;
        btn.textContent = 'Đang lưu...';
        await supabase.from('complaints').update({ status: 'dismissed', admin_note: note }).eq('id', id);
        await this._render();
      });
    });
  }

  _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  _complaintCard(c) {
    const date = new Date(c.created_at).toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const statusLabel = STATUS_LABELS[c.status] || c.status;
    const chipStyle   = STATUS_CHIP[c.status]   || STATUS_CHIP.open;

    const screenshotHtml = c.screenshot_url
      ? `<div class="adm-screenshot">
           <a href="${c.screenshot_url}" target="_blank" rel="noopener">
             <img src="${c.screenshot_url}" alt="screenshot" />
           </a>
         </div>`
      : '';

    const noteExisting = c.admin_note
      ? `<div class="adm-note-existing">Ghi chú admin: ${this._esc(c.admin_note)}</div>`
      : '';

    const actionHtml = c.status === 'open'
      ? `${noteExisting}
         <div class="adm-note-wrap">
           <input class="adm-note-input" data-id="${c.id}" placeholder="Ghi chú xử lý (tùy chọn)" />
           <button class="adm-btn adm-btn-resolve" data-id="${c.id}">✓ Đã giải quyết</button>
           <button class="adm-btn adm-btn-dismiss" data-id="${c.id}">Bỏ qua</button>
         </div>`
      : noteExisting;

    return `
      <div class="adm-card">
        <div class="adm-card-head">
          <div>
            <div class="adm-order-id">Đơn # ${this._esc(c.order_id)}</div>
            <div class="adm-buyer">Người gửi: ${this._esc(c.buyer_name)}</div>
            <div class="adm-date">${date}</div>
          </div>
          <span class="adm-chip" style="${chipStyle}">${statusLabel}</span>
        </div>
        <div class="adm-desc">${this._esc(c.description)}</div>
        ${screenshotHtml}
        ${actionHtml}
      </div>
    `;
  }
}
