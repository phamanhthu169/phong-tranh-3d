/**
 * PreviewScene.js
 *
 * Giống hệt ViewerScene nhưng dành riêng cho artist xem trước phòng của mình.
 * - Không publish / không hiện ở Explore
 * - Không multiplayer (không spawn remote players)
 * - Không ghi like / visit
 * - Hiển thị banner "XEM TRƯỚC" cố định ở trên cùng
 * - Có nút "← Quay lại chỉnh sửa" để trở về StudioScene
 *
 * Đăng ký trong SceneManager / router của bạn:
 *   case 'preview': return new PreviewScene(manager, canvas);
 *
 * Để navigate tới đây từ StudioScene:
 *   this.manager.navigateTo('preview');
 *   (currentRoom phải đã được set trước đó)
 */

import { ViewerScene } from './ViewerScene.js';

export class PreviewScene extends ViewerScene {

  /* ─── override init: giống ViewerScene nhưng bỏ một số bước ─── */
  async init() {
    // Chạy init gốc của ViewerScene (load room, build UI, v.v.)
    await super.init();
    if (this._disposed) return;

    // Thêm banner preview và nút quay lại
    this._buildPreviewBanner();
  }

  /* ─── KHÔNG khởi tạo multiplayer ─── */
  _initMultiplayer() {
    // Bỏ qua hoàn toàn — preview chỉ một mình artist xem
  }

  /* ─── KHÔNG ghi like ─── */
  async _initLike() {
    // Bỏ qua — không cần like trong preview
  }

  /* ─── KHÔNG ghi visit / analytics ─── */
  _recordVisit() {
    // Bỏ qua
  }

  /* ─── Banner + nút quay lại ─── */
  _buildPreviewBanner() {
    // Inject CSS cho banner
    const style = document.createElement('style');
    style.id = 'preview-banner-css';
    style.textContent = `
      #preview-banner {
        position: fixed;
        top: 0; left: 0; right: 0;
        height: 40px;
        background: linear-gradient(90deg, rgba(200,120,30,.95) 0%, rgba(180,90,10,.95) 100%);
        border-bottom: 1.5px solid rgba(255,200,80,.45);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 16px;
        z-index: 9999;
        font-family: 'Space Mono', monospace;
        backdrop-filter: blur(6px);
        box-shadow: 0 2px 16px rgba(0,0,0,.45);
        pointer-events: none;
      }

      #preview-banner-icon {
        font-size: 16px;
        animation: preview-pulse 2s ease-in-out infinite;
      }

      @keyframes preview-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50%       { opacity: 0.65; transform: scale(0.88); }
      }

      #preview-banner-text {
        font-size: 10px;
        letter-spacing: .22em;
        text-transform: uppercase;
        color: #fff5d6;
        font-weight: 700;
      }

      #preview-banner-sub {
        font-size: 8px;
        letter-spacing: .12em;
        color: rgba(255,240,180,.6);
        text-transform: uppercase;
      }

      #preview-back-btn {
        position: fixed;
        top: 15px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 9998;
        pointer-events: auto;
        background: rgba(18, 47, 106, 1);
        border: 1px solid rgba(255, 255, 255, 0.5);
        color: #ffffff;
        font-family: 'Space Mono', monospace;
        font-size: 10px;
        letter-spacing: .14em;
        text-transform: uppercase;
        padding: 7px 20px;
        border-radius: 20px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: all .2s;
        box-shadow: 0 4px 16px rgba(0,0,0,.4);
        white-space: nowrap;
      }

      #preview-back-btn:hover {
        background: rgba(200,169,110,.18);
        border-color: #c8a96e;
        color: #fff;
        transform: translateX(-50%) translateY(-1px);
        box-shadow: 0 6px 20px rgba(0,0,0,.5);
      }

      #preview-back-btn svg {
        width: 13px; height: 13px;
        stroke: currentColor; fill: none; stroke-width: 2;
        flex-shrink: 0;
      }

      /* Đẩy topbar của ViewerScene xuống để không đè banner */
      #topbar {
        top: 0px !important;
      }
    `;
    document.head.appendChild(style);
    this._el(style);


    // Nút quay lại
    const backBtn = document.createElement('button');
    backBtn.id = 'preview-back-btn';
    backBtn.innerHTML = `
      <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
      Quay lại chỉnh sửa
    `;
    backBtn.addEventListener('click', () => {
      this.manager.navigateTo('studio');
    });
    document.body.appendChild(backBtn);
    this._el(backBtn);
  }
}
