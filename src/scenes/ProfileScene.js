import * as THREE from 'three';
import { BaseScene } from './BaseScene.js';
import { HEADER_H } from '../core/SceneManager.js';
import { supabase, STORAGE_BUCKET } from '../utils/supabase.js';

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
      console.log('profile:', JSON.stringify(this.manager.auth.profile));

    // Reset target sau khi đọc
    this.manager.profileTarget = null;

    this._isSelf = isSelf;
    this._isEditing = false;

    // Three.js background
    this.threeScene.background = new THREE.Color(0xF1FAFF);
    this.camera.position.set(0, 0, 5);
    this.threeScene.add(new THREE.AmbientLight(0xffffff, 0.2));
    this._createParticles();

    this._buildOverlay();

    if (this._target.role === 'artist') {
      await this._loadGalleries();
      await this._loadArtistRank();
      await this._loadProducts();
    } else {
      await this._loadTokenRank();
    }
  }

  // ─── Particles (giống DashboardScene) ───────────────────────────────────────
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

  // ─── Build toàn bộ UI ────────────────────────────────────────────────────────
  _buildOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'pf-overlay';
    overlay.style.cssText = `
      position:relative;width:100%;min-height:calc(100vh - ${HEADER_H}px);
      overflow-y:visible;z-index:100;font-family:'Montserrat',sans-serif;
      padding:40px 100px;box-sizing:border-box;background:#F1FAFF;font-size:17px;
    `;

    overlay.innerHTML = `
      <style>
        /* ── Global: Montserrat + #182D58 cho toàn overlay ── */
        #pf-overlay, #pf-overlay * {
          font-family: 'Montserrat', sans-serif !important;
          color: #182D58;
        }
        /* Giữ màu trắng cho nút có background tối */
        #pf-overlay .pf-btn,
        #pf-overlay .pf-btn.gold { color: #FFFFFF !important; }
        #pf-overlay .pf-btn.ghost { color: #182D58 !important; }
        #pf-overlay .pf-btn.danger { color: rgba(181,74,58,.6) !important; }
        #pf-overlay .pf-btn.danger:hover { color: #ff9090 !important; }
        /* Giữ màu chuyên biệt */
        #pf-overlay .pf-label { color: #888 !important; }
        #pf-overlay .pf-toast { color: #6aaa7a !important; }
        #pf-overlay .badge-pub { color: #6aaa7a !important; }
        #pf-overlay .pf-role-badge { color: #76AAAB !important; }
        #pf-overlay .product-price { color: #76AAAB !important; }
        #pf-overlay .review-stars { color: #76AAAB !important; }
        #pf-overlay .pf-avatar-circle { color: #76AAAB !important; }
        #pf-overlay .fr-time,
        #pf-overlay .pf-time { color: #aaa !important; }
        #pf-overlay input::placeholder,
        #pf-overlay textarea::placeholder { color: #aaa !important; }
        #pf-overlay .pgal-counter { color: #fff !important; }
        #pf-overlay .pgal-arrow { color: #fff !important; }
        #pf-overlay .pf-btn.ghost:hover { color: #182D58 !important; }

        .pf-section {
          background: #ffffff;
          border: 1px solid rgba(0,0,0,.1);
          border-radius: 6px;
          padding: 28px 32px;
          margin-bottom: 20px;
          box-shadow: 0 2px 8px rgba(0,0,0,.06);
        }
        .pf-label {
          color: #888;
          font-size:11px;
          letter-spacing: .18em;
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .pf-value {
          color: #182D58;
          font-size:15px;
          letter-spacing: .04em;
          min-height: 20px;
        }
        .pf-input {
          background: rgba(0,0,0,.04);
          border: 1px solid rgba(0,0,0,.12);
          border-radius: 3px;
          color: #1a1a1a;
          font-family: 'Montserrat', sans-serif;
          font-size:15px;
          padding: 8px 12px;
          width: 100%;
          box-sizing: border-box;
          outline: none;
          transition: border-color .2s;
        }
        .pf-input:focus { border-color: rgba(118,170,171,.5); }
        .pf-input::placeholder { color: #aaa; }
        .pf-textarea {
          resize: vertical;
          min-height: 80px;
        }
        .pf-btn {
          padding: 8px 20px;
          font-size:12px;
          cursor: pointer;
          font-family: 'Montserrat', sans-serif;
          font-weight: 700;
          letter-spacing: .08em;
          border-radius: 26px;
          transition: all .2s;
          border: 2px solid rgba(255,255,255,.25);
          background: #122F6A;
          color: #FFFFFF;
          box-shadow: 0 4px 12px rgba(118,170,171,.55);
          text-align: center;
        }
        .pf-btn:hover { box-shadow: 0 6px 18px rgba(118,170,171,.75); transform: translateY(-1px); }
        .pf-btn.gold {
          background: #122F6A;
          border-color: rgba(255,255,255,.35);
          color: #FFFFFF;
        }
        .pf-btn.gold:hover { box-shadow: 0 6px 18px rgba(118,170,171,.75); transform: translateY(-1px); }
        .pf-btn.ghost {
          background: none;
          border: 2px solid rgba(0,0,0,.15);
          color: #555;
          box-shadow: none;
        }
        .pf-btn.ghost:hover { border-color: rgba(0,0,0,.3); color: #222; box-shadow: none; transform: none; }
        .pf-btn.danger {
          background: none;
          border-color: rgba(181,74,58,.25);
          color: rgba(181,74,58,.6);
        }
        .pf-btn.danger:hover { background: rgba(181,74,58,.1); color: #ff9090; border-color: rgba(181,74,58,.5); }

        .gallery-card {
          background: #ffffff;
          border: 1px solid rgba(0,0,0,.1);
          border-radius: 6px;
          padding: 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          transition: border-color .2s;
          cursor: pointer;
          box-shadow: 0 1px 4px rgba(0,0,0,.05);
        }
        .gallery-card:hover { border-color: rgba(118,170,171,.5); }
        .badge-pub {
          display:inline-block;padding:2px 9px;font-size:11px;
          letter-spacing:.12em;text-transform:uppercase;border-radius:2px;
          background:rgba(106,170,122,.15);border:1px solid rgba(106,170,122,.35);color:#6aaa7a;
        }
        .pf-role-badge {
          display: inline-block;
          padding: 3px 12px;
          font-size:11px;
          letter-spacing: .18em;
          text-transform: uppercase;
          border-radius: 2px;
          border: 1px solid rgba(118,170,171,.3);
          color: #76AAAB;
          background: rgba(118,170,171,.08);
        }
        .pf-toast {
          position: fixed;
          bottom: 32px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(255,255,255,.98);
          border: 1px solid rgba(106,170,122,.4);
          color: #6aaa7a;
          padding: 10px 24px;
          font-family: 'Montserrat', sans-serif;
          font-size:13px;
          letter-spacing: .1em;
          border-radius: 4px;
          opacity: 0;
          transition: opacity .3s;
          z-index: 9999;
          pointer-events: none;
          box-shadow: 0 2px 12px rgba(0,0,0,.1);
        }
        .pf-avatar-circle {
          width: 46px; height: 46px;
          border-radius: 50%;
          background: rgba(118,170,171,.12);
          border: 2px solid rgba(118,170,171,.3);
          display: flex; align-items: center; justify-content: center;
          font-size:20px;
          color: #76AAAB;
          flex-shrink: 0;
          position: relative;
          overflow: hidden;
          cursor: pointer;
        }
        .pf-avatar-circle img {
          width: 100%; height: 100%; object-fit: cover; border-radius: 50%;
        }
        .pf-avatar-overlay {
          position: absolute; inset: 0;
          background: rgba(0,0,0,.38);
          display: flex; align-items: center; justify-content: center;
          opacity: 0;
          transition: opacity .2s;
          font-size:15px;
          border-radius: 50%;
        }
        .pf-avatar-circle:hover .pf-avatar-overlay { opacity: 1; }

        /* ── Products ── */
        .product-card {
          background: #ffffff;
          border: 1px solid rgba(0,0,0,.1);
          border-radius: 6px;
          overflow: hidden;
          transition: border-color .2s;
          box-shadow: 0 1px 4px rgba(0,0,0,.05);
        }
        .product-card:hover { border-color: rgba(0,0,0,.2); }
        .product-img { width:100%; height:220px; object-fit:cover; background:#f0f0f0; display:block; }
        .product-body { padding: 20px 24px 16px; }
        .product-title { color:#182D58; font-family:'Montserrat',sans-serif; font-size:16px; font-weight:700; margin-bottom:10px; }
        .product-desc { color:#555; font-size:13px; line-height:1.75; margin-bottom:14px; white-space:pre-wrap; }
        .product-price { color:#76AAAB; font-size:17px; letter-spacing:.04em; margin-bottom:16px; }
        .product-actions { display:flex; gap:8px; flex-wrap:wrap; }

        /* ── Reviews ── */
        .review-section { border-top:.5px solid rgba(0,0,0,.06); padding:14px 24px 20px; }
        .review-toggle-btn { background:none; border:none; cursor:pointer; color:#666; font-size:11px; font-family:'Montserrat',sans-serif; letter-spacing:.14em; text-transform:uppercase; padding:0; transition:color .2s; }
        .review-toggle-btn:hover { color:#222; }
        .review-item { padding:10px 0; border-bottom:.5px solid rgba(0,0,0,.06); }
        .review-item:last-child { border-bottom:none; }
        .review-meta { display:flex; align-items:center; gap:10px; margin-bottom:5px; }
        .review-stars { font-size:13px; letter-spacing:1px; color:#76AAAB; }
        .review-author { color:#666; font-size:11px; letter-spacing:.1em; }
        .review-body { color:#555; font-size:13px; line-height:1.65; }
        .review-form { margin-top:16px; padding-top:14px; border-top:.5px solid rgba(0,0,0,.06); }
        .star-picker { display:flex; gap:4px; margin-bottom:12px; }
        .star-pick-btn { background:none; border:none; cursor:pointer; font-size:22px; padding:0; line-height:1; opacity:.25; transition:opacity .15s,transform .1s; }
        .star-pick-btn.on { opacity:1; }
        .star-pick-btn:hover { transform:scale(1.15); }

        /* ── Gallery carousel ── */
        .product-gallery { position:relative; background:#f0f0f0; }
        .pgal-main { width:100%; height:260px; display:flex; align-items:center; justify-content:center; overflow:hidden; }
        .pgal-main img { width:100%; height:100%; object-fit:cover; display:block; }
        .pgal-main video { width:100%; height:100%; object-fit:contain; background:#000; display:block; }
        .pgal-arrow { position:absolute; top:50%; transform:translateY(-50%); background:rgba(0,0,0,.4); border:none; color:#fff; font-size:22px; padding:6px 12px; cursor:pointer; z-index:2; transition:background .15s; border-radius:3px; line-height:1; }
        .pgal-arrow:hover { background:rgba(0,0,0,.7); }
        .pgal-arrow.left { left:8px; }
        .pgal-arrow.right { right:8px; }
        .pgal-counter { position:absolute; bottom:8px; right:10px; background:rgba(0,0,0,.5); color:#fff; font-size:11px; font-family:'Montserrat',sans-serif; padding:2px 8px; border-radius:10px; letter-spacing:.06em; }
        .pgal-thumbs { display:flex; gap:4px; padding:4px; background:#f5f5f5; overflow-x:auto; }
        .pgal-thumbs::-webkit-scrollbar { height:2px; }
        .pgal-thumbs::-webkit-scrollbar-thumb { background:rgba(0,0,0,.15); }
        .pgal-thumb { width:52px; height:40px; flex-shrink:0; cursor:pointer; border-radius:2px; overflow:hidden; opacity:.45; transition:opacity .15s; border:1.5px solid transparent; }
        .pgal-thumb.active { opacity:1; border-color:rgba(118,170,171,.7); }
        .pgal-thumb img,.pgal-thumb video { width:100%; height:100%; object-fit:cover; display:block; pointer-events:none; }

        /* ── Upload zone ── */
        .pm-upload-zone { border:1.5px dashed rgba(0,0,0,.15); border-radius:5px; padding:24px 16px; text-align:center; cursor:pointer; transition:border-color .2s,background .2s; }
        .pm-upload-zone:hover,.pm-upload-zone.drag-over { border-color:rgba(118,170,171,.5); background:rgba(118,170,171,.05); }
        .pm-upload-zone input[type=file] { display:none; }
        .pm-previews { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
        .pm-thumb { position:relative; width:72px; height:56px; border-radius:3px; overflow:hidden; border:1px solid rgba(0,0,0,.1); flex-shrink:0; }
        .pm-thumb img,.pm-thumb video { width:100%; height:100%; object-fit:cover; display:block; }
        .pm-thumb-rm { position:absolute; top:2px; right:2px; background:rgba(0,0,0,.7); border:none; color:#fff; font-size:12px; width:16px; height:16px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; line-height:1; padding:0; }
        .pm-thumb-rm:hover { background:rgba(181,74,58,.85); }
        .pm-upload-progress { margin-top:8px; height:3px; background:rgba(0,0,0,.08); border-radius:2px; overflow:hidden; display:none; }
        .pm-upload-progress-bar { height:100%; background:linear-gradient(90deg,rgba(118,170,171,.5),rgba(118,170,171,1)); border-radius:2px; transition:width .2s; width:0%; }

        /* ── Product modal ── */
        .pf-product-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; z-index:3000; }
        .pf-modal-inner { background:#ffffff; border:1px solid rgba(0,0,0,.12); border-radius:8px; padding:32px; width:min(540px,92vw); max-height:90vh; overflow-y:auto; box-sizing:border-box; box-shadow:0 8px 40px rgba(0,0,0,.15); }

        /* ── Product detail modal (toàn cảnh) ── */
        .pf-detail-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.65); display:flex; align-items:center; justify-content:center; z-index:3500; padding:16px; box-sizing:border-box; }
        .pf-detail-modal-inner {
          background:#ffffff; border-radius:10px; width:min(900px,96vw); max-height:78vh;
          overflow-y:auto; box-sizing:border-box; box-shadow:0 16px 60px rgba(0,0,0,.25);
          display:grid; grid-template-columns:1fr 1fr; gap:0;
        }
        .pf-detail-media { background:#f0f0f0; border-radius:10px 0 0 10px; overflow:hidden; position:relative; min-height:280px; }
        .pf-detail-media .pgal-main { height:100%; min-height:280px; }
        .pf-detail-info { padding:32px 28px; display:flex; flex-direction:column; overflow-y:auto; }
        .pf-detail-close {
          position:absolute; top:14px; right:14px; background:rgba(0,0,0,.45); border:none;
          color:#fff; width:32px; height:32px; border-radius:50%; cursor:pointer;
          font-size:18px; display:flex; align-items:center; justify-content:center;
          z-index:10; transition:background .15s; line-height:1;
        }
        .pf-detail-close:hover { background:rgba(0,0,0,.75); }
        @media(max-width:640px) {
          .pf-detail-modal-inner { grid-template-columns:1fr; }
          .pf-detail-media { border-radius:10px 10px 0 0; min-height:200px; }
          .pf-detail-media .pgal-main { min-height:200px; height:200px; }
          #pf-products-list { grid-template-columns:repeat(2,1fr) !important; }
        }
        @media(max-width:480px) {
          #pf-products-list { grid-template-columns:1fr !important; }
          #pf-top-row { grid-template-columns:1fr !important; }
        }
        /* product card grid: ảnh chiếm toàn width, body nhỏ gọn */
        .product-card { cursor:pointer; }
        .product-card:hover { border-color:rgba(118,170,171,.5); box-shadow:0 4px 16px rgba(0,0,0,.1); transform:translateY(-2px); transition:all .2s; }
        .product-img-wrap { width:100%; aspect-ratio:1/1; overflow:hidden; background:#f0f0f0; }
        .product-img-wrap .pgal-main { height:100%; aspect-ratio:1/1; }
        .product-img-wrap img, .product-img-wrap video { width:100%; height:100%; object-fit:cover; display:block; }

        /* ── Cover photo ── */
        .pf-cover { width:100%; height:180px; background:linear-gradient(135deg,#c8e6e9 0%,#e0f2f3 100%); border-radius:8px; overflow:hidden; margin-bottom:20px; position:relative; flex-shrink:0; }
        .pf-cover img { width:100%; height:100%; object-fit:cover; display:block; }
        .pf-cover-edit-btn { position:absolute; top:12px; right:14px; background:rgba(255,255,255,.88); border:1px solid rgba(0,0,0,.1); border-radius:20px; padding:5px 14px; cursor:pointer; font-size:12px; font-family:'Montserrat',sans-serif; letter-spacing:.06em; align-items:center; gap:6px; transition:background .15s; color:#182D58 !important; }
        .pf-cover-edit-btn:hover { background:rgba(255,255,255,1); }
        /* ── Subtabs ── */
        .pf-subtab-btn { padding:10px 20px; font-size:12px; letter-spacing:.12em; text-transform:uppercase; cursor:pointer; border:none; background:none; color:#888 !important; font-family:'Montserrat',sans-serif; font-weight:600; border-bottom:2px solid transparent; margin-bottom:-2px; transition:all .2s; white-space:nowrap; }
        .pf-subtab-btn.active { color:#182D58 !important; border-bottom-color:#182D58; }
        .pf-subtab-btn:hover { color:#182D58 !important; }
        /* ── Follow user card ── */
        .pf-follow-card { background:#fff; border:1px solid rgba(0,0,0,.1); border-radius:6px; padding:14px 16px; display:flex; align-items:center; gap:12px; cursor:pointer; transition:border-color .2s; box-shadow:0 1px 4px rgba(0,0,0,.05); }
        .pf-follow-card:hover { border-color:rgba(118,170,171,.5); }

      </style>

      <!-- Toast -->
      <div id="pf-toast" class="pf-toast">✓ Đã lưu thông tin</div>

      <!-- Header row -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <button id="pf-back" class="pf-btn ghost" style="font-size:13px">← Quay lại</button>
        <div id="pf-actions" style="display:flex;gap:10px"></div>
      </div>

      <!-- Cover photo -->
      <div id="pf-cover" class="pf-cover">
        <img id="pf-cover-img" style="display:none" />
        <div id="pf-cover-edit-btn" class="pf-cover-edit-btn" style="display:none">
          📷 Đổi ảnh bìa
          <input type="file" id="pf-cover-input" accept="image/*" style="display:none" />
        </div>
      </div>

      <!-- Profile + Rank row -->
      <div id="pf-top-row" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">

      <!-- Profile card -->
      <div class="pf-section" style="margin-bottom:0;padding:14px 18px">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">
          <div class="pf-avatar-circle" id="pf-avatar-display">
            <span id="pf-avatar-initial"></span>
            <div class="pf-avatar-overlay">📷</div>
            <input type="file" id="pf-avatar-input" accept="image/*" style="display:none" />
          </div>
          <div>
            <div style="color:#1a1a1a;font-size:15px;font-weight:bold;letter-spacing:.08em" id="pf-name-display"></div>
            <div style="margin-top:4px"><span class="pf-role-badge" id="pf-role-display"></span></div>
            <div id="pf-follow-stats" style="margin-top:8px;display:flex;gap:16px;flex-wrap:wrap"></div>
          </div>
        </div>

        <!-- View mode -->
        <div id="pf-view-mode">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;margin-bottom:10px" id="pf-fields-view">
            <div>
              <div class="pf-label">Website / Mạng xã hội</div>
              <div class="pf-value" id="pf-website-view" style="color:#666;font-size:13px">—</div>
            </div>
            <div>
              <div class="pf-label">Địa điểm</div>
              <div class="pf-value" id="pf-location-view" style="color:#666;font-size:13px">—</div>
            </div>
          </div>
          <div>
            <div class="pf-label">Giới thiệu</div>
            <div class="pf-value" id="pf-bio-view" style="color:#555;line-height:1.6;font-size:13px">—</div>
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

      <!-- Rank column (right side) -->
      <div id="pf-rank-col" style="display:flex;flex-direction:column;gap:10px;height:100%">

      <!-- Rank & Token -->
      <div id="pf-rank-section" class="pf-section" style="display:none;margin-bottom:0;padding:14px 16px;flex:1">
        <div style="display:flex;align-items:center;gap:12px">
          <div id="pf-rank-icon" style="width:38px;height:38px;border-radius:50%;background:rgba(118,170,171,.1);border:.5px solid rgba(118,170,171,.25);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">⭐</div>
          <div>
            <div style="color:#76AAAB;font-size:14px;letter-spacing:.06em" id="pf-rank-name">—</div>
            <div style="color:#666;font-size:11px;margin-top:3px" id="pf-token-count"></div>
          </div>
        </div>
        <div style="margin-top:12px">
          <div style="display:flex;justify-content:space-between;margin-bottom:5px">
            <span style="color:#182D58;font-family:'Montserrat',sans-serif;font-size:10px;letter-spacing:.1em;text-transform:uppercase">Tiến độ</span>
            <span style="color:#666;font-size:10px" id="pf-rank-progress-text"></span>
          </div>
          <div style="height:3px;background:rgba(0,0,0,.08);border-radius:2px;overflow:hidden">
            <div id="pf-rank-bar" style="height:100%;background:linear-gradient(90deg,rgba(118,170,171,.5),rgba(118,170,171,1));border-radius:2px;transition:width .6s;width:0%"></div>
          </div>
        </div>
      </div>

      <!-- Artist Rank (hiện khi là artist) -->
      <div id="pf-artist-rank-section" class="pf-section" style="display:none;margin-bottom:0;padding:14px 16px;flex:1">
        <div style="display:flex;align-items:center;gap:12px">
          <div id="pf-artist-rank-icon" style="width:38px;height:38px;border-radius:50%;background:rgba(118,170,171,.1);border:.5px solid rgba(118,170,171,.25);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">🎨</div>
          <div>
            <div style="color:#76AAAB;font-size:14px;letter-spacing:.06em" id="pf-artist-rank-name">—</div>
            <div style="color:#666;font-size:11px;margin-top:3px" id="pf-artist-like-count"></div>
          </div>
        </div>
        <div style="margin-top:12px">
          <div style="display:flex;justify-content:space-between;margin-bottom:5px">
            <span style="color:#182D58;font-family:'Montserrat',sans-serif;font-size:10px;letter-spacing:.1em;text-transform:uppercase">Tiến độ</span>
            <span style="color:#666;font-size:10px" id="pf-artist-rank-progress-text"></span>
          </div>
          <div style="height:3px;background:rgba(0,0,0,.08);border-radius:2px;overflow:hidden">
            <div id="pf-artist-rank-bar" style="height:100%;background:linear-gradient(90deg,rgba(118,170,171,.5),rgba(118,170,171,1));border-radius:2px;transition:width .6s;width:0%"></div>
          </div>
        </div>
      </div><!-- end pf-artist-rank-section -->
      </div><!-- end pf-rank-col -->
      </div><!-- end pf-top-row -->

      <!-- Subtabs container -->
      <div id="pf-subtabs-container" style="margin-top:8px">
        <div id="pf-subtabs-nav" style="display:flex;border-bottom:2px solid rgba(0,0,0,.07);margin-bottom:24px;overflow-x:auto"></div>

        <!-- Gallery tab (artist only) -->
        <div id="pf-tab-gallery" style="display:none">
          <div id="pf-gallery-section" style="display:none">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
            <div style="color:#182D58;font-family:'Montserrat',sans-serif;font-size:20px;font-weight:700;letter-spacing:.02em;text-transform:none">Phòng triển lãm</div>          <button id="pf-new-room-btn" class="pf-btn gold" style="display:none;font-size:12px">＋ Tạo phòng mới</button>
            </div>
            <div id="pf-gallery-loading" style="color:#888;font-size:13px;letter-spacing:.1em;text-align:center;padding:40px">
              Đang tải...
            </div>
            <div id="pf-gallery-empty" style="display:none;color:#888;font-size:13px;letter-spacing:.1em;text-align:center;padding:40px">
              Chưa có phòng triển lãm nào
            </div>
            <div id="pf-gallery-grid" style="display:none;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px"></div>
          </div>
        </div>

        <!-- Products tab (artist only) -->
        <div id="pf-tab-products" style="display:none">
          <div id="pf-products-section" style="display:none">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
            <div style="color:#182D58;font-family:'Montserrat',sans-serif;font-size:20px;font-weight:700;letter-spacing:.02em;text-transform:none">Sản phẩm</div>          <button id="pf-add-product-btn" class="pf-btn gold" style="display:none">+ Thêm sản phẩm</button>
            </div>
            <div id="pf-products-loading" style="color:#888;font-size:13px;letter-spacing:.1em;text-align:center;padding:40px">Đang tải...</div>
            <div id="pf-products-empty" style="display:none;color:#888;font-size:13px;letter-spacing:.1em;text-align:center;padding:40px">Chưa có sản phẩm nào</div>
            <div id="pf-products-list" style="display:none;grid-template-columns:repeat(3,1fr);gap:20px"></div>
          </div>
        </div>

        <!-- Following tab -->
        <div id="pf-tab-following" style="display:none">
          <div id="pf-following-loading" style="color:#888;font-size:13px;letter-spacing:.1em;text-align:center;padding:40px">Đang tải...</div>
          <div id="pf-following-empty" style="display:none;color:#888;font-size:13px;letter-spacing:.1em;text-align:center;padding:40px">Chưa theo dõi ai</div>
          <div id="pf-following-list" style="display:none;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px"></div>
        </div>

        <!-- Followers tab -->
        <div id="pf-tab-followers" style="display:none">
          <div id="pf-followers-loading" style="color:#888;font-size:13px;letter-spacing:.1em;text-align:center;padding:40px">Đang tải...</div>
          <div id="pf-followers-empty" style="display:none;color:#888;font-size:13px;letter-spacing:.1em;text-align:center;padding:40px">Chưa có người theo dõi</div>
          <div id="pf-followers-list" style="display:none;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px"></div>
        </div>
      </div>

      <!-- Product form modal -->
      <div id="pf-product-modal" style="display:none" class="pf-product-modal-overlay">
        <div class="pf-modal-inner">
          <div style="color:#1a1a1a;font-size:15px;letter-spacing:.1em;margin-bottom:24px" id="pf-modal-title">Thêm sản phẩm</div>
          <div style="margin-bottom:14px">
            <div class="pf-label">Tên sản phẩm *</div>
            <input id="pm-title" class="pf-input" placeholder="VD: Tranh sơn dầu – Bình minh tháng Ba" />
          </div>
          <div style="margin-bottom:14px">
            <div class="pf-label">Mô tả chi tiết</div>
            <textarea id="pm-desc" class="pf-input pf-textarea" style="min-height:110px" placeholder="Chất liệu, kích thước, kỹ thuật, cảm hứng sáng tác..."></textarea>
          </div>
          <div style="margin-bottom:14px">
            <div class="pf-label">Giá (VD: 2,500,000 ₫)</div>
            <input id="pm-price" class="pf-input" placeholder="2,500,000 ₫" style="max-width:200px" />
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
            <div>
              <div class="pf-label">Chất liệu</div>
              <input id="pm-material" class="pf-input" placeholder="VD: Sơn dầu trên canvas" />
            </div>
            <div>
              <div class="pf-label">Kích thước</div>
              <input id="pm-dimensions" class="pf-input" placeholder="VD: 60×80 cm" />
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
            <div>
              <div class="pf-label">Số lượng còn lại</div>
              <input id="pm-stock" class="pf-input" type="number" min="0" placeholder="VD: 1" />
            </div>
            <div>
              <div class="pf-label">Mẫu mã / Biến thể (phân cách bằng dấu phẩy)</div>
              <input id="pm-variants" class="pf-input" placeholder="VD: Nhỏ, Vừa, Lớn" />
            </div>
          </div>
          <div style="margin-bottom:4px">
            <div class="pf-label" style="margin-bottom:8px">Ảnh / Video sản phẩm</div>
            <div class="pm-upload-zone" id="pm-upload-zone">
              <input type="file" id="pm-file-input" multiple accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime" />
              <div style="font-size:24px;margin-bottom:6px">📁</div>
              <div style="color:#555;font-size:13px;margin-bottom:4px">Kéo thả hoặc <span style="color:#76AAAB;text-decoration:underline">click để chọn file</span></div>
              <div style="color:#999;font-size:11px;letter-spacing:.08em">JPG · PNG · GIF · WEBP · MP4 · MOV · WEBM &nbsp;|&nbsp; tối đa 50 MB / file</div>
            </div>
            <div class="pm-previews" id="pm-previews"></div>
            <div class="pm-upload-progress" id="pm-upload-progress">
              <div class="pm-upload-progress-bar" id="pm-upload-bar"></div>
            </div>
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:24px">
            <button id="pm-cancel-btn" class="pf-btn ghost">Huỷ</button>
            <button id="pm-save-btn" class="pf-btn gold">Lưu sản phẩm</button>
          </div>
        </div>
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

    // Hiện ảnh đại diện nếu có
    if (t.avatarUrl) {
      const avatarEl = document.getElementById('pf-avatar-display');
      const initial  = document.getElementById('pf-avatar-initial');
      if (initial) initial.style.display = 'none';
      const img = document.createElement('img');
      img.src = t.avatarUrl;
      avatarEl?.insertBefore(img, avatarEl.querySelector('.pf-avatar-overlay'));
    }

    document.getElementById('pf-website-view').textContent = t.website || '—';
    document.getElementById('pf-location-view').textContent = t.location || '—';
    document.getElementById('pf-bio-view').textContent = t.bio || '—';

    // Hiện gallery + products section nếu là artist
    if (t.role === 'artist') {
      document.getElementById('pf-gallery-section').style.display = 'block';
      document.getElementById('pf-products-section').style.display = 'block';
      if (this._isSelf) {
        const addBtn = document.getElementById('pf-add-product-btn');
        addBtn.style.display = 'inline-block';
        addBtn.addEventListener('click', () => this._openProductForm(null));

        const newRoomBtn = document.getElementById('pf-new-room-btn');
        if (newRoomBtn) {
          newRoomBtn.style.display = 'inline-block';
          newRoomBtn.addEventListener('click', () => this._createNewRoom());
        }
      }
    }

    // Ảnh bìa
    if (t.coverUrl) {
      const coverImg = document.getElementById('pf-cover-img');
      if (coverImg) { coverImg.src = t.coverUrl; coverImg.style.display = 'block'; }
    }
    if (this._isSelf) {
      const coverEditBtn = document.getElementById('pf-cover-edit-btn');
      if (coverEditBtn) coverEditBtn.style.display = 'flex';
    }

    // Subtabs
    const artistTabs = [
      { id: 'gallery',   label: 'Phòng triển lãm' },
      { id: 'products',  label: 'Sản phẩm' },
      { id: 'following', label: 'Đang theo dõi' },
      { id: 'followers', label: 'Người theo dõi' },
    ];
    const visitorTabs = [
      { id: 'following', label: 'Đang theo dõi' },
      { id: 'followers', label: 'Người theo dõi' },
    ];
    const tabs = t.role === 'artist' ? artistTabs : visitorTabs;
    this._setupSubtabs(tabs, tabs[0].id);

    // Nút action
    const actionsEl = document.getElementById('pf-actions');
    if (this._isSelf) {
      actionsEl.innerHTML = `<button id="pf-edit-btn" class="pf-btn gold">✎ Chỉnh sửa</button>`;
      document.getElementById('pf-edit-btn').addEventListener('click', () => this._enterEdit());
    } else if (this.manager.auth.isLoggedIn) {
      actionsEl.innerHTML = `<button id="pf-follow-btn" class="pf-btn ghost" style="min-width:120px;letter-spacing:.06em" disabled>...</button>`;
      this._loadFollowState();
    }
    this._loadFollowCounts();
  }

  // ─── Tải trạng thái follow ────────────────────────────────────────────────────
  async _loadFollowState() {
    const me = this.manager.auth.profile;
    const targetId = this._target.id;
    if (!me?.id || !targetId) {
      const btn = document.getElementById('pf-follow-btn');
      if (btn) { btn.textContent = '+ Theo dõi'; btn.disabled = true; }
      return;
    }
    const { data } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('follower_id', me.id)
      .eq('following_id', targetId)
      .maybeSingle();
    if (this._disposed) return;
    this._isFollowing = !!data;
    this._updateFollowBtn();
  }

  _updateFollowBtn() {
    const btn = document.getElementById('pf-follow-btn');
    if (!btn) return;
    btn.disabled = false;
    if (this._isFollowing) {
      btn.textContent = '✓ Đang theo dõi';
      btn.className = 'pf-btn ghost';
    } else {
      btn.textContent = '+ Theo dõi';
      btn.className = 'pf-btn gold';
    }
    btn.onclick = () => this._toggleFollow();
  }

  async _toggleFollow() {
    const me = this.manager.auth.profile;
    const targetId = this._target.id;
    if (!me?.id || !targetId) return;
    const btn = document.getElementById('pf-follow-btn');
    if (btn) btn.disabled = true;
    if (this._isFollowing) {
      await supabase.from('follows').delete()
        .eq('follower_id', me.id).eq('following_id', targetId);
      this._isFollowing = false;
    } else {
      await supabase.from('follows').insert({ follower_id: me.id, following_id: targetId });
      this._isFollowing = true;
    }
    if (this._disposed) return;
    this._updateFollowBtn();
    this._loadFollowCounts();
    this._reloadFollowTabs();
  }

  _reloadFollowTabs() {
    ['following', 'followers'].forEach(type => {
      if (!this._followLoaded?.[type]) return;
      const listEl    = document.getElementById('pf-' + type + '-list');
      const emptyEl   = document.getElementById('pf-' + type + '-empty');
      const loadingEl = document.getElementById('pf-' + type + '-loading');
      if (listEl)    { listEl.innerHTML = ''; listEl.style.display = 'none'; }
      if (emptyEl)   emptyEl.style.display = 'none';
      if (loadingEl) loadingEl.style.display = 'block';
      this._followLoaded[type] = false;
      this._loadFollows(type);
    });
  }

  async _loadFollowCounts() {
    const targetId = this._target.id;
    if (!targetId) return;
    const [{ count: followers }, { count: following }] = await Promise.all([
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', targetId),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', targetId),
    ]);
    if (this._disposed) return;
    const el = document.getElementById('pf-follow-stats');
    if (!el) return;
    el.innerHTML = `
      <span style="font-size:12px;color:#666"><strong style="color:#182D58;font-weight:700">${followers ?? 0}</strong> người theo dõi</span>
      <span style="font-size:12px;color:#666"><strong style="color:#182D58;font-weight:700">${following ?? 0}</strong> đang theo dõi</span>
    `;
  }

  // ─── Bind nút quay lại + cart FAB + checkout ─────────────────────────────────
  _bindActions() {
    document.getElementById('pf-back').addEventListener('click', () => {
      const prev = this.manager.previousScene || 'landing';
      this.manager.navigateTo(prev);
    });

    // ── Avatar upload ──
    const avatarEl  = document.getElementById('pf-avatar-display');
    const avatarInp = document.getElementById('pf-avatar-input');
    if (avatarEl && avatarInp) {
      avatarEl.addEventListener('click', () => {
        if (this._isSelf) avatarInp.click();
      });
      avatarInp.addEventListener('change', async () => {
        const file = avatarInp.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { this._showToast('Ảnh quá lớn (tối đa 5 MB)'); return; }
        const ext  = file.name.split('.').pop().toLowerCase();
        const path = `avatars/${this._target.id || this._target.name}_${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: true });
        if (error) { this._showToast('Lỗi tải ảnh: ' + error.message); return; }
        const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
        // Cập nhật UI
        const initial = document.getElementById('pf-avatar-initial');
        if (initial) initial.style.display = 'none';
        // Xoá img cũ nếu có
        avatarEl.querySelector('img')?.remove();
        const img = document.createElement('img');
        img.src = publicUrl;
        avatarEl.insertBefore(img, avatarEl.querySelector('.pf-avatar-overlay'));
        // Lưu vào profile
        this.manager.auth.updateProfile({ avatarUrl: publicUrl });
        this._showToast('✓ Đã cập nhật ảnh đại diện');
        avatarInp.value = '';
      });
    }

    // ── Cover upload ──
    const coverEditBtn = document.getElementById('pf-cover-edit-btn');
    const coverInp     = document.getElementById('pf-cover-input');
    if (coverEditBtn && coverInp && this._isSelf) {
      coverEditBtn.addEventListener('click', (e) => {
        if (e.target !== coverInp) coverInp.click();
      });
      coverInp.addEventListener('change', async () => {
        const file = coverInp.files?.[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { this._showToast('Ảnh quá lớn (tối đa 10 MB)'); return; }
        const ext  = file.name.split('.').pop().toLowerCase();
        const path = `covers/${this._target.id || this._target.name}_${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: true });
        if (error) { this._showToast('Lỗi tải ảnh: ' + error.message); return; }
        const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
        const coverImg = document.getElementById('pf-cover-img');
        if (coverImg) { coverImg.src = publicUrl; coverImg.style.display = 'block'; }
        this.manager.auth.updateProfile({ coverUrl: publicUrl });
        this._showToast('✓ Đã cập nhật ảnh bìa');
        coverInp.value = '';
      });
    }
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
        document.getElementById('pf-edit-name').style.borderColor = 'rgba(0,0,0,.12)';
      }, 1500);
      return;
    }

    this.manager.auth.updateProfile({ name: newName, location: newLocation, website: newWebsite, bio: newBio });

    this._target = { ...this.manager.auth.profile };

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
    const artistId   = this._target.id   || this._target.name;
    const artistName = this._target.name || '';
    const prefix     = artistId + ':::';

    const { data } = await supabase
      .from('gallery')
      .select('name, created_at, scene_data')
      .order('created_at', { ascending: false });

    if (this._disposed) return;

    document.getElementById('pf-gallery-loading').style.display = 'none';

    // Khớp phòng theo meta.artistId HOẶC tiền tố tên phòng (như DashboardScene).
    // Dùng || riêng biệt để không bị short-circuit khi meta.artistId sai UUID.
    // Nếu xem profile của mình (isSelf) → hiện cả draft lẫn published
    // Nếu xem profile người khác → chỉ hiện published
    const rooms = (data || []).filter(row => {
      const meta = row.scene_data?._meta || {};
      const metaId = meta.artistId;

      const matched =
        (metaId && (metaId === artistId || metaId === artistName)) ||
        row.name.startsWith(prefix) ||
        (!artistId && artistName && row.name.split(':::')[0] === artistName);

      if (!matched) return false;
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
        : `<span style="display:inline-block;padding:2px 9px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;border-radius:2px;background:rgba(0,0,0,.04);border:1px solid rgba(0,0,0,.12);color:#777">Draft</span>`;

      const card = document.createElement('div');
      card.className = 'gallery-card';
      card.innerHTML = `
        <div style="color:#1a1a1a;font-size:15px;font-style:italic;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${roomName}</div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          ${badgeHtml}
          <span style="color:#999;font-size:11px">${date}</span>
        </div>
        <div style="color:#666;font-size:12px;letter-spacing:.06em">${count} tác phẩm</div>
        ${this._isSelf ? `<div style="display:flex;gap:8px;margin-top:6px">
          <button class="pf-btn ghost pf-room-edit-btn" style="font-size:12px;padding:5px 12px">✎ Chỉnh sửa</button>
          <button class="pf-btn danger pf-room-del-btn" style="font-size:12px;padding:5px 12px">🗑 Xoá</button>
        </div>` : ''}
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.pf-room-edit-btn, .pf-room-del-btn')) return;
        if (isPublished) {
          this.manager.currentRoom = { id: row.name, name: roomName, artistId, isPublished: true };
          this.manager.navigateTo('viewer');
        } else if (this._isSelf) {
          this.manager.currentRoom = { id: row.name, name: roomName, artistId };
          this.manager.navigateTo('studio');
        }
      });

      if (this._isSelf) {
        card.querySelector('.pf-room-edit-btn').addEventListener('click', () => {
          this.manager.currentRoom = { id: row.name, name: roomName, artistId, isPublished };
          this.manager.navigateTo('studio');
        });

        card.querySelector('.pf-room-del-btn').addEventListener('click', async (e) => {
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
          if (!document.querySelectorAll('#pf-gallery-grid .gallery-card').length) {
            document.getElementById('pf-gallery-grid').style.display = 'none';
            document.getElementById('pf-gallery-empty').style.display = 'block';
          }
        });
      }

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

  // ─── Artist Rank (dựa trên lượt thích) ──────────────────────────────────────
  async _loadArtistRank() {
    const ARTIST_RANKS = [
      { name: 'Tập sinh',     min_likes: 0 },
      { name: 'Họa sĩ',      min_likes: 50 },
      { name: 'Bậc thầy',    min_likes: 300 },
      { name: 'Đại danh họa', min_likes: 1500 },
      { name: 'Bất tử',      min_likes: 8000 },
    ];

    const artistId = this._target.id || this._target.name;

    const { data: allGalleries } = await supabase
      .from('gallery')
      .select('name, scene_data');

    if (this._disposed) return;

    const galleryNames = (allGalleries || [])
      .filter(row => {
        const meta = row.scene_data?._meta || {};
        return (meta.artistId || row.name.split(':::')[0]) === artistId && !!meta.isPublished;
      })
      .map(row => row.name);

    let totalLikes = 0;
    if (galleryNames.length > 0) {
      const { count } = await supabase
        .from('gallery_likes')
        .select('*', { count: 'exact', head: true })
        .in('gallery_name', galleryNames);
      totalLikes = count ?? 0;
    }

    if (this._disposed) return;

    const section = document.getElementById('pf-artist-rank-section');
    if (!section) return;
    section.style.display = 'block';

    document.getElementById('pf-artist-like-count').textContent =
      `${totalLikes.toLocaleString('vi-VN')} ♥ Lượt thích`;

    const ranksDesc = [...ARTIST_RANKS].sort((a, b) => b.min_likes - a.min_likes);
    const rank = ranksDesc.find(r => totalLikes >= r.min_likes) || ranksDesc[ranksDesc.length - 1];
    document.getElementById('pf-artist-rank-name').textContent = rank.name;

    const ranksAsc = [...ARTIST_RANKS].sort((a, b) => a.min_likes - b.min_likes);
    const nextRank = ranksAsc.find(r => r.min_likes > totalLikes);
    if (nextRank) {
      const pct = Math.min(100, ((totalLikes - rank.min_likes) / (nextRank.min_likes - rank.min_likes)) * 100);
      document.getElementById('pf-artist-rank-bar').style.width = pct + '%';
      document.getElementById('pf-artist-rank-progress-text').textContent =
        `${totalLikes.toLocaleString('vi-VN')} / ${nextRank.min_likes.toLocaleString('vi-VN')} → ${nextRank.name}`;
    } else {
      document.getElementById('pf-artist-rank-bar').style.width = '100%';
      document.getElementById('pf-artist-rank-progress-text').textContent = 'Rank cao nhất ✦';
    }
  }

  // ─── Load products của artist ────────────────────────────────────────────────
  async _loadProducts() {
    const artistName = this._target.name;
    const { data } = await supabase
      .from('artist_products')
      .select('*')
      .eq('artist_name', artistName)
      .order('created_at', { ascending: false });

    if (this._disposed) return;

    const loadingEl = document.getElementById('pf-products-loading');
    if (loadingEl) loadingEl.style.display = 'none';

    const products = data || [];
    if (products.length === 0) {
      const emptyEl = document.getElementById('pf-products-empty');
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }
    this._renderProducts(products);
  }

  // ─── Render product list ─────────────────────────────────────────────────────
  _renderProducts(products) {
    const listEl = document.getElementById('pf-products-list');
    if (!listEl) return;
    listEl.style.display = 'grid';
    listEl.style.gridTemplateColumns = 'repeat(3,1fr)';
    products.forEach(p => listEl.appendChild(this._buildProductCard(p)));
  }

  // ─── Build product card DOM element (grid thumbnail) ────────────────────────
  _buildProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.dataset.id = product.id;

    const canEdit = this._isSelf;

    // Normalize media_urls: accept jsonb array or legacy image_url string
    const urls = Array.isArray(product.media_urls)
      ? product.media_urls
      : (product.image_url ? [product.image_url] : []);

    const isVideo = url => /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(url);
    const firstUrl = urls[0] || '';
    const thumbHtml = firstUrl
      ? (isVideo(firstUrl)
          ? `<video src="${this._esc(firstUrl)}" muted preload="metadata" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none"></video>`
          : `<img src="${this._esc(firstUrl)}" alt="${this._esc(product.title)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block" onerror="this.style.opacity='.2'" />`)
      : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#ccc;font-size:32px">🖼</div>`;

    card.innerHTML = `
      <div style="width:100%;aspect-ratio:1/1;overflow:hidden;background:#f0f0f0;position:relative">
        ${thumbHtml}
        ${urls.length > 1 ? `<div style="position:absolute;bottom:6px;right:8px;background:rgba(0,0,0,.5);color:#fff;font-size:10px;font-family:'Montserrat',sans-serif;padding:2px 7px;border-radius:10px;letter-spacing:.06em">${urls.length} ảnh</div>` : ''}
      </div>
      <div class="product-body" style="padding:14px 14px 12px">
        <div class="product-title" style="font-size:13px;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${this._esc(product.title)}</div>
        <div class="product-price" style="font-size:13px;margin-bottom:0">${this._esc(product.price || '—')}</div>
      </div>
    `;

    // Click card → mở modal chi tiết
    card.addEventListener('click', (e) => {
      if (e.target.closest('.prod-edit-btn, .prod-delete-btn')) return;
      this._openProductDetail(product, card);
    });

    return card;
  }

  // ─── Open product detail modal (toàn cảnh) ───────────────────────────────────
  _openProductDetail(product, cardEl) {
    const existing = document.getElementById('pf-detail-modal');
    if (existing) existing.remove();

    const canEdit = this._isSelf;
    const urls = Array.isArray(product.media_urls)
      ? product.media_urls
      : (product.image_url ? [product.image_url] : []);
    const isVideo = url => /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(url);

    const modal = document.createElement('div');
    modal.id = 'pf-detail-modal';
    modal.className = 'pf-detail-modal-overlay';

    const editBtnsHtml = canEdit
      ? `<div style="display:flex;justify-content:flex-end;gap:6px;margin-bottom:14px">
           <button class="pf-btn ghost prod-edit-btn" style="font-size:11px;padding:5px 14px">✎ Sửa</button>
           <button class="pf-btn danger prod-delete-btn" style="font-size:11px;padding:5px 14px">✕ Xoá</button>
         </div>`
      : '';

    const cartBtnHtml = !canEdit
      ? `<div style="margin-top:auto;padding-top:16px;border-top:.5px solid rgba(0,0,0,.06)">
           <button class="pf-btn gold pf-detail-cart-btn" style="font-size:13px;width:100%">🛒 Thêm vào giỏ hàng</button>
         </div>`
      : '';

    const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
    const variantsHtml = hasVariants
      ? `<div style="margin-bottom:14px">
           <div style="color:#888;font-size:10px;letter-spacing:.18em;text-transform:uppercase;margin-bottom:8px">Mẫu mã</div>
           <div style="display:flex;flex-wrap:wrap;gap:6px" id="pdm-variants-wrap">
             ${product.variants.map((v, i) => `<button class="pdm-variant-chip" data-v="${this._esc(v)}" style="padding:5px 14px;font-size:12px;border-radius:20px;border:1.5px solid ${i===0?'rgba(118,170,171,.8)':'rgba(0,0,0,.15)'};background:${i===0?'rgba(118,170,171,.12)':'#fff'};cursor:pointer;font-family:'Montserrat',sans-serif;color:#182D58;letter-spacing:.04em;transition:all .15s">${this._esc(v)}</button>`).join('')}
           </div>
         </div>`
      : '';

    const extraInfoRows = [];
    if (product.material)   extraInfoRows.push(`<div><div style="color:#888;font-size:10px;letter-spacing:.18em;text-transform:uppercase;margin-bottom:3px">Chất liệu</div><div style="color:#182D58;font-size:13px">${this._esc(product.material)}</div></div>`);
    if (product.dimensions) extraInfoRows.push(`<div><div style="color:#888;font-size:10px;letter-spacing:.18em;text-transform:uppercase;margin-bottom:3px">Kích thước</div><div style="color:#182D58;font-size:13px">${this._esc(product.dimensions)}</div></div>`);
    if (product.stock_qty != null) extraInfoRows.push(`<div><div style="color:#888;font-size:10px;letter-spacing:.18em;text-transform:uppercase;margin-bottom:3px">Còn lại</div><div style="color:${product.stock_qty > 0 ? '#6aaa7a' : '#cc6666'};font-size:13px">${product.stock_qty > 0 ? product.stock_qty + ' sản phẩm' : 'Hết hàng'}</div></div>`);
    const extraInfoHtml = extraInfoRows.length > 0
      ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px 16px;margin-bottom:14px;padding:10px 12px;background:rgba(0,0,0,.025);border-radius:5px">${extraInfoRows.join('')}</div>`
      : '';

    const galleryHtml = urls.length > 0
      ? `<div class="pf-detail-media">
           <div class="pgal-main" id="pdm-main"></div>
           ${urls.length > 1 ? `
             <button class="pgal-arrow left" id="pdm-prev">&#8249;</button>
             <button class="pgal-arrow right" id="pdm-next">&#8250;</button>
             <div class="pgal-counter" id="pdm-counter">1 / ${urls.length}</div>
           ` : ''}
           ${urls.length > 1 ? `<div class="pgal-thumbs" id="pdm-thumbs"></div>` : ''}
           <button class="pf-detail-close" id="pdm-close">✕</button>
         </div>`
      : `<div class="pf-detail-media" style="display:flex;align-items:center;justify-content:center;color:#ccc;font-size:48px;position:relative">
           🖼
           <button class="pf-detail-close" id="pdm-close">✕</button>
         </div>`;

    modal.innerHTML = `
      <div class="pf-detail-modal-inner">
        ${galleryHtml}
        <div class="pf-detail-info">
          ${editBtnsHtml}
          <div style="font-size:18px;font-weight:700;letter-spacing:.06em;color:#182D58;margin-bottom:8px">${this._esc(product.title)}</div>
          <div style="color:#76AAAB;font-size:17px;letter-spacing:.04em;margin-bottom:14px">${this._esc(product.price || '—')}</div>
          ${variantsHtml}
          ${extraInfoHtml}
          ${product.description
            ? `<div style="color:#555;font-size:13px;line-height:1.8;white-space:pre-wrap;margin-bottom:14px">${this._esc(product.description)}</div>`
            : ''}
          <!-- Review toggle -->
          <div class="review-section" style="border-top:.5px solid rgba(0,0,0,.06);padding:12px 0 0;margin-top:4px">
            <button class="review-toggle-btn" data-open="0">▸ Đánh giá (đang tải...)</button>
            <div class="review-content" style="display:none"></div>
          </div>
          ${cartBtnHtml}
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this._el(modal);

    // Variant chip selection
    let selectedVariant = hasVariants ? product.variants[0] : null;
    if (hasVariants) {
      const varWrap = modal.querySelector('#pdm-variants-wrap');
      varWrap?.querySelectorAll('.pdm-variant-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          selectedVariant = chip.dataset.v;
          varWrap.querySelectorAll('.pdm-variant-chip').forEach(c => {
            const active = c === chip;
            c.style.borderColor = active ? 'rgba(118,170,171,.8)' : 'rgba(0,0,0,.15)';
            c.style.background  = active ? 'rgba(118,170,171,.12)' : '#fff';
          });
        });
      });
    }

    // Gallery logic
    if (urls.length > 0) {
      const galMain  = modal.querySelector('#pdm-main');
      const counter  = modal.querySelector('#pdm-counter');
      const thumbsEl = modal.querySelector('#pdm-thumbs');
      let idx = 0;

      const showMedia = i => {
        idx = (i + urls.length) % urls.length;
        const url = urls[idx];
        galMain.innerHTML = isVideo(url)
          ? `<video src="${this._esc(url)}" controls muted playsinline preload="metadata" style="width:100%;height:100%;object-fit:contain;background:#000;display:block"></video>`
          : `<img src="${this._esc(url)}" alt="${this._esc(product.title)}" loading="lazy" style="width:100%;height:100%;object-fit:contain;display:block" onerror="this.style.opacity='.2'" />`;
        if (counter) counter.textContent = `${idx + 1} / ${urls.length}`;
        if (thumbsEl) thumbsEl.querySelectorAll('.pgal-thumb').forEach((t, ti) => t.classList.toggle('active', ti === idx));
      };

      showMedia(0);

      if (urls.length > 1) {
        modal.querySelector('#pdm-prev').addEventListener('click', () => showMedia(idx - 1));
        modal.querySelector('#pdm-next').addEventListener('click', () => showMedia(idx + 1));
        urls.forEach((url, i) => {
          const thumb = document.createElement('div');
          thumb.className = 'pgal-thumb' + (i === 0 ? ' active' : '');
          thumb.innerHTML = isVideo(url)
            ? `<video src="${this._esc(url)}" preload="metadata" muted></video>`
            : `<img src="${this._esc(url)}" loading="lazy" />`;
          thumb.addEventListener('click', () => showMedia(i));
          thumbsEl.appendChild(thumb);
        });
      }
    }

    // Close button
    modal.querySelector('#pdm-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    // Reviews
    const toggleBtn    = modal.querySelector('.review-toggle-btn');
    const reviewContent = modal.querySelector('.review-content');
    let reviewsLoaded  = false;

    this._getReviewCount(product.id).then(count => {
      if (this._disposed || !toggleBtn.isConnected) return;
      toggleBtn.textContent = `▸ Đánh giá (${count})`;
    });

    toggleBtn.addEventListener('click', async () => {
      const isOpen = toggleBtn.dataset.open === '1';
      if (!isOpen) {
        toggleBtn.dataset.open = '1';
        reviewContent.style.display = 'block';
        if (!reviewsLoaded) {
          reviewsLoaded = true;
          toggleBtn.textContent = '▾ Đang tải...';
          await this._loadAndRenderReviews(product.id, reviewContent, toggleBtn);
        } else {
          const count = reviewContent.querySelectorAll('.review-item').length;
          toggleBtn.textContent = `▾ Đánh giá (${count})`;
        }
      } else {
        toggleBtn.dataset.open = '0';
        reviewContent.style.display = 'none';
        const count = reviewContent.querySelectorAll('.review-item').length;
        toggleBtn.textContent = `▸ Đánh giá (${count})`;
      }
    });

    // Cart button (visitor)
    const cartBtn = modal.querySelector('.pf-detail-cart-btn');
    if (cartBtn) {
      const inCart = JSON.parse(localStorage.getItem('gallery_cart') || '[]').some(it => it.productId === product.id);
      if (inCart) { cartBtn.textContent = '✓ Đã có trong giỏ'; cartBtn.disabled = true; }
      cartBtn.addEventListener('click', () => this._addProductToCart(product, cartBtn, selectedVariant));
    }

    // Edit/Delete buttons (artist self)
    if (canEdit) {
      modal.querySelector('.prod-edit-btn')?.addEventListener('click', () => {
        modal.remove();
        this._openProductForm(product, cardEl);
      });
      modal.querySelector('.prod-delete-btn')?.addEventListener('click', () => {
        modal.remove();
        this._deleteProduct(product.id, cardEl);
      });
    }
  }

  // ─── (old) Build product card – replaced by grid version above ───────────────
  _buildProductCard_UNUSED(product) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.dataset.id = product.id;

    const canEdit = this._isSelf;

    // Normalize media_urls: accept jsonb array or legacy image_url string
    const urls = Array.isArray(product.media_urls)
      ? product.media_urls
      : (product.image_url ? [product.image_url] : []);

    const actionsBtnHtml = canEdit
      ? `<button class="pf-btn ghost prod-edit-btn" style="font-size:12px">✎ Sửa</button>
         <button class="pf-btn danger prod-delete-btn" style="font-size:12px">✕ Xoá</button>`
      : ``;

    card.innerHTML = `
      <div class="product-gallery" style="${urls.length === 0 ? 'display:none' : ''}">
        <div class="pgal-main"></div>
        ${urls.length > 1 ? `
          <button class="pgal-arrow left">&#8249;</button>
          <button class="pgal-arrow right">&#8250;</button>
          <div class="pgal-counter">1 / ${urls.length}</div>
        ` : ''}
        ${urls.length > 1 ? `<div class="pgal-thumbs"></div>` : ''}
      </div>
      <div class="product-body">
        <div class="product-title">${this._esc(product.title)}</div>
        ${product.description ? `<div class="product-desc">${this._esc(product.description)}</div>` : ''}
        <div class="product-price">${this._esc(product.price || '—')}</div>
        <div class="product-actions">${actionsBtnHtml}</div>
      </div>
      <div class="review-section">
        <button class="review-toggle-btn" data-open="0">▸ Đánh giá (đang tải...)</button>
        <div class="review-content" style="display:none"></div>
      </div>
    `;

    // Build gallery logic
    if (urls.length > 0) {
      const galMain   = card.querySelector('.pgal-main');
      const counter   = card.querySelector('.pgal-counter');
      const thumbsEl  = card.querySelector('.pgal-thumbs');
      let idx = 0;

      const isVideo = url => /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(url);

      const showMedia = i => {
        idx = (i + urls.length) % urls.length;
        const url = urls[idx];
        galMain.innerHTML = isVideo(url)
          ? `<video src="${this._esc(url)}" controls muted playsinline preload="metadata"></video>`
          : `<img src="${this._esc(url)}" alt="${this._esc(product.title)}" loading="lazy" onerror="this.style.opacity='.2'" />`;
        if (counter) counter.textContent = `${idx + 1} / ${urls.length}`;
        if (thumbsEl) {
          thumbsEl.querySelectorAll('.pgal-thumb').forEach((t, ti) =>
            t.classList.toggle('active', ti === idx));
        }
      };

      showMedia(0);

      if (urls.length > 1) {
        card.querySelector('.pgal-arrow.left').addEventListener('click', () => showMedia(idx - 1));
        card.querySelector('.pgal-arrow.right').addEventListener('click', () => showMedia(idx + 1));

        urls.forEach((url, i) => {
          const thumb = document.createElement('div');
          thumb.className = 'pgal-thumb' + (i === 0 ? ' active' : '');
          thumb.innerHTML = isVideo(url)
            ? `<video src="${this._esc(url)}" preload="metadata" muted></video>`
            : `<img src="${this._esc(url)}" loading="lazy" />`;
          thumb.addEventListener('click', () => showMedia(i));
          thumbsEl.appendChild(thumb);
        });
      }
    }

    // Lazy load review count
    this._getReviewCount(product.id).then(count => {
      if (this._disposed) return;
      const btn = card.querySelector('.review-toggle-btn');
      if (btn) btn.textContent = `▸ Đánh giá (${count})`;
    });

    // Toggle reviews
    const toggleBtn = card.querySelector('.review-toggle-btn');
    const reviewContent = card.querySelector('.review-content');
    let reviewsLoaded = false;

    toggleBtn.addEventListener('click', async () => {
      const isOpen = toggleBtn.dataset.open === '1';
      if (!isOpen) {
        toggleBtn.dataset.open = '1';
        reviewContent.style.display = 'block';
        if (!reviewsLoaded) {
          reviewsLoaded = true;
          toggleBtn.textContent = '▾ Đang tải...';
          await this._loadAndRenderReviews(product.id, reviewContent, toggleBtn);
        } else {
          const count = reviewContent.querySelectorAll('.review-item').length;
          toggleBtn.textContent = `▾ Đánh giá (${count})`;
        }
      } else {
        toggleBtn.dataset.open = '0';
        reviewContent.style.display = 'none';
        const count = reviewContent.querySelectorAll('.review-item').length;
        toggleBtn.textContent = `▸ Đánh giá (${count})`;
      }
    });

    // Action buttons
    if (canEdit) {
      card.querySelector('.prod-edit-btn').addEventListener('click', () => this._openProductForm(product, card));
      card.querySelector('.prod-delete-btn').addEventListener('click', () => this._deleteProduct(product.id, card));
    }

    return card;
  }

  // ─── Get review count ────────────────────────────────────────────────────────
  async _getReviewCount(productId) {
    const { count } = await supabase
      .from('product_reviews')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', productId);
    return count ?? 0;
  }

  // ─── Load and render reviews ─────────────────────────────────────────────────
  async _loadAndRenderReviews(productId, container, toggleBtn) {
    const { data } = await supabase
      .from('product_reviews')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });

    if (this._disposed) return;

    const reviews = data || [];
    if (toggleBtn) toggleBtn.textContent = `▾ Đánh giá (${reviews.length})`;

    const currentUserIsArtist = this.manager.auth.profile?.role === 'artist';

    const listHtml = reviews.length === 0
      ? '<div style="color:#888;font-size:12px;letter-spacing:.1em;padding:8px 0">Chưa có đánh giá nào</div>'
      : reviews.map(r => `
          <div class="review-item">
            <div class="review-meta">
              <span class="review-stars">${'★'.repeat(r.rating || 0)}${'☆'.repeat(5 - (r.rating || 0))}</span>
              <span class="review-author">${this._esc(r.reviewer_name || 'Ẩn danh')}</span>
            </div>
            ${r.comment ? `<div class="review-body">${this._esc(r.comment)}</div>` : ''}
          </div>
        `).join('');

    const reviewFormHtml = !currentUserIsArtist ? `
      <div class="review-form">
        <div style="color:#182D58;font-family:'Montserrat',sans-serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;margin-bottom:12px">Viết đánh giá</div>
        <div style="margin-bottom:10px">
          <div class="pf-label">Tên của bạn</div>
          <input class="pf-input rv-name" style="font-size:13px;padding:6px 10px" placeholder="Tên (để trống là ẩn danh)" />
        </div>
        <div style="margin-bottom:10px">
          <div class="pf-label">Đánh giá sao</div>
          <div class="star-picker">
            ${[1,2,3,4,5].map(n => `<button class="star-pick-btn" data-v="${n}" type="button">★</button>`).join('')}
          </div>
        </div>
        <div style="margin-bottom:12px">
          <div class="pf-label">Nhận xét</div>
          <textarea class="pf-input pf-textarea rv-comment" style="min-height:70px;font-size:13px" placeholder="Chia sẻ cảm nhận của bạn về sản phẩm..."></textarea>
        </div>
        <button class="pf-btn gold rv-submit-btn" style="font-size:12px">Gửi đánh giá</button>
      </div>
    ` : '';

    container.innerHTML = `
      <div class="review-list">${listHtml}</div>
      ${reviewFormHtml}
    `;

    if (!currentUserIsArtist) {
      // Star picker interaction
      let selectedRating = 0;
      const starBtns = container.querySelectorAll('.star-pick-btn');
      starBtns.forEach(btn => {
        btn.addEventListener('mouseenter', () => {
          const v = +btn.dataset.v;
          starBtns.forEach(b => b.classList.toggle('on', +b.dataset.v <= v));
        });
        btn.addEventListener('mouseleave', () => {
          starBtns.forEach(b => b.classList.toggle('on', +b.dataset.v <= selectedRating));
        });
        btn.addEventListener('click', () => {
          selectedRating = +btn.dataset.v;
          starBtns.forEach(b => b.classList.toggle('on', +b.dataset.v <= selectedRating));
        });
      });

      container.querySelector('.rv-submit-btn').addEventListener('click', async () => {
        if (!selectedRating) { this._showToast('Vui lòng chọn số sao'); return; }
        const name    = container.querySelector('.rv-name').value.trim();
        const comment = container.querySelector('.rv-comment').value.trim();
        await this._submitReview(productId, name, selectedRating, comment, container, toggleBtn);
      });
    }
  }

  // ─── Submit review ───────────────────────────────────────────────────────────
  async _submitReview(productId, reviewerName, rating, comment, container, toggleBtn) {
    const btn = container.querySelector('.rv-submit-btn');
    btn.disabled = true; btn.textContent = 'Đang gửi...';

    const { error } = await supabase.from('product_reviews').insert({
      product_id: productId,
      reviewer_name: reviewerName || 'Ẩn danh',
      rating,
      comment,
    });

    if (this._disposed) return;

    if (error) {
      btn.disabled = false; btn.textContent = 'Gửi đánh giá';
      this._showToast('Lỗi khi gửi đánh giá');
      return;
    }

    this._showToast('✓ Đã gửi đánh giá');
    await this._loadAndRenderReviews(productId, container, toggleBtn);
  }

  // ─── Open product add/edit modal ─────────────────────────────────────────────
  _openProductForm(product, cardEl) {
    const modal = document.getElementById('pf-product-modal');
    const isEdit = !!product;

    document.getElementById('pf-modal-title').textContent = isEdit ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm';
    document.getElementById('pm-title').value      = product?.title       || '';
    document.getElementById('pm-desc').value       = product?.description || '';
    document.getElementById('pm-price').value      = product?.price       || '';
    document.getElementById('pm-material').value   = product?.material    || '';
    document.getElementById('pm-dimensions').value = product?.dimensions  || '';
    document.getElementById('pm-stock').value      = product?.stock_qty != null ? String(product.stock_qty) : '';
    document.getElementById('pm-variants').value   = Array.isArray(product?.variants) ? product.variants.join(', ') : (product?.variants || '');

    // File state for this form session
    const existingUrls = Array.isArray(product?.media_urls)
      ? [...product.media_urls]
      : (product?.image_url ? [product.image_url] : []);
    this._pmKeptUrls    = [...existingUrls];
    this._pmPendingFiles = [];

    this._renderModalPreviews();

    modal.style.display = 'flex';

    // Upload zone click & drag-drop
    const zone      = document.getElementById('pm-upload-zone');
    const fileInput = document.getElementById('pm-file-input');

    // Clone to remove old listeners
    const freshZone  = zone.cloneNode(true);
    zone.parentNode.replaceChild(freshZone, zone);
    const freshInput = freshZone.querySelector('#pm-file-input') || freshZone.querySelector('input[type=file]');

    const addFiles = files => {
      const maxSize = 50 * 1024 * 1024;
      const allowed = /\.(jpe?g|png|gif|webp|mp4|webm|mov|avi|mkv)$/i;
      Array.from(files).forEach(f => {
        if (!allowed.test(f.name)) { this._showToast(`Định dạng không hỗ trợ: ${f.name}`); return; }
        if (f.size > maxSize) { this._showToast(`File quá lớn (>50 MB): ${f.name}`); return; }
        this._pmPendingFiles.push(f);
      });
      this._renderModalPreviews();
    };

    freshZone.addEventListener('click', () => freshInput.click());
    freshInput.addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
    freshZone.addEventListener('dragover',  e => { e.preventDefault(); freshZone.classList.add('drag-over'); });
    freshZone.addEventListener('dragleave', () => freshZone.classList.remove('drag-over'));
    freshZone.addEventListener('drop', e => {
      e.preventDefault(); freshZone.classList.remove('drag-over');
      addFiles(e.dataTransfer.files);
    });

    const onCancel = () => {
      modal.style.display = 'none';
      this._pmPendingFiles = [];
      this._pmKeptUrls = [];
    };

    const onSave = async () => {
      const title = document.getElementById('pm-title').value.trim();
      if (!title) {
        const inp = document.getElementById('pm-title');
        inp.style.borderColor = 'rgba(181,74,58,.6)';
        setTimeout(() => { inp.style.borderColor = ''; }, 1500);
        return;
      }
      const saveBtn = document.getElementById('pm-save-btn');
      saveBtn.disabled = true; saveBtn.textContent = 'Đang lưu...';

      const variantsRaw = document.getElementById('pm-variants').value.trim();
      const stockRaw    = document.getElementById('pm-stock').value.trim();
      const formData = {
        title,
        description: document.getElementById('pm-desc').value.trim(),
        price:       document.getElementById('pm-price').value.trim(),
        material:    document.getElementById('pm-material').value.trim(),
        dimensions:  document.getElementById('pm-dimensions').value.trim(),
        stock_qty:   stockRaw !== '' ? (parseInt(stockRaw) || 0) : null,
        variants:    variantsRaw ? variantsRaw.split(',').map(s => s.trim()).filter(Boolean) : [],
      };
      await this._saveProduct(formData, product?.id, cardEl);
      modal.style.display = 'none';
      saveBtn.disabled = false; saveBtn.textContent = 'Lưu sản phẩm';
    };

    ['pm-cancel-btn', 'pm-save-btn'].forEach(id => {
      const old = document.getElementById(id);
      const fresh = old.cloneNode(true);
      old.parentNode.replaceChild(fresh, old);
    });
    document.getElementById('pm-cancel-btn').addEventListener('click', onCancel);
    document.getElementById('pm-save-btn').addEventListener('click', onSave);

    const onOverlay = e => { if (e.target === modal) { onCancel(); modal.removeEventListener('click', onOverlay); } };
    modal.addEventListener('click', onOverlay);
  }

  // ─── Save product to Supabase ────────────────────────────────────────────────
  async _saveProduct(formData, productId, cardEl) {
    const artistName = this._target.name;

    // Upload pending files and collect URLs
    const uploadedUrls = await this._uploadPendingFiles(artistName);
    if (this._disposed) return;

    const mediaUrls = [...(this._pmKeptUrls || []), ...uploadedUrls];
    const payload   = { ...formData, media_urls: mediaUrls };

    if (productId) {
      const { error } = await supabase.from('artist_products').update(payload).eq('id', productId);
      if (this._disposed) return;
      if (error) { console.error('[Save product]', error); this._showToast(`Lỗi: ${error.message}`); return; }
      if (cardEl) {
        const updated = { ...payload, id: productId, artist_name: artistName };
        cardEl.parentNode?.replaceChild(this._buildProductCard(updated), cardEl);
      }
      this._showToast('✓ Đã cập nhật sản phẩm');
    } else {
      const { data: inserted, error } = await supabase
        .from('artist_products')
        .insert({ ...payload, artist_name: artistName })
        .select()
        .single();
      if (this._disposed) return;
      if (error) { console.error('[Insert product]', error); this._showToast(`Lỗi: ${error.message}`); return; }

      const listEl  = document.getElementById('pf-products-list');
      const emptyEl = document.getElementById('pf-products-empty');
      if (emptyEl) emptyEl.style.display = 'none';
      if (listEl) {
        listEl.style.display = 'flex';
        listEl.insertBefore(this._buildProductCard(inserted), listEl.firstChild);
      }
      this._showToast('✓ Đã thêm sản phẩm');
    }
    this._pmPendingFiles = [];
    this._pmKeptUrls     = [];
  }

  // ─── Delete product ──────────────────────────────────────────────────────────
  async _deleteProduct(productId, cardEl) {
    if (!confirm('Xoá sản phẩm này?')) return;

    const { error } = await supabase.from('artist_products').delete().eq('id', productId);
    if (this._disposed) return;
    if (error) { this._showToast('Lỗi khi xoá'); return; }

    cardEl?.remove();
    const listEl = document.getElementById('pf-products-list');
    if (listEl && listEl.children.length === 0) {
      listEl.style.display = 'none';
      const emptyEl = document.getElementById('pf-products-empty');
      if (emptyEl) emptyEl.style.display = 'block';
    }
    this._showToast('✓ Đã xoá sản phẩm');
  }

  // ─── Add product to localStorage cart ───────────────────────────────────────
  _addProductToCart(product, btn, variant) {
    const existing = JSON.parse(localStorage.getItem('gallery_cart') || '[]');
    if (existing.some(it => it.productId === product.id)) {
      this._showToast('Đã có trong giỏ hàng');
      return;
    }
    existing.push({
      title:    product.title,
      artist:   this._target.name,
      artistId: this._target.id || '',
      year:     '',
      price:    product.price || '',
      productId: product.id,
      type:     'product',
      variant:  variant || null,
    });
    localStorage.setItem('gallery_cart', JSON.stringify(existing));

    if (btn) {
      btn.textContent = '✓ Đã thêm';
      btn.disabled = true;
      btn.style.cssText += ';background:rgba(90,170,122,.12);border-color:rgba(90,170,122,.4);color:#6aaa7a';
    }
    this._updateCartFab();
    this._showToast('✓ Đã thêm vào giỏ hàng');
  }

  // ─── Update cart FAB badge ────────────────────────────────────────────────────
  _updateCartFab() {
    const items = JSON.parse(localStorage.getItem('gallery_cart') || '[]');
    const fab   = document.getElementById('pf-cart-fab');
    const badge = document.getElementById('pf-cart-count-badge');
    if (!fab) return;
    if (items.length === 0) {
      fab.style.display = 'none';
    } else {
      fab.style.display = 'flex';
      if (badge) badge.textContent = items.length > 9 ? '9+' : String(items.length);
    }
  }

  // ─── Toggle cart drawer ──────────────────────────────────────────────────────
  _toggleCartDrawer() {
    const drawer = document.getElementById('pf-cart-drawer');
    if (!drawer) return;
    if (drawer.style.display !== 'none' && drawer.style.display !== '') {
      drawer.style.display = 'none';
    } else {
      this._renderCartDrawer();
      drawer.style.display = 'block';
    }
  }

  // ─── Render cart drawer ──────────────────────────────────────────────────────
  _renderCartDrawer() {
    const items    = JSON.parse(localStorage.getItem('gallery_cart') || '[]');
    const itemsEl  = document.getElementById('pf-cart-drawer-items');
    const totalRow = document.getElementById('pf-cart-drawer-total-row');
    const totalEl  = document.getElementById('pf-cart-drawer-total');
    if (!itemsEl) return;

    if (items.length === 0) {
      itemsEl.innerHTML = '<div style="color:#888;font-size:12px;letter-spacing:.1em;padding:8px 0">Giỏ hàng trống</div>';
      if (totalRow) totalRow.style.display = 'none';
      return;
    }

    itemsEl.innerHTML = '';
    let total = 0; let allParsed = true;

    items.forEach((item, idx) => {
      const priceNum = parseFloat((item.price || '').replace(/[^\d,\.]/g, '').replace(/\./g, '').replace(',', '.'));
      if (isNaN(priceNum)) allParsed = false; else total += priceNum;

      const row = document.createElement('div');
      row.className = 'pf-cart-row';
      row.innerHTML = `
        <div class="pf-cart-row-name">${this._esc(item.title || 'Untitled')}</div>
        <div class="pf-cart-row-price">${this._esc(item.price || '—')}</div>
        <button class="pf-cart-row-rm" title="Xoá">✕</button>
      `;
      row.querySelector('.pf-cart-row-rm').addEventListener('click', () => {
        const arr = JSON.parse(localStorage.getItem('gallery_cart') || '[]');
        arr.splice(idx, 1);
        localStorage.setItem('gallery_cart', JSON.stringify(arr));
        this._updateCartFab();
        this._renderCartDrawer();
      });
      itemsEl.appendChild(row);
    });

    if (totalRow) {
      totalRow.style.display = 'flex';
      if (totalEl) totalEl.textContent = allParsed ? total.toLocaleString('vi-VN') + ' ₫' : '—';
    }
  }

  // ─── Upload all pending files, return array of public URLs ──────────────────
  async _uploadPendingFiles(artistName) {
    const files = this._pmPendingFiles || [];
    if (files.length === 0) return [];

    const progressBar = document.getElementById('pm-upload-bar');
    const progressEl  = document.getElementById('pm-upload-progress');
    if (progressEl) progressEl.style.display = 'block';

    const urls = [];
    for (let i = 0; i < files.length; i++) {
      if (this._disposed) break;
      const file = files[i];
      const ext  = file.name.split('.').pop().toLowerCase();
      const path = `products/${artistName}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: false });
      if (error) {
        console.error('[Upload error]', file.name, error);
        this._showToast(`Lỗi upload: ${error.message || file.name}`);
        continue;
      }

      const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      if (urlData?.publicUrl) urls.push(urlData.publicUrl);

      if (progressBar) progressBar.style.width = `${Math.round(((i + 1) / files.length) * 100)}%`;
    }

    if (progressEl) progressEl.style.display = 'none';
    if (progressBar) progressBar.style.width = '0%';
    return urls;
  }

  // ─── Render preview thumbnails in modal ──────────────────────────────────────
  _renderModalPreviews() {
    const container = document.getElementById('pm-previews');
    if (!container) return;
    container.innerHTML = '';

    const isVideo = url => /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(url);

    // Existing kept URLs
    (this._pmKeptUrls || []).forEach((url, i) => {
      const thumb = document.createElement('div');
      thumb.className = 'pm-thumb';
      thumb.innerHTML = isVideo(url)
        ? `<video src="${this._esc(url)}" muted preload="metadata"></video>`
        : `<img src="${this._esc(url)}" loading="lazy" />`;
      const rm = document.createElement('button');
      rm.className = 'pm-thumb-rm'; rm.textContent = '✕'; rm.title = 'Xoá ảnh này';
      rm.addEventListener('click', () => {
        this._pmKeptUrls.splice(i, 1);
        this._renderModalPreviews();
      });
      thumb.appendChild(rm);
      container.appendChild(thumb);
    });

    // Pending new files (local preview)
    (this._pmPendingFiles || []).forEach((file, i) => {
      const thumb = document.createElement('div');
      thumb.className = 'pm-thumb';
      const localUrl = URL.createObjectURL(file);
      thumb.innerHTML = file.type.startsWith('video/')
        ? `<video src="${localUrl}" muted preload="metadata"></video>`
        : `<img src="${localUrl}" />`;
      const rm = document.createElement('button');
      rm.className = 'pm-thumb-rm'; rm.textContent = '✕'; rm.title = 'Bỏ file này';
      rm.addEventListener('click', () => {
        this._pmPendingFiles.splice(i, 1);
        this._renderModalPreviews();
      });
      thumb.appendChild(rm);
      container.appendChild(thumb);
    });
  }

  // ─── Tạo phòng mới (chỉ artist xem profile mình) ───────────────────────────
  _createNewRoom() {
    const artistId = this.manager.auth.user.id;
    const roomId   = artistId + ':::' + Date.now();
    this.manager.currentRoom = { id: roomId, name: null, artistId, isPublished: false };
    this.manager.navigateTo('studio');
  }

  // ─── Subtabs ─────────────────────────────────────────────────────────────────
  _setupSubtabs(tabs, activeId) {
    const nav = document.getElementById('pf-subtabs-nav');
    if (!nav) return;

    this._followLoaded = {};
    const allTabIds = ['gallery', 'products', 'following', 'followers'];

    const activateTab = (id) => {
      nav.querySelectorAll('.pf-subtab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === id);
      });
      allTabIds.forEach(tid => {
        const panel = document.getElementById('pf-tab-' + tid);
        if (panel) panel.style.display = tid === id ? 'block' : 'none';
      });
      if ((id === 'following' || id === 'followers') && !this._followLoaded[id]) {
        this._followLoaded[id] = true;
        this._loadFollows(id);
      }
    };

    tabs.forEach(tab => {
      const btn = document.createElement('button');
      btn.className = 'pf-subtab-btn';
      btn.dataset.tab = tab.id;
      btn.textContent = tab.label;
      btn.addEventListener('click', () => activateTab(tab.id));
      nav.appendChild(btn);
    });

    activateTab(activeId);
  }

  // ─── Load following / followers list ─────────────────────────────────────────
  async _loadFollows(type) {
    const loadingEl = document.getElementById('pf-' + type + '-loading');
    const emptyEl   = document.getElementById('pf-' + type + '-empty');
    const listEl    = document.getElementById('pf-' + type + '-list');
    if (!loadingEl || !emptyEl || !listEl) return;

    const targetId = this._target.id;
    if (!targetId) {
      loadingEl.style.display = 'none';
      emptyEl.style.display = 'block';
      return;
    }

    const filterCol = type === 'following' ? 'follower_id'  : 'following_id';
    const resultCol = type === 'following' ? 'following_id' : 'follower_id';

    const { data: follows, error } = await supabase
      .from('follows')
      .select(resultCol)
      .eq(filterCol, targetId);

    if (this._disposed) return;
    loadingEl.style.display = 'none';

    if (error || !follows || follows.length === 0) {
      emptyEl.style.display = 'block';
      return;
    }

    const ids = follows.map(r => r[resultCol]).filter(Boolean);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, role, avatar_url')
      .in('id', ids);

    if (this._disposed) return;

    if (!profiles || profiles.length === 0) {
      emptyEl.style.display = 'block';
      return;
    }

    listEl.style.display = 'grid';
    profiles.forEach(p => {
      const name = p.display_name || 'Ẩn danh';
      const card = document.createElement('div');
      card.className = 'pf-follow-card';
      const avatarHtml = p.avatar_url
        ? `<img src="${this._esc(p.avatar_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" />`
        : `<span>${name.charAt(0).toUpperCase()}</span>`;
      card.innerHTML = `
        <div class="pf-avatar-circle" style="width:38px;height:38px;font-size:16px;flex-shrink:0;cursor:default">${avatarHtml}</div>
        <div>
          <div style="font-size:13px;font-weight:600;letter-spacing:.04em">${this._esc(name)}</div>
          <div style="font-size:11px;letter-spacing:.1em;color:#888;text-transform:uppercase;margin-top:2px">${p.role === 'artist' ? 'Artist' : 'Visitor'}</div>
        </div>
      `;
      card.addEventListener('click', () => {
        this.manager.profileTarget = { ...p, name, avatarUrl: p.avatar_url };
        this.manager.navigateTo('profile');
      });
      listEl.appendChild(card);
    });
  }

  // ─── HTML escape helper ──────────────────────────────────────────────────────
  _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  update(_dt) {
    if (this._particles) this._particles.rotation.y += _dt * 0.01;
  }
}