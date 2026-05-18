export class Footer {
  constructor(manager) {
    this.manager = manager;
    this._build();
  }

  _build() {
    const el = document.createElement('div');
    el.style.cssText = `
      position: relative;
      width: 100%;
      background: #1a1fd4;
      background-image:
        linear-gradient(135deg, #1a1fd4 0%, #1212a0 60%, #0d0d7a 100%);
      overflow: hidden;
      font-family: monospace;
      user-select: none;
      padding: 48px 64px 40px 64px;
      box-sizing: border-box;
      display: flex;
      align-items: flex-start;
      gap: 0;
    `;
    el.style.display = 'none'; // ẩn mặc định, SceneManager.show() sẽ bật

    // ── Grid blueprint background ─────────────────────────────────────────────
    const gridCanvas = document.createElement('canvas');
    gridCanvas.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      opacity: 0.18;
    `;
    el.appendChild(gridCanvas);

    // Draw grid after appended
    requestAnimationFrame(() => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      gridCanvas.width = w;
      gridCanvas.height = h;
      const ctx = gridCanvas.getContext('2d');
      const step = 40;
      ctx.strokeStyle = '#5566ff';
      ctx.lineWidth = 0.8;
      for (let x = 0; x <= w; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y <= h; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
    });

    // ── Left column ───────────────────────────────────────────────────────────
    const leftCol = document.createElement('div');
    leftCol.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 16px;
      flex: 0 0 340px;
      position: relative;
      z-index: 1;
    `;

    // Logo
    const logo = document.createElement('img');
    logo.src = '/public/icons/logo.svg';
    logo.alt = 'CREATORY';
    logo.style.cssText = `
      height: 56px;
      width: auto;
      cursor: pointer;
      object-fit: contain;
      object-position: left center;
      transition: opacity 0.2s;
      margin-bottom: 8px;
    `;
    logo.addEventListener('mouseenter', () => logo.style.opacity = '0.85');
    logo.addEventListener('mouseleave', () => logo.style.opacity = '1');
    logo.addEventListener('click', () => this.manager.navigateTo('landing'));

    // Description text
    const desc = document.createElement('div');
    desc.style.cssText = `
      color: rgba(255,255,255,0.55);
      font-size: 11px;
      line-height: 1.8;
      letter-spacing: 0.05em;
      font-weight: 400;
    `;
    desc.innerHTML = `CÁC NỘI DUNG<br>LIÊN QUAN ĐẾN<br>BẢN QUYỀN VÀ PHÁP LÝ (nếu không có thì đẩy cục contact lên)<br>+ DEVELOPED BY (OPTIONAL)`;

    // Contact section
    const contactTitle = document.createElement('div');
    contactTitle.textContent = 'CONTACT US';
    contactTitle.style.cssText = `
      color: #ffffff;
      font-size: 15px;
      font-weight: 900;
      letter-spacing: 0.1em;
      margin-top: 8px;
    `;

    // Email row
    const emailRow = _makeContactRow(
      `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="10" cy="10" r="9" stroke="white" stroke-width="1.5"/>
        <path d="M5 7.5L10 11.5L15 7.5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
        <rect x="5" y="7" width="10" height="7" rx="1" stroke="white" stroke-width="1.5"/>
      </svg>`,
      'creatorygallery@gmail.com',
      'mailto:creatorygallery@gmail.com'
    );

    // Phone row
    const phoneRow = _makeContactRow(
      `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="10" cy="10" r="9" stroke="white" stroke-width="1.5"/>
        <path d="M7.5 6C7.5 6 7 8 8.5 9.5C10 11 12 10.5 12 10.5L13 12C13 12 11 13.5 9 11.5C7 9.5 6.5 7 6.5 7L7.5 6Z" stroke="white" stroke-width="1.3" stroke-linejoin="round"/>
      </svg>`,
      '093 214 27 03 - Ms. Minh Quyên',
      'tel:0932142703'
    );

    // Social icons row
    const socialRow = document.createElement('div');
    socialRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 4px;
    `;

    const socials = [
      {
        name: 'Facebook',
        href: 'https://facebook.com',
        svg: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="11" cy="11" r="10" fill="white"/>
          <path d="M12.5 7H14V5H12.5C11.12 5 10 6.12 10 7.5V9H8.5V11H10V17H12V11H13.5L14 9H12V7.5C12 7.22 12.22 7 12.5 7Z" fill="#1a1fd4"/>
        </svg>`
      },
      {
        name: 'TikTok',
        href: 'https://tiktok.com',
        svg: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="11" cy="11" r="10" fill="white"/>
          <path d="M14 5.5C14.3 6.5 15 7.2 16 7.5V9.5C15.2 9.5 14.5 9.2 14 8.8V13C14 14.7 12.7 16 11 16C9.3 16 8 14.7 8 13C8 11.3 9.3 10 11 10C11.1 10 11.3 10 11.5 10.1V12.1C11.3 12 11.2 12 11 12C10.4 12 10 12.4 10 13C10 13.6 10.4 14 11 14C11.6 14 12 13.6 12 13V5H14V5.5Z" fill="#1a1fd4"/>
        </svg>`
      },
      {
        name: 'Instagram',
        href: 'https://instagram.com',
        svg: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="11" cy="11" r="10" fill="white"/>
          <rect x="7" y="7" width="8" height="8" rx="2.5" stroke="#1a1fd4" stroke-width="1.5"/>
          <circle cx="11" cy="11" r="2" stroke="#1a1fd4" stroke-width="1.5"/>
          <circle cx="14" cy="8" r="0.7" fill="#1a1fd4"/>
        </svg>`
      },
    ];

    socials.forEach(({ name, href, svg }) => {
      const a = document.createElement('a');
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.title = name;
      a.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.18s, opacity 0.18s;
        border-radius: 50%;
      `;
      a.innerHTML = svg;
      a.addEventListener('mouseenter', () => { a.style.transform = 'scale(1.12)'; a.style.opacity = '0.85'; });
      a.addEventListener('mouseleave', () => { a.style.transform = 'scale(1)'; a.style.opacity = '1'; });
      socialRow.appendChild(a);
    });

    leftCol.appendChild(logo);
    leftCol.appendChild(desc);
    leftCol.appendChild(contactTitle);
    leftCol.appendChild(emailRow);
    leftCol.appendChild(phoneRow);
    leftCol.appendChild(socialRow);

    // ── Spacer ────────────────────────────────────────────────────────────────
    const spacer = document.createElement('div');
    spacer.style.cssText = 'flex: 1;';

    // ── Nav columns ───────────────────────────────────────────────────────────
    const navColLeft = _makeNavColumn([
      { label: 'KHÁM PHÁ',       scene: 'explore'  },
      { label: 'STUDIO',         scene: 'studio'   },
      { label: 'DIỄN ĐÀN',       scene: 'forum'    },
      { label: 'SUPPORT & LEGAL',scene: 'support'  },
      { label: 'ĐĂNG KÝ GÓI',   scene: 'pricing'  },
    ], this.manager);

    const navColRight = _makeNavColumn([
      { label: 'FAQ',                  scene: 'faq'     },
      { label: 'CHÍNH SÁCH PHÁP LÝ',  scene: 'legal'   },
      { label: 'ĐIỀU KHOẢN DỊCH VỤ',  scene: 'terms'   },
    ], this.manager);

    // Assemble
    el.appendChild(leftCol);
    el.appendChild(spacer);
    el.appendChild(navColLeft);
    el.appendChild(navColRight);

    document.body.appendChild(el);
    this._el = el;
  }

  hide() { this._el.style.display = 'none'; }
  show() { this._el.style.display = 'flex'; }

  dispose() {
    this._el?.parentNode?.removeChild(this._el);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _makeContactRow(iconSvg, text, href) {
  const row = document.createElement('div');
  row.style.cssText = `
    display: flex;
    align-items: center;
    gap: 10px;
  `;

  const iconWrap = document.createElement('span');
  iconWrap.style.cssText = 'display:flex;align-items:center;flex-shrink:0;';
  iconWrap.innerHTML = iconSvg;

  const link = document.createElement('a');
  link.href = href;
  link.textContent = text;
  link.style.cssText = `
    color: rgba(255,255,255,0.85);
    font-family: monospace;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-decoration: none;
    transition: color 0.18s;
  `;
  link.addEventListener('mouseenter', () => link.style.color = '#ffffff');
  link.addEventListener('mouseleave', () => link.style.color = 'rgba(255,255,255,0.85)');

  row.appendChild(iconWrap);
  row.appendChild(link);
  return row;
}

function _makeNavColumn(items, manager) {
  const col = document.createElement('div');
  col.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 20px;
    flex: 0 0 220px;
    position: relative;
    z-index: 1;
  `;

  items.forEach(({ label, scene }) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = `
      background: none;
      border: none;
      color: rgba(255,255,255,0.9);
      font-family: monospace;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.1em;
      cursor: pointer;
      padding: 0;
      text-align: left;
      transition: color 0.18s, letter-spacing 0.18s;
      white-space: nowrap;
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.color = '#ffffff';
      btn.style.letterSpacing = '0.14em';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.color = 'rgba(255,255,255,0.9)';
      btn.style.letterSpacing = '0.1em';
    });
    btn.addEventListener('click', () => manager.navigateTo(scene));
    col.appendChild(btn);
  });

  return col;
}