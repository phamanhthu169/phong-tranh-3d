/**
 * ViewerSpawn.js
 * Quản lý vị trí ban đầu (spawn point) của viewer khi vào phòng.
 *
 * Sử dụng trong StudioScene:
 *   import { ViewerSpawn } from './ViewerSpawn.js';
 *   this.viewerSpawn = new ViewerSpawn(this);   // trong init()
 *
 * Dữ liệu lưu/tải qua:
 *   this.viewerSpawn.getSaveData()   → object | null  (cho _meta.viewerSpawn)
 *   this.viewerSpawn.loadFromData(data)               (từ sd._meta.viewerSpawn)
 *
 * Điền pane giao diện:
 *   this.viewerSpawn.fillPane(pane)
 */
export class ViewerSpawn {
  /**
   * @param {object} scene  — tham chiếu tới StudioScene instance
   *   scene.camera, scene.yaw, scene.pitch, scene.toast(), scene._triggerAutosave()
   */
  constructor(scene) {
    this._scene = scene;
    this._data  = null;  // { x, y, z, yaw, pitch } hoặc null
  }

  /* ─── Lưu / Tải ─────────────────────────────────────────── */

  /** Trả về object để nhúng vào _meta.viewerSpawn khi save. */
  getSaveData() {
    return this._data ? { ...this._data } : null;
  }

  /** Khôi phục từ _meta.viewerSpawn khi load. */
  loadFromData(data) {
    if (data && typeof data.x === 'number') {
      this._data = { x: data.x, y: data.y, z: data.z, yaw: data.yaw ?? 0, pitch: data.pitch ?? 0 };
    } else {
      this._data = null;
    }
  }

  /* ─── Giao diện pane ─────────────────────────────────────── */

  /**
   * Điền nội dung vào pane element (được gọi từ _fillPane trong StudioScene).
   * @param {HTMLElement} pane
   */
  fillPane(pane) {
    pane.style.background     = "url('/panelstudio/subtabbg.svg') no-repeat center center";
    pane.style.backgroundSize = '100% 100%';
    pane.style.width          = '418px';
    pane.style.minHeight      = '409.81px';
    pane.style.borderRadius   = '17px';
    pane.style.padding        = '20px';
    pane.style.boxSizing      = 'border-box';

    // Tiêu đề
    const title = document.createElement('div');
    title.className   = 'rp-section-title';
    title.textContent = 'Vị trí ban đầu của viewer';
    pane.appendChild(title);

    // Hướng dẫn
    const hint = document.createElement('div');
    hint.style.cssText = 'color:rgba(212,197,169,0.5);font-size:10px;line-height:1.7;margin-bottom:14px;margin-top:4px';
    hint.innerHTML = 'Di chuyển đến vị trí và hướng nhìn bạn muốn viewer bắt đầu,<br>sau đó bấm nút bên dưới để lưu lại.';
    pane.appendChild(hint);

    // Khung trạng thái
    const status = document.createElement('div');
    status.style.cssText = 'background:rgba(212,197,169,0.06);border:0.5px solid rgba(212,197,169,0.15);border-radius:4px;padding:10px 12px;font-family:monospace;font-size:9px;color:rgba(212,197,169,0.5);letter-spacing:.08em;line-height:1.9;margin-bottom:14px';
    this._refreshStatus(status);
    pane.appendChild(status);

    // Nút đặt vị trí
    const setBtn = document.createElement('div');
    setBtn.className   = 'rp-upload-btn';
    setBtn.style.cssText = 'padding:10px;font-size:11px;text-align:center;cursor:pointer;';
    setBtn.textContent = '📍 Đặt vị trí hiện tại làm điểm vào phòng';
    setBtn.addEventListener('click', () => {
      const s = this._scene;
      this._data = {
        x:     s.camera.position.x,
        y:     s.camera.position.y,
        z:     s.camera.position.z,
        yaw:   s.yaw,
        pitch: s.pitch,
      };
      this._refreshStatus(status);
      s._triggerAutosave();
      s.toast('Đã lưu vị trí ban đầu của viewer ✓', 'success');
    });
    pane.appendChild(setBtn);

    // Nút xoá
    const clearBtn = document.createElement('div');
    clearBtn.className   = 'rp-upload-btn';
    clearBtn.style.cssText = 'padding:8px;font-size:10px;text-align:center;cursor:pointer;color:rgba(220,100,100,0.8);border-color:rgba(220,100,100,0.3);margin-top:6px;';
    clearBtn.textContent = '✕ Xoá — dùng vị trí mặc định';
    clearBtn.addEventListener('click', () => {
      this._data = null;
      this._refreshStatus(status);
      this._scene._triggerAutosave();
      this._scene.toast('Đã xoá vị trí ban đầu', 'info');
    });
    pane.appendChild(clearBtn);
  }

  /* ─── Internal ───────────────────────────────────────────── */

  _refreshStatus(statusEl) {
    const d = this._data;
    statusEl.innerHTML = d
      ? `<span style="color:#c8a96e">✓ Đã đặt vị trí</span><br>X: ${d.x.toFixed(2)} · Y: ${d.y.toFixed(2)} · Z: ${d.z.toFixed(2)}<br>Hướng: ${(d.yaw * 180 / Math.PI).toFixed(1)}°`
      : `Chưa đặt — viewer sẽ vào từ vị trí mặc định`;
  }
}
