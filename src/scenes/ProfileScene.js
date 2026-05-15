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

    // Reset target sau khi đọc
    this.manager.profileTarget = null;

    this._isSelf = isSelf;
    this._isEditing = false;

    // Three.js background
    this.threeScene.background = new THREE.Color(0xffffff);
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
    overlay.style.cssText = `
      position:fixed;top:${HEADER_H}px;left:0;right:0;bottom:0;
      overflow-y:auto;z-index:100;font-family:monospace;
      padding:40px;box-sizing:border-box;
    `;

    overlay.innerHTML = `
      <style>
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
          font-size: 9px;
          letter-spacing: .18em;
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .pf-value {
          color: #1a1a1a;
          font-size: 13px;
          letter-spacing: .04em;
          min-height: 20px;
        }
        .pf-input {
          background: rgba(0,0,0,.04);
          border: 1px solid rgba(0,0,0,.12);
          border-radius: 3px;
          color: #1a1a1a;
          font-family: monospace;
          font-size: 13px;
          padding: 8px 12px;
          width: 100%;
          box-sizing: border-box;
          outline: none;
          transition: border-color .2s;
        }
        .pf-input:focus { border-color: rgba(200,169,110,.5); }
        .pf-input::placeholder { color: #aaa; }
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
          border-color: rgba(0,0,0,.12);
          color: #555;
        }
        .pf-btn.ghost:hover { border-color: rgba(0,0,0,.3); color: #222; }
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
        .gallery-card:hover { border-color: rgba(200,169,110,.5); }
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
          background: rgba(255,255,255,.98);
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
          box-shadow: 0 2px 12px rgba(0,0,0,.1);
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
        .product-title { color:#1a1a1a; font-size:14px; font-style:italic; letter-spacing:.06em; margin-bottom:10px; }
        .product-desc { color:#555; font-size:11px; line-height:1.75; margin-bottom:14px; white-space:pre-wrap; }
        .product-price { color:#c8a96e; font-size:15px; letter-spacing:.04em; margin-bottom:16px; }
        .product-actions { display:flex; gap:8px; flex-wrap:wrap; }

        /* ── Reviews ── */
        .review-section { border-top:.5px solid rgba(0,0,0,.06); padding:14px 24px 20px; }
        .review-toggle-btn { background:none; border:none; cursor:pointer; color:#666; font-size:9px; font-family:monospace; letter-spacing:.14em; text-transform:uppercase; padding:0; transition:color .2s; }
        .review-toggle-btn:hover { color:#222; }
        .review-item { padding:10px 0; border-bottom:.5px solid rgba(0,0,0,.06); }
        .review-item:last-child { border-bottom:none; }
        .review-meta { display:flex; align-items:center; gap:10px; margin-bottom:5px; }
        .review-stars { font-size:11px; letter-spacing:1px; color:#c8a96e; }
        .review-author { color:#666; font-size:9px; letter-spacing:.1em; }
        .review-body { color:#555; font-size:11px; line-height:1.65; }
        .review-form { margin-top:16px; padding-top:14px; border-top:.5px solid rgba(0,0,0,.06); }
        .star-picker { display:flex; gap:4px; margin-bottom:12px; }
        .star-pick-btn { background:none; border:none; cursor:pointer; font-size:20px; padding:0; line-height:1; opacity:.25; transition:opacity .15s,transform .1s; }
        .star-pick-btn.on { opacity:1; }
        .star-pick-btn:hover { transform:scale(1.15); }

        /* ── Gallery carousel ── */
        .product-gallery { position:relative; background:#f0f0f0; }
        .pgal-main { width:100%; height:260px; display:flex; align-items:center; justify-content:center; overflow:hidden; }
        .pgal-main img { width:100%; height:100%; object-fit:cover; display:block; }
        .pgal-main video { width:100%; height:100%; object-fit:contain; background:#000; display:block; }
        .pgal-arrow { position:absolute; top:50%; transform:translateY(-50%); background:rgba(0,0,0,.4); border:none; color:#fff; font-size:20px; padding:6px 12px; cursor:pointer; z-index:2; transition:background .15s; border-radius:3px; line-height:1; }
        .pgal-arrow:hover { background:rgba(0,0,0,.7); }
        .pgal-arrow.left { left:8px; }
        .pgal-arrow.right { right:8px; }
        .pgal-counter { position:absolute; bottom:8px; right:10px; background:rgba(0,0,0,.5); color:#fff; font-size:9px; font-family:monospace; padding:2px 8px; border-radius:10px; letter-spacing:.06em; }
        .pgal-thumbs { display:flex; gap:4px; padding:4px; background:#f5f5f5; overflow-x:auto; }
        .pgal-thumbs::-webkit-scrollbar { height:2px; }
        .pgal-thumbs::-webkit-scrollbar-thumb { background:rgba(0,0,0,.15); }
        .pgal-thumb { width:52px; height:40px; flex-shrink:0; cursor:pointer; border-radius:2px; overflow:hidden; opacity:.45; transition:opacity .15s; border:1.5px solid transparent; }
        .pgal-thumb.active { opacity:1; border-color:rgba(200,169,110,.7); }
        .pgal-thumb img,.pgal-thumb video { width:100%; height:100%; object-fit:cover; display:block; pointer-events:none; }

        /* ── Upload zone ── */
        .pm-upload-zone { border:1.5px dashed rgba(0,0,0,.15); border-radius:5px; padding:24px 16px; text-align:center; cursor:pointer; transition:border-color .2s,background .2s; }
        .pm-upload-zone:hover,.pm-upload-zone.drag-over { border-color:rgba(200,169,110,.5); background:rgba(200,169,110,.05); }
        .pm-upload-zone input[type=file] { display:none; }
        .pm-previews { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
        .pm-thumb { position:relative; width:72px; height:56px; border-radius:3px; overflow:hidden; border:1px solid rgba(0,0,0,.1); flex-shrink:0; }
        .pm-thumb img,.pm-thumb video { width:100%; height:100%; object-fit:cover; display:block; }
        .pm-thumb-rm { position:absolute; top:2px; right:2px; background:rgba(0,0,0,.7); border:none; color:#fff; font-size:10px; width:16px; height:16px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; line-height:1; padding:0; }
        .pm-thumb-rm:hover { background:rgba(181,74,58,.85); }
        .pm-upload-progress { margin-top:8px; height:3px; background:rgba(0,0,0,.08); border-radius:2px; overflow:hidden; display:none; }
        .pm-upload-progress-bar { height:100%; background:linear-gradient(90deg,rgba(200,169,110,.5),rgba(200,169,110,1)); border-radius:2px; transition:width .2s; width:0%; }

        /* ── Product modal ── */
        .pf-product-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; z-index:3000; }
        .pf-modal-inner { background:#ffffff; border:1px solid rgba(0,0,0,.12); border-radius:8px; padding:32px; width:min(540px,92vw); max-height:90vh; overflow-y:auto; box-sizing:border-box; box-shadow:0 8px 40px rgba(0,0,0,.15); }

        /* ── Cart FAB & Drawer ── */
        #pf-cart-fab { position:fixed; bottom:32px; right:32px; background:rgba(200,169,110,.15); border:1px solid rgba(200,169,110,.4); color:#c8a96e; font-family:monospace; font-size:11px; letter-spacing:.08em; padding:11px 20px; border-radius:24px; cursor:pointer; display:none; align-items:center; gap:8px; z-index:600; transition:background .2s; }
        #pf-cart-fab:hover { background:rgba(200,169,110,.28); }
        #pf-cart-count-badge { background:rgba(200,169,110,.9); color:#1a1510; font-size:8px; border-radius:10px; padding:1px 5px; min-width:16px; text-align:center; }
        #pf-cart-drawer { position:fixed; bottom:84px; right:32px; width:300px; background:#ffffff; border:1px solid rgba(0,0,0,.1); border-radius:8px; padding:16px; z-index:600; display:none; box-shadow:0 4px 20px rgba(0,0,0,.1); }
        .pf-cart-row { display:flex; align-items:center; gap:8px; padding:7px 0; border-bottom:.5px solid rgba(0,0,0,.06); }
        .pf-cart-row:last-of-type { border-bottom:none; }
        .pf-cart-row-name { flex:1; font-size:10px; color:#1a1a1a; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .pf-cart-row-price { font-size:9px; color:#c8a96e; white-space:nowrap; }
        .pf-cart-row-rm { background:none; border:none; color:#888; cursor:pointer; font-size:11px; padding:0 2px; transition:color .2s; }
        .pf-cart-row-rm:hover { color:rgba(181,74,58,.8); }
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
            <div style="color:#1a1a1a;font-size:18px;font-weight:bold;letter-spacing:.12em" id="pf-name-display"></div>
            <div style="margin-top:6px"><span class="pf-role-badge" id="pf-role-display"></span></div>
          </div>
        </div>

        <!-- View mode -->
        <div id="pf-view-mode">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px" id="pf-fields-view">
            <div>
              <div class="pf-label">Website / Mạng xã hội</div>
              <div class="pf-value" id="pf-website-view" style="color:#666">—</div>
            </div>
            <div>
              <div class="pf-label">Địa điểm</div>
              <div class="pf-value" id="pf-location-view" style="color:#666">—</div>
            </div>
          </div>
          <div>
            <div class="pf-label">Giới thiệu</div>
            <div class="pf-value" id="pf-bio-view" style="color:#555;line-height:1.7">—</div>
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
            <div style="color:#666;font-size:10px;margin-top:4px" id="pf-token-count"></div>
          </div>
        </div>
        <div style="margin-top:18px">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <span style="color:#888;font-size:9px;letter-spacing:.12em;text-transform:uppercase">Tiến độ lên rank</span>
            <span style="color:#666;font-size:9px" id="pf-rank-progress-text"></span>
          </div>
          <div style="height:4px;background:rgba(0,0,0,.08);border-radius:2px;overflow:hidden">
            <div id="pf-rank-bar" style="height:100%;background:linear-gradient(90deg,rgba(200,169,110,.5),rgba(200,169,110,1));border-radius:2px;transition:width .6s;width:0%"></div>
          </div>
        </div>
      </div>

      <!-- Artist Rank (hiện khi là artist) -->
      <div id="pf-artist-rank-section" class="pf-section" style="display:none">
        <div style="display:flex;align-items:center;gap:20px">
          <div id="pf-artist-rank-icon" style="width:52px;height:52px;border-radius:50%;background:rgba(200,169,110,.1);border:.5px solid rgba(200,169,110,.25);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">🎨</div>
          <div>
            <div style="color:#c8a96e;font-size:15px;letter-spacing:.08em" id="pf-artist-rank-name">—</div>
            <div style="color:#666;font-size:10px;margin-top:4px" id="pf-artist-like-count"></div>
          </div>
        </div>
        <div style="margin-top:18px">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <span style="color:#888;font-size:9px;letter-spacing:.12em;text-transform:uppercase">Tiến độ lên rank</span>
            <span style="color:#666;font-size:9px" id="pf-artist-rank-progress-text"></span>
          </div>
          <div style="height:4px;background:rgba(0,0,0,.08);border-radius:2px;overflow:hidden">
            <div id="pf-artist-rank-bar" style="height:100%;background:linear-gradient(90deg,rgba(200,169,110,.5),rgba(200,169,110,1));border-radius:2px;transition:width .6s;width:0%"></div>
          </div>
        </div>
      </div>

      <!-- Gallery section (artist only) -->
      <div id="pf-gallery-section" style="display:none">
        <div style="color:#888;font-size:9px;letter-spacing:.18em;text-transform:uppercase;margin-bottom:14px">
          Phòng triển lãm
        </div>
        <div id="pf-gallery-loading" style="color:#888;font-size:11px;letter-spacing:.1em;text-align:center;padding:40px">
          Đang tải...
        </div>
        <div id="pf-gallery-empty" style="display:none;color:#888;font-size:11px;letter-spacing:.1em;text-align:center;padding:40px">
          Chưa có phòng triển lãm nào
        </div>
        <div id="pf-gallery-grid" style="display:none;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px"></div>
      </div>

      <!-- Products section (artist only) -->
      <div id="pf-products-section" style="display:none;margin-top:8px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div style="color:#888;font-size:9px;letter-spacing:.18em;text-transform:uppercase">Sản phẩm</div>
          <button id="pf-add-product-btn" class="pf-btn gold" style="display:none">+ Thêm sản phẩm</button>
        </div>
        <div id="pf-products-loading" style="color:#888;font-size:11px;letter-spacing:.1em;text-align:center;padding:40px">Đang tải...</div>
        <div id="pf-products-empty" style="display:none;color:#888;font-size:11px;letter-spacing:.1em;text-align:center;padding:40px">Chưa có sản phẩm nào</div>
        <div id="pf-products-list" style="display:none;flex-direction:column;gap:20px"></div>
      </div>

      <!-- Cart FAB (fixed) -->
      <button id="pf-cart-fab">🛒 Giỏ hàng <span id="pf-cart-count-badge">0</span></button>

      <!-- Cart drawer (fixed) -->
      <div id="pf-cart-drawer">
        <div style="color:#888;font-size:9px;letter-spacing:.14em;text-transform:uppercase;margin-bottom:12px">Giỏ hàng</div>
        <div id="pf-cart-drawer-items"></div>
        <div id="pf-cart-drawer-total-row" style="display:none;justify-content:space-between;align-items:center;padding:10px 0 0;margin-top:4px;border-top:.5px solid rgba(0,0,0,.08)">
          <span style="color:#888;font-size:9px;letter-spacing:.12em;text-transform:uppercase">Tổng cộng</span>
          <span id="pf-cart-drawer-total" style="color:#c8a96e;font-size:14px"></span>
        </div>
        <button id="pf-cart-checkout-btn" class="pf-btn gold" style="width:100%;margin-top:10px;justify-content:center;display:flex">✦ Thanh toán →</button>
      </div>

      <!-- Product form modal -->
      <div id="pf-product-modal" style="display:none" class="pf-product-modal-overlay">
        <div class="pf-modal-inner">
          <div style="color:#1a1a1a;font-size:13px;letter-spacing:.1em;margin-bottom:24px" id="pf-modal-title">Thêm sản phẩm</div>
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
          <div style="margin-bottom:4px">
            <div class="pf-label" style="margin-bottom:8px">Ảnh / Video sản phẩm</div>
            <div class="pm-upload-zone" id="pm-upload-zone">
              <input type="file" id="pm-file-input" multiple accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime" />
              <div style="font-size:22px;margin-bottom:6px">📁</div>
              <div style="color:#555;font-size:11px;margin-bottom:4px">Kéo thả hoặc <span style="color:#c8a96e;text-decoration:underline">click để chọn file</span></div>
              <div style="color:#999;font-size:9px;letter-spacing:.08em">JPG · PNG · GIF · WEBP · MP4 · MOV · WEBM &nbsp;|&nbsp; tối đa 50 MB / file</div>
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
      }
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

  // ─── Bind nút quay lại + cart FAB + checkout ─────────────────────────────────
  _bindActions() {
    document.getElementById('pf-back').addEventListener('click', () => {
      const prev = this.manager.previousScene || 'landing';
      this.manager.navigateTo(prev);
    });

    const fab = document.getElementById('pf-cart-fab');
    if (fab) fab.addEventListener('click', () => this._toggleCartDrawer());

    const checkoutBtn = document.getElementById('pf-cart-checkout-btn');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', () => {
        const items = JSON.parse(localStorage.getItem('gallery_cart') || '[]');
        if (!items.length) return;
        window.open('checkout.html', '_blank');
      });
    }

    this._updateCartFab();
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
        : `<span style="display:inline-block;padding:2px 9px;font-size:9px;letter-spacing:.12em;text-transform:uppercase;border-radius:2px;background:rgba(0,0,0,.04);border:1px solid rgba(0,0,0,.12);color:#777">Draft</span>`;

      const card = document.createElement('div');
      card.className = 'gallery-card';
      card.innerHTML = `
        <div style="color:#1a1a1a;font-size:13px;font-style:italic;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${roomName}</div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          ${badgeHtml}
          <span style="color:#999;font-size:9px">${date}</span>
        </div>
        <div style="color:#666;font-size:10px;letter-spacing:.06em">${count} tác phẩm</div>
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

  // ─── Artist Rank (dựa trên lượt thích) ──────────────────────────────────────
  async _loadArtistRank() {
    const ARTIST_RANKS = [
      { name: 'Tập sinh',     min_likes: 0 },
      { name: 'Họa sĩ',      min_likes: 50 },
      { name: 'Bậc thầy',    min_likes: 300 },
      { name: 'Đại danh họa', min_likes: 1500 },
      { name: 'Bất tử',      min_likes: 8000 },
    ];

    const artistId = this._target.name;

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
    listEl.style.display = 'flex';
    listEl.innerHTML = '';
    products.forEach(p => listEl.appendChild(this._buildProductCard(p)));
  }

  // ─── Build product card DOM element ─────────────────────────────────────────
  _buildProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.dataset.id = product.id;

    const canEdit = this._isSelf;

    // Normalize media_urls: accept jsonb array or legacy image_url string
    const urls = Array.isArray(product.media_urls)
      ? product.media_urls
      : (product.image_url ? [product.image_url] : []);

    const actionsBtnHtml = canEdit
      ? `<button class="pf-btn ghost prod-edit-btn" style="font-size:10px">✎ Sửa</button>
         <button class="pf-btn danger prod-delete-btn" style="font-size:10px">✕ Xoá</button>`
      : `<button class="pf-btn gold prod-cart-btn" style="font-size:10px">🛒 Thêm vào giỏ hàng</button>`;

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
    } else {
      card.querySelector('.prod-cart-btn').addEventListener('click', e => this._addProductToCart(product, e.currentTarget));
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

    const listHtml = reviews.length === 0
      ? '<div style="color:#888;font-size:10px;letter-spacing:.1em;padding:8px 0">Chưa có đánh giá nào</div>'
      : reviews.map(r => `
          <div class="review-item">
            <div class="review-meta">
              <span class="review-stars">${'★'.repeat(r.rating || 0)}${'☆'.repeat(5 - (r.rating || 0))}</span>
              <span class="review-author">${this._esc(r.reviewer_name || 'Ẩn danh')}</span>
            </div>
            ${r.comment ? `<div class="review-body">${this._esc(r.comment)}</div>` : ''}
          </div>
        `).join('');

    container.innerHTML = `
      <div class="review-list">${listHtml}</div>
      <div class="review-form">
        <div style="color:#888;font-size:9px;letter-spacing:.14em;text-transform:uppercase;margin-bottom:12px">Viết đánh giá</div>
        <div style="margin-bottom:10px">
          <div class="pf-label">Tên của bạn</div>
          <input class="pf-input rv-name" style="font-size:11px;padding:6px 10px" placeholder="Tên (để trống là ẩn danh)" />
        </div>
        <div style="margin-bottom:10px">
          <div class="pf-label">Đánh giá sao</div>
          <div class="star-picker">
            ${[1,2,3,4,5].map(n => `<button class="star-pick-btn" data-v="${n}" type="button">★</button>`).join('')}
          </div>
        </div>
        <div style="margin-bottom:12px">
          <div class="pf-label">Nhận xét</div>
          <textarea class="pf-input pf-textarea rv-comment" style="min-height:70px;font-size:11px" placeholder="Chia sẻ cảm nhận của bạn về sản phẩm..."></textarea>
        </div>
        <button class="pf-btn gold rv-submit-btn" style="font-size:10px">Gửi đánh giá</button>
      </div>
    `;

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
    document.getElementById('pm-title').value = product?.title       || '';
    document.getElementById('pm-desc').value  = product?.description || '';
    document.getElementById('pm-price').value = product?.price       || '';

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

      const formData = {
        title,
        description: document.getElementById('pm-desc').value.trim(),
        price:       document.getElementById('pm-price').value.trim(),
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
  _addProductToCart(product, btn) {
    const existing = JSON.parse(localStorage.getItem('gallery_cart') || '[]');
    if (existing.some(it => it.productId === product.id)) {
      this._showToast('Đã có trong giỏ hàng');
      return;
    }
    existing.push({
      title: product.title,
      artist: this._target.name,
      year: '',
      price: product.price || '',
      productId: product.id,
      type: 'product',
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
      itemsEl.innerHTML = '<div style="color:#888;font-size:10px;letter-spacing:.1em;padding:8px 0">Giỏ hàng trống</div>';
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

  // ─── HTML escape helper ──────────────────────────────────────────────────────
  _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  update(_dt) {
    if (this._particles) this._particles.rotation.y += _dt * 0.01;
  }
}

