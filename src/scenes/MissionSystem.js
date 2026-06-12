/**
 * MissionSystem — viewer-side mission engine.
 * Được khởi tạo bởi ViewerScene, truy cập scene qua this._s.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { supabase } from '../utils/supabase.js';

export class MissionSystem {
  constructor(scene) {
    this._s            = scene;
    this._missions     = [];
    this._config       = null;
    this._completed    = new Set();  // Set<missionIndex> — missions fully done
    this._allDone      = false;
    this._foundEggs    = new Map();  // Map<missionIndex, Set<eggIndex>>
    this._eggSpheres   = [];         // [{sphere, missionIndex, eggIndex, isChestRiddle?, mission?}]
    this._eggObjects   = [];         // THREE.Object3D placed in scene
    this._hudEl        = null;
    this._hudCollapsed = true;  // Mặc định đóng khi vào phòng
    this._roomId       = null;
    this._gltfLoader   = new GLTFLoader();
    this._chestMixers  = new Map(); // Map<missionIndex, { mixer, action, mesh }>
  }

  // ─── Init ─────────────────────────────────────────────────────────────────────
  async init(roomId) {
    this._roomId = roomId;
    const userId = this._s.manager.auth.profile?.id;

    const [
      { data: missions, error: mErr },
      { data: config },
      { data: userCompletions },
      { data: roomComp },
    ] = await Promise.all([
      supabase.from('room_missions').select('*').eq('room_id', roomId).order('mission_index'),
      supabase.from('room_completion_config').select('*').eq('room_id', roomId).maybeSingle(),
      userId
        ? supabase.from('mission_completions').select('mission_index').eq('room_id', roomId).eq('user_id', userId)
        : { data: [] },
      userId
        ? supabase.from('room_completions').select('id').eq('room_id', roomId).eq('user_id', userId).maybeSingle()
        : { data: null },
    ]);

    if (mErr) { console.error('[MissionSystem] load error:', mErr.message); return; }
    if (!missions?.length) return;

    this._missions = missions;
    this._config   = config;
    this._allDone  = !!roomComp;
    (userCompletions || []).forEach(c => this._completed.add(c.mission_index));
    if (this._allDone) missions.forEach(m => this._completed.add(m.mission_index));

    await this._placeEggObjects();
    this._applyStoryArtworkOverlay();
    this._buildHUD();
  }

  // ─── Canvas click intercept ───────────────────────────────────────────────────
  handleCanvasClick(raycaster, art) {
    if (!this._missions.length) return false;

    // If clicked artwork is part of an uncompleted story mission → intercept
    if (art && art._storyMissionHidden) {
      this._s._toast?.('Bức tranh này thuộc nhiệm vụ bí ẩn! Xem HUD và chọn nhiệm vụ để tham gia.', 'info', 3000);
      return true;
    }

    // Check egg detection spheres (eggs + chest riddles)
    if (this._eggSpheres.length) {
      const hits = raycaster.intersectObjects(this._eggSpheres.map(d => d.sphere), false);
      if (hits.length) {
        const det = this._eggSpheres.find(d => d.sphere === hits[0].object);
        if (det && !this._completed.has(det.missionIndex)) {
          if (det.isChestRiddle) {
            this._openChestRiddlePopup(det.mission);
          } else {
            this._onEggFound(det.missionIndex, det.eggIndex);
          }
        }
        return true;
      }
    }

    return false;
  }

  // ─── Render loop ──────────────────────────────────────────────────────────────
  update(delta) {
    this._checkRiddleProximity();
    // Tick tất cả AnimationMixer của rương
    if (this._chestMixers.size) {
      const dt = delta ?? (this._clock ? this._clock.getDelta() : 0.016);
      this._chestMixers.forEach(({ mixer }) => mixer.update(dt));
    }
  }
// ─── Gamepad proximity check cho chest riddle ─────────────────────────────
  _checkRiddleProximity() {
    if (this._riddlePopupOpen) return;
    const cam = this._s.camera.position;
    let near = null;
    for (const det of this._eggSpheres) {
      if (!det.isChestRiddle) continue;
      if (this._completed.has(det.missionIndex)) continue;
      const sp = det.sphere.position;
      const dx = cam.x - sp.x, dz = cam.z - sp.z;
      if (dx * dx + dz * dz < 36) { near = det.mission; break; }
    }
    this._nearRiddleMission = near;
    // Hiện/ẩn hint popup "Bấm Y để mở rương"
    const hintEl = document.getElementById('ms-riddle-hint');
    if (hintEl) hintEl.style.display = near ? 'flex' : 'none';
  }

  // ─── Gamepad: di chuyển highlight đáp án (bao gồm nút Đóng ở cuối) ─────────
  _riddleMoveGamepad(dir) {
    if (!this._riddlePopupOpen) return;
    const btns = document.querySelectorAll('#ms-chest-riddle-popup .riddle-choice-btn');
    const closeBtn = document.querySelector('#ms-chest-riddle-popup .riddle-close-btn');
    if (!btns.length) return;
    // total = số đáp án + 1 (nút Đóng)
    const total = btns.length + (closeBtn ? 1 : 0);
    this._riddleSelectedIdx = ((this._riddleSelectedIdx ?? -1) + dir + total) % total;
    const isClose = this._riddleSelectedIdx === btns.length;
    btns.forEach((b, i) => {
      b.style.background  = i === this._riddleSelectedIdx ? 'rgba(200,169,110,0.25)' : 'rgba(255,255,255,0.05)';
      b.style.borderColor = i === this._riddleSelectedIdx ? 'rgba(200,169,110,0.7)'  : 'rgba(255,255,255,0.15)';
    });
    if (closeBtn) {
      closeBtn.style.background  = isClose ? 'rgba(200,169,110,0.18)' : 'transparent';
      closeBtn.style.borderColor = isClose ? 'rgba(200,169,110,0.6)'  : 'rgba(255,255,255,0.2)';
      closeBtn.style.color       = isClose ? '#FFE066'                 : 'rgba(255,255,255,0.45)';
    }
    this._sfx('choice_hover');
  }

  // ─── Gamepad: xác nhận item đang highlight (đáp án hoặc nút Đóng) ─────────
  _riddleConfirmGamepad() {
    if (!this._riddlePopupOpen) return;
    const btns = document.querySelectorAll('#ms-chest-riddle-popup .riddle-choice-btn');
    if (this._riddleSelectedIdx == null) return;
    if (this._riddleSelectedIdx === btns.length) {
      // Đang highlight nút Đóng
      document.querySelector('#ms-chest-riddle-popup .riddle-close-btn')?.click();
    } else {
      btns[this._riddleSelectedIdx]?.click();
    }
  }
  // ─── Place egg objects in scene ───────────────────────────────────────────────
  async _placeEggObjects() {
    for (const m of this._missions) {
      // ── Chest riddle ──
      if (m.mission_type === 'chest_riddle') {
        const cp = (m.easter_eggs || [])[0];
        if (!cp || cp.pos_x === null || cp.pos_x === undefined) continue;
        await new Promise(resolve => {
          this._gltfLoader.load('/treasure/treasure_chest.glb', gltf => {
            if (this._disposed) { resolve(); return; }
            const mesh = gltf.scene;
            const box  = new THREE.Box3().setFromObject(mesh);
            const sz   = box.getSize(new THREE.Vector3());
            const base = 0.6 / Math.max(sz.x, sz.y, sz.z);
            mesh.scale.setScalar(base * (cp.scale ?? 1.0));
            const scaledBox = new THREE.Box3().setFromObject(mesh);
            const surfaceY = (cp.pos_y !== undefined && cp.pos_y !== null) ? cp.pos_y : (this._s.floorY ?? 0);
            mesh.position.set(cp.pos_x, surfaceY - scaledBox.min.y, cp.pos_z);
            mesh.rotation.y = cp.rot_y ?? 0;
            this._s.threeScene.add(mesh);
            this._eggObjects.push(mesh);

            // ── Setup AnimationMixer ──
            if (gltf.animations?.length) {
              const mixer  = new THREE.AnimationMixer(mesh);
              const action = mixer.clipAction(gltf.animations[0]);
              action.setLoop(THREE.LoopOnce, 1);
              action.clampWhenFinished = true; // giữ nguyên frame cuối khi xong
              action.timeScale = 1;

              if (this._completed.has(m.mission_index)) {
                // Đã hoàn thành: nhảy thẳng tới frame cuối (mở)
                action.play();
                action.time = gltf.animations[0].duration;
                mixer.update(0);
              } else {
                // Chưa hoàn thành: giữ frame 0 (đóng), không play
                action.play();
                action.time = 0;
                mixer.update(0);
                action.paused = true;
              }

              this._chestMixers.set(m.mission_index, { mixer, action, mesh, duration: gltf.animations[0].duration });
            }

            resolve();
          }, null, () => resolve());
        });
        if (!this._completed.has(m.mission_index)) {
          const sphere = new THREE.Mesh(
            new THREE.SphereGeometry(0.7, 10, 10),
            new THREE.MeshBasicMaterial({ visible: false })
          );
          sphere.position.set(cp.pos_x, (cp.pos_y ?? this._s.floorY ?? 0), cp.pos_z);
          this._s.threeScene.add(sphere);
          this._eggSpheres.push({ sphere, missionIndex: m.mission_index, eggIndex: -1, isChestRiddle: true, mission: m });
        }
        continue;
      }

      if (m.mission_type !== 'hidden_object') continue;
      const eggs = m.easter_eggs || [];

      for (let eggIdx = 0; eggIdx < eggs.length; eggIdx++) {
        const egg = eggs[eggIdx];
        if (egg.pos_x === null || egg.pos_x === undefined) continue;

        const pos = new THREE.Vector3(egg.pos_x, egg.pos_y ?? 0, egg.pos_z);
        const sc  = egg.scale ?? 0.5;

        // Render actual object
        await this._loadEggObject(egg, pos, sc, m.mission_index, eggIdx);

        // Invisible detection sphere around the egg
        if (!this._completed.has(m.mission_index)) {
          const detSphere = new THREE.Mesh(
            new THREE.SphereGeometry(Math.max(0.4, sc * 0.8), 10, 10),
            new THREE.MeshBasicMaterial({ visible: false })
          );
          detSphere.position.copy(pos);
          this._s.threeScene.add(detSphere);
          this._eggSpheres.push({ sphere: detSphere, missionIndex: m.mission_index, eggIndex: eggIdx });
        }
      }
    }
  }

  _loadEggObject(egg, pos, sc, missionIndex, eggIndex) {
    return new Promise(resolve => {
      const onObject = obj => {
        obj.position.copy(pos);
        obj.rotation.y = egg.rot_y ?? 0;
        obj.scale.setScalar(sc);
        this._s.threeScene.add(obj);
        this._eggObjects.push(obj);
        resolve();
      };

      if (egg.ftype === 'model3d' && egg.url) {
        this._gltfLoader.load(egg.url, gltf => onObject(gltf.scene), null, () => resolve());
      } else if (egg.url) {
        new THREE.TextureLoader().load(egg.url, tex => {
          const aspect = tex.image ? tex.image.width / tex.image.height : 1;
          const geo  = new THREE.PlaneGeometry(aspect, 1);
          const mat  = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true });
          onObject(new THREE.Mesh(geo, mat));
        }, null, () => resolve());
      } else {
        resolve();
      }
    });
  }

  // ─── Hide artworks in uncompleted story missions ──────────────────────────────
  _applyStoryArtworkOverlay() {
    const storyMissions = this._missions.filter(m =>
      m.mission_type === 'story_sequence' && !this._completed.has(m.mission_index)
    );
    const norm = u => (u || '').split('?')[0];
    const storyUrls = new Set();
    storyMissions.forEach(m => (m.story_artwork_urls || []).forEach(u => storyUrls.add(norm(u))));
    if (!storyUrls.size) return;

    // Build mystery "?" canvas texture (shared)
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a0f1e';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(104,229,227,0.5)';
    ctx.lineWidth = 6;
    ctx.strokeRect(12, 12, 232, 232);
    ctx.font = 'bold 140px serif';
    ctx.fillStyle = 'rgba(104,229,227,0.75)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 128, 132);
    ctx.font = '18px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('Nhiệm vụ bí ẩn', 128, 222);
    const mysteryTex = new THREE.CanvasTexture(canvas);

    this._s.artworks.forEach(art => {
      if (!storyUrls.has(norm(art.storageUrl))) return;
      art._storyMissionHidden = true;
      art.group.traverse(child => {
        if (child.isMesh && child.geometry.type === 'PlaneGeometry' && !child._savedForStory) {
          child._savedForStory    = true;
          child._storyOrigMat     = child.material;
          child.material = new THREE.MeshBasicMaterial({ map: mysteryTex, side: THREE.DoubleSide });
        }
      });
    });
  }

  _restoreStoryArtworks(mission) {
    const norm = u => (u || '').split('?')[0];
    const urls = new Set((mission.story_artwork_urls || []).map(norm));
    this._s.artworks.forEach(art => {
      if (!urls.has(norm(art.storageUrl)) || !art._storyMissionHidden) return;
      art._storyMissionHidden = false;
      art.group.traverse(child => {
        if (child._savedForStory && child._storyOrigMat) {
          child.material       = child._storyOrigMat;
          child._storyOrigMat  = null;
          child._savedForStory = false;
        }
      });
    });
  }

  // ─── Egg found ────────────────────────────────────────────────────────────────
  _onEggFound(missionIndex, eggIndex) {
    if (!this._foundEggs.has(missionIndex)) this._foundEggs.set(missionIndex, new Set());
    const found = this._foundEggs.get(missionIndex);
    if (found.has(eggIndex)) return;
    found.add(eggIndex);

    const mission   = this._missions.find(m => m.mission_index === missionIndex);
    const totalEggs = (mission?.easter_eggs || []).filter(e => e.pos_x !== null && e.pos_x !== undefined).length;

    this._s._toast?.(`🥚 Tìm thấy Easter Egg! (${found.size}/${totalEggs})`, 'success', 2500);

    if (found.size >= totalEggs) {
      this._completeMission(missionIndex);
    } else {
      this._buildHUD();
    }
  }

  // ─── HUD ─────────────────────────────────────────────────────────────────────
  _buildHUD() {
    this._hudEl?.remove();

    const hud = document.createElement('div');
    hud.id = 'mission-hud';
    hud.style.cssText = [
      'position:fixed;top:70px;left:16px;',
      'background: linear-gradient(135deg, rgba(118, 170, 171, 1), rgba(35, 92, 208, 0.5));',
      'border:.5px solid rgba(255,255,255,0.2);border-radius:12px;',
      'padding:10px 14px;display:flex;flex-direction:column;gap:0;',
      'z-index:200;min-width:220px;max-width:270px;',
      'backdrop-filter:blur(8px);font-family:"Montserrat",sans-serif;',
      'color:#FFFFFF;'
    ].join('');

    // ── Title row (clickable to collapse) ──
    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;padding-bottom:' + (this._hudCollapsed ? '0' : '8px') + ';';

    const titleLeft = document.createElement('div');
    titleLeft.style.cssText = 'color:#FFFFFF;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;display:flex;align-items:center;gap:6px;';

    const remaining = this._missions.length - this._completed.size;
    const badgeHtml = remaining > 0
      ? `<span id="ms-hud-badge" style="background:linear-gradient(135deg,#f87171,#ef4444);color:#fff;font-size:9px;font-weight:800;border-radius:10px;padding:1px 6px;box-shadow:0 0 6px rgba(248,113,113,0.6);animation:ms-badge-pulse 1.8s ease-in-out infinite;flex-shrink:0;">${remaining}</span>`
      : '';
    titleLeft.innerHTML = `<span>🎯</span><span>Nhiệm vụ phòng tranh</span>${badgeHtml}`;

    const toggleBtn = document.createElement('span');
    toggleBtn.style.cssText = 'color:rgba(104,229,227,0.55);font-size:12px;line-height:1;flex-shrink:0;transition:transform .2s;';
    toggleBtn.textContent = this._hudCollapsed ? '▼' : '▲';

    titleRow.append(titleLeft, toggleBtn);
    hud.appendChild(titleRow);

    // ── Collapsible content wrapper ──
    const content = document.createElement('div');
    content.style.cssText = 'display:flex;flex-direction:column;gap:8px;overflow:hidden;' + (this._hudCollapsed ? 'display:none;' : '');

    const TYPE_ICON  = { hidden_object: '🥚', chest_riddle: '🗝', story_sequence: '📖' };
    const TYPE_LABEL = { hidden_object: 'Tìm Easter Egg', chest_riddle: 'Giải mã rương câu đố', story_sequence: 'Xếp tranh' };

    this._missions.forEach(m => {
      const isDone = this._completed.has(m.mission_index);
      const row = document.createElement('div');
      row.dataset.missionHudRow = m.mission_index;
      row.style.cssText = `display:flex;align-items:flex-start;gap:8px;padding:7px 9px;border-radius:7px;transition:background .15s;${isDone ? 'background:rgba(255,255,255,0.15);' : 'background:rgba(255,255,255,0.08);cursor:pointer;'}`;
      const icon  = TYPE_ICON[m.mission_type]  || '•';
      const label = m.title || TYPE_LABEL[m.mission_type] || 'Nhiệm vụ';

      let subText = isDone ? 'Hoàn thành ✓' : this._missionHint(m);
      if (m.mission_type === 'hidden_object' && !isDone) {
        const found = this._foundEggs.get(m.mission_index)?.size || 0;
        const total = (m.easter_eggs || []).filter(e => e.pos_x !== null && e.pos_x !== undefined).length;
        if (total > 0) subText = `Tìm thấy ${found}/${total} easter egg`;
      }

      row.innerHTML = `
        <span style="font-size:13px;flex-shrink:0;">${isDone ? '✅' : '⬜'}</span>
        <div style="flex:1;">
          <div style="color:${isDone ? '#68e5e3' : '#fff'};font-size:10px;font-weight:600;line-height:1.4;">${icon} ${label}</div>
          <div style="color:${isDone ? 'rgba(104,229,227,0.5)' : 'rgba(255,255,255,0.38)'};font-size:9px;line-height:1.5;">${subText}</div>
        </div>
      `;

      if (!isDone) {
        row.addEventListener('mouseenter', () => row.style.background = 'rgba(255,255,255,0.07)');
        row.addEventListener('mouseleave', () => row.style.background = 'rgba(255,255,255,0.04)');
        if (m.mission_type === 'story_sequence') row.addEventListener('click', () => this._openStoryUI(m));
      }
      content.appendChild(row);
    });

    // ── Progress bar ──
    const done  = this._completed.size;
    const total = this._missions.length;
    const prog  = document.createElement('div');
    prog.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-top:2px;';
    prog.innerHTML = `
      <div style="display:flex;justify-content:space-between;color:rgb(255, 255, 255);font-size:9px;">
        <span>Tiến độ</span><span>${done}/${total}</span>
      </div>
      <div style="height:4px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden;">
        <div style="height:100%;width:${total ? Math.round(done / total * 100) : 0}%;background:linear-gradient(90deg,rgba(118,170,171,1),rgba(35,92,208,0.8));border-radius:4px;transition:width .4s;"></div>
      </div>
    `;
    content.appendChild(prog);

    hud.appendChild(content);

    // ── Inject badge CSS (chỉ 1 lần) ──
    if (!document.getElementById('ms-hud-style')) {
      const style = document.createElement('style');
      style.id = 'ms-hud-style';
     style.textContent = `
      @keyframes ms-badge-pulse {
        0%, 100% { transform: scale(1);    box-shadow: 0 0 6px rgba(248,113,113,0.6); }
        50%       { transform: scale(1.15); box-shadow: 0 0 10px rgba(248,113,113,0.9); }
      }
      @keyframes ms-popup-in {
        0%   { transform: scale(0.6); opacity: 0; }
        65%  { transform: scale(1.06); opacity: 1; }
        82%  { transform: scale(0.97); }
        100% { transform: scale(1); }
      }
      @keyframes ms-popup-out {
        0%   { transform: scale(1); opacity: 1; }
        30%  { transform: scale(1.04); }
        100% { transform: scale(0.6); opacity: 0; }
      }
    `;
      document.head.appendChild(style);
    }

    // ── Toggle collapse on title click ──
    titleRow.addEventListener('click', () => {
      this._hudCollapsed = !this._hudCollapsed;
      const badge = hud.querySelector('#ms-hud-badge');
      if (this._hudCollapsed) {
        content.style.display = 'none';
        titleRow.style.paddingBottom = '0';
        toggleBtn.textContent = '▼';
        if (badge) badge.style.display = 'inline';
      } else {
        content.style.display = 'flex';
        titleRow.style.paddingBottom = '8px';
        toggleBtn.textContent = '▲';
        if (badge) badge.style.display = 'none';
      }
    });

    // Nếu panel đang mở thì ẩn badge ngay
    if (!this._hudCollapsed) {
      const badge = hud.querySelector('#ms-hud-badge');
      if (badge) badge.style.display = 'none';
    }

    document.body.appendChild(hud);
    this._hudEl = hud;
  }

  _missionHint(m) {
    if (m.mission_type === 'hidden_object') {
      const total = (m.easter_eggs || []).filter(e => e.pos_x !== null).length;
      return `Tìm ${total} easter egg ẩn trong phòng`;
    }
    if (m.mission_type === 'chest_riddle')   return 'Tìm rương bí ẩn trong phòng và giải đố';
    if (m.mission_type === 'story_sequence') return 'Click để sắp xếp thứ tự các bức tranh';
    return '';
  }

  // ─── Chest: play open animation rồi mới hiện popup câu đố ──────────────────
  _playChestOpenThenRiddle(mission) {
    const chestData = this._chestMixers.get(mission.mission_index);
    if (!chestData) {
      // Không có animation → mở popup luôn
      this._openChestRiddlePopup(mission);
      return;
    }
    const { mixer, action, duration } = chestData;
    // Nếu đang paused (chưa play lần nào) thì unpause và chạy từ đầu
    action.paused = false;
    action.time   = 0;
    mixer.update(0);

    // Sau khi animation xong (duration giây) thì hiện popup
    const timeoutMs = Math.round(duration * 1000);
    setTimeout(() => this._openChestRiddlePopup(mission), timeoutMs);
  }

  // ─── Sound effects ────────────────────────────────────────────────────────────
  _sfx(name) {
    const map = {
      popup_open  : '/sounds/popup_open.mp3',
      choice_hover: '/sounds/choice_hover.mp3',
      close       : '/sounds/close.mp3',
      correct     : '/sounds/correct.mp3',
      wrong       : '/sounds/wrong.mp3',
      chest_open  : '/sounds/chest_open.mp3',
    };
    const src = map[name];
    if (!src) return;

    // Debounce choice_hover để tránh spam Audio objects khi di chuột nhanh
    if (name === 'choice_hover') {
      if (this._sfxHoverTs && Date.now() - this._sfxHoverTs < 120) return;
      this._sfxHoverTs = Date.now();
    }

    // Cache và reuse Audio object theo từng tên
    if (!this._sfxCache) this._sfxCache = {};
    if (!this._sfxCache[name]) {
      this._sfxCache[name] = new Audio(src);
      this._sfxCache[name].volume = 0.5;
    }
    const audio = this._sfxCache[name];
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  // ─── Chest riddle popup ───────────────────────────────────────────────────────
  _openChestRiddlePopup(mission) {
    document.getElementById('ms-chest-riddle-popup')?.remove();
    this._riddlePopupOpen  = true;
    this._riddleSelectedIdx = null;
    this._sfx('popup_open');

    let qd = {};
    try { qd = JSON.parse(mission.riddle_text || '{}'); } catch { qd = {}; }
    const questionText  = qd.q || mission.riddle_text || '(Không có nội dung câu đố)';
    const hintText      = qd.hint || '';
    const correctKey    = (mission.riddle_answer || 'a').toLowerCase().trim();

    const overlay = document.createElement('div');
    overlay.id = 'ms-chest-riddle-popup';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:1000;display:flex;align-items:center;justify-content:center;';

    const box = document.createElement('div');
    box.style.cssText = 'background:linear-gradient(135deg,rgba(118,170,171,1),rgba(35,92,208,0.5));border:.5px solid rgba(200,169,110,0.4);border-radius:16px;padding:28px;max-width:420px;width:90%;display:flex;flex-direction:column;gap:14px;font-family:"Montserrat",sans-serif;color:#FFFFFF;animation:ms-popup-in 0.4s cubic-bezier(.36,.07,.19,.97);';
    const titleDiv = document.createElement('div');
    titleDiv.style.cssText = 'color:#FFE066;font-size:14px;font-weight:700;letter-spacing:.05em;';
    titleDiv.textContent = `🗝 ${mission.title || 'Giải mã rương câu đố'}`;
    box.appendChild(titleDiv);

    const subtitleDiv = document.createElement('div');
    subtitleDiv.style.cssText = 'color:rgba(255,255,255,0.5);font-size:10px;';
    subtitleDiv.textContent = 'Chọn đáp án đúng để mở rương và hoàn thành nhiệm vụ.';
    box.appendChild(subtitleDiv);

    const questionDiv = document.createElement('div');
    questionDiv.style.cssText = 'color:#fff;font-size:13px;line-height:1.7;background:rgba(200,169,110,0.05);padding:14px;border-radius:10px;border:.5px solid rgba(200,169,110,0.15);';
    questionDiv.textContent = questionText;
    box.appendChild(questionDiv);

    if (hintText) {
      const hintDiv = document.createElement('div');
      hintDiv.style.cssText = 'color:rgba(255,200,100,0.75);font-size:11px;';
      hintDiv.textContent = `💡 Gợi ý: ${hintText}`;
      box.appendChild(hintDiv);
    }

    const choicesDiv = document.createElement('div');
    choicesDiv.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
    const feedback = document.createElement('div');
    feedback.style.cssText = 'font-size:11px;text-align:center;min-height:18px;';
    let answered = false;

    ['a', 'b', 'c', 'd'].forEach((key, i) => {
      const choiceText = qd[key] || '';
      if (!choiceText) return;
      const btn = document.createElement('button');
      btn.className = 'riddle-choice-btn';
      btn.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(255,255,255,0.05);border:.5px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;font-family:"Montserrat",sans-serif;font-size:13px;cursor:pointer;text-align:left;transition:background .15s;width:100%;';      const labelSpan = document.createElement('span');
      labelSpan.style.cssText = 'color:#FFE066;font-weight:700;flex-shrink:0;';
      labelSpan.textContent = 'ABCD'[i] + '.';
      const textSpan = document.createElement('span');
      textSpan.textContent = choiceText;
      btn.append(labelSpan, textSpan);
      btn.addEventListener('mouseenter', () => { if (!answered) { btn.style.background = 'rgba(200,169,110,0.1)'; this._sfx('choice_hover'); } });
      btn.addEventListener('mouseleave', () => { if (!answered) btn.style.background = 'rgba(255,255,255,0.05)'; });
      btn.addEventListener('click', () => {
        if (answered) return;
        if (key === correctKey) {
          answered = true;
          this._sfx('correct');
          btn.style.cssText += 'background:rgba(50,200,100,0.15);border-color:rgba(50,200,100,0.5);';
          feedback.style.color = '#FFE066';
          feedback.textContent = '✓ Chính xác! Rương đã mở!';
          const chestData = this._chestMixers.get(mission.mission_index);
          if (chestData) {
            chestData.action.paused = false;
            chestData.action.time   = 0;
            chestData.mixer.update(0);
            this._sfx('chest_open');
          }
          setTimeout(() => { this._riddlePopupOpen = false; closeWithAnim(); this._completeMission(mission.mission_index); }, 1000);
        } else {
          this._sfx('wrong');
          btn.style.background = 'rgba(255,80,80,0.1)';
          btn.style.borderColor = 'rgba(255,80,80,0.3)';
          setTimeout(() => { btn.style.background = 'rgba(255,255,255,0.05)'; btn.style.borderColor = 'rgba(255,255,255,0.15)'; }, 600);
          feedback.style.color = '#f87171';
          feedback.textContent = '✗ Chưa đúng, thử lại nhé!';
        }
      });
      choicesDiv.appendChild(btn);
    });

    box.appendChild(choicesDiv);
    box.appendChild(feedback);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕ Đóng';
    closeBtn.className = 'riddle-close-btn';
    closeBtn.style.cssText = 'align-self:center;padding:6px 18px;background:transparent;border:.5px solid rgba(255,255,255,0.2);border-radius:8px;color:rgba(255,255,255,0.45);font-family:"Montserrat",sans-serif;font-size:11px;cursor:pointer;transition:background .15s,border-color .15s,color .15s;';
    closeBtn.addEventListener('click', () => { this._sfx('close'); this._riddlePopupOpen = false; closeWithAnim(); });
    box.appendChild(closeBtn);

    const closeWithAnim = () => {
      box.style.animation = 'ms-popup-out 0.25s ease forwards';
      setTimeout(() => overlay.remove(), 230);
    };
    overlay.addEventListener('click', e => { if (e.target === overlay) { this._riddlePopupOpen = false; closeWithAnim(); } });
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  

  // ─── Complete a mission ───────────────────────────────────────────────────────
  async _completeMission(missionIndex) {
    if (this._completed.has(missionIndex)) return;
    this._completed.add(missionIndex);

    const userId = this._s.manager.auth.profile?.id;
    if (userId) {
      await supabase.from('mission_completions').upsert(
        { user_id: userId, room_id: this._roomId, mission_index: missionIndex },
        { onConflict: 'user_id,room_id,mission_index' }
      );
    }

    this._buildHUD();
    this._s._toast?.(`Nhiệm vụ ${missionIndex + 1} hoàn thành! 🎉`, 'success', 3000);

    // Restore artwork visibility if this was a story mission
    const completedMission = this._missions.find(m => m.mission_index === missionIndex);
    if (completedMission?.mission_type === 'story_sequence') {
      this._restoreStoryArtworks(completedMission);
    }

    if (this._completed.size >= this._missions.length && !this._allDone) {
      this._allDone = true;
      setTimeout(() => this._onAllComplete(), 700);
    }
  }

  // ─── All missions complete ────────────────────────────────────────────────────
  async _onAllComplete() {
    const userId      = this._s.manager.auth.profile?.id;
    const tokenReward = this._config?.token_reward ?? 100;
    let isFirstTime   = true;

    if (userId) {
      const { data: existing } = await supabase
        .from('room_completions').select('id')
        .eq('user_id', userId).eq('room_id', this._roomId).maybeSingle();
      isFirstTime = !existing;

      if (isFirstTime) {
        await supabase.from('room_completions').insert({
          user_id: userId, room_id: this._roomId, tokens_awarded: tokenReward,
        });
        const { data: pf } = await supabase
          .from('profiles').select('token_balance').eq('id', userId).maybeSingle();
        const newBalance = (pf?.token_balance || 0) + tokenReward;
        await supabase.from('profiles').update({ token_balance: newBalance }).eq('id', userId);
        await supabase.from('user_tokens').upsert(
          { user_id: userId, balance: newBalance },
          { onConflict: 'user_id' }
        );
        if (this._s.manager.auth.profile) {
          this._s.manager.auth.profile.token_balance = newBalance;
          this._s._updateTokenDisplay?.();
        }
      }
    }

    this._showCompletionModal(isFirstTime, tokenReward);
  }

  // ─── Completion modal ─────────────────────────────────────────────────────────
  _showCompletionModal(isFirstTime, tokenReward) {
    document.getElementById('ms-complete-modal')?.remove();

    // ─── Sound effect & confetti khi hiện popup chúc mừng ────────────────────
    try {
      const audio = new Audio('/sounds/mission-complete.mp3');
      audio.volume = 0.8;
      audio.play().catch(() => {});
    } catch (_) {}
    this._startConfetti();

    const overlay = document.createElement('div');
    overlay.id = 'ms-complete-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:2000;display:flex;align-items:center;justify-content:center;';

    const box = document.createElement('div');
    box.style.cssText = 'background:linear-gradient(135deg,#0d1520,#101e2e);border:1px solid rgba(104,229,227,0.4);border-radius:20px;padding:36px 32px;max-width:400px;width:88%;display:flex;flex-direction:column;align-items:center;gap:16px;font-family:"Montserrat",sans-serif;text-align:center;';

    const msg         = this._config?.completion_message || 'Chúc mừng bạn đã hoàn thành tất cả nhiệm vụ!';
    const tokenBlock  = isFirstTime
      ? `<div style="display:flex;align-items:center;gap:10px;background:rgba(200,169,110,0.12);border:.5px solid rgba(200,169,110,0.4);border-radius:12px;padding:12px 20px;">
           <img src="/token/star.png" style="width:28px;height:28px;object-fit:contain;" onerror="this.style.display='none'">
           <div>
             <div style="color:#c8a96e;font-size:16px;font-weight:800;">+${tokenReward} Token</div>
             <div style="color:rgba(200,169,110,0.6);font-size:10px;">Đã thêm vào tài khoản</div>
           </div>
         </div>`
      : `<div style="color:rgba(255,255,255,0.35);font-size:11px;">Bạn đã hoàn thành phòng tranh này trước đó.</div>`;

    box.innerHTML = `
      <div style="font-size:56px;line-height:1;">🏆</div>
      <div style="color:#68e5e3;font-size:18px;font-weight:800;letter-spacing:.05em;">HOÀN THÀNH!</div>
      <div style="color:rgba(255,255,255,0.8);font-size:13px;line-height:1.7;">${msg}</div>
      ${tokenBlock}
      <div style="color:rgba(255,255,255,0.4);font-size:10px;line-height:1.6;">Huy hiệu hoàn thành đã được lưu vào hồ sơ của bạn.</div>
    `;

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;justify-content:center;';

    const replayBtn = document.createElement('button');
    replayBtn.textContent = '🔄 Chơi lại';
    replayBtn.style.cssText = 'padding:12px 28px;background:rgba(200,169,110,0.12);border:1px solid rgba(200,169,110,0.45);border-radius:10px;color:#c8a96e;font-family:"Montserrat",sans-serif;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:.05em;transition:background .2s;';
    replayBtn.addEventListener('mouseenter', () => replayBtn.style.background = 'rgba(200,169,110,0.25)');
    replayBtn.addEventListener('mouseleave', () => replayBtn.style.background = 'rgba(200,169,110,0.12)');
    replayBtn.addEventListener('click', async () => {
      replayBtn.disabled = true;
      replayBtn.textContent = 'Đang reset...';
      this._stopConfetti();
      await this._resetMissions();
      overlay.remove();
    });

    btnRow.append(replayBtn);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  // ─── Reset tất cả nhiệm vụ để chơi lại ───────────────────────────────────────
  async _resetMissions() {
    const userId = this._s.manager.auth.profile?.id;
    if (userId) {
      await supabase.from('mission_completions').delete().eq('room_id', this._roomId).eq('user_id', userId);
      await supabase.from('room_completions').delete().eq('room_id', this._roomId).eq('user_id', userId);
    }
    this._completed.clear();
    this._foundEggs.clear();
    this._allDone = false;
    // Reset tất cả rương về trạng thái đóng (frame 0)
    this._chestMixers.forEach(({ mixer, action }) => {
      action.paused = false;
      action.time   = 0;
      mixer.update(0);
      action.paused = true;
    });
    this._missions.forEach(m => {
      if (m.mission_type === 'story_sequence') this._applyStoryArtworkOverlay();
    });
    this._buildHUD();
    this._s._toast?.('Nhiệm vụ đã được reset! Hãy khám phá lại từ đầu 🎯', 'success', 3000);
  }

  // ─── Confetti ─────────────────────────────────────────────────────────────────
  _startConfetti() {
    document.getElementById('ms-confetti-canvas')?.remove();
    const canvas = document.createElement('canvas');
    canvas.id = 'ms-confetti-canvas';
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2001;';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    const COLORS = ['#68e5e3','#c8a96e','#f87171','#a78bfa','#34d399','#fbbf24','#f472b6','#60a5fa'];
    const pieces = Array.from({ length: 120 }, () => ({
      x:          Math.random() * canvas.width,
      y:          Math.random() * -canvas.height,
      w:          6 + Math.random() * 8,
      h:          10 + Math.random() * 6,
      color:      COLORS[Math.floor(Math.random() * COLORS.length)],
      rot:        Math.random() * Math.PI * 2,
      vx:         (Math.random() - 0.5) * 2,
      vy:         5 + Math.random() * 5,
      vr:         (Math.random() - 0.5) * 0.15,
      swing:      Math.random() * Math.PI * 2,
      swingSpeed: 0.03 + Math.random() * 0.03,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(p => {
        p.swing += p.swingSpeed;
        p.x += p.vx + Math.sin(p.swing) * 0.8;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y > canvas.height + 20) {
          p.y = -20;
          p.x = Math.random() * canvas.width;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      this._confettiRaf = requestAnimationFrame(draw);
    };
    draw();
    this._confettiResize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    window.addEventListener('resize', this._confettiResize);
  }

  _stopConfetti() {
    cancelAnimationFrame(this._confettiRaf);
    document.getElementById('ms-confetti-canvas')?.remove();
    if (this._confettiResize) window.removeEventListener('resize', this._confettiResize);
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────────
  dispose() {
    this._stopConfetti();
    this._sfxCache = {};
    this._hudEl?.remove();
    document.getElementById('ms-chest-riddle-popup')?.remove();
    document.getElementById('ms-story-popup')?.remove();
    document.getElementById('ms-complete-modal')?.remove();
    this._eggSpheres.forEach(d => this._s.threeScene.remove(d.sphere));
    this._eggObjects.forEach(obj => this._s.threeScene.remove(obj));
    this._chestMixers.forEach(({ mixer }) => mixer.stopAllAction());
    this._eggSpheres  = [];
    this._eggObjects  = [];
    this._chestMixers = new Map();
  }
}