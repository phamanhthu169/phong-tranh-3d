import * as THREE from 'three';
import { BaseScene } from './BaseScene.js';
import { HEADER_H } from '../core/SceneManager.js';
import { supabase } from '../utils/supabase.js';

export class ExploreScene extends BaseScene {
  async init() {
    this.threeScene.background = new THREE.Color(0xbdf1ff);
    this.camera.position.set(0, 0, 5);
    this.threeScene.add(new THREE.AmbientLight(0xffffff, 0.2));
    this._createParticles();
    this._sortMode = 'date';
    this._rooms = [];
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
      new THREE.PointsMaterial({ color: 0xcccccc, size: 0.03, transparent: true, opacity: 0.5 })
    );
    this.threeScene.add(this._particles);
  }

  _buildOverlay() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;top:${HEADER_H}px;left:0;right:0;bottom:0;overflow-y:auto;z-index:100;font-family:monospace;padding:36px 40px;box-sizing:border-box;`;
    overlay.innerHTML = `
      <style>
        .ex-card{background:transparent;border:none;box-shadow:none;cursor:pointer;display:flex;flex-direction:column;}
        .ex-card:hover{transform:none;box-shadow:none;border:none;}
        .ex-thumb-wrap{background:transparent;transition:transform .25s;}
        .ex-card:hover .ex-thumb-wrap{transform:translateY(-2px);}
        .ex-info-wrap{background:#ffffff;border:1px solid rgba(0,0,0,.1);border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.06);transition:all .25s;}
        .ex-card:hover .ex-info-wrap{transform:translateY(-2px);box-shadow:0 4px 16px rgba(0,0,0,.1);border-color:rgba(0,0,0,.25);}
        .ex-thumb{aspect-ratio:486/732;background:transparent;position:relative;overflow:hidden;border-bottom:1px solid rgba(0,0,0,.06);flex-shrink:0}
        .ex-thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
        .ex-thumb-placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:36px;color:#bbb}
        .ex-body{padding:14px;display:flex;flex-direction:column;gap:6px}
        .ex-name{color:#1a1a1a;font-size:12px;font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .ex-artist{color:#666;font-size:9px;letter-spacing:.1em}
        .ex-date{color:#999;font-size:8px;margin-top:2px}
        .ex-stats{display:flex;gap:12px;margin-top:2px}
        .ex-stat{color:#777;font-size:9px;letter-spacing:.05em;display:flex;align-items:center;gap:4px}
        .ex-stat-icon{font-size:10px;line-height:1}
        .ex-enter{display:inline-block;margin-top:6px;padding:5px 12px;font-size:9px;letter-spacing:.1em;text-transform:uppercase;background:rgba(200,169,110,.1);border:1px solid rgba(200,169,110,.35);color:#c8a96e;border-radius:2px;transition:background .2s}
        .ex-card:hover .ex-enter{background:rgba(200,169,110,.22)}
        .ex-sort-btn{padding:5px 14px;font-size:9px;letter-spacing:.08em;text-transform:uppercase;background:rgba(0,0,0,.03);border:1px solid rgba(0,0,0,.12);color:#555;border-radius:2px;cursor:pointer;transition:all .2s;font-family:monospace}
        .ex-sort-btn:hover{color:#c8a96e;border-color:rgba(200,169,110,.4)}
        .ex-sort-btn.active{color:#c8a96e;border-color:rgba(200,169,110,.5);background:rgba(200,169,110,.1)}
      </style>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;flex-wrap:wrap;gap:12px">
        <div>
          <div style="color:#1a1a1a;font-size:17px;font-weight:bold;letter-spacing:.2em;text-transform:uppercase">Khám phá</div>
          <div style="color:#888;font-size:10px;letter-spacing:.1em;margin-top:5px">Phòng tranh đã được publish</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span style="color:#888;font-size:9px;letter-spacing:.08em;margin-right:2px">Sắp xếp:</span>
          <button class="ex-sort-btn active" data-sort="date">Mới nhất</button>
          <button class="ex-sort-btn" data-sort="likes">Thích nhiều nhất</button>
          <button class="ex-sort-btn" data-sort="views">Xem nhiều nhất</button>
        </div>
      </div>

      <div id="ex-loading" style="color:#888;font-size:11px;letter-spacing:.1em;text-align:center;padding:60px">Đang tải...</div>
      <div id="ex-empty" style="display:none;text-align:center;padding:80px 0">
        <div style="color:#888;font-size:13px;letter-spacing:.1em">Chưa có phòng nào được publish</div>
      </div>
      <div id="ex-grid" style="display:none;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:18px"></div>
    `;

    overlay.querySelectorAll('.ex-sort-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.querySelectorAll('.ex-sort-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._sortMode = btn.dataset.sort;
        this._renderGrid();
      });
    });

    document.body.appendChild(overlay);
    this._el(overlay);
  }

  async _loadPublished() {
    const [galleryRes, likesRes, statsRes] = await Promise.all([
      supabase.from('gallery').select('name, created_at, scene_data').order('created_at', { ascending: false }),
      supabase.from('gallery_likes').select('gallery_name'),
      supabase.from('gallery_stats').select('gallery_name, views'),
    ]);

    document.getElementById('ex-loading').style.display = 'none';

    const rooms = (galleryRes.data || []).filter(row =>
      row.name.includes(':::') && row.scene_data?._meta?.isPublished === true
    );

    if (!rooms.length) {
      document.getElementById('ex-empty').style.display = 'block';
      return;
    }

    const likesMap = {};
    (likesRes.data || []).forEach(l => {
      likesMap[l.gallery_name] = (likesMap[l.gallery_name] || 0) + 1;
    });

    const viewsMap = {};
    (statsRes.data || []).forEach(s => {
      viewsMap[s.gallery_name] = s.views || 0;
    });

    this._rooms = rooms.map(row => ({
      row,
      likes: likesMap[row.name] || 0,
      views: viewsMap[row.name] || 0,
      date: new Date(row.created_at).getTime(),
    }));

    const grid = document.getElementById('ex-grid');
    grid.style.display = 'grid';
    this._renderGrid();
  }

  _renderGrid() {
    const grid = document.getElementById('ex-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const sorted = [...this._rooms].sort((a, b) => {
      if (this._sortMode === 'likes') return b.likes - a.likes;
      if (this._sortMode === 'views') return b.views - a.views;
      return b.date - a.date;
    });

    sorted.forEach(({ row, likes, views }) => this._addCard(grid, row, likes, views));
  }

  _addCard(grid, row, likes = 0, views = 0) {
    const meta     = row.scene_data?._meta || {};
    const roomName = meta.roomName || 'Phòng chưa đặt tên';
    const artistId = meta.artistId || row.name.split(':::')[0] || '—';
    const date     = new Date(row.created_at).toLocaleDateString('vi-VN');
    const artCount = row.scene_data?.artworks?.length || 0;

    const thumbUrl = meta.thumbnailUrl || null;

    const card = document.createElement('div');
    card.className = 'ex-card';
    card.innerHTML = `
    <div class="ex-thumb-wrap">
      <div class="ex-thumb">
        ${thumbUrl
          ? `<img src="${thumbUrl}" alt="${roomName}" loading="lazy">`
          : `<div class="ex-thumb-placeholder">🖼</div>`}
      </div>
    </div>
    <div class="ex-info-wrap">
      <div class="ex-body">
        <div class="ex-name">${roomName}</div>
        <div class="ex-artist">${artistId}</div>
        <div class="ex-date">${date}${artCount ? ' · ' + artCount + ' tác phẩm' : ''}</div>
        <div class="ex-stats">
          <span class="ex-stat"><span class="ex-stat-icon">♥</span> ${likes.toLocaleString('vi-VN')}</span>
          <span class="ex-stat"><span class="ex-stat-icon">👁</span> ${views.toLocaleString('vi-VN')}</span>
        </div>
        <span class="ex-enter">Vào xem →</span>
      </div>
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
