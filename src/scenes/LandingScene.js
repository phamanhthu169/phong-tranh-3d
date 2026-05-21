import * as THREE from 'three';
import { BaseScene } from './BaseScene.js';
import { supabase } from '../utils/supabase.js';

export class LandingScene extends BaseScene {
  async init() {
    this.threeScene.background = null;
    this.camera.position.set(0, 0, 5);

    await this._svgBodyBackground('/landingpage/landingpage.svg');
    this._buildFixedNavButtons();
    this._buildPublishedStrip();
  }

  _buildFixedNavButtons() {
    // SVG viewBox width — all pixel values below are in SVG coordinate space
    const W = 1571;
    const vw = (n) => `calc(${(n / W).toFixed(6)} * 100vw)`;

    const buttons = [
      {
        src: '/landingpage/cta.svg',
        alt: 'Bắt đầu xây phòng',
        top: 476, width: 300, left: 127.25, centered: false,
        onClick: () => this.manager.navigateTo(this.manager.auth.isLoggedIn ? 'studio' : 'register'),
      },
      {
        src: '/landingpage/explore.svg',
        alt: 'Khám phá',
        top: 2565.3, width: 334, left: 0, centered: true,
        onClick: () => this.manager.navigateTo('explore'),
      },
      {
        src: '/landingpage/studio.svg',
        alt: 'Studio',
        top: 3082.7, width: 289 * 0.85, left: 253, centered: false,
        onClick: () => this.manager.navigateTo(this.manager.auth.isLoggedIn ? 'studio' : 'register'),
      },
      {
        src: '/landingpage/forum.svg',
        alt: 'Diễn đàn',
        top: 3490.3, width: 289 * 0.85, left: 253, centered: false,
        onClick: () => this.manager.navigateTo('forum'),
      },
    ];

    buttons.forEach(({ src, alt, top, width, left, centered, onClick }) => {
      const btn = document.createElement('button');

      if (centered) {
        btn.style.cssText = `
          position:absolute;left:50%;transform:translateX(-50%);top:${vw(top)};z-index:9999;
          background:none;border:none;padding:0;cursor:pointer;
          transition:transform 0.2s,filter 0.2s;
        `;
      } else {
        btn.style.cssText = `
          position:absolute;left:${vw(left)};top:${vw(top)};z-index:9999;
          background:none;border:none;padding:0;cursor:pointer;
          transition:transform 0.2s,filter 0.2s;
        `;
      }

      const img = document.createElement('img');
      img.src = src;
      img.alt = alt;
      img.style.cssText = `width:${vw(width)};height:auto;display:block;`;
      btn.appendChild(img);

      btn.addEventListener('mouseenter', () => {
        btn.style.transform = centered ? 'translateX(-50%) scale(1.05)' : 'scale(1.05)';
        btn.style.filter = 'brightness(1.12)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = centered ? 'translateX(-50%) scale(1)' : 'scale(1)';
        btn.style.filter = 'none';
      });

      btn.addEventListener('click', onClick);
      document.body.appendChild(btn);
      this._fixedNavBtns = this._fixedNavBtns || [];
      this._fixedNavBtns.push(btn);
    });
  }

  // ── PUBLISHED ROOMS STRIP ────────────────────────────────────────────────────
  _buildPublishedStrip() {
    const style = document.createElement('style');
    style.id = 'lp-strip-style';
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@700&display=swap');
      @keyframes lp-marquee {
        0%   { transform: translateX(0); }
        100% { transform: translateX(-50%); }
      }
      .lp-strip-track { display:flex; gap:20px; will-change:transform; animation:lp-marquee 40s linear infinite; }
      .lp-strip-track:hover { animation-play-state:paused; }
      .lp-strip-item { flex:0 0 auto; display:flex; flex-direction:column; align-items:center; cursor:pointer; transition:opacity .2s; }
      .lp-strip-item:hover { opacity:.82; }
      .lp-strip-label {
        color:#FFFFFF;
        font-family:'Montserrat',sans-serif;
        font-weight:700;
        font-size:12px;
        padding:0 4px 6px;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        max-width:600px;
        text-align:center;
      }
      .lp-strip-thumb { height:356px; width:auto; display:block; object-fit:contain; }
      .lp-strip-placeholder {
        width:304px; height:456px;
        background:rgba(255,255,255,0.08);
        display:flex; align-items:center; justify-content:center;
        color:rgba(255,255,255,0.25); font-size:40px;
      }
    `;
    document.head.appendChild(style);
    this._stripStyle = style;

    const wrap = document.createElement('div');
    wrap.style.cssText = `
      position:absolute;left:0;right:0;top:calc(${((1730+115.1+172.6-23.0)/1571).toFixed(6)} * 100vw);
      overflow:hidden;z-index:9990;
    `;

    const track = document.createElement('div');
    track.className = 'lp-strip-track';
    wrap.appendChild(track);
    document.body.appendChild(wrap);
    this._stripEl = wrap;

    supabase
      .from('gallery')
      .select('name, scene_data')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const rooms = (data || []).filter(row =>
          row.name.includes(':::') && row.scene_data?._meta?.isPublished === true
        );
        if (!rooms.length) { wrap.remove(); return; }

        const buildItem = (room) => {
          const meta = room.scene_data?._meta || {};
          const roomName = meta.roomName || 'Phòng tranh';
          const artistName = meta.artistName || meta.artistId || '';
          const thumbUrl = meta.thumbnailUrl || null;

          const item = document.createElement('div');
          item.className = 'lp-strip-item';

          const lbl = document.createElement('div');
          lbl.className = 'lp-strip-label';
          lbl.textContent = roomName;
          item.appendChild(lbl);

          if (artistName) {
            const artist = document.createElement('div');
            artist.className = 'lp-strip-label';
            artist.textContent = artistName;
            item.appendChild(artist);
          }

          if (thumbUrl) {
            const img = document.createElement('img');
            img.src = thumbUrl;
            img.alt = roomName;
            img.className = 'lp-strip-thumb';
            item.appendChild(img);
          } else {
            const ph = document.createElement('div');
            ph.className = 'lp-strip-placeholder';
            ph.textContent = '🖼';
            item.appendChild(ph);
          }

          item.addEventListener('click', () => {
            this.manager.currentRoom = {
              id: room.name,
              name: roomName,
              artistId: meta.artistId || room.name.split(':::')[0] || '',
              isPublished: true,
            };
            this.manager.navigateTo('viewer');
          });
          return item;
        };

        // Fill track: duplicate enough times for seamless loop (min 2 sets)
        const sets = Math.max(2, Math.ceil(10 / rooms.length) * 2);
        for (let i = 0; i < sets; i++) {
          rooms.forEach(room => track.appendChild(buildItem(room)));
        }

        // Animate speed proportional to content length (px/s ≈ 120)
        requestAnimationFrame(() => {
          const halfW = track.scrollWidth / 2;
          const dur = Math.max(15, halfW / 120);
          track.style.animationDuration = `${dur}s`;
          // Reset to translateX(-50%) endpoint based on actual width
          track.style.setProperty('--lp-half', `${halfW}px`);
          const s = document.getElementById('lp-strip-style');
          if (s) {
            s.textContent = s.textContent.replace(
              'translateX(-50%)',
              `translateX(-${halfW}px)`
            );
          }
        });
      });
  }

  // ── HERO ─────────────────────────────────────────────────────────────────────
  _buildHero(parent) {
    const wrap = document.createElement('div');
    wrap.style.cssText = `
      position:relative;width:100%;
      height:calc(100vh - 90px);
      overflow:hidden;display:flex;align-items:center;
      box-sizing:border-box;
      background:radial-gradient(ellipse 90% 130% at 50% 35%,#2a35e8 0%,#1a1fd4 40%,#0f0fa0 100%);
    `;

    const grid = document.createElement('canvas');
    grid.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;opacity:0.13;';
    wrap.appendChild(grid);

    const makeVig = (side) => {
      const v = document.createElement('div');
      v.style.cssText = `position:absolute;top:0;${side}:0;bottom:0;width:22%;
        background:linear-gradient(to ${side==='left'?'right':'left'},rgba(215,220,255,0.82) 0%,transparent 100%);
        pointer-events:none;z-index:0;`;
      return v;
    };
    wrap.appendChild(makeVig('left'));
    wrap.appendChild(makeVig('right'));

    const content = document.createElement('div');
    content.style.cssText = `position:relative;z-index:1;display:flex;align-items:center;
      width:100%;max-width:1300px;margin:0 auto;padding:0 80px;box-sizing:border-box;`;
    content.appendChild(this._buildLeft());
    content.appendChild(this._buildRight());
    wrap.appendChild(content);
    parent.appendChild(wrap);

    requestAnimationFrame(() => {
      const w = wrap.offsetWidth || innerWidth;
      const h = wrap.offsetHeight || innerHeight;
      grid.width = w; grid.height = h;
      const ctx = grid.getContext('2d');
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.8;
      for (let x = 0; x <= w; x += 60) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
      for (let y = 0; y <= h; y += 60) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
    });
  }

  _buildLeft() {
    const col = document.createElement('div');
    col.style.cssText = 'flex:0 0 50%;display:flex;flex-direction:column;gap:28px;';

    const titleWrap = document.createElement('div');
    const line1 = document.createElement('div');
    line1.textContent = 'CREATE YOUR';
    line1.style.cssText = `color:#fff;font-family:'Arial Black',Arial,sans-serif;
      font-size:clamp(38px,4.5vw,66px);font-weight:900;line-height:1;
      letter-spacing:0.06em;text-transform:uppercase;`;

    const line2 = document.createElement('div');
    line2.textContent = 'STORY';
    line2.style.cssText = `color:#c8e630;font-family:'Arial Black',Arial,sans-serif;
      font-size:clamp(70px,9.5vw,128px);font-weight:900;line-height:0.88;
      letter-spacing:0.02em;text-transform:uppercase;
      text-shadow:4px 6px 0px rgba(0,0,0,0.22);margin-top:-4px;`;

    titleWrap.appendChild(line1);
    titleWrap.appendChild(line2);

    const sub = document.createElement('p');
    sub.textContent = 'lời chào ngắn j đấy t chưa nghĩ ra, kiểu cho nó dài ra đến đây luôn nhé';
    sub.style.cssText = `color:rgba(255,255,255,0.62);font-family:monospace;font-size:14px;
      line-height:1.78;margin:0;max-width:420px;`;

    const ctaBtn = document.createElement('button');
    ctaBtn.style.cssText = 'background:none;border:none;padding:0;cursor:pointer;align-self:flex-start;transition:transform 0.2s,filter 0.2s;';
    const ctaImg = document.createElement('img');
    ctaImg.src = '/landingpage/cta.svg';
    ctaImg.alt = 'BẮT ĐẦU XÂY PHÒNG NGAY';
    ctaImg.style.cssText = 'height:57px;width:auto;display:block;';
    ctaBtn.appendChild(ctaImg);
    ctaBtn.addEventListener('mouseenter', () => { ctaBtn.style.transform='scale(1.05)'; ctaBtn.style.filter='brightness(1.12)'; });
    ctaBtn.addEventListener('mouseleave', () => { ctaBtn.style.transform='scale(1)'; ctaBtn.style.filter='none'; });
    ctaBtn.addEventListener('click', () => this.manager.navigateTo(this.manager.auth.isLoggedIn ? 'studio' : 'register'));

    col.appendChild(titleWrap);
    col.appendChild(sub);
    col.appendChild(ctaBtn);
    return col;
  }

  _buildRight() {
    const col = document.createElement('div');
    col.style.cssText = 'flex:0 0 50%;display:flex;justify-content:center;align-items:center;';
    col.innerHTML = _illustrationSVG();
    return col;
  }

  // ── GET TO KNOW ───────────────────────────────────────────────────────────────
  _buildGetToKnow(parent) {
    const section = document.createElement('div');
    section.style.cssText = 'width:100%;background:#fff;padding:72px 0 56px;text-align:center;overflow:hidden;';

    const heading = document.createElement('div');
    heading.textContent = 'GET TO KNOW';
    heading.style.cssText = `font-family:'Arial Black',Arial,sans-serif;font-size:clamp(28px,4.2vw,52px);
      font-weight:900;color:#1a1fd4;letter-spacing:0.1em;text-transform:uppercase;
      line-height:1;margin-bottom:8px;`;
    section.appendChild(heading);

    const pillRow = document.createElement('div');
    pillRow.style.cssText = 'display:flex;justify-content:center;margin-bottom:44px;';
    const pill = document.createElement('div');
    pill.style.cssText = 'display:inline-flex;align-items:center;border:4px solid #1a1fd4;border-radius:999px;padding:6px 36px;';
    pill.innerHTML = `<span style="font-family:'Arial Black',Arial,sans-serif;font-size:clamp(32px,5.5vw,64px);
      font-weight:900;color:#1a1fd4;letter-spacing:0.04em;text-transform:uppercase;
      display:flex;align-items:center;gap:4px;line-height:1;">
      CREAT<span style="display:inline-block;width:.7em;height:.7em;border-radius:50%;
        background:#1a1fd4;flex-shrink:0;position:relative;top:.05em;"></span>RY
    </span>`;
    pillRow.appendChild(pill);
    section.appendChild(pillRow);

    const row = document.createElement('div');
    row.style.cssText = `display:flex;align-items:flex-start;justify-content:center;
      max-width:1160px;margin:0 auto;padding:0 40px;gap:28px;box-sizing:border-box;`;

    const leftCol = document.createElement('div');
    leftCol.style.cssText = 'flex:0 0 190px;text-align:left;margin-top:90px;';
    leftCol.innerHTML = `
      <div style="display:inline-block;background:#1a1fd4;color:#c8e630;
        font-family:'Arial Black',Arial,sans-serif;font-weight:900;font-size:17px;
        padding:3px 14px;border-radius:8px;margin-bottom:14px;">+10pt</div>
      <p style="font-size:12px;color:#2a2860;line-height:1.85;margin:0;font-family:monospace;">
        nhét thêm ở cạnh này nếu muốn, maybe nói sơ qua về who is it for,
        what should it be used for, etc.
      </p>`;

    const houseCol = document.createElement('div');
    houseCol.style.cssText = 'flex:0 0 480px;position:relative;';
    const heartsEl = document.createElement('div');
    heartsEl.style.cssText = 'position:absolute;top:-4px;left:50%;transform:translateX(-50%);display:flex;gap:5px;z-index:2;';
    heartsEl.innerHTML = '<span style="color:#ff5fae;font-size:22px;line-height:1;">♥</span>'.repeat(3);
    houseCol.appendChild(heartsEl);
    const houseSvg = document.createElement('div');
    houseSvg.innerHTML = _houseSVG();
    houseCol.appendChild(houseSvg);

    const rightCol = document.createElement('div');
    rightCol.style.cssText = 'flex:0 0 190px;text-align:left;margin-top:90px;';
    rightCol.innerHTML = `<p style="font-size:12px;color:#2a2860;line-height:1.85;margin:0;font-family:monospace;">
      nhét thêm ở cạnh này nếu muốn, maybe nói sơ qua về who is it for,
      what should it be used for, etc.</p>`;

    row.appendChild(leftCol);
    row.appendChild(houseCol);
    row.appendChild(rightCol);
    section.appendChild(row);

    const note = document.createElement('p');
    note.textContent = 'xong coi cái này là mặt cắt bên trong ngôi nhà, nhìn từ 1 bên, chứa hành lang có các cánh cửa chạy chạy y nút "KHÁM PHÁ" (sau thay cái này bằng description j đây cho section này)';
    note.style.cssText = 'max-width:660px;margin:32px auto 0;padding:0 20px;font-size:12px;color:#7a7a9a;line-height:1.75;text-align:center;font-family:monospace;';
    section.appendChild(note);

    parent.appendChild(section);
  }

  // ── INTERIOR CROSS-SECTION ────────────────────────────────────────────────────
  _buildInteriorSection(parent) {
    const section = document.createElement('div');
    section.style.cssText = `width:100%;
      background:radial-gradient(ellipse 100% 140% at 50% 40%,#2a35e8 0%,#1a1fd4 50%,#0f0fa0 100%);
      padding:56px 0 64px;text-align:center;position:relative;overflow:hidden;`;

    const gridC = document.createElement('canvas');
    gridC.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;opacity:0.09;';
    section.appendChild(gridC);

    const illus = document.createElement('div');
    illus.style.cssText = 'position:relative;z-index:1;';
    illus.innerHTML = _interiorSVG();
    section.appendChild(illus);

    const btn = _makeOutlineBtn('KHÁM PHÁ', '#00d4c8', '#0f0fa0');
    btn.style.marginTop = '32px';
    btn.style.position = 'relative';
    btn.style.zIndex = '1';
    btn.style.display = 'block';
    btn.style.margin = '40px auto 0';
    btn.addEventListener('click', () => this.manager.navigateTo('explore'));
    section.appendChild(btn);

    parent.appendChild(section);

    requestAnimationFrame(() => {
      const w = section.offsetWidth || innerWidth;
      const h = section.offsetHeight || 400;
      gridC.width = w; gridC.height = h;
      const ctx = gridC.getContext('2d');
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.8;
      for (let x = 0; x <= w; x += 60) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
      for (let y = 0; y <= h; y += 60) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
    });
  }

  // ── GALLERY CAROUSEL ──────────────────────────────────────────────────────────
  _buildGalleryCarousel(parent) {
    const section = document.createElement('div');
    section.style.cssText = 'width:100%;background:#f5f5f8;padding:64px 0 56px;text-align:center;';

    const track = document.createElement('div');
    track.style.cssText = `display:flex;gap:16px;
      padding-bottom:24px;
      overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;
      padding-left:max(24px,calc((100vw - 1160px)/2));padding-right:24px;`;

    const artworks = [
      { title: 'Hoa Vàng Rực Rỡ',  artist: 'Mai Hoa',    idx: 0 },
      { title: 'Ánh Trăng Đêm',     artist: 'Nguyệt Cầm', idx: 1 },
      { title: 'Bướm Muôn Màu',     artist: 'Phú Quý',    idx: 2 },
      { title: 'Chân Dung Xuân',    artist: 'Lan Anh',    idx: 3 },
      { title: 'Đêm Neon',          artist: 'Cyber Art',  idx: 4 },
    ];

    artworks.forEach(({ title, artist, idx }) => {
      const card = document.createElement('div');
      card.style.cssText = `flex:0 0 220px;border-radius:12px;overflow:hidden;
        scroll-snap-align:start;cursor:pointer;
        transition:transform 0.22s;box-shadow:0 4px 20px rgba(0,0,0,0.12);`;
      card.addEventListener('mouseenter', () => card.style.transform = 'translateY(-6px)');
      card.addEventListener('mouseleave', () => card.style.transform = 'translateY(0)');
      card.addEventListener('click', () => this.manager.navigateTo('explore'));

      const art = document.createElement('div');
      art.style.cssText = 'width:100%;height:260px;position:relative;overflow:hidden;';
      art.innerHTML = _artworkSVG(idx);

      const label = document.createElement('div');
      label.style.cssText = 'background:#fff;padding:12px 14px;text-align:left;';
      label.innerHTML = `<div style="font-size:10px;color:#aaa;font-family:monospace;margin-bottom:2px;">artist</div>
        <div style="font-size:13px;font-weight:700;color:#1a1a3a;">${title}</div>
        <div style="font-size:11px;color:#666;font-family:monospace;">— ${artist}</div>`;

      card.appendChild(art);
      card.appendChild(label);
      track.appendChild(card);
    });

    section.appendChild(track);

    const ctaWrap = document.createElement('div');
    ctaWrap.style.cssText = 'margin-top:16px;display:flex;justify-content:center;';
    const cta = _makeOutlineBtn('KHÁM PHÁ NGAY', '#1a1fd4', '#fff');
    cta.addEventListener('click', () => this.manager.navigateTo('explore'));
    ctaWrap.appendChild(cta);
    section.appendChild(ctaWrap);

    parent.appendChild(section);
  }

  // ── STUDIO + FORUM CTA CARDS ──────────────────────────────────────────────────
  _buildCTACards(parent) {
    _buildDecorativeBorder(parent);

    const section = document.createElement('div');
    section.style.cssText = 'width:100%;background:#edf0f7;padding:56px 0 64px;';

    const inner = document.createElement('div');
    inner.style.cssText = `max-width:1160px;margin:0 auto;padding:0 40px;
      display:flex;gap:24px;box-sizing:border-box;align-items:stretch;`;

    // Left card: Studio 3D
    const leftCard = document.createElement('div');
    leftCard.style.cssText = `flex:1;min-height:320px;border-radius:24px;padding:40px 36px;
      background:linear-gradient(135deg,#0d1240 0%,#1a2fe8 60%,#0d1240 100%);
      color:#fff;display:flex;flex-direction:column;gap:18px;position:relative;overflow:hidden;`;
    leftCard.innerHTML = `<div style="position:absolute;inset:0;pointer-events:none;opacity:0.07;
      background:repeating-linear-gradient(0deg,transparent,transparent 59px,rgba(255,255,255,.5) 59px,rgba(255,255,255,.5) 60px),
      repeating-linear-gradient(90deg,transparent,transparent 59px,rgba(255,255,255,.5) 59px,rgba(255,255,255,.5) 60px);"></div>`;

    const leftText = document.createElement('div');
    leftText.style.cssText = 'position:relative;z-index:1;display:flex;flex-direction:column;gap:10px;flex:1;';
    leftText.innerHTML = `
      <div style="font-family:monospace;font-size:13px;color:rgba(255,255,255,0.65);line-height:1.6;">
        TỰ TAY TẠO NÊN CĂN PHÒNG CỦA BẠN CÙNG
      </div>
      <div style="font-family:'Arial Black',Arial,sans-serif;font-size:clamp(28px,3.5vw,46px);
        font-weight:900;color:#fff;line-height:1;letter-spacing:0.04em;text-transform:uppercase;">
        STUDIO 3D
      </div>
      <div style="flex:1;display:flex;align-items:flex-end;margin-top:8px;">
        <div style="font-family:monospace;font-size:12px;color:rgba(255,255,255,0.35);
          font-style:italic;border:1px dashed rgba(255,255,255,0.2);
          padding:18px 22px;border-radius:12px;width:100%;box-sizing:border-box;text-align:center;">
          SAU CHO CÁI ẢNH DEMO PHÒNG ĐƯỢC CHĂM CHÚT VÀO ĐÂY
        </div>
      </div>`;

    const studioBtn = _makeOutlineBtn('XÂY PHÒNG NGAY', '#00d4c8', '#0d1240');
    studioBtn.style.cssText += 'position:relative;z-index:1;align-self:flex-start;margin-top:4px;';
    studioBtn.addEventListener('click', () => this.manager.navigateTo(this.manager.auth.isLoggedIn ? 'studio' : 'register'));

    leftCard.appendChild(leftText);
    leftCard.appendChild(studioBtn);

    // Right card: Forum
    const rightCard = document.createElement('div');
    rightCard.style.cssText = `flex:0 0 360px;min-height:320px;border-radius:24px;
      background:linear-gradient(160deg,#1a1a3a 0%,#2a2a5a 100%);
      color:#fff;display:flex;flex-direction:column;gap:18px;
      position:relative;overflow:hidden;padding:40px 36px;`;

    const eyeEl = document.createElement('div');
    eyeEl.style.cssText = 'position:absolute;top:0;right:0;bottom:0;width:58%;overflow:hidden;border-radius:0 24px 24px 0;';
    eyeEl.innerHTML = _eyeArtSVG();
    rightCard.appendChild(eyeEl);

    const rightText = document.createElement('div');
    rightText.style.cssText = 'position:relative;z-index:1;display:flex;flex-direction:column;gap:12px;flex:1;max-width:56%;';
    rightText.innerHTML = `<div style="font-family:'Arial Black',Arial,sans-serif;
      font-size:clamp(15px,2vw,21px);font-weight:900;color:#fff;
      line-height:1.3;text-transform:uppercase;">
      KẾT NỐI VỚI NHỮNG NGƯỜI TRẺ YÊU THÍCH VÀ SÁNG TẠO NGHỆ THUẬT
    </div>`;

    const forumBtn = _makeOutlineBtn('ĐẾN DIỄN ĐÀN', '#00d4c8', '#1a1a3a');
    forumBtn.style.cssText += 'position:relative;z-index:1;align-self:flex-start;margin-top:auto;';
    forumBtn.addEventListener('click', () => this.manager.navigateTo('forum'));

    rightCard.appendChild(rightText);
    rightCard.appendChild(forumBtn);

    inner.appendChild(leftCard);
    inner.appendChild(rightCard);
    section.appendChild(inner);
    parent.appendChild(section);
  }

  // ── FEATURES TEASER ───────────────────────────────────────────────────────────
  _buildFeaturesTeaser(parent) {
    const section = document.createElement('div');
    section.style.cssText = 'width:100%;background:#fff;padding:60px 24px;text-align:center;';

    const text = document.createElement('div');
    text.innerHTML = 'VÀ CÒN RẤT NHIỀU TÍNH NĂNG KHÁC<br>ĐANG ĐƯỢC PHÁT TRIỂN CHỜ BẠN KHÁM PHÁ!';
    text.style.cssText = `font-family:'Arial Black',Arial,sans-serif;
      font-size:clamp(16px,2.5vw,30px);font-weight:900;color:#1a1fd4;
      letter-spacing:0.04em;text-transform:uppercase;line-height:1.45;
      max-width:800px;margin:0 auto;`;
    section.appendChild(text);

    parent.appendChild(section);
    _buildDecorativeBorder(parent);
  }

  dispose() {
    document.body.style.backgroundImage    = '';
    document.body.style.backgroundSize     = '';
    document.body.style.backgroundPosition = '';
    document.body.style.backgroundRepeat   = '';
    (this._fixedNavBtns || []).forEach(btn => btn.remove());
    this._fixedNavBtns = [];
    if (this._stripEl)    { this._stripEl.remove();    this._stripEl = null; }
    if (this._stripStyle) { this._stripStyle.remove(); this._stripStyle = null; }
    super.dispose();
  }

  update() {}
}

// ── DECORATIVE BORDER (module-level helper) ────────────────────────────────────
function _buildDecorativeBorder(parent) {
  const el = document.createElement('div');
  el.style.cssText = `width:100%;height:36px;overflow:hidden;flex-shrink:0;
    background:repeating-linear-gradient(90deg,#00c4ba 0px,#00c4ba 18px,#00aba3 18px,#00aba3 36px);`;
  // Top jagged edge to separate from section above
  const jagged = document.createElement('div');
  jagged.style.cssText = `width:100%;height:10px;
    background:repeating-linear-gradient(-45deg,
      #edf0f7 0px,#edf0f7 9px,transparent 9px,transparent 18px);`;
  el.appendChild(jagged);
  parent.appendChild(el);
}

function _makeOutlineBtn(label, borderColor, hoverBg) {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.style.cssText = `background:none;border:2.5px solid ${borderColor};color:${borderColor};
    font-family:'Arial Black',Arial,sans-serif;font-weight:900;font-size:13px;
    letter-spacing:0.1em;text-transform:uppercase;padding:12px 32px;
    border-radius:999px;cursor:pointer;display:inline-block;
    transition:background 0.18s,color 0.18s,transform 0.18s;`;
  btn.addEventListener('mouseenter', () => {
    btn.style.background = borderColor;
    btn.style.color = hoverBg;
    btn.style.transform = 'scale(1.05)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'none';
    btn.style.color = borderColor;
    btn.style.transform = 'scale(1)';
  });
  return btn;
}

// ── SVG HELPERS ───────────────────────────────────────────────────────────────

function _illustrationSVG() {
  return `<svg width="480" height="380" viewBox="0 0 480 380" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="lp_ped1" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#6e82f0"/><stop offset="100%" stop-color="#2e40bb"/>
    </linearGradient>
    <linearGradient id="lp_ped2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#8092ff"/><stop offset="100%" stop-color="#3e52cc"/>
    </linearGradient>
    <linearGradient id="lp_ped3" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#9aaaff"/><stop offset="100%" stop-color="#5868ee"/>
    </linearGradient>
    <radialGradient id="lp_pedTop" cx="40%" cy="35%" r="70%">
      <stop offset="0%" stop-color="#d0daff"/><stop offset="100%" stop-color="#8090ee"/>
    </radialGradient>
    <linearGradient id="lp_glow" x1="0.5" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#7799ff" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#7799ff" stop-opacity="0"/>
    </linearGradient>
    <filter id="lp_shadow" x="-25%" y="-20%" width="150%" height="160%">
      <feDropShadow dx="0" dy="14" stdDeviation="20" flood-color="#001088" flood-opacity="0.55"/>
    </filter>
  </defs>
  <ellipse cx="240" cy="374" rx="82" ry="9" fill="rgba(0,0,60,0.32)"/>
  <path d="M170 356 L310 356 L294 368 L186 368 Z" fill="url(#lp_ped1)"/>
  <path d="M170 356 L310 356 L304 348 L176 348 Z" fill="#38508a"/>
  <path d="M178 348 L302 348 L290 334 L190 334 Z" fill="url(#lp_ped2)"/>
  <path d="M178 348 L302 348 L296 340 L184 340 Z" fill="#485ec0"/>
  <path d="M188 334 L292 334 L280 318 L200 318 Z" fill="url(#lp_ped3)"/>
  <path d="M188 334 L292 334 L286 326 L194 326 Z" fill="#5870e0"/>
  <ellipse cx="240" cy="318" rx="48" ry="8" fill="url(#lp_pedTop)"/>
  <rect x="228" y="288" width="24" height="32" fill="url(#lp_glow)"/>
  <ellipse cx="240" cy="316" rx="36" ry="5" fill="#6680ff" opacity="0.65"/>
  <rect x="158" y="108" width="164" height="186" rx="20" fill="white" filter="url(#lp_shadow)"/>
  <rect x="173" y="122" width="134" height="122" rx="10" fill="#dce5ff"/>
  <path d="M193 226 L228 180 L245 203 L263 170 L289 226 Z" fill="#b0bdff" opacity="0.55"/>
  <path d="M240 155 L249 175 L240 195 L231 175 Z" fill="#1a2eee" opacity="0.75"/>
  <path d="M218 175 L238 167 L258 175 L238 183 Z" fill="#1a2eee" opacity="0.75"/>
  <rect x="173" y="254" width="55" height="3" rx="1.5" fill="#dee2f5"/>
  <rect x="173" y="262" width="90" height="3" rx="1.5" fill="#e8ebf8"/>
  <rect x="173" y="270" width="42" height="3" rx="1.5" fill="#e8ebf8"/>
  <rect x="173" y="278" width="72" height="3" rx="1.5" fill="#eceef8"/>
  <g transform="translate(335,115)">
    <path d="M0 -26 C5 -9 9 -5 26 0 C9 5 5 9 0 26 C-5 9 -9 5 -26 0 C-9 -5 -5 -9 0 -26 Z" fill="#ff5fae"/>
  </g>
  <g transform="translate(346,216)">
    <path d="M0 -30 L4.5 -11 L16 -21 L6 -5 L26 0 L6 5 L16 21 L4.5 11 L0 30
             L-4.5 11 L-16 21 L-6 5 L-26 0 L-6 -5 L-16 -21 L-4.5 -11 Z" fill="#00d4c8"/>
  </g>
  <g transform="translate(416,184)">
    <path d="M0 -30 L7.5 -10 L29 -10 L13 4 L19 26 L0 14 L-19 26 L-13 4 L-29 -10 L-7.5 -10 Z" fill="#ffb020"/>
  </g>
  <g transform="translate(374,288)">
    <rect x="-5" y="-14" width="10" height="10" fill="#ffdd00" rx="1.5"/>
    <rect x="-5" y="4" width="10" height="10" fill="#ffdd00" rx="1.5"/>
    <rect x="-14" y="-5" width="10" height="10" fill="#ffdd00" rx="1.5"/>
    <rect x="4" y="-5" width="10" height="10" fill="#ffdd00" rx="1.5"/>
  </g>
  <g transform="translate(150,128)">
    <path d="M0 -9 L1.6 -1.6 L9 0 L1.6 1.6 L0 9 L-1.6 1.6 L-9 0 L-1.6 -1.6 Z" fill="white" opacity="0.85"/>
  </g>
  <g transform="translate(327,160)">
    <path d="M0 -7 L1.2 -1.2 L7 0 L1.2 1.2 L0 7 L-1.2 1.2 L-7 0 L-1.2 -1.2 Z" fill="white" opacity="0.65"/>
  </g>
</svg>`;
}

function _houseSVG() {
  return `<svg width="480" height="440" viewBox="0 0 480 440" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="houseClip">
      <polygon points="240,28 436,182 436,408 44,408 44,182"/>
    </clipPath>
  </defs>
  <!-- Shadow -->
  <ellipse cx="240" cy="432" rx="188" ry="10" fill="rgba(26,31,212,0.14)"/>
  <!-- House body -->
  <polygon points="240,28 436,182 436,408 44,408 44,182" fill="#1a1fd4"/>
  <!-- Roof highlight -->
  <polygon points="240,28 436,182 406,182 240,48" fill="#2a35e8" opacity="0.55"/>
  <!-- Wall base shadow -->
  <rect x="44" y="380" width="392" height="28" rx="0" fill="#0f0fa0" opacity="0.4" clip-path="url(#houseClip)"/>
  <!-- Left window -->
  <rect x="72" y="218" width="96" height="80" rx="5" fill="#c8d8ff" opacity="0.72"/>
  <line x1="120" y1="218" x2="120" y2="298" stroke="#1a1fd4" stroke-width="2"/>
  <line x1="72"  y1="258" x2="168" y2="258" stroke="#1a1fd4" stroke-width="2"/>
  <!-- Right window -->
  <rect x="312" y="218" width="96" height="80" rx="5" fill="#c8d8ff" opacity="0.72"/>
  <line x1="360" y1="218" x2="360" y2="298" stroke="#1a1fd4" stroke-width="2"/>
  <line x1="312" y1="258" x2="408" y2="258" stroke="#1a1fd4" stroke-width="2"/>
  <!-- Door -->
  <rect x="198" y="318" width="84" height="88" rx="7 7 4 4" fill="#c8d8ff" opacity="0.78"/>
  <path d="M198,340 Q240,314 282,340" fill="#b0c4f8" opacity="0.7"/>
  <circle cx="272" cy="364" r="4" fill="#1a1fd4"/>
  <!-- Chimney -->
  <rect x="310" y="80" width="26" height="56" rx="3" fill="#1010a0"/>
  <circle cx="323" cy="73" r="7" fill="rgba(255,255,255,0.18)"/>
  <circle cx="327" cy="62" r="5" fill="rgba(255,255,255,0.12)"/>
  <circle cx="320" cy="52" r="3" fill="rgba(255,255,255,0.08)"/>
  <!-- Text content inside house (center strip) -->
  <text x="240" y="197" text-anchor="middle" font-family="monospace" font-size="11.5" fill="rgba(255,255,255,0.92)">description về nền tảng nhét ở trong cái nhà này</text>
  <line x1="155" y1="206" x2="325" y2="206" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
  <text x="240" y="224" text-anchor="middle" font-family="monospace" font-size="10.5" fill="rgba(255,255,255,0.78)">thả nó xuống dần theo dạng bậc thang</text>
  <text x="240" y="242" text-anchor="middle" font-family="monospace" font-size="10.5" fill="#c8e630" font-weight="bold">đoán nào cần highlight thì đề như vầy là được nhe</text>
  <text x="240" y="262" text-anchor="middle" font-family="monospace" font-size="10" fill="rgba(255,255,255,0.65)">thả nó xuống dần theo dạng bậc thang như này</text>
  <text x="240" y="278" text-anchor="middle" font-family="monospace" font-size="10" fill="rgba(255,255,255,0.65)">cho đến khi nào full hết nội dung là được</text>
  <!-- Decorative stars beside house -->
  <g transform="translate(26,192)">
    <path d="M0,-9 L1.5,-1.5 L9,0 L1.5,1.5 L0,9 L-1.5,1.5 L-9,0 L-1.5,-1.5 Z" fill="#ff5fae" opacity="0.8"/>
  </g>
  <g transform="translate(454,192)">
    <path d="M0,-9 L1.5,-1.5 L9,0 L1.5,1.5 L0,9 L-1.5,1.5 L-9,0 L-1.5,-1.5 Z" fill="#ff5fae" opacity="0.8"/>
  </g>
  <g transform="translate(18,310)">
    <rect x="-4" y="-12" width="8" height="8" fill="#ffdd00" rx="1" opacity="0.7"/>
    <rect x="-4" y="4"   width="8" height="8" fill="#ffdd00" rx="1" opacity="0.7"/>
    <rect x="-12" y="-4" width="8" height="8" fill="#ffdd00" rx="1" opacity="0.7"/>
    <rect x="4"  y="-4"  width="8" height="8" fill="#ffdd00" rx="1" opacity="0.7"/>
  </g>
</svg>`;
}

function _interiorSVG() {
  return `<svg width="960" height="300" viewBox="0 0 960 300" fill="none" xmlns="http://www.w3.org/2000/svg"
    style="max-width:100%;display:block;margin:0 auto;">
  <defs>
    <linearGradient id="floorG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2030d8"/><stop offset="100%" stop-color="#1010a0"/>
    </linearGradient>
    <linearGradient id="ceilG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1010a0"/><stop offset="100%" stop-color="#2030d8"/>
    </linearGradient>
    <linearGradient id="doorGlow" x1="0.5" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#4060ff" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="#2030c0" stop-opacity="0.2"/>
    </linearGradient>
  </defs>
  <!-- Ceiling -->
  <rect x="0" y="0" width="960" height="48" fill="url(#ceilG)"/>
  <!-- Floor -->
  <rect x="0" y="248" width="960" height="52" fill="url(#floorG)"/>
  <!-- Floor reflection line -->
  <line x1="0" y1="248" x2="960" y2="248" stroke="rgba(100,130,255,0.4)" stroke-width="1.5"/>
  <!-- Wall background -->
  <rect x="0" y="48" width="960" height="200" fill="#1825d4"/>
  <!-- Wall grid lines -->
  <line x1="0" y1="98"  x2="960" y2="98"  stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
  <line x1="0" y1="148" x2="960" y2="148" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
  <line x1="0" y1="198" x2="960" y2="198" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
  <!-- Gallery doors / archways -->
  <!-- Door 1 -->
  <rect x="60"  y="68" width="120" height="180" rx="6" fill="url(#doorGlow)" stroke="rgba(150,180,255,0.4)" stroke-width="1.5"/>
  <rect x="72"  y="78" width="96"  height="158" rx="4" fill="#1030e8" opacity="0.6"/>
  <rect x="84"  y="90" width="72"  height="50"  rx="3" fill="#c8d0ff" opacity="0.25"/>
  <rect x="84"  y="150" width="72" height="50"  rx="3" fill="#c8d0ff" opacity="0.18"/>
  <text x="120" y="258" text-anchor="middle" font-family="'Arial Black',Arial,sans-serif" font-size="9" fill="rgba(0,212,200,0.8)" letter-spacing="1">KHÁM PHÁ</text>
  <!-- Door 2 -->
  <rect x="220" y="58" width="140" height="190" rx="6" fill="url(#doorGlow)" stroke="rgba(150,180,255,0.4)" stroke-width="1.5"/>
  <rect x="234" y="70" width="112" height="166" rx="4" fill="#1030e8" opacity="0.6"/>
  <rect x="248" y="82" width="84"  height="60"  rx="3" fill="#ffd080" opacity="0.2"/>
  <rect x="248" y="152" width="84" height="50"  rx="3" fill="#c8d0ff" opacity="0.18"/>
  <text x="290" y="258" text-anchor="middle" font-family="'Arial Black',Arial,sans-serif" font-size="9" fill="rgba(0,212,200,0.8)" letter-spacing="1">KHÁM PHÁ</text>
  <!-- Door 3 (center, largest) -->
  <rect x="400" y="42" width="160" height="206" rx="7" fill="url(#doorGlow)" stroke="rgba(180,200,255,0.55)" stroke-width="2"/>
  <rect x="416" y="56" width="128" height="178" rx="5" fill="#1430f0" opacity="0.5"/>
  <rect x="430" y="70" width="100" height="68"  rx="3" fill="#ffa050" opacity="0.22"/>
  <rect x="430" y="148" width="100" height="60" rx="3" fill="#80b0ff" opacity="0.2"/>
  <text x="480" y="258" text-anchor="middle" font-family="'Arial Black',Arial,sans-serif" font-size="9" fill="rgba(0,212,200,0.95)" letter-spacing="1">KHÁM PHÁ</text>
  <!-- Door 4 -->
  <rect x="600" y="58" width="140" height="190" rx="6" fill="url(#doorGlow)" stroke="rgba(150,180,255,0.4)" stroke-width="1.5"/>
  <rect x="614" y="70" width="112" height="166" rx="4" fill="#1030e8" opacity="0.6"/>
  <rect x="628" y="82" width="84"  height="55"  rx="3" fill="#d0ffd8" opacity="0.18"/>
  <rect x="628" y="148" width="84" height="50"  rx="3" fill="#c8d0ff" opacity="0.2"/>
  <text x="670" y="258" text-anchor="middle" font-family="'Arial Black',Arial,sans-serif" font-size="9" fill="rgba(0,212,200,0.8)" letter-spacing="1">KHÁM PHÁ</text>
  <!-- Door 5 -->
  <rect x="780" y="68" width="120" height="180" rx="6" fill="url(#doorGlow)" stroke="rgba(150,180,255,0.4)" stroke-width="1.5"/>
  <rect x="792" y="78" width="96"  height="158" rx="4" fill="#1030e8" opacity="0.6"/>
  <rect x="804" y="90" width="72"  height="50"  rx="3" fill="#ffd0e0" opacity="0.2"/>
  <rect x="804" y="150" width="72" height="50"  rx="3" fill="#c8d0ff" opacity="0.18"/>
  <text x="840" y="258" text-anchor="middle" font-family="'Arial Black',Arial,sans-serif" font-size="9" fill="rgba(0,212,200,0.8)" letter-spacing="1">KHÁM PHÁ</text>
  <!-- Ceiling light strips -->
  <line x1="60"  y1="48" x2="180" y2="48" stroke="rgba(180,200,255,0.5)" stroke-width="3"/>
  <line x1="220" y1="48" x2="360" y2="48" stroke="rgba(180,200,255,0.5)" stroke-width="3"/>
  <line x1="400" y1="48" x2="560" y2="48" stroke="rgba(200,220,255,0.6)" stroke-width="4"/>
  <line x1="600" y1="48" x2="740" y2="48" stroke="rgba(180,200,255,0.5)" stroke-width="3"/>
  <line x1="780" y1="48" x2="900" y2="48" stroke="rgba(180,200,255,0.5)" stroke-width="3"/>
  <!-- Floor reflection of doors -->
  <rect x="60"  y="248" width="120" height="20" rx="2" fill="rgba(64,96,255,0.15)"/>
  <rect x="220" y="248" width="140" height="20" rx="2" fill="rgba(64,96,255,0.15)"/>
  <rect x="400" y="248" width="160" height="22" rx="2" fill="rgba(64,96,255,0.2)"/>
  <rect x="600" y="248" width="140" height="20" rx="2" fill="rgba(64,96,255,0.15)"/>
  <rect x="780" y="248" width="120" height="20" rx="2" fill="rgba(64,96,255,0.15)"/>
</svg>`;
}

function _artworkSVG(idx) {
  const palettes = [
    // 0: Yellow flowers on dark
    { bg: ['#1a0800','#3d1500'], shapes: `
      <circle cx="110" cy="180" r="60" fill="#ff8800" opacity="0.3"/>
      <circle cx="110" cy="130" r="18" fill="#ffcc00"/>
      <circle cx="80"  cy="155" r="14" fill="#ffaa00"/>
      <circle cx="140" cy="148" r="16" fill="#ffdd00"/>
      <circle cx="110" cy="90"  r="12" fill="#ffcc00"/>
      <line x1="110" y1="108" x2="110" y2="200" stroke="#4a2000" stroke-width="3"/>
      <line x1="80"  y1="141" x2="80"  y2="200" stroke="#4a2000" stroke-width="2"/>
      <line x1="140" y1="134" x2="140" y2="200" stroke="#4a2000" stroke-width="2"/>
    `},
    // 1: Anime girl on light purple
    { bg: ['#2d0050','#6020a0'], shapes: `
      <ellipse cx="110" cy="100" rx="40" ry="48" fill="#ffd0b0"/>
      <ellipse cx="110" cy="82"  rx="44" ry="36" fill="#4a00c0"/>
      <circle  cx="94"  cy="108" r="5"  fill="#2a2080"/>
      <circle  cx="126" cy="108" r="5"  fill="#2a2080"/>
      <path d="M100,120 Q110,130 120,120" stroke="#c06080" stroke-width="2" fill="none"/>
      <ellipse cx="110" cy="200" rx="50" ry="60" fill="#6030c0" opacity="0.5"/>
    `},
    // 2: Butterfly on blue
    { bg: ['#001840','#0040a0'], shapes: `
      <ellipse cx="80"  cy="110" rx="55" ry="40" fill="#ff5500" opacity="0.8" transform="rotate(-20 80 110)"/>
      <ellipse cx="140" cy="110" rx="55" ry="40" fill="#ff8800" opacity="0.8" transform="rotate(20 140 110)"/>
      <ellipse cx="80"  cy="165" rx="40" ry="30" fill="#cc3300" opacity="0.7" transform="rotate(15 80 165)"/>
      <ellipse cx="140" cy="165" rx="40" ry="30" fill="#ff4400" opacity="0.7" transform="rotate(-15 140 165)"/>
      <ellipse cx="110" cy="130" rx="6"  ry="55" fill="#1a0a00"/>
      <line x1="110" y1="78"  x2="90"  y2="55" stroke="#1a0a00" stroke-width="1.5"/>
      <line x1="110" y1="78"  x2="130" y2="55" stroke="#1a0a00" stroke-width="1.5"/>
    `},
    // 3: Portrait sketch on warm
    { bg: ['#f5e6d3','#d4a870'], shapes: `
      <ellipse cx="110" cy="110" rx="44" ry="52" fill="#e8c090"/>
      <ellipse cx="110" cy="90"  rx="46" ry="30" fill="#8b4513"/>
      <circle  cx="93"  cy="115" r="6"  fill="#3d2010"/>
      <circle  cx="127" cy="115" r="6"  fill="#3d2010"/>
      <path d="M96,132 Q110,144 124,132" stroke="#c06432" stroke-width="2" fill="none"/>
      <ellipse cx="110" cy="195" rx="52" ry="40" fill="#c87840" opacity="0.6"/>
    `},
    // 4: Neon city
    { bg: ['#050510','#0d0d2a'], shapes: `
      <rect x="20"  y="120" width="30" height="140" fill="#0020a0"/>
      <rect x="55"  y="80"  width="25" height="180" fill="#001880"/>
      <rect x="85"  y="100" width="35" height="160" fill="#0028c0"/>
      <rect x="130" y="60"  width="28" height="200" fill="#001470"/>
      <rect x="165" y="90"  width="32" height="170" fill="#002090"/>
      <line x1="0" y1="200" x2="220" y2="200" stroke="#ff00aa" stroke-width="2" opacity="0.7"/>
      <line x1="0" y1="202" x2="220" y2="202" stroke="#ff00aa" stroke-width="1" opacity="0.3"/>
      <rect x="22"  y="125" width="6" height="6" fill="#00ffcc" opacity="0.8"/>
      <rect x="30"  y="135" width="4" height="4" fill="#00ffcc" opacity="0.6"/>
      <rect x="90"  y="110" width="8" height="8" fill="#ffcc00" opacity="0.7"/>
      <rect x="135" y="75"  width="6" height="6" fill="#ff5500" opacity="0.8"/>
      <rect x="167" y="100" width="8" height="4" fill="#00ffcc" opacity="0.7"/>
    `},
  ];
  const p = palettes[idx % palettes.length];
  return `<svg width="220" height="260" viewBox="0 0 220 260" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="art${idx}bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${p.bg[0]}"/>
        <stop offset="100%" stop-color="${p.bg[1]}"/>
      </linearGradient>
    </defs>
    <rect width="220" height="260" fill="url(#art${idx}bg)"/>
    ${p.shapes}
  </svg>`;
}

function _eyeArtSVG() {
  return `<svg width="100%" height="100%" viewBox="0 0 280 320" fill="none" xmlns="http://www.w3.org/2000/svg"
    preserveAspectRatio="xMidYMid slice">
  <defs>
    <radialGradient id="eyeBg" cx="50%" cy="50%" r="65%">
      <stop offset="0%" stop-color="#3a1060"/>
      <stop offset="100%" stop-color="#1a0838"/>
    </radialGradient>
    <radialGradient id="irisG" cx="45%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#ffaa00"/>
      <stop offset="40%" stop-color="#cc6600"/>
      <stop offset="100%" stop-color="#8b3300"/>
    </radialGradient>
  </defs>
  <rect width="280" height="320" fill="url(#eyeBg)"/>
  <!-- Eyelashes top -->
  <path d="M20,140 Q140,60 260,140" stroke="#1a0838" stroke-width="28" fill="none"/>
  <!-- Eyelashes bottom -->
  <path d="M20,180 Q140,260 260,180" stroke="#1a0838" stroke-width="20" fill="none"/>
  <!-- White of eye -->
  <path d="M20,160 Q90,100 140,102 Q190,100 260,160 Q190,220 140,218 Q90,220 20,160 Z" fill="#f5e8ff"/>
  <!-- Iris -->
  <circle cx="140" cy="160" r="46" fill="url(#irisG)"/>
  <!-- Iris detail rings -->
  <circle cx="140" cy="160" r="44" fill="none" stroke="#a05000" stroke-width="1.5" opacity="0.6"/>
  <circle cx="140" cy="160" r="36" fill="none" stroke="#804000" stroke-width="1" opacity="0.5"/>
  <!-- Pupil -->
  <circle cx="140" cy="160" r="22" fill="#100808"/>
  <!-- Highlight -->
  <circle cx="125" cy="148" r="9" fill="rgba(255,255,255,0.7)"/>
  <circle cx="152" cy="168" r="4" fill="rgba(255,255,255,0.35)"/>
  <!-- Eyelash details top -->
  <line x1="80"  y1="108" x2="70"  y2="84"  stroke="#100020" stroke-width="2.5"/>
  <line x1="110" y1="96"  x2="104" y2="70"  stroke="#100020" stroke-width="2.5"/>
  <line x1="140" y1="92"  x2="140" y2="64"  stroke="#100020" stroke-width="2.5"/>
  <line x1="170" y1="96"  x2="176" y2="70"  stroke="#100020" stroke-width="2.5"/>
  <line x1="200" y1="108" x2="210" y2="84"  stroke="#100020" stroke-width="2.5"/>
  <!-- Colorful sparkle accents -->
  <g transform="translate(48,104)">
    <path d="M0,-7 L1.2,-1.2 L7,0 L1.2,1.2 L0,7 L-1.2,1.2 L-7,0 L-1.2,-1.2 Z" fill="#ff5fae"/>
  </g>
  <g transform="translate(232,110)">
    <path d="M0,-6 L1,-1 L6,0 L1,1 L0,6 L-1,1 L-6,0 L-1,-1 Z" fill="#00d4c8"/>
  </g>
  <g transform="translate(140,290)">
    <path d="M0,-10 L1.7,-1.7 L10,0 L1.7,1.7 L0,10 L-1.7,1.7 L-10,0 L-1.7,-1.7 Z" fill="#ffb020"/>
  </g>
</svg>`;
}