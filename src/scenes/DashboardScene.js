import * as THREE from 'three';
import { BaseScene } from './BaseScene.js';
import { HEADER_H } from '../core/SceneManager.js';
import { supabase } from '../utils/supabase.js';

export class DashboardScene extends BaseScene {
  async init() {
    await this.manager.auth.ready();
    if (this._disposed) return;

    if (!this.manager.auth.isLoggedIn) { this.manager.navigateTo('login'); return; }
    if (!this.manager.auth.isArtist)  { this.manager.navigateTo('landing'); return; }

    this.threeScene.background = new THREE.Color(0xffffff);
    this.camera.position.set(0, 0, 5);
    this.threeScene.add(new THREE.AmbientLight(0xffffff, 0.2));
    this._createParticles();
    this._buildOverlay();
    await this._loadRooms();
  }

  _createParticles() {
    const count = 200, pos = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) pos[i] = (Math.random() - 0.5) * 20;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this._particles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xcccccc, size: 0.03, transparent: true, opacity: 0.5 })
    );
    this.threeScene.add(this._particles);
  }

  _buildOverlay() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:relative;width:100%;min-height:calc(100vh - ${HEADER_H}px);overflow-y:visible;z-index:100;font-family:monospace;padding:36px 40px;box-sizing:border-box;`;
    overlay.innerHTML = `
      <style>
        .db-card{background:#ffffff;border:1px solid rgba(0,0,0,.1);border-radius:6px;padding:20px;display:flex;flex-direction:column;gap:12px;transition:border-color .2s;box-shadow:0 2px 8px rgba(0,0,0,.06)}
        .db-card:hover{border-color:rgba(0,0,0,.25)}
        .db-badge{display:inline-block;padding:2px 9px;font-size:9px;letter-spacing:.14em;text-transform:uppercase;border-radius:2px}
        .db-badge.pub{background:rgba(106,170,122,.15);border:1px solid rgba(106,170,122,.35);color:#6aaa7a}
        .db-badge.draft{background:rgba(0,0,0,.04);border:1px solid rgba(0,0,0,.12);color:#777}
        .db-btn{padding:6px 14px;font-size:10px;cursor:pointer;font-family:monospace;letter-spacing:.08em;border-radius:3px;transition:all .2s;border:1px solid}
        .db-btn.edit{background:rgba(18,47,106,.1);border-color:rgba(18,47,106,.35);color:#122F6A}
        .db-btn.edit:hover{background:rgba(18,47,106,.2)}
        .db-btn.del{background:none;border-color:rgba(181,74,58,.25);color:rgba(181,74,58,.6)}
        .db-btn.del:hover{background:rgba(181,74,58,.1);border-color:rgba(181,74,58,.5);color:#ff9090}
      </style>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px">
        <div>
          <div class="page-title">Phòng tranh của tôi</div>
          <div id="db-artist" style="color:#666;font-size:10px;letter-spacing:.1em;margin-top:5px"></div>
        </div>
        <button id="db-new-btn" style="background:#122F6A;border:none;box-shadow:inset 0 0 0 2px rgba(255,255,255,0.18),0 4px 16px #76AAAB;color:#FFFFFF;font-family:'Montserrat',sans-serif;font-weight:700;font-size:11px;letter-spacing:.1em;padding:10px 26px;border-radius:26px;cursor:pointer;transition:background .2s,box-shadow .2s;">
          ＋ Tạo phòng mới
        </button>
      </div>

      <div id="db-loading" style="color:#888;font-size:11px;letter-spacing:.1em;text-align:center;padding:60px">Đang tải...</div>
      <div id="db-empty" style="display:none;text-align:center;padding:80px 0">
        <div style="color:#888;font-size:13px;letter-spacing:.1em">Chưa có phòng nào</div>
        <div style="color:#aaa;font-size:10px;margin-top:8px">Nhấn "Tạo phòng mới" để bắt đầu</div>
      </div>
      <div id="db-grid" style="display:none;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:16px"></div>
    `;

    document.body.appendChild(overlay);
    this._el(overlay);

    document.getElementById('db-artist').textContent = this.manager.auth.profile.name;

    const newBtn = document.getElementById('db-new-btn');
    newBtn.addEventListener('mouseenter', () => { newBtn.style.background = '#1a3f8a'; newBtn.style.boxShadow = 'inset 0 0 0 2px rgba(255,255,255,0.18),0 6px 20px #76AAAB'; });
    newBtn.addEventListener('mouseleave', () => { newBtn.style.background = '#122F6A'; newBtn.style.boxShadow = 'inset 0 0 0 2px rgba(255,255,255,0.18),0 4px 16px #76AAAB'; });
    newBtn.addEventListener('click', () => this._createNewRoom());
  }

  async _loadRooms() {
    const artistId = this.manager.auth.user.id;
    const prefix   = artistId + ':::';

    const { data } = await supabase
      .from('gallery')
      .select('name, created_at, scene_data')
      .order('created_at', { ascending: false });

    document.getElementById('db-loading').style.display = 'none';

    const rooms = (data || []).filter(row => row.name.startsWith(prefix));

    if (!rooms.length) {
      document.getElementById('db-empty').style.display = 'block';
      return;
    }

    const grid = document.getElementById('db-grid');
    grid.style.display = 'grid';

    rooms.forEach(row => this._addCard(grid, row, artistId));
  }

  _addCard(grid, row, artistId) {
    const meta       = row.scene_data?._meta || {};
    const roomName   = meta.roomName   || 'Phòng chưa đặt tên';
    const isPublished = !!meta.isPublished;
    const date       = new Date(row.created_at).toLocaleDateString('vi-VN');

    const card = document.createElement('div');
    card.className = 'db-card';
    card.innerHTML = `
      <div style="color:#182D58;font-family:'Montserrat',sans-serif;font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${roomName}</div>
      <div style="display:flex;align-items:center;gap:8px">
        <span class="db-badge ${isPublished ? 'pub' : 'draft'}">${isPublished ? '✓ Đã publish' : '✎ Draft'}</span>
        <span style="color:#999;font-size:9px">${date}</span>
      </div>
      <div style="display:flex;gap:8px;margin-top:2px">
        <button class="db-btn edit">✎ Chỉnh sửa</button>
        <button class="db-btn del">🗑 Xoá</button>
      </div>
    `;

    card.querySelector('.db-btn.edit').addEventListener('click', () => {
      this.manager.currentRoom = { id: row.name, name: roomName, artistId, isPublished };
      this.manager.navigateTo('studio');
    });

    card.querySelector('.db-btn.del').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (btn.dataset.confirm !== '1') {
        btn.textContent = '? Xác nhận xoá';
        btn.dataset.confirm = '1';
        setTimeout(() => { if (btn.dataset.confirm) { btn.textContent = '🗑 Xoá'; btn.dataset.confirm = ''; } }, 2500);
        return;
      }
      btn.dataset.confirm = '';
      await supabase.from('gallery').delete().eq('name', row.name);
      card.remove();
      if (!document.querySelectorAll('#db-grid .db-card').length) {
        document.getElementById('db-grid').style.display = 'none';
        document.getElementById('db-empty').style.display = 'block';
      }
    });

    grid.appendChild(card);
  }

  _createNewRoom() {
    const artistId = this.manager.auth.user.id;
    const roomId   = artistId + ':::' + Date.now();
    this.manager.currentRoom = { id: roomId, name: null, artistId, isPublished: false };    this.manager.navigateTo('studio');
  }

  update(_dt) {
    if (this._particles) this._particles.rotation.y += _dt * 0.01;
  }
}
