import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader }  from 'three/addons/loaders/OBJLoader.js';
import { supabase } from '../utils/supabase.js';
import { BaseScene } from './BaseScene.js';
import { TextEditor } from './TextEditor.js';

const FRAME_MAT = new THREE.MeshLambertMaterial({ color: 0x2a2018 });

function parsePrice(str) {
  if (!str) return NaN;
  return parseFloat(str.replace(/[^\d,\.]/g, '').replace(/\./g, '').replace(',', '.'));
}
function formatPrice(n) {
  return n.toLocaleString('vi-VN') + ' ₫';
}

export class ViewerScene extends BaseScene {

  constructor(manager, canvas) {
    super(manager, canvas);
    this.artworks    = [];
    this.models3d    = [];

    this.cartItems   = [];
    this.cartIdCnt   = 0;
    this.popupArt    = null;

    this._mmExpanded = false;

    this._soundOn = true;
    this._bgAudio = null;

    this._liked = false;
    
    // Lighting sẽ được khởi tạo với giá trị mặc định, sau đó load từ DB
    this._lighting = { ambientIntensity: 1.2, ambientColor: '#ffffff', hemisphereIntensity: 0.5, directionalIntensity: 1.2 };
    this._brightnessMultiplier = 1.0; // Thêm hệ số brightness riêng

    this._walkSpeed = 8;

    this._chatOpen = false;
    this._unreadCount = 0;
    this._shownMsgIds = new Set();
    this._chatUsername = '';
    this._CHAT_ROOM = 'room1';

    this._expand3d = {
      drag: false, lx: 0, ly: 0,
      yaw: 0.5, pitch: 0.3, dist: 3, center: new THREE.Vector3(),
      renderer: null, scene: null, camera: null, raf: null
    };
    this._expandImg = {
      zoom: 1, panX: 0, panY: 0, drag: false, lx: 0, ly: 0
    };

    this.chests           = [];
    this._openedChestIds  = new Set();
    this._nearChest       = null;
    this._chestPopupOpen  = false;
    this._activeChest     = null;

    this._remotePlayers       = {};
    this._mpChannel           = null;
    this._mpBroadcastInterval = null;
  }

  async init() {
    await this.manager.auth.ready();
    if (this._disposed) return;

    if (!this.manager.currentRoom) { this.manager.navigateTo('explore'); return; }
    this._galleryDbKey = this.manager.currentRoom.id;

    /* ---- scene ---- */
    this.threeScene.background = new THREE.Color(0x87ceeb);

    // Khởi tạo đèn với giá trị mặc định (sẽ được cập nhật sau khi load dữ liệu)
    this.ambLight = new THREE.AmbientLight(this._lighting.ambientColor, this._lighting.ambientIntensity);
    this.hemiLight = new THREE.HemisphereLight(0xffe8c0, 0x3a2e20, this._lighting.hemisphereIntensity);
    this.dirLight = new THREE.DirectionalLight(0xffffff, this._lighting.directionalIntensity);
    this.dirLight.position.set(5, 10, 5); this.dirLight.castShadow = true;
    this.threeScene.add(this.ambLight, this.hemiLight, this.dirLight);

    /* ---- Multi-room state ---- */
    this.roomModels      = [];
    this.GAP_WIDTH       = 2.5;
    this.ROOM_SPACING    = 0;
    this._roomBox        = null;
    this._roomBoxCenterX = 0;

    /* ---- modelMeshes (GLB sẽ được load trong _loadRoom sau khi biết template) ---- */
    this.modelMeshes = [];
    this.textEditor = new TextEditor(this.threeScene, this.modelMeshes, () => {});

    /* ---- loaders ---- */
    this.gltfLoader  = new GLTFLoader();
    this.objLoader   = new OBJLoader();

    /* ---- walk state ---- */
    this.yaw      = 0;
    this.pitch    = 0;
    this.isLeftDown = false;
    this.lastX    = 0;
    this.lastY    = 0;
    this.didDrag  = false;
    this.keys     = {};
    this.moveDir  = new THREE.Vector3();
    this.fwd      = new THREE.Vector3();
    this.rgt      = new THREE.Vector3();

    /* ---- character avatar ---- */
    this._charFwd       = new THREE.Vector3();
    this._charRay       = new THREE.Raycaster();
    this._character     = null;
    this._charMixer     = null;
    this._charIdle      = null;
    this._charWalk      = null;
    this._charIsWalking = false;
    this._charAngle     = Math.PI;

    /* ---- waypoint ---- */
    this.floorY         = 0;
    this.pathWaypoints  = [];
    this.pathMarkers    = [];
    this.currentWpIdx   = -1;
    this.wpTravelTarget = null;
    this.wpTravelFrom   = null;
    this.wpTravelT      = 0;

    /* ---- raycaster ---- */
    this.raycaster = new THREE.Raycaster();
    this.mouse     = new THREE.Vector2();
    this.colRay    = new THREE.Raycaster();
    this.colDir    = new THREE.Vector3();

    /* ---------- listeners ---------- */
    this._on(this.renderer.domElement, 'click',     (e) => this._onCanvasClick(e));
    this._on(this.renderer.domElement, 'mousedown', (e) => { if (e.button === 0) { this.isLeftDown = true; this.didDrag = false; this.lastX = e.clientX; this.lastY = e.clientY; } });
    this._on(window,                   'mouseup',   () =>  { this.isLeftDown = false; });
    this._on(this.renderer.domElement, 'mousemove', (e) => this._onMouseMove(e));
    this._on(document,                 'keydown',   (e) => {
      if (this._isTyping()) return;
      this.keys[e.code] = true;
      if (e.code === 'KeyE' && this._nearChest && !this._chestPopupOpen) {
        this._openChestPopup(this._nearChest);
      }
    });
    this._on(document,                 'keyup',     (e) => {
      if (this._isTyping()) { this.keys = {}; return; }
      this.keys[e.code] = false;
    });

    await this._loadRoom();
    if (this._disposed) return;
    this._loadCharacter();
    this._initMultiplayer();
    await this._loadChests();
    if (this._disposed) return;
    this._renderMinimapRoomChips();

    /* ========== KHỞI TẠO UI ========== */
    this._injectViewerCSS();
    this._buildLogo();
    this._buildTopBar();
    this._buildRightPanel();
    this._buildArtworkPopup();
    this._buildExpandOverlay();
    this._buildLeftColumn();
    this._buildControlsBar();
    this._buildHelpOverlay();
    this._buildSettingsPanel();
    this._buildRoutePanel();
    this._buildToast();
    this._buildChestUI();
    this._buildWaypointBar();
    this._renderProductList();
    this._renderCart();
    this._bindFeatureEvents();
    await this._initLike();

    this._updateTopBarInfo();
    this._updateTokenDisplay();

    if (!localStorage.getItem('gallery_visited')) {
      setTimeout(() => {
        document.getElementById('help-overlay')?.classList.add('open');
        localStorage.setItem('gallery_visited', '1');
      }, 800);
    }
  }

  _buildLogo() {
    const img = document.createElement('img');
    img.src = '/icons/logo.svg';
    img.alt = 'CREATORY';
    img.style.cssText = 'position:fixed;top:16px;left:20px;height:32px;cursor:pointer;opacity:0.85;transition:opacity 0.2s;z-index:100;';
    img.addEventListener('mouseenter', () => img.style.opacity = '1');
    img.addEventListener('mouseleave', () => img.style.opacity = '0.85');
    img.addEventListener('click', () => this.manager.navigateTo('landing'));
    document.body.appendChild(img);
    this._el(img);
  }

  /* ================================================================
     UI: TOP BAR
  ================================================================ */
  _buildTopBar() {
  const bar = document.createElement('div');
  bar.id = 'topbar';
  bar.innerHTML = `
    <div id="logo-area">
      <div id="vw-token-display-top" style="display:none; margin-top: -55px !important;align-items:center;gap:5px;color:#c8a96e;font-family:monospace;font-size:20px;letter-spacing:.06em;cursor:pointer;">
        <img src="/token/star.png" style="width:16px;height:16px;object-fit:contain">
        <span id="vw-token-val"></span>
      </div>
    </div>
    <div id="gallery-info">
      <span id="gallery-name">[Phòng Tranh 3D]</span>
      <span id="gallery-separator">—</span>
      <span id="artist-name">Artist Name</span>
    </div>
    <div id="topbar-right"></div>
  `;
    document.body.appendChild(bar);
    document.querySelector('#logo-area img').addEventListener('click', () => this.manager.navigateTo('landing'));

    this._el(bar);
  }

  _updateTopBarInfo() {
    const galleryName = this._galleryName || this.manager.currentRoom?.name || 'Phòng Tranh 3D';
    const artistName  = this._artistName  || 'Artist Name';
    const gnEl = document.getElementById('gallery-name');
    const anEl = document.getElementById('artist-name');
    if (gnEl) gnEl.textContent = `[${galleryName}]`;
    if (anEl) anEl.textContent = artistName;
  }

  /* ================================================================
     CSS
  ================================================================ */
  _injectViewerCSS() {
    if (document.getElementById('vw-css')) return;
    const s = document.createElement('style');
    s.id = 'vw-css';
    s.textContent = `
      :root {
        --bg: rgb(69, 105, 177); --surface: rgb(63, 99, 170);
        --border: rgba(212,197,169,.15); --border-hi: rgba(212,197,169,.5);
        --gold: rgb(69, 105, 177); --gold-dim: rgb(69, 105, 177); --text-dim: #555;
        --accent: #85d4e7ef; --accent2: #7793ad;; --danger: #b54a3a; --green: #5aaa7a;
        --radius: 6px; --radius-sm: 3px;
        --font-ui: 'Nunito', sans-serif; --font-head: 'Cormorant Garamond', serif; --font-mono: 'Space Mono', monospace;
        --panel-w: 300px;
      }
      @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Space+Mono:wght@400;700&family=Nunito:wght@400;600;700;800&display=swap');
      @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&display=swap');
      
      *,*::before,*::after{ margin:0; padding:0; box-sizing:border-box; }

      #topbar {
        position:fixed; top:0; left:0; right:0; height:120px;
        display:flex; align-items:center; justify-content:space-between;
        padding:0 18px;
        background: url('/icons/gradient.svg') repeat-x top center;
        background-size: auto 120px;
        z-index:20; pointer-events:none;
      }
      #logo-area {
        display:flex; align-items:center; gap:10px; pointer-events:auto;
      }
      #logo-mark {
        width:32px; height:32px;
        background:linear-gradient(135deg, #c8a96e, #8a6a30);
        border-radius:8px;
        display:flex; align-items:center; justify-content:center;
        font-family:var(--font-head); font-size:16px; font-style:italic; color:#fff;
        font-weight:600; letter-spacing:.02em;
        box-shadow:0 2px 12px rgba(200,169,110,.35);
      }
      #logo-text {
        font-family:var(--font-head); font-size:16px; font-weight:600;
        color:var(--gold); letter-spacing:.12em; font-style:italic;
      }
      
#gallery-info {
  margin-top: -55px !important; 
  margin-left: -320px !important;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: baseline;
  gap: 8px;
  pointer-events: none;
}

#gallery-name {
  font-family: 'Montserrat', sans-serif;
  font-size: 17px;
  font-weight: 700;
  color: #FFFFFF;
  letter-spacing: .05em;
}

#gallery-separator {
  font-family: 'Montserrat', sans-serif;
  font-size: 17px;
  font-weight: 700;
  color: #FFFFFF;
}

#artist-name {
  font-family: 'Montserrat', sans-serif;
  font-size: 17px;
  font-weight: 700;
  color: #FFFFFF;
  letter-spacing: .05em;
}
      }
      #topbar-right {
        display:flex; align-items:center; gap:8px; pointer-events:auto;
      }

      #left-column {
        position:fixed; left:14px; bottom:14px;
        display:flex; flex-direction:column; align-items:flex-start; gap:8px;
        z-index:20;
      }

      #minimap-wrap {
  position: relative;
  background: transparent;
  border: none;
  backdrop-filter: none;
}
      #minimap-expand-btn {
        background:none; border:none; cursor:pointer;
        font-size:10px; color:var(--gold-dim);
        padding:0 2px; line-height:1;
        transition:color .2s;
      }
      #minimap-expand-btn:hover { color:var(--gold); }

      #minimap-rooms {
        display:none; flex-wrap:wrap; gap:3px;
        padding:5px 7px; border-bottom:.5px solid var(--border);
      }
      #minimap-rooms.show { display:flex; }
      .mm-room-chip {
        font-family:var(--font-mono); font-size:6px; letter-spacing:.1em;
        padding:2px 5px; border-radius:2px; cursor:pointer;
        transition:all .18s; white-space:nowrap;
        border:.5px solid rgba(212,197,169,.2); color:var(--gold-dim);
      }
      .mm-room-chip.active {
        background:rgba(200,169,110,.2); border-color:var(--accent); color:var(--accent);
      }
      .mm-room-chip:hover { border-color:var(--border-hi); color:var(--gold); }

      #minimap-canvas-wrap {
        position:relative; overflow:hidden;
        width:96px; height:96px;
        transition:all .3s cubic-bezier(.4,0,.2,1);
        border-radius: inherit;  /* thêm dòng này */
      }
      #minimap-wrap.expanded #minimap-canvas-wrap { width:200px; height:200px; }
      #minimap-wrap.expanded { width:200px; }
      #minimap-wrap.expanded #minimap-rooms { display:flex; }
      #minimap-bg-svg {
        position:absolute; top:0; left:0;
        width:100%; height:100%;
        display:block;
        object-fit:fill;
        pointer-events:none;
        z-index:0;
      }
#minimap-canvas {
  position:relative;
  z-index:1;
}
      #minimap-canvas { display:block; width:100%; height:100%; }

      .icon-btn {
        width:38px; height:38px;
        background:rgba(255, 255, 255, 0.85);
        border:.5px solid var(--border);
        border-radius:50%;
        display:flex; align-items:center; justify-content:center;
        cursor:pointer; font-size:16px;
        transition:all .2s; backdrop-filter:blur(8px);
        color:var(--gold); position:relative;
        flex-shrink:0;
      }
      .icon-btn:hover {
        background:rgba(212,197,169,.15);
        border-color:var(--border-hi);
        transform:scale(1.08);
      }
      .icon-btn.active { background:rgba(200,169,110,.2); border-color:var(--accent); }

      .icon-btn[title]:hover::after {
        content:attr(title);
        position:absolute; left:calc(100% + 10px); top:50%; transform:translateY(-50%);
        background:#122F6A; color:#FFFFFF; font-family:var(--font-mono);
        font-size:7px; letter-spacing:.1em; padding:4px 9px;
        border:.5px solid var(--border); white-space:nowrap; border-radius:3px;
        pointer-events:none; z-index:50;
      }

      #chat-wrap {
        position:relative;
        width:100%;
        display:flex; flex-direction:column; align-items:flex-start; gap:0;
      }
      #chat-toggle-btn {
      cursor:pointer;
      position:relative;
      display:inline-flex;
      margin-top:2px;
}

      #chat-toggle-btn:hover { background:#bccad8; }
      #chat-icon { font-size:13px; color:#fff; background:#a0b4c8; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; flex-shrink:0; letter-spacing:1px; }
      #chat-fake-input { flex:1; background:transparent; border:none; outline:none; font-family:var(--font-ui); font-size:13px; color:#555; cursor:pointer; caret-color:#555; }
      #chat-fake-input::placeholder { color:#888; }
      #chat-label { font-family:var(--font-mono); font-size:8px; letter-spacing:.14em; color:var(--gold-dim); text-transform:uppercase; }
      #chat-unread {
        background:var(--danger); color:#fff;
        font-family:var(--font-mono); font-size:7px;
        border-radius:10px; padding:1px 5px; display:none;
      }
      #chat-unread.show { display:inline; }

      #chat-box {
        width:260px; background:rgba(18,15,12,.97);
        border:.5px solid var(--border); border-radius:var(--radius);
        overflow:hidden; display:none; flex-direction:column;
        box-shadow:0 8px 32px rgba(0,0,0,.5);
        margin-bottom:6px;
      }
      #chat-box.open { display:flex; }
      #chat-box-header {
        padding:8px 12px;
        background:rgba(212,197,169,.04);
        border-bottom:.5px solid var(--border);
        display:flex; justify-content:space-between; align-items:center;
      }
      #chat-room-label {
        font-family:var(--font-mono); font-size:7px; letter-spacing:.18em;
        text-transform:uppercase; color:var(--gold-dim);
      }
      #chat-username-tag {
        font-family:var(--font-mono); font-size:7px; color:var(--accent); cursor:pointer;
        letter-spacing:.1em;
      }
      #chat-username-tag:hover { color:var(--gold); }

      #chat-messages {
        height:160px; overflow-y:auto;
        padding:8px 10px; display:flex; flex-direction:column; gap:5px;
      }
      #chat-messages::-webkit-scrollbar { width:2px; }
      #chat-messages::-webkit-scrollbar-thumb { background:rgba(212,197,169,.1); }

      .chat-msg { line-height:1.55; word-break:break-word; }
      .chat-msg .msg-name { font-family:var(--font-mono); font-size:8px; color:var(--accent); margin-right:5px; }
      .chat-msg.is-me .msg-name { color:#8ab4ff; }
      .chat-msg .msg-text { font-size:10px; color:rgba(212,197,169,.8); }

      #chat-input-row { display:flex; border-top:.5px solid var(--border); }
      #chat-input {
        flex:1; padding:8px 10px; background:transparent; border:none;
        color:var(--gold); font-family:var(--font-ui); font-size:10px;
        outline:none; letter-spacing:.04em;
      }
      #chat-input::placeholder { color:var(--text-dim); }
      #chat-send {
        padding:8px 12px; background:rgba(212,197,169,.06);
        border:none; border-left:.5px solid var(--border);
        color:var(--gold-dim); font-family:var(--font-ui); font-size:10px;
        font-weight:700; cursor:pointer; transition:all .2s; letter-spacing:.06em;
      }
      #chat-send:hover { background:rgba(212,197,169,.15); color:var(--gold); }

      #settings-panel {
        position:fixed; left:66px; bottom:14px;
        width:220px; background:rgba(255, 255, 255, 0.98);
        border:.5px solid var(--border); border-radius:var(--radius);
        z-index:30; padding:14px; display:none; flex-direction:column; gap:12px;
        box-shadow:0 8px 32px rgba(0,0,0,.5);
      }
      #settings-panel.open { display:flex; }
      .sp-title {
        font-family:var(--font-head); font-size:14px; font-style:italic;
        color:#76AAAB; letter-spacing:.08em;
        border-bottom:.5px solid var(--border); padding-bottom:8px;
      }
      .sp-row { display:flex; align-items:center; justify-content:space-between; gap:10px; }
      .sp-label { font-family:var(--font-mono); font-size:8px; letter-spacing:.12em; text-transform:uppercase; color:var(--gold-dim); }
      .sp-range { flex:1; -webkit-appearance:none; height:2px; background:rgba(212,197,169,.2); border-radius:1px; outline:none; cursor:pointer; }
      .sp-range::-webkit-slider-thumb { -webkit-appearance:none; width:12px; height:12px; border-radius:50%; background:var(--gold); cursor:pointer; }
      .sp-val { font-family:var(--font-mono); font-size:8px; color:var(--gold); min-width:24px; text-align:right; }

      #help-overlay {
        position:fixed; inset:0; z-index:60;
        background:rgba(106, 173, 230, 0.92); backdrop-filter:blur(10px);
        display:none; align-items:center; justify-content:center;
      }
      #help-overlay.open { display:flex; }
      #help-box {
        background:rgba(255, 255, 255, 0.99);
        border:.5px solid var(--border); border-radius:10px;
        padding:32px 36px; width:420px;
        display:flex; flex-direction:column; gap:18px;
      }
      #help-title {
        font-family:var(--font-head); font-size:22px; font-style:italic;
        color:var(--gold); letter-spacing:.1em; text-align:center;
      }
      .help-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
      .help-item { display:flex; flex-direction:column; gap:4px; }
      .help-key {
        display:inline-flex; align-items:center; gap:5px; flex-wrap:wrap;
      }
      .key {
        background:rgba(212,197,169,.12); border:.5px solid var(--border);
        border-radius:3px; padding:3px 8px;
        font-family:var(--font-mono); font-size:9px; color:var(--gold);
        letter-spacing:.08em;
      }
      .help-desc { font-size:10px; color:var(--gold-dim); letter-spacing:.06em; }
      #help-close {
        align-self:center;
        padding:8px 24px; background:rgba(212,197,169,.08);
        border:.5px solid var(--border); color:var(--gold-dim);
        font-family:var(--font-mono); font-size:8px; letter-spacing:.14em;
        text-transform:uppercase; cursor:pointer; border-radius:var(--radius-sm);
        transition:all .2s;
      }
      #help-close:hover { border-color:var(--gold); color:var(--gold); }

      #controls-bar {
        position:fixed; bottom:14px;
        left:50%; transform:translateX(-50%);
        background:#122F6A; border:.5px solid var(--border);
        border-radius:20px; padding:7px 18px;
        font-family:var(--font-mono); font-size:8px; letter-spacing:.14em;
        text-transform:uppercase; color:#FFFFFF;
        pointer-events:none; white-space:nowrap; backdrop-filter:blur(8px);
        z-index:15;
      }

      @keyframes heartPop {
        0%   { transform:scale(1); }
        40%  { transform:scale(1.4); }
        70%  { transform:scale(.9); }
        100% { transform:scale(1); }
      }
      .icon-btn.liked { animation:heartPop .4s ease; color:#e85d7a !important; background:rgba(255, 255, 255, 0.86) !important; border-color:rgba(255, 255, 255, 0.5) !important; }


      #right-panel{
        position:fixed; top: 60px; bottom: 60px; right: 20px;
        aspect-ratio: 382 / 591;  
        background: url('/icons/list_bg.svg') center/100% 100% no-repeat;
        border-left: none;
        border-radius: 0;
        display:flex; flex-direction:column; z-index:20;
        transition:transform .35s cubic-bezier(.4,0,.2,1); 
      }
      #right-panel.collapsed{ transform:translateX(calc(var(--panel-w) + 20px)); }
      #panel-tab{
        position:absolute; left:-32px; top:50%; transform:translateY(-50%);
        width:32px; height:72px; background:#122F6A;
        border:.5px solid #122F6A; border-right:none;
        border-radius:var(--radius) 0 0 var(--radius);
        display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px;
        cursor:pointer; transition:all .2s;
        margin-right:-1px;
      }
      #panel-tab:hover{ background:#1a3f8a; }
      #panel-tab-icon{ font-size:12px; }
      #panel-tab-text{
        font-family:var(--font-mono); font-size:6px; letter-spacing:.1em;
        writing-mode:vertical-rl; text-orientation:mixed; color:var(--gold-dim); text-transform:uppercase;
      }
      #panel-header{ padding:30px 16px 20px 16px; border-bottom:.5px solid var(--border); flex-shrink:0; text-align: center; }
#panel-header-top {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
  #panel-title {
  font-family: 'Montserrat', sans-serif;
  color: #FFFFFF;
  font-size: 15px;
  font-weight: 400;
  letter-spacing: .08em;
  text-align: center;
  text-transform: uppercase;
}  
  #panel-toggle-btn {
  position: absolute;
  right: 0;
  width: 26px;
  height: 26px;
  background: rgba(212,197,169,.07);
  border: .5px solid rgba(212,197,169,.2);
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: var(--gold-dim);
  transition: all .2s;
}
      #panel-toggle-btn:hover{ background:rgba(212,197,169,.15); color:var(--gold); }
#panel-count {
  font-family: 'Montserrat', sans-serif;
  color: #FFFFFF;
  font-size: 8px;
  letter-spacing: .14em;
  text-transform: uppercase;
  margin-top: 4px;
}
      #product-list{ flex:1; overflow-y:overlay; padding: 10px 40px; }
      #product-list::-webkit-scrollbar{ width:7px; transform: translateX(-10px);}
      #product-list::-webkit-scrollbar-thumb{ background:rgba(255, 255, 255, 0.5); border-radius:15px; margin-right:16px; }
      #product-list::-webkit-scrollbar-track{ background:rgba(255, 255, 255, 0.5); border-radius:15px;margin-right:16px;}

      .product-card{
        display:flex; align-items:stretch; gap:0;
        background: url('/icons/product_bg.svg') center/cover no-repeat; border-radius: 0;
        border-radius:var(--radius); margin-bottom:8px; overflow:hidden;
        transition:border-color .2s, background .2s; cursor:pointer;
        aspect-ratio: 308 / 128; 
      }
      }
      .product-card:hover{ border-color:rgba(212,197,169,.3); background:rgba(212,197,169,.06); }
      .product-card.in-cart{ border-color:rgba(90,170,122,.35); background:rgba(90,170,122,.05); }

      .product-thumb-wrap{  width:72px !important; height: 72px !important; margin-top: 10px; margin-left: 14px; flex-shrink:0; }
      .product-thumb-canvas{ width: 100%; height: 100%; display: block; object-fit: cover; border-radius: 10px;}
      .product-body{ flex:1; padding: 14px 4px 14px 12px; display:flex; flex-direction:column; justify-content:space-between; min-width:0; }
      .product-name{ font-family:'Montserrat', sans-serif; font-size:13px; font-weight:400; color:#FFFFFF; letter-spacing:.04em; white-space:normal; line-height:1.4; overflow:hidden; display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical; }
      .product-price{ font-family:var(--font-mono); font-size:13px; font-weight:600; color:#FFFFFF; letter-spacing:.04em; margin-top:4px; }
      .product-price.contact{ color:#FFFFFF; font-size:11px; font-family:var(--font-mono); }
      .product-actions{ flex-shrink:0; display:flex; flex-direction:column; border-left:.5px solid rgba(212,197,169,.08); }
      .product-act-btn{
        flex:1; width:36px; background:none; border:none; cursor:pointer;
        display:flex; align-items:center; justify-content:center; font-size:13px; color:var(--gold-dim); transition:all .2s;
      }
      .product-act-btn:hover{ background:rgba(212,197,169,.1); color:var(--gold); }
      .product-act-btn:first-child{ border-bottom:.5px solid rgba(212,197,169,.08); }

      #product-empty{ padding:32px 16px; text-align:center; font-family:var(--font-mono); font-size:8px; letter-spacing:.16em; text-transform:uppercase; color:var(--text-dim); line-height:2.5; }

      #cart-section{ border-top:.5px solid var(--border); padding:12px 20px; flex-shrink:0; }
      #cart-header-row{ display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
      #cart-label{ font-family:'Montserrat',sans-serif; font-size:13px; color:#FFFFFF; letter-spacing:.06em; }
      #cart-badge{ background:var(--danger); color:#fff; font-family:var(--font-mono); font-size:7px; border-radius:10px; padding:2px 6px; min-width:18px; text-align:center; display:none; }
      #cart-badge.show{ display:inline-block; }
      #cart-items{ max-height:120px; overflow-y:auto; margin-bottom:8px; }
      #cart-items::-webkit-scrollbar{ width:2px; }
      #cart-items::-webkit-scrollbar-thumb{ background:rgba(212,197,169,.12); }
      .cart-row{ display:flex; align-items:center; gap:8px; padding:5px 0; border-bottom:.5px solid rgba(212,197,169,.06); }
      .cart-row:last-child{ border-bottom:none; }
      .cart-row-name{ flex:1; font-family:'Montserrat',sans-serif; font-size:10px; color:#FFFFFF; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .cart-row-price{ font-family:var(--font-mono); font-size:8px; color:#FFFFFF; white-space:nowrap; }
      .cart-row-rm{ background:none; border:none; color:var(--text-dim); cursor:pointer; font-size:10px; padding:2px 3px; transition:color .2s; }
      .cart-row-rm:hover{ color:var(--danger); }
      #cart-empty-msg{ padding:10px 16px; text-align:center; font-family:'Montserrat',sans-serif; font-size:8px; letter-spacing:.12em; color:#FFFFFF; text-transform:uppercase; }
      #cart-total-row{ display:flex; justify-content:space-between; align-items:center; padding:6px 0 8px; margin-top:2px; border-top:.5px solid rgba(212,197,169,.1); }
      #cart-total-label{ font-family:'Montserrat',sans-serif; font-size:7px; letter-spacing:.16em; color:#FFFFFF; text-transform:uppercase; }
      #cart-total-price{ font-family:'Montserrat',sans-serif; font-size:15px; color:#FFFFFF; letter-spacing:.04em; }      
      
     #checkout-btn{
  width:auto; margin-top:-4px; margin-bottom:16px; margin-left:25px;
  padding:10px 20px; background:linear-gradient(135deg, rgba(18, 47, 106, 1), rgba(118, 170, 171, 0.89) 100%);
  border:.5px solid rgba(255, 255, 255, 0.76); color:#FFFFFF; font-family:var(--font-ui); font-size:11px;
  font-weight:700; letter-spacing:.12em; text-transform:uppercase; cursor:pointer; border-radius:var(--radius); transition:all .25s;
}
      #checkout-btn:hover{ background:linear-gradient(135deg, rgba(18, 47, 106, 1), rgba(118, 170, 171, 0.89) 100%); border-color:var(--accent); color:#fff; box-shadow:0 4px 20px rgba(255, 255, 255, 0.79); }
      #checkout-btn:disabled{ opacity:.4; cursor:default; }

      #artwork-popup{
        position:fixed; z-index:30; background:rgba(18,15,12,.98);
        border:.5px solid var(--border); border-radius:var(--radius);
        padding:0; width:280px; display:none; flex-direction:column; overflow:hidden;
        box-shadow:0 16px 48px rgba(0,0,0,.6);
      }
      #artwork-popup.open{ display:flex; }
      #ap-img-wrap{ position:relative; width:100%; overflow:hidden; background:#111; }
      #ap-img-canvas{ width:100%; height:auto; display:block; }
      #ap-close{
        position:absolute; top:8px; right:8px; width:26px; height:26px;
        background:rgba(0,0,0,.7); border:.5px solid rgba(255,255,255,.2); border-radius:50%;
        display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:11px; color:#fff; transition:all .2s;
      }
      #ap-close:hover{ background:rgba(181,74,58,.8); }
      #ap-expand-btn{
        position:absolute; bottom:8px; right:8px; width:26px; height:26px;
        background:rgba(0,0,0,.7); border:.5px solid rgba(255,255,255,.2); border-radius:50%;
        display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:11px; color:#fff; transition:all .2s;
      }
      #ap-expand-btn:hover{ background:rgba(200,169,110,.3); }
      #ap-body{ padding:14px 16px; display:flex; flex-direction:column; gap:8px; }
      #ap-title{ font-family:var(--font-head); font-size:18px; font-weight:400; font-style:italic; color:var(--gold); }
      #ap-sub{ display:flex; align-items:center; gap:8px; }
      #ap-artist{ font-family:var(--font-mono); font-size:8px; letter-spacing:.14em; color:var(--accent); text-transform:uppercase; }
      #ap-year{ font-family:var(--font-mono); font-size:8px; letter-spacing:.1em; color:var(--text-dim); }
      #ap-desc{ font-size:11px; line-height:1.75; color:rgba(212,197,169,.7); letter-spacing:.03em; }
      #ap-price-row{ display:flex; flex-direction:column; gap:2px; }
      #ap-price-label{ font-family:var(--font-mono); font-size:7px; letter-spacing:.16em; text-transform:uppercase; color:var(--text-dim); }
      #ap-price{ font-family:var(--font-head); font-size:20px; color:var(--accent2); letter-spacing:.04em; }
      #ap-add-cart{
        width:100%; padding:10px;
        background:linear-gradient(135deg, rgba(200,169,110,.2) 0%, rgba(200,169,110,.08) 100%);
        border:.5px solid rgba(200,169,110,.4); color:var(--accent); font-family:var(--font-ui); font-size:10px;
        font-weight:700; letter-spacing:.14em; text-transform:uppercase; cursor:pointer; border-radius:var(--radius-sm); transition:all .25s;
      }
      #ap-add-cart:hover:not(:disabled){ background:rgba(200,169,110,.35); border-color:var(--accent); color:#fff; }
      #ap-add-cart:disabled{ opacity:.5; cursor:default; }
      #ap-add-cart.added{ background:rgba(90,170,122,.15); border-color:rgba(90,170,122,.5); color:var(--green); }

      #expand-overlay{
        position:fixed; inset:0; z-index:50; background:rgba(10,8,6,.92);
        display:none; align-items:center; justify-content:center; 
      }
      #expand-overlay.open{ display:flex; }
      #expand-inner{ position:relative; max-width:85vw; max-height:90vh; display:flex; flex-direction:column; align-items:center; gap:14px; }
      #expand-img-wrap{
        position:relative; overflow:hidden; border:.5px solid rgba(212,197,169,.2); border-radius:6px;
        background:#0a0806; max-width:80vw; max-height:72vh;
      }
      #expand-canvas{ display:block; max-width:80vw; max-height:72vh; }
      #expand-3d-wrap{
        display:none; position:relative; border:.5px solid rgba(212,197,169,.2);
        border-radius:6px; overflow:hidden; background:#0a0806;
      }
      #expand-3d-canvas{ display:block; }
      #expand-caption{ color:var(--gold); font-family:var(--font-head); font-size:16px; font-style:italic; letter-spacing:.08em; }
      #expand-close{
        position:absolute; top:-16px; right:-16px; width:32px; height:32px;
        background:rgba(20,17,14,.95); border:.5px solid var(--border); border-radius:50%;
        display:flex; align-items:center; justify-content:center;
        cursor:pointer; font-size:14px; color:var(--gold); transition:all .2s; z-index:2;
      }
      #expand-close:hover{ background:rgba(181,74,58,.8); border-color:var(--danger); }

      #vw-toast{
        position:fixed; bottom:54px; left:50%; transform:translateX(-50%) translateY(16px);
        background:rgba(20,17,14,.97); border:.5px solid var(--border);
        color:var(--gold); font-family:var(--font-mono); font-size:8px;
        letter-spacing:.14em; text-transform:uppercase; padding:8px 18px; border-radius:20px;
        pointer-events:none; opacity:0; transition:opacity .3s, transform .3s;
        z-index:40; white-space:nowrap; backdrop-filter:blur(8px);
      }
      #vw-toast.show{ opacity:1; transform:translateX(-50%) translateY(0); }
      #vw-toast.success{ border-color:var(--green); color:var(--green); }
      #vw-toast.error{ border-color:var(--danger); color:var(--danger); }

      #vw-nav{ position:fixed; bottom:80px; left:50%; transform:translateX(-50%); background:rgba(15,13,12,.94); border:.5px solid #c8a96e; border-radius:4px; padding:6px 10px; display:none; align-items:center; gap:8px; z-index:25; font-family:monospace; }
      #vw-nav.show{ display:flex; }
      .vw-arr{ background:rgba(200,169,110,.12); border:.5px solid rgba(200,169,110,.4); color:#c8a96e; font-size:14px; width:28px; height:28px; cursor:pointer; border-radius:3px; display:flex; align-items:center; justify-content:center; transition:all .2s; }
      .vw-arr:hover{ background:rgba(200,169,110,.28); color:#fff; }
      .vw-arr:disabled{ opacity:.3; cursor:not-allowed; }

      #route-panel{
        position:fixed; left:66px; bottom:14px;
        width:220px; background:rgba(255, 255, 255, 0.76);
        border:.5px solid var(--border); border-radius:var(--radius);
        z-index:30; padding:14px; display:none; flex-direction:column; gap:14px;
        box-shadow:0 8px 32px rgba(0,0,0,.5);
      }
      #route-panel.open{ display:flex; }
      .rp-title{
        font-family:var(--font-head); font-size:14px; font-style:italic;
        color:#76AAAB; letter-spacing:.08em;
        border-bottom:.5px solid var(--border); padding-bottom:8px;
      }
      .rp-row{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
      .rp-label{ font-family:var(--font-mono); font-size:8px; letter-spacing:.12em; text-transform:uppercase; color:var(--gold-dim); flex:1; }
      .rp-toggle{
        position:relative; width:36px; height:20px; flex-shrink:0; cursor:pointer;
      }
      .rp-toggle input{ opacity:0; width:0; height:0; position:absolute; }
      .rp-slider{
        position:absolute; inset:0; background:rgba(212,197,169,.15);
        border:.5px solid rgba(212,197,169,.2); border-radius:20px; transition:all .25s;
      }
      .rp-slider::before{
        content:''; position:absolute; width:14px; height:14px;
        left:2px; top:2px; background:var(--gold-dim); border-radius:50%; transition:all .25s;
      }
      .rp-toggle input:checked + .rp-slider{ background:rgba(200,169,110,.3); border-color:var(--accent); }
      .rp-toggle input:checked + .rp-slider::before{ transform:translateX(16px); background:var(--accent); }
      .rp-note{ font-family:var(--font-mono); font-size:7px; color:var(--text-dim); line-height:1.6; letter-spacing:.06em; }
      #route-panel.no-waypoints .rp-row{ opacity:.35; pointer-events:none; }
    `;
    document.head.appendChild(s);
    this._el(s);
  }

  _buildToast() {
    const t = document.createElement('div'); t.id = 'vw-toast';
    document.body.appendChild(t); this._el(t);
  }

  _buildLeftColumn() {
    const col = document.createElement('div'); col.id = 'left-column';
    col.innerHTML = `
      <div id="minimap-wrap">
  <button id="minimap-expand-btn" title="Mở rộng" style="position:absolute;top:4px;right:4px;z-index:10;background:rgba(18,15,12,.6);border:.5px solid rgba(212,197,169,.3);border-radius:3px;cursor:pointer;font-size:8px;color:rgba(212,197,169,.7);width:16px;height:16px;display:flex;align-items:center;justify-content:center;padding:0;line-height:1;">⤢</button>
  <div id="minimap-rooms"></div>
  <div id="minimap-canvas-wrap">
    <img id="minimap-bg-svg" src="/icons/minimap.svg" alt="">
    <canvas id="minimap-canvas" width="200" height="200"></canvas>
  </div>
</div>

      <div class="icon-btn" id="btn-fullscreen" title="Phóng to màn hình"><img src="/icons/fullscreen.svg" style="width:18px;height:18px"></div>
      <div class="icon-btn" id="btn-sound" title="Tắt / mở âm thanh"><img src="/icons/sound.svg" style="width:18px;height:18px"></div>
      <div class="icon-btn" id="btn-route" title="Lộ trình tham quan"><img src="/icons/route.svg" style="width:18px;height:18px"></div>
      <div class="icon-btn" id="btn-like" title="Thích phòng tranh này"><img src="/icons/heart-empty.svg" style="width:18px;height:18px"></div>
      <div class="icon-btn" id="btn-settings" title="Cài đặt"><img src="/icons/settings.svg" style="width:18px;height:18px"></div>
      <div class="icon-btn" id="btn-help" title="Hướng dẫn sử dụng"><img src="/icons/help.svg" style="width:18px;height:18px"></div>

      <div id="chat-wrap">
        <div id="chat-box">
          <div id="chat-box-header">
            <span id="chat-room-label">Phòng tranh · Trực tiếp</span>
            <span id="chat-username-tag">…</span>
          </div>
          <div id="chat-messages"></div>
          <div id="chat-input-row">
            <input id="chat-input" placeholder="Nhắn tin…" autocomplete="off">
            <button id="chat-send">Gửi</button>
          </div>
        </div>
        <div id="chat-toggle-btn">
          <img src="/icons/chat-bar.svg" style="width:220px;height:44px;display:block;pointer-events:none">
          <span id="chat-unread"></span>
        </div>
      </div>
    `;
    document.body.appendChild(col); this._el(col);
  }

  _buildControlsBar() {
    const bar = document.createElement('div'); bar.id = 'controls-bar';
    bar.textContent = 'W A S D · Kéo chuột để xoay · Click tranh để xem';
    document.body.appendChild(bar); this._el(bar);
  }

  _buildHelpOverlay() {
    const overlay = document.createElement('div'); overlay.id = 'help-overlay';
    overlay.innerHTML = `
      <div id="help-box">
        <div id="help-title">Hướng dẫn tham quan</div>
        <div class="help-grid">
          <div class="help-item">
            <div class="help-key"><span class="key">W</span><span class="key">A</span><span class="key">S</span><span class="key">D</span></div>
            <div class="help-desc">Di chuyển trong phòng</div>
          </div>
          <div class="help-item">
            <div class="help-key"><span class="key">Kéo chuột</span></div>
            <div class="help-desc">Xoay góc nhìn</div>
          </div>
          <div class="help-item">
            <div class="help-key"><span class="key">Click tranh</span></div>
            <div class="help-desc">Xem thông tin tác phẩm</div>
          </div>
          <div class="help-item">
            <div class="help-key"><span class="key">↑ ↓ ← →</span></div>
            <div class="help-desc">Di chuyển thay thế</div>
          </div>
          <div class="help-item">
            <div class="help-key"><span class="key">⛶</span></div>
            <div class="help-desc">Phóng to toàn màn hình</div>
          </div>
          <div class="help-item">
            <div class="help-key"><span class="key">📋</span></div>
            <div class="help-desc">Danh sách tác phẩm</div>
          </div>
        </div>
        <button id="help-close">Đã hiểu · Vào tham quan</button>
      </div>
    `;
    document.body.appendChild(overlay); this._el(overlay);

    document.getElementById('help-close').addEventListener('click', () => {
      overlay.classList.remove('open');
    });
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  }

  _buildSettingsPanel() {
    const panel = document.createElement('div'); panel.id = 'settings-panel';
    panel.innerHTML = `
      <div class="sp-title">⚙ Cài đặt</div>
      <div class="sp-row">
        <span class="sp-label">Độ sáng</span>
        <input type="range" class="sp-range" id="sp-brightness" min="0.2" max="2" step="0.05" value="1">
        <span class="sp-val" id="sp-brightness-val">1.0</span>
      </div>
    `;
    document.body.appendChild(panel); this._el(panel);
  }

  _buildRoutePanel() {
    const panel = document.createElement('div'); panel.id = 'route-panel';
    panel.innerHTML = `
      <div class="rp-title">🛤 Lộ trình tham quan</div>
      <div class="rp-row">
        <span class="rp-label">Hiện đĩa dẫn đường</span>
        <label class="rp-toggle">
          <input type="checkbox" id="toggle-discs" checked>
          <span class="rp-slider"></span>
        </label>
      </div>
      <div class="rp-row">
        <span class="rp-label">Hiện thanh điều hướng</span>
        <label class="rp-toggle">
          <input type="checkbox" id="toggle-nav" checked>
          <span class="rp-slider"></span>
        </label>
      </div>
      <div class="rp-note">Khi tắt đĩa, bạn vẫn dùng thanh điều hướng để di chuyển theo lộ trình.</div>
    `;
    document.body.appendChild(panel); this._el(panel);
  }

  _bindFeatureEvents() {
    document.getElementById('btn-fullscreen').addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen();
      }
    });
    document.addEventListener('fullscreenchange', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });

    document.getElementById('btn-sound').addEventListener('click', () => {
      this._soundOn = !this._soundOn;
      const btn = document.getElementById('btn-sound');
      btn.textContent = this._soundOn ? '🔊' : '🔇';
      btn.classList.toggle('active', !this._soundOn);
      if (this._bgAudio) this._bgAudio.muted = !this._soundOn;
    });

    document.getElementById('btn-like').addEventListener('click', () => this._toggleLike());

    document.getElementById('btn-settings').addEventListener('click', () => {
      const sp = document.getElementById('settings-panel');
      sp.classList.toggle('open');
      document.getElementById('btn-settings').classList.toggle('active', sp.classList.contains('open'));
      document.getElementById('route-panel').classList.remove('open');
      document.getElementById('btn-route').classList.remove('active');
    });

    document.getElementById('btn-route').addEventListener('click', () => {
      const rp = document.getElementById('route-panel');
      rp.classList.toggle('open');
      document.getElementById('btn-route').classList.toggle('active', rp.classList.contains('open'));
      document.getElementById('settings-panel').classList.remove('open');
      document.getElementById('btn-settings').classList.remove('active');
      if (!this.pathWaypoints.length) rp.classList.add('no-waypoints');
      else rp.classList.remove('no-waypoints');
    });

    document.getElementById('toggle-discs').addEventListener('change', (e) => {
      const show = e.target.checked;
      this.pathMarkers.forEach(m => {
        if (m.mesh) m.mesh.visible = show;
        if (m.line) m.line.visible = show;
      });
    });

    document.getElementById('toggle-nav').addEventListener('change', (e) => {
      const bar = document.getElementById('vw-nav');
      if (!bar) return;
      if (e.target.checked && this.pathWaypoints.length) bar.classList.add('show');
      else bar.classList.remove('show');
    });
    
    // Brightness control: nhân với giá trị ánh sáng gốc
    document.getElementById('sp-brightness').addEventListener('input', (e) => {
      const v = +e.target.value;
      this._brightnessMultiplier = v;
      document.getElementById('sp-brightness-val').textContent = v.toFixed(2);
      this._applyLighting();
    });

    document.getElementById('btn-help').addEventListener('click', () => {
      document.getElementById('help-overlay').classList.toggle('open');
    });

    document.getElementById('minimap-expand-btn').addEventListener('click', () => {
      this._mmExpanded = !this._mmExpanded;
      const wrap = document.getElementById('minimap-wrap');
      wrap.classList.toggle('expanded', this._mmExpanded);
      document.getElementById('minimap-expand-btn').textContent = this._mmExpanded ? '⤡' : '⤢';
      document.getElementById('minimap-expand-btn').title = this._mmExpanded ? 'Thu nhỏ' : 'Mở rộng';
      const cw = this._mmExpanded ? 200 : 96;
      const mmCanvas = document.getElementById('minimap-canvas');
      mmCanvas.width = cw; mmCanvas.height = cw;
    });

    this._initChat();
  }
  
  // Hàm áp dụng ánh sáng với hệ số brightness
  _applyLighting() {
    if (this.ambLight) {
      this.ambLight.intensity = this._lighting.ambientIntensity * this._brightnessMultiplier;
    }
    if (this.hemiLight) {
      this.hemiLight.intensity = this._lighting.hemisphereIntensity * this._brightnessMultiplier;
    }
    if (this.dirLight) {
      this.dirLight.intensity = this._lighting.directionalIntensity * this._brightnessMultiplier;
    }
  }

  _initChat() {
    this._CHAT_ROOM = this._galleryDbKey;

    const authUser = this.manager.auth?.user;
    if (authUser) {
      this._chatUsername = authUser.name || authUser.display_name || authUser.email || 'Người dùng';
    } else {
      this._chatUsername = localStorage.getItem('chat_username') || 'Khách';
    }
    localStorage.setItem('chat_username', this._chatUsername);

    document.getElementById('chat-username-tag').textContent = this._chatUsername;

    document.getElementById('chat-username-tag').addEventListener('click', () => {
      const n = prompt('Đổi tên hiển thị:', this._chatUsername);
      if (n && n.trim()) {
        this._chatUsername = n.trim();
        localStorage.setItem('chat_username', this._chatUsername);
        document.getElementById('chat-username-tag').textContent = this._chatUsername;
      }
    });

    document.getElementById('chat-toggle-btn').addEventListener('click', () => {
      this._chatOpen = !this._chatOpen;
      document.getElementById('chat-box').classList.toggle('open', this._chatOpen);
      if (this._chatOpen) {
        this._unreadCount = 0;
        const u = document.getElementById('chat-unread');
        u.textContent = ''; u.classList.remove('show');
        const m = document.getElementById('chat-messages');
        m.scrollTop = m.scrollHeight;
      }
    });

    document.getElementById('chat-send').addEventListener('click', () => this._sendChat());
    document.getElementById('chat-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') this._sendChat();
    });

    this._loadOldMessages();
    this._subscribeChat();
  }

  _appendMsg(user, text, isMe) {
    const msgs = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'chat-msg' + (isMe ? ' is-me' : '');
    div.innerHTML = `<span class="msg-name">${user}</span><span class="msg-text">${text}</span>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    if (!this._chatOpen && !isMe) {
      this._unreadCount++;
      const u = document.getElementById('chat-unread');
      u.textContent = this._unreadCount > 9 ? '9+' : this._unreadCount;
      u.classList.add('show');
    }
  }

  async _loadOldMessages() {
    const { data, error } = await supabase.from('messages')
      .select('*').eq('room', this._CHAT_ROOM)
      .order('created_at', { ascending: true }).limit(50);
    if (!error && data) {
      data.forEach(m => this._appendMsg(m.username, m.content, m.username === this._chatUsername));
    }
  }

  async _sendChat() {
    const inp = document.getElementById('chat-input');
    const text = inp.value.trim();
    if (!text) return;
    inp.value = '';
    this._appendMsg(this._chatUsername, text, true);
    const { data, error } = await supabase.from('messages')
      .insert({ room: this._CHAT_ROOM, username: this._chatUsername, content: text }).select();
    if (error) { this._toast('Gửi thất bại', 'error'); return; }
    if (data && data[0] && data[0].id) this._shownMsgIds.add(data[0].id);
  }

  _subscribeChat() {
    supabase.channel(`chat-${this._CHAT_ROOM}-${Date.now()}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room=eq.${this._CHAT_ROOM}` },
        ({ new: msg }) => {
          if (!msg) return;
          if (this._shownMsgIds.has(msg.id)) { this._shownMsgIds.delete(msg.id); return; }
          this._appendMsg(msg.username, msg.content, msg.username === this._chatUsername);
        }
      ).subscribe((status, err) => {
        if (err) console.error('[Chat] Realtime error:', err);
      });
  }

  _renderMinimapRoomChips() {
    const container = document.getElementById('minimap-rooms');
    if (!container) return;
    container.innerHTML = '';
    const rooms = this._rooms || [{ id: 0, name: 'Phòng chính', x: 0, z: 0, w: 16, d: 16, floor: 0 }];
    rooms.forEach((r, i) => {
      const chip = document.createElement('div');
      chip.className = 'mm-room-chip' + (i === 0 ? ' active' : '');
      chip.textContent = r.name;
      chip.dataset.roomId = r.id;
      chip.addEventListener('click', () => {
        document.querySelectorAll('.mm-room-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const fy = (r.floor || 0) * 5.1;
        this.camera.position.set(r.x, fy + 1.9, r.z + r.d / 4);
        this.yaw = 0; this.pitch = 0;
        this._toast('Đến: ' + r.name, 'info', 1800);
      });
      container.appendChild(chip);
    });
    if (rooms.length > 1) container.classList.add('show');
  }

  _drawMinimap() {
    const mmCanvas = document.getElementById('minimap-canvas');
    if (!mmCanvas) return;
    const S = mmCanvas.width;
    const mmCtx = mmCanvas.getContext('2d');
    mmCtx.clearRect(0, 0, S, S);
    mmCtx.globalCompositeOperation = 'source-over';


    const box = this._roomBox;
if (!box) return;
const minX = box.min.x, maxX = box.max.x;
const minZ = box.min.z, maxZ = box.max.z;
    const pad = Math.round(S * .1);
    const spanX = maxX - minX || 20, spanZ = maxZ - minZ || 20;
    const scaleX = (S - pad * 2) / spanX, scaleZ = (S - pad * 2) / spanZ;
    const scale = Math.min(scaleX, scaleZ);
    const ox = pad + ((S - pad * 2) - spanX * scale) / 2 - minX * scale;
    const oz = pad + ((S - pad * 2) - spanZ * scale) / 2 - minZ * scale;

    const toMM = (wx, wz) => [ox + wx * scale, oz + wz * scale];

    const cFloor = Math.floor(this.camera.position.y / 5.1);
    const floorColors = ['rgba(90,78,62,.7)', 'rgba(60,78,100,.7)', 'rgba(78,100,60,.7)'];

    const [fx1, fz1] = toMM(minX, minZ);
const [fx2, fz2] = toMM(maxX, maxZ);


    this.artworks.forEach(a => {
      if (!a.group) return;
      const [mx, mz] = toMM(a.group.position.x, a.group.position.z);
      const sz = this._mmExpanded ? 4 : 3;
      mmCtx.fillStyle = 'rgba(200,169,110,.8)';
      mmCtx.fillRect(mx - sz / 2, mz - sz * .4, sz, sz * .8);
    });

    const [cx, cy2] = toMM(this.camera.position.x, this.camera.position.z);
const imgSize = 104;
if (!this._playerSvg) {
  this._playerSvg = new Image();
  this._playerSvg.src = '/icons/player.svg';
}
mmCtx.save();
mmCtx.translate(cx, cy2);
mmCtx.rotate(-this.yaw);
if (this._playerSvg.complete && this._playerSvg.naturalWidth) {
  mmCtx.drawImage(this._playerSvg, -imgSize / 2, -imgSize / 2, imgSize, imgSize);
}
    mmCtx.restore();
  }

  _toast(msg, type = 'info', dur = 2800) {
    const el = document.getElementById('vw-toast'); if (!el) return;
    el.textContent = msg; el.className = 'show ' + type;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.className = ''; }, dur);
  }

  _buildRightPanel() {
    const panel = document.createElement('div'); panel.id = 'right-panel';
    panel.innerHTML = `
      <div id="panel-tab">
        <span id="panel-tab-icon">📋</span>
        <span id="panel-tab-text">Tác phẩm</span>
      </div>
      <div id="panel-header">
        <div id="panel-header-top">
          <div id="panel-title">Tác phẩm trưng bày</div>
          <button id="panel-toggle-btn">✕</button>
        </div>
        <div id="panel-count">0 tác phẩm</div>
      </div>
      <div id="product-list">
        <div id="product-empty">
          <div style="font-size:24px;margin-bottom:8px">🖼</div>
          Chưa có tác phẩm nào<br>trong phòng tranh này
        </div>
      </div>
      <div id="cart-section">
        <div id="cart-header-row">
          <div id="cart-label">Giỏ hàng</div>
          <span id="cart-badge">0</span>
        </div>
        <div id="cart-items">
          <div id="cart-empty-msg">Chưa có tác phẩm nào</div>
        </div>
        <div id="cart-total-row" style="display:none">
          <span id="cart-total-label">Tổng cộng</span>
          <span id="cart-total-price">—</span>
        </div>
        <button id="checkout-btn" disabled>✦ Tiến hành thanh toán →</button>
      </div>
    `;
    document.body.appendChild(panel); this._el(panel);

    let panelOpen = true;
    const toggle = () => {
      panelOpen = !panelOpen;
      panel.classList.toggle('collapsed', !panelOpen);
      document.getElementById('panel-toggle-btn').textContent = panelOpen ? '✕' : '☰';
    };
    document.getElementById('panel-toggle-btn').addEventListener('click', toggle);
    document.getElementById('panel-tab').addEventListener('click', toggle);

    document.getElementById('checkout-btn').addEventListener('click', () => {
      if (this.cartItems.length === 0) return;
      const payload = this.cartItems.map(ci => ({
        title:  ci.art.meta?.title  || 'Untitled',
        artist: ci.art.meta?.artist || '',
        year:   ci.art.meta?.year   || '',
        price:  ci.art.meta?.price  || ''
      }));
      localStorage.setItem('gallery_cart', JSON.stringify(payload));
      window.open('checkout.html', '_blank');
    });
  }

  _buildArtworkPopup() {
    const popup = document.createElement('div'); popup.id = 'artwork-popup';
    popup.innerHTML = `
      <div id="ap-img-wrap">
        <canvas id="ap-img-canvas"></canvas>
        <div id="ap-close">✕</div>
        <div id="ap-expand-btn" title="Phóng to">⤢</div>
      </div>
      <div id="ap-body">
        <div id="ap-title">Untitled</div>
        <div id="ap-sub">
          <div id="ap-artist"></div>
          <div id="ap-year"></div>
        </div>
        <div id="ap-desc"></div>
        <div id="ap-price-row" style="display:none">
          <div id="ap-price-label">Giá</div>
          <div id="ap-price"></div>
        </div>
        <button id="ap-add-cart">🛒 Thêm vào giỏ hàng</button>
      </div>
    `;
    document.body.appendChild(popup); this._el(popup);

    document.getElementById('ap-close').addEventListener('click', () => popup.classList.remove('open'));
    document.getElementById('ap-expand-btn').addEventListener('click', () => {
      if (this.popupArt) this._showExpand(this.popupArt, this.popupArt._idx, this.popupArt._kind);
    });
    const addBtn = document.getElementById('ap-add-cart');
    addBtn.addEventListener('click', () => {
      const art = this.popupArt; if (!art) return;
      this._addToCart(art);
      addBtn.disabled = true;
      addBtn.textContent = '✓ Đã thêm vào giỏ';
      addBtn.className = 'added';
    });
  }

  _buildExpandOverlay() {
    const overlay = document.createElement('div'); overlay.id = 'expand-overlay';
    overlay.innerHTML = `
      <div id="expand-inner">
        <div id="expand-close">✕</div>
        <div id="expand-img-wrap" style="position:relative;overflow:hidden;border:.5px solid rgba(212,197,169,.2);border-radius:6px;background:#0a0806;cursor:zoom-in;">
          <canvas id="expand-canvas"></canvas>
        </div>
        <div id="expand-3d-wrap" style="display:none;position:relative;border:.5px solid rgba(212,197,169,.2);border-radius:6px;overflow:hidden;background:#0a0806;">
          <canvas id="expand-3d-canvas"></canvas>
          <div style="position:absolute;bottom:8px;left:50%;transform:translateX(-50%);font-family:monospace;font-size:7px;letter-spacing:.12em;color:rgba(212,197,169,.4);text-transform:uppercase;pointer-events:none;white-space:nowrap">Kéo để xoay · Cuộn để zoom</div>
        </div>
        <div id="expand-caption"></div>
      </div>
    `;
    document.body.appendChild(overlay); this._el(overlay);

    document.getElementById('expand-close').addEventListener('click', () => this._closeExpand());
    overlay.addEventListener('click', e => { if (e.target === overlay) this._closeExpand(); });
  }

  _closeExpand() {
    document.getElementById('expand-overlay').classList.remove('open');
    if (this._expand3d.raf) { cancelAnimationFrame(this._expand3d.raf); this._expand3d.raf = null; }
    if (this._expand3d.renderer) { this._expand3d.renderer.dispose(); this._expand3d.renderer = null; }
    this._expand3d.scene = null; this._expand3d.camera = null;
    document.getElementById('expand-img-wrap').style.display = 'none';
    document.getElementById('expand-3d-wrap').style.display  = 'none';
  }

  _renderThumb(art, kind) {
    const c = document.createElement('canvas');
    c.width = 72; c.height = 72;
    const ctx = c.getContext('2d');
    if (kind === 'model') {
      try { this._renderModelThumb(art.object, c); } catch (e) { }
    } else if (art.sourceImage) {
      const img = art.sourceImage;
      const scale = Math.max(72/img.naturalWidth, 72/img.naturalHeight);
      const dw = img.naturalWidth*scale, dh = img.naturalHeight*scale;
      ctx.drawImage(img, (72-dw)/2, (72-dh)/2, dw, dh);
    } else if (art.videoEl) {
      ctx.fillStyle='#111'; ctx.fillRect(0,0,72,72);
      ctx.fillStyle='#c8a96e'; ctx.font='20px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('▶',36,36);
    } else {
      ctx.fillStyle='#111'; ctx.fillRect(0,0,72,72);
    }
    return c;
  }

  _renderModelThumb(object, canvas) {
    const offRenderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
    offRenderer.setSize(72,72); offRenderer.setClearColor(0x111111,1);
    const offScene = new THREE.Scene();
    const offCamera = new THREE.PerspectiveCamera(45,1,0.01,100);
    const clone = object.clone(true); offScene.add(clone);
    const box = new THREE.Box3().setFromObject(clone);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x,size.y,size.z);
    offCamera.position.set(center.x+maxDim*1.2, center.y+maxDim*0.6, center.z+maxDim*1.2);
    offCamera.lookAt(center);
    offScene.add(new THREE.AmbientLight(0xffffff,0.8));
    const dl = new THREE.DirectionalLight(0xfff4e0,1.2); dl.position.set(5,8,5); offScene.add(dl);
    offRenderer.render(offScene,offCamera);
    canvas.getContext('2d').drawImage(offRenderer.domElement,0,0,72,72);
    offRenderer.dispose();
  }

  _renderProductList() {
    const list = document.getElementById('product-list');
    const count = document.getElementById('panel-count');
    list.innerHTML = '';
    const allItems = [
      ...this.artworks.map(a => ({ kind:'artwork', data:a })),
      ...this.models3d.map(m => ({ kind:'model', data:m }))
    ];
    count.textContent = allItems.length + ' tác phẩm';
    if (allItems.length === 0) {
      const e = document.createElement('div'); e.id='product-empty';
      e.innerHTML = '<div style="font-size:24px;margin-bottom:8px">🖼</div>Chưa có tác phẩm nào<br>trong phòng tranh này';
      list.appendChild(e); return;
    }
    allItems.forEach((item,i) => {
      const art = item.data;
      const meta = art.meta || {};
      const card = document.createElement('div'); card.className = 'product-card';
      card.dataset.idx = i; card.dataset.kind = item.kind;

      const tw = document.createElement('div'); tw.className = 'product-thumb-wrap';
      const tc = this._renderThumb(art, item.kind);
      tc.className = 'product-thumb-canvas'; tw.appendChild(tc);

      const body = document.createElement('div'); body.className = 'product-body';
      const dName = meta.title || (item.kind==='model' ? (art.name||'Model 3D') : ('Tác phẩm #'+(i+1)));
      body.innerHTML = `<div class="product-name">${dName}</div>
        <div class="product-artist">${meta.artist || (item.kind==='model'?'<span style="color:#3a3028;font-size:6px">● 3D</span>':'')}</div>
        <div class="product-price ${meta.price?'':'contact'}">${meta.price||'Liên hệ'}</div>`;

      const acts = document.createElement('div'); acts.className = 'product-actions';
      const infoBtn = document.createElement('button'); infoBtn.className='product-act-btn'; infoBtn.title='Xem thông tin'; infoBtn.innerHTML='<img src="/icons/info.svg" style="width:16px;height:16px">';
      const flyBtn = document.createElement('button'); flyBtn.className='product-act-btn'; flyBtn.title='Di chuyển đến'; flyBtn.innerHTML='<img src="/icons/fullpic.svg" style="width:16px;height:16px">';

      infoBtn.addEventListener('click', e => { e.stopPropagation(); this._showArtworkPopup(art, i, item.kind); });
      flyBtn.addEventListener('click', e => { e.stopPropagation(); this._showExpand(art, i, item.kind); });
      acts.appendChild(infoBtn); acts.appendChild(flyBtn);
      card.appendChild(tw); card.appendChild(body); card.appendChild(acts);
      card.addEventListener('click', () => this._showArtworkPopup(art, i, item.kind));
      list.appendChild(card);
    });
  }

  _addToCart(art) {
    if (this.cartItems.some(ci => ci.art === art)) return;
    this.cartItems.push({ art, id: ++this.cartIdCnt });
    this._renderCart();
    this._toast('Đã thêm vào giỏ hàng ✓', 'success');
    document.querySelectorAll('.product-card').forEach(card => {
      const allItems = [...this.artworks.map(a=>({data:a})), ...this.models3d.map(m=>({data:m}))];
      const item = allItems[parseInt(card.dataset.idx)];
      if (item && item.data === art) card.classList.add('in-cart');
    });
  }

  _removeFromCart(id) {
    const idx = this.cartItems.findIndex(ci => ci.id === id);
    if (idx !== -1) this.cartItems.splice(idx, 1);
    this._renderCart();
    const addBtn = document.getElementById('ap-add-cart');
    if (addBtn._art && !this.cartItems.some(ci => ci.art === addBtn._art)) {
      addBtn.disabled = false; addBtn.textContent = '🛒 Thêm vào giỏ hàng'; addBtn.className = '';
    }
    document.querySelectorAll('.product-card').forEach(card => {
      const allItems = [...this.artworks.map(a=>({data:a})), ...this.models3d.map(m=>({data:m}))];
      const item = allItems[parseInt(card.dataset.idx)];
      if (item && !this.cartItems.some(ci => ci.art === item.data)) card.classList.remove('in-cart');
    });
  }

  _renderCart() {
    const itemsEl = document.getElementById('cart-items');
    const badge = document.getElementById('cart-badge');
    const totalRow = document.getElementById('cart-total-row');
    const totalEl = document.getElementById('cart-total-price');
    const checkBtn = document.getElementById('checkout-btn');
    itemsEl.innerHTML = '';
    if (this.cartItems.length === 0) {
      const em = document.createElement('div'); em.id='cart-empty-msg'; em.textContent='Chưa có tác phẩm nào';
      itemsEl.appendChild(em); badge.classList.remove('show'); totalRow.style.display='none'; checkBtn.disabled=true; return;
    }
    this.cartItems.forEach(ci => {
      const m = ci.art.meta || {};
      const row = document.createElement('div'); row.className='cart-row';
      row.innerHTML = `<div class="cart-row-name">${m.title||'Untitled'}</div><div class="cart-row-price">${m.price||'—'}</div>`;
      const rm = document.createElement('button'); rm.className='cart-row-rm'; rm.textContent='✕';
      rm.addEventListener('click', () => this._removeFromCart(ci.id));
      row.appendChild(rm); itemsEl.appendChild(row);
    });
    badge.textContent = this.cartItems.length > 9 ? '9+' : this.cartItems.length; badge.classList.add('show');

    let total=0, allParsed=true;
    this.cartItems.forEach(ci => { const n=parsePrice(ci.art.meta?.price||''); if(isNaN(n)) allParsed=false; else total+=n; });
    totalEl.textContent = allParsed ? formatPrice(total) : '— (Liên hệ)';
    totalRow.style.display='flex'; checkBtn.disabled=false;
  }

  _showArtworkPopup(art, idx, kind) {
    this.popupArt = art;
    art._kind = kind; art._idx = idx;
    const meta = art.meta || {};
    const apCanvas = document.getElementById('ap-img-canvas');

    if (kind === 'model') {
      apCanvas.width=280; apCanvas.height=210; apCanvas.style.width='280px'; apCanvas.style.height='210px';
      try { this._renderModelThumb(art.object, apCanvas); } catch(e) {}
    } else {
      let ar = 4/3;
      if (art.sourceImage) ar = art.sourceImage.naturalWidth / art.sourceImage.naturalHeight;
      else if (art.videoEl) ar = art.videoEl.videoWidth / art.videoEl.videoHeight || 4/3;
      const popW = 280, popH = Math.round(popW / ar);
      apCanvas.width=popW*2; apCanvas.height=popH*2; apCanvas.style.width=popW+'px'; apCanvas.style.height=popH+'px';
      const ctx = apCanvas.getContext('2d'); ctx.scale(2,2);
      if (art.sourceImage) ctx.drawImage(art.sourceImage,0,0,popW,popH);
      else if (art.videoEl) { ctx.fillStyle='#111'; ctx.fillRect(0,0,popW,popH); ctx.fillStyle='#c8a96e'; ctx.font='30px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('▶',popW/2,popH/2); }
    }

    document.getElementById('ap-title').textContent = meta.title || (kind==='model'? (art.name||'Model 3D') : ('Tác phẩm #'+(idx+1)));
    document.getElementById('ap-artist').textContent = meta.artist ? '— '+meta.artist : '';
    document.getElementById('ap-year').textContent   = meta.year   || '';
    document.getElementById('ap-desc').textContent   = meta.desc   || '';
    const priceRow = document.getElementById('ap-price-row');
    if (meta.price) { document.getElementById('ap-price').textContent=meta.price; priceRow.style.display='flex'; }
    else priceRow.style.display='none';

    const addBtn = document.getElementById('ap-add-cart');
    const inCart = this.cartItems.some(ci => ci.art === art);
    addBtn.disabled = inCart; addBtn.textContent = inCart ? '✓ Đã thêm vào giỏ' : '🛒 Thêm vào giỏ hàng';
    addBtn.className = inCart ? 'added' : ''; addBtn._art = art;

    const popup = document.getElementById('artwork-popup');
    popup.style.left='50%'; popup.style.top='50%'; popup.style.transform='translate(-50%,-50%)';
    popup.classList.add('open');
  }

  _showExpand(art, idx, kind) {
    this._closeExpand();
    const overlay = document.getElementById('expand-overlay');
    const imgWrap = document.getElementById('expand-img-wrap');
    const wrap3d  = document.getElementById('expand-3d-wrap');
    const cap     = document.getElementById('expand-caption');
    cap.textContent = art.meta?.title || (kind==='model'? (art.name||'Model 3D') : ('Tác phẩm #'+(idx+1)));

    if (kind === 'model') {
      imgWrap.style.display='none'; wrap3d.style.display='block';
      const SIZE_W=Math.min(Math.round(innerWidth*.75),800), SIZE_H=Math.min(Math.round(innerHeight*.65),600);
      const ec3=document.getElementById('expand-3d-canvas');
      ec3.width=SIZE_W; ec3.height=SIZE_H; ec3.style.width=SIZE_W+'px'; ec3.style.height=SIZE_H+'px';

      this._expand3d.renderer = new THREE.WebGLRenderer({ canvas:ec3, antialias:true });
      this._expand3d.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
      this._expand3d.renderer.setSize(SIZE_W,SIZE_H); this._expand3d.renderer.setClearColor(0x0f0d0a);
      this._expand3d.scene = new THREE.Scene();
      this._expand3d.camera = new THREE.PerspectiveCamera(45, SIZE_W/SIZE_H, 0.01, 200);
      this._expand3d.scene.add(new THREE.AmbientLight(0xfff4e0,0.9));
      const dl=new THREE.DirectionalLight(0xfff0dd,1.4); dl.position.set(5,8,5); this._expand3d.scene.add(dl);
      const dl2=new THREE.DirectionalLight(0xaac8ff,0.4); dl2.position.set(-5,3,-5); this._expand3d.scene.add(dl2);
      const clone=art.object.clone(true); this._expand3d.scene.add(clone);
      const box=new THREE.Box3().setFromObject(clone); this._expand3d.center=box.getCenter(new THREE.Vector3());
      const bsize=box.getSize(new THREE.Vector3()); this._expand3d.dist=Math.max(bsize.x,bsize.y,bsize.z)*2.2;
      this._expand3d.yaw=0.5; this._expand3d.pitch=0.3;

      const updateCam=()=>{ const {camera,center,yaw,pitch,dist}=this._expand3d; camera.position.set(center.x+dist*Math.sin(yaw)*Math.cos(pitch), center.y+dist*Math.sin(pitch), center.z+dist*Math.cos(yaw)*Math.cos(pitch)); camera.lookAt(center); };
      const loop=()=>{ this._expand3d.raf=requestAnimationFrame(loop); updateCam(); this._expand3d.renderer.render(this._expand3d.scene,this._expand3d.camera); };
      loop();

      ec3.onmousedown=e=>{ this._expand3d.drag=true; this._expand3d.lx=e.clientX; this._expand3d.ly=e.clientY; ec3.style.cursor='grabbing'; };
      window.addEventListener('mouseup',()=>{ this._expand3d.drag=false; ec3.style.cursor='grab'; });
      window.addEventListener('mousemove',e=>{ if(!this._expand3d.drag)return; this._expand3d.yaw+=(e.clientX-this._expand3d.lx)*0.006; this._expand3d.pitch-=(e.clientY-this._expand3d.ly)*0.006; this._expand3d.pitch=Math.max(-1.2,Math.min(1.2,this._expand3d.pitch)); this._expand3d.lx=e.clientX; this._expand3d.ly=e.clientY; });
      ec3.onwheel=e=>{ e.preventDefault(); this._expand3d.dist*=e.deltaY>0?1.1:0.9; this._expand3d.dist=Math.max(0.3,Math.min(20,this._expand3d.dist)); };
    } else {
      wrap3d.style.display='none'; imgWrap.style.display='block';
      const ec=document.getElementById('expand-canvas');
      let ar=4/3; if(art.sourceImage) ar=art.sourceImage.naturalWidth/art.sourceImage.naturalHeight; else if(art.videoEl) ar=art.videoEl.videoWidth/art.videoEl.videoHeight||4/3;
      const maxW=Math.min(Math.round(innerWidth*.75),900), maxH=Math.round(innerHeight*.68);
      let natW=maxW, natH=Math.round(maxW/ar); if(natH>maxH){ natH=maxH; natW=Math.round(maxH*ar); }
      const dpr=devicePixelRatio||1;
      ec.width=natW*dpr; ec.height=natH*dpr; ec.style.width=natW+'px'; ec.style.height=natH+'px';
      const ctx=ec.getContext('2d'); ctx.scale(dpr,dpr);
      if(art.sourceImage) ctx.drawImage(art.sourceImage,0,0,natW,natH);
      else if(art.videoEl){ ctx.fillStyle='#111'; ctx.fillRect(0,0,natW,natH); ctx.fillStyle='#c8a96e'; ctx.font='40px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('▶',natW/2,natH/2); }

      this._expandImg={zoom:1,panX:0,panY:0,drag:false,lx:0,ly:0};
      const apply=()=>{ ec.style.transform=`translate(${this._expandImg.panX}px,${this._expandImg.panY}px) scale(${this._expandImg.zoom})`; ec.style.transformOrigin='center center'; };
      imgWrap.onmousedown=e=>{ this._expandImg.drag=true; this._expandImg.lx=e.clientX; this._expandImg.ly=e.clientY; imgWrap.style.cursor='grabbing'; };
      window.addEventListener('mouseup',()=>{ this._expandImg.drag=false; imgWrap.style.cursor=this._expandImg.zoom>1?'grab':'zoom-in'; });
      window.addEventListener('mousemove',e=>{ if(!this._expandImg.drag||this._expandImg.zoom<=1)return; this._expandImg.panX+=e.clientX-this._expandImg.lx; this._expandImg.panY+=e.clientY-this._expandImg.ly; this._expandImg.lx=e.clientX; this._expandImg.ly=e.clientY; apply(); });
      imgWrap.onwheel=e=>{ e.preventDefault(); const f=e.deltaY>0?.85:1.18; this._expandImg.zoom=Math.max(1,Math.min(8,this._expandImg.zoom*f)); if(this._expandImg.zoom<=1){ this._expandImg.panX=0; this._expandImg.panY=0; } apply(); imgWrap.style.cursor=this._expandImg.zoom>1?'grab':'zoom-in'; };
    }
    overlay.classList.add('open');
  }

  _flyToArtwork(art, kind) {
    let target, n;
    if (kind === 'model') { target = art.object.position.clone(); n = new THREE.Vector3(0,0,1); }
    else { target = art.group.position.clone(); n = new THREE.Vector3(Math.sin(art.group.rotation.y),0,Math.cos(art.group.rotation.y)); }
    const dest = target.clone().addScaledVector(n, 3.5);
    dest.y = this.camera.position.y;
    const start = this.camera.position.clone();
    const dur = 800, t0 = Date.now();
    const fly = () => {
      const t = Math.min((Date.now()-t0)/dur, 1);
      const e = t<0.5 ? 2*t*t : -1+(4-2*t)*t;
      this.camera.position.lerpVectors(start, dest, e);
      const dir = target.clone().sub(this.camera.position);
      this.yaw = Math.atan2(dir.x, dir.z);
      if (t < 1) requestAnimationFrame(fly);
    };
    fly();
  }

  async _loadRoomGLB(roomIndex, templateFile = 'scene.glb') {
    return new Promise(resolve => {
      new GLTFLoader().load(`/models/${templateFile}`, (gltf) => {
        const model = gltf.scene;
        if (roomIndex === 0) {
          const box = new THREE.Box3().setFromObject(model);
          this._roomBox        = box.clone();
          this._roomBoxCenterX = (box.min.x + box.max.x) / 2;
          this.ROOM_SPACING    = (box.max.x - box.min.x) + this.GAP_WIDTH;
          this.floorY          = box.min.y;
          const center = box.getCenter(new THREE.Vector3());
          this.camera.position.set(center.x, box.min.y + 1.9, center.z);
        }
        const offset = roomIndex * this.ROOM_SPACING;
        model.position.x += offset;
        this.threeScene.add(model);
        model.traverse(c => { if (c.isMesh) this.modelMeshes.push(c); });
        this.roomModels.push({ model, offset });
        if (roomIndex > 0) this._addRoomConnector(roomIndex);
        resolve();
      });
    });
  }

  _addRoomConnector(roomIndex) {
    const box = this._roomBox;
    if (!box) return;
    const prevOffset = (roomIndex - 1) * this.ROOM_SPACING;
    const currOffset = roomIndex * this.ROOM_SPACING;
    const gapStartX  = prevOffset + box.max.x;
    const gapEndX    = currOffset + box.min.x;
    const gapLen     = gapEndX - gapStartX;
    if (gapLen <= 0) return;
    const gapCX   = (gapStartX + gapEndX) / 2;
    const floorY  = box.min.y;
    const centerZ = (box.max.z + box.min.z) / 2;
    const depthZ  = box.max.z - box.min.z;
    const ceilY   = box.max.y;

    const floorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(gapLen, 0.15, depthZ),
      new THREE.MeshLambertMaterial({ color: 0xc0b090 })
    );
    floorMesh.position.set(gapCX, floorY + 0.075, centerZ);
    this.threeScene.add(floorMesh);
    this.modelMeshes.push(floorMesh);

    const ceilMesh = new THREE.Mesh(
      new THREE.BoxGeometry(gapLen, 0.15, depthZ),
      new THREE.MeshLambertMaterial({ color: 0xe8e0d0 })
    );
    ceilMesh.position.set(gapCX, ceilY - 0.075, centerZ);
    this.threeScene.add(ceilMesh);

    const mat   = new THREE.MeshLambertMaterial({ color: 0x3a2a18 });
    const doorH = Math.min(2.5, (ceilY - floorY) * 0.85);
    const doorW = 1.4;
    const postG = new THREE.BoxGeometry(0.14, doorH, 0.14);
    const beamG = new THREE.BoxGeometry(0.14, 0.2, doorW + 0.28);

    const lPost = new THREE.Mesh(postG, mat); lPost.position.set(gapCX, floorY + doorH / 2, centerZ - doorW / 2 - 0.07); this.threeScene.add(lPost);
    const rPost = new THREE.Mesh(postG, mat); rPost.position.set(gapCX, floorY + doorH / 2, centerZ + doorW / 2 + 0.07); this.threeScene.add(rPost);
    const beam  = new THREE.Mesh(beamG, mat); beam.position.set(gapCX, floorY + doorH + 0.1, centerZ); this.threeScene.add(beam);
  }

  _isNearRoomDoor(pos) {
    if (!this._roomBox || this.roomModels.length <= 1) return false;
    const DOOR_RANGE = 1.6;
    for (const rm of this.roomModels) {
      const lx = rm.offset + this._roomBox.min.x;
      const rx = rm.offset + this._roomBox.max.x;
      if (pos.x < lx + DOOR_RANGE || pos.x > rx - DOOR_RANGE) return true;
    }
    return false;
  }

  async _loadRoom() {
    const { data, error } = await supabase.from('gallery').select('scene_data').eq('name', this.manager.currentRoom.id).limit(1);
    if (error || !data?.length) {
      await this._loadRoomGLB(0, 'scene.glb');
      this._galleryName = 'Phòng Tranh 3D';
      this._artistName  = 'Artist Name';
      return;
    }
    const sd = data[0].scene_data;

    // Load GLB phòng với đúng template
    const templateFile = sd._meta?.selectedTemplate || 'scene.glb';
    await this._loadRoomGLB(0, templateFile);
    if (this._disposed) return;

    // Khôi phục ánh sáng từ dữ liệu đã lưu
    if (sd.lighting) {
      this._lighting.ambientIntensity = sd.lighting.ambientIntensity;
      this._lighting.ambientColor = sd.lighting.ambientColor;
      this._lighting.hemisphereIntensity = sd.lighting.hemisphereIntensity;
      this._lighting.directionalIntensity = sd.lighting.directionalIntensity;
      
      this.ambLight.color.set(this._lighting.ambientColor);
      this.ambLight.intensity = this._lighting.ambientIntensity * this._brightnessMultiplier;
      this.hemiLight.intensity = this._lighting.hemisphereIntensity * this._brightnessMultiplier;
      this.dirLight.intensity = this._lighting.directionalIntensity * this._brightnessMultiplier;
    } else {
      // Fallback giá trị mặc định nếu không có lighting trong dữ liệu
      this._applyLighting();
    }

    const roomCount = sd._meta?.roomCount || 1;
    for (let i = 1; i < roomCount; i++) {
      await this._loadRoomGLB(i, templateFile);
    }

    this._galleryName = sd.gallery_name || this.manager.currentRoom.name || 'Phòng Tranh 3D';
    this._artistName  = sd.artist_name  || 'Artist Name';

    this._trackView();

    if (sd.artworks?.length) {
      for (const a of sd.artworks) {
        if (!a.storageUrl) continue;
        const pos  = new THREE.Vector3(a.x, a.y, a.z);
        const sv   = a.sx ? new THREE.Vector3(a.sx, a.sy, a.sz) : null;
        const meta = a.meta || {};
        const group = new THREE.Group();
        group.position.copy(pos); group.rotation.set(0, a.ry||0, 0); if (sv) group.scale.copy(sv);

        if (a.isVideo) {
          const vid = document.createElement('video'); vid.src = a.storageUrl; vid.loop=true; vid.muted=true; vid.playsInline=true; vid.crossOrigin='anonymous';
          vid.addEventListener('loadeddata', () => {
            const tex = new THREE.VideoTexture(vid); tex.minFilter = THREE.LinearFilter;
            const AH = 1.65, AW = AH * (vid.videoWidth / vid.videoHeight || 4/3);
            group.add(new THREE.Mesh(new THREE.BoxGeometry(AW+.16, AH+.16, .08), FRAME_MAT));
            const plane = new THREE.Mesh(new THREE.PlaneGeometry(AW, AH), new THREE.MeshBasicMaterial({ map:tex })); plane.position.z=.046; group.add(plane);
            this.threeScene.add(group);
            this.artworks.push({ group, isVideo:true, videoTex:tex, videoEl:vid, meta, sourceImage:null });
            vid.play();
          });
        } else {
          const img = new Image(); img.crossOrigin = 'anonymous'; img.src = a.storageUrl;
          await new Promise(resolve => {
            img.onload = () => {
              const canvas = document.createElement('canvas'); canvas.width=img.naturalWidth; canvas.height=img.naturalHeight;
              canvas.getContext('2d').drawImage(img,0,0);
              const tex = new THREE.CanvasTexture(canvas); tex.minFilter = THREE.LinearFilter;
              const AH = 1.65, AW = AH * (img.naturalWidth / img.naturalHeight);
              group.add(new THREE.Mesh(new THREE.BoxGeometry(AW+.16, AH+.16, .08), FRAME_MAT));
              const plane = new THREE.Mesh(new THREE.PlaneGeometry(AW, AH), new THREE.MeshBasicMaterial({ map:tex })); plane.position.z=.046; group.add(plane);
              this.threeScene.add(group);
              this.artworks.push({ group, sourceImage: img, meta });
              resolve();
            };
            img.onerror = resolve;
          });
        }
      }
    }

    if (sd.models?.length) {
      for (const m of sd.models) {
        if (!m.storageUrl) continue;
        const ext = (m.name||m.storageUrl).split('.').pop().toLowerCase();
        const pos = new THREE.Vector3(m.x, m.y, m.z);
        const sv  = m.sx ? new THREE.Vector3(m.sx, m.sy, m.sz) : null;
        const meta = m.meta || {};
        const onLoad = (obj) => {
          if (sv) obj.scale.copy(sv);
          else { const box = new THREE.Box3().setFromObject(obj); const sz = box.getSize(new THREE.Vector3()); obj.scale.setScalar(1.2/Math.max(sz.x,sz.y,sz.z)); }
          obj.position.copy(pos); obj.position.y = .88;
          this.threeScene.add(obj);
          const pl = new THREE.PointLight(0xfff0dd, 1.5, 4); pl.position.set(pos.x, pos.y+2, pos.z); this.threeScene.add(pl);
          this._makePedestal(new THREE.Vector3(pos.x, 0, pos.z));
          this.models3d.push({ object:obj, name:m.name, meta });
        };
        await new Promise(resolve => {
          if (ext==='glb'||ext==='gltf') this.gltfLoader.load(m.storageUrl, g=>{ onLoad(g.scene); resolve(); }, null, resolve);
          else if (ext==='obj') this.objLoader.load(m.storageUrl, obj=>{ obj.traverse(c=>{ if(c.isMesh)c.material=new THREE.MeshLambertMaterial({color:0xccbbaa}); }); onLoad(obj); resolve(); }, null, resolve);
          else resolve();
        });
      }
    }

    if (sd.waypoints?.length) {
      this.pathWaypoints = sd.waypoints.map(wp=>({ ...wp }));
      this.currentWpIdx  = 0;
      this._addWpDiscs(this.pathWaypoints);
      this._updateWaypointBar();
    }
    if (sd.rooms && sd.rooms.length) {
      this._rooms = sd.rooms;
    } else {
      this._rooms = [{ id: 0, name: 'Phòng chính', x: 0, z: 0, w: 16, d: 16, floor: 0 }];
    }

    if (sd.texts?.length) {
      await this.textEditor.loadFromData(sd.texts);
    }

    if (sd.musicUrl) {
      this._bgAudio = new Audio(sd.musicUrl);
      this._bgAudio.loop = true;
      this._bgAudio.volume = 0.5;
      this._bgAudio.muted = !this._soundOn;
      this._bgAudio.play().catch(() => {
        const playOnFirst = () => { this._bgAudio?.play().catch(() => {}); };
        document.addEventListener('click', playOnFirst, { once: true });
      });
    }

    this._updateTopBarInfo();
  }

  _makePedestal(pos) {
    const g    = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1,.08,1.1), new THREE.MeshLambertMaterial({color:0xddd8d0})); base.position.set(0,.04,0); g.add(base);
    const col  = new THREE.Mesh(new THREE.BoxGeometry(.9,.8,.9),    new THREE.MeshLambertMaterial({color:0xf0ece6})); col.position.set(0,.44,0);  g.add(col);
    const top  = new THREE.Mesh(new THREE.BoxGeometry(1.05,.06,1.05), new THREE.MeshLambertMaterial({color:0xddd8d0})); top.position.set(0,.87,0); g.add(top);
    g.position.copy(pos); this.threeScene.add(g); return g;
  }

  _makeWpTex(num, hovered) {
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

  _addWpDiscs(waypoints) {
    waypoints.forEach((wp, idx) => {
      const fy = this.floorY;
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(0.55, 32),
        new THREE.MeshBasicMaterial({ map: this._makeWpTex(idx + 1, false), transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(wp.x, fy + 0.012, wp.z);
      disc.userData.waypointIdx = idx;
      this.threeScene.add(disc);

      let line = null;
      if (idx > 0) {
        const prev = waypoints[idx - 1];
        const pts = [
          new THREE.Vector3(prev.x, fy + 0.015, prev.z),
          new THREE.Vector3(wp.x,   fy + 0.015, wp.z)
        ];
        line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: 0xc8a96e, transparent: true, opacity: 0.55 })
        );
        this.threeScene.add(line);
      }
      this.pathMarkers.push({ mesh: disc, line });
    });
  }

  _buildWaypointBar() {
    const bar = document.createElement('div'); bar.id = 'vw-nav';
    bar.innerHTML = `
      <button class="vw-arr" id="vw-prev">&#9664;</button>
      <div style="display:flex;flex-direction:column;align-items:center;min-width:90px">
        <span id="vw-num" style="color:#c8a96e;font-size:11px;font-style:italic">1/1</span>
        <span id="vw-lbl" style="color:#7a6e5c;font-size:7px;letter-spacing:.1em;text-transform:uppercase;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">—</span>
      </div>
      <button class="vw-arr" id="vw-next">&#9654;</button>
      <button id="vw-close" style="background:none;border:.5px solid rgba(212,197,169,.15);color:#555;font-size:9px;cursor:pointer;border-radius:2px;padding:2px 6px;transition:all .2s">✕</button>
    `;
    document.body.appendChild(bar); this._el(bar);
    document.getElementById('vw-prev').addEventListener('click', () => this._travelTo(this.currentWpIdx - 1));
    document.getElementById('vw-next').addEventListener('click', () => this._travelTo(this.currentWpIdx + 1));
    document.getElementById('vw-close').addEventListener('click', () => { bar.classList.remove('show'); this.currentWpIdx = -1; });
  }

  _updateWaypointBar() {
    const bar = document.getElementById('vw-nav'); if (!bar) return;
    if (!this.pathWaypoints.length) { bar.classList.remove('show'); return; }
    bar.classList.add('show');
    document.getElementById('vw-num').textContent = `${this.currentWpIdx+1} / ${this.pathWaypoints.length}`;
    document.getElementById('vw-lbl').textContent = this.pathWaypoints[this.currentWpIdx]?.label || '—';
    document.getElementById('vw-prev').disabled = this.currentWpIdx <= 0;
    document.getElementById('vw-next').disabled = this.currentWpIdx >= this.pathWaypoints.length - 1;
  }

  _travelTo(idx) {
    if (idx<0 || idx>=this.pathWaypoints.length) return;
    this.currentWpIdx = idx;
    const wp = this.pathWaypoints[idx];
    this.wpTravelFrom   = { x:this.camera.position.x, y:this.camera.position.y, z:this.camera.position.z, yaw:this.yaw, pitch:this.pitch };
    this.wpTravelTarget = { x:wp.x, y:wp.y, z:wp.z, yaw:wp.yaw||0, pitch:wp.pitch||0 };
    this.wpTravelT = 0;
    this._updateWaypointBar();
  }

  _onCanvasClick(e) {
    if (this.didDrag) return;
    this.mouse.x =  (e.clientX / innerWidth)  * 2 - 1;
    this.mouse.y = -(e.clientY / innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    if (this.pathMarkers.length) {
      const discHits = this.raycaster.intersectObjects(this.pathMarkers.map(m => m.mesh).filter(Boolean), false);
      if (discHits.length) {
        this._travelTo(discHits[0].object.userData.waypointIdx);
        return;
      }
    }

    const aHits = this.raycaster.intersectObjects(this.artworks.map(a => a.group), true);
    if (aHits.length) {
      let h = aHits[0].object;
      while (h.parent && !this.artworks.find(a => a.group === h)) h = h.parent;
      const art = this.artworks.find(a => a.group === h);
      if (art) { this._showArtworkPopup(art, this.artworks.indexOf(art), 'artwork'); return; }
    }

    const mHits = this.raycaster.intersectObjects(this.models3d.map(m => m.object), true);
    if (mHits.length) {
      let h = mHits[0].object;
      while (h.parent && !this.models3d.find(m => m.object === h)) h = h.parent;
      const mod = this.models3d.find(m => m.object === h);
      if (mod) { this._showArtworkPopup(mod, this.models3d.indexOf(mod), 'model'); return; }
    }

    document.getElementById('artwork-popup')?.classList.remove('open');
  }

  _onMouseMove(e) {
    if (!this.isLeftDown) return;
    const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this.didDrag = true;
    this.lastX = e.clientX; this.lastY = e.clientY;
    this.yaw   -= dx * 0.003; this.pitch -= dy * 0.003;
    this.pitch  = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.pitch));
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }

  // ─── View tracking ───────────────────────────────────────────────────────────
  async _trackView() {
    if (!this._galleryDbKey) return;
    const sessionKey = `viewed_${this._galleryDbKey}`;
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, '1');

    const { data } = await supabase
      .from('gallery_stats')
      .select('views')
      .eq('gallery_name', this._galleryDbKey)
      .maybeSingle();

    if (data) {
      await supabase.from('gallery_stats')
        .update({ views: (data.views || 0) + 1 })
        .eq('gallery_name', this._galleryDbKey);
    } else {
      await supabase.from('gallery_stats')
        .insert({ gallery_name: this._galleryDbKey, views: 1 });
    }
  }

  // ─── Like ────────────────────────────────────────────────────────────────────
  async _initLike() {
    const profile = this.manager.auth.profile;
    if (!profile || !this._galleryDbKey) return;
    const { data } = await supabase
      .from('gallery_likes')
      .select('id')
      .eq('user_id', profile.id)
      .eq('gallery_name', this._galleryDbKey)
      .maybeSingle();
    if (this._disposed) return;
    if (data) {
      this._liked = true;
      const btn = document.getElementById('btn-like');
      if (btn) {
        btn.innerHTML = '<img src="/icons/heart-filled.svg" style="width:18px;height:18px">';
        btn.classList.add('liked', 'active');
      }
    }
  }

  async _toggleLike() {
    const profile = this.manager.auth.profile;
    if (!this._galleryDbKey) return;
    if (!profile) { this._toast('Đăng nhập để thích phòng tranh', 'info', 2000); return; }

    const newLiked = !this._liked;
    this._liked = newLiked;
    const btn = document.getElementById('btn-like');
    btn.innerHTML = newLiked
      ? '<img src="/icons/heart-filled.svg" style="width:18px;height:18px">'
      : '<img src="/icons/heart-empty.svg"  style="width:18px;height:18px">';
    btn.classList.toggle('liked', newLiked);
    btn.classList.toggle('active', newLiked);

    let error;
    if (newLiked) {
      const res = await supabase.from('gallery_likes').upsert(
        { user_id: profile.id, gallery_name: this._galleryDbKey },
        { onConflict: 'user_id,gallery_name' }
      );
      error = res.error;
    } else {
      const res = await supabase.from('gallery_likes')
        .delete()
        .eq('user_id', profile.id)
        .eq('gallery_name', this._galleryDbKey);
      error = res.error;
    }

    if (error) {
      // Revert UI nếu DB thất bại
      this._liked = !newLiked;
      btn.innerHTML = !newLiked
        ? '<img src="/icons/heart-filled.svg" style="width:18px;height:18px">'
        : '<img src="/icons/heart-empty.svg"  style="width:18px;height:18px">';
      btn.classList.toggle('liked', !newLiked);
      btn.classList.toggle('active', !newLiked);
      console.error('[like] error:', error);
      this._toast('Không thể lưu lượt thích', 'error', 2500);
      return;
    }

    if (newLiked) this._toast('Đã thích phòng tranh này ♥', 'success', 2000);
    else this._toast('Đã bỏ thích', 'info', 1500);
  }

  lerpAngle(a, b, t) { let d = b - a; while (d > Math.PI) d -= Math.PI*2; while (d < -Math.PI) d += Math.PI*2; return a + d * t; }

  update(dt) {
    if (this.wpTravelTarget) {
      this.wpTravelT += 0.035;
      const et = this.wpTravelT < 1 ? this.wpTravelT*this.wpTravelT*(3-2*this.wpTravelT) : 1;
      this.camera.position.x = this.wpTravelFrom.x + (this.wpTravelTarget.x - this.wpTravelFrom.x)*et;
      this.camera.position.y = this.wpTravelFrom.y + (this.wpTravelTarget.y - this.wpTravelFrom.y)*et;
      this.camera.position.z = this.wpTravelFrom.z + (this.wpTravelTarget.z - this.wpTravelFrom.z)*et;
      this.yaw   = this.lerpAngle(this.wpTravelFrom.yaw, this.wpTravelTarget.yaw, et);
      this.pitch  = this.wpTravelFrom.pitch + (this.wpTravelTarget.pitch - this.wpTravelFrom.pitch)*et;
      this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
      if (this.wpTravelT >= 1) this.wpTravelTarget = null;
    } else {
      const speed = this._walkSpeed;
      const posY = this.camera.position.y;
      if (this.keys['ArrowLeft'])  { this.yaw += 1.5 * dt; this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ')); }
      if (this.keys['ArrowRight']) { this.yaw -= 1.5 * dt; this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ')); }
      this.moveDir.set(0,0,0);
      this.camera.getWorldDirection(this.fwd); this.fwd.y = 0; this.fwd.normalize();
      this.rgt.crossVectors(this.fwd, new THREE.Vector3(0,1,0)).normalize();
      if (this.keys['KeyW'] || this.keys['ArrowUp'])   this.moveDir.addScaledVector(this.fwd,  speed*dt);
      if (this.keys['KeyS'] || this.keys['ArrowDown']) this.moveDir.addScaledVector(this.fwd, -speed*dt);
      if (this.keys['KeyA']) this.moveDir.addScaledVector(this.rgt, -speed*dt);
      if (this.keys['KeyD']) this.moveDir.addScaledVector(this.rgt,  speed*dt);
      if (this.moveDir.lengthSq() > 0 && this.modelMeshes.length) {
        const MARGIN = 0.5;
        const nearDoor = this._isNearRoomDoor(this.camera.position);
        if (!nearDoor && Math.abs(this.moveDir.x) > 1e-6) {
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
    this._checkChestProximity();
    this._drawMinimap();
    this._updateCharacter(dt);
    this._updateRemotePlayers(dt);
  }

  _updateCharacter(dt) {
    if (!this._character) return;

    // --- Tính hướng mặt theo rawDir (local camera space), giống HTML reference ---
    const rawDir = new THREE.Vector3();
    if (this.keys['KeyW'] || this.keys['ArrowUp'])                rawDir.z -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown'])               rawDir.z += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft'])               rawDir.x -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight'])              rawDir.x += 1;

    if (rawDir.lengthSq() > 0 && this.wpTravelTarget === null) {
      // yaw + atan2(rawDir.x, rawDir.z): W→+π, S→0, A/←→-π/2, D/→→+π/2
      this._charAngle = this.yaw + Math.atan2(rawDir.x, rawDir.z);
    } else {
      // Khi đứng yên hoặc di chuyển waypoint: luôn xoay theo hướng camera
      this._charAngle = this.yaw + Math.PI;
    }

    // --- Smooth rotation ---
    let rotDelta = this._charAngle - this._character.rotation.y;
    while (rotDelta >  Math.PI) rotDelta -= Math.PI * 2;
    while (rotDelta < -Math.PI) rotDelta += Math.PI * 2;
    this._character.rotation.y += rotDelta * Math.min(1, 12 * dt);

    // --- Vị trí: raycast tránh xuyên tường ---
    this._charFwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this._charRay.set(this.camera.position, this._charFwd);
    this._charRay.far = 2.0;
    const wallHits = this.modelMeshes.length
      ? this._charRay.intersectObjects(this.modelMeshes, false)
      : [];
    const wallDist  = wallHits.length ? wallHits[0].distance : Infinity;
    const charDist  = Math.min(1.5, Math.max(0.2, wallDist - 0.35));

    this._character.position.copy(this.camera.position).addScaledVector(this._charFwd, charDist);
    this._character.position.y = this.floorY;

    // --- Animation ---
    const isMoving = rawDir.lengthSq() > 0 || this.wpTravelTarget !== null;
    if (isMoving !== this._charIsWalking) {
      this._charIsWalking = isMoving;
      if (isMoving) {
        if (this._charIdle) this._charIdle.fadeOut(0.2);
        if (this._charWalk) this._charWalk.reset().fadeIn(0.2).play();
      } else {
        if (this._charWalk) this._charWalk.fadeOut(0.2);
        if (this._charIdle) this._charIdle.reset().fadeIn(0.2).play();
      }
    }
    if (this._charMixer) this._charMixer.update(dt);
  }

  _loadCharacter() {
    this.gltfLoader.load('/character.glb', (gltf) => {
      this._character = gltf.scene;
      this._character.traverse(n => { if (n.isMesh) n.castShadow = true; });
      this.threeScene.add(this._character);

      if (!gltf.animations.length) return;
      this._charMixer = new THREE.AnimationMixer(this._character);

      for (const clip of gltf.animations) {
        const n = clip.name.toLowerCase();
        if (!this._charIdle && (n.includes('idle') || n.includes('stand'))) {
          this._charIdle = this._charMixer.clipAction(clip);
        }
        if (!this._charWalk && (n.includes('walk') || n.includes('run'))) {
          this._charWalk = this._charMixer.clipAction(clip);
        }
      }
      if (!this._charIdle) this._charIdle = this._charMixer.clipAction(gltf.animations[0]);

      this._charIdle.play();
    }, undefined, (err) => console.error('[character] load error', err));
  }

  /* ══════════════════════════════════════════════ CHEST ══════════════════════════════════════════════ */
  async _loadChests() {
    const roomId = this.manager.currentRoom?.id;
    if (!roomId) return;
    const { data, error } = await supabase.from('treasure_chests').select('*').eq('room_id', roomId);
    if (error || !data?.length) return;

    const userId = this.manager.auth.profile?.id;
    if (userId) {
      const { data: opens } = await supabase.from('chest_opens').select('chest_id').eq('user_id', userId);
      if (opens) opens.forEach(o => this._openedChestIds.add(o.chest_id));
    }

    const loader = new GLTFLoader();
    for (const row of data) {
      const chest = { id: row.id, question: row.question, answer: row.answer, token_amount: row.token_amount,
        pos_x: row.pos_x, pos_y: row.pos_y, pos_z: row.pos_z, mesh: null };
      this.chests.push(chest);
      await new Promise(resolve => {
        loader.load('/treasure/treasure_chest.glb', (gltf) => {
          if (this._disposed) { resolve(); return; }
          const mesh = gltf.scene;
          const box = new THREE.Box3().setFromObject(mesh);
          const sz = box.getSize(new THREE.Vector3());
          const baseScale = 0.6 / Math.max(sz.x, sz.y, sz.z);
          mesh.scale.setScalar(baseScale * (row.chest_scale > 0 ? row.chest_scale : 1.0));
          mesh.position.set(row.pos_x, row.pos_y, row.pos_z);
          mesh.rotation.y = row.rot_y || 0;
          chest.mesh = mesh;
          this.threeScene.add(mesh);
          if (this._openedChestIds.has(row.id)) {
            mesh.traverse(c => { if (c.isMesh) { const m = c.material.clone(); m.opacity = 0.35; m.transparent = true; c.material = m; } });
          }
          resolve();
        }, null, () => resolve());
      });
    }
  }

  _buildChestUI() {
    const hint = document.createElement('div');
    hint.id = 'vw-chest-hint';
    hint.textContent = 'Nhấn E để mở rương';
    hint.style.cssText = 'position:fixed;bottom:120px;left:50%;transform:translateX(-50%);background:rgba(15,13,12,.94);border:.5px solid #c8a96e;border-radius:4px;padding:8px 20px;color:#c8a96e;font-family:monospace;font-size:10px;letter-spacing:.14em;display:none;z-index:25;pointer-events:none;white-space:nowrap';
    document.body.appendChild(hint);
    this._el(hint);

    const popup = document.createElement('div');
    popup.id = 'vw-chest-popup';
    popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:100;display:none;align-items:center;justify-content:center';
    popup.innerHTML = `
      <div style="background:rgba(15,13,12,.97);border:.5px solid rgba(200,169,110,.5);border-radius:6px;padding:28px;min-width:340px;max-width:480px;font-family:monospace;display:flex;flex-direction:column;gap:14px">
        <div style="display:flex;align-items:center;gap:12px">
          <span style="font-size:28px">🗝</span>
          <div>
            <div style="color:#c8a96e;font-size:14px;letter-spacing:.06em">Rương Kho Báu</div>
            <div id="vwc-reward" style="color:#7a6e5c;font-size:9px;letter-spacing:.08em;margin-top:2px"></div>
          </div>
        </div>
        <div id="vwc-question" style="color:#d4c5a9;font-size:12px;line-height:1.7;border-left:2px solid rgba(200,169,110,.35);padding-left:12px"></div>
        <input id="vwc-answer" type="text" placeholder="Nhập đáp án..."
          style="width:100%;background:rgba(20,18,14,.8);border:.5px solid rgba(212,197,169,.3);color:#d4c5a9;font-family:monospace;font-size:12px;padding:8px 10px;border-radius:3px;outline:none;box-sizing:border-box">
        <div id="vwc-msg" style="font-size:9px;letter-spacing:.08em;min-height:12px;color:#b54a3a"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button id="vwc-cancel" style="padding:7px 14px;font-size:11px;cursor:pointer;background:rgba(20,18,14,.85);color:#7a6e5c;border:.5px solid rgba(212,197,169,.2);border-radius:3px;font-family:monospace">Đóng</button>
          <button id="vwc-submit" style="padding:7px 16px;font-size:11px;cursor:pointer;background:rgba(200,169,110,.18);color:#c8a96e;border:.5px solid rgba(200,169,110,.5);border-radius:3px;font-family:monospace">Mở rương ✦</button>
        </div>
      </div>
    `;
    document.body.appendChild(popup);
    this._el(popup);

    document.getElementById('vwc-cancel').addEventListener('click', () => {
      popup.style.display = 'none';
      this._chestPopupOpen = false;
      document.getElementById('vwc-answer').value = '';
      document.getElementById('vwc-msg').textContent = '';
    });
    document.getElementById('vwc-submit').addEventListener('click', () => this._submitChestAnswer());
    document.getElementById('vwc-answer').addEventListener('keydown', e => { if (e.key === 'Enter') this._submitChestAnswer(); });
  }

  _openChestPopup(chest) {
    if (!this.manager.auth.isLoggedIn) { this._toast('Đăng nhập để mở rương', 'info'); return; }
    if (this._openedChestIds.has(chest.id)) { this._toast('Bạn đã mở rương này rồi', 'info'); return; }
    this._activeChest = chest;
    this._chestPopupOpen = true;
    document.getElementById('vwc-question').textContent = chest.question;
    document.getElementById('vwc-reward').textContent = `Phần thưởng: ${chest.token_amount} ⭐ Ngôi Sao`;
    document.getElementById('vwc-answer').value = '';
    document.getElementById('vwc-msg').textContent = '';
    document.getElementById('vw-chest-popup').style.display = 'flex';
    setTimeout(() => document.getElementById('vwc-answer').focus(), 80);
  }

  async _submitChestAnswer() {
    const input = document.getElementById('vwc-answer').value.trim();
    const chest = this._activeChest;
    if (!input || !chest) return;
    if (input.toLowerCase() !== chest.answer.toLowerCase()) {
      document.getElementById('vwc-msg').textContent = 'Đáp án chưa đúng, thử lại nhé!';
      return;
    }
    const btn = document.getElementById('vwc-submit');
    btn.textContent = '⏳...'; btn.disabled = true;
    const userId = this.manager.auth.profile.id;
    let { error: oe } = await supabase.from('chest_opens').insert({ chest_id: chest.id, user_id: userId });
    if (oe?.code === '23503') {
      // Profile chưa có trên Supabase, upsert trước rồi thử lại
      await this.manager.auth._upsertToSupabase(this.manager.auth.profile);
      const retry = await supabase.from('chest_opens').insert({ chest_id: chest.id, user_id: userId });
      oe = retry.error;
    }
    if (oe && oe.code !== '23505') {
      console.error('[chest] chest_opens insert error:', oe);
      btn.textContent = 'Mở rương ✦'; btn.disabled = false;
      this._toast(`Có lỗi xảy ra (${oe.code}: ${oe.message})`, 'error'); return;
    }
    const { data: pf, error: pfe } = await supabase.from('profiles').select('token_balance').eq('id', userId).single();
    if (pfe) console.error('[chest] profiles select error:', pfe);
    const newBal = (pf?.token_balance || 0) + chest.token_amount;
    const { error: upe } = await supabase.from('profiles').update({ token_balance: newBal }).eq('id', userId);
    if (upe) console.error('[chest] profiles update error:', upe);
    if (this.manager.auth.profile) this.manager.auth.profile.token_balance = newBal;
    this._openedChestIds.add(chest.id);
    if (chest.mesh) {
      chest.mesh.traverse(c => { if (c.isMesh) { const m = c.material.clone(); m.opacity = 0.35; m.transparent = true; c.material = m; } });
    }
    document.getElementById('vw-chest-popup').style.display = 'none';
    this._chestPopupOpen = false;
    this._nearChest = null;
    const hintEl = document.getElementById('vw-chest-hint');
    if (hintEl) hintEl.style.display = 'none';
    this._updateTokenDisplay();
    this._toast(`+${chest.token_amount} ⭐ Ngôi Sao! Rương đã được mở`, 'success', 4000);
  }

  _updateTokenDisplay() {
  if (!this.manager.auth.isLoggedIn) return;
  const balance = this.manager.auth.profile?.token_balance ?? 0;
  
  // Dùng element mới trong logo-area thay vì topbar-right
  const el = document.getElementById('vw-token-display-top');
  if (el) {
    el.style.display = 'flex';
    el.style.marginLeft = '160px';
    el.onclick = () => this.manager.navigateTo('profile');
  }
  const valEl = document.getElementById('vw-token-val');
  if (valEl) valEl.textContent = balance.toLocaleString('vi-VN');
}
  _checkChestProximity() {
    if (!this.chests.length || this._chestPopupOpen) return;
    const cam = this.camera.position;
    let near = null;
    for (const c of this.chests) {
      if (this._openedChestIds.has(c.id)) continue;
      const dx = cam.x - c.pos_x, dz = cam.z - c.pos_z;
      if (dx * dx + dz * dz < 6.25) { near = c; break; }
    }
    this._nearChest = near;
    const el = document.getElementById('vw-chest-hint');
    if (el) el.style.display = near ? 'block' : 'none';
  }

  /* ══════════════════════════════════════════════ MULTIPLAYER ══════════════════════════════════════════════ */

  _getMyPos() {
    return { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z };
  }

  _makeNameSprite(name) {
    const W = 256, H = 56;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(4, 4, W - 8, H - 8, 8);
    } else {
      ctx.rect(4, 4, W - 8, H - 8);
    }
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = name.length > 16 ? name.slice(0, 14) + '…' : name;
    ctx.fillText(label, W / 2, H / 2);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.4, 0.31, 1);
    sprite.renderOrder = 999;
    return sprite;
  }

  _spawnRemotePlayer(uid, name, pos, yaw) {
    if (this._remotePlayers[uid]) return;
    const safePos = pos || { x: 0, y: 0, z: 0 };
    const safeYaw = yaw || 0;
    const rp = {
      name,
      mesh: null, mixer: null, idle: null, walk: null, isWalking: false,
      targetPos:  new THREE.Vector3(safePos.x, this.floorY, safePos.z),
      currentPos: new THREE.Vector3(safePos.x, this.floorY, safePos.z),
      targetYaw: safeYaw, currentYaw: safeYaw,
      nameSprite: null,
    };
    this._remotePlayers[uid] = rp;

    const sprite = this._makeNameSprite(name);
    sprite.position.set(safePos.x, this.floorY + 2.2, safePos.z);
    this.threeScene.add(sprite);
    rp.nameSprite = sprite;

    this.gltfLoader.load('/character.glb', (gltf) => {
      if (this._disposed || !this._remotePlayers[uid]) return;
      const mesh = gltf.scene;
      mesh.traverse(n => { if (n.isMesh) n.castShadow = true; });
      mesh.position.set(safePos.x, this.floorY, safePos.z);
      mesh.rotation.y = safeYaw + Math.PI;
      this.threeScene.add(mesh);
      rp.mesh = mesh;

      if (gltf.animations.length) {
        const mixer = new THREE.AnimationMixer(mesh);
        rp.mixer = mixer;
        for (const clip of gltf.animations) {
          const n = clip.name.toLowerCase();
          if (!rp.idle && (n.includes('idle') || n.includes('stand'))) rp.idle = mixer.clipAction(clip);
          if (!rp.walk && (n.includes('walk') || n.includes('run')))   rp.walk = mixer.clipAction(clip);
        }
        if (!rp.idle) rp.idle = mixer.clipAction(gltf.animations[0]);
        rp.idle.play();
      }
    }, undefined, (err) => console.warn('[remote-player] load error', err));
  }

  _removeRemotePlayer(uid) {
    const rp = this._remotePlayers[uid];
    if (!rp) return;
    if (rp.mesh)       this.threeScene.remove(rp.mesh);
    if (rp.nameSprite) this.threeScene.remove(rp.nameSprite);
    delete this._remotePlayers[uid];
  }

  _updateRemotePlayerTarget(uid, pos, yaw, isWalking) {
    const rp = this._remotePlayers[uid];
    if (!rp) return;
    rp.targetPos.set(pos.x, this.floorY, pos.z);
    rp.targetYaw = yaw;
    const wasWalking = rp.isWalking;
    rp.isWalking = !!isWalking;
    if (rp.mixer && wasWalking !== rp.isWalking) {
      if (rp.isWalking) {
        if (rp.idle) rp.idle.fadeOut(0.2);
        if (rp.walk) rp.walk.reset().fadeIn(0.2).play();
      } else {
        if (rp.walk) rp.walk.fadeOut(0.2);
        if (rp.idle) rp.idle.reset().fadeIn(0.2).play();
      }
    }
  }

  _updateRemotePlayers(dt) {
    const LERP = Math.min(1, 10 * dt);
    for (const rp of Object.values(this._remotePlayers)) {
      rp.currentPos.lerp(rp.targetPos, LERP);
      let dy = rp.targetYaw - rp.currentYaw;
      while (dy >  Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      rp.currentYaw += dy * LERP;
      if (rp.mesh) {
        rp.mesh.position.copy(rp.currentPos);
        rp.mesh.rotation.y = rp.currentYaw + Math.PI;
      }
      if (rp.nameSprite) {
        rp.nameSprite.position.set(rp.currentPos.x, rp.currentPos.y + 2.2, rp.currentPos.z);
      }
      if (rp.mixer) rp.mixer.update(dt);
    }
  }

  _initMultiplayer() {
    const roomId = this.manager.currentRoom?.id;
    if (!roomId) return;
    const profile = this.manager.auth.profile;
    const userId  = profile?.id;
    if (!userId) return;
    const displayName = profile?.display_name || profile?.name || 'Khách';

    this._mpChannel = supabase.channel(`viewer-room-${roomId}`, {
      config: { presence: { key: String(userId) } }
    });

    this._mpChannel
      .on('presence', { event: 'sync' }, () => {
        const state = this._mpChannel.presenceState();
        for (const [uid, presences] of Object.entries(state)) {
          if (uid === String(userId)) continue;
          const p = presences[0];
          if (p && !this._remotePlayers[uid]) {
            this._spawnRemotePlayer(uid, p.name, p.pos, p.yaw);
          }
        }
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        if (key === String(userId)) return;
        const p = newPresences[0];
        if (p && !this._remotePlayers[key]) {
          this._spawnRemotePlayer(key, p.name, p.pos, p.yaw);
        }
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        this._removeRemotePlayer(key);
      })
      .on('broadcast', { event: 'mp-move' }, ({ payload }) => {
        const { uid, pos, yaw, isWalking } = payload;
        if (uid === String(userId)) return;
        if (this._remotePlayers[uid]) {
          this._updateRemotePlayerTarget(uid, pos, yaw, isWalking);
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await this._mpChannel.track({ name: displayName, pos: this._getMyPos(), yaw: this.yaw });
        }
      });

    this._mpBroadcastInterval = setInterval(() => {
      if (!this._mpChannel) return;
      this._mpChannel.send({
        type: 'broadcast',
        event: 'mp-move',
        payload: { uid: String(userId), pos: this._getMyPos(), yaw: this.yaw, isWalking: this._charIsWalking },
      });
    }, 100);
  }

  _isTyping() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
  }

  dispose() {
    if (this._mpBroadcastInterval) { clearInterval(this._mpBroadcastInterval); this._mpBroadcastInterval = null; }
    if (this._mpChannel) { supabase.removeChannel(this._mpChannel); this._mpChannel = null; }
    for (const uid of Object.keys(this._remotePlayers)) this._removeRemotePlayer(uid);
    super.dispose();
  }
}