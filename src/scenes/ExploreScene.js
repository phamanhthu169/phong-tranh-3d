import * as THREE from 'three';
import { BaseScene } from './BaseScene.js';
import { HEADER_H } from '../core/SceneManager.js';
import { supabase } from '../utils/supabase.js';

export class ExploreScene extends BaseScene {
  async init() {
    this.threeScene.background = new THREE.Color(0x0d0b09);
    this.camera.position.set(0, 0, 5);
    this.threeScene.add(new THREE.AmbientLight(0xffffff, 0.2));
    this._createParticles();
    this._buildOverlay();
    await this._loadPublished();
  }

  _createParticles() {
    const count = 200, pos = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) pos[i] = (Math.random() - 0.5) * 20;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this._particles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xc8a96e, size: 0.03, transparent: true, opacity: 0.2 })
    );
    this.threeScene.add(this._particles);
  }

  _buildOverlay() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;top:${HEADER_H}px;left:0;right:0;bottom:0;overflow-y:auto;z-index:100;font-family:monospace;padding:36px 40px;box-sizing:border-box;`;
    overlay.innerHTML = `
      <style>
        .ex-card{background:rgba(15,13,12,.95);border:1px solid rgba(212,197,169,.15);border-radius:6px;overflow:hidden;cursor:pointer;transition:all .25s;display:flex;flex-direction:column}
        .ex-card:hover{border-color:rgba(212,197,169,.4);transform:translateY(-2px)}
        .ex-thumb{height:140px;background:rgba(20,18,14,1);display:flex;align-items:center;justify-content:center;font-size:36px;border-bottom:1px solid rgba(212,197,169,.08)}
        .ex-body{padding:14px;display:flex;flex-direction:column;gap:6px}
        .ex-name{color:#d4c5a9;font-size:12px;font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .ex-artist{color:#5a5040;font-size:9px;letter-spacing:.1em}
        .ex-date{color:#2e2a24;font-size:8px;margin-top:2px}
        .ex-enter{display:inline-block;margin-top:6px;padding:5px 12px;font-size:9px;letter-spacing:.1em;text-transform:uppercase;background:rgba(200,169,110,.1);border:1px solid rgba(200,169,110,.35);color:#c8a96e;border-radius:2px;transition:background .2s}
        .ex-card:hover .ex-enter{background:rgba(200,169,110,.22)}
      </style>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px">
        <div>
          <div style="color:#d4c5a9;font-size:17px;font-weight:bold;letter-spacing:.2em;text-transform:uppercase">Khám phá</div>
          <div style="color:#3a3228;font-size:10px;letter-spacing:.1em;margin-top:5px">Phòng tranh đã được publish</div>
        </div>
      </div>

      <div id="ex-loading" style="color:#3a3228;font-size:11px;letter-spacing:.1em;text-align:center;padding:60px">Đang tải...</div>
      <div id="ex-empty" style="display:none;text-align:center;padding:80px 0">
        <div style="color:#3a3228;font-size:13px;letter-spacing:.1em">Chưa có phòng nào được publish</div>
      </div>
      <div id="ex-grid" style="display:none;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:18px"></div>
    `;

    document.body.appendChild(overlay);
    this._el(overlay);
  }

  async _loadPublished() {
    const { data } = await supabase
      .from('gallery')
      .select('name, created_at, scene_data')
      .order('created_at', { ascending: false });

    document.getElementById('ex-loading').style.display = 'none';

    const rooms = (data || []).filter(row =>
      row.name.includes(':::') && row.scene_data?._meta?.isPublished === true
    );

    if (!rooms.length) {
      document.getElementById('ex-empty').style.display = 'block';
      return;
    }

    const grid = document.getElementById('ex-grid');
    grid.style.display = 'grid';
    rooms.forEach(row => this._addCard(grid, row));
  }

  _addCard(grid, row) {
    const meta      = row.scene_data?._meta || {};
    const roomName  = meta.roomName  || 'Phòng chưa đặt tên';
    const artistId  = meta.artistId  || row.name.split(':::')[0] || '—';
    const date      = new Date(row.created_at).toLocaleDateString('vi-VN');
    const artCount  = row.scene_data?.artworks?.length || 0;

    const card = document.createElement('div');
    card.className = 'ex-card';
    card.innerHTML = `
      <div class="ex-thumb">🖼</div>
      <div class="ex-body">
        <div class="ex-name">${roomName}</div>
        <div class="ex-artist">${artistId}</div>
        <div class="ex-date">${date}${artCount ? ' · ' + artCount + ' tác phẩm' : ''}</div>
        <span class="ex-enter">Vào xem →</span>
      </div>
    `;

    card.addEventListener('click', () => {
      this.manager.currentRoom = {
        id:          row.name,
        name:        roomName,
        artistId:    artistId,
        isPublished: true,
      };
      this.manager.navigateTo('viewer');
    });

    grid.appendChild(card);
  }

  update(_dt) {
    if (this._particles) this._particles.rotation.y += _dt * 0.01;
  }
}
