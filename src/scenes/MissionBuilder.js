/**
 * MissionBuilder — studio-side mission configuration UI.
 * Chỉ hỗ trợ loại nhiệm vụ "chest_riddle" (rương câu đố).
 * Được khởi tạo bởi StudioScene, truy cập scene qua this._s.
 */
import * as THREE from 'three';
import { supabase } from '../utils/supabase.js';

export class MissionBuilder {
  constructor(scene) {
    this._s          = scene;
    this._eggObjs    = {};        // key: `${missionIdx}_0` → THREE.Object3D
    this._eggObjMeta = new Map(); // THREE.Object3D → { missionIdx, eggIdx }
    this._chestListEl = null;
    this._IS = '';
    this._TS = '';
  }

  // ─── Style constants ─────────────────────────────────────────────────────────
  _st() {
    const IS = 'width:100%;background:rgba(255, 255, 255, 0.08);border:.5px solid rgba(255,255,255,0.2);border-radius:6px;color:#fff;font-family:"Montserrat",sans-serif;font-size:14px;padding:7px 10px;outline:none;box-sizing:border-box;';
    return { IS, TS: IS + 'min-height:58px;resize:vertical;' };
  }

  // ─── Entry point ─────────────────────────────────────────────────────────────
  buildPane(pane) {
    const { IS, TS } = this._st();
    this._IS = IS;
    this._TS = TS;
    pane.style.cssText += 'padding:16px 14px 14px;gap:10px;';
  pane.style.fontFamily = "'Montserrat', sans-serif";
  pane.style.color = '#FFFFFF';

    if (!this._s._missionData) this._s._missionData = [];

    // Header
    const top = document.createElement('div');
    top.innerHTML = `
      <div class="rp-section-title">🗝 Rương câu đố</div>
      <div style="font-size:13px;color:rgba(255,255,255,1);line-height:1.6;margin-bottom:4px;">
        Đặt <b style="color:#c8a96e">ít nhất 1 rương</b> câu đố trong phòng. Khách phải giải hết tất cả rương để hoàn thành phòng tranh.
      </div>
    `;
    pane.appendChild(top);

    // Dynamic chest list
    this._chestListEl = document.createElement('div');
    this._chestListEl.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
    pane.appendChild(this._chestListEl);

    // Add chest button
    const addBtn = document.createElement('button');
    addBtn.style.cssText = 'width:100%;padding:8px;background:rgba(200, 168, 110, 0.27);border:.5px dashed rgba(200,169,110,0.4);border-radius:8px;color:rgb(255, 215, 83);font-family:"Montserrat",sans-serif;font-size:14px;font-weight:600;cursor:pointer;transition:background .2s;';
    addBtn.textContent = '+ Thêm rương câu đố';
    addBtn.addEventListener('mouseenter', () => addBtn.style.background = 'rgba(200,169,110,0.14)');
    addBtn.addEventListener('mouseleave', () => addBtn.style.background = 'rgba(200,169,110,0.07)');
    addBtn.addEventListener('click', () => {
      this._s._missionData.push({
        mission_type: 'chest_riddle',
        riddle_text: '',
        riddle_answer: '',
        easter_eggs: [{ pos_x: null, pos_y: null, pos_z: null, rot_y: 0, scale: 1.0 }],
      });
      this._refreshChestList();
      this.saveMissionsSilent();
    });
    pane.appendChild(addBtn);

    const sep = document.createElement('hr');
    sep.style.cssText = 'border:none;border-top:.5px solid rgba(255,255,255,0.1);margin:4px 0;';
    pane.appendChild(sep);

    // Completion message (required)
    const msgWrap = document.createElement('div');
    msgWrap.style.cssText = 'display:flex;flex-direction:column;gap:5px;';
    msgWrap.innerHTML = `
      <div class="rp-section-title" style="font-size:15px;">💌 Lời nhắn khi hoàn thành <span style="color:#f87171;font-size:13px;">*bắt buộc</span></div>
      <div style="font-size:13px;color:rgba(255,255,255,1);">Hiện ra cho khách khi giải xong tất cả rương câu đố</div>
      <textarea id="ms-completion-msg" style="${TS}" placeholder="Viết lời nhắn cho khách..."></textarea>
    `;
    pane.appendChild(msgWrap);

    // Save button
    const saveBtn = document.createElement('button');
    saveBtn.style.cssText = 'width:100%;padding:10px;background:rgba(104,229,227,0.12);border:.5px solid rgba(104,229,227,0.45);border-radius:8px;color:#68e5e3;font-family:"Montserrat",sans-serif;font-size:15px;font-weight:700;cursor:pointer;letter-spacing:.04em;transition:background .2s;';
    saveBtn.textContent = '💾 Lưu';
    saveBtn.addEventListener('mouseenter', () => saveBtn.style.background = 'rgba(104,229,227,0.22)');
    saveBtn.addEventListener('mouseleave', () => saveBtn.style.background = 'rgba(104,229,227,0.12)');
    saveBtn.addEventListener('click', () => this.save());
    pane.appendChild(saveBtn);

    this._refreshChestList();
    this._loadCompletionMsg();
  }

  // ─── Rebuild chest list UI ────────────────────────────────────────────────────
  _refreshChestList() {
    if (!this._chestListEl) return;
    this._chestListEl.innerHTML = '';
    const chests = this._s._missionData.filter(Boolean);
    if (!chests.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size:13px;color:rgba(255,255,255,1);text-align:center;padding:12px 0;border:.5px dashed rgba(255,255,255,0.1);border-radius:8px;';
      empty.textContent = 'Chưa có rương nào. Thêm ít nhất 1 rương câu đố.';
      this._chestListEl.appendChild(empty);
      return;
    }
    this._s._missionData.forEach((d, idx) => {
      if (!d) return;
      this._chestListEl.appendChild(this._buildChestRow(idx));
    });
  }

  // ─── One chest row ────────────────────────────────────────────────────────────
  _buildChestRow(idx) {
    const s    = this._s;
    const data = s._missionData[idx];
    const IS   = this._IS;
    const TS   = this._TS;

    const wrap = document.createElement('div');
    wrap.style.cssText = 'background:linear-gradient(135deg, rgba(18,47,106,1), rgba(118,170,171,1));border:.5px solid rgba(200,169,110,0.2);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;';

    // Header: number badge + title + delete
    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;align-items:center;gap:8px;';
    hdr.innerHTML = `
      <div style="width:22px;height:22px;background:rgba(200,169,110,0.15);border:.5px solid rgba(200,169,110,0.4);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#c8a96e;font-size:14px;font-weight:700;font-family:'Montserrat',sans-serif;flex-shrink:0;">${idx + 1}</div>
      <span style="color:#fff;font-size:15px;font-weight:600;font-family:'Montserrat',sans-serif;flex:1;">🗝 Rương ${idx + 1}</span>
    `;

    // Only show delete if more than 1 chest
    if (s._missionData.filter(Boolean).length > 1) {
      const delBtn = document.createElement('button');
      delBtn.textContent = '✕';
      delBtn.style.cssText = 'padding:2px 7px;background:rgba(255,80,80,0.1);border:.5px solid rgba(255,80,80,0.3);border-radius:4px;color:rgba(255,120,120,0.9);font-size:13px;cursor:pointer;flex-shrink:0;';
      delBtn.addEventListener('click', () => {
        s._missionData.splice(idx, 1);
        this._reloadAllEggs();
        this._refreshChestList();
      });
      hdr.appendChild(delBtn);
    }
    wrap.appendChild(hdr);

    const note = document.createElement('div');
    note.style.cssText = 'font-size:13px;color:rgba(255,255,255,1);line-height:1.5;';
    note.textContent = 'Đặt rương vào phòng — khách tìm và giải đố để hoàn thành nhiệm vụ này.';
    wrap.appendChild(note);

    // Riddle text
    const questionTA = Object.assign(document.createElement('textarea'), {
      placeholder: 'Câu đố / mật mã cho khách...',
    });
    questionTA.style.cssText = TS;
    questionTA.value = data.riddle_text || '';
    questionTA.addEventListener('input', e => {
      if (s._missionData[idx]) s._missionData[idx].riddle_text = e.target.value;
    });
    wrap.appendChild(questionTA);

    // Answer
    const ansIn = Object.assign(document.createElement('input'), {
      type: 'text',
      placeholder: 'Đáp án đúng (không phân biệt hoa thường)',
      value: data.riddle_answer || '',
    });
    ansIn.style.cssText = IS;
    ansIn.addEventListener('input', e => {
      if (s._missionData[idx]) s._missionData[idx].riddle_answer = e.target.value.toLowerCase().trim();
    });
    wrap.appendChild(ansIn);

    // Place button + status
    const chestPos = data.easter_eggs?.[0] || {};
    const placeBtn = document.createElement('button');
    placeBtn.style.cssText = 'width:100%;padding:6px;background:rgba(200,169,110,0.08);border:.5px solid rgba(200,169,110,0.35);border-radius:6px;color:#c8a96e;font-family:"Montserrat",sans-serif;font-size:13px;cursor:pointer;';
    placeBtn.textContent = '📍 Click vào phòng để đặt rương';

    const placeStatus = document.createElement('div');
    placeStatus.style.cssText = 'font-size:12px;color:rgb(200, 168, 110);text-align:center;';
    placeStatus.textContent = (chestPos.pos_x !== null && chestPos.pos_x !== undefined)
      ? `✓ (${(+chestPos.pos_x).toFixed(1)}, ${(+chestPos.pos_z).toFixed(1)})` : 'Chưa đặt vị trí';

    placeBtn.addEventListener('click', () => {
      s._hiddenObjPlaceMissionIdx = idx;
      s._hiddenObjPlaceEggIdx     = 0;
      s._hiddenObjPlaceStatusEl   = placeStatus;
      s._hiddenObjPlaceCallback   = () => { this._refreshChestList(); this.saveMissionsSilent(); };
      s.mode = 'place_hidden';
      s.renderer.domElement.style.cursor = 'crosshair';
      s.toast('Click vào sàn trong phòng để đặt rương câu đố', 'info', 4000);
    });
    wrap.append(placeBtn, placeStatus);

    const toolbarHint = document.createElement('div');
    toolbarHint.style.cssText = 'font-size:12px;color:rgba(104,229,227,0.5);line-height:1.5;text-align:center;';
    toolbarHint.textContent = 'Chọn rương trong phòng → dùng toolbar để di chuyển / xoay / phóng to';
    wrap.appendChild(toolbarHint);

    return wrap;
  }

  // ─── Remove all studio egg objects and re-render from current _missionData ────
  _reloadAllEggs() {
    Object.keys(this._eggObjs).forEach(key => {
      const obj = this._eggObjs[key];
      if (obj) {
        this._s.threeScene.remove(obj);
        this._eggObjMeta.delete(obj);
      }
    });
    this._eggObjs = {};
    this._s._missionData.forEach((d, idx) => {
      if (!d?.mission_type) return;
      const cp = d.easter_eggs?.[0];
      if (cp && cp.pos_x !== null && cp.pos_x !== undefined) {
        this._renderStudioEgg(idx, 0);
      }
    });
  }

  // ─── Render / remove a single studio chest in 3D ─────────────────────────────
  _renderStudioEgg(mIdx, eggIdx) {
    const s   = this._s;
    const key = `${mIdx}_${eggIdx}`;
    const egg = s._missionData[mIdx]?.easter_eggs?.[eggIdx];
    if (!egg || egg.pos_x === null || egg.pos_x === undefined) return;

    this._removeStudioEgg(key);

    const pos = new THREE.Vector3(egg.pos_x, egg.pos_y ?? 0, egg.pos_z);
    const sc  = egg.scale ?? 1.0;

    s.gltfLoader.load('/treasure/treasure_chest.glb', gltf => {
      const obj  = gltf.scene;
      const box  = new THREE.Box3().setFromObject(obj);
      const sz   = box.getSize(new THREE.Vector3());
      const base = 0.6 / Math.max(sz.x, sz.y, sz.z);
      obj.userData._chestBase = base;
      obj.scale.setScalar(base * sc);
      obj.position.copy(pos);
      obj.rotation.y = egg.rot_y ?? 0;
      s.threeScene.add(obj);
      this._eggObjs[key] = obj;
      this._eggObjMeta.set(obj, { missionIdx: mIdx, eggIdx });
    }, null, () => s.toast('Không load được rương', 'error'));
  }

  _removeStudioEgg(key) {
    const obj = this._eggObjs[key];
    if (obj) {
      this._s.threeScene.remove(obj);
      this._eggObjMeta.delete(obj);
      delete this._eggObjs[key];
    }
  }

  // ─── Load chest objects into 3D scene on room load (no panel needed) ─────────
  async loadEggsIntoScene(roomId) {
    const { data: missions, error } = await supabase
      .from('room_missions').select('*')
      .eq('room_id', roomId).eq('mission_type', 'chest_riddle').order('mission_index');
    if (error) {
      console.error('[MissionBuilder] loadEggsIntoScene error:', error.message);
      this._s.toast('❌ Lỗi tải rương câu đố: ' + error.message, 'error', 5000);
      return;
    }
    if (!this._s._missionData) this._s._missionData = [];
    if (!missions?.length) { this._refreshChestList(); return; }
    missions.forEach(m => {
      while (this._s._missionData.length <= m.mission_index) this._s._missionData.push(null);
      if (!this._s._missionData[m.mission_index]) this._s._missionData[m.mission_index] = { ...m };
      const cp = (m.easter_eggs || [])[0];
      if (cp && cp.pos_x !== null && cp.pos_x !== undefined && !this._eggObjs[`${m.mission_index}_0`]) {
        this._renderStudioEgg(m.mission_index, 0);
      }
    });
    this._refreshChestList();
  }

  // ─── Load only completion message from DB (không đụng _missionData) ──────────
  async _loadCompletionMsg() {
    const roomId = this._s.manager.currentRoom?.id;
    if (!roomId) return;
    const { data } = await supabase
      .from('room_completion_config').select('completion_message')
      .eq('room_id', roomId).maybeSingle();
    const msgEl = document.getElementById('ms-completion-msg');
    if (msgEl && data?.completion_message) msgEl.value = data.completion_message;
  }

  // ─── Save to Supabase ─────────────────────────────────────────────────────────
  async save() {
    const s      = this._s;
    const roomId = s.manager.currentRoom?.id;
    if (!roomId) { s.toast('Không tìm thấy phòng', 'error'); return; }

    const msg = document.getElementById('ms-completion-msg')?.value?.trim() || '';
    if (!msg) { s.toast('Vui lòng nhập lời nhắn khi hoàn thành', 'error'); return; }

    const chests = s._missionData.filter(d => d?.mission_type === 'chest_riddle');
    if (!chests.length) { s.toast('Vui lòng thêm ít nhất 1 rương câu đố', 'error'); return; }

    // Save completion message
    await supabase.from('room_completion_config').upsert(
      { room_id: roomId, completion_message: msg, token_reward: 100 },
      { onConflict: 'room_id' }
    );

    const rows = this._buildMissionRows(roomId);

    // Remove DB rows beyond new count (handles deletion)
    const { error: delErr } = await supabase.from('room_missions').delete().eq('room_id', roomId).gte('mission_index', rows.length);
    if (delErr) console.warn('[MissionBuilder] delete old rows error:', delErr.message);

    if (!rows.length) { s.toast('Đã lưu ✓ (không có rương nào)', 'success'); return; }

    const { error } = await supabase.from('room_missions').upsert(rows, { onConflict: 'room_id,mission_index' });
    if (error) { s.toast('❌ Lưu thất bại: ' + error.message, 'error', 5000); return; }

    s.toast(`Đã lưu ${rows.length} rương câu đố ✓`, 'success');
  }

  // ─── Silent save — dùng khi kéo rương qua toolbar hoặc lưu gallery ──────────
  async saveMissionsSilent() {
    const s      = this._s;
    const roomId = s.manager.currentRoom?.id;
    if (!roomId) return;
    const rows = this._buildMissionRows(roomId);
    if (!rows.length) return;
    const { error } = await supabase.from('room_missions').upsert(rows, { onConflict: 'room_id,mission_index' });
    if (error) {
      console.error('[MissionBuilder] saveMissionsSilent error:', error.message);
      s.toast('❌ Lỗi lưu rương câu đố: ' + error.message, 'error', 5000);
    }
  }

  // ─── Build mission rows array from current _missionData ──────────────────────
  _buildMissionRows(roomId) {
    const rows = [];
    this._s._missionData.forEach((d, i) => {
      if (!d?.mission_type) return;
      const cp = (d.easter_eggs || [])[0] || {};
      rows.push({
        room_id:       roomId,
        mission_index: i,
        mission_type:  'chest_riddle',
        title:         d.title || `Rương câu đố ${i + 1}`,
        riddle_text:   d.riddle_text   || null,
        riddle_answer: d.riddle_answer || null,
        easter_eggs:   [{
          pos_x: cp.pos_x ?? null, pos_y: cp.pos_y ?? null, pos_z: cp.pos_z ?? null,
          rot_y: cp.rot_y ?? 0, scale: cp.scale ?? 1.0,
        }],
      });
    });
    return rows;
  }

  // ─── Load from Supabase into UI ───────────────────────────────────────────────
  async loadIntoUI() {
    const s      = this._s;
    const roomId = s.manager.currentRoom?.id;
    if (!roomId) return;

    const [{ data: missions }, { data: config }] = await Promise.all([
      supabase.from('room_missions').select('*').eq('room_id', roomId).eq('mission_type', 'chest_riddle').order('mission_index'),
      supabase.from('room_completion_config').select('*').eq('room_id', roomId).maybeSingle(),
    ]);

    if (!s._missionData) s._missionData = [];
    s._missionData = (missions || []).map(m => ({ ...m }));

    // Render 3D chests
    s._missionData.forEach((d, idx) => {
      const cp = (d.easter_eggs || [])[0];
      if (cp && cp.pos_x !== null && cp.pos_x !== undefined) {
        this._renderStudioEgg(idx, 0);
      }
    });

    this._refreshChestList();

    const msgEl = document.getElementById('ms-completion-msg');
    if (msgEl && config?.completion_message) msgEl.value = config.completion_message;
  }
}
