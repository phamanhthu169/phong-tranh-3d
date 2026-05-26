import * as THREE from 'three';
import { BaseScene } from './BaseScene.js';
import { HEADER_H } from '../core/SceneManager.js';
import { supabase, compressImage, toCDN } from '../utils/supabase.js';

export class ForumScene extends BaseScene {
  async init() {
    await this.manager.auth.ready();
    if (this._disposed) return;

    this.threeScene.background = new THREE.Color(0xF1FAFF);
    this.camera.position.set(0, 0, 5);
    this.threeScene.add(new THREE.AmbientLight(0xffffff, 0.2));
    this._createParticles();

    this._likedPosts = new Set();
    this._posts      = [];
    this._offset     = 0;
    this._pageSize   = 12;
    this._loading    = false;

    this._buildOverlay();
    await this._loadPosts();
  }

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

  _buildOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'fr-overlay-wrap';
    overlay.style.cssText = `
      position:relative;width:100%;min-height:calc(100vh - ${HEADER_H}px);
      overflow-y:visible;z-index:100;font-family:'Montserrat',sans-serif;background:#F1FAFF;
      color:#182D58;
    `;

    const isLoggedIn = this.manager.auth.isLoggedIn;

    overlay.innerHTML = `
      <style>
        .fr-wrap {
          max-width: 700px;
          margin: 0 auto;
          padding: 32px 20px 100px;
        }
        .fr-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 28px;
        }
        .fr-title {
          color: #2222C6;
          font-family: 'Montserrat', sans-serif;
          font-size: 40px;
          font-weight: 800;
          line-height: 1.1;
          margin-bottom: 10px;
        }
        .fr-sub {
          color: #182D58;
          font-family: 'Montserrat', sans-serif;
          font-size: clamp(14px, 1.5vw, 20px);
          font-weight: 600;
          font-style: italic;
          margin-top: 4px;
        }
        .fr-back {
          background: none;
          border: 1px solid rgba(0,0,0,.1);
          color: #555;
          font-family: monospace;
          font-size: 10px;
          letter-spacing: .06em;
          padding: 5px 14px;
          border-radius: 3px;
          cursor: pointer;
          transition: all .2s;
        }
        .fr-back:hover { border-color: rgba(0,0,0,.25); color: #222; }

        .fr-compose {
          background: #ffffff;
          border: 1px solid rgba(0,0,0,.1);
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 24px;
          box-shadow: 0 2px 8px rgba(0,0,0,.06);
        }
        .fr-compose-head {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
        }
        .fr-compose-avatar {
          width: 34px; height: 34px;
          border-radius: 50%;
          background: rgba(118,170,171,.1);
          border: 1px solid rgba(118,170,171,.25);
          display: flex; align-items: center; justify-content: center;
          font-size: 13px;
          color: #76AAAB;
          flex-shrink: 0;
        }
        .fr-compose-name {
          color: #555;
          font-size: 11px;
          letter-spacing: .06em;
        }
        .fr-textarea {
          width: 100%;
          background: rgba(0,0,0,.03);
          border: 1px solid rgba(0,0,0,.1);
          border-radius: 4px;
          color: #1a1a1a;
          font-family: monospace;
          font-size: 13px;
          padding: 12px;
          box-sizing: border-box;
          resize: none;
          outline: none;
          min-height: 88px;
          line-height: 1.7;
          transition: border-color .2s;
        }
        .fr-textarea:focus { border-color: rgba(118,170,171,.5); }
        .fr-textarea::placeholder { color: #aaa; }
        .fr-compose-foot {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 12px;
        }
        .fr-char {
          color: #aaa;
          font-size: 9px;
          letter-spacing: .06em;
        }
        .fr-btn {
          padding: 7px 18px;
          font-size: 10px;
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
        .fr-btn:hover { box-shadow: 0 6px 18px rgba(118,170,171,.75); transform: translateY(-1px); }
        .fr-btn.gold {
          background: #122F6A;
          border-color: rgba(255,255,255,.35);
          color: #FFFFFF;
        }
        .fr-btn.gold:hover { box-shadow: 0 6px 18px rgba(118,170,171,.75); transform: translateY(-1px); }
        .fr-btn.gold:disabled { opacity: .45; cursor: default; transform: none; }

        .fr-not-logged {
          background: #f8f8f8;
          border: 1px solid rgba(0,0,0,.08);
          border-radius: 6px;
          padding: 14px 20px;
          margin-bottom: 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: #555;
          font-size: 11px;
          letter-spacing: .06em;
        }

        .fr-divider {
          border: none;
          border-top: 1px solid rgba(0,0,0,.06);
          margin: 6px 0 20px;
        }

        .fr-post-card {
          background: #ffffff;
          border: 1px solid rgba(0,0,0,.08);
          border-radius: 8px;
          padding: 20px 20px 16px;
          margin-bottom: 14px;
          transition: border-color .2s;
          box-shadow: 0 1px 4px rgba(0,0,0,.05);
        }
        .fr-post-card:hover { border-color: rgba(0,0,0,.18); }

        .fr-author-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 13px;
        }
        .fr-avatar {
          width: 36px; height: 36px;
          border-radius: 50%;
          background: rgba(118,170,171,.1);
          border: 1px solid rgba(118,170,171,.22);
          display: flex; align-items: center; justify-content: center;
          font-size: 14px;
          color: #76AAAB;
          flex-shrink: 0;
        }
        .fr-author-name {
          color: #182D58;
          font-size: 12px;
          letter-spacing: .06em;
          cursor: pointer;
          transition: color .15s;
        }
        .fr-author-name:hover { color: #76AAAB; text-decoration: underline; }
        .fr-role-badge {
          display: inline-block;
          padding: 1px 7px;
          font-size: 8px;
          letter-spacing: .14em;
          text-transform: uppercase;
          border-radius: 2px;
          border: 1px solid rgba(118,170,171,.22);
          color: #888;
          background: rgba(118,170,171,.05);
          margin-left: 6px;
        }
        .fr-time {
          color: #aaa;
          font-size: 9px;
          letter-spacing: .05em;
          margin-left: auto;
          white-space: nowrap;
        }
        .fr-content {
          color: #1a1a1a;
          font-size: 13px;
          line-height: 1.78;
          margin-bottom: 14px;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .fr-action-row {
          display: flex;
          gap: 4px;
          align-items: center;
        }
        .fr-act {
          background: none;
          border: none;
          color: #666;
          font-family: monospace;
          font-size: 10px;
          letter-spacing: .06em;
          cursor: pointer;
          padding: 5px 10px;
          border-radius: 3px;
          transition: all .18s;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .fr-act:hover { color: #76AAAB; background: rgba(118,170,171,.07); }
        .fr-act.liked { color: #FE6060; }
        .fr-like-btn:hover { color: #FE6060; background: rgba(254,96,96,.07); }


        .fr-comments {
          margin-top: 16px;
          border-top: 1px solid rgba(0,0,0,.06);
          padding-top: 14px;
        }
        .fr-comment {
          display: flex;
          gap: 9px;
          margin-bottom: 12px;
        }
        .fr-c-avatar {
          width: 26px; height: 26px;
          border-radius: 50%;
          background: rgba(0,0,0,.05);
          border: 1px solid rgba(0,0,0,.1);
          display: flex; align-items: center; justify-content: center;
          font-size: 10px;
          color: #888;
          flex-shrink: 0;
          margin-top: 1px;
        }
        .fr-c-body { flex: 1; }
        .fr-c-meta {
          display: flex;
          align-items: baseline;
          gap: 7px;
          margin-bottom: 3px;
        }
        .fr-c-author {
          color: #76AAAB;
          font-size: 10px;
          letter-spacing: .05em;
          cursor: pointer;
        }
        .fr-c-author:hover { text-decoration: underline; }
        .fr-c-time {
          color: #aaa;
          font-size: 9px;
        }
        .fr-c-text {
          color: #333;
          font-size: 12px;
          line-height: 1.65;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .fr-c-input-row {
          display: flex;
          gap: 8px;
          margin-top: 10px;
        }
        .fr-c-input {
          flex: 1;
          background: rgba(0,0,0,.03);
          border: 1px solid rgba(0,0,0,.1);
          border-radius: 3px;
          color: #1a1a1a;
          font-family: monospace;
          font-size: 12px;
          padding: 7px 10px;
          outline: none;
          transition: border-color .2s;
        }
        .fr-c-input:focus { border-color: rgba(118,170,171,.5); }
        .fr-c-input::placeholder { color: #aaa; }
        .fr-c-send {
          padding: 7px 14px;
          background: rgba(118,170,171,.1);
          border: 1px solid rgba(118,170,171,.35);
          color: #76AAAB;
          font-family: monospace;
          font-size: 9px;
          letter-spacing: .08em;
          border-radius: 3px;
          cursor: pointer;
          transition: all .18s;
          white-space: nowrap;
        }
        .fr-c-send:hover { background: rgba(118,170,171,.22); }
        .fr-c-send:disabled { opacity: .4; cursor: default; }

        .fr-empty {
          text-align: center;
          color: #888;
          font-size: 11px;
          letter-spacing: .1em;
          padding: 70px 20px;
        }
        .fr-loading-txt {
          text-align: center;
          color: #888;
          font-size: 10px;
          letter-spacing: .1em;
          padding: 24px;
        }
        .fr-load-more-wrap {
          text-align: center;
          margin-top: 10px;
        }
        .fr-load-more-btn {
          background: none;
          border: 1px solid rgba(0,0,0,.1);
          color: #555;
          font-family: monospace;
          font-size: 10px;
          letter-spacing: .08em;
          padding: 8px 22px;
          border-radius: 3px;
          cursor: pointer;
          transition: all .2s;
        }
        .fr-load-more-btn:hover { border-color: rgba(0,0,0,.25); color: #222; }

        /* ── Compose toolbar ── */
        .fr-compose-toolbar {
          display: flex;
          gap: 4px;
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid rgba(0,0,0,.06);
          flex-wrap: wrap;
        }
        .fr-tool-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 5px 10px;
          background: none;
          border: 1px solid rgba(0,0,0,.1);
          border-radius: 20px;
          font-family: monospace;
          font-size: 9px;
          letter-spacing: .06em;
          color: #666;
          cursor: pointer;
          transition: all .18s;
        }
        .fr-tool-btn:hover { border-color: rgba(118,170,171,.5); color: #76AAAB; background: rgba(118,170,171,.06); }
        .fr-tool-btn.active { border-color: rgba(118,170,171,.5); color: #76AAAB; background: rgba(118,170,171,.08); }
        .fr-tool-icon { font-size: 12px; line-height: 1; }

        /* ── Media preview ── */
        .fr-media-preview {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 10px;
        }
        .fr-media-thumb {
          position: relative;
          width: 80px; height: 80px;
          border-radius: 6px;
          overflow: hidden;
          border: 1px solid rgba(0,0,0,.1);
          background: rgba(0,0,0,.04);
        }
        .fr-media-thumb img, .fr-media-thumb video {
          width: 100%; height: 100%; object-fit: cover;
        }
        .fr-media-remove {
          position: absolute;
          top: 3px; right: 3px;
          width: 16px; height: 16px;
          border-radius: 50%;
          background: rgba(0,0,0,.55);
          color: #fff;
          font-size: 9px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          border: none;
          line-height: 1;
        }
        .fr-media-remove:hover { background: rgba(254,96,96,.8); }

        /* ── Tag / check-in input row ── */
        .fr-extra-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 8px;
          padding: 7px 10px;
          background: rgba(118,170,171,.05);
          border: 1px solid rgba(118,170,171,.2);
          border-radius: 6px;
          font-size: 10px;
          color: #555;
        }
        .fr-extra-row-icon { font-size: 13px; }
        .fr-extra-input {
          flex: 1;
          background: none;
          border: none;
          outline: none;
          font-family: monospace;
          font-size: 10px;
          color: #1a1a1a;
        }
        .fr-extra-input::placeholder { color: #aaa; }
        .fr-extra-close {
          background: none;
          border: none;
          color: #aaa;
          cursor: pointer;
          font-size: 13px;
          padding: 0;
          line-height: 1;
        }
        .fr-extra-close:hover { color: #FE6060; }

        /* ── Tag chips & media in card ── */
        .fr-post-extras {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 10px;
        }
        .fr-post-tag {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 9px;
          border-radius: 20px;
          font-size: 9px;
          letter-spacing: .05em;
        }
        .fr-post-tag.mention {
          background: rgba(118,170,171,.1);
          color: #76AAAB;
          border: 1px solid rgba(118,170,171,.25);
        }
        .fr-post-tag.checkin {
          background: rgba(24,45,88,.07);
          color: #182D58;
          border: 1px solid rgba(24,45,88,.15);
        }
        .fr-post-media {
          display: grid;
          gap: 4px;
          margin-bottom: 12px;
          border-radius: 8px;
          overflow: hidden;
        }
        .fr-post-media.count-1 { grid-template-columns: 1fr; }
        .fr-post-media.count-2 { grid-template-columns: 1fr 1fr; }
        .fr-post-media.count-3 { grid-template-columns: 1fr 1fr; }
        .fr-post-media.count-3 .fr-media-item:first-child { grid-column: 1 / -1; }
        .fr-post-media.count-4 { grid-template-columns: 1fr 1fr; }
        .fr-media-item { overflow: hidden; background: #eee; }
        .fr-media-item img, .fr-media-item video {
          width: 100%; height: 180px; object-fit: cover; display: block; cursor: pointer;
        }
        .fr-post-media.count-1 .fr-media-item img,
        .fr-post-media.count-1 .fr-media-item video { height: 260px; }

        /* ── Share strip ── */
        .fr-share-strip {
          display: flex;
          gap: 6px;
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid rgba(0,0,0,.05);
        }
        .fr-share-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border: 1px solid rgba(0,0,0,.1);
          border-radius: 16px;
          background: none;
          font-family: monospace;
          font-size: 9px;
          letter-spacing: .05em;
          color: #888;
          cursor: pointer;
          transition: all .18s;
        }
        .fr-share-btn:hover { border-color: rgba(118,170,171,.45); color: #76AAAB; }

        /* ── Lightbox ── */
        #fr-lightbox {
          display: none;
          position: fixed; inset: 0;
          background: rgba(0,0,0,.88);
          z-index: 9998;
          align-items: center;
          justify-content: center;
        }
        #fr-lightbox.open { display: flex; }
        #fr-lightbox img, #fr-lightbox video {
          max-width: 90vw; max-height: 90vh;
          border-radius: 4px; object-fit: contain;
        }
        #fr-lightbox-close {
          position: absolute; top: 18px; right: 24px;
          color: #fff; font-size: 28px; cursor: pointer;
          background: none; border: none; line-height: 1;
        }

        .fr-toast {
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
          white-space: nowrap;
          box-shadow: 0 2px 12px rgba(0,0,0,.1);
        }

        /* ── Edit/Delete buttons ── */
        .fr-delete-btn { color: #FE6060 !important; }
        .fr-delete-btn:hover { color: #FE6060 !important; background: rgba(254,96,96,.07) !important; }
        .fr-edit-textarea {
          width: 100%; margin-bottom: 8px; min-height: 80px;
          background: rgba(0,0,0,.03); border: 1px solid rgba(118,170,171,.4);
          border-radius: 4px; color: #182D58; padding: 10px;
          font-family: 'Montserrat', sans-serif; font-size: 15px;
          box-sizing: border-box; outline: none; resize: none; line-height: 1.7;
        }

        /* ── Global font overrides (+2px, Montserrat, #182D58) ── */
        #fr-overlay-wrap { font-family: 'Montserrat', sans-serif; color: #182D58; }
        #fr-overlay-wrap .fr-title { font-size: 42px; }
        #fr-overlay-wrap .fr-sub { font-size: clamp(14px, 1.5vw, 20px); }
        #fr-overlay-wrap .fr-back { font-size: 12px; font-family: 'Montserrat', sans-serif; color: #182D58; }
        #fr-overlay-wrap .fr-compose-name { font-size: 13px; font-family: 'Montserrat', sans-serif; color: #182D58; }
        #fr-overlay-wrap .fr-textarea { font-size: 15px; font-family: 'Montserrat', sans-serif; color: #182D58; }
        #fr-overlay-wrap .fr-char { font-size: 11px; color: #182D58; }
        #fr-overlay-wrap .fr-btn { font-size: 12px; }
        #fr-overlay-wrap .fr-not-logged { font-size: 13px; font-family: 'Montserrat', sans-serif; color: #182D58; }
        #fr-overlay-wrap .fr-author-name { font-size: 14px; }
        #fr-overlay-wrap .fr-role-badge { font-size: 10px; }
        #fr-overlay-wrap .fr-time { font-size: 11px; }
        #fr-overlay-wrap .fr-content { font-size: 15px; font-family: 'Montserrat', sans-serif; color: #182D58; }
        #fr-overlay-wrap .fr-act { font-size: 12px; font-family: 'Montserrat', sans-serif; color: #182D58; }
        #fr-overlay-wrap .fr-c-author { font-size: 12px; }
        #fr-overlay-wrap .fr-c-time { font-size: 11px; }
        #fr-overlay-wrap .fr-c-text { font-size: 14px; font-family: 'Montserrat', sans-serif; color: #182D58; }
        #fr-overlay-wrap .fr-c-input { font-size: 14px; font-family: 'Montserrat', sans-serif; color: #182D58; }
        #fr-overlay-wrap .fr-c-send { font-size: 11px; font-family: 'Montserrat', sans-serif; color: #182D58; }
        #fr-overlay-wrap .fr-empty { font-size: 13px; color: #182D58; }
        #fr-overlay-wrap .fr-loading-txt { font-size: 12px; color: #182D58; }
        #fr-overlay-wrap .fr-load-more-btn { font-size: 12px; font-family: 'Montserrat', sans-serif; color: #182D58; }
        #fr-overlay-wrap .fr-tool-btn { font-size: 11px; font-family: 'Montserrat', sans-serif; color: #182D58; }
        #fr-overlay-wrap .fr-tool-icon { font-size: 14px; }
        #fr-overlay-wrap .fr-extra-row { font-size: 12px; color: #182D58; }
        #fr-overlay-wrap .fr-extra-input { font-size: 12px; font-family: 'Montserrat', sans-serif; color: #182D58; }
        #fr-overlay-wrap .fr-extra-close { font-size: 15px; }
        #fr-overlay-wrap .fr-post-tag { font-size: 11px; }
        #fr-overlay-wrap .fr-share-btn { font-size: 11px; font-family: 'Montserrat', sans-serif; color: #182D58; }
        #fr-overlay-wrap .fr-compose-avatar { font-size: 15px; }
        #fr-overlay-wrap .fr-avatar { font-size: 16px; }
        #fr-overlay-wrap .fr-c-avatar { font-size: 12px; }
        #fr-toast { font-size: 13px; font-family: 'Montserrat', sans-serif; }
      </style>

      <div id="fr-lightbox">
        <button id="fr-lightbox-close">✕</button>
        <div id="fr-lightbox-content"></div>
      </div>

      <div id="fr-toast" class="fr-toast"></div>

      <div class="fr-wrap">
        <div class="fr-topbar">
          <div>
            <div class="fr-title">Cộng đồng</div>
            <div class="fr-sub">Chia sẻ · Thảo luận · Kết nối</div>
          </div>
          <button id="fr-back" class="fr-back">← Quay lại</button>
        </div>

        ${isLoggedIn ? this._composeHtml() : `
          <div class="fr-not-logged">
            <span>Đăng nhập để tham gia thảo luận</span>
            <button id="fr-login-cta" class="fr-btn gold" style="font-size:9px;padding:5px 14px">Đăng nhập</button>
          </div>
        `}

        <hr class="fr-divider" />

        <div id="fr-feed">
          <div class="fr-loading-txt">Đang tải bài viết...</div>
        </div>

        <div id="fr-more-wrap" class="fr-load-more-wrap" style="display:none">
          <button id="fr-load-more" class="fr-load-more-btn">Xem thêm</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this._el(overlay);
    this._overlay = overlay;
    this._bindEvents();
  }

  _composeHtml() {
    const profile  = this.manager.auth.profile;
    const initial  = (profile?.name || '?').charAt(0).toUpperCase();
    const dispName = profile?.name || 'Ẩn danh';
    return `
      <div class="fr-compose">
        <div class="fr-compose-head">
          <div class="fr-compose-avatar">${initial}</div>
          <span class="fr-compose-name">${dispName}</span>
        </div>
        <textarea id="fr-compose-text" class="fr-textarea"
          placeholder="Chia sẻ suy nghĩ, tác phẩm, hoặc câu hỏi của bạn..." maxlength="1000"></textarea>

        <div id="fr-media-preview" class="fr-media-preview"></div>
        <div id="fr-tag-row" class="fr-extra-row" style="display:none">
          <span class="fr-extra-row-icon">👤</span>
          <input class="fr-extra-input" id="fr-tag-input" placeholder="Nhập tên người muốn tag, cách nhau bằng dấu phẩy..." />
          <button class="fr-extra-close" id="fr-tag-close">✕</button>
        </div>
        <div id="fr-checkin-row" class="fr-extra-row" style="display:none">
          <span class="fr-extra-row-icon">📍</span>
          <input class="fr-extra-input" id="fr-checkin-input" placeholder="Nhập địa điểm check-in..." />
          <button class="fr-extra-close" id="fr-checkin-close">✕</button>
        </div>

        <div class="fr-compose-toolbar">
          <button class="fr-tool-btn" id="fr-tool-image">
            <span class="fr-tool-icon">🖼</span> Ảnh
          </button>
          <button class="fr-tool-btn" id="fr-tool-video">
            <span class="fr-tool-icon">🎬</span> Video
          </button>
          <button class="fr-tool-btn" id="fr-tool-tag">
            <span class="fr-tool-icon">👤</span> Tag
          </button>
          <button class="fr-tool-btn" id="fr-tool-checkin">
            <span class="fr-tool-icon">📍</span> Check-in
          </button>
        </div>

        <input type="file" id="fr-file-image" accept="image/*" multiple style="display:none" />
        <input type="file" id="fr-file-video" accept="video/*" style="display:none" />

        <div class="fr-compose-foot">
          <span id="fr-char-count" class="fr-char">0 / 1000</span>
          <button id="fr-submit-post" class="fr-btn gold">Đăng bài</button>
        </div>
      </div>
    `;
  }

  _bindEvents() {
    document.getElementById('fr-back').addEventListener('click', () => {
      this.manager.navigateTo(this.manager.previousScene || 'landing');
    });

    // Lightbox
    const lb = document.getElementById('fr-lightbox');
    document.getElementById('fr-lightbox-close')?.addEventListener('click', () => lb.classList.remove('open'));
    lb?.addEventListener('click', (e) => { if (e.target === lb) lb.classList.remove('open'); });

    if (this.manager.auth.isLoggedIn) {
      const textarea = document.getElementById('fr-compose-text');
      const charEl   = document.getElementById('fr-char-count');
      textarea.addEventListener('input', () => {
        charEl.textContent = `${textarea.value.length} / 1000`;
      });
      document.getElementById('fr-submit-post').addEventListener('click', () => this._submitPost());

      // ── Media attachments ──
      this._mediaFiles = []; // { file, url, type }

      const imgInput = document.getElementById('fr-file-image');
      const vidInput = document.getElementById('fr-file-video');

      document.getElementById('fr-tool-image').addEventListener('click', () => imgInput.click());
      document.getElementById('fr-tool-video').addEventListener('click', () => vidInput.click());

      imgInput.addEventListener('change', () => {
        [...imgInput.files].forEach(f => this._addMedia(f, 'image'));
        imgInput.value = '';
      });
      vidInput.addEventListener('change', () => {
        [...vidInput.files].forEach(f => this._addMedia(f, 'video'));
        vidInput.value = '';
      });

      // ── Tag người ──
      const tagBtn   = document.getElementById('fr-tool-tag');
      const tagRow   = document.getElementById('fr-tag-row');
      const tagClose = document.getElementById('fr-tag-close');
      tagBtn.addEventListener('click', () => {
        const open = tagRow.style.display !== 'none';
        tagRow.style.display = open ? 'none' : 'flex';
        tagBtn.classList.toggle('active', !open);
        if (!open) document.getElementById('fr-tag-input').focus();
      });
      tagClose.addEventListener('click', () => {
        tagRow.style.display = 'none';
        tagBtn.classList.remove('active');
        document.getElementById('fr-tag-input').value = '';
      });

      // ── Check-in ──
      const ciBtn   = document.getElementById('fr-tool-checkin');
      const ciRow   = document.getElementById('fr-checkin-row');
      const ciClose = document.getElementById('fr-checkin-close');
      ciBtn.addEventListener('click', () => {
        const open = ciRow.style.display !== 'none';
        ciRow.style.display = open ? 'none' : 'flex';
        ciBtn.classList.toggle('active', !open);
        if (!open) document.getElementById('fr-checkin-input').focus();
      });
      ciClose.addEventListener('click', () => {
        ciRow.style.display = 'none';
        ciBtn.classList.remove('active');
        document.getElementById('fr-checkin-input').value = '';
      });
    } else {
      const cta = document.getElementById('fr-login-cta');
      if (cta) cta.addEventListener('click', () => this.manager.navigateTo('login'));
    }

    document.getElementById('fr-load-more').addEventListener('click', () => this._loadPosts(true));
  }

  _addMedia(file, type) {
    if (this._mediaFiles.length >= 4) {
      this._toast('Tối đa 4 file media mỗi bài', 'err');
      return;
    }
    const url = URL.createObjectURL(file);
    const id  = Date.now() + Math.random();
    this._mediaFiles.push({ id, file, url, type });
    this._renderMediaPreview();
  }

  _removeMedia(id) {
    const idx = this._mediaFiles.findIndex(m => m.id === id);
    if (idx >= 0) {
      URL.revokeObjectURL(this._mediaFiles[idx].url);
      this._mediaFiles.splice(idx, 1);
    }
    this._renderMediaPreview();
  }

  _renderMediaPreview() {
    const el = document.getElementById('fr-media-preview');
    if (!el) return;
    el.innerHTML = '';
    this._mediaFiles.forEach(m => {
      const thumb = document.createElement('div');
      thumb.className = 'fr-media-thumb';
      thumb.innerHTML = m.type === 'image'
        ? `<img src="${m.url}" />`
        : `<video src="${m.url}" muted></video>`;
      const rm = document.createElement('button');
      rm.className = 'fr-media-remove';
      rm.textContent = '✕';
      rm.addEventListener('click', () => this._removeMedia(m.id));
      thumb.appendChild(rm);
      el.appendChild(thumb);
    });
  }

  // ─── Data ────────────────────────────────────────────────────────────────────
  async _loadPosts(more = false) {
    if (this._loading) return;
    this._loading = true;

    if (!more) {
      this._offset    = 0;
      this._posts     = [];
      this._likedPosts = new Set();
    }

    const { data, error } = await supabase
      .from('forum_posts')
      .select('*')
      .order('created_at', { ascending: false })
      .range(this._offset, this._offset + this._pageSize - 1);

    this._loading = false;
    if (this._disposed) return;

    if (error) {
      document.getElementById('fr-feed').innerHTML =
        `<div class="fr-empty">Không thể tải bài viết.<br><span style="font-size:9px;opacity:.5">${error.message}</span></div>`;
      return;
    }

    const posts = data || [];
    this._posts  = more ? [...this._posts, ...posts] : posts;
    this._offset += posts.length;

    const profile = this.manager.auth.profile;
    if (profile && posts.length) {
      const { data: likes } = await supabase
        .from('forum_likes')
        .select('post_id')
        .eq('user_id', profile.id)
        .in('post_id', posts.map(p => p.id));
      if (likes) likes.forEach(l => this._likedPosts.add(l.post_id));
    }

    this._renderFeed();

    const moreWrap = document.getElementById('fr-more-wrap');
    if (moreWrap) moreWrap.style.display = posts.length === this._pageSize ? 'block' : 'none';
  }

  _renderFeed() {
    const feed = document.getElementById('fr-feed');
    if (!feed) return;

    if (!this._posts.length) {
      feed.innerHTML = `<div class="fr-empty">Chưa có bài viết nào.<br>Hãy là người đầu tiên chia sẻ!</div>`;
      return;
    }

    feed.innerHTML = '';
    this._posts.forEach(p => feed.appendChild(this._buildCard(p)));

    const hash = window.location.hash;
    if (hash.startsWith('#post-')) {
      const targetCard = feed.querySelector(`[data-post-id="${hash.slice(6)}"]`);
      if (targetCard) {
        setTimeout(() => {
          targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetCard.style.outline = '2px solid rgba(118,170,171,.6)';
          setTimeout(() => { targetCard.style.outline = ''; }, 2000);
        }, 300);
      }
    }
  }

  _buildCard(post) {
    const isLiked   = this._likedPosts.has(post.id);
    const initial   = (post.author_name || '?').charAt(0).toUpperCase();
    const roleLbl   = post.author_role === 'artist' ? 'Artist' : 'Visitor';
    const timeStr   = this._relTime(post.created_at);
    const cmtCount  = post.comment_count || 0;
    const cmtLabel  = cmtCount > 0 ? `${cmtCount} bình luận` : 'Bình luận';

    // ── Extras (mentions, checkin) ──
    const mentions  = post.mentions || [];
    const checkin   = post.checkin  || '';
    const isAuthor  = this.manager.auth.isLoggedIn &&
                      this.manager.auth.profile?.name === post.author_name;
    let extrasHtml = '';
    if (mentions.length || checkin) {
      extrasHtml = `<div class="fr-post-extras">`;
      mentions.forEach(m => {
        extrasHtml += `<span class="fr-post-tag mention" data-mention="${this._esc(m)}" style="cursor:pointer">👤 ${this._esc(m)}</span>`;
      });
      if (checkin) {
        extrasHtml += `<span class="fr-post-tag checkin">📍 ${this._esc(checkin)}</span>`;
      }
      extrasHtml += `</div>`;
    }

    // ── Media grid ──
    const media = post.media || [];
    let mediaHtml = '';
    if (media.length) {
      const cls = `count-${Math.min(media.length, 4)}`;
      mediaHtml = `<div class="fr-post-media ${cls}">`;
      media.slice(0, 4).forEach(m => {
        if (m.type === 'video') {
          mediaHtml += `<div class="fr-media-item"><video src="${m.url}" controls muted playsinline></video></div>`;
        } else {
          mediaHtml += `<div class="fr-media-item"><img src="${m.url}" alt="" data-lightbox="${m.url}" loading="lazy"></div>`;
        }
      });
      mediaHtml += `</div>`;
    }

    // ── Share strip ──
    const postUrl   = `${window.location.origin}${window.location.pathname}#post-${post.id}`;
    const shareUrl  = encodeURIComponent(postUrl);
    const shareText = encodeURIComponent((post.content || '').slice(0, 100));
    const shareHtml = `
      <div class="fr-share-strip">
        <button class="fr-share-btn fr-share-copy" data-url="${postUrl}">🔗 Sao chép link</button>
        <a class="fr-share-btn" href="https://www.facebook.com/sharer/sharer.php?u=${shareUrl}" target="_blank" rel="noopener">📘 Facebook</a>
        <a class="fr-share-btn" href="https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}" target="_blank" rel="noopener">🐦 Twitter</a>
      </div>`;

    const card = document.createElement('div');
    card.className = 'fr-post-card';
    card.dataset.postId = post.id;

    card.innerHTML = `
      <div class="fr-author-row">
        <div class="fr-avatar">${initial}</div>
        <div>
          <span class="fr-author-name"
            data-name="${this._esc(post.author_name)}"
            data-role="${this._esc(post.author_role)}">
            ${this._esc(post.author_name || 'Ẩn danh')}
          </span>
          <span class="fr-role-badge">${roleLbl}</span>
        </div>
        <span class="fr-time">${timeStr}</span>
      </div>
      ${extrasHtml}
      <div class="fr-content">${this._esc(post.content)}</div>
      ${mediaHtml}
      <div class="fr-action-row">
        <button class="fr-act fr-like-btn${isLiked ? ' liked' : ''}" data-id="${post.id}">
          ♥ <span class="fr-like-count">${post.like_count || 0}</span>
        </button>
        <button class="fr-act fr-cmt-btn" data-id="${post.id}">
          ◎ <span class="fr-cmt-label">${cmtLabel}</span>
        </button>
        <button class="fr-act fr-share-toggle">↗ Chia sẻ</button>
        ${isAuthor ? `
          <button class="fr-act fr-edit-btn" data-id="${post.id}" style="margin-left:auto">✎ Sửa</button>
          <button class="fr-act fr-delete-btn" data-id="${post.id}">🗑 Gỡ</button>
        ` : ''}
      </div>
      <div class="fr-share-section" style="display:none">${shareHtml}</div>
      <div class="fr-comments" id="cmt-${post.id}" style="display:none"></div>
    `;

    card.querySelector('.fr-author-name').addEventListener('click', (e) => {
      this._goProfile(e.currentTarget.dataset.name, e.currentTarget.dataset.role);
    });
    card.querySelector('.fr-like-btn').addEventListener('click', (e) => {
      this._toggleLike(post.id, e.currentTarget);
    });
    card.querySelector('.fr-cmt-btn').addEventListener('click', () => {
      this._toggleComments(post.id);
    });
    card.querySelector('.fr-share-toggle').addEventListener('click', (e) => {
      const sec = card.querySelector('.fr-share-section');
      sec.style.display = sec.style.display === 'none' ? 'block' : 'none';
    });
    card.querySelectorAll('.fr-share-copy').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.dataset.url;
        const fallback = () => {
          const ta = document.createElement('textarea');
          ta.value = url;
          ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); this._toast('Đã sao chép link!'); }
          catch { this._toast('Không thể sao chép link', 'err'); }
          document.body.removeChild(ta);
        };
        if (navigator.clipboard) {
          navigator.clipboard.writeText(url)
            .then(() => this._toast('Đã sao chép link!'))
            .catch(fallback);
        } else {
          fallback();
        }
      });
    });

    if (isAuthor) {
      card.querySelector('.fr-edit-btn')?.addEventListener('click', () => this._editPost(post, card));
      card.querySelector('.fr-delete-btn')?.addEventListener('click', () => this._deletePost(post.id, card));
    }

    // Mention chips -> profile
    card.querySelectorAll('.fr-post-tag.mention[data-mention]').forEach(el => {
      el.addEventListener('click', async () => {
        const name = el.dataset.mention;
        const { data } = await supabase
          .from('profiles')
          .select('id, role')
          .eq('display_name', name)
          .maybeSingle();
        if (data) {
          this.manager.profileTarget = { id: data.id, name, role: data.role };
        } else {
          const found = this._posts.find(p => p.author_name === name);
          this.manager.profileTarget = { name, role: found?.author_role || null };
        }
        this.manager.navigateTo('profile');
      });
    });

    // Lightbox for images
    card.querySelectorAll('img[data-lightbox]').forEach(img => {
      img.addEventListener('click', () => {
        const lb = document.getElementById('fr-lightbox');
        const lc = document.getElementById('fr-lightbox-content');
        lc.innerHTML = `<img src="${img.dataset.lightbox}">`;
        lb.classList.add('open');
      });
    });

    return card;
  }

  async _submitPost() {
    const ta      = document.getElementById('fr-compose-text');
    const content = ta.value.trim();
    if (!content && (!this._mediaFiles || !this._mediaFiles.length)) return;

    const profile = this.manager.auth.profile;
    const btn     = document.getElementById('fr-submit-post');
    btn.disabled     = true;
    btn.textContent  = 'Đang đăng...';

    // Collect tag & checkin
    const tagVal     = document.getElementById('fr-tag-input')?.value.trim() || '';
    const checkinVal = document.getElementById('fr-checkin-input')?.value.trim() || '';
    const mentions   = tagVal ? tagVal.split(',').map(s => s.trim()).filter(Boolean) : [];

    // Upload media to Supabase Storage (bucket: forum-media)
    const mediaUrls = [];
    for (let m of (this._mediaFiles || [])) {
      const maxSize = m.type === 'video' ? 50 * 1024 * 1024 : 20 * 1024 * 1024;
      if (m.file.size > maxSize) { this._toast(`${m.file.name} quá lớn (tối đa ${m.type === 'video' ? '50' : '20'} MB)`, 'err'); continue; }
      m = { ...m, file: await compressImage(m.file) };
      const ext  = m.file.name.split('.').pop();
      const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('forum-media')
        .upload(path, m.file, { upsert: false });
      if (upErr) {
        btn.disabled    = false;
        btn.textContent = 'Đăng bài';
        this._toast('Không thể tải media: ' + upErr.message, 'err');
        return;
      }
      const { data: { publicUrl } } = supabase.storage.from('forum-media').getPublicUrl(path);
      mediaUrls.push({ url: toCDN(publicUrl), type: m.type });
    }

    const { error } = await supabase.from('forum_posts').insert({
      author_name:   profile.name,
      author_role:   profile.role || 'visitor',
      content:       content || '',
      like_count:    0,
      comment_count: 0,
      media:         mediaUrls.length ? mediaUrls : null,
      mentions:      mentions.length  ? mentions  : null,
      checkin:       checkinVal || null,
    });

    btn.disabled    = false;
    btn.textContent = 'Đăng bài';

    if (error) {
      this._toast('Không thể đăng bài: ' + error.message, 'err');
      return;
    }

    // Reset compose
    ta.value = '';
    document.getElementById('fr-char-count').textContent = '0 / 1000';
    if (document.getElementById('fr-tag-input'))     document.getElementById('fr-tag-input').value = '';
    if (document.getElementById('fr-checkin-input')) document.getElementById('fr-checkin-input').value = '';
    document.getElementById('fr-tag-row').style.display     = 'none';
    document.getElementById('fr-checkin-row').style.display = 'none';
    document.getElementById('fr-tool-tag').classList.remove('active');
    document.getElementById('fr-tool-checkin').classList.remove('active');
    (this._mediaFiles || []).forEach(m => URL.revokeObjectURL(m.url));
    this._mediaFiles = [];
    this._renderMediaPreview();

    this._toast('Đã đăng bài!');
    await this._loadPosts();
  }

  _editPost(post, card) {
    const contentEl = card.querySelector('.fr-content');
    if (!contentEl || card.dataset.editing) return;
    card.dataset.editing = '1';

    const ta = document.createElement('textarea');
    ta.className = 'fr-edit-textarea';
    ta.value = post.content;
    contentEl.replaceWith(ta);

    const actRow = document.createElement('div');
    actRow.style.cssText = 'display:flex;gap:8px;margin-bottom:10px';
    actRow.innerHTML = `
      <button class="fr-btn gold" style="font-size:10px;padding:5px 14px">Lưu</button>
      <button class="fr-btn" style="background:#aaa;border-color:transparent;font-size:10px;padding:5px 14px">Hủy</button>
    `;
    ta.after(actRow);

    const [saveBtn, cancelBtn] = actRow.querySelectorAll('button');

    const restore = (text) => {
      const div = document.createElement('div');
      div.className = 'fr-content';
      div.innerHTML = this._esc(text);
      ta.replaceWith(div);
      actRow.remove();
      delete card.dataset.editing;
    };

    cancelBtn.addEventListener('click', () => restore(post.content));

    saveBtn.addEventListener('click', async () => {
      const newText = ta.value.trim();
      if (!newText) return;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Đang lưu...';

      const { error } = await supabase.from('forum_posts').update({ content: newText }).eq('id', post.id);
      if (error) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Lưu';
        this._toast('Không thể lưu: ' + error.message, 'err');
        return;
      }
      const idx = this._posts.findIndex(p => p.id === post.id);
      if (idx >= 0) this._posts[idx].content = newText;
      post.content = newText;
      restore(newText);
      this._toast('Đã cập nhật bài viết!');
    });

    ta.focus();
  }

  async _deletePost(postId, card) {
    if (!confirm('Bạn có chắc muốn gỡ bài này không?')) return;

    const { error } = await supabase.from('forum_posts').delete().eq('id', postId);
    if (error) {
      this._toast('Không thể gỡ bài: ' + error.message, 'err');
      return;
    }
    this._posts = this._posts.filter(p => p.id !== postId);
    card.remove();
    this._toast('Đã gỡ bài viết');
  }

  async _toggleLike(postId, btn) {
    const profile = this.manager.auth.profile;
    if (!profile) {
      this._toast('Vui lòng đăng nhập để thích bài viết', 'err');
      return;
    }

    const liked   = this._likedPosts.has(postId);
    const countEl = btn.querySelector('.fr-like-count');
    const cur     = parseInt(countEl.textContent) || 0;
    const next    = liked ? Math.max(0, cur - 1) : cur + 1;

    if (liked) {
      this._likedPosts.delete(postId);
      btn.classList.remove('liked');
      await supabase.from('forum_likes').delete().eq('user_id', profile.id).eq('post_id', postId);
    } else {
      this._likedPosts.add(postId);
      btn.classList.add('liked');
      await supabase.from('forum_likes').insert({ user_id: profile.id, post_id: postId });
    }
    countEl.textContent = next;
    await supabase.from('forum_posts').update({ like_count: next }).eq('id', postId);
  }

  async _toggleComments(postId) {
    const section = document.getElementById(`cmt-${postId}`);
    if (!section) return;

    if (section.style.display !== 'none') {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    section.innerHTML = `<div style="color:#2e2a24;font-size:9px;letter-spacing:.08em;padding:4px 0">Đang tải...</div>`;

    const { data } = await supabase
      .from('forum_comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (this._disposed) return;

    const comments   = data || [];
    const isLoggedIn = this.manager.auth.isLoggedIn;

    let html = '';
    comments.forEach(c => {
      const init = (c.author_name || '?').charAt(0).toUpperCase();
      html += `
        <div class="fr-comment">
          <div class="fr-c-avatar">${init}</div>
          <div class="fr-c-body">
            <div class="fr-c-meta">
              <span class="fr-c-author" data-name="${this._esc(c.author_name)}" data-role="${this._esc(c.author_role)}">${this._esc(c.author_name)}</span>
              <span class="fr-c-time">${this._relTime(c.created_at)}</span>
            </div>
            <div class="fr-c-text">${this._esc(c.content)}</div>
          </div>
        </div>
      `;
    });

    if (!comments.length) {
      html = `<div style="color:#2a2620;font-size:10px;letter-spacing:.06em;margin-bottom:8px">Chưa có bình luận</div>`;
    }

    if (isLoggedIn) {
      html += `
        <div class="fr-c-input-row">
          <input class="fr-c-input" id="ci-${postId}" placeholder="Viết bình luận..." maxlength="500" />
          <button class="fr-c-send" data-pid="${postId}">Gửi</button>
        </div>
      `;
    }

    section.innerHTML = html;

    section.querySelectorAll('.fr-c-author').forEach(el => {
      el.addEventListener('click', () => this._goProfile(el.dataset.name, el.dataset.role));
    });

    const sendBtn = section.querySelector('.fr-c-send');
    if (sendBtn) {
      sendBtn.addEventListener('click', () => this._submitComment(postId));
      const inp = document.getElementById(`ci-${postId}`);
      inp?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._submitComment(postId); }
      });
    }
  }

  async _submitComment(postId) {
    const inp     = document.getElementById(`ci-${postId}`);
    if (!inp) return;
    const content = inp.value.trim();
    if (!content) return;

    const profile = this.manager.auth.profile;
    const sendBtn = inp.nextElementSibling;
    if (sendBtn) sendBtn.disabled = true;
    inp.disabled = true;

    const { error } = await supabase.from('forum_comments').insert({
      post_id:     postId,
      author_name: profile.name,
      author_role: profile.role || 'visitor',
      content,
    });

    if (this._disposed) return;
    if (error) {
      if (sendBtn) sendBtn.disabled = false;
      inp.disabled = false;
      return;
    }

    // Tăng comment_count
    const idx = this._posts.findIndex(p => p.id === postId);
    if (idx >= 0) {
      this._posts[idx].comment_count = (this._posts[idx].comment_count || 0) + 1;
      const lblEl = document.querySelector(`.fr-post-card[data-post-id="${postId}"] .fr-cmt-label`);
      if (lblEl) lblEl.textContent = `${this._posts[idx].comment_count} bình luận`;
      await supabase.from('forum_posts')
        .update({ comment_count: this._posts[idx].comment_count })
        .eq('id', postId);
    }

    // Reload comments section
    const section = document.getElementById(`cmt-${postId}`);
    if (section) section.style.display = 'none';
    this._toggleComments(postId);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  async _goProfile(name, role) {
    const mine = this.manager.auth.profile;
    if (mine && mine.name === name) {
      this.manager.navigateTo('profile');
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('display_name', name)
      .maybeSingle();
    this.manager.profileTarget = data
      ? { id: data.id, name, role: data.role }
      : { name, role };
    this.manager.navigateTo('profile');
  }

  _relTime(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (m < 1)  return 'vừa xong';
    if (m < 60) return `${m} phút trước`;
    if (h < 24) return `${h} giờ trước`;
    if (d < 7)  return `${d} ngày trước`;
    return new Date(iso).toLocaleDateString('vi-VN');
  }

  _esc(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  _toast(msg, type = 'ok') {
    const el = document.getElementById('fr-toast');
    if (!el) return;
    el.textContent      = msg;
    el.style.borderColor = type === 'err' ? 'rgba(181,74,58,.4)'  : 'rgba(106,170,122,.4)';
    el.style.color       = type === 'err' ? '#ff9090'             : '#6aaa7a';
    el.style.opacity     = '1';
    setTimeout(() => { el.style.opacity = '0'; }, 2400);
  }

  update(_dt) {
    if (this._particles) this._particles.rotation.y += _dt * 0.005;
  }
}