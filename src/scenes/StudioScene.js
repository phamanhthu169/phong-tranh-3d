import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { supabase, STORAGE_BUCKET } from '../utils/supabase.js';
import { BaseScene } from './BaseScene.js';
import { TextEditor } from './TextEditor.js';

export class StudioScene extends BaseScene {
  async init() {
    /* ── Route guard: chỉ Artist mới vào được ── */
    await this.manager.auth.ready();
    if (this._disposed) return;

    if (!this.manager.auth.isLoggedIn) {
      this.manager.navigateTo('login'); return;
    }
    if (!this.manager.auth.isArtist) {
      this.manager.navigateTo('landing'); return;
    }
    if (!this.manager.currentRoom) {
      this.manager.navigateTo('dashboard'); return;
    }

    /* ── Scene ── */
    this.threeScene.background = new THREE.Color(0x87ceeb);

    /* ── Đèn (giá trị mặc định) ── */
    this.ambLight  = new THREE.AmbientLight(0xffffff, 1.2);
    this.hemiLight = new THREE.HemisphereLight(0xffe8c0, 0x3a2e20, 0.5);
    this.dirLight  = new THREE.DirectionalLight(0xffffff, 1.2);
    this.dirLight.position.set(5, 10, 5); this.dirLight.castShadow = true;
    this.threeScene.add(this.ambLight, this.hemiLight, this.dirLight);

    /* ── Load phòng GLB ── */
    this.modelMeshes = [];
    await this._loadRoomGLB();

    if (this._disposed) return;

    /* ── State ── */
    this.selectedTemplate = 'scene.glb';
    this.artworks       = [];
    this.models3d       = [];
    this.backgroundMusic = null;
    this.isMusicPlaying  = false;
    this.selectedSource = null;
    this.selectedItem   = null;
    this.frameMat       = new THREE.MeshLambertMaterial({ color: 0x2a2018 });
    this.gltfLoader     = new GLTFLoader();
    this.objLoader      = new OBJLoader();
    this.mode           = 'walk';
    this.chests          = [];
    this._chestPlacingMode = false;
    this._pendingChestPos  = null;

    /* ── Waypoint System (lộ trình đường đi) ── */
    this.floorY         = 0;       // Y mặt sàn thực, được cập nhật khi load GLB
    this.pathWaypoints  = [];      // { x, y, z, yaw, pitch, label }
    this.pathMarkers    = [];      // { mesh, line }
    this.currentWpIdx   = -1;
    this.wpTravelTarget = null;
    this.wpTravelFrom   = null;
    this.wpTravelT      = 0;
    this._hoveredWpDisc = null;
    this.yaw = 0;
    this.pitch = 0;

    /* ── Camera controls ── */
    this.isLeftDown = false;
    this.lastX = 0;
    this.lastY = 0;
    this.didDrag = false;
    this.keys = {};
    this.moveDir = new THREE.Vector3();
    this.fwd     = new THREE.Vector3();
    this.rgt     = new THREE.Vector3();
    
    /* ── Lưu vị trí chuột cho text preview ── */
    this._lastMouseX = 0;
    this._lastMouseY = 0;

    /* ── Raycaster ── */
    this.raycaster = new THREE.Raycaster();
    this.mouse     = new THREE.Vector2();
    this.colRay    = new THREE.Raycaster();
    this.colDir    = new THREE.Vector3();

    /* ── Text Editor ── */
    this.textEditor = new TextEditor(this.threeScene, this.modelMeshes, (msg, type) => this.toast(msg, type));
    this.textEditor.buildPanel();

    /* ── Xây giao diện ── */
    this._injectCSS();
    this._buildToolbar();
    this._buildToast();
    this._buildLightPanel();
    this._buildRightPanel();
    this._buildHUD();
    this._buildInfoPopup();
    this._buildPathPanel();
    this._buildNavBar();
    this._buildTemplatePanel();
    this._buildDecorPanel();
    this._buildChestPanel();
    this._buildMusicPanel();
    this._buildWaypointElements();
    this._injectWaypointCSS();
    this._bindControls();

    /* ── Sự kiện ── */
    this._on(this.renderer.domElement, 'click',     (e) => this._onCanvasClick(e));
    this._on(this.renderer.domElement, 'mousedown', (e) => { if (e.button === 0) { this.isLeftDown = true; this.didDrag = false; this.lastX = e.clientX; this.lastY = e.clientY; } });
    this._on(window,                   'mouseup',   (e) => { if (e.button === 0) this.isLeftDown = false; });
    this._on(this.renderer.domElement, 'mousemove', (e) => this._onMouseMove(e));
    this._on(document,                 'keydown',   (e) => { this.keys[e.code] = true; });
    this._on(document,                 'keyup',     (e) => { this.keys[e.code] = false; });
    
    /* ── Waypoint hover ── */
    this._setupWaypointHover();

    await this.loadGallery();
  }

  /* ══════════════════════════════════════════════ CSS ══════════════════════════════════════════════ */
  _injectCSS() {
    const style = document.createElement('style');
    style.textContent = `
      *{box-sizing:border-box}
      .tb-btn{padding:7px 14px;font-size:12px;cursor:pointer;background:rgba(20,18,14,.85);color:#d4c5a9;border:1px solid rgba(212,197,169,.3);border-radius:3px;font-family:monospace;letter-spacing:.06em;transition:all .2s}
      .tb-btn:hover,.tb-btn.active{background:rgba(200,169,110,.25);border-color:#c8a96e;color:#fff}
      .hud-btn{padding:5px 10px;font-size:11px;cursor:pointer;font-family:monospace;background:rgba(212,197,169,.08);color:#d4c5a9;border:1px solid rgba(212,197,169,.2);border-radius:2px;transition:all .15s}
      .hud-btn:hover{background:rgba(212,197,169,.2);color:#fff}
      .hud-btn.danger:hover{background:rgba(181,74,58,.3);border-color:rgba(181,74,58,.6);color:#ffaaaa}
      .uth.sel,.model-th.sel{border-color:#c8a96e!important}
      #toast{position:fixed;bottom:50px;left:50%;transform:translateX(-50%) translateY(20px);background:rgba(20,18,14,.96);border:.5px solid rgba(212,197,169,.18);color:#d4c5a9;font-size:9px;letter-spacing:.14em;text-transform:uppercase;padding:8px 18px;border-radius:3px;pointer-events:none;opacity:0;transition:opacity .3s,transform .3s;z-index:50;white-space:nowrap}
      #toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
      #toast.success{border-color:#6aaa7a;color:#6aaa7a}
      #toast.error{border-color:#b54a3a;color:#b54a3a}
      #light-panel,#path-panel,#template-panel,#decor-panel{position:fixed;left:10px;top:60px;width:260px;background:rgba(15,13,12,.97);border:.5px solid rgba(212,197,169,.18);border-radius:4px;z-index:20;padding:12px;flex-direction:column;gap:10px;display:none;font-family:monospace;max-height:80vh;overflow-y:auto}
      #light-panel.open,#path-panel.open,#template-panel.open,#decor-panel.open{display:flex}
      #light-panel h3,#path-panel h3,#template-panel h3,#decor-panel h3{color:#d4c5a9;font-size:13px;font-style:italic;letter-spacing:.1em;border-bottom:.5px solid rgba(212,197,169,.18);padding-bottom:6px;margin:0}
      .lp-row{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .lp-label{color:#7a6e5c;font-size:9px;letter-spacing:.1em;text-transform:uppercase;flex-shrink:0}
      .lp-val{color:#d4c5a9;font-size:9px;width:28px;text-align:right;flex-shrink:0}
      .lp-range{flex:1;-webkit-appearance:none;height:2px;background:rgba(212,197,169,.2);border-radius:1px;outline:none;cursor:pointer}
      .lp-range::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;border-radius:50%;background:#d4c5a9;cursor:pointer}
      .lp-color{width:32px;height:20px;border:none;border-radius:2px;cursor:pointer;background:none;padding:0}
      .pp-btn{background:rgba(212,197,169,.08);border:.5px solid rgba(212,197,169,.18);color:#7a6e5c;font-family:monospace;font-size:9px;padding:5px 10px;cursor:pointer;border-radius:2px;letter-spacing:.06em;transition:all .2s;white-space:nowrap}
      .pp-btn:hover{background:rgba(212,197,169,.18);color:#d4c5a9}
      .pp-btn.primary{background:rgba(200,169,110,.15);border-color:rgba(200,169,110,.5);color:#c8a96e}
      .pp-btn.danger{border-color:rgba(181,74,58,.4);color:rgba(181,74,58,.8)}
      .pp-btn.danger:hover{background:rgba(181,74,58,.15)}
      .pp-sep{border:none;border-top:.5px solid rgba(212,197,169,.1);margin:2px 0}
      #wp-list{display:flex;flex-direction:column;gap:4px;max-height:200px;overflow-y:auto;margin-top:4px}
      .wp-item{display:flex;align-items:center;gap:6px;background:rgba(212,197,169,.04);border:.5px solid rgba(212,197,169,.12);border-radius:2px;padding:5px 8px;cursor:grab;transition:all .2s}
      .wp-item:active{cursor:grabbing}
      .wp-item:hover,.wp-item.active{border-color:#c8a96e;background:rgba(200,169,110,.08)}
      .wp-item.wp-drag-over{border-color:rgba(100,160,255,.6);background:rgba(100,160,255,.1)}
      .wp-num{color:#c8a96e;font-size:9px;min-width:20px;font-weight:bold}
      .wp-lbl{color:#7a6e5c;font-size:8px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
      .wp-lbl:hover{color:#d4c5a9}
      .wp-del{background:rgba(181,74,58,.6);color:#fff;border:none;font-size:7px;cursor:pointer;padding:1px 5px;border-radius:1px}
      .wp-del:hover{background:rgba(181,74,58,.9)}
      #path-nav-bar{position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(15,13,12,.94);border:.5px solid #c8a96e;border-radius:4px;padding:6px 10px;display:none;align-items:center;gap:8px;z-index:25;font-family:monospace}
      #path-nav-bar.show{display:flex}
      .pnb-arrow{background:rgba(200,169,110,.12);border:.5px solid rgba(200,169,110,.4);color:#c8a96e;font-size:14px;width:28px;height:28px;cursor:pointer;border-radius:3px;display:flex;align-items:center;justify-content:center;transition:all .2s}
      .pnb-arrow:hover{background:rgba(200,169,110,.28);color:#fff}
      .pnb-arrow:disabled{opacity:.3;cursor:not-allowed}
      #pnb-info{display:flex;flex-direction:column;align-items:center;min-width:90px}
      #pnb-num{color:#c8a96e;font-size:11px;font-style:italic}
      #pnb-label{color:#7a6e5c;font-size:7px;letter-spacing:.1em;text-transform:uppercase;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #pnb-close{background:none;border:.5px solid rgba(212,197,169,.15);color:#555;font-size:9px;cursor:pointer;border-radius:2px;padding:2px 6px;transition:all .2s}
      #pnb-close:hover{color:#d4c5a9}
      
      #music-panel{
        position:fixed;bottom:20px;right:20px;background:rgba(15,13,12,.94);border:.5px solid rgba(212,197,169,.25);
        border-radius:30px;padding:8px 16px;display:flex;align-items:center;gap:12px;z-index:20;font-family:monospace;backdrop-filter:blur(4px)
      }
      .music-btn{background:rgba(200,169,110,.15);border:.5px solid rgba(200,169,110,.4);color:#c8a96e;width:32px;height:32px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;transition:all .2s}
      .music-btn:hover{background:rgba(200,169,110,.35);color:#fff}
      .music-volume{width:80px;-webkit-appearance:none;height:2px;background:rgba(212,197,169,.3);border-radius:1px;outline:none}
      .music-volume::-webkit-slider-thumb{-webkit-appearance:none;width:8px;height:8px;border-radius:50%;background:#c8a96e;cursor:pointer}
      #music-track-name{font-size:9px;color:#7a6e5c;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      
      #path-walk-hint{
        position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(15,13,12,.94);
        border:.5px solid #c8a96e;border-radius:4px;padding:8px 18px;color:#c8a96e;font-family:monospace;
        font-size:8px;letter-spacing:.12em;text-transform:uppercase;pointer-events:none;opacity:0;
        transition:opacity .4s;white-space:nowrap;z-index:25
      }
      #path-walk-hint.show{opacity:1}
      
      #wp-nav-tip{
        position:fixed;left:50%;transform:translateX(-50%);top:70px;z-index:25;pointer-events:none;
        background:rgba(15,13,12,.94);border:.5px solid #c8a96e;border-radius:4px;padding:8px 18px;
        color:#c8a96e;font-family:monospace;font-size:8px;letter-spacing:.15em;text-transform:uppercase;
        display:none;align-items:center;gap:8px
      }
      #wp-nav-tip.show{display:flex}
      .wp-tip-num{color:#fff;font-size:16px;font-weight:bold;margin-right:6px}
      .wp-tip-label{color:#7a6e5c;font-size:7px}
      #chest-panel{position:fixed;left:10px;top:60px;width:260px;background:rgba(15,13,12,.97);border:.5px solid rgba(212,197,169,.18);border-radius:4px;z-index:20;padding:12px;flex-direction:column;gap:10px;display:none;font-family:monospace;max-height:80vh;overflow-y:auto}
      #chest-panel.open{display:flex}
      .chest-item{display:flex;align-items:center;gap:6px;background:rgba(212,197,169,.04);border:.5px solid rgba(212,197,169,.12);border-radius:2px;padding:5px 8px}
      .chest-item-lbl{color:#7a6e5c;font-size:9px;flex:1}
      .chest-item-del{background:rgba(181,74,58,.6);color:#fff;border:none;font-size:7px;cursor:pointer;padding:1px 5px;border-radius:1px}
      #chest-cfg{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:200;display:none;align-items:center;justify-content:center}
      #chest-cfg.open{display:flex}
      .ccfg{background:rgba(15,13,12,.97);border:.5px solid rgba(200,169,110,.4);border-radius:4px;padding:20px;display:flex;flex-direction:column;gap:12px;min-width:320px;font-family:monospace}
      .ccfg h3{color:#c8a96e;font-size:14px;margin:0}
      .ccfg label{color:#7a6e5c;font-size:9px;letter-spacing:.1em;text-transform:uppercase;display:block;margin-bottom:4px}
      .ccfg input,.ccfg textarea{background:rgba(20,18,14,.8);border:.5px solid rgba(212,197,169,.25);color:#d4c5a9;font-family:monospace;font-size:11px;padding:6px 8px;border-radius:2px;outline:none;width:100%;box-sizing:border-box}
      .ccfg textarea{resize:vertical;min-height:60px}
    `;
    document.head.appendChild(style);
    this._el(style);
  }

  /* ══════════════════════════════════════════════ TOOLBAR ══════════════════════════════════════════════ */
  _buildToolbar() {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:10;';
    const isPub = this.manager.currentRoom?.isPublished || false;
    el.innerHTML = `
      <button class="tb-btn" id="btn-back">← Back</button>
      <button class="tb-btn active" id="btn-walk">🚶 Walk</button>
      <button class="tb-btn" id="btn-place">📌 Place</button>
      <button class="tb-btn" id="btn-select">✦ Select</button>
      <button class="tb-btn" id="btn-light">💡 Light</button>
      <button class="tb-btn" id="btn-path">🛤 Path</button>
      <button class="tb-btn" id="btn-template">🏛 Template</button>
      <button class="tb-btn" id="btn-decor">🎨 Decor</button>
      <button class="tb-btn" id="btn-adv-text">✏️ Adv Text</button>
      <button class="tb-btn" id="btn-chest">🗝 Rương</button>
      <button class="tb-btn" id="btn-save">💾 Save</button>
      <button class="tb-btn ${isPub ? 'active' : ''}" id="btn-publish">${isPub ? '🔒 Unpublish' : '🌐 Publish'}</button>
    `;
    document.body.appendChild(el); this._el(el);
  }

  /* ══════════════════════════════════════════════ TOAST ══════════════════════════════════════════════ */
  _buildToast() {
    this._toastEl = document.createElement('div');
    this._toastEl.id = 'toast';
    document.body.appendChild(this._toastEl); this._el(this._toastEl);
  }

  toast(msg, type = 'info', duration = 2800) {
    this._toastEl.textContent = msg; this._toastEl.className = 'show ' + type;
    clearTimeout(this._toastEl._t);
    this._toastEl._t = setTimeout(() => { this._toastEl.className = ''; }, duration);
  }

  /* ══════════════════════════════════════════════ MODE ══════════════════════════════════════════════ */
  setMode(m) {
    this.mode = m;
    document.querySelectorAll('.tb-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-' + m)?.classList.add('active');
    this.renderer.domElement.style.cursor = m === 'place' ? 'crosshair' : (m === 'walk' ? 'grab' : 'default');
    if (m !== 'select') this.deselectItem();
  }

  /* ══════════════════════════════════════════════ LIGHT PANEL ══════════════════════════════════════════════ */
  _buildLightPanel() {
    this._lightPanel = document.createElement('div');
    this._lightPanel.id = 'light-panel';
    this._lightPanel.innerHTML = `
      <h3>💡 Ánh sáng</h3>
      <div class="lp-row"><span class="lp-label">Ambient</span><input type="range" class="lp-range" id="amb-intensity" min="0" max="2" step="0.01" value="1.2"><span class="lp-val" id="amb-val">1.20</span></div>
      <div class="lp-row"><span class="lp-label">Màu ambient</span><input type="color" class="lp-color" id="amb-color" value="#ffffff"></div>
      <div class="lp-row"><span class="lp-label">Hemisphere</span><input type="range" class="lp-range" id="hemi-intensity" min="0" max="1.5" step="0.01" value="0.5"><span class="lp-val" id="hemi-val">0.50</span></div>
      <div class="lp-row"><span class="lp-label">Directional</span><input type="range" class="lp-range" id="dir-intensity" min="0" max="3" step="0.01" value="1.2"><span class="lp-val" id="dir-val">1.20</span></div>
    `;
    document.body.appendChild(this._lightPanel); this._el(this._lightPanel);
  }

  /* ══════════════════════════════════════════════ PANEL PHẢI (upload) ══════════════════════════════════════════════ */
  _buildRightPanel() {
    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;right:0;top:0;bottom:0;width:165px;background:rgba(15,13,12,.97);border-left:1px solid rgba(212,197,169,.15);display:flex;flex-direction:column;z-index:10;overflow-y:auto;font-family:monospace;';
    panel.innerHTML = `
      <div style="color:#d4c5a9;font-size:13px;font-style:italic;padding:12px 12px 8px;border-bottom:1px solid rgba(212,197,169,.1)">Tác phẩm</div>
      <div style="color:#555;font-size:9px;letter-spacing:.15em;text-transform:uppercase;padding:9px 12px 4px">Upload ảnh / video</div>
      <div id="uz-img" style="margin:5px 10px;padding:10px 5px;text-align:center;cursor:pointer;background:rgba(20,18,14,.6);color:#e8d8ff;border:1px solid rgba(200,150,255,.4);font-size:10px;letter-spacing:.1em;text-transform:uppercase;line-height:1.8;border-radius:2px">+ JPG · PNG · MP4</div>
      <input type="file" id="fi-img" accept="image/*,video/*" multiple style="display:none">
      <div id="uw-img" style="padding:3px 10px"></div>
      <div style="color:#555;font-size:9px;letter-spacing:.15em;text-transform:uppercase;padding:9px 12px 4px;border-top:1px solid rgba(212,197,169,.08)">Upload 3D model</div>
      <div id="uz-3d" style="margin:5px 10px;padding:10px 5px;text-align:center;cursor:pointer;background:rgba(20,18,14,.6);color:#d8f0e8;border:1px solid rgba(100,200,150,.4);font-size:10px;letter-spacing:.1em;text-transform:uppercase;line-height:1.8;border-radius:2px">+ GLB · GLTF · OBJ</div>
      <input type="file" id="fi-3d" accept=".glb,.gltf,.obj" multiple style="display:none">
      <div id="uw-3d" style="padding:3px 10px"></div>
      <div style="color:#555;font-size:9px;letter-spacing:.08em;text-transform:uppercase;padding:10px 12px;line-height:2;border-top:1px solid rgba(212,197,169,.08);margin-top:auto">Chọn file<br>→ Place<br>→ click tường/sàn</div>
    `;
    document.body.appendChild(panel); this._el(panel);

    document.getElementById('uz-img').addEventListener('click', () => document.getElementById('fi-img').click());
    document.getElementById('uz-3d').addEventListener('click', () => document.getElementById('fi-3d').click());

    document.getElementById('fi-img').addEventListener('change', async (e) => {
      const wrap = document.getElementById('uw-img');
      for (const file of Array.from(e.target.files)) {
        const isVideo = file.type.startsWith('video/');
        if (isVideo) {
          try {
            this.toast('Đang upload video...', 'info', 15000);
            const storageUrl = await this.uploadToStorage(file);
            if (!storageUrl) { this.toast('Upload thất bại', 'error'); continue; }
            const vid = document.createElement('video');
            vid.src = storageUrl; vid.loop = true; vid.muted = true; vid.playsInline = true; vid.crossOrigin = 'anonymous';
            vid.addEventListener('loadeddata', () => {
              const tex = new THREE.VideoTexture(vid); tex.minFilter = THREE.LinearFilter;
              const src = { isVideo: true, texture: tex, videoEl: vid, storageUrl };
              const wi = document.createElement('div'); wi.style.cssText = 'position:relative;margin-bottom:4px';
              const th = document.createElement('canvas'); th.width = 120; th.height = 90; th.className = 'uth';
              th.style.cssText = 'width:100%;aspect-ratio:4/3;cursor:pointer;border:1.5px solid transparent;display:block;border-radius:2px;';
              setTimeout(() => { vid.currentTime = 0.5; vid.addEventListener('seeked', () => { th.getContext('2d').drawImage(vid, 0, 0, 120, 90); }, { once: true }); }, 200);
              th.addEventListener('click', () => { this.selectSource(src); document.querySelectorAll('.uth,.model-th').forEach(el => el.classList.remove('sel')); th.classList.add('sel'); });
              const lbl = document.createElement('div'); lbl.style.cssText = 'font-size:9px;color:#555;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:4px';
              lbl.textContent = '▶ ' + file.name.substring(0, 18);
              wi.appendChild(th); wi.appendChild(lbl); wrap.appendChild(wi);
              this.selectSource(src); th.classList.add('sel'); vid.play(); this.setMode('place');
              this.toast('Video ✓ — click tường để đặt', 'success');
            });
          } catch (err) { this.toast('Lỗi: ' + err.message, 'error'); }
        } else {
          this.toast('Đang upload...', 'info', 10000);
          const storageUrl = await this.uploadToStorage(file);
          const img = new Image();
          img.onload = () => {
            const nw = img.naturalWidth, nh = img.naturalHeight;
            const cv = document.createElement('canvas'); cv.width = 512; cv.height = Math.round(512 * nh / nw);
            cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
            const tex = new THREE.CanvasTexture(cv);
            const src = { canvas: cv, texture: tex, naturalWidth: nw, naturalHeight: nh, storageUrl };
            const wi = document.createElement('div'); wi.style.cssText = 'position:relative;margin-bottom:4px';
            const th = document.createElement('canvas'); th.width = 120; th.height = 90; th.className = 'uth';
            th.style.cssText = 'width:100%;aspect-ratio:4/3;cursor:pointer;border:1.5px solid transparent;display:block;border-radius:2px;';
            th.getContext('2d').drawImage(img, 0, 0, 120, 90);
            th.addEventListener('click', () => { this.selectSource(src); document.querySelectorAll('.uth,.model-th').forEach(el => el.classList.remove('sel')); th.classList.add('sel'); });
            const lbl = document.createElement('div'); lbl.style.cssText = 'font-size:9px;color:#555;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:4px';
            lbl.textContent = file.name.substring(0, 20);
            wi.appendChild(th); wi.appendChild(lbl); wrap.appendChild(wi);
            this.selectSource(src); th.classList.add('sel'); this.setMode('place');
            this.toast('Ảnh ✓ — click tường để đặt', 'success');
          };
          img.src = URL.createObjectURL(file);
        }
      }
      e.target.value = '';
    });

    document.getElementById('fi-3d').addEventListener('change', async (e) => {
      for (const file of Array.from(e.target.files)) {
        const ext = file.name.split('.').pop().toLowerCase();
        try {
          this.toast('Đang upload ' + file.name + '...', 'info', 15000);
          const storageUrl = await this.uploadToStorage(file);
          if (!storageUrl) { this.toast('Upload thất bại', 'error'); continue; }
          this.toast('Đang load model...', 'info', 10000);
          const onLoad = (object) => {
            const src = { type: 'model3d', object, name: file.name, storageUrl };
            const th = document.createElement('div'); th.className = 'model-th';
            th.style.cssText = 'width:100%;padding:8px 0;text-align:center;font-size:20px;cursor:pointer;border:1.5px solid transparent;border-radius:2px;background:#111;margin-bottom:2px;transition:border-color .2s';
            th.textContent = '📦'; th.title = file.name;
            th.addEventListener('click', () => { this.selectSource(src); document.querySelectorAll('.uth,.model-th').forEach(el => el.classList.remove('sel')); th.classList.add('sel'); });
            const lbl = document.createElement('div'); lbl.style.cssText = 'font-size:9px;color:#555;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:5px';
            lbl.textContent = file.name.substring(0, 20);
            document.getElementById('uw-3d').appendChild(th); document.getElementById('uw-3d').appendChild(lbl);
            this.selectSource(src); th.classList.add('sel'); this.setMode('place');
            this.toast('Model ✓ — click sàn để đặt', 'success');
          };
          const onErr = () => this.toast('Không load được: ' + file.name, 'error');
          if (ext === 'glb' || ext === 'gltf') this.gltfLoader.load(storageUrl, g => onLoad(g.scene), null, onErr);
          else if (ext === 'obj') this.objLoader.load(storageUrl, obj => { obj.traverse(c => { if (c.isMesh) c.material = new THREE.MeshLambertMaterial({ color: 0xccbbaa }); }); onLoad(obj); }, null, onErr);
          else this.toast('Không hỗ trợ: .' + ext, 'error');
        } catch (err) { this.toast('Lỗi: ' + err.message, 'error'); }
      }
      e.target.value = '';
    });
  }

  /* ══════════════════════════════════════════════ UPLOAD ══════════════════════════════════════════════ */
  async uploadToStorage(file) {
    const path = `${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: true });
    if (error) { console.error(error.message); return null; }
    return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  selectSource(src) {
    this.selectedSource = src;
  }

  /* ══════════════════════════════════════════════ HUD ══════════════════════════════════════════════ */
  _buildHUD() {
    this._hud = document.createElement('div');
    this._hud.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:rgba(15,13,12,.95);border:1px solid rgba(212,197,169,.2);border-radius:4px;padding:10px 14px;display:none;flex-direction:column;gap:8px;z-index:20;font-family:monospace;min-width:320px;';
    this._hud.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span id="hud-name" style="color:#d4c5a9;font-size:11px;font-style:italic"></span>
        <button id="hud-close" style="background:none;border:none;color:#555;cursor:pointer;font-size:14px">✕</button>
      </div>
      <div style="display:flex;gap:5px;flex-wrap:wrap">
        <button class="hud-btn" id="th-up">↑</button>
        <button class="hud-btn" id="th-down">↓</button>
        <button class="hud-btn" id="th-left">←</button>
        <button class="hud-btn" id="th-right">→</button>
        <button class="hud-btn" id="th-rot-l">↺</button>
        <button class="hud-btn" id="th-rot-r">↻</button>
        <button class="hud-btn" id="th-scale-up">＋</button>
        <button class="hud-btn" id="th-scale-dn">－</button>
        <button class="hud-btn" id="th-info">📝 Info</button>
        <button class="hud-btn danger" id="th-remove">🗑</button>
      </div>
    `;
    document.body.appendChild(this._hud); this._el(this._hud);
  }

  getSelObj() {
    if (!this.selectedItem) return null;
    if (this.selectedItem.type === 'chest') return this.selectedItem.data.mesh;
    return this.selectedItem.type === 'artwork' ? this.selectedItem.data.group : this.selectedItem.data.object;
  }

  selectItem(type, data, index) {
    this.selectedItem = { type, data, index };
    this._hud.style.display = 'flex';
    const infoBtn = document.getElementById('th-info');
    if (infoBtn) infoBtn.style.display = type === 'chest' ? 'none' : '';
    if (type === 'chest') {
      document.getElementById('hud-name').textContent = `🗝 Rương #${index + 1} · ⭐ ${data.token_amount}`;
    } else {
      document.getElementById('hud-name').textContent = data.meta?.title || (type === 'model' ? `Model #${index + 1}` : `Tác phẩm #${index + 1}`);
    }
  }

  deselectItem() {
    if (this.selectedItem?.type === 'chest') this._saveChestTransform(this.selectedItem.data);
    this.selectedItem = null;
    this._hud.style.display = 'none';
    if (this._infoPopup) this._infoPopup.style.display = 'none';
  }

  /* ══════════════════════════════════════════════ INFO POPUP ══════════════════════════════════════════════ */
  _buildInfoPopup() {
    this._infoPopup = document.createElement('div');
    this._infoPopup.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(15,13,12,.97);border:1px solid rgba(212,197,169,.2);border-radius:4px;padding:16px;width:260px;flex-direction:column;gap:10px;z-index:30;font-family:monospace;display:none;';
    this._infoPopup.innerHTML = `
      <div style="color:#d4c5a9;font-size:14px;font-style:italic">📝 Thông tin</div>
      ${['title:Tên', 'artist:Nghệ sĩ', 'year:Năm', 'price:Giá'].map(f => {
        const [k, lbl] = f.split(':');
        return `<div style="display:flex;flex-direction:column;gap:3px"><label style="color:#555;font-size:9px;letter-spacing:.12em;text-transform:uppercase">${lbl}</label><input id="pop-${k}" style="background:rgba(212,197,169,.05);border:1px solid rgba(212,197,169,.15);color:#d4c5a9;font-family:monospace;font-size:11px;padding:5px 8px;border-radius:2px;outline:none"></div>`;
      }).join('')}
      <div style="display:flex;flex-direction:column;gap:3px">
        <label style="color:#555;font-size:9px;letter-spacing:.12em;text-transform:uppercase">Mô tả</label>
        <textarea id="pop-desc" rows="2" style="background:rgba(212,197,169,.05);border:1px solid rgba(212,197,169,.15);color:#d4c5a9;font-family:monospace;font-size:11px;padding:5px 8px;border-radius:2px;outline:none;resize:vertical"></textarea>
      </div>
      <div style="display:flex;gap:6px;justify-content:flex-end">
        <button id="pop-cancel" style="padding:5px 10px;font-size:10px;font-family:monospace;cursor:pointer;background:rgba(212,197,169,.08);color:#7a6e5c;border:1px solid rgba(212,197,169,.15);border-radius:2px">Huỷ</button>
        <button id="pop-save" style="padding:5px 10px;font-size:10px;font-family:monospace;cursor:pointer;background:rgba(106,170,122,.15);color:#6aaa7a;border:1px solid rgba(106,170,122,.3);border-radius:2px">Lưu</button>
      </div>
    `;
    document.body.appendChild(this._infoPopup); this._el(this._infoPopup);
  }

  /* ══════════════════════════════════════════════ PEDESTAL + PLACE ══════════════════════════════════════════════ */
  makePedestal(pos) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, .08, 1.1), new THREE.MeshLambertMaterial({ color: 0xddd8d0 })); base.position.set(0, .04, 0); g.add(base);
    const col  = new THREE.Mesh(new THREE.BoxGeometry(.9, .8, .9),   new THREE.MeshLambertMaterial({ color: 0xf0ece6 })); col.position.set(0, .44, 0); g.add(col);
    const top  = new THREE.Mesh(new THREE.BoxGeometry(1.05, .06, 1.05), new THREE.MeshLambertMaterial({ color: 0xddd8d0 })); top.position.set(0, .87, 0); g.add(top);
    g.position.copy(pos); this.threeScene.add(g); return g;
  }

  place3DModel(object, pos, storageUrl, name, meta = {}, scaleVec = null) {
    if (scaleVec) { object.scale.copy(scaleVec); }
    else { const box = new THREE.Box3().setFromObject(object); const sz = box.getSize(new THREE.Vector3()); object.scale.setScalar(1.2 / Math.max(sz.x, sz.y, sz.z)); }
    object.position.copy(pos); object.position.y = .88; this.threeScene.add(object);
    const pl = new THREE.PointLight(0xfff0dd, 1.5, 4); pl.position.set(pos.x, pos.y + 2, pos.z); this.threeScene.add(pl);
    const ped = this.makePedestal(new THREE.Vector3(pos.x, 0, pos.z));
    const md = { object, light: pl, pedestal: ped, storageUrl: storageUrl || null, name: name || null, meta: { title: '', artist: '', year: '', desc: '', price: '', ...meta } };
    this.models3d.push(md); return md;
  }

  placeArtwork(src, pos, rot, meta = {}, scaleVec = null) {
    const tex = src.texture || new THREE.CanvasTexture(src.canvas);
    let ar = 4 / 3;
    if (src.naturalWidth && src.naturalHeight) ar = src.naturalWidth / src.naturalHeight;
    else if (src.isVideo && src.videoEl && src.videoEl.videoWidth) ar = src.videoEl.videoWidth / src.videoEl.videoHeight;
    const AH = 1.65, AW = AH * ar;
    const group = new THREE.Group(); group.position.copy(pos); group.rotation.set(...rot);
    if (scaleVec) group.scale.copy(scaleVec);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(AW + .16, AH + .16, .08), this.frameMat); group.add(frame);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(AW, AH), new THREE.MeshBasicMaterial({ map: tex })); plane.position.z = .046; group.add(plane);
    this.threeScene.add(group);
    const ad = { group, frame, plane, isVideo: src.isVideo || false, videoTex: src.isVideo ? tex : null, storageUrl: src.storageUrl || null, naturalWidth: src.naturalWidth || (src.isVideo && src.videoEl ? src.videoEl.videoWidth : 1), naturalHeight: src.naturalHeight || (src.isVideo && src.videoEl ? src.videoEl.videoHeight : 1), meta: { title: '', artist: '', year: '', desc: '', price: '', ...meta } };
    this.artworks.push(ad); return ad;
  }

  /* ══════════════════════════════════════════════ WAYPOINT (lộ trình) ══════════════════════════════════════════════ */
  makeWpTex(num, hovered) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    const grd = ctx.createRadialGradient(128, 128, 70, 128, 128, 128);
    grd.addColorStop(0, hovered ? 'rgba(255,220,130,.4)' : 'rgba(200,169,110,.2)');
    grd.addColorStop(1, 'rgba(200,169,110,0)');
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(128, 128, 128, 0, Math.PI * 2); ctx.fill();
    const inner = ctx.createRadialGradient(115, 115, 0, 128, 128, 88);
    inner.addColorStop(0, hovered ? 'rgba(255,235,155,.98)' : 'rgba(225,195,125,.9)');
    inner.addColorStop(1, hovered ? 'rgba(200,155,75,.9)' : 'rgba(165,135,75,.78)');
    ctx.fillStyle = inner; ctx.beginPath(); ctx.arc(128, 128, 88, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = hovered ? 'rgba(255,255,210,.95)' : 'rgba(255,230,160,.72)'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(128, 128, 88, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#0f0d0a'; ctx.font = `bold ${num > 9 ? '58' : '66'}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(num), 128, 134);
    return new THREE.CanvasTexture(c);
  }

  refreshDiscTexture(discMesh, hovered) {
    discMesh.material.map = this.makeWpTex(discMesh.userData.waypointIdx + 1, hovered);
    discMesh.material.needsUpdate = true;
  }

  addWaypoint(wx, wy, wz, wyaw, wpitch, label) {
    const idx = this.pathWaypoints.length;
    this.pathWaypoints.push({ x: wx, y: wy, z: wz, yaw: wyaw || 0, pitch: wpitch || 0, label: label || '' });
    
    // Tính vị trí Y sàn thực: dùng this.floorY nếu có, fallback wy - 1.65
    const floorY = (this.floorY !== undefined) ? this.floorY : (wy - 1.65);

    // Tạo đĩa tròn dưới sàn
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 32),
      new THREE.MeshBasicMaterial({ 
        map: this.makeWpTex(idx + 1, false), 
        transparent: true, 
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide 
      })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(wx, floorY + 0.012, wz);
    disc.renderOrder = 999;
    disc.userData.waypointIdx = idx;
    disc.userData.isWpDisc = true;
    this.threeScene.add(disc);
    
    // Tạo đường kẻ nối với điểm trước đó
    let line = null;
    if (idx > 0) {
      const prev = this.pathWaypoints[idx - 1];
      const points = [
        new THREE.Vector3(prev.x, floorY + 0.015, prev.z),
        new THREE.Vector3(wx, floorY + 0.015, wz)
      ];
      line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: 0xc8a96e, transparent: true, opacity: 0.55, depthTest: false })
      );
      line.renderOrder = 998;
      this.threeScene.add(line);
    }
    
    this.pathMarkers.push({ mesh: disc, line });
    this.renderWpList();
    
    if (this.pathWaypoints.length === 1) {
      this._showPathHint();
    }
  }

  _showPathHint() {
    const hint = document.getElementById('path-walk-hint');
    if (hint) {
      hint.classList.add('show');
      setTimeout(() => { hint.classList.remove('show'); }, 4000);
    }
  }

  removeWaypoint(idx) {
    this.pathWaypoints.splice(idx, 1);
    this.pathMarkers.forEach(m => { 
      this.threeScene.remove(m.mesh); 
      if (m.line) this.threeScene.remove(m.line); 
    });
    this.pathMarkers.length = 0;
    const copy = [...this.pathWaypoints];
    this.pathWaypoints.length = 0;
    copy.forEach(wp => this.addWaypoint(wp.x, wp.y, wp.z, wp.yaw, wp.pitch, wp.label));
  }

  clearWaypoints() {
    this.pathMarkers.forEach(m => { 
      this.threeScene.remove(m.mesh); 
      if (m.line) this.threeScene.remove(m.line); 
    });
    this.pathMarkers.length = 0;
    this.pathWaypoints.length = 0;
    this.currentWpIdx = -1;
    this.renderWpList();
    this.updateNavBar();
  }

  renderWpList() {
    const list = document.getElementById('wp-list'); 
    if (!list) return;
    document.getElementById('wp-count').textContent = this.pathWaypoints.length;
    list.innerHTML = '';
    
    this.pathWaypoints.forEach((wp, i) => {
      const item = document.createElement('div');
      item.className = 'wp-item' + (i === this.currentWpIdx ? ' active' : '');
      item.draggable = true;
      item.dataset.idx = i;
      item.innerHTML = `
        <span class="wp-num">${i + 1}</span>
        <span class="wp-lbl" title="Click để di chuyển">${wp.label || `(${wp.x.toFixed(1)}, ${wp.z.toFixed(1)})`}</span>
        <button class="wp-del" data-i="${i}">✕</button>
      `;
      
      item.addEventListener('click', (e) => { 
        if (e.target.classList.contains('wp-del')) return;
        this.travelToWaypoint(i);
      });
      
      list.appendChild(item);
    });
    
    list.querySelectorAll('.wp-del').forEach(btn => {
      btn.addEventListener('click', (e) => { 
        e.stopPropagation(); 
        this.removeWaypoint(+btn.dataset.i); 
      });
    });
    
    let dragIdx = null;
    list.querySelectorAll('.wp-item').forEach(item => {
      item.addEventListener('dragstart', (e) => {
        dragIdx = +item.dataset.idx;
        item.style.opacity = '0.4';
      });
      item.addEventListener('dragend', (e) => {
        item.style.opacity = '1';
        dragIdx = null;
        list.querySelectorAll('.wp-item').forEach(x => x.classList.remove('wp-drag-over'));
      });
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        item.classList.add('wp-drag-over');
      });
      item.addEventListener('dragleave', () => item.classList.remove('wp-drag-over'));
      item.addEventListener('drop', () => {
        const targetIdx = +item.dataset.idx;
        if (dragIdx === null || dragIdx === targetIdx) return;
        const [moved] = this.pathWaypoints.splice(dragIdx, 1);
        this.pathWaypoints.splice(targetIdx, 0, moved);
        this.pathMarkers.forEach(m => { 
          this.threeScene.remove(m.mesh); 
          if (m.line) this.threeScene.remove(m.line); 
        });
        this.pathMarkers.length = 0;
        const copy = [...this.pathWaypoints];
        this.pathWaypoints.length = 0;
        copy.forEach(wp => this.addWaypoint(wp.x, wp.y, wp.z, wp.yaw, wp.pitch, wp.label));
        this.updateNavBar();
      });
    });
  }

  lerpAngle(a, b, t) { 
    let d = b - a; 
    while (d > Math.PI) d -= Math.PI * 2; 
    while (d < -Math.PI) d += Math.PI * 2; 
    return a + d * t; 
  }

  travelToWaypoint(idx) {
    if (idx < 0 || idx >= this.pathWaypoints.length) return;
    this.currentWpIdx = idx;
    const wp = this.pathWaypoints[idx];
    this.wpTravelFrom = { 
      x: this.camera.position.x, 
      y: this.camera.position.y, 
      z: this.camera.position.z, 
      yaw: this.yaw, 
      pitch: this.pitch 
    };
    this.wpTravelTarget = { 
      x: wp.x, 
      y: wp.y, 
      z: wp.z, 
      yaw: wp.yaw || this.yaw, 
      pitch: wp.pitch || 0 
    };
    this.wpTravelT = 0;
    this.updateNavBar();
    this.renderWpList();
    this._showTravelTooltip(idx, wp);
  }

  _showTravelTooltip(idx, wp) {
    const tip = document.getElementById('wp-nav-tip');
    if (tip) {
      document.getElementById('wp-tip-num').textContent = String(idx + 1);
      document.getElementById('wp-tip-label').textContent = wp.label || (`Điểm ${idx + 1}`);
      tip.classList.add('show');
      setTimeout(() => { tip.classList.remove('show'); }, 2200);
    }
  }

  updateNavBar() {
    const bar = document.getElementById('path-nav-bar');
    if (!bar) return;
    if (this.pathWaypoints.length === 0 || this.currentWpIdx < 0) { 
      bar.classList.remove('show'); 
      return; 
    }
    bar.classList.add('show');
    const wp = this.pathWaypoints[this.currentWpIdx];
    document.getElementById('pnb-num').textContent = `${this.currentWpIdx + 1} / ${this.pathWaypoints.length}`;
    document.getElementById('pnb-label').textContent = wp?.label || '—';
    document.getElementById('pnb-prev').disabled = this.currentWpIdx <= 0;
    document.getElementById('pnb-next').disabled = this.currentWpIdx >= this.pathWaypoints.length - 1;
  }

  autoGeneratePath() {
    this.clearWaypoints();
    const roomCenters = this._detectRoomCenters();
    
    roomCenters.forEach((room, i) => {
      const fy = room.y + 1.7;
      this.addWaypoint(room.x, fy, room.z + room.d/4, 0, 0, `${room.name || `Phòng ${i+1}`} - Cửa vào`);
      this.addWaypoint(room.x, fy, room.z, 0, 0, `${room.name || `Phòng ${i+1}`} - Trung tâm`);
    });
    
    if (this.pathWaypoints.length === 0) {
      this.addWaypoint(this.camera.position.x, this.camera.position.y, this.camera.position.z, this.yaw, this.pitch, 'Vị trí hiện tại');
    }
    
    this.currentWpIdx = 0;
    this.updateNavBar();
    this.toast(`Tự tạo ${this.pathWaypoints.length} điểm tham quan`, 'success');
  }

  _detectRoomCenters() {
    const centers = [];
    const floorYPositions = new Set();
    
    this.modelMeshes.forEach(mesh => {
      if (mesh.geometry && mesh.position.y > -0.5 && mesh.position.y < 1) {
        const yKey = Math.round(mesh.position.y * 10);
        if (!floorYPositions.has(yKey) && centers.length < 5) {
          floorYPositions.add(yKey);
          centers.push({
            x: mesh.position.x,
            y: mesh.position.y,
            z: mesh.position.z,
            w: 8, d: 8,
            name: `Phòng ${centers.length + 1}`
          });
        }
      }
    });
    
    if (centers.length === 0) {
      centers.push({
        x: this.camera.position.x,
        y: 0,
        z: this.camera.position.z,
        w: 10, d: 10,
        name: 'Phòng chính'
      });
    }
    
    return centers;
  }

  /* ══════════════════════════════════════════════ PATH PANEL + NAV BAR ══════════════════════════════════════════════ */
  _buildPathPanel() {
    this._pathPanel = document.createElement('div'); 
    this._pathPanel.id = 'path-panel';
    this._pathPanel.innerHTML = `
      <h3>🛤 Lộ trình tham quan</h3>
      <div style="font-size:8px;color:#555;line-height:1.8">Đứng ở vị trí muốn thêm rồi nhấn nút bên dưới.</div>
      <button class="pp-btn primary" id="pp-add-current" style="width:100%">＋ Thêm điểm hiện tại</button>
      <hr class="pp-sep">
      <div style="font-size:8px;color:#555;letter-spacing:.12em;text-transform:uppercase">Điểm dừng (<span id="wp-count">0</span>)</div>
      <div id="wp-list"></div>
      <hr class="pp-sep">
      <button class="pp-btn danger" id="pp-clear" style="width:100%">✕ Xoá hết</button>
      <button class="pp-btn" id="pp-auto-gen" style="width:100%;margin-top:5px">✦ Tự tạo lộ trình qua các phòng</button>
    `;
    document.body.appendChild(this._pathPanel); 
    this._el(this._pathPanel);
  }

  _buildNavBar() {
    this._navBar = document.createElement('div'); 
    this._navBar.id = 'path-nav-bar';
    this._navBar.innerHTML = `
      <button class="pnb-arrow" id="pnb-prev">&#9664;</button>
      <div id="pnb-info">
        <span id="pnb-num">1/1</span>
        <span id="pnb-label">—</span>
      </div>
      <button class="pnb-arrow" id="pnb-next">&#9654;</button>
      <button id="pnb-close">✕</button>
    `;
    document.body.appendChild(this._navBar); 
    this._el(this._navBar);
  }

  _buildWaypointElements() {
    let hint = document.getElementById('path-walk-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'path-walk-hint';
      hint.textContent = '💡 Click vào vòng tròn trên sàn để di chuyển đến điểm đó';
      document.body.appendChild(hint);
      this._el(hint);
    }
    
    let tip = document.getElementById('wp-nav-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'wp-nav-tip';
      tip.innerHTML = `
        <span class="wp-tip-num" id="wp-tip-num">1</span>
        <div>
          <div id="wp-tip-label" class="wp-tip-label">Điểm tham quan</div>
          <div style="color:#c8a96e;font-size:6px;letter-spacing:.1em">Đang di chuyển...</div>
        </div>
      `;
      document.body.appendChild(tip);
      this._el(tip);
    }
  }

  _injectWaypointCSS() {
    const style = document.createElement('style');
    style.textContent = `
      .wp-item.wp-drag-over { border-color: rgba(100,160,255,.6); background: rgba(100,160,255,.1); }
      .wp-lbl { cursor: pointer; }
      .wp-lbl:hover { color: #d4c5a9; }
      #path-walk-hint { white-space: nowrap; }
    `;
    document.head.appendChild(style);
    this._el(style);
  }

  _setupWaypointHover() {
    this._on(this.renderer.domElement, 'mousemove', (e) => {
      if (this.pathMarkers.length === 0 || this.mode !== 'walk') return;
      
      const rect = this.renderer.domElement.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      this.raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), this.camera);
      const discs = this.pathMarkers.map(m => m.mesh).filter(Boolean);
      const hits = this.raycaster.intersectObjects(discs);
      
      if (hits.length) {
        const disc = hits[0].object;
        if (disc !== this._hoveredWpDisc) {
          if (this._hoveredWpDisc) this.refreshDiscTexture(this._hoveredWpDisc, false);
          this._hoveredWpDisc = disc;
          this.refreshDiscTexture(disc, true);
          this.renderer.domElement.style.cursor = 'pointer';
        }
      } else {
        if (this._hoveredWpDisc) {
          this.refreshDiscTexture(this._hoveredWpDisc, false);
          this._hoveredWpDisc = null;
          this.renderer.domElement.style.cursor = this.mode === 'walk' ? 'grab' : 'default';
        }
      }
    });
  }

  /* ══════════════════════════════════════════════ LOAD GLB ══════════════════════════════════════════════ */
  async _loadRoomGLB(templateFile = 'scene.glb') {
    return new Promise(resolve => {
      new GLTFLoader().load(`/models/${templateFile}`, (gltf) => {
        const model = gltf.scene;
        model.traverse((child) => {
          if (child.isLight) child.intensity = 0;
        });
        this._roomModel = model;
        this.threeScene.add(model);
        model.traverse(c => { if (c.isMesh) this.modelMeshes.push(c); });
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        this.floorY = box.min.y;
        this.camera.position.set(center.x, this.floorY + 1.6, center.z);
        resolve();
      });
    });
  }

  async _changeTemplate(file) {
    if (this.selectedTemplate === file) return;
    if (this._roomModel) {
      this.threeScene.remove(this._roomModel);
      this._roomModel = null;
    }
    this.modelMeshes.length = 0;
    await this._loadRoomGLB(file);
    this.selectedTemplate = file;
    // Cập nhật Y vị trí disc waypoint theo floorY mới
    this.pathMarkers.forEach(m => {
      if (m.mesh) m.mesh.position.y = this.floorY + 0.012;
      if (m.line) {
        const pos = m.line.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) pos.setY(i, this.floorY + 0.015);
        pos.needsUpdate = true;
      }
    });
    this.toast(`Template đã đổi ✓`, 'success');
  }

  /* ══════════════════════════════════════════════ TEMPLATE PANEL ══════════════════════════════════════════════ */
  _buildTemplatePanel() {
    this._templatePanel = document.createElement('div');
    this._templatePanel.id = 'template-panel';
    this._templatePanel.innerHTML = `
      <h3>🏛 Chọn template phòng</h3>
      <div style="font-size:8px;color:#555;line-height:1.8">Đổi template sẽ giữ nguyên tranh và model đã đặt.</div>
      <div id="template-list" style="display:flex;flex-direction:column;gap:6px;margin-top:4px"></div>
    `;
    document.body.appendChild(this._templatePanel);
    this._el(this._templatePanel);
    this._loadTemplateList();
  }

  async _loadTemplateList() {
    const list = document.getElementById('template-list');
    if (!list) return;
    try {
      const res = await fetch('/models/manifest.json');
      const templates = await res.json();
      list.innerHTML = '';
      templates.forEach(t => {
        const btn = document.createElement('button');
        btn.className = 'pp-btn' + (t.file === this.selectedTemplate ? ' primary' : '');
        btn.style.cssText = 'width:100%;text-align:left;padding:8px 10px;display:flex;align-items:center;gap:8px';
        btn.innerHTML = `<span style="font-size:16px">🏛</span><span>${t.name}</span>`;
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          btn.textContent = '⏳ Đang load...';
          await this._changeTemplate(t.file);
          btn.disabled = false;
          list.querySelectorAll('.pp-btn').forEach(b => {
            b.innerHTML = `<span style="font-size:16px">🏛</span><span>${b.dataset.name}</span>`;
            b.classList.remove('primary');
          });
          btn.classList.add('primary');
          btn.innerHTML = `<span style="font-size:16px">🏛</span><span>${t.name}</span>`;
        });
        btn.dataset.name = t.name;
        list.appendChild(btn);
      });
    } catch {
      list.innerHTML = '<div style="color:#555;font-size:9px">Không load được manifest</div>';
    }
  }

  /* ══════════════════════════════════════════════ DECOR PANEL ══════════════════════════════════════════════ */
  _buildDecorPanel() {
    this._decorPanel = document.createElement('div');
    this._decorPanel.id = 'decor-panel';
    this._decorPanel.innerHTML = `
      <h3>🎨 Vật trang trí</h3>
      <div style="font-size:8px;color:#555;line-height:1.8">Chọn vật → click sàn để đặt. Dùng Select để di chuyển / xoá.</div>
      <div id="decor-list" style="display:flex;flex-direction:column;gap:6px;margin-top:4px"></div>
    `;
    document.body.appendChild(this._decorPanel);
    this._el(this._decorPanel);
    this._loadDecorList();
  }

  async _loadDecorList() {
    const list = document.getElementById('decor-list');
    if (!list) return;
    try {
      const res = await fetch('/decor/manifest.json');
      const decors = await res.json();
      list.innerHTML = '';
      decors.forEach(d => {
        const btn = document.createElement('button');
        btn.className = 'pp-btn';
        btn.style.cssText = 'width:100%;text-align:left;padding:8px 10px;display:flex;align-items:center;gap:8px';
        btn.innerHTML = `<span style="font-size:16px">📦</span><span>${d.name}</span>`;
        btn.addEventListener('click', () => {
          list.querySelectorAll('.pp-btn').forEach(b => b.classList.remove('primary'));
          btn.classList.add('primary');
          this._selectDecorItem(d);
        });
        list.appendChild(btn);
      });
    } catch {
      list.innerHTML = '<div style="color:#555;font-size:9px">Không load được manifest</div>';
    }
  }

  _selectDecorItem(d) {
    this.toast(`Đang load ${d.name}...`, 'info', 5000);
    this.gltfLoader.load(`/decor/${d.file}`, (gltf) => {
      const src = { type: 'model3d', object: gltf.scene, name: d.name, storageUrl: `/decor/${d.file}` };
      this.selectSource(src);
      this.setMode('place');
      this.toast(`${d.name} ✓ — click sàn để đặt`, 'success');
    }, null, () => this.toast(`Không load được: ${d.name}`, 'error'));
  }

  /* ══════════════════════════════════════════════ MUSIC PANEL ══════════════════════════════════════════════ */
  _buildMusicPanel() {
    this._musicPanel = document.createElement('div');
    this._musicPanel.id = 'music-panel';
    this._musicPanel.innerHTML = `
      <button id="music-play-pause" class="music-btn">▶</button>
      <input type="range" id="music-volume-slider" class="music-volume" min="0" max="1" step="0.01" value="0.5">
      <span id="music-track-name">🎵 Chưa có nhạc</span>
      <label style="cursor:pointer;color:#c8a96e;font-size:12px" id="music-upload-label">📁</label>
      <input type="file" id="music-file-input" accept="audio/*" style="display:none">
    `;
    document.body.appendChild(this._musicPanel);
    this._el(this._musicPanel);
    
    const playPauseBtn = document.getElementById('music-play-pause');
    const volumeSlider = document.getElementById('music-volume-slider');
    const uploadLabel = document.getElementById('music-upload-label');
    const fileInput = document.getElementById('music-file-input');
    
    playPauseBtn.addEventListener('click', () => this.toggleMusic());
    volumeSlider.addEventListener('input', (e) => {
      if (this.backgroundMusic) {
        this.backgroundMusic.volume = parseFloat(e.target.value);
      }
    });
    uploadLabel.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => this.loadMusicFile(e));
  }

  toggleMusic() {
    if (!this.backgroundMusic) {
      this.toast('Chưa có nhạc nào, hãy upload file MP3', 'info');
      return;
    }
    
    if (this.isMusicPlaying) {
      this.backgroundMusic.pause();
      this.isMusicPlaying = false;
      document.getElementById('music-play-pause').textContent = '▶';
    } else {
      this.backgroundMusic.play().catch(e => {
        console.log('Auto-play blocked, user interaction needed');
        this.toast('Click play lại lần nữa', 'info');
      });
      this.isMusicPlaying = true;
      document.getElementById('music-play-pause').textContent = '⏸';
    }
  }

  async loadMusicFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      this.toast('Vui lòng chọn file nhạc (MP3, WAV, OGG)', 'error');
      return;
    }
    
    this.toast('Đang upload nhạc...', 'info', 5000);
    const storageUrl = await this.uploadToStorage(file);
    if (!storageUrl) {
      this.toast('Upload nhạc thất bại', 'error');
      return;
    }
    
    if (this.backgroundMusic) {
      this.backgroundMusic.pause();
      this.backgroundMusic = null;
    }
    
    this.backgroundMusic = new Audio(storageUrl);
    this.backgroundMusic.loop = true;
    this.backgroundMusic.volume = parseFloat(document.getElementById('music-volume-slider').value);
    
    document.getElementById('music-track-name').textContent = `🎵 ${file.name.substring(0, 20)}`;
    
    this.backgroundMusic.play().then(() => {
      this.isMusicPlaying = true;
      document.getElementById('music-play-pause').textContent = '⏸';
      this.toast('Nhạc đang phát', 'success');
    }).catch(() => {
      this.isMusicPlaying = false;
      document.getElementById('music-play-pause').textContent = '▶';
      this.toast('Click vào nút play để phát nhạc', 'info');
    });
    
    e.target.value = '';
  }

  /* ══════════════════════════════════════════════ BIND CONTROLS ══════════════════════════════════════════════ */
  _bindControls() {
    document.getElementById('btn-back').addEventListener('click', () => this.manager.navigateTo('dashboard'));
    document.getElementById('btn-walk').addEventListener('click', () => this.setMode('walk'));
    document.getElementById('btn-place').addEventListener('click', () => this.setMode('place'));
    document.getElementById('btn-select').addEventListener('click', () => this.setMode('select'));
    document.getElementById('btn-save').addEventListener('click', () => this.saveGallery());
    document.getElementById('btn-publish').addEventListener('click', () => this._togglePublish());
    document.getElementById('btn-adv-text').addEventListener('click', () => {
      this.textEditor.togglePanel();
      this.setMode('walk');
    });

    document.getElementById('btn-light').addEventListener('click', () => {
      this._lightPanel.classList.toggle('open');
      this._pathPanel.classList.remove('open');
      this._templatePanel.classList.remove('open');
      this._decorPanel.classList.remove('open');
      this.textEditor.closePanel();
      document.getElementById('btn-light').classList.toggle('active', this._lightPanel.classList.contains('open'));
      document.getElementById('btn-path').classList.remove('active');
      document.getElementById('btn-template').classList.remove('active');
      document.getElementById('btn-decor').classList.remove('active');
      document.getElementById('btn-adv-text').classList.remove('active');
    });

    document.getElementById('amb-intensity').addEventListener('input', (e) => { this.ambLight.intensity = +e.target.value; document.getElementById('amb-val').textContent = (+e.target.value).toFixed(2); });
    document.getElementById('amb-color').addEventListener('input', (e) => { this.ambLight.color.set(e.target.value); });
    document.getElementById('hemi-intensity').addEventListener('input', (e) => { this.hemiLight.intensity = +e.target.value; document.getElementById('hemi-val').textContent = (+e.target.value).toFixed(2); });
    document.getElementById('dir-intensity').addEventListener('input', (e) => { this.dirLight.intensity = +e.target.value; document.getElementById('dir-val').textContent = (+e.target.value).toFixed(2); });

    const MS = 0.1, RS = Math.PI / 24, SS = 0.1;
    document.getElementById('hud-close').addEventListener('click', () => this.deselectItem());
    document.getElementById('th-up').addEventListener('click', () => { const o = this.getSelObj(); if (o) o.position.y += MS; });
    document.getElementById('th-down').addEventListener('click', () => { const o = this.getSelObj(); if (o) o.position.y -= MS; });
    document.getElementById('th-left').addEventListener('click', () => { const o = this.getSelObj(); if (o) o.position.addScaledVector(new THREE.Vector3(-1, 0, 0).applyEuler(o.rotation), MS); });
    document.getElementById('th-right').addEventListener('click', () => { const o = this.getSelObj(); if (o) o.position.addScaledVector(new THREE.Vector3(1, 0, 0).applyEuler(o.rotation), MS); });
    document.getElementById('th-rot-l').addEventListener('click', () => { const o = this.getSelObj(); if (o) o.rotation.y += RS; });
    document.getElementById('th-rot-r').addEventListener('click', () => { const o = this.getSelObj(); if (o) o.rotation.y -= RS; });
    document.getElementById('th-scale-up').addEventListener('click', () => { const o = this.getSelObj(); if (o) { const s = o.scale; s.setScalar(s.x + SS); } });
    document.getElementById('th-scale-dn').addEventListener('click', () => { const o = this.getSelObj(); if (o) { const s = o.scale; s.setScalar(Math.max(.05, s.x - SS)); } });
    document.getElementById('th-remove').addEventListener('click', () => {
      if (!this.selectedItem) return;
      if (this.selectedItem.type === 'chest') {
        const id = this.selectedItem.data.id;
        this.selectedItem = null;
        this._hud.style.display = 'none';
        this._deleteChest(id);
        return;
      }
      if (this.selectedItem.type === 'artwork') { this.threeScene.remove(this.selectedItem.data.group); this.artworks.splice(this.selectedItem.index, 1); this.toast('Đã xoá tranh', 'info'); }
      else { this.threeScene.remove(this.selectedItem.data.object); this.threeScene.remove(this.selectedItem.data.light); this.threeScene.remove(this.selectedItem.data.pedestal); this.models3d.splice(this.selectedItem.index, 1); this.toast('Đã xoá model', 'info'); }
      this.deselectItem();
    });

    document.getElementById('th-info').addEventListener('click', () => {
      if (!this.selectedItem) return;
      const m = this.selectedItem.data.meta;
      ['title', 'artist', 'year', 'desc', 'price'].forEach(k => { document.getElementById('pop-' + k).value = m[k] || ''; });
      this._infoPopup.style.display = 'flex';
    });
    document.getElementById('pop-cancel').addEventListener('click', () => { this._infoPopup.style.display = 'none'; });
    document.getElementById('pop-save').addEventListener('click', () => {
      if (!this.selectedItem) return;
      ['title', 'artist', 'year', 'desc', 'price'].forEach(k => { this.selectedItem.data.meta[k] = document.getElementById('pop-' + k).value; });
      document.getElementById('hud-name').textContent = this.selectedItem.data.meta.title || (this.selectedItem.type === 'model' ? `Model #${this.selectedItem.index + 1}` : `Tác phẩm #${this.selectedItem.index + 1}`);
      this._infoPopup.style.display = 'none'; this.toast('Đã lưu thông tin', 'success');
    });

    document.getElementById('btn-path').addEventListener('click', () => {
      this._pathPanel.classList.toggle('open');
      this._lightPanel.classList.remove('open');
      this._templatePanel.classList.remove('open');
      this._decorPanel.classList.remove('open');
      this.textEditor.closePanel();
      document.getElementById('btn-path').classList.toggle('active', this._pathPanel.classList.contains('open'));
      document.getElementById('btn-light').classList.remove('active');
      document.getElementById('btn-template').classList.remove('active');
      document.getElementById('btn-decor').classList.remove('active');
      document.getElementById('btn-adv-text').classList.remove('active');
    });

    document.getElementById('btn-template').addEventListener('click', () => {
      this._templatePanel.classList.toggle('open');
      this._lightPanel.classList.remove('open');
      this._pathPanel.classList.remove('open');
      this._decorPanel.classList.remove('open');
      this.textEditor.closePanel();
      document.getElementById('btn-template').classList.toggle('active', this._templatePanel.classList.contains('open'));
      document.getElementById('btn-light').classList.remove('active');
      document.getElementById('btn-path').classList.remove('active');
      document.getElementById('btn-decor').classList.remove('active');
      document.getElementById('btn-adv-text').classList.remove('active');
    });

    document.getElementById('btn-decor').addEventListener('click', () => {
      this._decorPanel.classList.toggle('open');
      this._lightPanel.classList.remove('open');
      this._pathPanel.classList.remove('open');
      this._templatePanel.classList.remove('open');
      this.textEditor.closePanel();
      document.getElementById('btn-decor').classList.toggle('active', this._decorPanel.classList.contains('open'));
      document.getElementById('btn-light').classList.remove('active');
      document.getElementById('btn-path').classList.remove('active');
      document.getElementById('btn-template').classList.remove('active');
      document.getElementById('btn-adv-text').classList.remove('active');
    });

    document.getElementById('btn-chest').addEventListener('click', () => {
      const isOpen = this._chestPanel.classList.toggle('open');
      this._lightPanel.classList.remove('open');
      this._pathPanel.classList.remove('open');
      this._templatePanel.classList.remove('open');
      this._decorPanel.classList.remove('open');
      this.textEditor.closePanel();
      document.getElementById('btn-chest').classList.toggle('active', isOpen);
      ['btn-light','btn-path','btn-template','btn-decor','btn-adv-text'].forEach(id => document.getElementById(id)?.classList.remove('active'));
    });

    document.getElementById('pp-add-current').addEventListener('click', () => { 
      this.addWaypoint(this.camera.position.x, this.camera.position.y, this.camera.position.z, this.yaw, this.pitch, ''); 
      this.currentWpIdx = this.pathWaypoints.length - 1;
      this.updateNavBar(); 
      this.toast(`Đã thêm điểm ${this.pathWaypoints.length}`, 'success'); 
    });
    document.getElementById('pp-clear').addEventListener('click', () => { this.clearWaypoints(); this.toast('Đã xoá hết điểm', 'info'); });
    document.getElementById('pp-auto-gen').addEventListener('click', () => this.autoGeneratePath());
    document.getElementById('pnb-prev').addEventListener('click', () => this.travelToWaypoint(this.currentWpIdx - 1));
    document.getElementById('pnb-next').addEventListener('click', () => this.travelToWaypoint(this.currentWpIdx + 1));
    document.getElementById('pnb-close').addEventListener('click', () => { this._navBar.classList.remove('show'); this.currentWpIdx = -1; });
  }

  /* ══════════════════════════════════════════════ RAYCASTER — CLICK TRÊN CANVAS ══════════════════════════════════════════════ */
  _onCanvasClick(e) {
    if (this.didDrag) return;
    
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Xử lý waypoint click khi ở chế độ walk
    if (this.mode === 'walk' && this._hoveredWpDisc) {
      const wpIdx = this._hoveredWpDisc.userData.waypointIdx;
      if (wpIdx !== undefined) {
        this.travelToWaypoint(wpIdx);
        return;
      }
    }
    
    // Xử lý text editor
    if (this.textEditor.handleCanvasClick(this.raycaster, this.camera, this.mouse, this.modelMeshes)) {
      return;
    }
    
    this.raycaster.setFromCamera(this.mouse, this.camera);

    if (this.mode === 'place') {
      if (!this.selectedSource) return;
      if (this.selectedSource.type === 'model3d') {
        const hits = this.raycaster.intersectObjects(this.modelMeshes, true); if (!hits.length) return;
        this.place3DModel(this.selectedSource.object.clone(), hits[0].point.clone(), this.selectedSource.storageUrl || null, this.selectedSource.name || null);
        this.toast('Model đặt thành công ✓', 'success'); return;
      }
      const hits = this.raycaster.intersectObjects(this.modelMeshes, true); if (!hits.length) return;
      const hit = hits[0], pt = hit.point.clone();
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
      pt.add(n.clone().multiplyScalar(.05));
      if (this.selectedSource.isVideo) this.selectedSource.videoEl.play();
      this.placeArtwork(this.selectedSource, pt, [0, Math.atan2(n.x, n.z), 0]);
      this.toast('Đã đặt tranh ✓', 'success'); return;
    }

    if (this._chestPlacingMode) {
      const hits = this.raycaster.intersectObjects(this.modelMeshes, true);
      if (!hits.length) return;
      const hit = hits[0];
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
      if (n.y < 0.7) { this.toast('Click lên mặt sàn để đặt rương', 'info'); return; }
      this._pendingChestPos = hit.point.clone();
      this._chestPlacingMode = false;
      this.renderer.domElement.style.cursor = 'default';
      document.getElementById('chest-place-hint').style.display = 'none';
      this._openChestCfg();
      return;
    }

    if (this.mode === 'select') {
      const wpHits = this.raycaster.intersectObjects(this.pathMarkers.map(m => m.mesh), false);
      if (wpHits.length) { 
        this.travelToWaypoint(wpHits[0].object.userData.waypointIdx); 
        this.updateNavBar(); 
        return; 
      }

      const aHits = this.raycaster.intersectObjects(this.artworks.map(a => a.group), true);
      if (aHits.length) {
        let h = aHits[0].object; while (h.parent && !this.artworks.find(a => a.group === h)) h = h.parent;
        const idx = this.artworks.findIndex(a => a.group === h); if (idx !== -1) { this.selectItem('artwork', this.artworks[idx], idx); return; }
      }

      const mHits = this.raycaster.intersectObjects(this.models3d.map(m => m.object), true);
      if (mHits.length) {
        let h = mHits[0].object; while (h.parent && !this.models3d.find(m => m.object === h)) h = h.parent;
        const idx = this.models3d.findIndex(m => m.object === h); if (idx !== -1) { this.selectItem('model', this.models3d[idx], idx); return; }
      }

      const chestMeshes = this.chests.filter(c => c.mesh).map(c => c.mesh);
      if (chestMeshes.length) {
        const cHits = this.raycaster.intersectObjects(chestMeshes, true);
        if (cHits.length) {
          let h = cHits[0].object;
          while (h.parent && !this.chests.find(c => c.mesh === h)) h = h.parent;
          const idx = this.chests.findIndex(c => c.mesh === h);
          if (idx !== -1) { this.selectItem('chest', this.chests[idx], idx); return; }
        }
      }

      this.deselectItem();
    }
  }

  /* ══════════════════════════════════════════════ CAMERA LOOK ══════════════════════════════════════════════ */
  _onMouseMove(e) {
    this._lastMouseX = e.clientX;
    this._lastMouseY = e.clientY;
    
    if (!this.isLeftDown) return;
    const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this.didDrag = true;
    this.lastX = e.clientX; this.lastY = e.clientY;
    this.yaw -= dx * 0.003; this.pitch -= dy * 0.003;
    this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch));
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }

  /* ══════════════════════════════════════════════ UPDATE ══════════════════════════════════════════════ */
  update(dt) {
    if (this.textEditor && this.textEditor.isPlaceMode && this._lastMouseX !== undefined && this._lastMouseY !== undefined) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const mouseX = ((this._lastMouseX - rect.left) / rect.width) * 2 - 1;
        const mouseY = -((this._lastMouseY - rect.top) / rect.height) * 2 + 1;
        const mouseVec = new THREE.Vector2(mouseX, mouseY);
        this.textEditor.updatePreviewOnMouseMove(this.raycaster, this.camera, mouseVec, this.modelMeshes);
      }
    }
    
    if (this.wpTravelTarget) {
      this.wpTravelT += 0.035; 
      const et = this.wpTravelT < 1 ? this.wpTravelT * this.wpTravelT * (3 - 2 * this.wpTravelT) : 1;
      this.camera.position.x = this.wpTravelFrom.x + (this.wpTravelTarget.x - this.wpTravelFrom.x) * et;
      this.camera.position.y = this.wpTravelFrom.y + (this.wpTravelTarget.y - this.wpTravelFrom.y) * et;
      this.camera.position.z = this.wpTravelFrom.z + (this.wpTravelTarget.z - this.wpTravelFrom.z) * et;
      this.yaw   = this.lerpAngle(this.wpTravelFrom.yaw, this.wpTravelTarget.yaw, et);
      this.pitch = this.wpTravelFrom.pitch + (this.wpTravelTarget.pitch - this.wpTravelFrom.pitch) * et;
      this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
      if (this.wpTravelT >= 1) this.wpTravelTarget = null;
    } else {
      const speed = 8, posY = this.camera.position.y;
      this.moveDir.set(0, 0, 0);
      this.camera.getWorldDirection(this.fwd); this.fwd.y = 0; this.fwd.normalize();
      this.rgt.crossVectors(this.fwd, new THREE.Vector3(0, 1, 0)).normalize();
      if (this.keys['KeyW'] || this.keys['ArrowUp'])    this.moveDir.addScaledVector(this.fwd,  speed * dt);
      if (this.keys['KeyS'] || this.keys['ArrowDown'])  this.moveDir.addScaledVector(this.fwd, -speed * dt);
      if (this.keys['KeyA'] || this.keys['ArrowLeft'])  this.moveDir.addScaledVector(this.rgt, -speed * dt);
      if (this.keys['KeyD'] || this.keys['ArrowRight']) this.moveDir.addScaledVector(this.rgt,  speed * dt);
      if (this.moveDir.lengthSq() > 0 && this.modelMeshes.length) {
        const MARGIN = 0.5;
        if (Math.abs(this.moveDir.x) > 1e-6) {
          this.colDir.set(Math.sign(this.moveDir.x), 0, 0);
          this.colRay.set(this.camera.position, this.colDir);
          const hx = this.colRay.intersectObjects(this.modelMeshes, false);
          if (hx.length && hx[0].distance < MARGIN) this.moveDir.x = 0;
        }
        if (Math.abs(this.moveDir.z) > 1e-6) {
          this.colDir.set(0, 0, Math.sign(this.moveDir.z));
          this.colRay.set(this.camera.position, this.colDir);
          const hz = this.colRay.intersectObjects(this.modelMeshes, false);
          if (hz.length && hz[0].distance < MARGIN) this.moveDir.z = 0;
        }
      }
      this.camera.position.add(this.moveDir); this.camera.position.y = posY;
    }
    this.artworks.forEach(a => { if (a.isVideo && a.videoTex) a.videoTex.needsUpdate = true; });
  }

  /* ══════════════════════════════════════════════ SAVE / LOAD ══════════════════════════════════════════════ */
  async _togglePublish() {
    const room = this.manager.currentRoom;
    room.isPublished = !room.isPublished;
    const btn = document.getElementById('btn-publish');
    btn.textContent = room.isPublished ? '🔒 Unpublish' : '🌐 Publish';
    btn.classList.toggle('active', room.isPublished);
    await this.saveGallery();
    this.toast(room.isPublished ? 'Đã publish phòng ✓' : 'Đã chuyển về Draft', room.isPublished ? 'success' : 'info');
  }

  async saveGallery() {
    const room = this.manager.currentRoom;
    const btn = document.getElementById('btn-save');
    if (btn) btn.textContent = '⏳ Saving...';

    const galleryData = {
      _meta: {
        roomName: room.name,
        isPublished: room.isPublished,
        artistId: room.artistId,
        selectedTemplate: this.selectedTemplate,
      },
      artworks: this.artworks.map(a => ({
        x: a.group.position.x,
        y: a.group.position.y,
        z: a.group.position.z,
        ry: a.group.rotation.y,
        sx: a.group.scale.x,
        sy: a.group.scale.y,
        sz: a.group.scale.z,
        storageUrl: a.storageUrl || null,
        isVideo: a.isVideo || false,
        naturalWidth: a.naturalWidth,
        naturalHeight: a.naturalHeight,
        meta: a.meta,
      })),
      models: this.models3d.map(m => ({
        x: m.object.position.x,
        y: m.object.position.y,
        z: m.object.position.z,
        sx: m.object.scale.x,
        sy: m.object.scale.y,
        sz: m.object.scale.z,
        storageUrl: m.storageUrl || null,
        name: m.name || null,
        meta: m.meta,
      })),
      texts: this.textEditor.getSaveData(),
      waypoints: this.pathWaypoints.map(wp => ({
        x: wp.x, y: wp.y, z: wp.z,
        yaw: wp.yaw, pitch: wp.pitch,
        label: wp.label,
      })),
      lighting: {
        ambientIntensity: this.ambLight.intensity,
        ambientColor: '#' + this.ambLight.color.getHexString(),
        hemisphereIntensity: this.hemiLight.intensity,
        directionalIntensity: this.dirLight.intensity,
      },
      gallery_name: room.name,
      artist_name: this.manager.auth.user?.user_metadata?.name || 'Artist Name',
      musicUrl: this.backgroundMusic ? this.backgroundMusic.src : null,
    };

    const { error } = await supabase
      .from('gallery')
      .upsert({ name: room.id, scene_data: galleryData }, { onConflict: 'name' });

    if (btn) btn.textContent = '💾 Save';
    if (error) {
      console.error('Upsert error:', error);
      this.toast('Lưu thất bại: ' + error.message, 'error');
    } else {
      this.toast('Đã lưu ✓', 'success');
    }
  }

  async loadGallery() {
    const roomId = this.manager.currentRoom?.id;
    if (!roomId) return;
    const { data, error } = await supabase.from('gallery').select('*').eq('name', roomId).limit(1);
    if (error || !data || !data.length) return;
    const sd = data[0].scene_data;

    // Khôi phục template phòng trước khi đặt artworks
    const savedTemplate = sd._meta?.selectedTemplate || 'scene.glb';
    if (savedTemplate !== this.selectedTemplate) {
      await this._changeTemplate(savedTemplate);
      // Reload danh sách template để cập nhật trạng thái active
      this._loadTemplateList();
    }

    if (sd.lighting) {
      this.ambLight.intensity = sd.lighting.ambientIntensity;
      this.ambLight.color.set(sd.lighting.ambientColor);
      this.hemiLight.intensity = sd.lighting.hemisphereIntensity;
      this.dirLight.intensity = sd.lighting.directionalIntensity;
      
      const ambIntensity = document.getElementById('amb-intensity');
      const ambColor = document.getElementById('amb-color');
      const hemiIntensity = document.getElementById('hemi-intensity');
      const dirIntensity = document.getElementById('dir-intensity');
      const ambVal = document.getElementById('amb-val');
      const hemiVal = document.getElementById('hemi-val');
      const dirVal = document.getElementById('dir-val');
      
      if (ambIntensity) ambIntensity.value = sd.lighting.ambientIntensity;
      if (ambVal) ambVal.textContent = sd.lighting.ambientIntensity.toFixed(2);
      if (ambColor) ambColor.value = sd.lighting.ambientColor;
      if (hemiIntensity) hemiIntensity.value = sd.lighting.hemisphereIntensity;
      if (hemiVal) hemiVal.textContent = sd.lighting.hemisphereIntensity.toFixed(2);
      if (dirIntensity) dirIntensity.value = sd.lighting.directionalIntensity;
      if (dirVal) dirVal.textContent = sd.lighting.directionalIntensity.toFixed(2);
    }
    
    if (sd.artworks?.length) {
      for (const a of sd.artworks) {
        if (!a.storageUrl) continue;
        const pos = new THREE.Vector3(a.x, a.y, a.z);
        const sv  = a.sx ? new THREE.Vector3(a.sx, a.sy, a.sz) : null;
        if (a.isVideo) {
          const vid = document.createElement('video'); vid.src = a.storageUrl; vid.loop = true; vid.muted = true; vid.playsInline = true; vid.crossOrigin = 'anonymous';
          vid.addEventListener('loadeddata', () => { const tex = new THREE.VideoTexture(vid); tex.minFilter = THREE.LinearFilter; this.placeArtwork({ isVideo: true, texture: tex, videoEl: vid, storageUrl: a.storageUrl }, pos, [0, a.ry || 0, 0], a.meta || {}, sv); vid.play(); });
        } else {
          const tex = await new Promise(resolve => new THREE.TextureLoader().load(a.storageUrl, resolve, undefined, () => resolve(null)));
          if (!tex) continue;
          this.placeArtwork({ texture: tex, storageUrl: a.storageUrl, naturalWidth: a.naturalWidth || 1, naturalHeight: a.naturalHeight || 1 }, pos, [0, a.ry || 0, 0], a.meta || {}, sv);
        }
      }
    }
    if (sd.models?.length) {
      for (const m of sd.models) {
        if (!m.storageUrl) continue;
        const ext = (m.name || m.storageUrl).split('.').pop().toLowerCase();
        const pos = new THREE.Vector3(m.x, m.y, m.z);
        const sv  = m.sx ? new THREE.Vector3(m.sx, m.sy, m.sz) : null;
        await new Promise(resolve => {
          const onLoad = obj => { this.place3DModel(obj, pos, m.storageUrl, m.name || null, m.meta || {}, sv); resolve(); };
          const onErr  = () => resolve();
          if (ext === 'glb' || ext === 'gltf') this.gltfLoader.load(m.storageUrl, g => onLoad(g.scene), null, onErr);
          else if (ext === 'obj') this.objLoader.load(m.storageUrl, obj => { obj.traverse(c => { if (c.isMesh) c.material = new THREE.MeshLambertMaterial({ color: 0xccbbaa }); }); onLoad(obj); }, null, onErr);
          else resolve();
        });
      }
    }
    if (sd.waypoints?.length) {
      this.clearWaypoints();
      sd.waypoints.forEach(wp => this.addWaypoint(wp.x, wp.y, wp.z, wp.yaw || 0, wp.pitch || 0, wp.label || ''));
      this.currentWpIdx = 0; 
      this.updateNavBar();
    }
    
    if (sd.texts?.length) {
      await this.textEditor.loadFromData(sd.texts);
    }
    
    if (sd.musicUrl) {
      this.backgroundMusic = new Audio(sd.musicUrl);
      this.backgroundMusic.loop = true;
      this.backgroundMusic.volume = 0.5;
      document.getElementById('music-track-name').textContent = `🎵 Background Music`;
      document.getElementById('music-volume-slider').value = 0.5;
    }
    await this._loadChests();
  }

  /* ══════════════════════════════════════════════ CHEST ══════════════════════════════════════════════ */
  _buildChestPanel() {
    this._chestPanel = document.createElement('div');
    this._chestPanel.id = 'chest-panel';
    this._chestPanel.innerHTML = `
      <h3>🗝 Rương Kho Báu</h3>
      <button class="pp-btn primary" id="btn-add-chest">➕ Đặt rương mới</button>
      <div id="chest-place-hint" style="color:#7a6e5c;font-size:9px;letter-spacing:.08em;display:none">↓ Click vào sàn để đặt rương</div>
      <div id="chest-list" style="display:flex;flex-direction:column;gap:4px;margin-top:4px"></div>
    `;
    document.body.appendChild(this._chestPanel);
    this._el(this._chestPanel);

    this._chestCfg = document.createElement('div');
    this._chestCfg.id = 'chest-cfg';
    this._chestCfg.innerHTML = `
      <div class="ccfg">
        <h3>🗝 Cấu hình rương</h3>
        <div><label>Câu đố</label><textarea id="cc-question" placeholder="Nhập câu đố..."></textarea></div>
        <div><label>Đáp án</label><input type="text" id="cc-answer" placeholder="Đáp án đúng..."></div>
        <div><label>Số ⭐ Ngôi Sao thưởng</label><input type="number" id="cc-tokens" value="50" min="1" max="9999"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="pp-btn" id="cc-cancel">Huỷ</button>
          <button class="pp-btn primary" id="cc-save">Lưu rương ✓</button>
        </div>
      </div>
    `;
    document.body.appendChild(this._chestCfg);
    this._el(this._chestCfg);

    document.getElementById('btn-add-chest').addEventListener('click', () => {
      this._chestPlacingMode = true;
      this.renderer.domElement.style.cursor = 'crosshair';
      document.getElementById('chest-place-hint').style.display = 'block';
    });
    document.getElementById('cc-cancel').addEventListener('click', () => {
      this._chestCfg.classList.remove('open');
      this._pendingChestPos = null;
      document.getElementById('chest-place-hint').style.display = 'none';
    });
    document.getElementById('cc-save').addEventListener('click', () => this._saveNewChest());
  }

  _openChestCfg() {
    document.getElementById('cc-question').value = '';
    document.getElementById('cc-answer').value = '';
    document.getElementById('cc-tokens').value = '50';
    this._chestCfg.classList.add('open');
  }

  async _loadChests() {
    const roomId = this.manager.currentRoom?.id;
    if (!roomId) return;
    const { data, error } = await supabase.from('treasure_chests').select('*').eq('room_id', roomId);
    if (error || !data) return;
    this.chests.forEach(c => { if (c.mesh) this.threeScene.remove(c.mesh); });
    this.chests = [];
    for (const row of data) {
      const chest = { id: row.id, question: row.question, answer: row.answer, token_amount: row.token_amount,
        pos_x: row.pos_x, pos_y: row.pos_y, pos_z: row.pos_z, rot_y: row.rot_y, mesh: null };
      this.chests.push(chest);
      this._placeChestMesh(chest);
    }
    this._renderChestList();
  }

  _placeChestMesh(chest) {
    new GLTFLoader().load('/treasure/treasure_chest.glb', (gltf) => {
      if (this._disposed) return;
      const mesh = gltf.scene;
      const box = new THREE.Box3().setFromObject(mesh);
      const sz = box.getSize(new THREE.Vector3());
      const baseScale = 0.6 / Math.max(sz.x, sz.y, sz.z);
      mesh.scale.setScalar(baseScale * (chest.chest_scale > 0 ? chest.chest_scale : 1.0));
      mesh.position.set(chest.pos_x, chest.pos_y, chest.pos_z);
      mesh.rotation.y = chest.rot_y || 0;
      chest.mesh = mesh;
      chest._baseScale = baseScale;
      this.threeScene.add(mesh);
    });
  }

  async _saveChestTransform(chest) {
    if (!chest?.mesh) return;
    const pos = chest.mesh.position;
    const roty = chest.mesh.rotation.y;
    const multiplier = chest._baseScale ? chest.mesh.scale.x / chest._baseScale : 1.0;
    const { error } = await supabase.from('treasure_chests').update({
      pos_x: pos.x, pos_y: pos.y, pos_z: pos.z,
      rot_y: roty,
      chest_scale: multiplier,
    }).eq('id', chest.id);
    if (!error) {
      chest.pos_x = pos.x; chest.pos_y = pos.y; chest.pos_z = pos.z;
      chest.rot_y = roty; chest.chest_scale = multiplier;
      this.toast('Đã lưu vị trí rương ✓', 'success');
    }
  }

  _renderChestList() {
    const list = document.getElementById('chest-list');
    if (!list) return;
    list.innerHTML = this.chests.length ? '' : '<div style="color:#555;font-size:9px">Chưa có rương nào</div>';
    this.chests.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'chest-item';
      el.innerHTML = `<span class="chest-item-lbl">Rương ${i + 1} · ⭐ ${c.token_amount}</span><button class="chest-item-del">✕</button>`;
      el.querySelector('.chest-item-del').addEventListener('click', () => this._deleteChest(c.id));
      list.appendChild(el);
    });
  }

  async _saveNewChest() {
    const question = document.getElementById('cc-question').value.trim();
    const answer   = document.getElementById('cc-answer').value.trim();
    const tokens   = parseInt(document.getElementById('cc-tokens').value) || 50;
    if (!question || !answer) { this.toast('Nhập câu đố và đáp án', 'error'); return; }
    if (!this._pendingChestPos) return;
    const roomId = this.manager.currentRoom?.id;
    const { data, error } = await supabase.from('treasure_chests').insert({
      room_id: roomId,
      pos_x: this._pendingChestPos.x,
      pos_y: this._pendingChestPos.y,
      pos_z: this._pendingChestPos.z,
      rot_y: 0,
      question,
      answer,
      token_amount: tokens,
    }).select().single();
    if (error) { this.toast('Lỗi: ' + error.message, 'error'); return; }
    this._chestCfg.classList.remove('open');
    this._pendingChestPos = null;
    const chest = { id: data.id, question, answer, token_amount: tokens,
      pos_x: data.pos_x, pos_y: data.pos_y, pos_z: data.pos_z, rot_y: 0, mesh: null };
    this.chests.push(chest);
    this._placeChestMesh(chest);
    this._renderChestList();
    this.toast('Đã lưu rương ✓', 'success');
  }

  async _deleteChest(id) {
    const { error } = await supabase.from('treasure_chests').delete().eq('id', id);
    if (error) { this.toast('Lỗi xoá rương', 'error'); return; }
    const idx = this.chests.findIndex(c => c.id === id);
    if (idx !== -1) {
      if (this.chests[idx].mesh) this.threeScene.remove(this.chests[idx].mesh);
      this.chests.splice(idx, 1);
    }
    this._renderChestList();
    this.toast('Đã xoá rương', 'info');
  }
}