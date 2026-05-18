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
    this._hudCollapsed = false;
    this._roomId       = null;
    this._gltfLoader   = new GLTFLoader();
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
  update() {
    // Reserved for future per-frame animations (particle effects, glow, etc.)
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
            mesh.position.set(cp.pos_x, cp.pos_y ?? 0, cp.pos_z);
            mesh.rotation.y = cp.rot_y ?? 0;
            this._s.threeScene.add(mesh);
            this._eggObjects.push(mesh);
            resolve();
          }, null, () => resolve());
        });
        if (!this._completed.has(m.mission_index)) {
          const sphere = new THREE.Mesh(
            new THREE.SphereGeometry(0.7, 10, 10),
            new THREE.MeshBasicMaterial({ visible: false })
          );
          sphere.position.set(cp.pos_x, cp.pos_y ?? 0, cp.pos_z);
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
      'background:rgba(10,12,20,0.88);',
      'border:.5px solid rgba(104,229,227,0.3);border-radius:12px;',
      'padding:10px 14px;display:flex;flex-direction:column;gap:0;',
      'z-index:200;min-width:220px;max-width:270px;',
      'backdrop-filter:blur(8px);font-family:"Montserrat",sans-serif;',
    ].join('');

    // ── Title row (clickable to collapse) ──
    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;padding-bottom:' + (this._hudCollapsed ? '0' : '8px') + ';';

    const titleLeft = document.createElement('div');
    titleLeft.style.cssText = 'color:#68e5e3;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;display:flex;align-items:center;gap:6px;';
    titleLeft.innerHTML = '<span>🎯</span><span>Nhiệm vụ phòng tranh</span>';

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
      row.style.cssText = `display:flex;align-items:flex-start;gap:8px;padding:7px 9px;border-radius:7px;transition:background .15s;${isDone ? 'background:rgba(104,229,227,0.08);' : 'background:rgba(255,255,255,0.04);cursor:pointer;'}`;

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
      <div style="display:flex;justify-content:space-between;color:rgba(255,255,255,0.45);font-size:9px;">
        <span>Tiến độ</span><span>${done}/${total}</span>
      </div>
      <div style="height:4px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden;">
        <div style="height:100%;width:${total ? Math.round(done / total * 100) : 0}%;background:linear-gradient(90deg,#68e5e3,#a0f0ef);border-radius:4px;transition:width .4s;"></div>
      </div>
    `;
    content.appendChild(prog);

    hud.appendChild(content);

    // ── Toggle collapse on title click ──
    titleRow.addEventListener('click', () => {
      this._hudCollapsed = !this._hudCollapsed;
      if (this._hudCollapsed) {
        content.style.display = 'none';
        titleRow.style.paddingBottom = '0';
        toggleBtn.textContent = '▼';
      } else {
        content.style.display = 'flex';
        titleRow.style.paddingBottom = '8px';
        toggleBtn.textContent = '▲';
      }
    });

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

  // ─── Chest riddle popup ───────────────────────────────────────────────────────
  _openChestRiddlePopup(mission) {
    document.getElementById('ms-chest-riddle-popup')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'ms-chest-riddle-popup';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:1000;display:flex;align-items:center;justify-content:center;';

    const box = document.createElement('div');
    box.style.cssText = 'background:#0d1520;border:.5px solid rgba(200,169,110,0.4);border-radius:16px;padding:28px;max-width:420px;width:90%;display:flex;flex-direction:column;gap:14px;font-family:"Montserrat",sans-serif;';

    box.innerHTML = `
      <div style="color:#c8a96e;font-size:14px;font-weight:700;letter-spacing:.05em;">🗝 ${mission.title || 'Giải mã rương câu đố'}</div>
      <div style="color:rgba(255,255,255,0.5);font-size:10px;">Trả lời đúng để mở rương và hoàn thành nhiệm vụ.</div>
      <div style="color:#fff;font-size:13px;line-height:1.7;background:rgba(200,169,110,0.05);padding:14px;border-radius:10px;border:.5px solid rgba(200,169,110,0.15);">${mission.riddle_text || '(Không có nội dung câu đố)'}</div>
    `;

    const ansRow = document.createElement('div');
    ansRow.style.cssText = 'display:flex;gap:8px;';
    const ansIn = document.createElement('input');
    ansIn.type = 'text'; ansIn.placeholder = 'Nhập đáp án...';
    ansIn.style.cssText = 'flex:1;padding:9px 12px;background:rgba(255,255,255,0.07);border:.5px solid rgba(255,255,255,0.2);border-radius:8px;color:#fff;font-family:"Montserrat",sans-serif;font-size:12px;outline:none;';
    const checkBtn = document.createElement('button');
    checkBtn.textContent = 'Mở rương ✦';
    checkBtn.style.cssText = 'padding:9px 16px;background:rgba(200,169,110,0.15);border:.5px solid rgba(200,169,110,0.5);border-radius:8px;color:#c8a96e;font-family:"Montserrat",sans-serif;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;';
    ansRow.append(ansIn, checkBtn);
    box.appendChild(ansRow);

    const feedback = document.createElement('div');
    feedback.style.cssText = 'font-size:11px;text-align:center;min-height:18px;';
    box.appendChild(feedback);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕ Đóng';
    closeBtn.style.cssText = 'align-self:center;padding:6px 18px;background:transparent;border:.5px solid rgba(255,255,255,0.2);border-radius:8px;color:rgba(255,255,255,0.45);font-family:"Montserrat",sans-serif;font-size:11px;cursor:pointer;';
    closeBtn.addEventListener('click', () => overlay.remove());
    box.appendChild(closeBtn);

    const tryCheck = () => {
      const val     = ansIn.value.toLowerCase().trim();
      const correct = (mission.riddle_answer || '').toLowerCase().trim();
      if (!val) return;
      if (val === correct) {
        feedback.style.color = '#c8a96e';
        feedback.textContent = '✓ Chính xác! Rương đã mở!';
        checkBtn.disabled = true; ansIn.disabled = true;
        setTimeout(() => { overlay.remove(); this._completeMission(mission.mission_index); }, 800);
      } else {
        feedback.style.color = '#f87171';
        feedback.textContent = '✗ Chưa đúng, thử lại nhé!';
        ansIn.select();
      }
    };
    checkBtn.addEventListener('click', tryCheck);
    ansIn.addEventListener('keydown', e => { if (e.key === 'Enter') tryCheck(); });
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    setTimeout(() => ansIn.focus(), 80);
  }

  // ─── Story sequence popup ─────────────────────────────────────────────────────
  _openStoryUI(mission) {
    document.getElementById('ms-story-popup')?.remove();

    const urls = mission.story_artwork_urls || [];
    // Normalize URLs (strip query params) for robust matching
    const norm = u => (u || '').split('?')[0];
    const artworks = urls.map(u => this._s.artworks.find(a => norm(a.storageUrl) === norm(u))).filter(Boolean);
    if (!artworks.length) {
      this._s._toast?.('Nhiệm vụ này chưa có tranh được cấu hình.', 'info', 2500);
      return;
    }

    // Shuffle for visitor
    const shuffled = [...artworks].sort(() => Math.random() - 0.5);

    const overlay = document.createElement('div');
    overlay.id = 'ms-story-popup';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:1000;display:flex;align-items:center;justify-content:center;';

    const box = document.createElement('div');
    box.style.cssText = 'background:#0d1520;border:.5px solid rgba(104,229,227,0.35);border-radius:16px;padding:24px;max-width:480px;width:92%;display:flex;flex-direction:column;gap:14px;font-family:"Montserrat",sans-serif;max-height:90vh;overflow-y:auto;';

    const hintHtml = mission.story_hint
      ? `<div style="color:rgba(255,200,100,0.75);font-size:10px;margin-top:4px;">💡 Gợi ý: ${mission.story_hint}</div>` : '';
    box.innerHTML = `
      <div style="color:#68e5e3;font-size:14px;font-weight:700;">📖 ${mission.title || 'Xếp mạch chuyện'}</div>
      <div style="color:rgba(255,255,255,0.5);font-size:10px;line-height:1.6;">
        Dùng nút ↑↓ để sắp xếp các bức tranh theo đúng thứ tự câu chuyện (từ trên xuống dưới).
      </div>
      ${hintHtml}
    `;

    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

    shuffled.forEach(art => {
      const name = art.meta?.title || art.storageUrl?.split('/').pop().replace(/^\d+_/, '') || 'Tranh';
      const item = document.createElement('div');
      item.dataset.url = art.storageUrl;
      item.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(255,255,255,0.05);border:.5px solid rgba(255,255,255,0.1);border-radius:8px;';
      item.innerHTML = `
        <div style="width:44px;height:44px;background:rgba(255,255,255,0.07);border-radius:5px;flex-shrink:0;overflow:hidden;">
          ${art.storageUrl ? `<img src="${art.storageUrl}" style="width:100%;height:100%;object-fit:cover;" loading="lazy">` : ''}
        </div>
        <div style="flex:1;overflow:hidden;">
          <div style="color:#fff;font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name.substring(0, 40)}</div>
          ${art.meta?.artist ? `<div style="color:rgba(255,255,255,0.4);font-size:9px;">${art.meta.artist.substring(0, 30)}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:3px;flex-shrink:0;">
          <button class="story-up"   style="padding:3px 8px;font-size:11px;background:rgba(255,255,255,0.08);border:.5px solid rgba(255,255,255,0.18);border-radius:4px;color:#fff;cursor:pointer;line-height:1;">↑</button>
          <button class="story-down" style="padding:3px 8px;font-size:11px;background:rgba(255,255,255,0.08);border:.5px solid rgba(255,255,255,0.18);border-radius:4px;color:#fff;cursor:pointer;line-height:1;">↓</button>
        </div>
      `;
      list.appendChild(item);
    });

    const moveItem = (el, dir) => {
      const items = [...list.querySelectorAll('[data-url]')];
      const i = items.indexOf(el);
      const target = items[i + dir];
      if (!target) return;
      if (dir === -1) list.insertBefore(el, target);
      else list.insertBefore(target, el);
    };

    list.addEventListener('click', e => {
      const btn  = e.target.closest('.story-up, .story-down');
      if (!btn) return;
      const item = btn.closest('[data-url]');
      moveItem(item, btn.classList.contains('story-up') ? -1 : 1);
    });

    box.appendChild(list);

    const feedback = document.createElement('div');
    feedback.style.cssText = 'font-size:11px;text-align:center;min-height:18px;';
    box.appendChild(feedback);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;';

    const submitBtn = document.createElement('button');
    submitBtn.textContent = '✓ Xác nhận thứ tự';
    submitBtn.style.cssText = 'flex:1;padding:10px;background:rgba(104,229,227,0.12);border:.5px solid rgba(104,229,227,0.45);border-radius:8px;color:#68e5e3;font-family:"Montserrat",sans-serif;font-size:12px;font-weight:700;cursor:pointer;';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'padding:10px 14px;background:transparent;border:.5px solid rgba(255,255,255,0.2);border-radius:8px;color:rgba(255,255,255,0.45);font-family:"Montserrat",sans-serif;font-size:12px;cursor:pointer;';
    closeBtn.addEventListener('click', () => overlay.remove());

    submitBtn.addEventListener('click', () => {
      const currentOrder = [...list.querySelectorAll('[data-url]')].map(el => el.dataset.url);
      const isCorrect    = urls.length === currentOrder.length && urls.every((u, i) => u === currentOrder[i]);
      if (isCorrect) {
        feedback.style.color = '#68e5e3';
        feedback.textContent = '✓ Chính xác! Bạn đã xếp đúng thứ tự.';
        submitBtn.disabled = true;
        setTimeout(() => { overlay.remove(); this._completeMission(mission.mission_index); }, 900);
      } else {
        feedback.style.color = '#f87171';
        feedback.textContent = '✗ Thứ tự chưa đúng, thử lại nhé!';
      }
    });

    btnRow.append(submitBtn, closeBtn);
    box.appendChild(btnRow);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
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
        const { data: tokenRow } = await supabase
          .from('user_tokens').select('balance').eq('user_id', userId).maybeSingle();
        const newBalance = (tokenRow?.balance || 0) + tokenReward;
        await supabase.from('user_tokens').upsert(
          { user_id: userId, balance: newBalance },
          { onConflict: 'user_id' }
        );
        if (this._s.manager.auth.profile) {
          this._s.manager.auth.profile.token_balance =
            (this._s.manager.auth.profile.token_balance || 0) + tokenReward;
          this._s._updateTokenDisplay?.();
        }
      }
    }

    this._showCompletionModal(isFirstTime, tokenReward);
  }

  // ─── Completion modal ─────────────────────────────────────────────────────────
  _showCompletionModal(isFirstTime, tokenReward) {
    document.getElementById('ms-complete-modal')?.remove();

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

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Tuyệt vời! 🎉';
    closeBtn.style.cssText = 'padding:12px 36px;background:rgba(104,229,227,0.15);border:1px solid rgba(104,229,227,0.5);border-radius:10px;color:#68e5e3;font-family:"Montserrat",sans-serif;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:.05em;transition:background .2s;';
    closeBtn.addEventListener('mouseenter', () => closeBtn.style.background = 'rgba(104,229,227,0.28)');
    closeBtn.addEventListener('mouseleave', () => closeBtn.style.background = 'rgba(104,229,227,0.15)');
    closeBtn.addEventListener('click', () => overlay.remove());
    box.appendChild(closeBtn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────────
  dispose() {
    this._hudEl?.remove();
    document.getElementById('ms-chest-riddle-popup')?.remove();
    document.getElementById('ms-story-popup')?.remove();
    document.getElementById('ms-complete-modal')?.remove();
    this._eggSpheres.forEach(d => this._s.threeScene.remove(d.sphere));
    this._eggObjects.forEach(obj => this._s.threeScene.remove(obj));
    this._eggSpheres = [];
    this._eggObjects = [];
  }
}
