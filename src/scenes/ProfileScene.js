import * as THREE from 'three';
import { BaseScene } from './BaseScene.js';
import { HEADER_H } from '../core/SceneManager.js';
import { supabase } from '../utils/supabase.js';

/*
  ProfileScene — /profile
  - Xem profile của chính mình: có nút Edit
  - Xem profile người khác: read-only
  - Artist: hiện danh sách gallery đã publish
  - Visitor: hiện thông tin cá nhân + bio

  Điều hướng:
    this.manager.navigateTo('profile')              → profile của mình
    this.manager.profileTarget = { name, role }
    this.manager.navigateTo('profile')              → xem profile người khác
*/

export class ProfileScene extends BaseScene {
  async init() {
    await this.manager.auth.ready();
    if (this._disposed) return;

    // Nếu chưa đăng nhập và không có target → về landing
    if (!this.manager.auth.isLoggedIn && !this.manager.profileTarget) {
      this.manager.navigateTo('landing');
      return;
    }

    // Target: xem profile ai?
    // Nếu manager.profileTarget được set → xem người đó, không thì xem mình
    const isSelf = !this.manager.profileTarget;
    // Auth profile đã chứa đầy đủ fields (name, role, location, website, bio)
    // vì AuthManager.updateProfile lưu merge vào cùng một object
    this._target = isSelf
      ? { ...this.manager.auth.profile }
      : { ...this.manager.profileTarget };

    // Reset target sau khi đọc
    this.manager.profileTarget = null;

    this._isSelf = isSelf;
    this._isEditing = false;

    // Three.js background
    this.threeScene.background = new THREE.Color(0x0d0b09);
    this.camera.position.set(0, 0, 5);
    this.threeScene.add(new THREE.AmbientLight(0xffffff, 0.2));
    this._createParticles();

    this._buildOverlay();

    if (this._target.role === 'artist') {
      await this._loadGalleries();
    }
    await this._loadTokenRank();
  }

  // ─── Particles (giống DashboardScene) ───────────────────────────────────────
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

  // ─── Build toàn bộ UI ────────────────────────────────────────────────────────
  _buildOverlay() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;top:${HEADER_H}px;left:0;right:0;bottom:0;
      overflow-y:auto;z-index:100;font-family:monospace;
      padding:40px;box-sizing:border-box;
    `;

    overlay.innerHTML = `
      <style>
        .pf-section {
          background: rgba(15,13,12,.95);
          border: 1px solid rgba(212,197,169,.13);
          border-radius: 6px;
          padding: 28px 32px;
          margin-bottom: 20px;
        }
        .pf-label {
          color: #3a3228;
          font-size: 9px;
          letter-spacing: .18em;
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .pf-value {
          color: #d4c5a9;
          font-size: 13px;
          letter-spacing: .04em;
          min-height: 20px;
        }
        .pf-input {
          background: rgba(212,197,169,.06);
          border: 1px solid rgba(212,197,169,.22);
          border-radius: 3px;
          color: #d4c5a9;
          font-family: monospace;
          font-size: 13px;
          padding: 8px 12px;
          width: 100%;
          box-sizing: border-box;
          outline: none;
          transition: border-color .2s;
        }
        .pf-input:focus { border-color: rgba(200,169,110,.5); }
        .pf-input::placeholder { color: #3a3228; }
        .pf-textarea {
          resize: vertical;
          min-height: 80px;
        }
        .pf-btn {
          padding: 8px 20px;
          font-size: 10px;
          cursor: pointer;
          font-family: monospace;
          letter-spacing: .1em;
          border-radius: 3px;
          transition: all .2s;
          border: 1px solid;
        }
        .pf-btn.gold {
          background: rgba(200,169,110,.15);
          border-color: rgba(200,169,110,.5);
          color: #c8a96e;
        }
        .pf-btn.gold:hover { background: rgba(200,169,110,.28); }
        .pf-btn.ghost {
          background: none;
          border-color: rgba(212,197,169,.2);
          color: #5a5040;
        }
        .pf-btn.ghost:hover { border-color: rgba(212,197,169,.4); color: #8a7a60; }
        .pf-btn.danger {
          background: none;
          border-color: rgba(181,74,58,.25);
          color: rgba(181,74,58,.6);
        }
        .pf-btn.danger:hover { background: rgba(181,74,58,.1); color: #ff9090; border-color: rgba(181,74,58,.5); }

        .gallery-card {
          background: rgba(15,13,12,.95);
          border: 1px solid rgba(212,197,169,.12);
          border-radius: 6px;
          padding: 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          transition: border-color .2s;
          cursor: pointer;
        }
        .gallery-card:hover { border-color: rgba(200,169,110,.35); }
        .badge-pub {
          display:inline-block;padding:2px 9px;font-size:9px;
          letter-spacing:.12em;text-transform:uppercase;border-radius:2px;
          background:rgba(106,170,122,.15);border:1px solid rgba(106,170,122,.35);color:#6aaa7a;
        }
        .pf-role-badge {
          display: inline-block;
          padding: 3px 12px;
          font-size: 9px;
          letter-spacing: .18em;
          text-transform: uppercase;
          border-radius: 2px;
          border: 1px solid rgba(200,169,110,.3);
          color: #c8a96e;
          background: rgba(200,169,110,.08);
        }
        .pf-toast {
          position: fixed;
          bottom: 32px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(15,13,12,.98);
          border: 1px solid rgba(106,170,122,.4);
          color: #6aaa7a;
          padding: 10px 24px;
          font-family: monospace;
          font-size: 11px;
          letter-spacing: .1em;
          border-radius: 4px;
          opacity: 0;
          transition: opacity .3s;
          z-index: 9999;
          pointer-events: none;
        }
        .pf-avatar-circle {
          width: 64px; height: 64px;
          border-radius: 50%;
          background: rgba(200,169,110,.12);
          border: 2px solid rgba(200,169,110,.3);
          display: flex; align-items: center; justify-content: center;
          font-size: 24px;
          color: #c8a96e;
          flex-shrink: 0;
        }
      </style>

      <!-- Toast -->
      <div id="pf-toast" class="pf-toast">✓ Đã lưu thông tin</div>

      <!-- Header row -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px">
        <button id="pf-back" class="pf-btn ghost" style="font-size:11px">← Quay lại</button>
        <div id="pf-actions" style="display:flex;gap:10px"></div>
      </div>

      <!-- Profile card -->
      <div class="pf-section">
        <div style="display:flex;align-items:center;gap:20px;margin-bottom:24px">
          <div class="pf-avatar-circle" id="pf-avatar-display">
            <span id="pf-avatar-initial"></span>
          </div>
          <div>
            <div style="color:#d4c5a9;font-size:18px;font-weight:bold;letter-spacing:.12em" id="pf-name-display"></div>
            <div style="margin-top:6px"><span class="pf-role-badge" id="pf-role-display"></span></div>
          </div>
        </div>

        <!-- View mode -->
        <div id="pf-view-mode">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px" id="pf-fields-view">
            <div>
              <div class="pf-label">Website / Mạng xã hội</div>
              <div class="pf-value" id="pf-website-view" style="color:#8a7a60">—</div>
            </div>
            <div>
              <div class="pf-label">Địa điểm</div>
              <div class="pf-value" id="pf-location-view" style="color:#8a7a60">—</div>
            </div>
          </div>
          <div>
            <div class="pf-label">Giới thiệu</div>
            <div class="pf-value" id="pf-bio-view" style="color:#8a7a60;line-height:1.7">—</div>
          </div>
        </div>

        <!-- Edit mode -->
        <div id="pf-edit-mode" style="display:none">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
            <div>
              <div class="pf-label">Tên hiển thị</div>
              <input id="pf-edit-name" class="pf-input" placeholder="Tên của bạn" />
            </div>
            <div>
              <div class="pf-label">Địa điểm</div>
              <input id="pf-edit-location" class="pf-input" placeholder="Hà Nội, Việt Nam" />
            </div>
          </div>
          <div style="margin-bottom:16px">
            <div class="pf-label">Website / Mạng xã hội</div>
            <input id="pf-edit-website" class="pf-input" placeholder="https://..." />
          </div>
          <div>
            <div class="pf-label">Giới thiệu</div>
            <textarea id="pf-edit-bio" class="pf-input pf-textarea" placeholder="Một vài dòng về bạn..."></textarea>
          </div>
        </div>
      </div>

      <!-- Rank & Token -->
      <div id="pf-rank-section" class="pf-section" style="display:none">
        <div style="display:flex;align-items:center;gap:20px">
          <div id="pf-rank-icon" style="width:52px;height:52px;border-radius:50%;background:rgba(200,169,110,.1);border:.5px solid rgba(200,169,110,.25);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">⭐</div>
          <div>
            <div style="color:#c8a96e;font-size:15px;letter-spacing:.08em" id="pf-rank-name">—</div>
            <div style="color:#7a6e5c;font-size:10px;margin-top:4px" id="pf-token-count"></div>
          </div>
        </div>
        <div style="margin-top:18px">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <span style="color:#5a5040;font-size:9px;letter-spacing:.12em;text-transform:uppercase">Tiến độ lên rank</span>
            <span style="color:#7a6e5c;font-size:9px" id="pf-rank-progress-text"></span>
          </div>
          <div style="height:4px;background:rgba(212,197,169,.1);border-radius:2px;overflow:hidden">
            <div id="pf-rank-bar" style="height:100%;background:linear-gradient(90deg,rgba(200,169,110,.5),rgba(200,169,110,1));border-radius:2px;transition:width .6s;width:0%"></div>
          </div>
        </div>
      </div>

      <!-- Gallery section (artist only) -->
      <div id="pf-gallery-section" style="display:none">
        <div style="color:#5a5040;font-size:9px;letter-spacing:.18em;text-transform:uppercase;margin-bottom:14px">
          Phòng triển lãm
        </div>
        <div id="pf-gallery-loading" style="color:#3a3228;font-size:11px;letter-spacing:.1em;text-align:center;padding:40px">
          Đang tải...
        </div>
        <div id="pf-gallery-empty" style="display:none;color:#3a3228;font-size:11px;letter-spacing:.1em;text-align:center;padding:40px">
          Chưa có phòng triển lãm nào
        </div>
        <div id="pf-gallery-grid" style="display:none;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px"></div>
      </div>
    `;

    document.body.appendChild(overlay);
    this._el(overlay);
    this._overlay = overlay;

    this._populateView();
    this._bindActions();
  }

  // ─── Điền dữ liệu vào view ───────────────────────────────────────────────────
  _populateView() {
    const t = this._target;
    const name = t.name || 'Ẩn danh';

    document.getElementById('pf-name-display').textContent = name;
    document.getElementById('pf-avatar-initial').textContent = name.charAt(0).toUpperCase();
    document.getElementById('pf-role-display').textContent = t.role === 'artist' ? 'Artist' : 'Visitor';

    document.getElementById('pf-website-view').textContent = t.website || '—';
    document.getElementById('pf-location-view').textContent = t.location || '—';
    document.getElementById('pf-bio-view').textContent = t.bio || '—';

    // Hiện gallery section nếu là artist
    if (t.role === 'artist') {
      document.getElementById('pf-gallery-section').style.display = 'block';
    }

    // Nút action
    const actionsEl = document.getElementById('pf-actions');
    if (this._isSelf) {
      actionsEl.innerHTML = `
        <button id="pf-edit-btn" class="pf-btn gold">✎ Chỉnh sửa</button>
      `;
      document.getElementById('pf-edit-btn').addEventListener('click', () => this._enterEdit());
    }
  }

  // ─── Bind nút quay lại ───────────────────────────────────────────────────────
  _bindActions() {
    document.getElementById('pf-back').addEventListener('click', () => {
      const prev = this.manager.previousScene || 'landing';
      this.manager.navigateTo(prev);
    });
  }

  // ─── Vào chế độ edit ─────────────────────────────────────────────────────────
  _enterEdit() {
    this._isEditing = true;
    const t = this._target;

    document.getElementById('pf-view-mode').style.display = 'none';
    document.getElementById('pf-edit-mode').style.display = 'block';

    document.getElementById('pf-edit-name').value = t.name || '';
    document.getElementById('pf-edit-location').value = t.location || '';
    document.getElementById('pf-edit-website').value = t.website || '';
    document.getElementById('pf-edit-bio').value = t.bio || '';

    const actionsEl = document.getElementById('pf-actions');
    actionsEl.innerHTML = `
      <button id="pf-cancel-btn" class="pf-btn ghost">Huỷ</button>
      <button id="pf-save-btn" class="pf-btn gold">✓ Lưu</button>
    `;
    document.getElementById('pf-cancel-btn').addEventListener('click', () => this._cancelEdit());
    document.getElementById('pf-save-btn').addEventListener('click', () => this._saveProfile());
  }

  // ─── Huỷ edit ────────────────────────────────────────────────────────────────
  _cancelEdit() {
    this._isEditing = false;
    document.getElementById('pf-edit-mode').style.display = 'none';
    document.getElementById('pf-view-mode').style.display = 'block';

    const actionsEl = document.getElementById('pf-actions');
    actionsEl.innerHTML = `<button id="pf-edit-btn" class="pf-btn gold">✎ Chỉnh sửa</button>`;
    document.getElementById('pf-edit-btn').addEventListener('click', () => this._enterEdit());
  }

  // ─── Lưu profile ─────────────────────────────────────────────────────────────
  _saveProfile() {
    const newName     = document.getElementById('pf-edit-name').value.trim();
    const newLocation = document.getElementById('pf-edit-location').value.trim();
    const newWebsite  = document.getElementById('pf-edit-website').value.trim();
    const newBio      = document.getElementById('pf-edit-bio').value.trim();

    if (!newName) {
      document.getElementById('pf-edit-name').style.borderColor = 'rgba(181,74,58,.6)';
      setTimeout(() => {
        document.getElementById('pf-edit-name').style.borderColor = 'rgba(212,197,169,.22)';
      }, 1500);
      return;
    }

    // Lưu tất cả fields vào AuthManager (merge, giữ nguyên role)
    this.manager.auth.updateProfile({
      name: newName,
      location: newLocation,
      website: newWebsite,
      bio: newBio,
    });

    // Cập nhật target local
    this._target = { ...this.manager.auth.profile };

    // Cập nhật UI view
    document.getElementById('pf-name-display').textContent = newName;
    document.getElementById('pf-avatar-initial').textContent = newName.charAt(0).toUpperCase();
    document.getElementById('pf-website-view').textContent = newWebsite || '—';
    document.getElementById('pf-location-view').textContent = newLocation || '—';
    document.getElementById('pf-bio-view').textContent = newBio || '—';

    this._cancelEdit();
    this._showToast('✓ Đã lưu thông tin');
  }

  // ─── Load galleries của artist ───────────────────────────────────────────────
  async _loadGalleries() {
    const artistId = this._target.name;

    const { data } = await supabase
      .from('gallery')
      .select('name, created_at, scene_data')
      .order('created_at', { ascending: false });

    if (this._disposed) return;

    document.getElementById('pf-gallery-loading').style.display = 'none';

    // Lọc theo meta.artistId (cùng cách ExploreScene dùng)
    // Nếu xem profile của mình (isSelf) → hiện cả draft lẫn published
    // Nếu xem profile người khác → chỉ hiện published
    const rooms = (data || []).filter(row => {
      const meta = row.scene_data?._meta || {};
      if ((meta.artistId || row.name.split(':::')[0]) !== artistId) return false;
      return this._isSelf ? true : !!meta.isPublished;
    });

    if (!rooms.length) {
      document.getElementById('pf-gallery-empty').style.display = 'block';
      return;
    }

    const grid = document.getElementById('pf-gallery-grid');
    grid.style.display = 'grid';

    rooms.forEach(row => {
      const meta       = row.scene_data?._meta || {};
      const roomName   = meta.roomName || 'Phòng chưa đặt tên';
      const isPublished = !!meta.isPublished;
      const date       = new Date(row.created_at).toLocaleDateString('vi-VN');
      const count      = (row.scene_data?.artworks?.length || 0) + (row.scene_data?.models3d?.length || 0);

      const badgeHtml = isPublished
        ? `<span class="badge-pub">✓ Published</span>`
        : `<span style="display:inline-block;padding:2px 9px;font-size:9px;letter-spacing:.12em;text-transform:uppercase;border-radius:2px;background:rgba(212,197,169,.05);border:1px solid rgba(212,197,169,.18);color:#5a5040">Draft</span>`;

      const card = document.createElement('div');
      card.className = 'gallery-card';
      card.innerHTML = `
        <div style="color:#d4c5a9;font-size:13px;font-style:italic;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${roomName}</div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          ${badgeHtml}
          <span style="color:#3a3228;font-size:9px">${date}</span>
        </div>
        <div style="color:#5a5040;font-size:10px;letter-spacing:.06em">${count} tác phẩm</div>
      `;
      // Chỉ cho vào viewer nếu published; nếu là draft của chính mình → mở studio
      card.addEventListener('click', () => {
        if (isPublished) {
          this.manager.currentRoom = { id: row.name, name: roomName, artistId, isPublished: true };
          this.manager.navigateTo('viewer');
        } else if (this._isSelf) {
          this.manager.currentRoom = { id: row.name, name: roomName, artistId };
          this.manager.navigateTo('studio');
        }
      });
      grid.appendChild(card);
    });
  }

  // ─── Toast thông báo ─────────────────────────────────────────────────────────
  _showToast(msg) {
    const toast = document.getElementById('pf-toast');
    toast.textContent = msg;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 2200);
  }

  // ─── Token & Rank ────────────────────────────────────────────────────────────
  async _loadTokenRank() {
    const targetId = this._target?.id;
    if (!targetId) return;
    const FALLBACK_RANKS = [
      { name: 'Lữ khách',      min_tokens: 0,     badge_url: null },
      { name: 'Thám hiểm',     min_tokens: 500,   badge_url: '/badge/beginner.png' },
      { name: 'Người sưu tầm', min_tokens: 2000,  badge_url: null },
      { name: 'Nghệ nhân',     min_tokens: 5000,  badge_url: null },
      { name: 'Huyền thoại',   min_tokens: 15000, badge_url: null },
    ];

    const [pfRes, ranksRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', targetId).maybeSingle(),
      supabase.from('ranks').select('*').order('min_tokens', { ascending: false }),
    ]);

    const tokens = pfRes.data?.token_balance ?? 0;
    const ranks  = (ranksRes.data?.length ? ranksRes.data : FALLBACK_RANKS)
      .sort((a, b) => b.min_tokens - a.min_tokens);

    const section = document.getElementById('pf-rank-section');
    if (!section) return;
    section.style.display = 'block';

    document.getElementById('pf-token-count').textContent = `${tokens.toLocaleString('vi-VN')} ⭐ Ngôi Sao`;

    const rank = ranks.find(r => tokens >= r.min_tokens) || ranks[ranks.length - 1];
    document.getElementById('pf-rank-name').textContent = rank.name;

    if (rank.badge_url) {
      const icon = document.getElementById('pf-rank-icon');
      icon.innerHTML = `<img src="${rank.badge_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
    }

    const sortedAsc = [...ranks].sort((a, b) => a.min_tokens - b.min_tokens);
    const nextRank  = sortedAsc.find(r => r.min_tokens > tokens);
    if (nextRank) {
      const prevMin = rank.min_tokens;
      const pct = Math.min(100, ((tokens - prevMin) / (nextRank.min_tokens - prevMin)) * 100);
      document.getElementById('pf-rank-bar').style.width = pct + '%';
      document.getElementById('pf-rank-progress-text').textContent =
        `${tokens.toLocaleString('vi-VN')} / ${nextRank.min_tokens.toLocaleString('vi-VN')} → ${nextRank.name}`;
    } else {
      document.getElementById('pf-rank-bar').style.width = '100%';
      document.getElementById('pf-rank-progress-text').textContent = 'Rank cao nhất ✦';
    }
  }

  update(_dt) {
    if (this._particles) this._particles.rotation.y += _dt * 0.01;
  }
}

