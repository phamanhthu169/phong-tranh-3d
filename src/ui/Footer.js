export class Footer {
  constructor(manager) {
    this.manager = manager;
    this._build();
  }

  _build() {
    const el = document.createElement('div');
    el.style.cssText = `
      position: relative;
      aspect-ratio: 1571 / 460;
      background-image: url('/landingpage/footer.svg');
      background-size: cover;
      background-position: center center;
      background-repeat: no-repeat;
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

    // ── Left column ───────────────────────────────────────────────────────────
    const leftCol = document.createElement('div');
    leftCol.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
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

    // Contact section
    const contactTitle = document.createElement('div');
    contactTitle.textContent = '';
    contactTitle.style.cssText = `
      color: #ffffff;
      font-size: 15px;
      font-weight: 900;
      letter-spacing: 0.1em;
      margin-top: 105px;
    `;

    // Email row
    const emailRow = _makeContactRow(
      `<img src="/public/footer/mail.svg" width="20" height="20">`,
      'creatorygallery@gmail.com',
      'mailto:creatorygallery@gmail.com'
    );

    // Phone row
    const phoneRow = _makeContactRow(
      `<img src="/public/footer/phone.svg" width="20" height="20">`,
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
      { name: 'Facebook',  href: 'https://facebook.com',  svg: `<img src="/public/footer/facebook.svg" width="22" height="22">` },
      { name: 'TikTok',    href: 'https://tiktok.com',    svg: `<img src="/public/footer/tiktok.svg"   width="22" height="22">` },
      { name: 'Instagram', href: 'https://instagram.com', svg: `<img src="/public/footer/insta.svg"    width="22" height="22">` },
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
