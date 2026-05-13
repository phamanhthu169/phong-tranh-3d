import * as THREE from 'three';
import { BaseScene } from './BaseScene.js';
import { HEADER_H } from '../core/SceneManager.js';
import { supabase } from '../utils/supabase.js';

export class ForumScene extends BaseScene {
  async init() {
    await this.manager.auth.ready();
    if (this._disposed) return;

    this.threeScene.background = new THREE.Color(0x0a0910);
    this.camera.position.set(0, 0, 5);
    this.threeScene.add(new THREE.AmbientLight(0xffffff, 0.2));
    this._createParticles();

    this._likedPosts = new Set(JSON.parse(localStorage.getItem('forum_liked') || '[]'));
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
      new THREE.PointsMaterial({ color: 0x9070d0, size: 0.03, transparent: true, opacity: 0.12 })
    );
    this.threeScene.add(this._particles);
  }

  _buildOverlay() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;top:${HEADER_H}px;left:0;right:0;bottom:0;
      overflow-y:auto;z-index:100;font-family:monospace;
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
          color: #d4c5a9;
          font-size: 11px;
          letter-spacing: .28em;
          text-transform: uppercase;
        }
        .fr-sub {
          color: #3a3228;
          font-size: 9px;
          letter-spacing: .12em;
          margin-top: 4px;
        }
        .fr-back {
          background: none;
          border: 1px solid rgba(212,197,169,.15);
          color: #5a5040;
          font-family: monospace;
          font-size: 10px;
          letter-spacing: .06em;
          padding: 5px 14px;
          border-radius: 3px;
          cursor: pointer;
          transition: all .2s;
        }
        .fr-back:hover { border-color: rgba(212,197,169,.35); color: #8a7a60; }

        .fr-compose {
          background: rgba(15,13,12,.95);
          border: 1px solid rgba(212,197,169,.14);
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 24px;
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
          background: rgba(200,169,110,.1);
          border: 1px solid rgba(200,169,110,.25);
          display: flex; align-items: center; justify-content: center;
          font-size: 13px;
          color: #c8a96e;
          flex-shrink: 0;
        }
        .fr-compose-name {
          color: #8a7a60;
          font-size: 11px;
          letter-spacing: .06em;
        }
        .fr-textarea {
          width: 100%;
          background: rgba(212,197,169,.04);
          border: 1px solid rgba(212,197,169,.12);
          border-radius: 4px;
          color: #d4c5a9;
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
        .fr-textarea:focus { border-color: rgba(200,169,110,.38); }
        .fr-textarea::placeholder { color: #3a3228; }
        .fr-compose-foot {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 12px;
        }
        .fr-char {
          color: #2e2a24;
          font-size: 9px;
          letter-spacing: .06em;
        }
        .fr-btn {
          padding: 7px 18px;
          font-size: 10px;
          cursor: pointer;
          font-family: monospace;
          letter-spacing: .1em;
          border-radius: 3px;
          transition: all .2s;
          border: 1px solid;
        }
        .fr-btn.gold {
          background: rgba(200,169,110,.12);
          border-color: rgba(200,169,110,.45);
          color: #c8a96e;
        }
        .fr-btn.gold:hover { background: rgba(200,169,110,.25); }
        .fr-btn.gold:disabled { opacity: .45; cursor: default; }

        .fr-not-logged {
          background: rgba(15,13,12,.85);
          border: 1px solid rgba(212,197,169,.1);
          border-radius: 6px;
          padding: 14px 20px;
          margin-bottom: 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: #4a4038;
          font-size: 11px;
          letter-spacing: .06em;
        }

        .fr-divider {
          border: none;
          border-top: 1px solid rgba(212,197,169,.06);
          margin: 6px 0 20px;
        }

        .fr-post-card {
          background: rgba(15,13,12,.93);
          border: 1px solid rgba(212,197,169,.1);
          border-radius: 8px;
          padding: 20px 20px 16px;
          margin-bottom: 14px;
          transition: border-color .2s;
        }
        .fr-post-card:hover { border-color: rgba(212,197,169,.2); }

        .fr-author-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 13px;
        }
        .fr-avatar {
          width: 36px; height: 36px;
          border-radius: 50%;
          background: rgba(200,169,110,.1);
          border: 1px solid rgba(200,169,110,.22);
          display: flex; align-items: center; justify-content: center;
          font-size: 14px;
          color: #c8a96e;
          flex-shrink: 0;
        }
        .fr-author-name {
          color: #c8a96e;
          font-size: 12px;
          letter-spacing: .06em;
          cursor: pointer;
          transition: color .15s;
        }
        .fr-author-name:hover { color: #e0c880; text-decoration: underline; }
        .fr-role-badge {
          display: inline-block;
          padding: 1px 7px;
          font-size: 8px;
          letter-spacing: .14em;
          text-transform: uppercase;
          border-radius: 2px;
          border: 1px solid rgba(200,169,110,.22);
          color: #7a6a50;
          background: rgba(200,169,110,.05);
          margin-left: 6px;
        }
        .fr-time {
          color: #2e2a24;
          font-size: 9px;
          letter-spacing: .05em;
          margin-left: auto;
          white-space: nowrap;
        }
        .fr-content {
          color: #c8bca8;
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
          color: #4a4038;
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
        .fr-act:hover { color: #c8a96e; background: rgba(200,169,110,.07); }
        .fr-act.liked { color: #c8a96e; }

        .fr-comments {
          margin-top: 16px;
          border-top: 1px solid rgba(212,197,169,.07);
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
          background: rgba(200,169,110,.07);
          border: 1px solid rgba(200,169,110,.16);
          display: flex; align-items: center; justify-content: center;
          font-size: 10px;
          color: #c8a96e;
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
          color: #c8a96e;
          font-size: 10px;
          letter-spacing: .05em;
          cursor: pointer;
        }
        .fr-c-author:hover { text-decoration: underline; }
        .fr-c-time {
          color: #2a2620;
          font-size: 9px;
        }
        .fr-c-text {
          color: #7a6e5c;
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
          background: rgba(212,197,169,.04);
          border: 1px solid rgba(212,197,169,.1);
          border-radius: 3px;
          color: #d4c5a9;
          font-family: monospace;
          font-size: 12px;
          padding: 7px 10px;
          outline: none;
          transition: border-color .2s;
        }
        .fr-c-input:focus { border-color: rgba(200,169,110,.32); }
        .fr-c-input::placeholder { color: #2e2a24; }
        .fr-c-send {
          padding: 7px 14px;
          background: rgba(200,169,110,.1);
          border: 1px solid rgba(200,169,110,.35);
          color: #c8a96e;
          font-family: monospace;
          font-size: 9px;
          letter-spacing: .08em;
          border-radius: 3px;
          cursor: pointer;
          transition: all .18s;
          white-space: nowrap;
        }
        .fr-c-send:hover { background: rgba(200,169,110,.22); }
        .fr-c-send:disabled { opacity: .4; cursor: default; }

        .fr-empty {
          text-align: center;
          color: #3a3228;
          font-size: 11px;
          letter-spacing: .1em;
          padding: 70px 20px;
        }
        .fr-loading-txt {
          text-align: center;
          color: #3a3228;
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
          border: 1px solid rgba(212,197,169,.15);
          color: #4a4038;
          font-family: monospace;
          font-size: 10px;
          letter-spacing: .08em;
          padding: 8px 22px;
          border-radius: 3px;
          cursor: pointer;
          transition: all .2s;
        }
        .fr-load-more-btn:hover { border-color: rgba(212,197,169,.35); color: #8a7a60; }

        .fr-toast {
          position: fixed;
          bottom: 32px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(12,10,9,.98);
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
        }
      </style>

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

    if (this.manager.auth.isLoggedIn) {
      const textarea = document.getElementById('fr-compose-text');
      const charEl   = document.getElementById('fr-char-count');
      textarea.addEventListener('input', () => {
        charEl.textContent = `${textarea.value.length} / 1000`;
      });
      document.getElementById('fr-submit-post').addEventListener('click', () => this._submitPost());
    } else {
      const cta = document.getElementById('fr-login-cta');
      if (cta) cta.addEventListener('click', () => this.manager.navigateTo('login'));
    }

    document.getElementById('fr-load-more').addEventListener('click', () => this._loadPosts(true));
  }

  // ─── Data ────────────────────────────────────────────────────────────────────
  async _loadPosts(more = false) {
    if (this._loading) return;
    this._loading = true;

    if (!more) {
      this._offset = 0;
      this._posts  = [];
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
  }

  _buildCard(post) {
    const isLiked   = this._likedPosts.has(post.id);
    const initial   = (post.author_name || '?').charAt(0).toUpperCase();
    const roleLbl   = post.author_role === 'artist' ? 'Artist' : 'Visitor';
    const timeStr   = this._relTime(post.created_at);
    const cmtCount  = post.comment_count || 0;
    const cmtLabel  = cmtCount > 0 ? `${cmtCount} bình luận` : 'Bình luận';

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
      <div class="fr-content">${this._esc(post.content)}</div>
      <div class="fr-action-row">
        <button class="fr-act fr-like-btn${isLiked ? ' liked' : ''}" data-id="${post.id}">
          ♥ <span class="fr-like-count">${post.like_count || 0}</span>
        </button>
        <button class="fr-act fr-cmt-btn" data-id="${post.id}">
          ◎ <span class="fr-cmt-label">${cmtLabel}</span>
        </button>
      </div>
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

    return card;
  }

  async _submitPost() {
    const ta      = document.getElementById('fr-compose-text');
    const content = ta.value.trim();
    if (!content) return;

    const profile = this.manager.auth.profile;
    const btn     = document.getElementById('fr-submit-post');
    btn.disabled     = true;
    btn.textContent  = 'Đang đăng...';

    const { error } = await supabase.from('forum_posts').insert({
      author_name:   profile.name,
      author_role:   profile.role || 'visitor',
      content,
      like_count:    0,
      comment_count: 0,
    });

    btn.disabled    = false;
    btn.textContent = 'Đăng bài';

    if (error) {
      this._toast('Không thể đăng bài: ' + error.message, 'err');
      return;
    }

    ta.value = '';
    document.getElementById('fr-char-count').textContent = '0 / 1000';
    this._toast('Đã đăng bài!');
    await this._loadPosts();
  }

  async _toggleLike(postId, btn) {
    const liked   = this._likedPosts.has(postId);
    const countEl = btn.querySelector('.fr-like-count');
    const cur     = parseInt(countEl.textContent) || 0;
    const next    = liked ? Math.max(0, cur - 1) : cur + 1;

    if (liked) {
      this._likedPosts.delete(postId);
      btn.classList.remove('liked');
    } else {
      this._likedPosts.add(postId);
      btn.classList.add('liked');
    }
    countEl.textContent = next;
    localStorage.setItem('forum_liked', JSON.stringify([...this._likedPosts]));

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
  _goProfile(name, role) {
    const mine = this.manager.auth.profile;
    if (mine && mine.name === name) {
      this.manager.navigateTo('profile');
    } else {
      this.manager.profileTarget = { name, role };
      this.manager.navigateTo('profile');
    }
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
