import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { supabase, STORAGE_BUCKET, compressImage, toCDN } from '../utils/supabase.js';
import { BaseScene } from './BaseScene.js';
import { TextEditor } from './TextEditor.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { MissionBuilder } from './MissionBuilder.js';
import { ViewerSpawn } from './ViewerSpawn.js';

const STUDIO_TIPS = [
  'Đang mở studio sáng tạo của bạn...',
  'Tip: Bạn cũng có thể treo tranh lên trần nhà đấy.',
  'Tip: Hãy luôn chọn vật thể trước khi điều chỉnh nhé.',
  'Bạn có thể chỉnh độ sáng của căn phòng bất cứ lúc nào.',
  'Tip: Hãy đặt tác phẩm quan trọng ở nơi người xem dễ nhìn thấy đầu tiên.',
  'Đang tải mô hình 3D và công cụ xây dựng...',
  'Tip: Lộ trình giúp dẫn người xem đi theo đúng lộ trình bạn muốn.',
  'Bạn có thể thêm nhạc nền cho gallery của mình.',
  'Tip: Đừng đặt quá nhiều artwork sát nhau.',
  'Đang đồng bộ texture và vật thể trong không gian...',
  'Tip: Thử dùng vật thể trang trí để làm không gian sinh động hơn.',
  'Bạn có thể tăng hoặc giảm độ sáng để dễ quan sát artwork hơn.',
  'Tip: Một căn phòng dễ di chuyển sẽ tạo trải nghiệm tốt hơn cho visitor.',
  'Đang chuẩn bị không gian triển lãm của bạn...',
  'Tip: Quan sát minimap để biết mình đang ở đâu.',
  'Autosave đang tự động lưu thay đổi của bạn.',
  'Tip: Hãy xem thử gallery ở nhiều góc khác nhau trước khi xuất bản.',
  'Bạn có thể thêm tường ngăn để chia không gian triển lãm.',
  'Tip: Nhạc nền nhẹ thường giúp người xem ở lại lâu hơn.',
  'Bạn còn có thể điều chỉnh tốc độ di chuyển của visitor.',
  'Mỗi gallery đều có thể mang phong cách hoàn toàn riêng biệt.',
  'Cho thêm cảnh vật bên ngoài sẽ giúp căn phòng của bạn sinh động hơn đấy.',
  'Bạn thích sơn tường chứ?',
  'Tip: Bạn có thể tải ảnh và sticker lên thumbnail của bạn.',
  'Nếu có điều gì băn khoăn, bạn có thể chat cùng đội ngũ của Creatory.',
  'Nếu file video nặng quá, bạn cũng có thể nhúng link URL.',
  'Nhớ lưu mọi thay đổi trước khi thoát trang nhé.',
  'Nếu bạn không thấy ai ghé thăm phòng, hãy thử kiểm tra xem mình đã xuất bản phòng chưa.',
  'Thêm bộ câu đố thú vị về phòng của bạn sẽ giúp visitor ở lại lâu hơn.',
  'Nếu tác phẩm chỉ để trưng bày và không bán, bạn không cần điền gì trong phần giá tiền đâu.',
];

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
    const _studioUserId = this.manager.auth.user?.id;
    if (this.manager.currentRoom) {
      // Vào từ in-app navigation — kiểm tra ownership
      if (!_studioUserId || !this.manager.currentRoom.id.startsWith(_studioUserId + ':::')) {
        this.manager.currentRoom = null;
        this.manager.navigateTo('dashboard'); return;
      }
    } else {
      // Vào từ URL trực tiếp
      const _urlRoomId = new URLSearchParams(location.search).get('room');
      if (_urlRoomId) {
        const roomId = decodeURIComponent(_urlRoomId);
        if (!_studioUserId || !roomId.startsWith(_studioUserId + ':::')) {
          this.manager.navigateTo('dashboard'); return;
        }
        const { data } = await supabase.from('gallery').select('name, scene_data').eq('name', roomId).limit(1);
        const meta = data?.[0]?.scene_data?._meta || {};
        this.manager.currentRoom = { id: roomId, name: meta.roomName || null, artistId: _studioUserId, isPublished: !!meta.isPublished };
      } else {
        this.manager.navigateTo('dashboard'); return;
      }
    }

    /* ── Scene ── */
    new RGBELoader().load('/hdr/kloofendal_48d_partly_cloudy_puresky_4k.hdr', (texture) => {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const envMap = pmrem.fromEquirectangular(texture).texture;
      this.threeScene.background = envMap;
      texture.dispose();
      pmrem.dispose();
    });

    /* ── Đèn (giá trị mặc định) ── */
    this.ambLight  = new THREE.AmbientLight(0xffffff, 1.2);
    this.hemiLight = new THREE.HemisphereLight(0xffe8c0, 0x3a2e20, 0.5);
    this.dirLight  = new THREE.DirectionalLight(0xffffff, 1.2);
    this.dirLight.position.set(5, 10, 5); this.dirLight.castShadow = true;
    this.threeScene.add(this.ambLight, this.hemiLight, this.dirLight);

    /* ── Load phòng GLB ── */
    this.modelMeshes = [];
    this._showLoadingScreen(undefined, STUDIO_TIPS);
    await this._loadRoomGLB();

    if (this._disposed) return;

    /* ── State ── */
    this.selectedTemplate = 'scene.glb';
    this.artworks       = [];
    this.models3d       = [];
    // Danh sách tác phẩm đã upload trong session (ảnh, video, model 3D)
    // Mỗi phần tử: { type: 'image'|'video'|'model', label, src, thumb? }
    this._uploadedSources = [];
    this.backgroundMusic  = null;
    this.isMusicPlaying   = false;
    this._musicPlaylist   = [];   // [{ url, name }]
    this._musicIndex      = 0;
    this.selectedSource = null;
    this.selectedItem   = null;
    this.frameMat       = new THREE.MeshLambertMaterial({ color: 0x182D58 });
    this.dracoLoader    = new DRACOLoader();
    this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    this.gltfLoader     = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
    this.objLoader      = new OBJLoader();
    this.mode           = 'select';
    this._undoStack     = [];
    this._redoStack     = [];
    this._usePedestal   = true;
    this.chests          = [];
    this._chestPlacingMode = false;
    this._pendingChestPos  = null;
    this.viewerSpawn     = new ViewerSpawn(this);

    /* ── Interior Walls ── */
    this.interiorWalls    = [];   // { group, frontMesh, backMesh, edgeMesh, width, height, thickness, frontColor, backColor, frontWallpaper, backWallpaper }
    this._wallPlacingMode = false;

    /* ── Mission system ── */
    this._missionData              = [];
    this._hiddenObjPlaceMissionIdx = -1;
    this._hiddenObjPlaceEggIdx     = -1;
    this._hiddenObjPlaceCallback   = null;
    this.missionBuilder            = new MissionBuilder(this);

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
    this.textEditor.onTextsChanged = () => this._renderTextList();

    /* ── Xây giao diện ── */
    this._injectCSS();
    this._buildLogo();
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
    this._buildWallPanel();
    this._buildWaypointElements();
    this._injectWaypointCSS();
    this._buildStudioTopBar();
    this._buildSaveSuccessModal();
    this._buildSecondaryToolbar()
    this._buildMinimap();  
    this._buildStudioLeftBtns();
    this._bindControls();

    /* ── Sự kiện ── */
    this._on(this.renderer.domElement, 'click',     (e) => this._onCanvasClick(e));
    this._on(this.renderer.domElement, 'dblclick',  (e) => {
      if (this.mode !== 'select') return;
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.mouse.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const hits = this.raycaster.intersectObjects(this.artworks.map(a => a.group), true);
      if (!hits.length) return;
      let h = hits[0].object; while (h.parent && !this.artworks.find(a => a.group === h)) h = h.parent;
      const aw = this.artworks.find(a => a.group === h);
      if (aw?.isYouTube && aw.youtubeId) this._showYouTubeOverlay(aw.youtubeId);
    });
    this._on(this.renderer.domElement, 'mousedown', (e) => { if (e.button === 0) { this.isLeftDown = true; this.didDrag = false; this.lastX = e.clientX; this.lastY = e.clientY; if (this.selectedItem && ['translate', 'rotate', 'scale'].includes(this.mode)) this._saveUndoState(); } });
    this._on(window, 'mouseup', (e) => { if (e.button === 0) { this.isLeftDown = false; if (this.didDrag && this.selectedItem && ['translate', 'rotate', 'scale'].includes(this.mode)) { this._triggerAutosave(); if (this.selectedItem.type === 'egg') { this._syncEggTransform(); this.missionBuilder.saveMissionsSilent(); } } } });
    this._on(this.renderer.domElement, 'mousemove', (e) => this._onMouseMove(e));
    this._on(document, 'keydown', (e) => {
      if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') return;
      this.keys[e.code] = true;
    });
    this._on(document, 'keyup', (e) => {
      if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') return;
      this.keys[e.code] = false;
    });


    /* ── Khi F5 / reload / đóng tab: nếu còn timer autosave đang chờ thì cảnh báo ── */
    this._beforeUnloadHandler = (e) => {
      if (this._autosaveEnabled && this._autosaveTimer) {
        e.preventDefault();
        e.returnValue = 'Phòng tranh của bạn có thay đổi chưa được lưu. Bạn có muốn rời đi không?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', this._beforeUnloadHandler);

    /* ── Waypoint hover ── */
    this._setupWaypointHover();

    await this.loadGallery();
    this._hideLoadingScreen();

    // Load egg 3D previews vào scene ngay khi init (không cần mở panel Mission)
    if (this.manager.currentRoom?.id) {
      this.missionBuilder.loadEggsIntoScene(this.manager.currentRoom.id);
    }
  }

  _buildLogo() {
    const img = document.createElement('img');
    img.src = '/icons/logo.svg';
    img.alt = 'CREATORY';
    img.style.cssText = 'position:fixed;top:16px;left:20px;height:32px;cursor:pointer;opacity:0.85;transition:opacity 0.2s;z-index:100;';
    img.addEventListener('mouseenter', () => img.style.opacity = '1');
    img.addEventListener('mouseleave', () => img.style.opacity = '0.85');
    img.addEventListener('click', () => {
      // Nếu đang có thay đổi chưa lưu (timer còn chờ) → lưu trước rồi mới về landing
      if (this._autosaveEnabled && this._autosaveTimer) {
        this._saveAndLeave(() => this.manager.navigateTo('landing'));
      } else {
        this.manager.navigateTo('landing');
      }
    });
    document.body.appendChild(img);
    this._el(img);
  }

  /* ══════════════════════════════════════════════ CSS ══════════════════════════════════════════════ */
  _injectCSS() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@700&display=swap';
    document.head.appendChild(link);
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500&display=swap');
      *{box-sizing:border-box}
      .tb-btn{padding:7px 14px;font-size:12px;cursor:pointer;background:rgba(20,18,14,.85);color:#d4c5a9;border:1px solid rgba(212,197,169,.3);border-radius:3px;font-family:monospace;letter-spacing:.06em;transition:all .2s}
      .tb-btn:hover,.tb-btn.active{background:rgba(200,169,110,.25);border-color:#c8a96e;color:#fff}
      .hud-btn{padding:5px 10px;font-size:11px;cursor:pointer;font-family:monospace;background:rgba(212,197,169,.08);color:#d4c5a9;border:1px solid rgba(212,197,169,.2);border-radius:2px;transition:all .15s}
      .hud-btn:hover{background:rgba(212,197,169,.2);color:#fff}
      .hud-btn.danger:hover{background:rgba(181,74,58,.3);border-color:rgba(181,74,58,.6);color:#ffaaaa}
      .uth.sel,.model-th.sel{border-color:#c8a96e!important}
      #toast{position:fixed;bottom:50px;left:50%;transform:translateX(-50%) translateY(20px);background:rgba(24,45,88,.96);border:.5px solid rgba(133,212,231,.3);color:#FFFFFF;font-size:9px;letter-spacing:.14em;text-transform:uppercase;padding:8px 18px;border-radius:3px;pointer-events:none;opacity:0;transition:opacity .3s,transform .3s;z-index:50;white-space:nowrap}
      #toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
      #toast.success{background:#6aaa7a;border-color:#CFFFDB;color:#CFFFDB}
      #toast.error{background:#b54a3a;border-color:#FFDDD8;color:#FFDDD8}
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

      /* ── Save-success modal (hiện khi bấm Preview) ── */
      #save-success-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);z-index:10000;display:none;align-items:center;justify-content:center;animation:ssOverlayIn .25s ease}
      #save-success-overlay.open{display:flex}
      @keyframes ssOverlayIn{from{opacity:0}to{opacity:1}}
      #save-success-card{background:#182D58;border:1px solid rgba(133,212,231,.5);border-radius:10px;padding:36px 48px;display:flex;flex-direction:column;align-items:center;gap:14px;box-shadow:0 16px 48px rgba(0,0,0,.6);animation:ssCardIn .3s cubic-bezier(.34,1.56,.64,1);font-family:monospace;min-width:320px;text-align:center}
      @keyframes ssCardIn{from{transform:scale(.78);opacity:0}to{transform:scale(1);opacity:1}}
      #save-success-icon{font-size:40px;line-height:1;animation:ssIconBounce .5s cubic-bezier(.34,1.56,.64,1) .1s both}
      @keyframes ssIconBounce{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}
      #save-success-title{color:#85d4e7;font-size:13px;letter-spacing:.2em;text-transform:uppercase;font-weight:700}
      #save-success-msg{color:rgba(133,212,231,.8);font-size:10px;letter-spacing:.1em;line-height:1.7}
      #save-success-progress-wrap{width:100%;height:2px;background:rgba(133,212,231,.15);border-radius:2px;overflow:hidden;margin-top:4px}
      #save-success-progress{height:100%;width:100%;background:linear-gradient(90deg,#3a6abf,#85d4e7);border-radius:2px;transform-origin:left;animation:ssProgress 1.6s linear forwards}
      @keyframes ssProgress{from{transform:scaleX(1)}to{transform:scaleX(0)}}
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
      .ccfg{background:linear-gradient(180deg,rgba(118,170,171,1),rgba(35,92,208,0.5));border:none;border-radius:12px;padding:20px;display:flex;flex-direction:column;gap:12px;min-width:320px;font-family:'Montserrat',sans-serif}
      .ccfg h3{color:#FFFFFF;font-size:14px;margin:0;font-family:'Montserrat',sans-serif}
      .ccfg label{color:#FFFFFF;font-size:11px;letter-spacing:.1em;text-transform:uppercase;display:block;margin-bottom:4px;font-family:'Montserrat',sans-serif}
      .ccfg input,.ccfg textarea{background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);color:#FFFFFF;font-family:'Montserrat',sans-serif;font-size:13px;padding:6px 8px;border-radius:4px;outline:none;width:100%;box-sizing:border-box}
      .ccfg textarea{resize:vertical;min-height:60px}
      css.ccfg input::placeholder,.ccfg textarea::placeholder{color:rgba(255,255,255,0.6);}
      #minimap-wrap { position:relative; background:transparent; border:none; backdrop-filter:none; }
      #minimap-canvas-wrap { position:relative; overflow:hidden; width:96px; height:96px; transition:width .3s cubic-bezier(.4,0,.2,1), height .3s cubic-bezier(.4,0,.2,1); transform-origin:bottom left; }
      #minimap-wrap.expanded #minimap-canvas-wrap { width:200px; height:200px; }
      #minimap-wrap.expanded { width:200px; }
      #minimap-wrap { width:96px; }
      #minimap-bg-svg { position:absolute; top:0; left:0; width:100%; height:100%; display:block; object-fit:fill; pointer-events:none; z-index:0; }
      #minimap-canvas { position:relative; z-index:1; display:block; width:100%; height:100%; }
      #studio-topbar {
        position:fixed; top:0; left:0; right:0; height:65px;
        display:flex; align-items:center; justify-content:flex-start;
        gap:10px; z-index:25; pointer-events:none;
        padding:0 20px 0 200px;
      }
      #studio-topbar > * { pointer-events:auto; }
      #studio-room-name-wrap {
        display:inline-flex; align-items:center;
        background:none; border:none; position:relative;
      }
      #studio-room-name-icon { display:none; }
      #studio-room-name-bg { display:block; height:30px !important; pointer-events:none; }
      #studio-room-name-input {
        position:absolute; inset:0;
        background:transparent; border:none; outline:none;
        color:#d4c5a9; font-family:monospace; font-size:12px;
        letter-spacing:.06em; text-align:center;
        padding:0 16px; width:100%; height:100%; cursor:text;
      }
      #studio-room-name-input::placeholder { color:rgba(255, 255, 255, 0.4); }
      #studio-room-name-bg { display:block; height:auto; pointer-events:none; }
      #studio-draft-badge { background:none; border:none; padding:0; cursor:default; }
      #studio-draft-badge img { display:block; height:30px !important; }
      #studio-autosave-wrap {
        height:30px !important;
        display:flex; align-items:center; gap:0;
        background:none; border:none; padding:0; position:relative; cursor:pointer;
      }
      #studio-autosave-bg { display:block; height:30px !important; pointer-events:none; }
      #studio-autosave-label { display:none; }
      .studio-toggle {
        position:absolute; right:10px; top:50%; transform:translateY(-50%);
        width:32px; height:18px; flex-shrink:0;
      }
      .studio-toggle input { opacity:0; width:0; height:0; position:absolute; }
      .studio-toggle-slider {
        position:absolute; inset:0; background:rgba(80,80,80,.6);
        border:.5px solid rgba(212,197,169,.2); border-radius:18px; transition:all .25s; cursor:pointer;
      }
      .studio-toggle-slider::before {
        content:''; position:absolute; width:12px; height:12px;
        left:2px; top:2px; background:#7a6e5c; border-radius:50%; transition:all .25s;
      }
      .studio-toggle input:checked + .studio-toggle-slider { background:rgba(200,169,110,.5); border-color:#c8a96e; }
      .studio-toggle input:checked + .studio-toggle-slider::before { transform:translateX(14px); background:#c8a96e; }
      .studio-top-btn {
        background:none; border:none; padding:0; cursor:pointer;
        transition:filter .2s, transform .2s; display:block;
      }
      .studio-top-btn:hover { filter:brightness(1.15); transform:scale(1.06); }
      .studio-top-btn img { display:block; height:40px !important; pointer-events:none; }
      .studio-side-btn:hover::after {
        content:attr(data-title);
        position:absolute; left:calc(100% + 10px); top:50%; transform:translateY(-50%);
        background:#122F6A; color:#FFFFFF;
        font-family:'Montserrat', sans-serif; font-size:9px; letter-spacing:.1em;
        padding:4px 10px; border:.5px solid rgba(255,255,255,.2);
        border-radius:3px; white-space:nowrap; pointer-events:none; z-index:50;
      }
      #studio-left-btns {
        position:fixed; left:20px; top:296px;
        display:flex; flex-direction:column; gap:10px; z-index:20;
      }
      .studio-side-btn {
        position:relative; cursor:pointer; display:flex; align-items:center; justify-content:center;
        width:40px; height:40px; transition:transform .2s, filter .2s;
      }
      .studio-side-btn:hover { transform:scale(1.1); filter:brightness(1.2); }
      .studio-side-btn img { width:40px; height:40px; display:block; }
      #studio-settings-panel {
        position:fixed; left:70px; top:300px; transform:none;
        width:220px; background: linear-gradient(180deg, rgba(118,170,171,1), rgba(35,92,208,0.5));
        border:.5px solid rgba(212,197,169,.2); border-radius:6px;
        display:none; flex-direction:column; gap:12px;
        padding:14px; z-index:30;
        box-shadow:0 8px 32px rgba(0,0,0,.5);
      }
      #studio-settings-panel.open { display:flex; }
      #ssp-title { font-family:monospace; font-size:10px; letter-spacing:.1em; color:rgb(255, 255, 255); }
      .ssp-label { color: rgb(255, 255, 255); }
      .ssp-val   { color: rgb(255, 255, 255); }
      .stb2-btn .btn-icon.active { display: none; }
      .stb2-btn .btn-icon.normal { display: inline-flex; }
      .stb2-btn.activated .btn-icon.normal { display: none; }
      .stb2-btn.activated .btn-icon.active { display: inline-flex; }
      #pop-price::placeholder {
        color: rgba(255, 255, 255, 0.72);
        font-style: italic;
      }
  `;
    document.head.appendChild(style);
    this._el(style);
  }

  /* ══════════════════════════════════════════════ TOOLBAR ══════════════════════════════════════════════ */
  _buildToolbar() {
    const gradBar = document.createElement('div');
    gradBar.style.cssText = 'position:fixed;top:0;left:0;right:0;height:120px;background:url(\'/icons/gradient.svg\') repeat-x top center;background-size:auto 120px;z-index:9;pointer-events:none;';
    document.body.appendChild(gradBar);
    this._el(gradBar);
    
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

  /* ══════════════════════════════════════════════ SAVE SUCCESS MODAL ══════════════════════════════════════════════ */
  _buildSaveSuccessModal() {
    const overlay = document.createElement('div');
    overlay.id = 'save-success-overlay';
    overlay.innerHTML = `
      <div id="save-success-card">
        <div id="save-success-icon">✅</div>
        <div id="save-success-title">Đã lưu thành công!</div>
        <div id="save-success-msg">
          Phòng tranh của bạn đã được lưu.<br>
          Đang mở chế độ xem trước…
        </div>
        <div id="save-success-progress-wrap">
          <div id="save-success-progress"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    this._el(overlay);
  }

  async _showSaveSuccessModal() {
    const overlay = document.getElementById('save-success-overlay');
    if (!overlay) return;
    // Reset animation bằng cách clone và thay thế progress bar
    const prog = overlay.querySelector('#save-success-progress');
    if (prog) {
      const fresh = prog.cloneNode(true);
      prog.parentNode.replaceChild(fresh, prog);
    }
    overlay.classList.add('open');
    // Chờ animation progress bar chạy xong (1.6s) + buffer nhỏ
    await new Promise(resolve => setTimeout(resolve, 1750));
    overlay.classList.remove('open');
  }

  /**
   * Hiện modal "đang lưu" trong khi chờ saveGallery() xong, rồi gọi callback.
   * Dùng cho logo click (về homepage) — không cần đợi animation kết thúc,
   * chỉ cần đảm bảo save xong rồi mới đi.
   */
  async _saveAndLeave(afterSaveFn) {
    const overlay = document.getElementById('save-success-overlay');
    // Cập nhật nội dung modal thành "đang lưu"
    if (overlay) {
      const icon  = overlay.querySelector('#save-success-icon');
      const title = overlay.querySelector('#save-success-title');
      const msg   = overlay.querySelector('#save-success-msg');
      const prog  = overlay.querySelector('#save-success-progress');
      if (icon)  icon.textContent  = '💾';
      if (title) title.textContent = 'Đang lưu phòng tranh…';
      if (msg)   msg.innerHTML     = 'Vui lòng chờ trong giây lát.<br>Chúng tôi đang lưu mọi thay đổi của bạn.';
      // Reset progress animation
      if (prog) {
        const fresh = prog.cloneNode(true);
        // Đặt animation-duration dài hơn để khớp thời gian save thực tế
        fresh.style.animationDuration = '3s';
        prog.parentNode.replaceChild(fresh, prog);
      }
      overlay.classList.add('open');
    }

    // Huỷ debounce timer nếu còn đang chờ, lưu ngay
    if (this._autosaveTimer) {
      clearTimeout(this._autosaveTimer);
      this._autosaveTimer = null;
    }
    await this.saveGallery();

    // Cập nhật modal thành "đã lưu xong"
    if (overlay) {
      const icon  = overlay.querySelector('#save-success-icon');
      const title = overlay.querySelector('#save-success-title');
      const msg   = overlay.querySelector('#save-success-msg');
      if (icon)  icon.textContent  = '✅';
      if (title) title.textContent = 'Đã lưu thành công!';
      if (msg)   msg.innerHTML     = 'Phòng tranh của bạn đã được lưu.<br>Đang chuyển trang…';
    }

    // Dừng nhỏ để user thấy trạng thái "xong" trước khi rời trang
    await new Promise(resolve => setTimeout(resolve, 700));

    if (overlay) overlay.classList.remove('open');
    afterSaveFn();
  }

  _isRoomNameValid() {
    const roomNameInput = document.getElementById('studio-room-name-input');
    const name = roomNameInput?.value.trim();
    if (!name) {
        this.toast('❌ Vui lòng đặt tên cho phòng trước khi tiếp tục', 'error');
        return false;
    }
    return true;
}
  _buildStudioTopBar() {
    const bar = document.createElement('div');
    bar.id = 'studio-topbar';
    bar.innerHTML = `
      <div id="studio-room-name-wrap">
        <img id="studio-room-name-bg" src="/studio/roomname.svg" alt="">
        <input id="studio-room-name-input" type="text" placeholder="Tên căn phòng này là gì vậy?" maxlength="60" style="color:#FFFFFF;">      </div>
        <div id="studio-draft-badge" title="Trạng thái Draft">
        <img src="/studio/draft.svg" alt="Draft">
      </div>
      <div id="studio-autosave-wrap" style="margin-left:330px;" title="Tự động lưu">
        <img id="studio-autosave-bg" src="/studio/autosave.svg" alt="Autosave" style="height:40px !important;width:auto;">
        <span id="studio-autosave-label">Autosave</span>
        <label class="studio-toggle">
          <input type="checkbox" id="studio-autosave-toggle" checked>
          <span class="studio-toggle-slider"></span>
        </label>
      </div>
        <div class="studio-top-btn" id="btn-studio-preview" style="margin-left:-30px;" title="Preview phòng tranh">
        <img src="/studio/preview.svg" alt="Preview" style="margin-left:20px;">
      </div>
      <div class="studio-top-btn" id="btn-studio-save" title="Lưu phòng tranh" style="margin-left:-20px;">
        <img src="/studio/save.svg" alt="Save">
      </div>
    `;
    document.body.appendChild(bar);
    this._el(bar);

    // Load room name từ currentRoom
    const roomNameInput = document.getElementById('studio-room-name-input');
    roomNameInput.addEventListener('focus', function() {
    if (this.value === '') {
        this.placeholder = '';
    }
});
roomNameInput.addEventListener('blur', function() {
    if (this.value === '') {
        this.placeholder = 'Tên căn phòng này là gì vậy?';
    }
});
    if (this.manager.currentRoom?.name) {
    roomNameInput.value = this.manager.currentRoom?.name || '';
    }

    // Autosave
    this._autosaveEnabled = true;
    this._autosaveTimer = null;
    const autosaveToggle = document.getElementById('studio-autosave-toggle');
    autosaveToggle.addEventListener('change', (e) => {
      this._autosaveEnabled = e.target.checked;
      if (!this._autosaveEnabled && this._autosaveTimer) {
        clearTimeout(this._autosaveTimer);
        this._autosaveTimer = null;
      }
    });

    // Khi sửa tên phòng → debounce autosave
    roomNameInput.addEventListener('input', (e) => {
      if (this.manager.currentRoom) this.manager.currentRoom.name = e.target.value;
      if (this._autosaveEnabled) {
        clearTimeout(this._autosaveTimer);
        this._autosaveTimer = setTimeout(() => this.saveGallery(), 2000);
      }
    });

    // Nút Save
    document.getElementById('btn-studio-save').addEventListener('click', () => this.saveGallery());

    // Nút Preview — lưu → modal thông báo → chuyển sang PreviewScene
    document.getElementById('btn-studio-preview').addEventListener('click', async () => {
      if (!this._isRoomNameValid()) return;
      // 1. Lưu phòng
      await this.saveGallery();
      // 2. Hiện modal "Đã lưu thành công"
      await this._showSaveSuccessModal();
      // 3. Chuyển sang PreviewScene (cùng tab, chỉ artist xem được)
      this.manager.navigateTo('preview');
    });
  }

  _triggerAutosave() {
    if (!this._autosaveEnabled) return;
    clearTimeout(this._autosaveTimer);
    this._autosaveTimer = setTimeout(() => this.saveGallery(), 3000);
  }

_buildSecondaryToolbar() {
  // CSS
  const style = document.createElement('style');
  style.textContent = `
      #studio-secondary-toolbar {
        position: fixed;
        top: -32px !important;
        left: 200px;
        transform: none;
        display: flex;
        align-items: center;
        gap: 0;
        padding: 0 10px;
        z-index: 26;
        pointer-events: none;
        background: url('/studio/toolbarbg.svg') no-repeat center center;
        background-size: 100% 100%;
        border: none;
        box-shadow: none;
        border-radius: 0;
        justify-content: space-evenly;
        width: 687px;        /* ← thêm dòng này */
        height: 257.17px;
      }
    .stb2-btn {
      width: 36px; height: 36px;
      border: none; background: transparent;
      background-size: contain; background-repeat: no-repeat; background-position: center;
      cursor: not-allowed; pointer-events: none; opacity: 0.3;
      transition: opacity 0.15s;
      position: relative; outline: none; font-size: 0;
    }
    .stb2-btn.on { pointer-events: auto; cursor: pointer; opacity: 0.7; }
    .stb2-btn.on:hover { opacity: 1; }
    .stb2-btn.activated { pointer-events: auto; cursor: pointer; opacity: 1; transform: scale(1.2); }
    .stb2-btn.activated:hover { opacity: 1; transform: scale(1.35); }
    .stb2-sep {
      width: 1px; height: 22px;
      background: rgba(255,255,255,0.12);
      margin: 0 6px; flex-shrink: 0;
    }
    .stb2-tooltip {
        position: absolute; top: calc(100% + 8px); left: 50%;
        transform: translateX(-50%);
        background: #122F6A; color: #FFFFFF;
        font-size: 11px; font-family: 'Montserrat', sans-serif;
        white-space: nowrap; padding: 4px 10px;
        border-radius: 6px; pointer-events: none;
        opacity: 0; transition: opacity 0.15s;
        border: 0.5px solid rgba(255,255,255,0.12);
        z-index: 999;
      }
    .stb2-btn:hover .stb2-tooltip { opacity: 1; }
  `;
  document.head.appendChild(style);
  this._el(style);

// Helper để tạo img element từ SVG file
const makeIconImg = (src) => `<img src="/studio/${src}" style="width:18px;height:18px;">`;

// Định nghĩa các icon (sử dụng file SVG)
const ICON_FILES = {
  select: 'select.svg',
  delete: 'delete.svg',
  move: 'move.svg',
  moveActive: 'moveactivated.svg',
  rotate: 'rotate.svg',
  rotateActive: 'rotateactivated.svg',
  scale: 'scale.svg',
  scaleActive: 'scaleactivated.svg',
  undo: 'undo.svg',
  redo: 'redo.svg',
  fliph: 'fliph.svg',
  flipfb: 'flipfb.svg',
};

  const bar = document.createElement('div');
  bar.id = 'studio-secondary-toolbar';
  
// Nút có 2 trạng thái (normal + active) — dùng 1 img duy nhất, đổi src khi click
const makeBtn = (id, normalIcon, activeIcon, tooltip) => {
  const btn = document.createElement('button');
  btn.className = 'stb2-btn';
  btn.id = id;
  btn.dataset.normalIcon = normalIcon;
  btn.dataset.activeIcon = activeIcon;
  btn.innerHTML = `<img src="/studio/${normalIcon}" style="width:18px;height:18px;"><span class="stb2-tooltip">${tooltip}</span>`;
  return btn;
};

// Nút chỉ 1 trạng thái (undo/redo/delete)
const makeSimpleBtn = (id, iconFile, tooltip) => {
  const btn = document.createElement('button');
  btn.className = 'stb2-btn';
  btn.id = id;
  btn.innerHTML = `${makeIconImg(iconFile)}<span class="stb2-tooltip">${tooltip}</span>`;
  return btn;
};

  const sep = () => {
    const d = document.createElement('div');
    d.className = 'stb2-sep';
    return d;
  };

  // Nhóm 1: Select + Delete
const btnSelect = makeBtn('stb2-select', 'select.svg', 'select.svg', 'Chọn (Select)');
btnSelect.classList.add('activated');
bar.appendChild(btnSelect);
bar.appendChild(makeSimpleBtn('stb2-delete', 'delete.svg', 'Xoá vật thể'));

bar.appendChild(sep());

// Nhóm 2: Transform (OFF until object selected)
bar.appendChild(makeBtn('stb2-translate', 'move.svg', 'moveactivated.svg', 'Di dời'));
bar.appendChild(makeBtn('stb2-rotate', 'rotate.svg', 'rotateactivated.svg', 'Xoay'));
bar.appendChild(makeBtn('stb2-scale', 'scale.svg', 'scaleactivated.svg', 'Điều chỉnh kích thước'));

bar.appendChild(sep());

// Nhóm 3: Undo/Redo (always on)
const btnUndo = makeSimpleBtn('stb2-undo', 'undo.svg', 'Hoàn tác');
const btnRedo = makeSimpleBtn('stb2-redo', 'redo.svg', 'Làm lại');
btnUndo.classList.add('on');
btnRedo.classList.add('on');
bar.appendChild(btnUndo);
bar.appendChild(btnRedo);

bar.appendChild(sep());

// Nhóm 4: Flip (enabled only for artwork/text)
bar.appendChild(makeSimpleBtn('stb2-fliph', 'flip.svg', 'Lật gương (ngang)'));
bar.appendChild(makeSimpleBtn('stb2-flipfb', 'mirror.svg', 'Lật trước/sau'));

  document.body.appendChild(bar);
  this._el(bar);

  // --- Bind events ---
  document.getElementById('stb2-delete').addEventListener('click', () => {
    document.getElementById('th-remove')?.click();
  });

  document.getElementById('stb2-undo').addEventListener('click', () => this._undo());
  document.getElementById('stb2-redo').addEventListener('click', () => this._redo());
  document.getElementById('stb2-fliph').addEventListener('click', () => this._flipObject('mirror'));
  document.getElementById('stb2-flipfb').addEventListener('click', () => this._flipObject('frontback'));

  const iconNormal = { 'stb2-select': 'select.svg', 'stb2-translate': 'move.svg', 'stb2-rotate': 'rotate.svg', 'stb2-scale': 'scale.svg' };
  const iconActive = { 'stb2-select': 'select.svg', 'stb2-translate': 'moveactivated.svg', 'stb2-rotate': 'rotateactivated.svg', 'stb2-scale': 'scaleactivated.svg' };
  const modeMap = { 'stb2-select': 'select', 'stb2-translate': 'translate', 'stb2-rotate': 'rotate', 'stb2-scale': 'scale' };

['stb2-select', 'stb2-translate', 'stb2-rotate', 'stb2-scale'].forEach(id => {
  document.getElementById(id).addEventListener('click', () => {
    // Reset tất cả về icon normal
    ['stb2-select', 'stb2-translate', 'stb2-rotate', 'stb2-scale'].forEach(otherId => {
      const img = document.querySelector(`#${otherId} img`);
      if (img) img.src = `/studio/${iconNormal[otherId]}`;
    });
    // Set icon active cho nút được bấm
    const img = document.querySelector(`#${id} img`);
    if (img) img.src = `/studio/${iconActive[id]}`;

    this._activateSecondaryBtn(id);
    this.mode = modeMap[id];
    // Tự động tắt chế độ "bắt đầu đặt chữ lên tường"
    this.textEditor?.exitPlaceMode();
  });
});
}

  _saveUndoState() {
    const obj = this.getSelObj();
    if (!obj || !this.selectedItem) return;
    this._undoStack.push({ type: this.selectedItem.type, index: this.selectedItem.index, position: obj.position.clone(), rotation: obj.rotation.clone(), scale: obj.scale.clone() });
    if (this._undoStack.length > 50) this._undoStack.shift();
    this._redoStack = [];
  }

  _getObjByState(state) {
    if (state.type === 'artwork') return this.artworks[state.index]?.group;
    if (state.type === 'model') return this.models3d[state.index]?.object;
    if (state.type === 'chest') return this.chests[state.index]?.mesh;
    if (state.type === 'text') return this.textEditor.texts[state.index]?.group;
    if (state.type === 'egg') return this.missionBuilder._eggObjs[state.index];
    if (state.type === 'wall') return this.interiorWalls[state.index]?.group;
    return null;
  }

  _syncEggTransform() {
    const sel = this.selectedItem;
    if (sel?.type !== 'egg') return;
    const { missionIdx, eggIdx, object } = sel.data;
    const egg = this._missionData[missionIdx]?.easter_eggs?.[eggIdx];
    if (!egg) return;
    egg.pos_x = object.position.x;
    egg.pos_y = object.position.y;
    egg.pos_z = object.position.z;
    egg.rot_y = object.rotation.y;
    // For chest GLBs, scale is stored as a multiplier relative to the base factor
    const chestBase = object.userData._chestBase;
    egg.scale = chestBase ? object.scale.x / chestBase : object.scale.x;
  }

  _undo() {
    const state = this._undoStack.pop();
    if (!state) { this.toast('Không có gì để hoàn tác', 'info'); return; }
    if (state.type === 'delete-artwork') {
      this.artworks.splice(state.index, 0, state.data);
      this.threeScene.add(state.data.group);
      this._redoStack.push({ type: 'restore-artwork', index: state.index, data: state.data });
      this._renderUploadedList();
      this.toast('Hoàn tác xoá tranh ✓', 'success'); return;
    }
    if (state.type === 'delete-model') {
      this.models3d.splice(state.index, 0, state.data);
      this.threeScene.add(state.data.object);
      if (state.data.light) this.threeScene.add(state.data.light);
      if (state.data.pedestal) this.threeScene.add(state.data.pedestal);
      this._redoStack.push({ type: 'restore-model', index: state.index, data: state.data });
      this._renderUploadedList();
      this.toast('Hoàn tác xoá model ✓', 'success'); return;
    }
    const obj = this._getObjByState(state);
    if (!obj) return;
    this._redoStack.push({ type: state.type, index: state.index, position: obj.position.clone(), rotation: obj.rotation.clone(), scale: obj.scale.clone() });
    obj.position.copy(state.position); obj.rotation.copy(state.rotation); obj.scale.copy(state.scale);
    if (state.type === 'egg') {
      const [mIdx, eIdx] = state.index.split('_').map(Number);
      const egg = this._missionData[mIdx]?.easter_eggs?.[eIdx];
      if (egg) { egg.pos_x = obj.position.x; egg.pos_y = obj.position.y; egg.pos_z = obj.position.z; egg.rot_y = obj.rotation.y; egg.scale = obj.scale.x; }
    }
    this.toast('Hoàn tác ✓', 'success');
  }

  _redo() {
    const state = this._redoStack.pop();
    if (!state) { this.toast('Không có gì để làm lại', 'info'); return; }
    if (state.type === 'restore-artwork') {
      this.threeScene.remove(state.data.group);
      this.artworks.splice(state.index, 1);
      this._undoStack.push({ type: 'delete-artwork', index: state.index, data: state.data });
      this._renderUploadedList();
      this.toast('Làm lại xoá tranh ✓', 'success'); return;
    }
    if (state.type === 'restore-model') {
      this.threeScene.remove(state.data.object);
      if (state.data.light) this.threeScene.remove(state.data.light);
      if (state.data.pedestal) this.threeScene.remove(state.data.pedestal);
      this.models3d.splice(state.index, 1);
      this._undoStack.push({ type: 'delete-model', index: state.index, data: state.data });
      this._renderUploadedList();
      this.toast('Làm lại xoá model ✓', 'success'); return;
    }
    const obj = this._getObjByState(state);
    if (!obj) return;
    this._undoStack.push({ type: state.type, index: state.index, position: obj.position.clone(), rotation: obj.rotation.clone(), scale: obj.scale.clone() });
    obj.position.copy(state.position); obj.rotation.copy(state.rotation); obj.scale.copy(state.scale);
    if (state.type === 'egg') {
      const [mIdx, eIdx] = state.index.split('_').map(Number);
      const egg = this._missionData[mIdx]?.easter_eggs?.[eIdx];
      if (egg) { egg.pos_x = obj.position.x; egg.pos_y = obj.position.y; egg.pos_z = obj.position.z; egg.rot_y = obj.rotation.y; egg.scale = obj.scale.x; }
    }
    this.toast('Làm lại ✓', 'success');
  }

  _setTransformButtonsEnabled(enabled) {
    const iconNormal = { 'stb2-translate': 'move.svg', 'stb2-rotate': 'rotate.svg', 'stb2-scale': 'scale.svg' };
    ['stb2-delete', 'stb2-translate', 'stb2-rotate', 'stb2-scale'].forEach(id => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.classList.remove('on', 'activated');
      if (enabled) {
        btn.classList.add('on');
      } else {
        if (iconNormal[id]) {
          const img = btn.querySelector('img');
          if (img) img.src = `/studio/${iconNormal[id]}`;
        }
      }
    });
    if (!enabled) {
      const sel = document.getElementById('stb2-select');
      if (sel) { sel.classList.remove('on'); sel.classList.add('activated'); }
      if (['translate', 'rotate', 'scale'].includes(this.mode)) this.mode = 'select';
    }
  }

  _activateSecondaryBtn(activeId) {
    const iconNormal = { 'stb2-select': 'select.svg', 'stb2-translate': 'move.svg', 'stb2-rotate': 'rotate.svg', 'stb2-scale': 'scale.svg' };
    const iconActive = { 'stb2-select': 'select.svg', 'stb2-translate': 'moveactivated.svg', 'stb2-rotate': 'rotateactivated.svg', 'stb2-scale': 'scaleactivated.svg' };
    ['stb2-select', 'stb2-translate', 'stb2-rotate', 'stb2-scale'].forEach(id => {
      const btn = document.getElementById(id);
      if (!btn || (!btn.classList.contains('on') && !btn.classList.contains('activated'))) return;
      btn.classList.remove('activated', 'on');
      const isActive = id === activeId;
      btn.classList.add(isActive ? 'activated' : 'on');
      const img = btn.querySelector('img');
      if (img) img.src = `/studio/${isActive ? iconActive[id] : iconNormal[id]}`;
    });
  }

  _flipObject(type) {
    if (!this.selectedItem) return;
    const obj = this.getSelObj();
    if (!obj) return;
    this._saveUndoState();
    if (type === 'mirror') {
      obj.scale.x *= -1;
    } else {
      obj.rotation.y += Math.PI;
    }
    this._triggerAutosave();
  }

  _buildMinimap() {
    const wrap = document.createElement('div');
    wrap.id = 'minimap-wrap';
    wrap.innerHTML = `
      <div id="minimap-canvas-wrap">
        <button id="minimap-expand-btn" style="position:absolute;top:4px;right:4px;z-index:10;background:rgba(18,15,12,.6);border:.5px solid rgba(212,197,169,.3);border-radius:3px;cursor:pointer;font-size:8px;color:rgba(212,197,169,.7);width:16px;height:16px;display:flex;align-items:center;justify-content:center;padding:0;line-height:1;">⤢</button>
        <img id="minimap-bg-svg" src="/icons/minimap.svg" alt="">
        <canvas id="minimap-canvas" width="200" height="200"></canvas>      </div>
    `;
    wrap.style.cssText = 'position:fixed;bottom:350px;left:12px;z-index:20;width:96px;';
    document.body.appendChild(wrap);
    this._el(wrap);

    this._mmExpanded = false;

    if (!this._playerSvg) {
      this._playerSvg = new Image();
      this._playerSvg.src = '/icons/player.svg';
    }

    document.getElementById('minimap-expand-btn').addEventListener('click', () => {
      this._mmExpanded = !this._mmExpanded;
      wrap.classList.toggle('expanded', this._mmExpanded);
      const btn = document.getElementById('minimap-expand-btn');
      btn.textContent = this._mmExpanded ? '⤡' : '⤢';
      btn.title = this._mmExpanded ? 'Thu nhỏ' : 'Mở rộng';
    });
    
  }

  _drawMinimap() {
    const mmCanvas = document.getElementById('minimap-canvas');
    if (!mmCanvas) return;
    const S = mmCanvas.width;
    const mmCtx = mmCanvas.getContext('2d');
    mmCtx.clearRect(0, 0, S, S);

    const box = this._roomBox;
    if (!box) return;
    const minX = box.min.x, maxX = box.max.x;
    const minZ = box.min.z, maxZ = box.max.z;
    const pad = Math.round(S * .1);
    const spanX = maxX - minX || 20, spanZ = maxZ - minZ || 20;
    const scale = Math.min((S - pad*2)/spanX, (S - pad*2)/spanZ);
    const ox = pad + ((S - pad*2) - spanX*scale)/2 - minX*scale;
    const oz = pad + ((S - pad*2) - spanZ*scale)/2 - minZ*scale;
    const toMM = (wx, wz) => [ox + wx*scale, oz + wz*scale];

    this.artworks.forEach(a => {
      if (!a.group) return;
      const [mx, mz] = toMM(a.group.position.x, a.group.position.z);
      const sz = this._mmExpanded ? 4 : 3;
      mmCtx.fillStyle = 'rgba(200,169,110,.8)';
      mmCtx.fillRect(mx - sz/2, mz - sz*.4, sz, sz*.8);
    });

    const [cx, cz] = toMM(this.camera.position.x, this.camera.position.z);
    mmCtx.save();
    mmCtx.translate(cx, cz);
    mmCtx.rotate(-this.yaw);
    if (this._playerSvg?.complete && this._playerSvg.naturalWidth) {
      const imgSize = 104;
      mmCtx.drawImage(this._playerSvg, -imgSize/2, -imgSize/2, imgSize, imgSize);
    } else {
      const r = this._mmExpanded ? 9 : 6;
      mmCtx.beginPath();
      mmCtx.moveTo(0, -r * 1.6);
      mmCtx.lineTo(r, r);
      mmCtx.lineTo(-r, r);
      mmCtx.closePath();
      mmCtx.fillStyle = 'rgba(200,169,110,0.95)';
      mmCtx.fill();
      mmCtx.strokeStyle = 'rgba(255,255,255,0.8)';
      mmCtx.lineWidth = 1.5;
      mmCtx.stroke();
      if (!this._playerSvg) {
        this._playerSvg = new Image();
        this._playerSvg.src = '/icons/player.svg';
      }
    }
    mmCtx.restore();
  }
_buildStudioLeftBtns() {
    // 4 nút dọc bên trái
    const col = document.createElement('div');
    col.id = 'studio-left-btns';
    col.style.cssText = 'position:fixed;left:12px;top:auto;bottom:200px;display:flex;flex-direction:column;gap:8px;z-index:20;';
    col.innerHTML = `
      <div class="studio-side-btn" id="btn-studio-tutorial" data-title="Hướng dẫn xây phòng">
        <img src="/studio/tutorial.svg">
      </div>
      <div class="studio-side-btn" id="btn-studio-faq" data-title="FAQ">
        <img src="/studio/faq.svg">
      </div>
      <div class="studio-side-btn" id="btn-studio-settings" data-title="Cài đặt">
        <img src="/studio/studiosettings.svg">
      </div>
    `;
    document.body.appendChild(col);
    this._el(col);

    // --- Tutorial overlay (slide-based, giống ViewerScene) ---
    const tutOverlay = document.createElement('div');
    tutOverlay.id = 'studio-tutorial-overlay';
    tutOverlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.55);display:none;align-items:center;justify-content:center;';
    document.body.appendChild(tutOverlay);
    this._el(tutOverlay);

    const TUT_SLIDES = [
      '/tutorialstudio/slide1.svg',
      '/tutorialstudio/slide2.svg',
      '/tutorialstudio/slide3.svg',
      '/tutorialstudio/slide4.svg',
      '/tutorialstudio/slide5.svg',
      '/tutorialstudio/slide6.svg',
    ];
    const TUT_TOTAL = TUT_SLIDES.length;
    let tutCurrent = 0;

    const tutSlideWrap = document.createElement('div');
    tutSlideWrap.style.cssText = 'position:relative;display:inline-flex;align-items:center;justify-content:center;';

    const tutImg = document.createElement('img');
    tutImg.style.cssText = 'width:803px;max-width:95vw;height:auto;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,0.45);display:block;';

    const tutNav = document.createElement('div');
    tutNav.style.cssText = 'position:absolute;bottom:22px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:10px;';

    const tutPill = document.createElement('div');
    tutPill.style.cssText = 'width:145px;height:39px;border-radius:24.5px;background:rgba(199,217,237,1);display:flex;align-items:center;justify-content:space-between;padding:0 4px;box-sizing:border-box;';

    const tutBtnPrev = document.createElement('button');
    tutBtnPrev.style.cssText = 'width:31px;height:31px;border-radius:50%;border:none;background:rgba(255,255,255,0.55);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:opacity 0.15s,background 0.15s;flex-shrink:0;';
    const tutPrevIcon = document.createElement('img');
    tutPrevIcon.src = '/tutorialviewer/previous.svg';
    tutPrevIcon.style.cssText = 'width:18.5px;height:21.37px;display:block;';
    tutBtnPrev.appendChild(tutPrevIcon);

    const tutCount = document.createElement('span');
    tutCount.style.cssText = "font-family:'Nunito',sans-serif;font-size:13px;font-weight:700;color:#2d4a6e;letter-spacing:.03em;text-align:center;flex:1;";

    const tutBtnNext = document.createElement('button');
    tutBtnNext.style.cssText = 'width:31px;height:31px;border-radius:50%;border:none;background:rgba(255,255,255,0.55);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:opacity 0.15s,background 0.15s;flex-shrink:0;';
    const tutNextIcon = document.createElement('img');
    tutNextIcon.src = '/tutorialviewer/next.svg';
    tutNextIcon.style.cssText = 'width:18.5px;height:21.37px;display:block;';
    tutBtnNext.appendChild(tutNextIcon);

    tutPill.append(tutBtnPrev, tutCount, tutBtnNext);

    const tutBtnEnter = document.createElement('button');
    tutBtnEnter.style.cssText = "width:160px;height:39px;border-radius:24.5px;border:none;background:url('/tutorialviewer/enter.svg') center/cover no-repeat;cursor:pointer;padding:0;display:none;";

    const tutRender = () => {
      tutImg.src = TUT_SLIDES[tutCurrent];
      tutCount.textContent = `${tutCurrent + 1} / ${TUT_TOTAL}`;
      tutBtnPrev.style.opacity = tutCurrent === 0 ? '0.35' : '1';
      tutBtnPrev.style.pointerEvents = tutCurrent === 0 ? 'none' : 'auto';
      if (tutCurrent === TUT_TOTAL - 1) {
        tutBtnEnter.style.display = 'flex';
        tutBtnNext.style.opacity = '0.35';
        tutBtnNext.style.pointerEvents = 'none';
      } else {
        tutBtnEnter.style.display = 'none';
        tutBtnNext.style.opacity = '1';
        tutBtnNext.style.pointerEvents = 'auto';
      }
    };

    tutBtnPrev.addEventListener('click', () => { if (tutCurrent > 0) { tutCurrent--; tutRender(); } });
    tutBtnNext.addEventListener('click', () => { if (tutCurrent < TUT_TOTAL - 1) { tutCurrent++; tutRender(); } });
    tutBtnEnter.addEventListener('click', () => { tutOverlay.style.display = 'none'; });

    tutNav.append(tutBtnEnter, tutPill);
    tutSlideWrap.append(tutImg, tutNav);
    tutOverlay.appendChild(tutSlideWrap);

    // --- Settings panel ---
    const sspPanel = document.createElement('div');
    sspPanel.id = 'studio-settings-panel';
    sspPanel.innerHTML = `
      <div id="ssp-title">⚙ Cài đặt Studio</div>
      <div class="ssp-row">
        <span class="ssp-label">Tốc độ di chuyển</span>
        <input type="range" class="ssp-range" id="ssp-speed" min="2" max="20" step="1" value="8">
        <span class="ssp-val" id="ssp-speed-val">8</span>
      </div>
      <div class="ssp-row">
        <span class="ssp-label">FOV camera</span>
        <input type="range" class="ssp-range" id="ssp-fov" min="40" max="100" step="1" value="75">
        <span class="ssp-val" id="ssp-fov-val">75</span>
      </div>
    `;
    document.body.appendChild(sspPanel);
    this._el(sspPanel);

    // --- Events ---
    document.getElementById('btn-studio-tutorial').addEventListener('click', () => {
      tutCurrent = 0;
      tutRender();
      tutOverlay.style.display = 'flex';
    });

    document.getElementById('btn-studio-faq').addEventListener('click', () => {
      window.open('/faq', '_blank');
    });

    document.getElementById('btn-studio-settings').addEventListener('click', () => {
      sspPanel.classList.toggle('open');
    });

    document.getElementById('ssp-speed').addEventListener('input', e => {
      document.getElementById('ssp-speed-val').textContent = e.target.value;
    });

    document.getElementById('ssp-fov').addEventListener('input', e => {
      document.getElementById('ssp-fov-val').textContent = e.target.value;
      if (this.camera) {
        this.camera.fov = +e.target.value;
        this.camera.updateProjectionMatrix();
      }
    });
  }


  /* ══════════════════════════════════════════════ MODE ══════════════════════════════════════════════ */
  setMode(m) {
    this.mode = m;
    document.querySelectorAll('.tb-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-' + m)?.classList.add('active');
    this.renderer.domElement.style.cursor = m === 'place' ? 'crosshair' : (m === 'walk' ? 'grab' : 'default');
    if (m !== 'select') this.deselectItem();
    // Tự động tắt chế độ "bắt đầu đặt chữ lên tường" khi chuyển tính năng khác
    this.textEditor?.exitPlaceMode();
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

  /* ══════════════════════════════════════════════ PANEL PHẢI — 5 BƯỚC ══════════════════════════════════════════════ */
  _buildRightPanel() {
    // CSS cho panel
    const style = document.createElement('style');
    style.textContent = `
      #right-panel-5step {
        display: flex; flex-direction: column;
        font-family: monospace; pointer-events: none;
        transform: scale(0.97);
        transform-origin: top right;
      }
      /* ── Thanh bước ── */
      #rp-steps {
        display: flex; align-items: stretch;
        background: url('/panelstudio/stepbar.svg') no-repeat center center;
        background-size: 100% 100%;
        pointer-events: auto; flex-shrink: 0;
        width: 478px; height: 93px;
        padding: 0 8px; gap: 4px;
        position: fixed; right: 16px; top: 60px; z-index: 30;
        transform: scale(0.85) translate(-20px, 30px);
        transform-origin: top right;
      }
      .rp-step {
        flex: 1; display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        padding: 4px 6px; cursor: pointer;
        border-right: 1px solid rgba(255,255,255,0.1);
        transition: background 0.2s; gap: 2px;
        height: 84px; box-sizing: border-box;
      }
      .rp-step:last-child { border-right: none; }
      .rp-step:hover { background: rgba(255,255,255,0.08); }
      .rp-step.active { background: rgba(255,255,255,0.18); border-radius: 16px; }
      .rp-step-num { color: rgba(255,255,255,0.5); font-size: 12px; letter-spacing: .1em; font-family: 'Montserrat', sans-serif !important; font-weight: 700; }
      .rp-step.active .rp-step-num { color: #68e5e3; }
      .rp-step-label { color: #fff; font-size: 12px; text-align: center; line-height: 1.3; font-weight: 700; font-family: 'Montserrat', sans-serif !important; }
      .rp-step.active .rp-step-label { color: #fff; }
      /* ── Body panel ── */
      #rp-body {
        margin-top: 0; flex: none;
        background: url('/panelstudio/steppanel.svg') no-repeat center center;
        background-size: 100% 100%;
        width: 470px; height: 560px;
        display: flex; flex-direction: column; overflow: hidden;
        pointer-events: auto;
        position: fixed; right: 20px; top: 100px; z-index: 29;
        transform: scale(0.85) translate(-20px, 30px);
        transform-origin: top right;
      }
      /* ── Sub-tabs ── */
      #rp-subtabs {
        display: flex; justify-content: space-between;
        padding: 0 30px 0 30px;
        margin-top: 50px;    
        border-bottom: 1.5px solid rgba(255,255,255,0.1);
        flex-shrink: 0; gap: 0;
        flex-wrap: wrap; min-height: 52px;
      }
      .rp-subtab {
        width: 93px; height: 40px;
        padding: 8px 10px; font-size: 20px; color: rgba(255,255,255,1);
        cursor: pointer; border-bottom: 2px solid transparent;
        transition: all 0.2s; white-space: nowrap; letter-spacing: .03em;
        display: flex; align-items: center; justify-content: center;
        font-family: 'Montserrat', sans-serif;
      }
      .rp-subtab:hover { color: rgba(255,255,255,0.8); }
      .rp-subtab.active { color: #fff; border-bottom-color: #68e5e3; }
      /* ── Content ── */
      #rp-content {
        flex: 1; overflow-y: auto; padding: 16px 30px 30px 30px;
        font-family: 'Montserrat', sans-serif;
        color: #FFFFFF;
        padding-top: 0px;
        pointer-events: auto;
      }
      #rp-content::-webkit-scrollbar { width: 3px; }
      #rp-content::-webkit-scrollbar-thumb { background: rgba(104,229,227,0.3); border-radius: 2px; }
      .rp-pane { display: none; flex-direction: column; gap: 10px; box-sizing: border-box; pointer-events: auto; }      .rp-pane.active { display: flex; }
      /* ── Placeholder panes ── */
      .rp-placeholder {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        height: 200px; color: rgba(255,255,255,0.2); font-size: 11px; gap: 8px; letter-spacing: .1em;
      }
      .rp-placeholder-icon { font-size: 32px; opacity: 0.3; }
      /* ── Light controls (bước 02 - đèn) ── */
      .rp-lp-row { display: flex; align-items: center; gap: 8px; }
      .rp-lp-label { color: rgba(255,255,255,0.5); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; flex-shrink: 0; width: 80px; }
      .rp-lp-val { color: #fff; font-size: 9px; width: 28px; text-align: right; flex-shrink: 0; }
      .rp-lp-range { flex: 1; -webkit-appearance: none; height: 2px; background: rgba(255,255,255,0.15); border-radius: 1px; outline: none; cursor: pointer; }
      .rp-lp-range::-webkit-slider-thumb { -webkit-appearance: none; width: 10px; height: 10px; border-radius: 50%; background: #68e5e3; cursor: pointer; }
      .rp-lp-color { width: 28px; height: 20px; border: none; border-radius: 4px; cursor: pointer; background: none; padding: 0; }
      .rp-section-title { color: rgba(255,255,255,1); font-size: 15px; letter-spacing: .15em; text-transform: uppercase; margin-bottom: 2px; margin-top: 4px;   font-family: 'Montserrat', sans-serif; font-weight: 700;
 }
      /* ── Upload (bước 03) ── */
      .rp-upload-btn {
        padding: 10px; text-align: center; cursor: pointer;
        background: rgba(255,255,255,0.06); border: 1px dashed rgba(255,255,255,0.2);
        border-radius: 8px; color: rgba(255,255,255,0.6); font-size: 10px;
        letter-spacing: .08em; transition: all 0.2s; line-height: 1.8;
      }
      .rp-upload-btn:hover { background: rgba(104,229,227,0.1); border-color: rgba(104,229,227,0.4); color: #68e5e3; }
      /* ── SVG action buttons (step 02) ── */
      .rp-action-btns { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; }
      .rp-svg-btn {
        display: block; width: 422px; height: 43.25px;
        max-width: 100%;
        background-size: 100% 100%; background-repeat: no-repeat; background-position: center; background-color: transparent;
        border: none; cursor: pointer; outline: none;
        transition: filter 0.2s, transform 0.15s;
        flex-shrink: 0;
      }
      .rp-svg-btn:hover { filter: brightness(1.12); transform: scaleY(1.03); }
      .rp-svg-btn:active { filter: brightness(0.9); transform: scaleY(0.97); }
      .rp-svg-btn-picture { background-image: url('/panelstudio/picture.svg'); }
      .rp-svg-btn-video   { background-image: url('/panelstudio/video.svg'); }
      .rp-svg-btn-3dmodel { background-image: url('/panelstudio/3dmodel.svg'); }
      .rp-svg-btn-text    { background-image: url('/panelstudio/text.svg'); }
      /* ── Text editor inline panel ── */
      #rp-text-inline { display: none; margin-top: 6px; }
      #rp-text-inline.open { display: block; }
      .rp-thumb-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 4px; }
      /* ── Music controls ── */
      .rp-music-row { display: flex; align-items: center; gap: 10px; }
      .rp-music-btn { background: rgba(104,229,227,0.15); border: 1px solid rgba(104,229,227,0.35); color: #68e5e3; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; transition: all 0.2s; flex-shrink: 0; }
      .rp-music-btn:hover { background: rgba(104,229,227,0.3); }
      .rp-music-name { font-size: 14px; color: rgba(255,255,255,0.4); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .rp-music-vol { width: 70px; -webkit-appearance: none; height: 2px; background: rgba(255,255,255,0.15); border-radius: 1px; outline: none; }
      .rp-music-vol::-webkit-slider-thumb { -webkit-appearance: none; width: 8px; height: 8px; border-radius: 50%; background: #68e5e3; cursor: pointer; }
      .rp-playlist { margin-top: 10px; display: flex; flex-direction: column; gap: 4px; max-height: 180px; overflow-y: auto; }
      .rp-playlist::-webkit-scrollbar { width: 4px; }
      .rp-playlist::-webkit-scrollbar-thumb { background: rgba(104,229,227,0.3); border-radius: 2px; }
      .rp-playlist-item { display: flex; align-items: center; gap: 6px; padding: 5px 8px; border-radius: 6px; background: rgba(255,255,255,0.05); transition: background 0.15s; }
      .rp-playlist-item.playing { background: rgba(104,229,227,0.12); }
      .rp-playlist-item-name { flex: 1; font-size: 12px; color: rgba(255,255,255,0.6); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .rp-playlist-item.playing .rp-playlist-item-name { color: #68e5e3; }
      .rp-playlist-item-del { background: none; border: none; color: rgba(255,255,255,0.3); cursor: pointer; font-size: 13px; padding: 0 2px; line-height: 1; flex-shrink: 0; }
      .rp-playlist-item-del:hover { color: #ff6b6b; }
      /* ── Decor thumbs ── */
      .rp-decor-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
      .rp-decor-item { aspect-ratio: 1; border-radius: 8px; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; font-size: 20px; }
      .rp-decor-item:hover { background: rgba(104,229,227,0.12); border-color: rgba(104,229,227,0.4); }
      #rp-decor-grid .rp-tpl-card { width: auto; height: auto; aspect-ratio: 1; padding: 6px; gap: 3px; border-radius: 8px; background-size: cover; }
      /* ── Path (bước 04) ── */
      .rp-wp-item { display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.05); border: 0.5px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 6px 8px; cursor: pointer; transition: all 0.2s; }
      .rp-wp-item:hover { background: rgba(104,229,227,0.08); border-color: rgba(104,229,227,0.3); }
      .rp-wp-num { color: #68e5e3; font-size: 9px; min-width: 18px; font-weight: bold; }
      .rp-wp-lbl { color: rgba(255,255,255,0.6); font-size: 9px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .rp-wp-del { background: rgba(220,60,60,0.5); color: #fff; border: none; font-size: 7px; cursor: pointer; padding: 2px 5px; border-radius: 3px; }
      /* ── Template grid ── */
      .rp-tpl-card {
        display: flex; flex-direction: column; gap: 6px;
        cursor: pointer; border-radius: 10px;
        border: 1.5px solid transparent;
        overflow: hidden; transition: all 0.2s;
        background: url('/panelstudio/templatebg.svg') no-repeat center center;
        background-size: cover;
        width: 191px; height: 191px;
        flex-shrink: 0;
        padding: 10px 14px 14px 14px;
        box-sizing: border-box;
      }
      .rp-tpl-card:hover { border-color: rgba(104,229,227,0.5); }
      .rp-tpl-card.active { border-color: rgba(104,229,227,0.9); outline: 2px solid rgba(104,229,227,0.6); outline-offset: 1px; }
      .rp-tpl-name {
        color: #fff; font-size: 10px; font-weight: 600;
        font-family: 'Montserrat', sans-serif;
        text-align: center; letter-spacing: .04em;
        flex-shrink: 0;
      }
      .rp-tpl-thumb {
        width: 100%; flex: 1;
        object-fit: cover; border-radius: 6px;
        background: transparent;
        min-height: 0;
      }
      /* ── Publish (bước 05) ── */
      .rp-pub-btn { padding: 10px 16px; border-radius: 8px; border: none; cursor: pointer; font-family: monospace; font-size: 13px; letter-spacing: .08em; transition: all 0.2s; width: 100%; }
      .rp-pub-btn.primary { background: linear-gradient(90deg, #122F6A, #235CD0); color: #fff; border: 1px solid rgba(104,229,227,0.4); }
      .rp-pub-btn.primary:hover { filter: brightness(1.15); }
      .rp-pub-btn.danger { background: rgba(181,74,58,.15); color: rgb(255, 46, 4); border: 1px solid rgba(181,74,58,.4); }
      .rp-pub-btn.danger:hover { background: rgba(181,74,58,.3); }
      .rp-pub-info { font-size: 11px; color: rgb(255, 255, 255); line-height: 1.8; letter-spacing: .06em; }
      /* ── Publish form redesign ── */
      .pub-section-title { color: rgba(255,255,255,1); font-size: 17px; letter-spacing: .15em; text-transform: uppercase; font-family: 'Montserrat', sans-serif;  font-weight: 700; margin: 10px 0 5px; border-bottom: .5px solid rgba(104,229,227,0.2); padding-bottom: 4px; }
      .pub-field { display: flex; flex-direction: column; gap: 3px; }
      .pub-field-label { color: rgb(255, 255, 255); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; }
      .pub-required { color: #68e5e3; }
      .pub-optional { color: rgb(255, 255, 255); font-style: italic; }
      .pub-input { background: rgba(255,255,255,0.05); border: .5px solid rgba(212,197,169,0.22); border-radius: 4px; color: #d4c5a9; font-family: monospace; font-size: 13px; padding: 6px 8px; outline: none; transition: border-color .2s; width: 100%; box-sizing: border-box; }
      .pub-textarea { background: rgba(255,255,255,0.05); border: .5px solid rgba(212,197,169,0.22); border-radius: 4px; color: #d4c5a9; font-family: monospace; font-size: 13px; padding: 6px 8px; outline: none; transition: border-color .2s; resize: vertical; width: 100%; box-sizing: border-box; min-height: 72px; }
      .pub-input:focus, .pub-textarea:focus { border-color: rgba(104,229,227,0.5); }
      .pub-input::placeholder { color: rgb(255,222,36); opacity: 1; }
      .pub-textarea::placeholder, .pub-tag-input::placeholder { color: rgb(255,222,36); opacity: 1; }      .pub-char-count { color: rgb(255, 255, 255); font-size: 10px; text-align: right; letter-spacing: .06em; }
      .pub-char-count.warn { color: #c8a96e; }
      .pub-tags-container { display: flex; flex-wrap: wrap; gap: 4px; }
      .pub-tag { background: rgba(104,229,227,0.1); border: .5px solid rgba(104,229,227,0.3); border-radius: 20px; color: #68e5e3; font-size:11px; padding: 2px 8px; display: inline-flex; align-items: center; gap: 4px; }
      .pub-tag-del { cursor: pointer; opacity: .55; line-height: 1; }
      .pub-tag-del:hover { opacity: 1; }
      .pub-tag-input { background: transparent; border: none; outline: none; color: rgb(255,222,36); font-family: monospace; font-size: 13px; flex: 1; min-width: 60px; }
      .pub-tag-input-wrap { background: rgba(255,255,255,0.05); border: .5px solid rgba(212,197,169,0.22); border-radius: 4px; padding: 5px 8px; display: flex; flex-wrap: wrap; gap: 4px; transition: border-color .2s; }
      .pub-tag-input-wrap:focus-within { border-color: rgba(104,229,227,0.5); }
      .pub-field-hint { color: rgb(255, 255, 255); font-size: 10px; letter-spacing: .06em; }
      .pub-thumb-saved { color: rgb(110, 255, 146); font-size: 11px; margin-left: 6px; font-weight: normal; text-transform: none; letter-spacing: .06em; }
      .pub-canvas-wrap { display: flex; flex-direction: column; gap: 5px; }
      .pub-tools { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
      .pub-tool-btn { background: rgba(255,255,255,0.06); border: .5px solid rgba(212,197,169,0.22); border-radius: 4px; color: #d4c5a9; cursor: pointer; font-size: 13px; padding: 3px 7px; transition: all .15s; line-height: 1.4; }
      .pub-tool-btn:hover { background: rgba(255,255,255,0.14); }
      .pub-tool-btn.active { background: rgba(104,229,227,0.15); border-color: rgba(104,229,227,0.5); }
      .pub-color-input { width: 28px; height: 26px; border: .5px solid rgba(212,197,169,0.22); border-radius: 4px; padding: 1px; cursor: pointer; background: none; }
      .pub-size-input { flex: 1; max-width: 60px; -webkit-appearance: none; height: 2px; background: rgba(212,197,169,0.2); border-radius: 1px; cursor: pointer; outline: none; }
      .pub-size-input::-webkit-slider-thumb { -webkit-appearance: none; width: 10px; height: 10px; border-radius: 50%; background: #d4c5a9; cursor: pointer; }
      .pub-canvas-area { position: relative; border-radius: 4px; overflow: hidden; border: .5px solid rgba(212,197,169,0.22); cursor: crosshair; align-self: flex-start; }
      .pub-canvas-area canvas { display: block; }
      .pub-canvas-area img.pub-door-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
      .pub-upload-label { display: block; text-align: center; padding: 6px; border: .5px dashed rgba(212,197,169,0.3); border-radius: 4px; color: rgba(212,197,169,0.55); font-size: 11px; cursor: pointer; letter-spacing: .06em; transition: all .2s; }
      .pub-upload-label:hover { border-color: rgba(104,229,227,0.5); color: #68e5e3; }
      .pub-save-thumb-btn { padding: 7px; background: rgba(104,229,227,0.1); border: .5px solid rgba(104,229,227,0.35); border-radius: 4px; color: #68e5e3; font-family: monospace; font-size: 11px; cursor: pointer; transition: all .2s; letter-spacing: .06em; width: 100%; }
      .pub-save-thumb-btn:hover { background: rgba(104,229,227,0.2); }
      .pub-save-thumb-btn:disabled { opacity: .4; cursor: default; }
      .pub-thumb-preview { width: 100%; border-radius: 4px; border: .5px solid rgba(212,197,169,0.2); display: block; cursor:pointer; }
      .pub-publish-section { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: .5px solid rgba(212,197,169,0.12); }
      .thumb-trigger-area { display:flex; flex-direction:column; gap:6px; }
      .thumb-open-btn { padding:9px; background:rgba(104,229,227,0.08); border:.5px solid rgba(104,229,227,0.3); border-radius:4px; color:rgb(19, 238, 253); font-family:monospace; font-size:11px; cursor:pointer; transition:all .2s; letter-spacing:.06em; }
      .thumb-open-btn:hover { background:rgba(104,229,227,0.18); }
      .thumb-empty-hint { text-align:center; padding:16px; border:.5px dashed rgba(212,197,169,0.18); border-radius:4px; color:rgb(255, 221, 158); font-size:11px; letter-spacing:.06em; }
      /* ── Thumbnail Modal ── */
      #thumb-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.85); display:flex; align-items:center; justify-content:center; z-index:2000; opacity:0; pointer-events:none; transition:opacity .22s; }
      #thumb-modal-overlay.open { opacity:1; pointer-events:auto; }
      #thumb-modal { width:92vw; max-width:1080px; height:88vh; background:rgba(35, 92, 208, 0.5); border:.5px solid rgba(212,197,169,0.18); border-radius:8px; display:flex; flex-direction:column; overflow:hidden; }
#thumb-modal-title { color:#FFFFFF; font-family:'Montserrat',sans-serif; font-size:12px; letter-spacing:.12em; font-weight:700; margin-left:30px; position:relative; top:5px; }      
#thumb-modal-close { background:none; border:.5px solid rgba(212,197,169,0.2); border-radius:3px; color:#FFFFFF; cursor:pointer; font-size:12px; padding:3px 9px; transition:all .2s; position:relative; top:5px; }      #thumb-modal-close:hover { background:rgba(181,74,58,.2); border-color:rgba(181,74,58,.5); color:#ff9982; }
      #thumb-modal-body { display:flex; flex:1; overflow:hidden; }
      #thumb-canvas-container { flex:1; display:flex; align-items:center; justify-content:center; padding:16px; overflow:hidden; background:rgba(255,255,255,0.015); }
      #thumb-canvas-area { position:relative; border:.5px solid rgba(212,197,169,0.2); border-radius:4px; overflow:hidden; flex-shrink:0; background: repeating-conic-gradient(#3a3835 0% 25%, #2a2826 0% 50%) 0 0 / 16px 16px; cursor:crosshair; }
      #thumb-draw-canvas { display:block; background: transparent; position:relative; z-index:1; }
      #thumb-obj-layer { position:absolute; inset:0; z-index:2; pointer-events:none; }
      #thumb-door-overlay { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:0; object-fit:fill; opacity:0.5; }
      #thumb-guide-hint { position:absolute; bottom:12%; left:50%; transform:translateX(-50%); pointer-events:none; z-index:3; text-align:center; background:rgba(0,0,0,0.45); border:.5px solid rgba(212,197,169,0.25); border-radius:4px; padding:4px 10px; white-space:nowrap; }
      #thumb-guide-hint span { display:block; color:rgba(212,197,169,0.6); font-size:9px; letter-spacing:.08em; font-family:'Montserrat',sans-serif; line-height:1.5; }
      .thumb-obj-item { position:absolute; box-sizing:border-box; cursor:move; touch-action:none; pointer-events:auto; }
      .thumb-obj-item.selected { outline:1.5px dashed rgba(104,229,227,0.75); outline-offset:1px; }
      .thumb-obj-item img { width:100%; height:100%; pointer-events:none; display:block; object-fit:fill; }
      .obj-handle { position:absolute; width:10px; height:10px; background:#68e5e3; border-radius:2px; z-index:10; display:none; box-sizing:border-box; }
      .thumb-obj-item.selected .obj-handle { display:block; }
      .obj-handle.tl { top:-5px; left:-5px; cursor:nwse-resize; }
      .obj-handle.tr { top:-5px; right:-5px; cursor:nesw-resize; }
      .obj-handle.bl { bottom:-5px; left:-5px; cursor:nesw-resize; }
      .obj-handle.br { bottom:-5px; right:-5px; cursor:nwse-resize; }
      .obj-rotate-handle { position:absolute; top:-22px; left:50%; transform:translateX(-50%); width:12px; height:12px; background:#c8a96e; border-radius:50%; cursor:crosshair; display:none; z-index:10; }
      .thumb-obj-item.selected .obj-rotate-handle { display:block; }
      .obj-delete-btn { position:absolute; top:-10px; right:-10px; width:18px; height:18px; background:rgba(181,74,58,.85); border:none; border-radius:50%; color:#fff; font-size:9px; cursor:pointer; display:none; align-items:center; justify-content:center; z-index:10; padding:0; line-height:1; font-family:monospace; }
      .thumb-obj-item.selected .obj-delete-btn { display:flex; }
      #thumb-tool-panel { width:210px; flex-shrink:0; display:flex; flex-direction:column; background:linear-gradient(180deg, rgba(18, 47, 106, 1), rgba(118, 170, 171, 1));
; border-left:.5px solid rgba(212,197,169,0.1); overflow-y:auto; padding-bottom:12px; }
      .tp-section { color:#FFFFFF; font-size:8px; letter-spacing:.15em; text-transform:uppercase; padding:10px 12px 5px; flex-shrink:0; }
      .tp-brushes { display:flex; flex-wrap:wrap; gap:4px; padding:0 10px 8px; }
      .tp-brush { background:rgba(255,255,255,0.06); border:.5px solid rgba(212,197,169,0.18); border-radius:4px; color:#FFFFFF; font-family:'Montserrat',sans-serif; cursor:pointer; font-size:14px; padding:5px 8px; transition:all .15s; line-height:1.2; }
      .tp-brush:hover { background:rgba(255,255,255,0.12); }
      .tp-brush.active { background:rgba(104,229,227,0.15); border-color:rgba(104,229,227,0.5); }
      .tp-row { display:flex; align-items:center; gap:8px; padding:0 12px 7px; }
      .tp-color { width:30px; height:28px; border:.5px solid rgba(212,197,169,0.2); border-radius:4px; padding:1px; cursor:pointer; background:none; flex-shrink:0; }
      .tp-range { flex:1; -webkit-appearance:none; height:2px; background:rgba(212,197,169,0.18); border-radius:1px; cursor:pointer; outline:none; }
      .tp-range::-webkit-slider-thumb { -webkit-appearance:none; width:10px; height:10px; border-radius:50%; background:#d4c5a9; cursor:pointer; }
      .tp-label { color:rgb(255, 255, 255); font-size:8px; min-width:22px; text-align:right; flex-shrink:0; }
      .tp-sep { border:none; border-top:.5px solid rgba(212,197,169,0.08); margin:6px 0; }
      .tp-upload-label { display:flex; align-items:center; gap:6px; margin:0 10px 6px; padding:7px 10px; border:.5px dashed rgba(212,197,169,0.22); border-radius:4px; color:#FFFFFF; font-family:'Montserrat',sans-serif; font-size:9px; cursor:pointer; letter-spacing:.06em; transition:all .2s; }
      .tp-upload-label:hover { border-color:rgba(104,229,227,0.5); color:#68e5e3; }
      .tp-btn { margin:0 10px 5px; padding:7px 10px; background:rgba(255,255,255,0.04); border:.5px solid rgba(212,197,169,0.16); border-radius:4px; color:#FFFFFF; font-family:'Montserrat',sans-serif;
 font-size:9px; cursor:pointer; transition:all .2s; text-align:left; letter-spacing:.06em; width:calc(100% - 20px); }
      .tp-btn:hover { background:rgba(255,255,255,0.09); }
      .tp-save-btn { margin:8px 10px 4px; padding:10px; background:rgba(104,229,227,0.12); border:.5px solid rgba(104,229,227,0.4); border-radius:4px; color:#68e5e3; font-family:'Montserrat',sans-serif; font-size:10px; cursor:pointer; transition:all .2s; width:calc(100% - 20px); letter-spacing:.06em; }
      .tp-save-btn:hover { background:rgba(104,229,227,0.22); }
      .tp-save-btn:disabled { opacity:.4; cursor:default; }

      /* ── Collapse/Expand right panel ── */
      #rp-steps, #rp-body {
        transition: transform 0.35s cubic-bezier(.4,0,.2,1), opacity 0.35s;
      }
      #rp-steps.rp-collapsed {
        transform: scale(0.85) translate(calc(100% + 36px), 30px) !important;
        opacity: 0;
        pointer-events: none;
      }
      #rp-body.rp-collapsed {
        transform: scale(0.85) translate(calc(100% + 40px), 30px) !important;
        opacity: 0;
        pointer-events: none;
      }
      #rp-toggle-tab {
        position: fixed;
        right: 0px;
        top: 50%;
        transform: translateY(-50%);
        z-index: 35;
        width: 22px;
        height: 72px;
        background: rgba(15,13,12,0.92);
        border: 0.5px solid rgba(104,229,227,0.35);
        border-right: none;
        border-radius: 8px 0 0 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s, border-color 0.2s, right 0.35s cubic-bezier(.4,0,.2,1);
        backdrop-filter: blur(4px);
      }
      #rp-toggle-tab:hover {
        background: rgba(104,229,227,0.15);
        border-color: rgba(104,229,227,0.7);
      }
      #rp-toggle-tab-arrow {
        color: #68e5e3;
        font-size: 13px;
        line-height: 1;
        transition: transform 0.35s cubic-bezier(.4,0,.2,1);
        user-select: none;
      }
      #rp-toggle-tab.rp-collapsed #rp-toggle-tab-arrow {
        transform: rotate(180deg);
      }
    `;
    document.head.appendChild(style);
    this._el(style);

    // ── Hidden file inputs (giữ nguyên để logic upload hoạt động) ──
    const fiImg = document.createElement('input');
    fiImg.type = 'file'; fiImg.id = 'fi-img'; fiImg.accept = 'image/*,video/*'; fiImg.multiple = true; fiImg.style.display = 'none';
    document.body.appendChild(fiImg); this._el(fiImg);

    const fi3d = document.createElement('input');
    fi3d.type = 'file'; fi3d.id = 'fi-3d'; fi3d.accept = '.glb,.gltf,.obj'; fi3d.multiple = true; fi3d.style.display = 'none';
    document.body.appendChild(fi3d); this._el(fi3d);

    // ── Hidden upload zones (giữ id để code cũ không bị lỗi) ──
    const uwImg = document.createElement('div'); uwImg.id = 'uw-img'; uwImg.style.display = 'none';
    document.body.appendChild(uwImg); this._el(uwImg);
    const uw3d = document.createElement('div'); uw3d.id = 'uw-3d'; uw3d.style.display = 'none';
    document.body.appendChild(uw3d); this._el(uw3d);

    // ── Wrapper chính ──
    const wrap = document.createElement('div');
    wrap.id = 'right-panel-5step';

    const STEPS = [
      { num: '01', label: 'Xây phòng' },
      { num: '02', label: 'Thêm tác phẩm' },
      { num: '03', label: 'Chỉnh sửa phòng' },
      { num: '04', label: 'Thêm câu đố' },
      { num: '05', label: 'Xuất bản & chia sẻ' },
    ];

    // ── Thanh bước ──
    const stepsBar = document.createElement('div');
    stepsBar.id = 'rp-steps';
    STEPS.forEach((s, i) => {
      const btn = document.createElement('div');
      btn.className = 'rp-step' + (i === 1 ? ' active' : '');
      btn.dataset.step = i;
      btn.innerHTML = `<span class="rp-step-num">${s.num}</span><span class="rp-step-label">${s.label.replace('\n', '<br>')}</span>`;
      stepsBar.appendChild(btn);
    });
    // ── Body ──
    const body = document.createElement('div');
    body.id = 'rp-body';

    // Sub-tabs bar
    const subtabsBar = document.createElement('div');
    subtabsBar.id = 'rp-subtabs';
    body.appendChild(subtabsBar);

    // Content area
    const content = document.createElement('div');
    content.id = 'rp-content';
    body.appendChild(content);

    // Append stepsBar và body thẳng vào document.body (tránh transform containig-block bug)
    document.body.appendChild(stepsBar);
    this._el(stepsBar);
    document.body.appendChild(body);
    this._el(body);
    document.body.appendChild(wrap);
    this._el(wrap);

    // ── Toggle tab (thu gọn / mở panel phải) ──
    const toggleTab = document.createElement('div');
    toggleTab.id = 'rp-toggle-tab';
    toggleTab.innerHTML = `<span id="rp-toggle-tab-arrow">&#x276E;</span>`;
    document.body.appendChild(toggleTab);
    this._el(toggleTab);

    let rpCollapsed = false;
    toggleTab.addEventListener('click', () => {
      rpCollapsed = !rpCollapsed;
      stepsBar.classList.toggle('rp-collapsed', rpCollapsed);
      body.classList.toggle('rp-collapsed', rpCollapsed);
      toggleTab.classList.toggle('rp-collapsed', rpCollapsed);
    });

    // ── Định nghĩa nội dung mỗi bước ──
    const STEP_CONFIGS = [
      // Bước 01: Xây phòng
      {
        subtabs: ['Template'],
        panes: ['pane-template'],
      },
      // Bước 02: Thêm tác phẩm
      {
        subtabs: ['Thêm tác phẩm'],
        panes: ['pane-artwork'],
      },
      // Bước 03: Chỉnh sửa phòng
      {
        subtabs: ['Âm thanh', 'Đồ decor', 'Ánh sáng', 'Path đường', 'Tường', 'HDR'],
        panes: ['pane-music', 'pane-decor', 'pane-light', 'pane-path', 'pane-wall', 'pane-hdr'],
      },
      // Bước 04: Thêm câu đố
      {
        subtabs: ['Nhiệm vụ'],
        panes: ['pane-mission'],
      },
      // Bước 05: Xuất bản & chia sẻ
      {
        subtabs: ['Xuất bản'],
        panes: ['pane-publish'],
      },
    ];

    let currentStep = 1; // bước 02

    const STEP_WITH_SUBTABS = 2; // chỉ step 03 (index 2) mới hiện subtabs

    const renderStep = (stepIdx) => {
      currentStep = stepIdx;
      document.querySelectorAll('.rp-step').forEach((el, i) => el.classList.toggle('active', i === stepIdx));
      const cfg = STEP_CONFIGS[stepIdx];
      const showSubtabs = stepIdx === STEP_WITH_SUBTABS;

      // Hiện/ẩn thanh subtabs tuỳ step
      subtabsBar.style.display = showSubtabs ? 'flex' : 'none';

      // Render subtabs (chỉ khi là step có subtabs)
      subtabsBar.innerHTML = '';
      if (showSubtabs) {
        cfg.subtabs.forEach((label, i) => {
  const tab = document.createElement('div');
  tab.className = 'rp-subtab' + (i === 0 ? ' active' : '');
  tab.dataset.pane = cfg.panes[i];

  const svgMap = {
    'Âm thanh': 'sound.svg',
    'Đồ decor': 'decor.svg',
    'Ánh sáng': 'light.svg',
    'Path đường': 'path.svg',
    'Tường': 'wall.svg',
    'HDR': 'view.svg'
  };

  if (svgMap[label]) {
    tab.innerHTML = '';
    tab.style.backgroundImage = `url('/panelstudio/${svgMap[label]}')`;
    tab.style.backgroundSize = '100% 100%';
    tab.style.backgroundRepeat = 'no-repeat';
    tab.style.backgroundPosition = 'center';
  } else {
    tab.textContent = label;
  }

  subtabsBar.appendChild(tab);
});
      }

      // Render panes
      content.innerHTML = '';
      cfg.panes.forEach((paneId, i) => {
        const pane = document.createElement('div');
        pane.className = 'rp-pane' + (i === 0 ? ' active' : '');
        pane.id = paneId;
        content.appendChild(pane);
        this._fillPane(paneId, pane);
      });

      // Subtab click (chỉ khi có subtabs)
      if (showSubtabs) {
        subtabsBar.querySelectorAll('.rp-subtab').forEach(tab => {
          tab.addEventListener('click', () => {
            subtabsBar.querySelectorAll('.rp-subtab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            content.querySelectorAll('.rp-pane').forEach(p => p.classList.remove('active'));
            document.getElementById(tab.dataset.pane)?.classList.add('active');
          });
        });
      }
    };

    stepsBar.querySelectorAll('.rp-step').forEach(btn => {
      btn.addEventListener('click', () => {
        // Tắt chế độ "bắt đầu đặt chữ lên tường" khi bấm bước khác
        this.textEditor?.exitPlaceMode();
        renderStep(+btn.dataset.step);
      });
    });

    renderStep(1); // mặc định mở bước 02

    // File input listeners (giữ nguyên)
    document.getElementById('uz-img')?.addEventListener('click', () => document.getElementById('fi-img').click());
    document.getElementById('uz-3d')?.addEventListener('click', () => document.getElementById('fi-3d').click());

    document.getElementById('fi-img').addEventListener('change', async (e) => {
      const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;
      for (const file of Array.from(e.target.files)) {
        if (file.size > MAX_UPLOAD_SIZE) { this._showFileSizeLimitModal(file.name, file.size); continue; }
        const isVideo = file.type.startsWith('video/');
        if (isVideo) {
          try {
            this.toast('Đang upload video...', 'info', 15000);
            const storageUrl = await this.uploadToStorage(file);
            if (!storageUrl) { this.toast('Upload thất bại', 'error'); continue; }
            const vid = document.createElement('video');
            vid.src = storageUrl; vid.loop = true; vid.muted = true; vid.playsInline = true; vid.crossOrigin = 'anonymous';
            vid.addEventListener('loadeddata', () => {
              const tex = new THREE.VideoTexture(vid); tex.minFilter = THREE.LinearFilter; tex.colorSpace = THREE.SRGBColorSpace;
              const src = { isVideo: true, texture: tex, videoEl: vid, storageUrl };
              // Tạo thumbnail bằng canvas
              const th = document.createElement('canvas'); th.width = 120; th.height = 120;
              setTimeout(() => { vid.currentTime = 0.5; vid.addEventListener('seeked', () => { const ctx = th.getContext('2d');
const scale = 120 / vid.videoWidth;
const dh = vid.videoHeight * scale;
ctx.fillStyle = '#ffffff8a';
ctx.fillRect(0, 0, 120, 120);
ctx.drawImage(vid, 0, (120 - dh) / 2, 120, dh); }, { once: true }); }, 200);
              this._uploadedSources.push({ type: 'video', label: file.name, src, thumbCanvas: th });
              this._renderUploadedList();
              this.selectSource(src); vid.play(); this.setMode('place');
              this.toast('Video ✓ — click tường để đặt', 'success');
            });
          } catch (err) { this.toast('Lỗi: ' + err.message, 'error'); }
        } else {
          this.toast('Đang upload...', 'info', 10000);
          const storageUrl = await this.uploadToStorage(file);
          if (!storageUrl) { this.toast('Upload thất bại, ảnh sẽ không được lưu', 'error'); continue; }
          const img = new Image();
          img.onload = () => {
            const nw = img.naturalWidth, nh = img.naturalHeight;
            const cv = document.createElement('canvas'); cv.width = 512; cv.height = Math.round(512 * nh / nw);
            cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
            const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
            const src = { canvas: cv, texture: tex, naturalWidth: nw, naturalHeight: nh, storageUrl };
            const th = document.createElement('canvas'); th.width = 120; th.height = 120;
            const ctx = th.getContext('2d');
            const scale = 120 / img.naturalWidth;
            const dh = img.naturalHeight * scale;
            const dy = (120 - dh) / 2;
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            ctx.fillRect(0, 0, 120, 120);
            ctx.drawImage(img, 0, dy, 120, dh);
            this._uploadedSources.push({ type: 'image', label: file.name, src, thumbCanvas: th });
            this._renderUploadedList();
            this.selectSource(src); this.setMode('place');
            this.toast('Ảnh ✓ — click tường để đặt', 'success');
          };
          img.src = URL.createObjectURL(file);
        }
      }
      e.target.value = '';
    });

    document.getElementById('fi-3d').addEventListener('change', async (e) => {
      for (const file of Array.from(e.target.files)) {
        if (file.size > 50 * 1024 * 1024) { this._showFileSizeLimitModal(file.name, file.size); continue; }
        const ext = file.name.split('.').pop().toLowerCase();
        try {
          this.toast('Đang upload ' + file.name + '...', 'info', 15000);
          const storageUrl = await this.uploadToStorage(file);
          if (!storageUrl) { this.toast('Upload thất bại', 'error'); continue; }
          this.toast('Đang load model...', 'info', 10000);
          const onLoad = (object) => {
            const src = { type: 'model3d', object, name: file.name, storageUrl };
            this._uploadedSources.push({ type: 'model', label: file.name, src });
            this._renderUploadedList();
            this.selectSource(src); this.setMode('place');
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
    // Làm sạch tên file: bỏ dấu tiếng Việt, thay ký tự đặc biệt bằng '_'
    // Tránh lỗi 400 Bad Request khi tên có ký tự unicode
    file = await compressImage(file);
    const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
    const safeName = file.name
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\u0111/gi, 'd')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 80);
    const path = `${Date.now()}_${safeName || ('file.' + ext)}`;
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: true });
    if (error) { console.error('Upload error:', error.message); return null; }
    return toCDN(supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl);
  }

  _showFileSizeLimitModal(filename, sizeBytes) {
    const sizeMB = (sizeBytes / 1024 / 1024).toFixed(1);
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(4px);z-index:10000;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:linear-gradient(180deg,rgba(118,170,171,1),rgba(35,92,208,0.5));border-radius:12px;padding:32px 40px;width:400px;font-family:'Montserrat',sans-serif;display:flex;flex-direction:column;gap:14px;text-align:center;box-sizing:border-box;">
        <div style="font-size:38px">⚠️</div>
        <div style="color:#fff;font-size:16px;font-weight:700;letter-spacing:.05em;">File quá lớn</div>
        <div style="color:rgba(255,255,255,0.85);font-size:12px;line-height:1.9;">
          <b style="color:#fff">${filename}</b><br>
          Dung lượng: <b style="color:#f87171">${sizeMB} MB</b> — Giới hạn: <b style="color:#fff">50 MB</b>
        </div>
        <div style="color:rgba(255,255,255,0.65);font-size:11px;line-height:1.8;background:rgba(0,0,0,0.2);border-radius:6px;padding:10px 14px;">
          Với video dung lượng lớn, hãy đăng lên <b style="color:#fff">YouTube</b> rồi dùng tính năng<br>
          <b style="color:#68e5e3">🔗 Nhúng YouTube</b> trong tab <b style="color:#fff">Tác phẩm</b>.
        </div>
        <button id="fslm-ok" style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);color:#fff;font-family:'Montserrat',sans-serif;font-size:13px;padding:10px 24px;border-radius:6px;cursor:pointer;transition:all .2s;">Đã hiểu</button>
      </div>`;
    document.body.appendChild(overlay);
    const rm = () => overlay.parentNode && document.body.removeChild(overlay);
    overlay.querySelector('#fslm-ok').addEventListener('click', rm);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) rm(); });
  }

  _openUrlEmbedModal() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(4px);z-index:10000;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:linear-gradient(180deg,rgba(118,170,171,1),rgba(35,92,208,0.5));border-radius:12px;padding:28px 32px;width:460px;font-family:'Montserrat',sans-serif;display:flex;flex-direction:column;gap:14px;box-sizing:border-box;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="color:#fff;font-size:16px;font-weight:700;letter-spacing:.04em;">▶ Nhúng video YouTube</span>
          <button id="uem-close" style="background:none;border:none;color:rgba(255,255,255,.6);font-size:22px;cursor:pointer;line-height:1;padding:0;">✕</button>
        </div>
        <div style="color:rgb(255, 255, 255);font-size:11px;line-height:1.7;">
          Dán link YouTube vào ô bên dưới.<br>
          Video sẽ xuất hiện như một khung tranh trên tường — click vào để xem.
        </div>
        <style>#uem-url-input::placeholder { color: #ffffff; }</style>
        <input id="uem-url-input" type="text" placeholder="https://www.youtube.com/watch?v=..."
          style="background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.3);color:#fff;font-family:'Montserrat',sans-serif;font-size:13px;padding:10px 12px;border-radius:6px;outline:none;width:100%;box-sizing:border-box;">
        <div id="uem-preview" style="display:none;background:rgba(0,0,0,0.35);border-radius:6px;padding:12px;text-align:center;"></div>
        <div id="uem-status" style="color:#f87171;font-size:11px;display:none;"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button id="uem-cancel" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.7);font-family:'Montserrat',sans-serif;font-size:12px;padding:8px 18px;border-radius:6px;cursor:pointer;">Huỷ</button>
          <button id="uem-confirm" style="background:rgba(255,0,0,0.25);border:1px solid rgba(255,80,80,0.5);color:#ff8080;font-family:'Montserrat',sans-serif;font-size:13px;font-weight:700;padding:8px 20px;border-radius:6px;cursor:pointer;transition:all .2s;">Đặt lên tường</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.parentNode && document.body.removeChild(overlay);
    overlay.querySelector('#uem-close').addEventListener('click', close);
    overlay.querySelector('#uem-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    const input = overlay.querySelector('#uem-url-input');
    const preview = overlay.querySelector('#uem-preview');
    const status = overlay.querySelector('#uem-status');
    const confirmBtn = overlay.querySelector('#uem-confirm');

    input.addEventListener('input', () => {
      const url = input.value.trim();
      status.style.display = 'none';
      if (!url) { preview.style.display = 'none'; return; }
      const id = this._extractYouTubeId(url);
      preview.style.display = 'block';
      if (id) {
        preview.innerHTML = `<img src="https://img.youtube.com/vi/${id}/mqdefault.jpg" style="max-width:240px;border-radius:6px;display:block;margin:0 auto 6px;"><span style="color:#aaa;font-size:10px;">ID: ${id}</span>`;
      } else {
        preview.innerHTML = `<span style="color:#f87171;font-size:11px;">Không nhận ra link YouTube. Ví dụ: https://www.youtube.com/watch?v=abc123</span>`;
      }
    });

    confirmBtn.addEventListener('click', async () => {
      const url = input.value.trim();
      if (!url) { status.textContent = 'Vui lòng nhập link YouTube.'; status.style.display = 'block'; return; }
      const id = this._extractYouTubeId(url);
      if (!id) { status.textContent = 'Link không hợp lệ. Chỉ hỗ trợ YouTube (youtube.com hoặc youtu.be).'; status.style.display = 'block'; return; }
      status.style.display = 'none';
      confirmBtn.textContent = 'Đang tải thumbnail...';
      confirmBtn.style.opacity = '0.6';
      confirmBtn.style.pointerEvents = 'none';
      try {
        await this._embedYouTube(url, id);
        close();
      } catch (err) {
        status.textContent = 'Lỗi: ' + err.message;
        status.style.display = 'block';
        confirmBtn.textContent = 'Đặt lên tường';
        confirmBtn.style.opacity = '1';
        confirmBtn.style.pointerEvents = 'auto';
      }
    });
  }

  _extractYouTubeId(url) {
    const m = url.match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  async _embedYouTube(url, ytId) {
    const thumbUrl = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 360;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, 640, 360);

    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = thumbUrl;
    await new Promise(r => { img.onload = r; img.onerror = r; setTimeout(r, 5000); });
    if (img.complete && img.naturalWidth) ctx.drawImage(img, 0, 0, 640, 360);

    // Overlay tối nhẹ
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(0, 0, 640, 360);
    // Nút play
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.arc(320, 180, 54, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(303, 153); ctx.lineTo(303, 207); ctx.lineTo(350, 180); ctx.closePath(); ctx.fill();
    // Badge YouTube góc dưới trái
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.roundRect(16, 318, 112, 28, 5);
    ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Arial'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText('▶ YouTube', 24, 332);

    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    const src = { texture: tex, naturalWidth: 16, naturalHeight: 9, isYouTube: true, youtubeId: ytId, storageUrl: url };
    const th = document.createElement('canvas'); th.width = 120; th.height = 68;
    th.getContext('2d').drawImage(canvas, 0, 0, 120, 68);
    this._uploadedSources.push({ type: 'youtube', label: 'YouTube: ' + ytId, src, thumbCanvas: th });
    this._renderUploadedList();
    this.selectSource(src); this.setMode('place');
    this.toast('Video YouTube sẵn sàng — click tường để đặt, double-click tranh để xem', 'success');
  }

  _showYouTubeOverlay(youtubeId) {
    const existing = document.getElementById('yt-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'yt-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.82);backdrop-filter:blur(6px);z-index:10000;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;';
    overlay.innerHTML = `
      <button id="yt-overlay-close" style="position:absolute;top:20px;right:28px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;font-size:22px;cursor:pointer;border-radius:6px;padding:4px 12px;font-family:monospace;">✕ Đóng</button>
      <div style="width:min(880px,90vw);aspect-ratio:16/9;border-radius:10px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.7);">
        <iframe src="https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0" style="width:100%;height:100%;border:none;" allow="autoplay;encrypted-media;fullscreen" allowfullscreen></iframe>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#yt-overlay-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  }

async _handleMusicUpload(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  e.target.value = '';
  try {
    this.toast(`Đang upload ${files.length} file nhạc...`, 'info', 15000);
    for (const file of files) {
      const storageUrl = await this.uploadToStorage(file);
      if (!storageUrl) { this.toast(`Upload thất bại: ${file.name}`, 'error'); continue; }
      this._musicPlaylist.push({ url: storageUrl, name: file.name });
    }
    this._triggerAutosave();
    this.toast('Upload nhạc thành công ✓', 'success');
    this._renderMusicPlaylist();
    // Nếu chưa có nhạc đang chạy và vừa thêm bài đầu tiên → load bài đó
    if (!this.backgroundMusic && this._musicPlaylist.length > 0) {
      this._loadTrack(0);
    }
  } catch (err) {
    this.toast('Lỗi upload nhạc: ' + err.message, 'error');
  }
}

_loadTrack(index) {
  if (!this._musicPlaylist.length) return;
  this._musicIndex = ((index % this._musicPlaylist.length) + this._musicPlaylist.length) % this._musicPlaylist.length;
  const track = this._musicPlaylist[this._musicIndex];
  const vol = this.backgroundMusic ? this.backgroundMusic.volume : 0.5;
  if (this.backgroundMusic) { this.backgroundMusic.pause(); this.backgroundMusic.onended = null; }
  this.backgroundMusic = new Audio(track.url);
  this.backgroundMusic.volume = vol;
  this.backgroundMusic.onended = () => this._loadTrack(this._musicIndex + 1);
  const nameEl = document.getElementById('rp-music-name');
  if (nameEl) nameEl.textContent = '🎵 ' + track.name;
  if (this.isMusicPlaying) {
    this.backgroundMusic.play().catch(() => {});
  }
  this._renderMusicPlaylist();
}

_renderMusicPlaylist() {
  const list = document.getElementById('rp-playlist');
  if (!list) return;
  list.innerHTML = '';
  this._musicPlaylist.forEach((track, i) => {
    const item = document.createElement('div');
    item.className = 'rp-playlist-item' + (i === this._musicIndex ? ' playing' : '');
    item.innerHTML = `<span class="rp-playlist-item-name" title="${track.name}">🎵 ${track.name}</span><button class="rp-playlist-item-del" data-i="${i}" title="Xóa bài này">✕</button>`;
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('rp-playlist-item-del')) return;
      const wasPlaying = this.isMusicPlaying;
      this._loadTrack(i);
      if (wasPlaying) { this.backgroundMusic.play().catch(() => {}); }
      else { this.isMusicPlaying = false; }
      const playBtn = document.getElementById('rp-music-play');
      if (playBtn) playBtn.textContent = wasPlaying ? '⏸' : '▶';
    });
    item.querySelector('.rp-playlist-item-del').addEventListener('click', (e) => {
      e.stopPropagation();
      const wasPlaying = this.isMusicPlaying;
      const isCurrentTrack = (i === this._musicIndex);
      this._musicPlaylist.splice(i, 1);
      if (!this._musicPlaylist.length) {
        if (this.backgroundMusic) { this.backgroundMusic.pause(); this.backgroundMusic.onended = null; this.backgroundMusic = null; }
        this.isMusicPlaying = false;
        const nameEl = document.getElementById('rp-music-name');
        if (nameEl) nameEl.textContent = 'Chưa có nhạc';
        const playBtn = document.getElementById('rp-music-play');
        if (playBtn) playBtn.textContent = '▶';
      } else {
        const newIdx = i < this._musicIndex ? this._musicIndex - 1 : (isCurrentTrack ? i % this._musicPlaylist.length : this._musicIndex);
        this._loadTrack(newIdx);
        if (wasPlaying && isCurrentTrack) { this.backgroundMusic.play().catch(() => {}); }
        else if (!wasPlaying) { this.isMusicPlaying = false; }
        const playBtn = document.getElementById('rp-music-play');
        if (playBtn) playBtn.textContent = this.isMusicPlaying ? '⏸' : '▶';
      }
      this._triggerAutosave();
      this._renderMusicPlaylist();
    });
    list.appendChild(item);
  });
}
  selectSource(src) {
    this.selectedSource = src;
  }

  /**
   * Re-render danh sách tác phẩm đã upload trong pane-artwork.
   * Được gọi mỗi khi có file mới được upload thành công.
   */
  _renderUploadedList() {
    if (!this._rowRefs) return;

    // Thumbnail + source cache from session uploads (keyed by storageUrl)
    const thumbCache = new Map();
    for (const item of this._uploadedSources) {
      const key = item.src?.storageUrl;
      if (key && !thumbCache.has(key)) thumbCache.set(key, item);
    }

    // Build unique list from what's actually placed in the room
    const byType = { image: [], video: [], model: [], youtube: [] };
    const seenUrls = new Set();

    for (const a of this.artworks) {
      const key = a.storageUrl;
      if (!key || seenUrls.has(key)) continue;
      seenUrls.add(key);
      const cached = thumbCache.get(key);
      const type = a.isYouTube ? 'youtube' : (a.isVideo ? 'video' : 'image');
      byType[type].push({
        label: cached?.label || (a.isYouTube ? ('YouTube: ' + a.youtubeId) : key.split('/').pop().replace(/^\d+_/, '')) || key,
        type,
        src: cached?.src || { storageUrl: key, isYouTube: a.isYouTube, youtubeId: a.youtubeId },
        thumbCanvas: cached?.thumbCanvas || null,
      });
    }

    for (const m of this.models3d) {
      const key = m.storageUrl;
      if (!key || seenUrls.has(key)) continue;
      seenUrls.add(key);
      const cached = thumbCache.get(key);
      byType['model'].push({
        label: cached?.label || m.name || key.split('/').pop().replace(/^\d+_/, '') || key,
        type: 'model',
        src: cached?.src || { storageUrl: key },
        thumbCanvas: null,
      });
    }

    const renderInner = (inner, items, type) => {
      inner.innerHTML = '';
      if (!items.length) {
        inner.style.gridTemplateColumns = '1fr';
        const empty = document.createElement('div');
        empty.style.cssText = 'font-size:13px;color:rgb(255, 255, 255);font-family:monospace;padding:8px 0;text-align:center;';
        empty.textContent = 'Chưa có tệp nào';
        inner.appendChild(empty);
        return;
      }
      inner.style.gridTemplateColumns = 'repeat(3,1fr)';
      items.forEach((item, idx) => {
        const card = document.createElement('div');
        card.style.cssText = 'position:relative;border-radius:7px;overflow:hidden;cursor:pointer;background:rgba(255, 255, 255, 0.55);transition:border-color .2s,transform .15s;aspect-ratio:1;';
        card.title = item.label;
        if (type === 'model') {
          const icon = document.createElement('div');
          icon.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:22px;background:rgba(255,255,255,0.08);';
          icon.textContent = '\u{1F4E6}';
          card.appendChild(icon);
        } else if (item.thumbCanvas) {
          const imgEl = document.createElement('img');
          imgEl.src = item.thumbCanvas.toDataURL();
          imgEl.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;background: rgba(255, 255, 255, 0.57);';
          card.appendChild(imgEl);
          if (type === 'video') {
            const badge = document.createElement('div');
            badge.style.cssText = 'position:absolute;bottom:3px;left:3px;background:rgba(18, 47, 106, 1);color:#fff;font-size:13px;padding:5px 4px;';
            badge.textContent = '\u25B6';
            card.appendChild(badge);
          }
        }
        const lbl = document.createElement('div');
        lbl.style.cssText = 'position:absolute;bottom:0;left:0;right:0;background:rgba(18,47,106,1);color:#FFFFFF;font-size:9px;padding:3px 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:"Montserrat",sans-serif;font-weight:700;line-height:1.3;';
        lbl.textContent = item.label.replace(/\.[^.]+$/, '').substring(0, 14);
        card.appendChild(lbl);

        // Nút xóa ✕ đỏ ở góc trên phải
        const delBtn = document.createElement('button');
        delBtn.style.cssText = 'position:absolute;top:3px;right:3px;width:16px;height:16px;background:rgba(181,74,58,.9);border:none;border-radius:50%;color:#fff;font-size:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;line-height:1;z-index:2;';
        delBtn.textContent = '✕';
        delBtn.title = 'Xoá tác phẩm';
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._showDeleteSourceConfirm(item, () => {
            this._deleteSourceByStorageUrl(item);
          });
        });
        card.appendChild(delBtn);

        const updateAllCards = () => {
          document.querySelectorAll('[data-upcard]').forEach(c => {
            const [t, i] = c.dataset.upcard.split('-');
            const s = this._uploadedSources.filter(x => x.type === t)[+i];
            const sel = s && s.src === this.selectedSource;
            c.style.borderColor = sel ? '#68e5e3' : 'rgba(255,255,255,0.1)';
            c.style.transform   = sel ? 'scale(1.05)' : '';
          });
        };
        card.addEventListener('click', () => {
          this.selectSource(item.src);
          this.setMode('place');
          updateAllCards();
        });
        card.dataset.upcard = type + '-' + idx;
        const isSel = this.selectedSource === item.src;
        card.style.borderColor = isSel ? '#68e5e3' : 'rgba(255,255,255,0.1)';
        card.style.transform   = isSel ? 'scale(1.05)' : '';
        inner.appendChild(card);
      });
    };

    for (const [type, row] of Object.entries(this._rowRefs)) {
      if (type === 'text' || !row._inner) continue;
      const items = byType[type] || [];
      renderInner(row._inner, items, type);
      if (items.length && !row._openState()) row._toggle();
    }

    // YouTube thumbnail badge
    const ytRow = this._rowRefs?.youtube;
    if (ytRow?._inner) {
      ytRow._inner.querySelectorAll('[data-upcard]').forEach(card => {
        if (!card.querySelector('.yt-badge')) {
          const badge = document.createElement('div');
          badge.className = 'yt-badge';
          badge.style.cssText = 'position:absolute;top:3px;right:3px;background:#ff0000;color:#fff;font-size:8px;font-weight:700;padding:2px 5px;border-radius:3px;font-family:monospace;';
          badge.textContent = 'YT';
          card.appendChild(badge);
        }
      });
    }
  }
  /**
   * Hiện dialog cảnh báo trước khi xóa tác phẩm khỏi danh sách.
   * Cảnh báo rằng object đặt trong phòng cũng sẽ bị gỡ theo.
   */
  _showDeleteSourceConfirm(item, onConfirm) {
    // Xóa dialog cũ nếu còn tồn tại
    const existing = document.getElementById('del-source-confirm-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'del-source-confirm-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);';

    const shortName = item.label.replace(/\.[^.]+$/, '').substring(0, 20);

    overlay.innerHTML = `
      <div style="background:linear-gradient(135deg,rgba(18,47,106,0.98),rgba(35,92,208,0.95));border:1px solid rgba(104,229,227,0.35);border-radius:14px;padding:28px 32px;max-width:340px;width:90%;font-family:'Montserrat',sans-serif;display:flex;flex-direction:column;gap:14px;box-shadow:0 20px 60px rgba(0,0,0,0.6);">
        <div style="font-size:28px;text-align:center;">\u26A0\uFE0F</div>
        <div style="color:#fff;font-size:13px;font-weight:700;text-align:center;letter-spacing:.05em;">Xóa tác phẩm?</div>
        <div style="color:rgba(255,255,255,0.75);font-size:11px;line-height:1.7;text-align:center;">
          T\u00E1c ph\u1EA9m <strong style="color:#68e5e3;">"${shortName}"</strong> \u0111ang \u0111\u01B0\u1EE3c \u0111\u1EB7t trong ph\u00F2ng s\u1EBD b\u1ECB g\u1EE1 xu\u1ED1ng.<br>Xác nhận xóa?
        </div>
        <div style="display:flex;gap:10px;margin-top:4px;">
          <button id="del-src-cancel" style="flex:1;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;font-family:'Montserrat',sans-serif;font-size:12px;cursor:pointer;transition:all .15s;">Hu\u1EF7</button>
          <button id="del-src-confirm" style="flex:1;padding:10px;border-radius:8px;border:none;background:rgba(181,74,58,0.9);color:#fff;font-family:'Montserrat',sans-serif;font-size:12px;font-weight:700;cursor:pointer;transition:all .15s;">Xóa</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#del-src-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#del-src-confirm').addEventListener('click', () => {
      overlay.remove();
      onConfirm();
    });
    // Click nền để đóng
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  }

  /**
   * Xo\u00E0 m\u1ED9t source kh\u1ECFi _uploadedSources (theo storageUrl ho\u1EB7c reference),
   * \u0111\u1ED3ng th\u1EDDi g\u1EE1 t\u1EA5t c\u1EA3 artworks v\u00E0 models3D trong scene c\u00F3 c\u00F9ng storageUrl.
   */
  _deleteSourceByStorageUrl(item) {
    const storageUrl = item.src?.storageUrl;

    // 1. Xóa khỏi _uploadedSources (theo src reference hoặc storageUrl)
    this._uploadedSources = this._uploadedSources.filter(s => {
      if (storageUrl) return s.src?.storageUrl !== storageUrl;
      return s.src !== item.src;
    });

    // 2. Nếu đang chọn source này thì bỏ chọn
    if (this.selectedSource === item.src ||
        (storageUrl && this.selectedSource?.storageUrl === storageUrl)) {
      this.selectedSource = null;
      this.setMode('select');
    }

    // 3. Xóa tất cả artworks trong scene có cùng storageUrl
    const artToRemove = this.artworks.filter(a =>
      storageUrl ? a.storageUrl === storageUrl : false
    );
    for (const aw of artToRemove) {
      this.threeScene.remove(aw.group);
    }
    this.artworks = this.artworks.filter(a =>
      storageUrl ? a.storageUrl !== storageUrl : true
    );

    // 4. Xóa tất cả models3d trong scene có cùng storageUrl
    const modToRemove = this.models3d.filter(m =>
      storageUrl ? m.storageUrl === storageUrl : false
    );
    for (const md of modToRemove) {
      if (md.object)   this.threeScene.remove(md.object);
      if (md.light)    this.threeScene.remove(md.light);
      if (md.pedestal) this.threeScene.remove(md.pedestal);
    }
    this.models3d = this.models3d.filter(m =>
      storageUrl ? m.storageUrl !== storageUrl : true
    );

    // 5. Nếu selectedItem đang chọn object vừa bị xóa → bỏ chọn
    if (this.selectedItem) {
      const selStorageUrl = this.selectedItem.data?.storageUrl;
      if (storageUrl && selStorageUrl === storageUrl) {
        this.deselectItem();
      }
    }

    // 6. Re-render danh sách và autosave
    this._renderUploadedList();
    this._triggerAutosave();

    const count = artToRemove.length + modToRemove.length;
    const countStr = count > 0 ? ` (\u0111\u00E3 g\u1EE1 ${count} object kh\u1ECFi ph\u00F2ng)` : '';
    this.toast(`\u0110\u00E3 xo\u00E0 t\u00E1c ph\u1EA9m${countStr}`, 'info');
  }

  /* ── Render danh sách text vào dropdown row "Văn bản" ── */
  _renderTextList() {
    const row = this._rowRefs?.text;
    if (!row?._inner) return;

    const inner = row._inner;
    const texts = this.textEditor?.texts || [];

    inner.innerHTML = '';

    if (!texts.length) {
      inner.style.gridTemplateColumns = '1fr';
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size:13px;color:#fff;font-family:monospace;padding:8px 0;text-align:center;';
      empty.textContent = 'Chưa có văn bản nào';
      inner.appendChild(empty);
      return;
    }

    inner.style.gridTemplateColumns = 'repeat(3,1fr)';
    texts.forEach((txt, idx) => {
      const card = document.createElement('div');
      card.style.cssText = 'position:relative;border-radius:7px;overflow:hidden;cursor:pointer;background:rgba(20,30,60,0.85);transition:transform .15s;aspect-ratio:1;display:flex;align-items:center;justify-content:center;border:1.5px solid rgba(255,255,255,0.15);';
      card.title = txt.data.content;

      // Chữ T làm icon đại diện
      const icon = document.createElement('div');
      icon.style.cssText = `width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:bold;color:${txt.data.styles?.color || '#fff'};font-family:"Segoe UI",sans-serif;`;
      icon.textContent = 'T';
      card.appendChild(icon);

      // Label nội dung text
      const lbl = document.createElement('div');
      lbl.style.cssText = 'position:absolute;bottom:0;left:0;right:0;background:rgba(18,47,106,1);color:#FFF;font-size:9px;padding:3px 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:"Montserrat",sans-serif;font-weight:700;line-height:1.3;';
      lbl.textContent = txt.data.content.substring(0, 14);
      card.appendChild(lbl);

      // Nút xóa
      const delBtn = document.createElement('button');
      delBtn.style.cssText = 'position:absolute;top:3px;right:3px;width:16px;height:16px;background:rgba(181,74,58,.9);border:none;border-radius:50%;color:#fff;font-size:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;line-height:1;';
      delBtn.textContent = '✕';
      delBtn.title = 'Xoá văn bản';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.textEditor.removeTextAtIndex(idx);
      });
      card.appendChild(delBtn);

      // Click để chọn và chỉnh sửa
      card.addEventListener('click', () => {
        this.textEditor.selectTextForEdit(idx);
      });

      inner.appendChild(card);
    });

    // Tự mở dropdown khi có text đầu tiên
    if (texts.length === 1 && !row._openState()) {
      row._toggle();
    }
  }

  /* ══════════════════════════════════════════════ FILL PANE ══════════════════════════════════════════════ */
  _fillPane(paneId, pane) {
    switch (paneId) {

      // ── Bước 01: Template ──
      case 'pane-template':
        pane.style.paddingTop = '60px'; 
        pane.innerHTML = `<div class="rp-section-title">Chọn mẫu phòng</div>`;
        const tplList = document.createElement('div');
        tplList.id = 'rp-template-list';
        tplList.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;margin-top:6px;justify-content:center;';
        pane.appendChild(tplList);
        this._loadRpTemplateList(tplList);
        break;

      // ── Bước 03: Tường nội thất ──
      case 'pane-wall':
        pane.style.background = "linear-gradient(135deg, rgba(18,47,106,1), rgba(118,170,171,1))";
        pane.style.backgroundSize = '';
        pane.style.fontFamily = "'Montserrat', sans-serif";
        pane.style.color = "#FFFFFF";
        pane.style.padding = '20px';
        pane.style.boxSizing = 'border-box';
        pane.style.width = '418px';
        pane.style.minHeight = '409.81px';
        pane.style.borderRadius = '17px';
        {
          // Tiêu đề + mô tả
          const title = document.createElement('div');
          title.className = 'rp-section-title';
          title.textContent = 'Tường nội thất';
          pane.appendChild(title);

          const hint = document.createElement('div');
          hint.style.cssText = 'color:rgba(255,255,255,0.4);font-size:10px;line-height:1.7;margin-bottom:8px';
          hint.innerHTML = 'Thêm tường vào bất kỳ vị trí nào trong phòng.<br>Có thể treo tranh lên cả 2 mặt tường.';
          pane.appendChild(hint);

          // Nút thêm tường
          const addWallBtn = document.createElement('button');
          addWallBtn.className = 'rp-pub-btn primary';
          addWallBtn.style.cssText = 'width:100%;margin-bottom:10px;font-size:11px;';
          addWallBtn.textContent = '➕ Thêm tường mới';
          addWallBtn.addEventListener('click', () => {
            this._wallPlacingMode = true;
            this.renderer.domElement.style.cursor = 'crosshair';
            this.toast('Click lên sàn để đặt tường', 'info');
          });
          pane.appendChild(addWallBtn);

          // Danh sách tường
          const wallListEl = document.createElement('div');
          wallListEl.id = 'rp-wall-list';
          wallListEl.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-bottom:8px;';
          pane.appendChild(wallListEl);

          // ── Bảng cấu hình tường (ẩn mặc định, hiện khi chọn tường) ──
          const cfgBox = document.createElement('div');
          cfgBox.id = 'rp-wall-cfg';
          cfgBox.style.cssText = 'display:none;flex-direction:column;gap:8px;background:rgba(255,255,255,0.06);border:.5px solid rgba(104,229,227,0.35);border-radius:8px;padding:12px;margin-top:4px;';
          cfgBox.innerHTML = `
            <div style="color:#68e5e3;font-size:11px;font-weight:700;letter-spacing:.08em;margin-bottom:2px">⚙ Cấu hình tường</div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="color:rgba(255,255,255,0.5);font-size:10px;width:90px;flex-shrink:0;">Chiều rộng</span>
              <input type="range" id="rp-wc-width" min="0.5" max="10" step="0.1" value="3" style="flex:1;-webkit-appearance:none;height:2px;background:rgba(255,255,255,0.2);border-radius:1px;outline:none;cursor:pointer;">
              <span id="rp-wc-width-val" style="color:#fff;font-size:10px;width:36px;text-align:right;">3.0m</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="color:rgba(255,255,255,0.5);font-size:10px;width:90px;flex-shrink:0;">Chiều cao</span>
              <input type="range" id="rp-wc-height" min="0.5" max="6" step="0.1" value="3" style="flex:1;-webkit-appearance:none;height:2px;background:rgba(255,255,255,0.2);border-radius:1px;outline:none;cursor:pointer;">
              <span id="rp-wc-height-val" style="color:#fff;font-size:10px;width:36px;text-align:right;">3.0m</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="color:rgba(255,255,255,0.5);font-size:10px;width:90px;flex-shrink:0;">Độ dày</span>
              <input type="range" id="rp-wc-thick" min="0.05" max="0.5" step="0.01" value="0.1" style="flex:1;-webkit-appearance:none;height:2px;background:rgba(255,255,255,0.2);border-radius:1px;outline:none;cursor:pointer;">
              <span id="rp-wc-thick-val" style="color:#fff;font-size:10px;width:36px;text-align:right;">0.10m</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="color:rgba(255,255,255,0.5);font-size:10px;width:90px;flex-shrink:0;">Trái / Phải</span>
              <input type="range" id="rp-wc-posx" min="-20" max="20" step="0.1" value="0" style="flex:1;-webkit-appearance:none;height:2px;background:rgba(255,255,255,0.2);border-radius:1px;outline:none;cursor:pointer;">
              <span id="rp-wc-posx-val" style="color:#fff;font-size:10px;width:36px;text-align:right;">0.0m</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="color:rgba(255,255,255,0.5);font-size:10px;width:90px;flex-shrink:0;">Tiến / Lùi</span>
              <input type="range" id="rp-wc-posz" min="-20" max="20" step="0.1" value="0" style="flex:1;-webkit-appearance:none;height:2px;background:rgba(255,255,255,0.2);border-radius:1px;outline:none;cursor:pointer;">
              <span id="rp-wc-posz-val" style="color:#fff;font-size:10px;width:36px;text-align:right;">0.0m</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="color:rgba(255,255,255,0.5);font-size:10px;width:90px;flex-shrink:0;">Xoay</span>
              <input type="range" id="rp-wc-roty" min="-180" max="180" step="1" value="0" style="flex:1;-webkit-appearance:none;height:2px;background:rgba(255,255,255,0.2);border-radius:1px;outline:none;cursor:pointer;">
              <span id="rp-wc-roty-val" style="color:#fff;font-size:10px;width:36px;text-align:right;">0°</span>
            </div>
            <hr style="border:none;border-top:.5px solid rgba(255,255,255,0.1);margin:2px 0;">
            <div style="color:rgba(255,255,255,0.5);font-size:9px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:2px;">Trang trí mặt tường</div>
            <div style="display:flex;gap:6px;" id="rp-wc-side-tabs">
              <div class="rp-wc-tab active" data-side="front" style="flex:1;padding:5px;font-size:10px;cursor:pointer;text-align:center;background:rgba(104,229,227,0.15);border:.5px solid rgba(104,229,227,0.5);border-radius:4px;color:#68e5e3;transition:all .15s;">Mặt trước</div>
              <div class="rp-wc-tab" data-side="back" style="flex:1;padding:5px;font-size:10px;cursor:pointer;text-align:center;background:rgba(255,255,255,0.05);border:.5px solid rgba(255,255,255,0.15);border-radius:4px;color:rgba(255,255,255,0.5);transition:all .15s;">Mặt sau</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="color:rgba(255,255,255,0.5);font-size:10px;width:90px;flex-shrink:0;">Màu tường</span>
              <input type="color" id="rp-wc-color" value="#f5f0e8" style="width:36px;height:26px;border:none;border-radius:4px;cursor:pointer;background:none;padding:0;flex-shrink:0;">
            </div>
            <div style="color:rgba(255,255,255,0.4);font-size:9px;letter-spacing:.06em;margin-top:2px;">Giấy dán tường</div>
            <button id="rp-wc-no-wp" style="background:rgba(255,255,255,0.05);border:.5px solid rgba(255,255,255,0.15);border-radius:4px;color:rgba(255,255,255,0.5);font-size:9px;padding:4px 8px;cursor:pointer;text-align:left;">✕ Không dán giấy</button>
            <div id="rp-wc-wp-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:2px;"></div>
          `;
          pane.appendChild(cfgBox);

          // Slider thumb style
          const sliderStyle = document.createElement('style');
          sliderStyle.textContent = `
            #rp-wall-cfg input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;border-radius:50%;background:#68e5e3;cursor:pointer;}
            .rp-wc-tab{user-select:none;}
            #rp-wc-wp-grid .wp-thumb{aspect-ratio:1;border-radius:4px;border:1.5px solid rgba(255,255,255,0.15);cursor:pointer;overflow:hidden;transition:all .15s;}
            #rp-wc-wp-grid .wp-thumb:hover{border-color:#68e5e3;}
            #rp-wc-wp-grid .wp-thumb.sel{border-color:#68e5e3;outline:2px solid rgba(104,229,227,0.5);}
            #rp-wc-wp-grid .wp-thumb img{width:100%;height:100%;object-fit:cover;display:block;}
          `;
          document.head.appendChild(sliderStyle);
          this._el(sliderStyle);

          // Helper: sync cfg UI từ wall object
          const syncCfgFromWall = (w) => {
            if (!w) return;
            const side = this._wcCurrentSide || 'front';
            const color = side === 'front' ? (w.frontColor || '#f5f0e8') : (w.backColor || '#f5f0e8');
            cfgBox.querySelector('#rp-wc-width').value = w.width;
            cfgBox.querySelector('#rp-wc-width-val').textContent = w.width.toFixed(1) + 'm';
            cfgBox.querySelector('#rp-wc-height').value = w.height;
            cfgBox.querySelector('#rp-wc-height-val').textContent = w.height.toFixed(1) + 'm';
            cfgBox.querySelector('#rp-wc-thick').value = w.thickness;
            cfgBox.querySelector('#rp-wc-thick-val').textContent = w.thickness.toFixed(2) + 'm';
            const posX = w.group ? w.group.position.x : 0;
            const posZ = w.group ? w.group.position.z : 0;
            cfgBox.querySelector('#rp-wc-posx').value = posX;
            cfgBox.querySelector('#rp-wc-posx-val').textContent = posX.toFixed(1) + 'm';
            cfgBox.querySelector('#rp-wc-posz').value = posZ;
            cfgBox.querySelector('#rp-wc-posz-val').textContent = posZ.toFixed(1) + 'm';
            const rotDeg = w.group ? Math.round(THREE.MathUtils.radToDeg(w.group.rotation.y)) : 0;
            cfgBox.querySelector('#rp-wc-roty').value = rotDeg;
            cfgBox.querySelector('#rp-wc-roty-val').textContent = rotDeg + '°';
            cfgBox.querySelector('#rp-wc-color').value = color;
            renderWpGrid(w);
          };

          // Helper: render wallpaper grid
          const renderWpGrid = (w) => {
            const grid = cfgBox.querySelector('#rp-wc-wp-grid');
            if (!grid) return;
            grid.innerHTML = '';
            if (!this._wallWallpapers?.length) {
              grid.innerHTML = '<div style="grid-column:1/-1;color:rgba(255,255,255,0.2);font-size:9px;text-align:center;padding:6px 0;">Chưa có giấy dán tường</div>';
              return;
            }
            const side = this._wcCurrentSide || 'front';
            const cur = side === 'front' ? w?.frontWallpaper : w?.backWallpaper;
            this._wallWallpapers.forEach(wp => {
              const file = `/wallpapers/${wp.file}`;
              const div = document.createElement('div');
              div.className = 'wp-thumb' + (cur === file ? ' sel' : '');
              div.title = wp.name || wp.file;
              const img = document.createElement('img');
              img.src = `/wallpapers/${wp.thumb || wp.file}`;
              img.onerror = () => { div.style.background = '#444'; };
              div.appendChild(img);
              div.addEventListener('click', () => {
                if (!this._selectedWall) return;
                if (side === 'front') this._selectedWall.frontWallpaper = file;
                else this._selectedWall.backWallpaper = file;
                this._applyWallMaterials(this._selectedWall);
                renderWpGrid(this._selectedWall);
                this._triggerAutosave();
              });
              grid.appendChild(div);
            });
          };

          // Side tabs
          cfgBox.querySelectorAll('.rp-wc-tab').forEach(tab => {
            tab.addEventListener('click', () => {
              this._wcCurrentSide = tab.dataset.side;
              cfgBox.querySelectorAll('.rp-wc-tab').forEach(t => {
                const isActive = t === tab;
                t.classList.toggle('active', isActive);
                t.style.background = isActive ? 'rgba(104,229,227,0.15)' : 'rgba(255,255,255,0.05)';
                t.style.borderColor = isActive ? 'rgba(104,229,227,0.5)' : 'rgba(255,255,255,0.15)';
                t.style.color = isActive ? '#68e5e3' : 'rgba(255,255,255,0.5)';
              });
              if (this._selectedWall) syncCfgFromWall(this._selectedWall);
            });
          });

          // Sliders
          cfgBox.querySelector('#rp-wc-width').addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            cfgBox.querySelector('#rp-wc-width-val').textContent = val.toFixed(1) + 'm';
            if (this._selectedWall) { this._selectedWall.width = val; this._applyWallDimensions(this._selectedWall); this._triggerAutosave(); }
          });
          cfgBox.querySelector('#rp-wc-height').addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            cfgBox.querySelector('#rp-wc-height-val').textContent = val.toFixed(1) + 'm';
            if (this._selectedWall) { this._selectedWall.height = val; this._applyWallDimensions(this._selectedWall); this._triggerAutosave(); }
          });
          cfgBox.querySelector('#rp-wc-thick').addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            cfgBox.querySelector('#rp-wc-thick-val').textContent = val.toFixed(2) + 'm';
            if (this._selectedWall) { this._selectedWall.thickness = val; this._applyWallDimensions(this._selectedWall); this._triggerAutosave(); }
          });
          cfgBox.querySelector('#rp-wc-posx').addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            cfgBox.querySelector('#rp-wc-posx-val').textContent = val.toFixed(1) + 'm';
            if (this._selectedWall?.group) {
              const delta = val - this._selectedWall.group.position.x;
              this._selectedWall.group.position.x = val;
              this._moveWallContents(this._selectedWall, delta, 0);
              this._triggerAutosave();
            }
          });
          cfgBox.querySelector('#rp-wc-posz').addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            cfgBox.querySelector('#rp-wc-posz-val').textContent = val.toFixed(1) + 'm';
            if (this._selectedWall?.group) {
              const delta = val - this._selectedWall.group.position.z;
              this._selectedWall.group.position.z = val;
              this._moveWallContents(this._selectedWall, 0, delta);
              this._triggerAutosave();
            }
          });

          cfgBox.querySelector('#rp-wc-roty').addEventListener('input', (e) => {
            const deg = parseFloat(e.target.value);
            cfgBox.querySelector('#rp-wc-roty-val').textContent = Math.round(deg) + '°';
            if (this._selectedWall?.group) {
              const oldRad = this._selectedWall.group.rotation.y;
              const newRad = THREE.MathUtils.degToRad(deg);
              this._rotateWallContents(this._selectedWall, oldRad, newRad);
              this._selectedWall.group.rotation.y = newRad;
              this._triggerAutosave();
            }
          });

          // Color
          cfgBox.querySelector('#rp-wc-color').addEventListener('input', (e) => {
            if (!this._selectedWall) return;
            const side = this._wcCurrentSide || 'front';
            if (side === 'front') this._selectedWall.frontColor = e.target.value;
            else this._selectedWall.backColor = e.target.value;
            this._applyWallMaterials(this._selectedWall);
            this._triggerAutosave();
          });

          // No wallpaper
          cfgBox.querySelector('#rp-wc-no-wp').addEventListener('click', () => {
            if (!this._selectedWall) return;
            const side = this._wcCurrentSide || 'front';
            if (side === 'front') this._selectedWall.frontWallpaper = null;
            else this._selectedWall.backWallpaper = null;
            this._applyWallMaterials(this._selectedWall);
            renderWpGrid(this._selectedWall);
            this._triggerAutosave();
          });

          // Gán helper để _openWallCfg từ bên ngoài có thể gọi sync
          this._rpWallCfgSync = (w) => {
            cfgBox.style.display = w ? 'flex' : 'none';
            if (w) syncCfgFromWall(w);
          };

          // Render danh sách tường
          const renderRpWalls = () => {
            wallListEl.innerHTML = '';
            if (!this.interiorWalls.length) {
              wallListEl.innerHTML = '<div style="color:rgba(255,255,255,0.2);font-size:10px;text-align:center;padding:16px 0">Chưa có tường nào</div>';
              return;
            }
            this.interiorWalls.forEach((w, i) => {
              const item = document.createElement('div');
              const isSel = this._selectedWall === w;
              item.style.cssText = `display:flex;align-items:center;gap:8px;background:${isSel ? 'rgba(104,229,227,0.1)' : 'rgba(255,255,255,0.05)'};border:.5px solid ${isSel ? 'rgba(104,229,227,0.5)' : 'rgba(255,255,255,0.15)'};border-radius:6px;padding:8px 10px;cursor:pointer;transition:all .15s;`;
              item.innerHTML = `
                <span style="color:rgba(255,255,255,0.85);font-size:11px;flex:1;">🧱 Tường ${i+1} <span style="color:rgba(255,255,255,0.35);font-size:9px;">${w.width.toFixed(1)}×${w.height.toFixed(1)}m</span></span>
                <button data-del="${i}" style="background:rgba(181,74,58,.5);color:#fff;border:none;border-radius:3px;font-size:9px;padding:3px 7px;cursor:pointer;">✕</button>
              `;
              item.querySelector('button').addEventListener('click', (e) => {
                e.stopPropagation();
                this._deleteInteriorWall(i);
              });
              item.addEventListener('click', () => {
                this.selectItem('wall', w, i);
                this._selectedWall = w;
                this._wcCurrentSide = 'front';
                cfgBox.querySelectorAll('.rp-wc-tab').forEach(t => {
                  const isActive = t.dataset.side === 'front';
                  t.style.background = isActive ? 'rgba(104,229,227,0.15)' : 'rgba(255,255,255,0.05)';
                  t.style.borderColor = isActive ? 'rgba(104,229,227,0.5)' : 'rgba(255,255,255,0.15)';
                  t.style.color = isActive ? '#68e5e3' : 'rgba(255,255,255,0.5)';
                });
                cfgBox.style.display = 'flex';
                syncCfgFromWall(w);
                renderRpWalls();
              });
              wallListEl.appendChild(item);
            });
          };

          this._rpWallListRefresh = () => {
            renderRpWalls();
            if (this._selectedWall && this._rpWallCfgSync) this._rpWallCfgSync(this._selectedWall);
          };
          renderRpWalls();
        }
        break;

      // ── Bước 02: Âm thanh ──
      case 'pane-music':
        pane.style.background = "url('/panelstudio/subtabbg.svg') no-repeat center center";
        pane.style.backgroundSize = '100% 100%';
        pane.style.width = '418px';
        pane.style.minHeight = '409.81px';
        pane.style.borderRadius = '17px';
        pane.style.padding = '20px';
        pane.style.boxSizing = 'border-box';
        pane.innerHTML = `
          <div class="rp-section-title">Nhạc nền</div>
          <div class="rp-music-row">
            <button class="rp-music-btn" id="rp-music-play">▶</button>
            <span class="rp-music-name" id="rp-music-name">${this._musicPlaylist.length ? '🎵 ' + (this._musicPlaylist[this._musicIndex]?.name || '') : 'Chưa có nhạc'}</span>
            <input type="range" class="rp-music-vol" id="rp-music-vol" min="0" max="1" step="0.01" value="${this.backgroundMusic ? this.backgroundMusic.volume : 0.5}">
          </div>
          <div class="rp-playlist" id="rp-playlist"></div>
          <div class="rp-upload-btn" id="rp-music-upload">+ Upload nhạc (MP3 · WAV · OGG)</div>
          <input type="file" id="rp-fi-music" accept="audio/*" multiple style="display:none">
        `;
        this._renderMusicPlaylist();
        pane.querySelector('#rp-music-upload').addEventListener('click', () => pane.querySelector('#rp-fi-music').click());
        pane.querySelector('#rp-fi-music').addEventListener('change', (e) => this._handleMusicUpload(e));
        pane.querySelector('#rp-music-play').addEventListener('click', () => {
          if (!this.backgroundMusic) return;
          if (this.isMusicPlaying) { this.backgroundMusic.pause(); this.isMusicPlaying = false; pane.querySelector('#rp-music-play').textContent = '▶'; }
          else { this.backgroundMusic.play(); this.isMusicPlaying = true; pane.querySelector('#rp-music-play').textContent = '⏸'; }
        });
        pane.querySelector('#rp-music-vol').addEventListener('input', (e) => { if (this.backgroundMusic) this.backgroundMusic.volume = +e.target.value; });
        if (this.isMusicPlaying) { pane.querySelector('#rp-music-play').textContent = '⏸'; }
        break;

      // ── Bước 02: Đồ trang trí ──
      case 'pane-decor':
        pane.style.paddingTop = '5px';
        pane.innerHTML = `<div class="rp-section-title">Thêm đồ trang trí</div>`;
        {
          const pedestalRow = document.createElement('div');
          pedestalRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:2px 10px 8px;';
          pedestalRow.innerHTML = `<label style="color:#FFFFFF;font-size:11px;cursor:pointer;display:flex;align-items:center;gap:6px;"><input type="checkbox" id="rp-pedestal-toggle" style="accent-color:#68e5e3;cursor:pointer;width:13px;height:13px;"> Đặt trên bục trắng</label>`;
          pane.appendChild(pedestalRow);
          const pedestalChk = pedestalRow.querySelector('#rp-pedestal-toggle');
          pedestalChk.checked = this._usePedestal;
          pedestalChk.addEventListener('change', (e) => { this._usePedestal = e.target.checked; });
        }
        const decorGrid = document.createElement('div');
        decorGrid.id = 'rp-decor-grid';
        decorGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:0px;width:100%;box-sizing:border-box;padding:0 10px;';

        pane.appendChild(decorGrid);
        this._loadRpDecorList(decorGrid);
        break;

      // ── Bước 03: HDR cảnh ngoài ──
      case 'pane-hdr':
        pane.style.backgroundSize = '100% 100%';
        pane.style.width = '418px';
        pane.style.minHeight = '409.81px';
        pane.style.borderRadius = '17px';
        pane.style.padding = '20px';
        pane.style.boxSizing = 'border-box';
        pane.innerHTML = `<div class="rp-section-title">Cảnh vật</div>`;
        {
          const hdrGrid = document.createElement('div');
          hdrGrid.id = 'rp-hdr-grid';
          hdrGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px;';
          pane.appendChild(hdrGrid);
          this._loadRpHDRList(hdrGrid);
        }
        break;

      // ── Bước 02: Đèn ──
      case 'pane-light':
        pane.style.background = "url('/panelstudio/subtabbg.svg') no-repeat center center";
        pane.style.backgroundSize = '100% 100%';
        pane.style.width = '418px';
        pane.style.minHeight = '409.81px';
        pane.style.borderRadius = '17px';
        pane.style.padding = '20px';
        pane.style.boxSizing = 'border-box';
        pane.innerHTML = `
          <div class="rp-section-title">Ánh sáng</div>
          <div class="rp-lp-row"><span class="rp-lp-label">Ambient</span><input type="range" class="rp-lp-range" id="rp-amb-intensity" min="0" max="2" step="0.01" value="1.2"><span class="rp-lp-val" id="rp-amb-val">1.20</span></div>
          <div class="rp-lp-row"><span class="rp-lp-label">Màu ambient</span><input type="color" class="rp-lp-color" id="rp-amb-color" value="#ffffff"></div>
          <div class="rp-lp-row"><span class="rp-lp-label">Hemisphere</span><input type="range" class="rp-lp-range" id="rp-hemi-intensity" min="0" max="1.5" step="0.01" value="0.5"><span class="rp-lp-val" id="rp-hemi-val">0.50</span></div>
          <div class="rp-lp-row"><span class="rp-lp-label">Directional</span><input type="range" class="rp-lp-range" id="rp-dir-intensity" min="0" max="3" step="0.01" value="1.2"><span class="rp-lp-val" id="rp-dir-val">1.20</span></div>
        `;
        pane.querySelector('#rp-amb-intensity').addEventListener('input', (e) => { this.ambLight.intensity = +e.target.value; pane.querySelector('#rp-amb-val').textContent = (+e.target.value).toFixed(2); });
        pane.querySelector('#rp-amb-color').addEventListener('input', (e) => { this.ambLight.color.set(e.target.value); });
        pane.querySelector('#rp-hemi-intensity').addEventListener('input', (e) => { this.hemiLight.intensity = +e.target.value; pane.querySelector('#rp-hemi-val').textContent = (+e.target.value).toFixed(2); });
        pane.querySelector('#rp-dir-intensity').addEventListener('input', (e) => { this.dirLight.intensity = +e.target.value; pane.querySelector('#rp-dir-val').textContent = (+e.target.value).toFixed(2); });
        break;

      // ── Bước 03: Path đường ──
      case 'pane-path':
        pane.style.background = "linear-gradient(135deg, rgba(18,47,106,1), rgba(118,170,171,1))";
        pane.style.backgroundSize = '100% 100%';
        pane.style.width = '418px';
        pane.style.minHeight = '409.81px';
        pane.style.borderRadius = '17px';
        pane.style.padding = '20px';
        pane.style.boxSizing = 'border-box';
        pane.innerHTML = `
          <div class="rp-section-title">Lộ trình đường đi (<span id="rp-path-wp-count">0</span> điểm)</div>
          <div style="display:flex;gap:8px;margin-bottom:6px;">
            <div class="rp-upload-btn" id="rp-path-add" style="flex:1;padding:8px;font-size:11px">＋ Thêm điểm hiện tại</div>
            <div class="rp-upload-btn" id="rp-path-walk" style="flex:1;padding:8px;font-size:11px">▶ Đi theo lộ trình</div>
          </div>
          <div id="rp-wp-list" style="display:flex;flex-direction:column;gap:4px;max-height:260px;overflow-y:auto;"></div>
          <div style="display:flex;gap:8px;margin-top:6px;">
            <div class="rp-upload-btn" id="rp-path-auto" style="flex:1;padding:6px;font-size:11px;">✦ Tự tạo lộ trình</div>
            <div class="rp-upload-btn" id="rp-path-clear" style="flex:1;padding:6px;font-size:11px;color:rgba(220,100,100,1);border-color:rgba(220,100,100,0.3);">✕ Xoá hết</div>
          </div>
        `;
        pane.querySelector('#rp-path-add').addEventListener('click', () => {
          this.addWaypoint(this.camera.position.x, this.camera.position.y, this.camera.position.z, this.yaw, this.pitch, '');
          this.currentWpIdx = this.pathWaypoints.length - 1;
          this.updateNavBar?.();
          this.toast(`Đã thêm điểm ${this.pathWaypoints.length}`, 'success');
          this._renderRpWpList(pane);
          pane.querySelector('#rp-path-wp-count').textContent = this.pathWaypoints.length;
        });
        pane.querySelector('#rp-path-walk').addEventListener('click', () => {
          if (!this.pathWaypoints.length) { this.toast('Chưa có điểm dừng nào', 'error'); return; }
          this.travelToWaypoint(0);
          const navBar = document.getElementById('path-nav-bar');
          if (navBar) navBar.classList.add('show');
        });
        pane.querySelector('#rp-path-auto').addEventListener('click', () => {
          this.autoGeneratePath?.();
          this._renderRpWpList(pane);
          pane.querySelector('#rp-path-wp-count').textContent = this.pathWaypoints.length;
        });
        pane.querySelector('#rp-path-clear').addEventListener('click', () => {
          this.clearWaypoints?.();
          this._renderRpWpList(pane);
          pane.querySelector('#rp-path-wp-count').textContent = 0;
          this.toast('Đã xoá hết điểm', 'info');
        });
        this._renderRpWpList(pane);
        pane.querySelector('#rp-path-wp-count').textContent = this.pathWaypoints.length;

        // ── Vị trí ban đầu của viewer (gộp vào tab Lộ trình) ──
        {
          const sep = document.createElement('hr');
          sep.style.cssText = 'border:none;border-top:0.5px solid rgba(212,197,169,0.15);margin:14px 0;';
          pane.appendChild(sep);

          const spawnTitle = document.createElement('div');
          spawnTitle.className = 'rp-section-title';
          spawnTitle.textContent = 'Vị trí ban đầu của viewer';
          pane.appendChild(spawnTitle);

          const spawnHint = document.createElement('div');
          spawnHint.style.cssText = 'color:rgb(255, 255, 255);font-size:10px;line-height:1.7;margin-bottom:14px;margin-top:4px';
          spawnHint.innerHTML = 'Di chuyển đến vị trí và hướng nhìn bạn muốn viewer bắt đầu,<br>sau đó bấm nút bên dưới để lưu lại.';
          pane.appendChild(spawnHint);

          const spawnStatus = document.createElement('div');
          spawnStatus.style.cssText = 'background:rgba(212,197,169,0.06);border:0.5px solid rgba(212,197,169,0.15);border-radius:4px;padding:10px 12px;font-family:monospace;font-size:9px;color:rgb(255, 213, 134);letter-spacing:.08em;line-height:1.9;margin-bottom:14px';
          this.viewerSpawn._refreshStatus(spawnStatus);
          pane.appendChild(spawnStatus);

          const spawnSetBtn = document.createElement('div');
          spawnSetBtn.className = 'rp-upload-btn';
          spawnSetBtn.style.cssText = 'padding:10px;font-size:11px;text-align:center;cursor:pointer;';
          spawnSetBtn.textContent = '📍 Đặt vị trí hiện tại làm điểm vào phòng';
          spawnSetBtn.addEventListener('click', () => {
            const s = this;
            this.viewerSpawn._data = { x: s.camera.position.x, y: s.camera.position.y, z: s.camera.position.z, yaw: s.yaw, pitch: s.pitch };
            this.viewerSpawn._refreshStatus(spawnStatus);
            s._triggerAutosave();
            s.toast('Đã lưu vị trí ban đầu của viewer ✓', 'success');
          });
          pane.appendChild(spawnSetBtn);

          const spawnClearBtn = document.createElement('div');
          spawnClearBtn.className = 'rp-upload-btn';
          spawnClearBtn.style.cssText = 'padding:8px;font-size:10px;text-align:center;cursor:pointer;color:rgba(220,100,100,0.8);border-color:rgba(220,100,100,0.3);margin-top:6px;';
          spawnClearBtn.textContent = '✕ Xoá — dùng vị trí mặc định';
          spawnClearBtn.addEventListener('click', () => {
            this.viewerSpawn._data = null;
            this.viewerSpawn._refreshStatus(spawnStatus);
            this._triggerAutosave();
            this.toast('Đã xoá vị trí ban đầu', 'info');
          });
          pane.appendChild(spawnClearBtn);
        }
        break;

      // ── Bước 02: Thêm tác phẩm ──
      case 'pane-artwork':
      {
        pane.style.cssText += 'padding:50px 12px 12px;display:flex;flex-direction:column;gap:8px;';

        const makeRow = ({ svgClass, label, type, onAdd }) => {
          const wrap = document.createElement('div');
          wrap.style.cssText = 'display:flex;flex-direction:column;';

          // Thanh chính
          const bar = document.createElement('div');
          bar.style.cssText = 'display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.08);border-radius:10px;padding:10px 12px;justify-content:flex-end;width:100%;height43px;';
          // Icon SVG background (dùng lại class cũ nếu có, fallback emoji)
          const iconWrap = document.createElement('div');
          iconWrap.style.cssText = 'width:22px;height:22px;flex-shrink:0;display:flex;align-items:center;justify-content:center;';
          const iconMap = { image: '\u{1F5BC}', video: '\u{1F3AC}', model: '\u{1F4E6}', text: '\u270F\uFE0F' };
          iconWrap.textContent = iconMap[type] || '\u2795';
          iconWrap.style.display = 'none'; // 👈 thêm vào đây
          bar.appendChild(iconWrap);

          const labelEl = document.createElement('span');
          labelEl.style.cssText = 'flex:1;color:#fff;font-size:13px;font-weight:600;font-family:"Montserrat",sans-serif;';
          labelEl.textContent = label;
          labelEl.style.display = 'none'; // 👈
          bar.appendChild(labelEl);

          // Nút +
          const btnAdd = document.createElement('button');
          btnAdd.style.cssText = 'width:30px;height:30px;border-radius:8px;border:none;cursor:pointer;background:url(\'/panelstudio/add.svg\') no-repeat center center / 100% 100%;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:filter .2s;';
          btnAdd.innerHTML = '';
          btnAdd.title = 'Tải lên';
          btnAdd.addEventListener('click', (e) => { e.stopPropagation(); onAdd(); });
          bar.appendChild(btnAdd);

          // Nút v
          const btnV = document.createElement('button');
          btnV.style.cssText = 'width:30px;height:30px;border-radius:8px;border:none;cursor:pointer;background:url(\'/panelstudio/open.svg\') no-repeat center center / 100% 100%;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:filter .2s, transform .25s;';
          btnV.innerHTML = '';
          btnV.title = 'Ẩn / hiện danh sách';
          bar.appendChild(btnV);
          wrap.appendChild(bar);

          // Dropdown
          const dropdown = document.createElement('div');
          dropdown.style.cssText = 'overflow:hidden;max-height:0;opacity:0;transition:max-height .3s cubic-bezier(0.4,0,0.2,1),opacity .25s,margin .3s;margin-top:0;';
          const inner = document.createElement('div');
          inner.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:22px;padding:8px 4px 8px;';
          inner.dataset.rpInner = type;
          dropdown.appendChild(inner);
          wrap.appendChild(dropdown);

          let open = false;
          const toggle = () => {
            open = !open;
            dropdown.style.maxHeight = open ? '9999px' : '0';
            dropdown.style.opacity   = open ? '1' : '0';
            dropdown.style.marginTop = open ? '4px' : '0';
            btnV.style.transform     = open ? 'rotate(180deg)' : '';
          };
          btnV.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });

          wrap._inner     = inner;
          wrap._toggle    = toggle;
          wrap._openState = () => open;
          pane.appendChild(wrap);
          return wrap;
        };

        const fiImg = document.getElementById('fi-img');

        const rowImg = makeRow({ label: 'Ảnh tĩnh', type: 'image', onAdd: () => {
          fiImg.accept = 'image/*'; fiImg.click();
          fiImg.addEventListener('change', () => { fiImg.accept = 'image/*,video/*'; }, { once: true });
        }});
        // Đổi background thanh "Ảnh tĩnh" thành picture.svg
        rowImg.querySelector('div').style.background = "url('/panelstudio/picture.svg') no-repeat center center / 100% 100%";
const rowVid = makeRow({ label: 'Video', type: 'video', onAdd: () => {
          const pop = document.createElement('div');
          pop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);z-index:10000;display:flex;align-items:center;justify-content:center;';
          pop.innerHTML = `
            <div style="background:linear-gradient(180deg,rgba(118,170,171,1),rgba(35,92,208,0.5));border-radius:12px;padding:28px 32px;width:420px;font-family:'Montserrat',sans-serif;display:flex;flex-direction:column;gap:16px;box-sizing:border-box;">
              <div style="display:flex;align-items:center;justify-content:space-between;">
                <span style="color:#fff;font-size:15px;font-weight:700;letter-spacing:.04em;">Thêm video</span>
                <button id="vpop-close" style="background:none;border:none;color:rgba(255,255,255,.6);font-size:22px;cursor:pointer;line-height:1;padding:0;">✕</button>
              </div>
              <div style="display:flex;gap:12px;">
                <button id="vpop-upload" style="flex:1;padding:14px 0;border-radius:8px;border:1px solid rgba(255,255,255,0.25);background:rgba(255,255,255,0.1);color:#fff;font-family:'Montserrat',sans-serif;font-size:13px;font-weight:600;cursor:pointer;">📁 Tải lên</button>
                <button id="vpop-url" style="flex:1;padding:14px 0;border-radius:8px;border:1px solid rgba(255,80,80,0.4);background:rgba(255,0,0,0.15);color:#ff8080;font-family:'Montserrat',sans-serif;font-size:13px;font-weight:600;cursor:pointer;">▶ URL YouTube</button>
              </div>
            </div>`;
          document.body.appendChild(pop);
          const closePop = () => pop.parentNode && document.body.removeChild(pop);
          pop.querySelector('#vpop-close').addEventListener('click', closePop);
          pop.addEventListener('click', (e) => { if (e.target === pop) closePop(); });
          pop.querySelector('#vpop-upload').addEventListener('click', () => {
            closePop();
            fiImg.accept = 'video/*'; fiImg.click();
            fiImg.addEventListener('change', () => { fiImg.accept = 'image/*,video/*'; }, { once: true });
          });
          pop.querySelector('#vpop-url').addEventListener('click', () => {
            closePop();
            this._openUrlEmbedModal();
          });
        }});

        const rowModel = makeRow({ label: '3D', type: 'model', onAdd: () => document.getElementById('fi-3d').click() });
        const rowText  = makeRow({ label: 'Văn bản', type: 'text', onAdd: () => this.textEditor?.togglePanel() });

        this._rowRefs = { image: rowImg, video: rowVid, model: rowModel, text: rowText };
        rowImg.querySelector('div').style.background   = "url('/panelstudio/picture.svg') no-repeat center center / 100% 100%";
        rowVid.querySelector('div').style.background   = "url('/panelstudio/video.svg') no-repeat center center / 100% 100%";
        rowModel.querySelector('div').style.background = "url('/panelstudio/3dmodel.svg') no-repeat center center / 100% 100%";
        rowText.querySelector('div').style.background  = "url('/panelstudio/text.svg') no-repeat center center / 100% 100%";        this._renderUploadedList();
        this._renderUploadedList();
        break;
      }


      // ── Bước 03: Ảnh/Video (legacy, giữ để không lỗi) ──
      case 'pane-img':
        pane.innerHTML = `
          <div class="rp-section-title">Upload ảnh hoặc video</div>
          <div class="rp-upload-btn" id="rp-uz-img">+ JPG · PNG · MP4</div>
          <div class="rp-thumb-grid" id="rp-uw-img"></div>
        `;
        pane.querySelector('#rp-uz-img').addEventListener('click', () => document.getElementById('fi-img').click());
        const existUwImg2 = document.getElementById('uw-img');
        if (existUwImg2 && existUwImg2.children.length) {
          pane.querySelector('#rp-uw-img').innerHTML = existUwImg2.innerHTML;
        }
        break;

      // ── Bước 03: Model 3D (legacy) ──
      case 'pane-3d':
        pane.innerHTML = `
          <div class="rp-section-title">Upload model 3D</div>
          <div class="rp-upload-btn" id="rp-uz-3d">+ GLB · GLTF · OBJ</div>
          <div id="rp-uw-3d" style="display:flex;flex-direction:column;gap:4px;margin-top:6px;"></div>
        `;
        pane.querySelector('#rp-uz-3d').addEventListener('click', () => document.getElementById('fi-3d').click());
        break;

      // ── Bước 03: Văn bản (legacy) ──
      case 'pane-text':
        pane.innerHTML = `
          <div class="rp-section-title">Thêm văn bản 3D</div>
          <div class="rp-upload-btn" id="rp-open-text-editor">+ Mở Text Editor</div>
        `;
        pane.querySelector('#rp-open-text-editor').addEventListener('click', () => this.textEditor?.togglePanel());
        break;

      // ── Bước 04: Waypoints ──
      case 'pane-waypoints':
        pane.style.paddingTop = '60px'; 
        pane.innerHTML = `
          <div class="rp-section-title">Lộ trình tham quan (<span id="rp-wp-count">0</span> điểm)</div>
          <div class="rp-upload-btn" id="rp-pp-add" style="margin-bottom:6px;">＋ Thêm điểm hiện tại</div>
          <div id="rp-wp-list" style="display:flex;flex-direction:column;gap:4px;"></div>
          <div class="rp-upload-btn" id="rp-pp-auto" style="margin-top:6px;">✦ Tự tạo lộ trình</div>
          <div class="rp-upload-btn" id="rp-pp-clear" style="margin-top:4px;color:rgba(220,100,100,0.8);border-color:rgba(220,100,100,0.3);">✕ Xoá hết</div>
        `;
        pane.querySelector('#rp-pp-add').addEventListener('click', () => {
          this.addWaypoint(this.camera.position.x, this.camera.position.y, this.camera.position.z, this.yaw, this.pitch, '');
          this.currentWpIdx = this.pathWaypoints.length - 1;
          this.updateNavBar();
          this.toast(`Đã thêm điểm ${this.pathWaypoints.length}`, 'success');
          this._renderRpWpList(pane);
        });
        pane.querySelector('#rp-pp-auto').addEventListener('click', () => { this.autoGeneratePath(); this._renderRpWpList(pane); });
        pane.querySelector('#rp-pp-clear').addEventListener('click', () => { this.clearWaypoints(); this._renderRpWpList(pane); this.toast('Đã xoá hết điểm', 'info'); });
        this._renderRpWpList(pane);
        break;

      // ── Bước 04: Rương ──
      case 'pane-chest':
        pane.style.paddingTop = '60px';
        pane.innerHTML = `
          <div class="rp-section-title">Rương kho báu</div>
          <div id="rp-btn-add-chest" style="background:url('/panelstudio/button.svg') no-repeat center center / 100% 100%;border:none;width:100%;height:43px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;font-family:'Montserrat',sans-serif;font-size:13px;font-weight:700;">➕ Đặt rương mới</div>          <div id="rp-chest-list" style="display:flex;flex-direction:column;gap:4px;margin-top:6px;"></div>
        `;
        pane.querySelector('#rp-btn-add-chest').addEventListener('click', () => {
          this._chestPlacingMode = true;
          this.renderer.domElement.style.cursor = 'crosshair';
          pane.querySelector('#rp-chest-hint').style.display = 'block';
        });
        this._renderRpChestList(pane);
        break;

      // ── Bước 05: Xuất bản ──
      case 'pane-publish':
      {
        const isPub = this.manager.currentRoom?.isPublished || false;
        const room = this.manager.currentRoom;
        pane.style.paddingTop = '60px';

        const nameVal = (room?.name || '').replace(/"/g, '&quot;');
        const thumbUrl = room?.thumbnailUrl || null;

        pane.innerHTML = `
          <div class="pub-section-title">Thông tin phòng</div>

          <div class="pub-field">
            <label class="pub-field-label">Tên phòng <span class="pub-required">*</span></label>
            <input id="pub-name" class="pub-input" type="text" maxlength="60" placeholder="Tên phòng..." value="${nameVal}">
          </div>

          <div class="pub-field">
            <label class="pub-field-label">Mô tả <span class="pub-optional">(tùy chọn)</span></label>
            <textarea id="pub-desc" class="pub-textarea" placeholder="Mô tả về phòng tranh của bạn..."></textarea>
            <div class="pub-char-count"><span id="pub-word-count">0</span>/2000 từ</div>
          </div>

          <div class="pub-field">
            <label class="pub-field-label">Tags <span class="pub-optional">(tùy chọn)</span></label>
            <div class="pub-tag-input-wrap" id="pub-tag-wrap">
              <div id="pub-tags-list" class="pub-tags-container"></div>
              <input id="pub-tag-input" class="pub-tag-input" type="text" placeholder="Nhập từ khóa, nhấn Enter...">
            </div>
            <div class="pub-field-hint">Từ khóa giúp khách tìm thấy phòng dễ hơn</div>
          </div>

          <div class="pub-section-title" id="pub-thumb-title">
            Thumbnail <span class="pub-required">*</span>
            ${thumbUrl ? '<span class="pub-thumb-saved">✓ Đã lưu</span>' : ''}
          </div>

          <div class="thumb-trigger-area">
            ${thumbUrl ? `<img src="${thumbUrl}" class="pub-thumb-preview" id="pub-thumb-preview" alt="Thumbnail">` : '<div class="thumb-empty-hint">Chưa có thumbnail — nhấn để tạo</div>'}
            <button class="thumb-open-btn" id="pub-open-thumb-btn">🖼 Mở trình chỉnh thumbnail</button>
          </div>

          <div class="pub-publish-section">
            <div class="rp-pub-info" id="pub-status-info">Phòng đang ở chế độ <b style="color:#fff">${isPub ? 'Public' : 'Draft'}</b></div>
            <button class="rp-pub-btn ${isPub ? 'danger' : 'primary'}" id="rp-btn-publish">${isPub ? '🔒 Huỷ xuất bản' : '🌐 Xuất bản ngay'}</button>
            ${isPub ? '' : '<div class="rp-pub-info" style="margin-top:4px;opacity:.7;">Cần tên phòng và thumbnail để xuất bản</div>'}
          </div>
        `;

        // Restore description
        pane.querySelector('#pub-desc').value = room?.description || '';

        // ── Word count ──
        const descEl = pane.querySelector('#pub-desc');
        const wordCountEl = pane.querySelector('#pub-word-count');
        const charCountWrap = pane.querySelector('.pub-char-count');
        const countWords = s => s.trim() === '' ? 0 : s.trim().split(/\s+/).length;
        const updateWordCount = () => {
          const cnt = countWords(descEl.value);
          wordCountEl.textContent = cnt;
          charCountWrap.classList.toggle('warn', cnt > 1800);
          if (cnt > 2000) {
            const words = descEl.value.trim().split(/\s+/).slice(0, 2000);
            descEl.value = words.join(' ');
          }
        };
        updateWordCount();
        descEl.addEventListener('input', updateWordCount);

        // ── Tags ──
        const tagsListEl = pane.querySelector('#pub-tags-list');
        const tagInputEl = pane.querySelector('#pub-tag-input');
        let currentTags = [...(room?.tags || [])];
        const renderTags = () => {
          tagsListEl.innerHTML = '';
          currentTags.forEach((tag, i) => {
            const chip = document.createElement('span');
            chip.className = 'pub-tag';
            chip.innerHTML = `${tag}<span class="pub-tag-del" data-i="${i}">✕</span>`;
            chip.querySelector('.pub-tag-del').addEventListener('click', () => { currentTags.splice(i, 1); renderTags(); });
            tagsListEl.appendChild(chip);
          });
        };
        renderTags();
        tagInputEl.addEventListener('keydown', e => {
          if ((e.key === 'Enter' || e.key === ',') && tagInputEl.value.trim()) {
            e.preventDefault();
            const tag = tagInputEl.value.trim().replace(/,/g, '');
            if (tag && !currentTags.includes(tag) && currentTags.length < 20) { currentTags.push(tag); renderTags(); }
            tagInputEl.value = '';
          } else if (e.key === 'Backspace' && !tagInputEl.value && currentTags.length) {
            currentTags.pop(); renderTags();
          }
        });

        // ── Sync pub-name → top bar ──
        pane.querySelector('#pub-name').addEventListener('input', e => {
          const topInput = document.getElementById('studio-room-name-input');
          if (topInput) topInput.value = e.target.value;
          if (room) room.name = e.target.value;
        });

        // ── Open thumbnail editor modal ──
        this._currentPublishPane = pane;
        pane.querySelector('#pub-open-thumb-btn').addEventListener('click', () => this._openThumbModal());

        // ── Publish / Unpublish ──
        let pubState = isPub;
        pane.querySelector('#rp-btn-publish').addEventListener('click', async () => {
          const pubBtn = pane.querySelector('#rp-btn-publish');
          const statusEl = pane.querySelector('#pub-status-info');
          if (pubState) {
            room.isPublished = false; pubState = false;
            pubBtn.textContent = '🌐 Xuất bản ngay';
            pubBtn.className = 'rp-pub-btn primary';
            statusEl.innerHTML = 'Phòng đang ở chế độ <b style="color:#fff">Draft</b>';
            await this.saveGallery();
            this.toast('Đã chuyển về Draft', 'info');
          } else {
            const nameInput = pane.querySelector('#pub-name');
            if (!nameInput.value.trim()) { this.toast('❌ Vui lòng điền tên phòng', 'error'); return; }
            if (!room.thumbnailUrl) { this.toast('❌ Vui lòng lưu thumbnail trước', 'error'); return; }
            room.name = nameInput.value.trim();
            room.description = descEl.value;
            room.tags = [...currentTags];
            const topInput = document.getElementById('studio-room-name-input');
            if (topInput) topInput.value = room.name;
            room.isPublished = true; pubState = true;
            pubBtn.textContent = '🔒 Huỷ xuất bản';
            pubBtn.className = 'rp-pub-btn danger';
            statusEl.innerHTML = 'Phòng đang ở chế độ <b style="color:#fff">Public</b>';
            await this.saveGallery();
            this.toast('Đã xuất bản phòng ✓', 'success');
          }
        });

        break;
      }

      // ── Bước 04: Mission Builder ──
      case 'pane-mission':
        this.missionBuilder.buildPane(pane);
        break;

      default:
        pane.innerHTML = `<div class="rp-placeholder"><div class="rp-placeholder-icon">🚧</div><div>Sắp ra mắt</div></div>`;
    }
  }

  _renderRpWpList(pane) {
    const list = pane.querySelector('#rp-wp-list');
    const countEl = pane.querySelector('#rp-wp-count');
    if (!list) return;
    if (countEl) countEl.textContent = this.pathWaypoints.length;
    list.innerHTML = '';
    this.pathWaypoints.forEach((wp, i) => {
      const el = document.createElement('div');
      el.className = 'rp-wp-item';
      el.innerHTML = `<span class="rp-wp-num">${i + 1}</span><span class="rp-wp-lbl">${wp.label || `(${wp.x.toFixed(1)}, ${wp.z.toFixed(1)})`}</span><button class="rp-wp-del">✕</button>`;
      el.querySelector('.rp-wp-del').addEventListener('click', (e) => { e.stopPropagation(); this.removeWaypoint(i); this._renderRpWpList(pane); });
      el.addEventListener('click', (e) => { if (!e.target.classList.contains('rp-wp-del')) this.travelToWaypoint(i); });
      list.appendChild(el);
    });
  }

  _renderRpChestList(pane) {
    const list = pane.querySelector('#rp-chest-list');
    if (!list) return;
    list.innerHTML = this.chests.length ? '' : '<div style="color:rgb(255, 255, 255);font-size:14px;text-align:center;padding:8px;">Chưa có rương nào</div>';
    this.chests.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'rp-wp-item';
      el.innerHTML = `<span class="rp-wp-num">🗝</span><span class="rp-wp-lbl">Rương ${i + 1} · ⭐ ${c.token_amount}</span><button class="rp-wp-del">✕</button>`;
      el.querySelector('.rp-wp-del').addEventListener('click', () => { this._deleteChest(c.id); setTimeout(() => this._renderRpChestList(pane), 300); });
      list.appendChild(el);
    });
  }


  /* ══════════════════════════════════════════════ THUMBNAIL MODAL ══════════════════════════════════════════════ */

  _openThumbModal() {
    if (!this._thumbModal) this._buildThumbModal();
    this._thumbModal.classList.add('open');
  }

  _buildThumbModal() {
    const overlay = document.createElement('div');
    overlay.id = 'thumb-modal-overlay';
    overlay.innerHTML = `
      <div id="thumb-modal">
        <div id="thumb-modal-header">
          <span id="thumb-modal-title">🖼 CHỈNH SỬA THUMBNAIL</span>
          <button id="thumb-modal-close">✕ Đóng</button>
        </div>
        <div id="thumb-modal-body">
          <div id="thumb-canvas-container">
            <div id="thumb-canvas-area">
              <img id="thumb-door-overlay" src="/studio/door-frame.png" alt="">
              <canvas id="thumb-draw-canvas"></canvas>
              <div id="thumb-obj-layer"></div>
              <div id="thumb-guide-hint">
                <span>↑ Vẽ cửa ở khu vực này</span>
                <span style="opacity:.7;">Phần còn lại vẽ tự do</span>
              </div>
            </div>
          </div>
          <div id="thumb-tool-panel">
            <div class="tp-section">Chế độ vẽ</div>
            <div class="tp-brushes">
              <button class="tp-brush active" data-brush="round"  title="Cọ tròn">●</button>
              <button class="tp-brush"        data-brush="eraser" title="Tẩy">⬜</button>
              <button class="tp-brush"        data-brush="bucket" title="Đổ màu">🪣</button>
            </div>
            <div class="tp-section">Màu & kích cỡ</div>
            <div class="tp-row">
              <input type="color" id="tp-color" class="tp-color" value="#c8a96e" title="Màu">
              <input type="range" id="tp-size" class="tp-range" min="1" max="80" value="12">
              <span class="tp-label" id="tp-size-label">12</span>
            </div>
            <div class="tp-section">Độ mờ</div>
            <div class="tp-row">
              <input type="range" id="tp-opacity" class="tp-range" min="5" max="100" value="100">
              <span class="tp-label" id="tp-opacity-label">100%</span>
            </div>
            <hr class="tp-sep">
            <div class="tp-section">Hoạ tiết (có thể chọn nhiều)</div>
            <label class="tp-upload-label">
              📁 Thêm hoạ tiết
              <input type="file" id="tp-upload-input" accept="image/*" multiple style="display:none">
            </label>
          <div id="tp-obj-hint" style="color:#FFFFFF;font-size:8px;padding:0 12px 6px;letter-spacing:.06em;">Click hoạ tiết để chọn — kéo, co/giãn, xoay tuỳ ý</div>            <hr class="tp-sep">
            <button class="tp-btn" id="tp-undo-btn">↩ Hoàn tác</button>
            <button class="tp-btn" id="tp-clear-btn">🗑 Xóa nền vẽ</button>
            <button class="tp-btn" id="tp-clear-objs-btn">🗑 Xóa tất cả hoạ tiết</button>
            <hr class="tp-sep">
            <button class="tp-save-btn" id="tp-save-btn">💾 Lưu thumbnail & đóng</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    this._el(overlay);
    this._thumbModal = overlay;
    this._thumbObjects = [];
    this._thumbObjCounter = 0;
    this._thumbUndoStack = [];
    this._thumbRestoring = false;

    overlay.querySelector('#thumb-modal-close').addEventListener('click', () => overlay.classList.remove('open'));
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });

    this._setupCanvasEditor(overlay);
  }

  _setupCanvasEditor(modal) {
    const canvas   = modal.querySelector('#thumb-draw-canvas');
    const objLayer = modal.querySelector('#thumb-obj-layer');
    const colorEl  = modal.querySelector('#tp-color');
    const sizeEl   = modal.querySelector('#tp-size');
    const sizeLbl  = modal.querySelector('#tp-size-label');
    const opacEl   = modal.querySelector('#tp-opacity');
    const opacLbl  = modal.querySelector('#tp-opacity-label');
    const uploadEl = modal.querySelector('#tp-upload-input');

    const setupCanvas = (nw, nh) => {
      const container = modal.querySelector('#thumb-canvas-container');
      const cRect = container.getBoundingClientRect();
      const maxW = Math.min(cRect.width - 32, 820);
      const maxH = Math.min(cRect.height - 32, 700);
      const scale = Math.min(maxW / nw, maxH / nh, 1);
      canvas.width  = Math.round(nw * scale);
      canvas.height = Math.round(nh * scale);
      this._thumbCanvas   = canvas;
      this._thumbObjLayer = objLayer;
      this._restoreThumbState();
    };

    const imgRef = new Image();
    imgRef.onload  = () => setupCanvas(imgRef.naturalWidth, imgRef.naturalHeight);
    imgRef.onerror = () => setupCanvas(600, 800);
    imgRef.src = '/studio/door-frame.png';

    let lastPos     = null;
    let isDrawing   = false;
    let currentBrush = 'round';

    const brushBtns = modal.querySelectorAll('.tp-brush');
    brushBtns.forEach(btn => btn.addEventListener('click', () => {
      currentBrush = btn.dataset.brush;
      brushBtns.forEach(b => b.classList.toggle('active', b === btn));
    }));

    sizeEl.addEventListener('input', () => sizeLbl.textContent = sizeEl.value);
    opacEl.addEventListener('input', () => opacLbl.textContent = opacEl.value + '%');

    const getCanvasPos = e => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) };
    };

    const saveUndo = () => {
      this._thumbUndoStack.push(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height));
      if (this._thumbUndoStack.length > 24) this._thumbUndoStack.shift();
    };

    canvas.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      const ctx = canvas.getContext('2d');
      const pos = getCanvasPos(e);
      saveUndo();

      if (currentBrush === 'bucket') {
        const hex = colorEl.value;
        this._floodFill(ctx, Math.round(pos.x), Math.round(pos.y),
          [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16), 255]);
        this._saveThumbState();
        return;
      }

      isDrawing = true;
      lastPos   = pos;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    });

    canvas.addEventListener('mousemove', e => {
      if (!isDrawing) return;
      const ctx = canvas.getContext('2d');
      const pos = getCanvasPos(e);
      ctx.lineWidth = +sizeEl.value;
      ctx.lineCap   = 'round';
      ctx.lineJoin  = 'round';

      if (currentBrush === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(0,0,0,1)';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = +opacEl.value / 100;
        ctx.strokeStyle = colorEl.value;
      }

      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      lastPos = pos;
    });

    const stopDraw = () => {
      if (isDrawing) {
        isDrawing = false;
        lastPos   = null;
        this._saveThumbState();
      }
    };
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('mouseleave', stopDraw);

    modal.querySelector('#tp-undo-btn').addEventListener('click', () => {
      if (!this._thumbUndoStack.length) return;
      canvas.getContext('2d').putImageData(this._thumbUndoStack.pop(), 0, 0);
      this._saveThumbState();
    });

    modal.querySelector('#tp-clear-btn').addEventListener('click', () => {
      saveUndo();
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      this._saveThumbState();
    });

    modal.querySelector('#tp-clear-objs-btn').addEventListener('click', () => {
      this._thumbObjects = [];
      objLayer.innerHTML = '';
      this._saveThumbState();
    });

    uploadEl.addEventListener('change', e => {
      Array.from(e.target.files).forEach(file => {
        const reader = new FileReader();
        reader.onload = ev => {
          const img = new Image();
          img.onload = () => {
            const canvasW = canvas.width, canvasH = canvas.height;
            const maxDim  = Math.min(canvasW, canvasH) * 0.5;
            const scale   = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight, 1);
            const w = Math.round(img.naturalWidth  * scale);
            const h = Math.round(img.naturalHeight * scale);
            const offset  = this._thumbObjects.length * 20;
            const x = Math.min((canvasW - w) / 2 + offset, canvasW - w - 4);
            const y = Math.min((canvasH - h) / 2 + offset, canvasH - h - 4);
            this._addThumbObject(img, x, y, w, h, canvas, objLayer);
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      });
      e.target.value = '';
    });

    modal.querySelector('#tp-save-btn').addEventListener('click', async () => {
      const saveBtn = modal.querySelector('#tp-save-btn');
      saveBtn.disabled = true; saveBtn.textContent = '⏳ Đang lưu...';
      try {
        const dataUrl = this._exportThumbnailDataUrl(modal);
        const url = await this._uploadThumbnail(dataUrl);
        const room = this.manager.currentRoom;
        if (url && room) {
          room.thumbnailUrl = url;
          const pane = this._currentPublishPane;
          if (pane) {
            let preview = pane.querySelector('#pub-thumb-preview');
            if (!preview) {
              const hint = pane.querySelector('.thumb-empty-hint');
              if (hint) hint.remove();
              preview = document.createElement('img');
              preview.id = 'pub-thumb-preview';
              preview.className = 'pub-thumb-preview';
              preview.alt = 'Thumbnail';
              pane.querySelector('.thumb-trigger-area').prepend(preview);
            }
            preview.src = url;
            const thumbTitle = pane.querySelector('#pub-thumb-title');
            if (thumbTitle && !thumbTitle.querySelector('.pub-thumb-saved')) {
              thumbTitle.insertAdjacentHTML('beforeend', '<span class="pub-thumb-saved">✓ Đã lưu</span>');
            }
          }
          await this.saveGallery();
          this.toast('Thumbnail đã lưu ✓', 'success');
          modal.classList.remove('open');
        } else {
          this.toast('Lưu thumbnail thất bại', 'error');
        }
      } catch (err) { this.toast('Lỗi: ' + err.message, 'error'); }
      saveBtn.disabled = false; saveBtn.textContent = '💾 Lưu thumbnail & đóng';
    });
  }

  _addThumbObject(img, x, y, w, h, canvas, objLayer, initialRotation = 0) {
    const id = ++this._thumbObjCounter;
    const obj = { id, img, x, y, w, h, rotation: initialRotation };
    this._thumbObjects.push(obj);

    const el = document.createElement('div');
    el.className = 'thumb-obj-item';
    el.dataset.id = id;
    el.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;transform:rotate(${initialRotation}deg);`;
    el.innerHTML = `
      <img src="${img.src}" draggable="false">
      <div class="obj-handle tl"></div>
      <div class="obj-handle tr"></div>
      <div class="obj-handle bl"></div>
      <div class="obj-handle br"></div>
      <div class="obj-rotate-handle"></div>
      <button class="obj-delete-btn" title="Xóa">✕</button>
    `;
    obj.el = el;

    const selectThis = () => {
      objLayer.querySelectorAll('.thumb-obj-item').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
    };

    // ── Move ──
    el.addEventListener('mousedown', e => {
      if (e.target.classList.contains('obj-handle') || e.target.classList.contains('obj-rotate-handle') || e.target.classList.contains('obj-delete-btn')) return;
      e.preventDefault(); e.stopPropagation();
      selectThis();
      const startX = e.clientX, startY = e.clientY;
      const origX = obj.x, origY = obj.y;
      const onMove = mv => {
        obj.x = origX + (mv.clientX - startX);
        obj.y = origY + (mv.clientY - startY);
        el.style.left = obj.x + 'px';
        el.style.top  = obj.y + 'px';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        this._saveThumbState();
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // ── Scale (corner handles) ──
    el.querySelectorAll('.obj-handle').forEach(handle => {
      handle.addEventListener('mousedown', e => {
        e.preventDefault(); e.stopPropagation();
        const corner = handle.classList[1];
        const startX = e.clientX, startY = e.clientY;
        const origW = obj.w, origH = obj.h, origX = obj.x, origY = obj.y;
        const aspect = origW / origH;
        const onMove = mv => {
          const dx = mv.clientX - startX, dy = mv.clientY - startY;
          let newW, newH, newX, newY;
          if (corner === 'br') { newW = Math.max(30, origW + dx); newH = newW / aspect; newX = origX; newY = origY; }
          else if (corner === 'bl') { newW = Math.max(30, origW - dx); newH = newW / aspect; newX = origX + (origW - newW); newY = origY; }
          else if (corner === 'tr') { newW = Math.max(30, origW + dx); newH = newW / aspect; newX = origX; newY = origY + (origH - newH); }
          else { newW = Math.max(30, origW - dx); newH = newW / aspect; newX = origX + (origW - newW); newY = origY + (origH - newH); }
          obj.w = newW; obj.h = newH; obj.x = newX; obj.y = newY;
          el.style.width = newW + 'px'; el.style.height = newH + 'px';
          el.style.left  = newX + 'px'; el.style.top    = newY + 'px';
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          this._saveThumbState();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });

    // ── Rotate ──
    el.querySelector('.obj-rotate-handle').addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      const onMove = mv => {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        const angle = Math.atan2(mv.clientY - cy, mv.clientX - cx) * 180 / Math.PI + 90;
        obj.rotation = angle;
        el.style.transform = `rotate(${angle}deg)`;
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        this._saveThumbState();
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // ── Delete ──
    el.querySelector('.obj-delete-btn').addEventListener('click', e => {
      e.stopPropagation();
      this._thumbObjects = this._thumbObjects.filter(o => o.id !== id);
      el.remove();
      this._saveThumbState();
    });

    // Deselect on click outside
    objLayer.addEventListener('mousedown', e => {
      if (!el.contains(e.target)) el.classList.remove('selected');
    }, true);

    objLayer.appendChild(el);
    selectThis();
    if (!this._thumbRestoring) this._saveThumbState();
    return obj;
  }

  _deselectAllObjs() {
    if (!this._thumbModal) return;
    this._thumbModal.querySelectorAll('.thumb-obj-item').forEach(e => e.classList.remove('selected'));
  }

  _saveThumbState() {
    if (!this._thumbCanvas || this._thumbRestoring) return;
    try {
      const roomId = this.manager.currentRoom?.id;
      if (!roomId) return;
      const objsData = (this._thumbObjects || []).map(obj => ({
        imgSrc: obj.img.src,
        x: obj.x, y: obj.y, w: obj.w, h: obj.h, rotation: obj.rotation,
      }));
      localStorage.setItem(`thumb_editor_${roomId}`, JSON.stringify({
        canvasDataUrl: this._thumbCanvas.toDataURL('image/png'),
        objects: objsData,
      }));
    } catch (_e) {}
  }

  _restoreThumbState() {
    if (!this._thumbCanvas || !this._thumbObjLayer) return;
    try {
      const roomId = this.manager.currentRoom?.id;
      if (!roomId) return;
      const raw = localStorage.getItem(`thumb_editor_${roomId}`);
      if (!raw) return;
      const { canvasDataUrl, objects } = JSON.parse(raw);
      const promises = [];
      if (canvasDataUrl) {
        promises.push(new Promise(resolve => {
          const img = new Image();
          img.onload = () => { this._thumbCanvas.getContext('2d').drawImage(img, 0, 0); resolve(); };
          img.onerror = resolve;
          img.src = canvasDataUrl;
        }));
      }
      if (objects?.length) {
        this._thumbRestoring = true;
        objects.forEach(od => {
          promises.push(new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
              this._addThumbObject(img, od.x, od.y, od.w, od.h, this._thumbCanvas, this._thumbObjLayer, od.rotation);
              resolve();
            };
            img.onerror = resolve;
            img.src = od.imgSrc;
          }));
        });
      }
      Promise.all(promises).then(() => { this._thumbRestoring = false; });
    } catch (_e) { this._thumbRestoring = false; }
  }

  _floodFill(ctx, startX, startY, fillColor) {
    const { width, height } = ctx.canvas;
    if (startX < 0 || startX >= width || startY < 0 || startY >= height) return;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const idx = (x, y) => (y * width + x) * 4;
    const getCol = i => [data[i], data[i + 1], data[i + 2], data[i + 3]];
    const colMatch = (a, b) => Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]) + Math.abs(a[2]-b[2]) + Math.abs(a[3]-b[3]) <= 40;
    const setCol = i => { data[i] = fillColor[0]; data[i+1] = fillColor[1]; data[i+2] = fillColor[2]; data[i+3] = fillColor[3]; };
    const target = getCol(idx(startX, startY));
    if (colMatch(target, fillColor)) return;
    const queue = [[startX, startY]];
    const visited = new Uint8Array(width * height);
    while (queue.length) {
      const [x, y] = queue.pop();
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      if (visited[y * width + x]) continue;
      visited[y * width + x] = 1;
      if (!colMatch(getCol(idx(x, y)), target)) continue;
      setCol(idx(x, y));
      queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    ctx.putImageData(imageData, 0, 0);
  }

  _exportThumbnailDataUrl(modal) {
    const drawCanvas = modal.querySelector('#thumb-draw-canvas');
    const doorOverlay = modal.querySelector('#thumb-door-overlay');
    const exp = document.createElement('canvas');
    exp.width  = drawCanvas.width;
    exp.height = drawCanvas.height;
    const ctx = exp.getContext('2d');

    // 1. Door frame as background layer
    if (doorOverlay?.complete && doorOverlay.naturalWidth) {
      ctx.drawImage(doorOverlay, 0, 0, exp.width, exp.height);
    }

    // 3. Paint layer on top of door frame
    ctx.drawImage(drawCanvas, 0, 0);

    // 4. Image objects on top
    const dispW = drawCanvas.offsetWidth  || drawCanvas.width;
    const dispH = drawCanvas.offsetHeight || drawCanvas.height;
    const sx = drawCanvas.width  / dispW;
    const sy = drawCanvas.height / dispH;
    (this._thumbObjects || []).forEach(obj => {
      ctx.save();
      const cx = (obj.x + obj.w / 2) * sx;
      const cy = (obj.y + obj.h / 2) * sy;
      ctx.translate(cx, cy);
      ctx.rotate(obj.rotation * Math.PI / 180);
      ctx.drawImage(obj.img, -obj.w / 2 * sx, -obj.h / 2 * sy, obj.w * sx, obj.h * sy);
      ctx.restore();
    });

    return exp.toDataURL('image/png');
  }

  async _uploadThumbnail(dataUrl) {
    const res  = await fetch(dataUrl);
    const blob = await res.blob();
    const roomId = this.manager.currentRoom?.id || 'unknown';
    const path = `thumbnails/${roomId}_${Date.now()}.png`;
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, blob, { upsert: true, contentType: 'image/png' });
    if (error) { console.error('Thumbnail upload error:', error); return null; }
    return toCDN(supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl);
  }

  async _loadRpTemplateList(container) {
    try {
      const res = await fetch('/models/manifest.json');
      const templates = await res.json();
      container.innerHTML = '';
      templates.forEach(t => {
        const thumbFile = t.file.replace(/\.glb$/i, '').replace(/\.gltf$/i, '');
        // Thử png trước, fallback sang svg
        const thumbUrlPng = `/models/thumbnails/${thumbFile}.png`;
        const thumbUrlSvg = `/models/thumbnails/${thumbFile}.svg`;
        const card = document.createElement('div');
        card.className = 'rp-tpl-card';
        card.innerHTML = `
          <span class="rp-tpl-name">${t.name}</span>
          <img class="rp-tpl-thumb" src="${thumbUrlPng}" alt="${t.name}" onerror="this.src='${thumbUrlSvg}';this.onerror=function(){this.style.opacity='0.15'};">
        `;
        if (t.file === this.selectedTemplate) card.classList.add('active');
        card.addEventListener('click', async () => {
          card.querySelector('.rp-tpl-name').textContent = '⏳ Đang load...';
          await this._changeTemplate(t.file);
          container.querySelectorAll('.rp-tpl-card').forEach(c => c.classList.remove('active'));
          card.classList.add('active');
          card.querySelector('.rp-tpl-name').textContent = t.name;
        });
        container.appendChild(card);
      });
    } catch { container.innerHTML = '<div style="color:rgba(255,255,255,0.2);font-size:9px;">Không load được manifest</div>'; }
  }

  async _loadRpDecorList(container) {
    try {
      const res = await fetch('/decor/manifest.json');
      const decors = await res.json();
      container.innerHTML = '';
      decors.forEach(d => {
        const thumbFile = d.file.replace(/\.glb$/i, '.jpg');
        const thumbUrl = `/decor/${thumbFile}`;
        const card = document.createElement('div');
        card.className = 'rp-tpl-card';
        card.innerHTML = `
          <span class="rp-tpl-name">${d.name}</span>
          <img class="rp-tpl-thumb" src="${thumbUrl}" alt="${d.name}" onerror="this.style.opacity='0.15';">
        `;
        card.addEventListener('click', () => {
          container.querySelectorAll('.rp-tpl-card').forEach(c => c.classList.remove('active'));
          card.classList.add('active');
          this._selectDecorItem(d);
        });
        container.appendChild(card);
      });
    } catch { container.innerHTML = '<div style="color:rgba(255,255,255,0.2);font-size:9px;">Không load được manifest</div>'; }
  }

  async _loadRpHDRList(container) {
    try {
      const res = await fetch('/hdr/manifest.json');
      const hdrs = await res.json();
      container.innerHTML = '';
      hdrs.forEach(h => {
        const thumbUrl = `/hdr/${h.thumb || h.file.replace(/\.hdr$/i, '.jpg')}`;
        const card = document.createElement('div');
        card.className = 'rp-tpl-card';
        card.innerHTML = `
          <span class="rp-tpl-name">${h.name}</span>
          <img class="rp-tpl-thumb" src="${thumbUrl}" alt="${h.name}" onerror="this.style.opacity='0.15';">
        `;
        card.addEventListener('click', () => {
          container.querySelectorAll('.rp-tpl-card').forEach(c => c.classList.remove('active'));
          card.classList.add('active');
          this._applyHDR(`/hdr/${h.file}`);
        });
        container.appendChild(card);
      });
    } catch { container.innerHTML = '<div style="color:rgba(255,255,255,0.2);font-size:9px;">Không load được manifest</div>'; }
  }

  _applyHDR(path) {
    new RGBELoader().load(path, (texture) => {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const envMap = pmrem.fromEquirectangular(texture).texture;
      this.threeScene.background = envMap;
      texture.dispose();
      pmrem.dispose();
    });
  }

  /* ══════════════════════════════════════════════ HUD ══════════════════════════════════════════════ */
  _buildHUD() {
    this._hud = document.createElement('div');
    this._hud.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#122F6A;border:1px solid rgba(255,255,255,.3);border-radius:4px;padding:10px 14px;display:none;flex-direction:column;gap:8px;z-index:20;font-family:Montserrat,sans-serif;min-width:340px;max-width:420px;';
    this._hud.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <span id="hud-name" style="color:#FFFFFF;font-size:11px;font-style:italic;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>
        <button class="hud-btn" id="th-info">📝 Info</button>
        <button class="hud-btn" id="hud-yt-watch" style="display:none;background:rgba(255,0,0,0.2);border-color:rgba(255,80,80,0.5);color:#ff8080;">▶ Xem video</button>
        <button id="hud-close" style="background:none;border:none;color:#FFFFFF;cursor:pointer;font-size:14px;flex-shrink:0">✕</button>
      </div>
      <!-- Frame controls — only shown for artwork/video -->
      <div id="hud-frame-controls" style="display:none;flex-direction:column;gap:6px;border-top:0.5px solid rgba(255,255,255,0.15);padding-top:8px;">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <label style="color:rgba(255,255,255,0.65);font-size:10px;letter-spacing:.08em;display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;">
            <input type="checkbox" id="hud-frame-toggle" style="accent-color:#68e5e3;width:14px;height:14px;">
            <span>Khung tranh</span>
          </label>
          <label style="color:rgba(255,255,255,0.65);font-size:10px;letter-spacing:.08em;display:flex;align-items:center;gap:6px;">
            <span>Màu</span>
            <input type="color" id="hud-frame-color" value="#182D58" style="width:28px;height:22px;border:none;border-radius:3px;cursor:pointer;background:none;padding:0;">
          </label>
          <label style="color:rgba(255,255,255,0.65);font-size:10px;letter-spacing:.08em;display:flex;align-items:center;gap:6px;flex:1;min-width:120px;">
            <span style="white-space:nowrap">Độ dày</span>
            <input type="range" id="hud-frame-thickness" min="0.02" max="0.30" step="0.01" value="0.08" style="flex:1;accent-color:#68e5e3;height:2px;">
            <span id="hud-frame-thickness-val" style="color:#68e5e3;font-size:9px;min-width:28px;text-align:right">0.08</span>
          </label>
        </div>
      </div>
      <button id="th-remove" style="display:none"></button>
    `;
    document.body.appendChild(this._hud); this._el(this._hud);

    // ── Frame control events ──
    document.getElementById('hud-frame-toggle').addEventListener('change', (e) => {
      const ad = this.selectedItem?.data;
      if (!ad || this.selectedItem.type !== 'artwork') return;
      ad.frameVisible = e.target.checked;
      this._applyFrameOpts(ad);
      this._triggerAutosave();
    });

    document.getElementById('hud-frame-color').addEventListener('input', (e) => {
      const ad = this.selectedItem?.data;
      if (!ad || this.selectedItem.type !== 'artwork') return;
      // hex string -> int
      ad.frameColor = parseInt(e.target.value.replace('#', ''), 16);
      this._applyFrameOpts(ad);
      this._triggerAutosave();
    });

    document.getElementById('hud-frame-thickness').addEventListener('input', (e) => {
      const ad = this.selectedItem?.data;
      if (!ad || this.selectedItem.type !== 'artwork') return;
      const v = parseFloat(e.target.value);
      ad.frameThickness = v;
      document.getElementById('hud-frame-thickness-val').textContent = v.toFixed(2);
      this._applyFrameOpts(ad);
      this._triggerAutosave();
    });

    document.getElementById('hud-yt-watch').addEventListener('click', () => {
      const ad = this.selectedItem?.data;
      if (ad?.isYouTube && ad.youtubeId) this._showYouTubeOverlay(ad.youtubeId);
    });
  }

  getSelObj() {
    if (!this.selectedItem) return null;
    if (this.selectedItem.type === 'chest') return this.selectedItem.data.mesh;
    if (this.selectedItem.type === 'text') return this.selectedItem.data.group;
    if (this.selectedItem.type === 'egg') return this.selectedItem.data.object;
    return this.selectedItem.type === 'artwork' ? this.selectedItem.data.group : this.selectedItem.data.object;
  }

  selectItem(type, data, index) {
    this.selectedItem = { type, data, index };
    this._hud.style.display = 'flex';
    const infoBtn = document.getElementById('th-info');
    if (infoBtn) infoBtn.style.display = (type === 'chest' || type === 'text' || type === 'egg') ? 'none' : '';
    if (type === 'egg') {
      document.getElementById('hud-name').textContent = `Rương câu đố ${(data.eggIdx ?? 0) + 1}`;
    } else if (type === 'chest') {
      document.getElementById('hud-name').textContent = `🗝 Rương #${index + 1} · ⭐ ${data.token_amount}`;
    } else if (type === 'text') {
      document.getElementById('hud-name').textContent = `📝 "${data.data.content.substring(0, 25)}"`;
    } else {
      document.getElementById('hud-name').textContent = data.meta?.title || (type === 'model' ? `Model #${index + 1}` : `Tác phẩm #${index + 1}`);
    }

    // ── Nút xem YouTube ──
    const ytWatchBtn = document.getElementById('hud-yt-watch');
    if (ytWatchBtn) ytWatchBtn.style.display = (type === 'artwork' && data.isYouTube) ? '' : 'none';

    // ── Frame controls: chỉ hiện với artwork/video ──
    const frameControls = document.getElementById('hud-frame-controls');
    if (frameControls) {
      if (type === 'artwork') {
        frameControls.style.display = 'flex';
        // Sync UI với giá trị hiện tại của artwork
        const toggleEl    = document.getElementById('hud-frame-toggle');
        const colorEl     = document.getElementById('hud-frame-color');
        const thickEl     = document.getElementById('hud-frame-thickness');
        const thickValEl  = document.getElementById('hud-frame-thickness-val');
        if (toggleEl)   toggleEl.checked  = data.frameVisible !== false;
        if (colorEl)    colorEl.value     = '#' + (data.frameColor ?? 0x182D58).toString(16).padStart(6, '0');
        if (thickEl)    thickEl.value     = data.frameThickness ?? 0.08;
        if (thickValEl) thickValEl.textContent = (data.frameThickness ?? 0.08).toFixed(2);
      } else {
        frameControls.style.display = 'none';
      }
    }

    this._setTransformButtonsEnabled(true);
    const canFlip = ['artwork', 'text'].includes(type);
    ['stb2-fliph', 'stb2-flipfb'].forEach(id => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.classList.remove('on');
      if (canFlip) btn.classList.add('on');
    });
  }

  deselectItem() {
    if (this.selectedItem?.type === 'chest') this._saveChestTransform(this.selectedItem.data);
    if (this.selectedItem?.type === 'wall') this._closeWallCfg();
    this.selectedItem = null;
    this._hud.style.display = 'none';
    if (this._infoPopup) this._infoPopup.style.display = 'none';
    this._setTransformButtonsEnabled(false);
    ['stb2-fliph', 'stb2-flipfb'].forEach(id => document.getElementById(id)?.classList.remove('on'));
  }

  /* ══════════════════════════════════════════════ INFO POPUP ══════════════════════════════════════════════ */
  _buildInfoPopup() {
    this._infoPopup = document.createElement('div');
    this._infoPopup.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);background:linear-gradient(180deg, rgba(18,47,106,1), rgba(118,170,171,1));border:1px solid rgba(212,197,169,.2);border-radius:4px;padding:16px;width:260px;flex-direction:column;gap:10px;z-index:30;font-family:"Montserrat",sans-serif;display:none;';
    this._infoPopup.innerHTML = `
      <div style="color:#FFFFFF;font-size:14px;font-weight:700;font-family:'Montserrat',sans-serif;margin-bottom:6px;">📝 Thông tin</div>
      ${['title:Tên', 'artist:Nghệ sĩ', 'year:Năm', 'price:Giá'].map(f => {
        const [k, lbl] = f.split(':');
        return k === 'price' 
  ? `<div style="display:flex;flex-direction:column;gap:3px"><label style="color:#FFFFFF;font-size:9px;letter-spacing:.12em;text-transform:uppercase;font-family:'Montserrat',sans-serif;">${lbl}</label><input id="pop-${k}" placeholder="VD: 1.500.000" style="background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);border-radius:4px;color:#FFFFFF;font-family:'Montserrat',sans-serif;font-size:11px;padding:6px 8px;outline:none;width:100%;box-sizing:border-box;"></div>`
  : `<div style="display:flex;flex-direction:column;gap:3px"><label style="color:#FFFFFF;font-size:9px;letter-spacing:.12em;text-transform:uppercase;font-family:'Montserrat',sans-serif;">${lbl}</label><input id="pop-${k}" style="background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);border-radius:4px;color:#FFFFFF;font-family:'Montserrat',sans-serif;font-size:11px;padding:6px 8px;outline:none;width:100%;box-sizing:border-box;"></div>`;
      }).join('')}
      <div style="color:rgba(255, 208, 0, 0.94);font-size:10px;margin-top:-4px;font-family:'Montserrat',sans-serif;">* Những bức tranh không bán bạn cứ để trống ô giá tiền nhé</div>
      <div style="display:flex;flex-direction:column;gap:3px">
        <label style="color:#FFFFFF;font-size:9px;letter-spacing:.12em;text-transform:uppercase;font-family:'Montserrat',sans-serif;">Mô tả</label>
        <textarea id="pop-desc" rows="2" style="background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);border-radius:4px;color:#FFFFFF;font-family:'Montserrat',sans-serif;font-size:11px;padding:6px 8px;outline:none;resize:vertical;width:100%;box-sizing:border-box;"></textarea>
      </div>
      <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:4px;">
        <button id="pop-cancel" style="padding:6px 12px;font-size:10px;font-family:'Montserrat',sans-serif;cursor:pointer;background:rgba(255,255,255,0.1);color:#FFFFFF;border:1px solid rgba(255,255,255,0.2);border-radius:4px;transition:all .2s">Huỷ</button>
        <button id="pop-save" style="padding:6px 12px;font-size:10px;font-family:'Montserrat',sans-serif;cursor:pointer;background:rgba(104,229,227,0.2);color:#FFFFFF;border:1px solid rgba(104,229,227,0.4);border-radius:4px;transition:all .2s">Lưu</button>
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

  place3DModel(object, pos, storageUrl, name, meta = {}, scaleVec = null, usePedestal = true) {
    if (scaleVec) { object.scale.copy(scaleVec); }
    else {
      const box = new THREE.Box3().setFromObject(object);
      const sz = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(sz.x, sz.y, sz.z);
      if (maxDim > 0.001 && isFinite(maxDim)) { object.scale.setScalar(1.5 / maxDim); }
      else { object.scale.set(1, 1, 1); }
    }
    object.position.set(0, 0, 0);
    object.updateMatrixWorld(true);
    const bBox = new THREE.Box3().setFromObject(object);
    object.position.set(pos.x, usePedestal ? (0.90 - bBox.min.y) : -bBox.min.y, pos.z);
    this.threeScene.add(object);
    const pl = new THREE.PointLight(0xfff0dd, 1.5, 4); pl.position.set(pos.x, pos.y + 2, pos.z); this.threeScene.add(pl);
    const ped = usePedestal ? this.makePedestal(new THREE.Vector3(pos.x, 0, pos.z)) : null;
    const md = { object, light: pl, pedestal: ped, hasPedestal: usePedestal, storageUrl: storageUrl || null, name: name || null, meta: { title: '', artist: '', year: '', desc: '', price: '', ...meta } };
    this.models3d.push(md); return md;
  }

  placeArtwork(src, pos, rot, meta = {}, scaleVec = null, frameOpts = {}) {
    const tex = src.texture || new THREE.CanvasTexture(src.canvas);
    let ar = 4 / 3;
    if (src.naturalWidth && src.naturalHeight) ar = src.naturalWidth / src.naturalHeight;
    else if (src.isVideo && src.videoEl && src.videoEl.videoWidth) ar = src.videoEl.videoWidth / src.videoEl.videoHeight;
    const AH = 1.65, AW = AH * ar;
    const group = new THREE.Group(); group.position.copy(pos); group.rotation.set(...rot);
    if (scaleVec) group.scale.copy(scaleVec);

    // ── Frame options ──
    const frameVisible   = frameOpts.frameVisible !== false; // default: có khung
    const frameColor     = frameOpts.frameColor   || 0x182D58;
    const frameThickness = typeof frameOpts.frameThickness === 'number' ? frameOpts.frameThickness : 0.08; // 0.04–0.30
    const framePad       = frameThickness * 2; // khoảng cách border mỗi phía = thickness * 2

    const frameMat = new THREE.MeshLambertMaterial({ color: frameColor });
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(AW + framePad, AH + framePad, frameThickness),
      frameMat
    );
    frame.visible = frameVisible;
    group.add(frame);

    // ── Plane material — PNG tách nền dùng transparent ──
    const isPng = !src.isVideo && src.storageUrl && /\.png(\?|$)/i.test(src.storageUrl);
    const planeMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: isPng || src._forceTransparent || false,
      alphaTest: isPng ? 0.05 : 0,
      side: THREE.FrontSide,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(AW, AH), planeMat);
    plane.position.z = frameThickness / 2 + 0.002;
    group.add(plane);

    this.threeScene.add(group);
    const ad = {
      group, frame, plane,
      isVideo: src.isVideo || false,
      isYouTube: src.isYouTube || false,
      youtubeId: src.youtubeId || null,
      isUrlEmbed: src.isUrlEmbed || false,
      videoTex: src.isVideo ? tex : null,
      storageUrl: src.storageUrl || null,
      naturalWidth:  src.naturalWidth  || (src.isVideo && src.videoEl ? src.videoEl.videoWidth  : 1),
      naturalHeight: src.naturalHeight || (src.isVideo && src.videoEl ? src.videoEl.videoHeight : 1),
      frameVisible,
      frameColor,
      frameThickness,
      meta: { title: '', artist: '', year: '', desc: '', price: '', ...meta },
    };
    this.artworks.push(ad); return ad;
  }

  /** Cập nhật khung cho một artwork đã đặt */
  _applyFrameOpts(ad) {
    if (!ad || !ad.frame) return;
    const AH = 1.65;
    let ar = 4 / 3;
    if (ad.naturalWidth && ad.naturalHeight) ar = ad.naturalWidth / ad.naturalHeight;
    const AW = AH * ar;
    const pad = ad.frameThickness * 2;
    ad.frame.geometry.dispose();
    ad.frame.geometry = new THREE.BoxGeometry(AW + pad, AH + pad, ad.frameThickness);
    ad.frame.material.color.set(ad.frameColor);
    ad.frame.visible = ad.frameVisible;
    // Cập nhật vị trí plane theo thickness mới
    if (ad.plane) ad.plane.position.z = ad.frameThickness / 2 + 0.002;
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
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(wx, floorY + 0.012, wz);
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
        new THREE.LineBasicMaterial({ color: 0xc8a96e, transparent: true, opacity: 0.55 })
      );
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
      const modelUrl = templateFile.startsWith('http') ? templateFile : `/models/${templateFile}`;
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
      const loader = new GLTFLoader();
      loader.setDRACOLoader(dracoLoader);
      loader.load(modelUrl, (gltf) => {
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
        this._roomBox = box.clone();   
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


  /* ══════════════════════════════════════════════ BIND CONTROLS ══════════════════════════════════════════════ */
  _bindControls() {

    document.getElementById('amb-intensity').addEventListener('input', (e) => { this.ambLight.intensity = +e.target.value; document.getElementById('amb-val').textContent = (+e.target.value).toFixed(2); });
    document.getElementById('amb-color').addEventListener('input', (e) => { this.ambLight.color.set(e.target.value); });
    document.getElementById('hemi-intensity').addEventListener('input', (e) => { this.hemiLight.intensity = +e.target.value; document.getElementById('hemi-val').textContent = (+e.target.value).toFixed(2); });
    document.getElementById('dir-intensity').addEventListener('input', (e) => { this.dirLight.intensity = +e.target.value; document.getElementById('dir-val').textContent = (+e.target.value).toFixed(2); });

    document.getElementById('hud-close').addEventListener('click', () => this.deselectItem());
    document.getElementById('th-remove').addEventListener('click', () => {
      if (!this.selectedItem) return;
      if (this.selectedItem.type === 'chest') {
        const id = this.selectedItem.data.id;
        this.deselectItem();
        this._deleteChest(id);
        return;
      }
      if (this.selectedItem.type === 'wall') {
        const idx = this.selectedItem.index;
        this.deselectItem();
        this._deleteInteriorWall(idx);
        return;
      }
      if (this.selectedItem.type === 'text') {
        const idx = this.selectedItem.index;
        this.deselectItem();
        this.textEditor.removeTextAtIndex(idx);
        return;
      }
      if (this.selectedItem.type === 'egg') {
        this.toast('Dùng nút ✕ trong bảng Mission để xoá Easter Egg', 'info');
        return;
      }
      if (this.selectedItem.type === 'artwork') {
        const idx = this.selectedItem.index;
        const aw = this.selectedItem.data;
        this._undoStack.push({ type: 'delete-artwork', index: idx, data: aw });
        if (this._undoStack.length > 50) this._undoStack.shift();
        this._redoStack = [];
        this.threeScene.remove(aw.group);
        this.artworks.splice(idx, 1);
        this._renderUploadedList();
        this.toast('Đã xoá tranh — Ctrl+Z để hoàn tác', 'info');
      } else {
        const idx = this.selectedItem.index;
        const md = this.selectedItem.data;
        this._undoStack.push({ type: 'delete-model', index: idx, data: md });
        if (this._undoStack.length > 50) this._undoStack.shift();
        this._redoStack = [];
        this.threeScene.remove(md.object);
        this.threeScene.remove(md.light);
        this.threeScene.remove(md.pedestal);
        this.models3d.splice(idx, 1);
        this._renderUploadedList();
        this.toast('Đã xoá model — Ctrl+Z để hoàn tác', 'info');
      }
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
    const _textWallMeshes = this.interiorWalls.flatMap(w => [w.frontMesh, w.backMesh]);
    if (this.textEditor.handleCanvasClick(this.raycaster, this.camera, this.mouse, [...this.modelMeshes, ..._textWallMeshes])) {
      return;
    }
    
    this.raycaster.setFromCamera(this.mouse, this.camera);

    if (this.mode === 'place_hidden') {
      const hits = this.raycaster.intersectObjects(this.modelMeshes, true);
      if (!hits.length) return;
      const hit  = hits[0];
      const mIdx = this._hiddenObjPlaceMissionIdx;
      const eIdx = this._hiddenObjPlaceEggIdx;
      if (mIdx < 0 || eIdx < 0) return;

      const pt = hit.point.clone();
      const n  = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
      pt.addScaledVector(n, 0.08);

      const egg = this._missionData[mIdx]?.easter_eggs?.[eIdx];
      if (!egg) return;
      egg.pos_x = pt.x;
      egg.pos_y = pt.y;
      egg.pos_z = pt.z;

      if (this._hiddenObjPlaceStatusEl) {
        this._hiddenObjPlaceStatusEl.textContent = `✓ (${pt.x.toFixed(1)}, ${pt.z.toFixed(1)})`;
      }
      this.missionBuilder._renderStudioEgg(mIdx, eIdx);

      this.mode = 'select';
      this.renderer.domElement.style.cursor = 'default';

      const mission = this._missionData[mIdx];
      const isChestRiddle = mission?.mission_type === 'chest_riddle';
      this.toast(isChestRiddle ? 'Đã đặt rương câu đố ✓' : `Đã đặt Easter Egg ${eIdx + 1} ✓`, 'success');

      if (this._hiddenObjPlaceCallback) {
        this._hiddenObjPlaceCallback();
        this._hiddenObjPlaceCallback = null;
      }
      return;
    }

    if (this.mode === 'place') {
      if (!this.selectedSource) return;
      if (this.selectedSource.type === 'model3d') {
        const hits = this.raycaster.intersectObjects(this.modelMeshes, true); if (!hits.length) return;
        this.place3DModel(this.selectedSource.object.clone(), hits[0].point.clone(), this.selectedSource.storageUrl || null, this.selectedSource.name || null, {}, null, this._usePedestal);
        this._renderUploadedList();
        this._triggerAutosave();
        this.toast('Model đặt thành công ✓', 'success'); return;
      }
      // Include interior wall meshes as placement surfaces
      const wallMeshes = this.interiorWalls.flatMap(w => [w.frontMesh, w.backMesh]);
      const allSurfaces = [...this.modelMeshes, ...wallMeshes];
      const hits = this.raycaster.intersectObjects(allSurfaces, true); if (!hits.length) return;
      const hit = hits[0], pt = hit.point.clone();
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
      pt.add(n.clone().multiplyScalar(.05));
      if (this.selectedSource.isVideo) this.selectedSource.videoEl.play();
      this.placeArtwork(this.selectedSource, pt, [0, Math.atan2(n.x, n.z), 0]);
      this._renderUploadedList();
      this._triggerAutosave();
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

    if (this._wallPlacingMode) {
      const hits = this.raycaster.intersectObjects(this.modelMeshes, true);
      if (!hits.length) return;
      const hit = hits[0];
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
      if (n.y < 0.7) { this.toast('Click lên mặt sàn để đặt tường', 'info'); return; }
      this._wallPlacingMode = false;
      this.renderer.domElement.style.cursor = 'default';
      document.getElementById('wall-place-hint').style.display = 'none';
      const wall = this.placeInteriorWall(hit.point.clone());
      this.selectItem('wall', wall, this.interiorWalls.length - 1);
      this._openWallCfg(wall);
      this._triggerAutosave();
      this.toast('Đã đặt tường ✓ — Dùng thanh công cụ để di chuyển/xoay/scale', 'success');
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
        const idx = this.artworks.findIndex(a => a.group === h);
        if (idx !== -1) {
          const aw = this.artworks[idx];
          this.selectItem('artwork', aw, idx); return;
        }
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

      if (this.textEditor?.texts.length) {
        const tHits = this.raycaster.intersectObjects(this.textEditor.texts.map(t => t.group), true);
        if (tHits.length) {
          let h = tHits[0].object; while (h.parent && !this.textEditor.texts.find(t => t.group === h)) h = h.parent;
          const idx = this.textEditor.texts.findIndex(t => t.group === h);
          if (idx !== -1) { 
            this.selectItem('text', this.textEditor.texts[idx], idx);
            // Mở advanced text editor để chỉnh sửa text đã đặt
            this.textEditor.selectTextForEdit(idx);
            return; 
          }
        }
      }

      // Detect interior walls
      if (this.interiorWalls.length) {
        const wallMeshes = this.interiorWalls.map(w => w.group);
        const wHits = this.raycaster.intersectObjects(wallMeshes, true);
        if (wHits.length) {
          let h = wHits[0].object;
          while (h.parent && !this.interiorWalls.find(w => w.group === h)) h = h.parent;
          const idx = this.interiorWalls.findIndex(w => w.group === h);
          if (idx !== -1) {
            this.selectItem('wall', this.interiorWalls[idx], idx);
            this._openWallCfg(this.interiorWalls[idx]);
            return;
          }
        }
      }

      // Detect easter egg objects
      const eggObjs = Object.values(this.missionBuilder._eggObjs);
      if (eggObjs.length) {
        const eHits = this.raycaster.intersectObjects(eggObjs, true);
        if (eHits.length) {
          let h = eHits[0].object;
          while (h.parent && !eggObjs.includes(h)) h = h.parent;
          const meta = this.missionBuilder._eggObjMeta.get(h);
          if (meta) {
            this.selectItem('egg', { object: h, missionIdx: meta.missionIdx, eggIdx: meta.eggIdx }, `${meta.missionIdx}_${meta.eggIdx}`);
            return;
          }
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

    if (this.selectedItem && (this.mode === 'translate' || this.mode === 'rotate' || this.mode === 'scale')) {
      const obj = this.getSelObj();
      if (obj) {
        const isWall = this.selectedItem.type === 'artwork' || this.selectedItem.type === 'text';
        const isInteriorWall = this.selectedItem.type === 'wall';
        if (this.mode === 'rotate') {
          if (isWall) {
            obj.rotation.z -= dx * 0.012; // spin on wall plane
          } else {
            obj.rotation.y -= dx * 0.012;
          }
        } else if (this.mode === 'scale') {
          if (isInteriorWall) {
            // For interior walls: horizontal drag = width, vertical drag = height
            const w = this.interiorWalls.find(w => w.group === obj);
            if (w) {
              w.width  = Math.max(0.3, Math.min(12, w.width  + dx * 0.02));
              w.height = Math.max(0.3, Math.min(8,  w.height - dy * 0.02));
              this._applyWallDimensions(w);
              // Sync inline cfg UI if open
              const wEl = document.getElementById('rp-wc-width');
              const hEl = document.getElementById('rp-wc-height');
              if (wEl) { wEl.value = w.width; document.getElementById('rp-wc-width-val').textContent = w.width.toFixed(1) + 'm'; }
              if (hEl) { hEl.value = w.height; document.getElementById('rp-wc-height-val').textContent = w.height.toFixed(1) + 'm'; }
            }
          } else {
            const f = Math.max(0.92, Math.min(1.08, 1 - dy * 0.006));
            const curScale = (isFinite(obj.scale.x) && obj.scale.x > 0) ? obj.scale.x : 1;
            const maxScale = (this.selectedItem.type === 'model' || this.selectedItem.type === 'chest') ? 30 : 10;
            obj.scale.setScalar(Math.max(0.05, Math.min(maxScale, curScale * f)));
          }
        } else { // translate
          if (isWall) {
            // Dùng trục ngang của tường (chỉ Y-rotation, bỏ qua Z-rotation của user) để movement luôn nằm trong mặt phẳng tường
            const wallH = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, obj.rotation.y, 0, 'YXZ'));
            obj.position.addScaledVector(wallH, dx * 0.012);
            obj.position.y -= dy * 0.012;
          } else if (isInteriorWall) {
            // Move along floor
            this.camera.getWorldDirection(this.fwd); this.fwd.y = 0; this.fwd.normalize();
            this.rgt.crossVectors(this.fwd, new THREE.Vector3(0, 1, 0)).normalize();
            obj.position.addScaledVector(this.rgt, dx * 0.012);
            obj.position.addScaledVector(this.fwd, -dy * 0.012);
          } else {
            this.camera.getWorldDirection(this.fwd); this.fwd.y = 0; this.fwd.normalize();
            this.rgt.crossVectors(this.fwd, new THREE.Vector3(0, 1, 0)).normalize();
            obj.position.addScaledVector(this.rgt, dx * 0.012);
            obj.position.addScaledVector(this.fwd, -dy * 0.012);

            // ── Di chuyển bục (pedestal) và đèn theo cùng model ──
            if (this.selectedItem?.type === 'model') {
              const md = this.selectedItem.data ?? this.selectedItem;
              if (md?.pedestal) {
                md.pedestal.position.addScaledVector(this.rgt, dx * 0.012);
                md.pedestal.position.addScaledVector(this.fwd, -dy * 0.012);
              }
              if (md?.light) {
                md.light.position.addScaledVector(this.rgt, dx * 0.012);
                md.light.position.addScaledVector(this.fwd, -dy * 0.012);
              }
            }
          }
        }
        return;
      }
    }

    this.yaw -= dx * 0.003; this.pitch -= dy * 0.003;
    this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch));
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }

  /* ══════════════════════════════════════════════ UPDATE ══════════════════════════════════════════════ */
  update(dt) {
    if (!this.moveDir || !this.fwd || !this.rgt) return;
    if (this.textEditor && this.textEditor.isPlaceMode && this._lastMouseX !== undefined && this._lastMouseY !== undefined) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const mouseX = ((this._lastMouseX - rect.left) / rect.width) * 2 - 1;
        const mouseY = -((this._lastMouseY - rect.top) / rect.height) * 2 + 1;
        const mouseVec = new THREE.Vector2(mouseX, mouseY);
        const _previewWallMeshes = this.interiorWalls.flatMap(w => [w.frontMesh, w.backMesh]);
        this.textEditor.updatePreviewOnMouseMove(this.raycaster, this.camera, mouseVec, [...this.modelMeshes, ..._previewWallMeshes]);
        this._drawMinimap();
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
    this._drawMinimap();  }

  /* ══════════════════════════════════════════════ SAVE / LOAD ══════════════════════════════════════════════ */
  async _togglePublish() {
    if (!this._isRoomNameValid()) return;
    const room = this.manager.currentRoom;
    room.isPublished = !room.isPublished;
    const btn = document.getElementById('rp-btn-publish');
    if (btn) {
      btn.textContent = room.isPublished ? '🔒 Huỷ xuất bản' : '🌐 Xuất bản ngay';
      btn.className = `rp-pub-btn ${room.isPublished ? 'danger' : 'primary'}`;
    }
    await this.saveGallery();
    this.toast(room.isPublished ? 'Đã publish phòng ✓' : 'Đã chuyển về Draft', room.isPublished ? 'success' : 'info');
  }

  _buildUploadedSourcesSaveData() {
    const map = new Map();
    // 1. Từ _uploadedSources (file upload trong session, kể cả chưa đặt)
    for (const s of this._uploadedSources) {
      const url = s.src?.storageUrl;
      if (url && !map.has(url)) map.set(url, { type: s.type, label: s.label, storageUrl: url });
    }
    // 2. Artworks đã đặt vào phòng
    for (const a of this.artworks) {
      if (!a.storageUrl || map.has(a.storageUrl)) continue;
      const type = a.isYouTube ? 'youtube' : (a.isVideo ? 'video' : 'image');
      const label = a.isYouTube ? ('YouTube: ' + a.youtubeId) : a.storageUrl.split('/').pop().replace(/^\d+_/, '');
      map.set(a.storageUrl, { type, label, storageUrl: a.storageUrl, youtubeId: a.youtubeId || null });
    }
    // 3. Models 3D đã đặt vào phòng
    for (const m of this.models3d) {
      if (!m.storageUrl || map.has(m.storageUrl)) continue;
      const label = m.name || m.storageUrl.split('/').pop().replace(/^\d+_/, '');
      map.set(m.storageUrl, { type: 'model', label, storageUrl: m.storageUrl });
    }
    return Array.from(map.values());
  }

  async saveGallery() {
    if (this._disposed) return;
    if (!this._isRoomNameValid()) return;

    if (this._saving) {
      this._pendingSave = true;
      return;
    }
    this._saving = true;

    const room = this.manager.currentRoom;
    const btn = document.getElementById('btn-studio-save');
    if (btn) btn.style.opacity = '0.5';

    const galleryData = {
      _meta: {
        roomName: room.name,
        isPublished: room.isPublished,
        artistId: room.artistId,
        artistName: this.manager.auth.user?.name || '',
        selectedTemplate: this.selectedTemplate,
        description: room.description || '',
        tags: room.tags || [],
        thumbnailUrl: room.thumbnailUrl || null,
        viewerSpawn: this.viewerSpawn.getSaveData(),
      },
      artworks: this.artworks.map(a => ({
        x: a.group.position.x,
        y: a.group.position.y,
        z: a.group.position.z,
        rx: a.group.rotation.x,
        ry: a.group.rotation.y,
        rz: a.group.rotation.z,
        sx: a.group.scale.x,
        sy: a.group.scale.y,
        sz: a.group.scale.z,
        storageUrl: a.storageUrl || null,
        isVideo: a.isVideo || false,
        isYouTube: a.isYouTube || false,
        youtubeId: a.youtubeId || null,
        isUrlEmbed: a.isUrlEmbed || false,
        naturalWidth: a.naturalWidth,
        naturalHeight: a.naturalHeight,
        frameVisible:   a.frameVisible !== false,
        frameColor:     a.frameColor   ?? 0x182D58,
        frameThickness: a.frameThickness ?? 0.08,
        meta: a.meta,
      })),
      models: this.models3d.map(m => ({
        x: m.object.position.x,
        y: m.object.position.y,
        z: m.object.position.z,
        ry: m.object.rotation.y,
        sx: m.object.scale.x,
        sy: m.object.scale.y,
        sz: m.object.scale.z,
        storageUrl: m.storageUrl || null,
        name: m.name || null,
        hasPedestal: m.hasPedestal !== false,
        meta: m.meta,
      })),
      texts: this.textEditor.getSaveData(),
      interiorWalls: this.interiorWalls.map(w => ({
        x: w.group.position.x, y: w.group.position.y, z: w.group.position.z,
        ry: w.group.rotation.y,
        width: w.width, height: w.height, thickness: w.thickness,
        frontColor: w.frontColor, backColor: w.backColor,
        frontWallpaper: w.frontWallpaper || null, backWallpaper: w.backWallpaper || null,
      })),
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
      artist_name: this.manager.auth.user?.name || 'Artist',
      musicUrl: this._musicPlaylist.length ? this._musicPlaylist[0].url : null,
      musicPlaylist: this._musicPlaylist.length ? this._musicPlaylist : null,
      uploadedSources: this._buildUploadedSourcesSaveData(),
    };

    console.log('[Save] models count:', galleryData.models?.length, 'uploadedSources:', galleryData.uploadedSources?.length);
    try {
      const { error } = await supabase
        .from('gallery')
        .upsert({ name: room.id, scene_data: galleryData }, { onConflict: 'name' });

      if (this._missionData?.some(d => d?.mission_type)) {
        await this.missionBuilder.saveMissionsSilent();
      }

      if (btn) btn.style.opacity = '1';
      if (error) {
        console.error('Upsert error:', error);
        this.toast('Lưu thất bại: ' + error.message, 'error');
      } else {
        this.toast('Đã lưu ✓', 'success');
      }
    } finally {
      this._saving = false;
      if (this._pendingSave) {
        this._pendingSave = false;
        this._triggerAutosave();
      }
    }
  }

  async loadGallery() {
    const roomId = this.manager.currentRoom?.id;
    if (!roomId) return;
    const { data, error } = await supabase.from('gallery').select('*').eq('name', roomId).limit(1);
    if (error || !data || !data.length) return;
    const sd = data[0].scene_data;
    console.log('[Load] models:', sd.models?.length, 'uploadedSources:', sd.uploadedSources?.length);

    // Khôi phục metadata phòng
    const room = this.manager.currentRoom;
    if (room && sd._meta) {
      if (sd._meta.description !== undefined) room.description = sd._meta.description;
      if (sd._meta.tags !== undefined) room.tags = sd._meta.tags;
      if (sd._meta.thumbnailUrl) room.thumbnailUrl = sd._meta.thumbnailUrl;
      if (sd._meta.viewerSpawn) this.viewerSpawn.loadFromData(sd._meta.viewerSpawn);
    }

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
        const frameOpts = { frameVisible: a.frameVisible !== false, frameColor: a.frameColor ?? 0x182D58, frameThickness: a.frameThickness ?? 0.08 };
        if (a.isYouTube && a.youtubeId) {
          await new Promise(async resolve => {
            const ytId = a.youtubeId;
            const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 640, 360);
            const img = new Image(); img.crossOrigin = 'anonymous';
            img.src = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
            await new Promise(r => { img.onload = r; img.onerror = r; setTimeout(r, 4000); });
            if (img.complete && img.naturalWidth) ctx.drawImage(img, 0, 0, 640, 360);
            ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.arc(320, 180, 56, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(302, 152); ctx.lineTo(302, 208); ctx.lineTo(352, 180); ctx.closePath(); ctx.fill();
            const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
            const th = document.createElement('canvas'); th.width = 120; th.height = 68;
            th.getContext('2d').drawImage(canvas, 0, 0, 120, 68);
            const src = { texture: tex, naturalWidth: 16, naturalHeight: 9, isYouTube: true, youtubeId: ytId, storageUrl: a.storageUrl };
            this._uploadedSources.push({ type: 'youtube', label: 'YouTube: ' + ytId, src, thumbCanvas: th });
            this.placeArtwork(src, pos, [a.rx || 0, a.ry || 0, a.rz || 0], a.meta || {}, sv, frameOpts);
            resolve();
          });
          continue;
        }
        if (a.isVideo) {
          await new Promise(resolve => {
            const vid = document.createElement('video'); vid.src = a.storageUrl; vid.loop = true; vid.muted = true; vid.playsInline = true; vid.crossOrigin = 'anonymous';
            vid.addEventListener('loadeddata', () => {
              const tex = new THREE.VideoTexture(vid); tex.minFilter = THREE.LinearFilter; tex.colorSpace = THREE.SRGBColorSpace;
              this.placeArtwork({ isVideo: true, texture: tex, videoEl: vid, storageUrl: a.storageUrl }, pos, [a.rx || 0, a.ry || 0, a.rz || 0], a.meta || {}, sv, frameOpts);
              vid.play();
              resolve();
            }, { once: true });
            vid.addEventListener('error', () => resolve(), { once: true });
            setTimeout(resolve, 8000);
          });
        } else {
          const tex = await new Promise(resolve => new THREE.TextureLoader().load(a.storageUrl, resolve, undefined, () => resolve(null)));
          if (!tex) continue;
          tex.colorSpace = THREE.SRGBColorSpace;
          this.placeArtwork({ texture: tex, storageUrl: a.storageUrl, naturalWidth: a.naturalWidth || 1, naturalHeight: a.naturalHeight || 1 }, pos, [a.rx || 0, a.ry || 0, a.rz || 0], a.meta || {}, sv, frameOpts);
        }
      }
    }
    if (sd.models?.length) {
      const modelTasks = sd.models.filter(m => m.storageUrl).map(m => new Promise(resolve => {
        const ext = m.storageUrl.split('.').pop().toLowerCase();
        const pos = new THREE.Vector3(m.x, m.y, m.z);
        const sv  = m.sx ? new THREE.Vector3(m.sx, m.sy, m.sz) : null;
        const onLoad = obj => {
          const placed = this.place3DModel(obj, pos, m.storageUrl, m.name || null, m.meta || {}, sv, m.hasPedestal !== false);
          if (placed && m.ry) placed.object.rotation.y = m.ry;
          resolve();
        };
        const onErr = () => resolve();
        if (ext === 'glb' || ext === 'gltf') this.gltfLoader.load(m.storageUrl, g => onLoad(g.scene), null, onErr);
        else if (ext === 'obj') this.objLoader.load(m.storageUrl, obj => { obj.traverse(c => { if (c.isMesh) c.material = new THREE.MeshLambertMaterial({ color: 0xccbbaa }); }); onLoad(obj); }, null, onErr);
        else resolve();
      }));
      await Promise.all(modelTasks);
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
    
    if (sd.interiorWalls?.length) {
      for (const wData of sd.interiorWalls) {
        const fakePos = new THREE.Vector3(wData.x, 0, wData.z);
        const wall = this.placeInteriorWall(fakePos);
        wall.group.position.set(wData.x, wData.y, wData.z);
        wall.group.rotation.y = wData.ry || 0;
        wall.width = wData.width ?? 3;
        wall.height = wData.height ?? 3;
        wall.thickness = wData.thickness ?? 0.1;
        wall.frontColor = wData.frontColor || '#f5f0e8';
        wall.backColor  = wData.backColor  || '#f5f0e8';
        wall.frontWallpaper = wData.frontWallpaper || null;
        wall.backWallpaper  = wData.backWallpaper  || null;
        this._applyWallDimensions(wall);
        this._applyWallMaterials(wall);
      }
      this._renderWallList();
    }
    
    if (sd.musicPlaylist?.length) {
      this._musicPlaylist = sd.musicPlaylist;
      this._musicIndex = 0;
      const track = this._musicPlaylist[0];
      this.backgroundMusic = new Audio(track.url);
      this.backgroundMusic.volume = 0.5;
      this.backgroundMusic.onended = () => this._loadTrack(this._musicIndex + 1);
      const trackNameEl = document.getElementById('music-track-name');
      const volumeSliderEl = document.getElementById('music-volume-slider');
      if (trackNameEl) trackNameEl.textContent = '🎵 ' + track.name;
      if (volumeSliderEl) volumeSliderEl.value = 0.5;
      this.backgroundMusic.play().then(() => {
        this.isMusicPlaying = true;
        const ppEl = document.getElementById('music-play-pause');
        if (ppEl) ppEl.textContent = '⏸';
      }).catch(() => {
        this.isMusicPlaying = false;
        const ppEl = document.getElementById('music-play-pause');
        if (ppEl) ppEl.textContent = '▶';
      });
    } else if (sd.musicUrl) {
      // backward compat: load cũ chỉ có 1 bài
      this._musicPlaylist = [{ url: sd.musicUrl, name: 'Background Music' }];
      this._musicIndex = 0;
      this.backgroundMusic = new Audio(sd.musicUrl);
      this.backgroundMusic.volume = 0.5;
      this.backgroundMusic.onended = () => this._loadTrack(this._musicIndex + 1);
      this.backgroundMusic.play().then(() => {
        this.isMusicPlaying = true;
        const ppEl = document.getElementById('music-play-pause');
        if (ppEl) ppEl.textContent = '⏸';
      }).catch(() => {
        this.isMusicPlaying = false;
      });
    }
    await this._loadChests();

    // ── Khôi phục danh sách tác phẩm vào sidebar ──
    // Gộp sd.uploadedSources + artworks đã đặt + models đã đặt, dedup theo storageUrl
    const usMap = new Map();
    for (const entry of (sd.uploadedSources || [])) {
      if (entry.storageUrl && !usMap.has(entry.storageUrl)) usMap.set(entry.storageUrl, entry);
    }
    for (const a of this.artworks) {
      if (!a.storageUrl || usMap.has(a.storageUrl)) continue;
      const label = a.storageUrl.split('/').pop().replace(/^\d+_/, '');
      usMap.set(a.storageUrl, { type: a.isVideo ? 'video' : 'image', label, storageUrl: a.storageUrl });
    }
    for (const m of this.models3d) {
      if (!m.storageUrl || usMap.has(m.storageUrl)) continue;
      const label = m.name || m.storageUrl.split('/').pop().replace(/^\d+_/, '');
      usMap.set(m.storageUrl, { type: 'model', label, storageUrl: m.storageUrl });
    }

    // Push stub ngay lập tức để _rowRefs có data khi render, thumbnail load async sau
    for (const entry of usMap.values()) {
      if (!entry.storageUrl) continue;
      const stub = { type: entry.type, label: entry.label, src: { storageUrl: entry.storageUrl }, thumbCanvas: null };
      this._uploadedSources.push(stub);

      if (entry.type === 'image') {
        const img = new Image(); img.crossOrigin = 'anonymous';
        img.onload = () => {
          const nw = img.naturalWidth, nh = img.naturalHeight;
          const cv = document.createElement('canvas'); cv.width = 512; cv.height = Math.round(512 * nh / nw);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
          stub.src = { canvas: cv, texture: tex, naturalWidth: nw, naturalHeight: nh, storageUrl: entry.storageUrl };
          const th = document.createElement('canvas'); th.width = 120; th.height = 120;
          const ctx = th.getContext('2d');
          const scale = 120 / nw; const dh = nh * scale;
          ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(0, 0, 120, 120);
          ctx.drawImage(img, 0, (120 - dh) / 2, 120, dh);
          stub.thumbCanvas = th;
          this._renderUploadedList();
        };
        img.src = entry.storageUrl;
      } else if (entry.type === 'video') {
        const vid = document.createElement('video');
        vid.src = entry.storageUrl; vid.loop = true; vid.muted = true; vid.playsInline = true; vid.crossOrigin = 'anonymous';
        vid.addEventListener('loadeddata', () => {
          const tex = new THREE.VideoTexture(vid); tex.minFilter = THREE.LinearFilter; tex.colorSpace = THREE.SRGBColorSpace;
          stub.src = { isVideo: true, texture: tex, videoEl: vid, storageUrl: entry.storageUrl };
          const th = document.createElement('canvas'); th.width = 120; th.height = 120;
          setTimeout(() => {
            vid.currentTime = 0.5;
            vid.addEventListener('seeked', () => {
              const ctx = th.getContext('2d');
              const scale = 120 / (vid.videoWidth || 1); const dh = (vid.videoHeight || 0) * scale;
              ctx.fillStyle = '#ffffff8a'; ctx.fillRect(0, 0, 120, 120);
              ctx.drawImage(vid, 0, (120 - dh) / 2, 120, dh);
              stub.thumbCanvas = th;
              this._renderUploadedList();
            }, { once: true });
          }, 200);
          vid.play().catch(() => {});
        }, { once: true });
      } else if (entry.type === 'model') {
        // Model chỉ cần icon hộp, không cần load lại object 3D cho sidebar
        stub.src = { type: 'model3d', name: entry.label, storageUrl: entry.storageUrl };
      }
    }

    // Render ngay sau khi push tất cả stubs
    this._renderUploadedList();
    this._renderTextList();
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
    document.getElementById('btn-add-chest').style.cssText = 'background:url(\'/panelstudio/button.svg\') no-repeat center center / 100% 100%;border:none;width:100%;height:43px;cursor:pointer;';
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
      const scaledBox = new THREE.Box3().setFromObject(mesh);
      const chestFloorY = (this.floorY ?? 0) - scaledBox.min.y;
      mesh.position.set(chest.pos_x, chestFloorY, chest.pos_z);
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

  /* ══════════════════════════════════════════════ INTERIOR WALLS ══════════════════════════════════════════════ */

  _buildWallPanel() {
    // Inject CSS
    const style = document.createElement('style');
    style.textContent = `
      #wall-panel {
        position:fixed; left:10px; top:60px; width:270px;
        background:rgba(15,13,12,.97); border:.5px solid rgba(212,197,169,.18);
        border-radius:4px; z-index:20; padding:12px;
        flex-direction:column; gap:10px; display:none;
        font-family:monospace; max-height:85vh; overflow-y:auto;
      }
      #wall-panel.open { display:flex; }
      #wall-panel h3 { color:#d4c5a9; font-size:13px; font-style:italic; letter-spacing:.1em;
        border-bottom:.5px solid rgba(212,197,169,.18); padding-bottom:6px; margin:0; }
      .wall-item { display:flex; align-items:center; gap:6px;
        background:rgba(212,197,169,.04); border:.5px solid rgba(212,197,169,.12);
        border-radius:2px; padding:5px 8px; cursor:pointer; transition:all .15s; }
      .wall-item:hover, .wall-item.sel { border-color:#c8a96e; background:rgba(200,169,110,.08); }
      .wall-item-lbl { color:#7a6e5c; font-size:9px; flex:1; }
      .wall-item-del { background:rgba(181,74,58,.6); color:#fff; border:none;
        font-size:7px; cursor:pointer; padding:1px 5px; border-radius:1px; }
      /* Wall config panel */
      #wall-cfg-panel {
        position:fixed; left:290px; top:60px; width:260px;
        background:rgba(15,13,12,.97); border:.5px solid rgba(200,169,110,.4);
        border-radius:4px; z-index:21; padding:12px;
        flex-direction:column; gap:8px; display:none;
        font-family:monospace; max-height:85vh; overflow-y:auto;
      }
      #wall-cfg-panel.open { display:flex; }
      #wall-cfg-panel h4 { color:#c8a96e; font-size:11px; letter-spacing:.1em; margin:0; }
      .wcfg-row { display:flex; align-items:center; justify-content:space-between; gap:8px; }
      .wcfg-label { color:#7a6e5c; font-size:9px; letter-spacing:.08em; text-transform:uppercase; flex-shrink:0; }
      .wcfg-val { color:#d4c5a9; font-size:9px; width:32px; text-align:right; flex-shrink:0; }
      .wcfg-range { flex:1; -webkit-appearance:none; height:2px;
        background:rgba(212,197,169,.2); border-radius:1px; outline:none; cursor:pointer; }
      .wcfg-range::-webkit-slider-thumb { -webkit-appearance:none; width:10px; height:10px;
        border-radius:50%; background:#d4c5a9; cursor:pointer; }
      .wcfg-color { width:32px; height:20px; border:none; border-radius:2px; cursor:pointer; background:none; padding:0; }
      .wcfg-sep { border:none; border-top:.5px solid rgba(212,197,169,.12); margin:2px 0; }
      .wcfg-side-tabs { display:flex; gap:4px; }
      .wcfg-side-tab { flex:1; padding:4px; font-size:9px; cursor:pointer; text-align:center;
        background:rgba(212,197,169,.06); border:.5px solid rgba(212,197,169,.18);
        border-radius:2px; color:#7a6e5c; transition:all .15s; }
      .wcfg-side-tab.active { background:rgba(200,169,110,.2); border-color:#c8a96e; color:#c8a96e; }
      .wcfg-wp-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:5px; margin-top:4px; }
      .wcfg-wp-item { aspect-ratio:1; border-radius:4px; border:1.5px solid rgba(212,197,169,.18);
        cursor:pointer; overflow:hidden; transition:all .15s; }
      .wcfg-wp-item:hover { border-color:#c8a96e; }
      .wcfg-wp-item.sel { border-color:#c8a96e; outline:2px solid rgba(200,169,110,.5); }
      .wcfg-wp-item img { width:100%; height:100%; object-fit:cover; display:block; }
      .wcfg-no-wp { color:#555; font-size:8px; text-align:center; padding:8px 0; letter-spacing:.08em; }
    `;
    document.head.appendChild(style);
    this._el(style);

    // Main wall panel
    const panel = document.createElement('div');
    panel.id = 'wall-panel';
    panel.innerHTML = `
      <h3>🧱 Tường nội thất</h3>
      <button class="pp-btn primary" id="btn-add-wall" style="width:100%">➕ Thêm tường mới</button>
      <div id="wall-place-hint" style="color:#7a6e5c;font-size:9px;letter-spacing:.08em;display:none">↓ Click vào sàn để đặt tường</div>
      <div id="wall-list" style="display:flex;flex-direction:column;gap:4px;margin-top:4px"></div>
    `;
    document.body.appendChild(panel);
    this._el(panel);


    // Events
    document.getElementById('btn-add-wall').addEventListener('click', () => {
      this._wallPlacingMode = true;
      this.renderer.domElement.style.cursor = 'crosshair';
      document.getElementById('wall-place-hint').style.display = 'block';
    });

    // Dimension sliders


    this._wcCurrentSide = 'front';
    this._wallWallpapers = [];
    this._loadWallWallpapers();
  }

  async _loadWallWallpapers() {
    try {
      const res = await fetch('/wallpapers/manifest.json');
      const list = await res.json();
      this._wallWallpapers = list;
    } catch {
      // fallback: tạo vài wallpaper màu đơn giản
      this._wallWallpapers = [];
    }
    if (this._selectedWall) this._renderWallWpGrid();
  }

  _renderWallWpGrid() {
    const grid = document.getElementById('wc-wp-grid');
    if (!grid) return;
    grid.innerHTML = '';
    if (!this._wallWallpapers.length) {
      grid.innerHTML = '<div class="wcfg-no-wp" style="grid-column:1/-1">Chưa có giấy dán tường</div>';
      return;
    }
    const side = this._wcCurrentSide || 'front';
    const currentWp = side === 'front' ? this._selectedWall?.frontWallpaper : this._selectedWall?.backWallpaper;
    this._wallWallpapers.forEach(wp => {
      const item = document.createElement('div');
      item.className = 'wcfg-wp-item' + (currentWp === wp.file ? ' sel' : '');
      item.title = wp.name || wp.file;
      const img = document.createElement('img');
      img.src = `/wallpapers/${wp.thumb || wp.file}`;
      img.onerror = () => { item.style.background = '#555'; };
      item.appendChild(img);
      item.addEventListener('click', () => {
        if (!this._selectedWall) return;
        const file = `/wallpapers/${wp.file}`;
        if (side === 'front') this._selectedWall.frontWallpaper = file;
        else this._selectedWall.backWallpaper = file;
        this._applyWallMaterials(this._selectedWall);
        this._renderWallWpGrid();
        this._triggerAutosave();
      });
      grid.appendChild(item);
    });
  }

  _syncWallCfgUI() {
    if (!this._selectedWall) return;
    const side = this._wcCurrentSide || 'front';
    const color = side === 'front' ? (this._selectedWall.frontColor || '#f5f0e8') : (this._selectedWall.backColor || '#f5f0e8');
    const colorEl = document.getElementById('wc-color');
    if (colorEl) colorEl.value = color;
    this._renderWallWpGrid();
  }

  _openWallCfg(wall) {
    this._selectedWall = wall;
    this._wcCurrentSide = 'front';
    // Sync old standalone panel nếu còn tồn tại
   
    // Sync inline panel trong right panel
    if (this._rpWallCfgSync) this._rpWallCfgSync(wall);
    this._renderWallList();
  }

  _closeWallCfg() {
    this._selectedWall = null;
    if (this._rpWallCfgSync) this._rpWallCfgSync(null);
    this._renderWallList();
  }

  placeInteriorWall(pos) {
    const W = 3, H = 3, T = 0.1;
    const group = new THREE.Group();
    group.position.copy(pos);
    group.position.y = pos.y + H / 2;

    // Front face
    const frontGeo = new THREE.PlaneGeometry(W, H);
    const frontMat = new THREE.MeshLambertMaterial({ color: 0xf5f0e8, side: THREE.FrontSide });
    const frontMesh = new THREE.Mesh(frontGeo, frontMat);
    frontMesh.position.z = T / 2 + 0.001;
    group.add(frontMesh);

    // Back face
    const backGeo = new THREE.PlaneGeometry(W, H);
    const backMat = new THREE.MeshLambertMaterial({ color: 0xf5f0e8, side: THREE.FrontSide });
    const backMesh = new THREE.Mesh(backGeo, backMat);
    backMesh.rotation.y = Math.PI;
    backMesh.position.z = -(T / 2 + 0.001);
    group.add(backMesh);

    // Edge (solid box between the two faces)
    const edgeGeo = new THREE.BoxGeometry(W, H, T);
    const edgeMat = new THREE.MeshLambertMaterial({ color: 0xd4c5a9 });
    const edgeMesh = new THREE.Mesh(edgeGeo, edgeMat);
    group.add(edgeMesh);

    this.threeScene.add(group);

    const wall = {
      group, frontMesh, backMesh, edgeMesh,
      width: W, height: H, thickness: T,
      frontColor: '#f5f0e8', backColor: '#f5f0e8',
      frontWallpaper: null, backWallpaper: null,
    };
    this.interiorWalls.push(wall);
    this._renderWallList();
    return wall;
  }

  _applyWallDimensions(wall) {
    const W = wall.width;
    const H = wall.height;
    const T = wall.thickness;

    wall.frontMesh.geometry.dispose();
    wall.frontMesh.geometry = new THREE.PlaneGeometry(W, H);
    wall.frontMesh.position.z = T / 2 + 0.001;

    wall.backMesh.geometry.dispose();
    wall.backMesh.geometry = new THREE.PlaneGeometry(W, H);
    wall.backMesh.position.z = -(T / 2 + 0.001);

    wall.edgeMesh.geometry.dispose();
    wall.edgeMesh.geometry = new THREE.BoxGeometry(W, H, T);

    this._triggerAutosave();
  }

  _applyWallMaterials(wall) {
    const applyToMesh = (mesh, color, wallpaperUrl) => {
      if (wallpaperUrl) {
        new THREE.TextureLoader().load(wallpaperUrl, (tex) => {
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.RepeatWrapping;
          tex.repeat.set(wall.width / 1.5, wall.height / 1.5);
          mesh.material.map = tex;
          mesh.material.color.set(0xffffff);
          mesh.material.needsUpdate = true;
        });
      } else {
        mesh.material.map = null;
        mesh.material.color.set(color || '#f5f0e8');
        mesh.material.needsUpdate = true;
      }
    };
    applyToMesh(wall.frontMesh, wall.frontColor, wall.frontWallpaper);
    applyToMesh(wall.backMesh, wall.backColor, wall.backWallpaper);
    // Edge color = average of both sides
    wall.edgeMesh.material.color.set(wall.frontColor || '#d4c5a9');
    wall.edgeMesh.material.needsUpdate = true;
  }

  _renderWallList() {
    const list = document.getElementById('wall-list');
    if (!list) return;
    list.innerHTML = this.interiorWalls.length ? '' : '<div style="color:#555;font-size:9px">Chưa có tường nào</div>';
    this.interiorWalls.forEach((w, i) => {
      const el = document.createElement('div');
      el.className = 'wall-item' + (this._selectedWall === w ? ' sel' : '');
      el.innerHTML = `<span class="wall-item-lbl">Tường ${i + 1} · ${w.width.toFixed(1)}×${w.height.toFixed(1)}m</span><button class="wall-item-del" data-i="${i}">✕</button>`;
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('wall-item-del')) return;
        this._openWallCfg(w);
        this.selectItem('wall', w, i);
      });
      el.querySelector('.wall-item-del').addEventListener('click', (e) => {
        e.stopPropagation();
        this._deleteInteriorWall(i);
      });
      list.appendChild(el);
    });
    // Also refresh the right-panel wall list if open
    if (this._rpWallListRefresh) this._rpWallListRefresh();
  }

  _deleteInteriorWall(idx) {
    const wall = this.interiorWalls[idx];
    if (!wall) return;
    if (this._selectedWall === wall) this._closeWallCfg();
    this.threeScene.remove(wall.group);
    this.interiorWalls.splice(idx, 1);
    this._renderWallList();
    this._triggerAutosave();
    this.toast('Đã xoá tường', 'info');
  }

  /**
   * Xoay tất cả artworks, models 3D và texts đang nằm trên tường
   * bằng cách attach chúng vào wall.group, xoay group, rồi detach lại về scene.
   * Cách này đảm bảo cả vị trí lẫn hướng của object được biến đổi chính xác
   * như thể chúng là một cụm gắn chặt vào tường.
   */
  _rotateWallContents(wall, oldRad, newRad) {
    if (!wall?.group) return;

    const halfW = wall.width  / 2 + 0.6;
    const halfH = wall.height / 2 + 0.6;
    const halfT = wall.thickness / 2 + 0.5;

    const cosOld = Math.cos(oldRad), sinOld = Math.sin(oldRad);
    const cx = wall.group.position.x;
    const cy = wall.group.position.y;
    const cz = wall.group.position.z;

    // Thu thập objects nằm trên tường (kiểm tra trong local space của tường CŨ)
    const attached = [];
    const check = (obj) => {
      if (!obj) return;
      const px = obj.position.x - cx;
      const py = obj.position.y - cy;
      const pz = obj.position.z - cz;
      const localX =  cosOld * px + sinOld * pz;
      const localY =  py;
      const localZ = -sinOld * px + cosOld * pz;
      if (Math.abs(localX) <= halfW && Math.abs(localY) <= halfH && Math.abs(localZ) <= halfT) {
        attached.push(obj);
      }
    };

    this.artworks.forEach(a  => check(a?.group));
    this.models3d.forEach(m  => check(m?.object));
    if (this.textEditor?.texts) {
      this.textEditor.texts.forEach(t => check(t?.group));
    }

    if (!attached.length) return;

    // Attach toàn bộ vào wall.group (Three.js giữ nguyên world transform)
    attached.forEach(obj => wall.group.attach(obj));

    // Xoay wall.group sang góc mới
    wall.group.rotation.y = newRad;

    // Detach về scene — world transform được tính lại tự động
    attached.forEach(obj => this.threeScene.attach(obj));
  }

  /**
   * Dịch chuyển tất cả artworks, models 3D và texts đang nằm gần/trên một tường
   * theo delta (dx, dz) khi tường bị di chuyển bằng slider vị trí.
   * Phát hiện "nằm trên tường" bằng cách kiểm tra khoảng cách từ object
   * tới mặt phẳng của tường (< threshold).
   */
  _moveWallContents(wall, dx, dz) {
    if (!wall?.group) return;

    // Tâm tường TRƯỚC KHI di chuyển (vì slider đã set position rồi mới gọi hàm này,
    // nên phải lấy lại vị trí cũ = hiện tại - delta)
    const cx = wall.group.position.x - dx;
    const cy = wall.group.position.y;
    const cz = wall.group.position.z - dz;

    // Threshold: nửa chiều rộng + nửa chiều cao + margin để bắt object gắn vào mặt tường
    const halfW  = wall.width  / 2 + 0.6;
    const halfH  = wall.height / 2 + 0.6;
    // Theo hướng pháp tuyến (độ dày + offset để bắt artwork áp sát mặt)
    const halfT  = wall.thickness / 2 + 0.5;

    // Hướng tường (tính theo rotation.y của group)
    const ry = wall.group.rotation.y;
    const cosR = Math.cos(ry);
    const sinR = Math.sin(ry);

    const moveObject = (obj) => {
      if (!obj) return;
      const px = obj.position.x - cx;
      const py = obj.position.y - cy;
      const pz = obj.position.z - cz;

      // Chiếu vào local space của tường (chỉ xoay quanh Y)
      // local X = chiều ngang tường, local Z = pháp tuyến tường
      const localX =  cosR * px + sinR * pz;
      const localY =  py;
      const localZ = -sinR * px + cosR * pz;

      if (Math.abs(localX) <= halfW && Math.abs(localY) <= halfH && Math.abs(localZ) <= halfT) {
        obj.position.x += dx;
        obj.position.z += dz;
      }
    };

    this.artworks.forEach(a  => { if (a?.group)             moveObject(a.group); });
    this.models3d.forEach(m  => { if (m?.object)            moveObject(m.object); });
    if (this.textEditor?.texts) {
      this.textEditor.texts.forEach(t => { if (t?.group)    moveObject(t.group); });
    }
  }

  dispose() {
    clearTimeout(this._autosaveTimer);
    this._autosaveTimer = null;

    if (this.backgroundMusic) {
      this.backgroundMusic.pause();
      this.backgroundMusic.onended = null;
      this.backgroundMusic.src = '';
      this.backgroundMusic = null;
    }
    // Gỡ beforeunload listener để tránh memory leak khi scene bị huỷ
    if (this._beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this._beforeUnloadHandler);
      this._beforeUnloadHandler = null;
    }
    super.dispose?.();
  }
}