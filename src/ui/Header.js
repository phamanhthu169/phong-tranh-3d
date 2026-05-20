export class Header {
  constructor(manager) {
    this.manager = manager;
    this._build();
  }

  _build() {
    const el = document.createElement('div');
    el.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 90px;
      background: url('/public/header/linear.svg') center/cover no-repeat;
      display: flex;
      align-items: center;
      padding: 0 32px;
      z-index: 20000;
      font-family: monospace;
      user-select: none;
      gap: 20px;
    `;

    // ── Logo ──────────────────────────────────────────────────────────────────
    const logo = document.createElement('img');
    logo.src = '/public/icons/logo.svg';
    logo.alt = 'CREATORY';
    logo.style.cssText = 'height: 48px; cursor: pointer; flex-shrink: 0; transition: opacity 0.2s;';
    logo.addEventListener('mouseenter', () => logo.style.opacity = '0.85');
    logo.addEventListener('mouseleave', () => logo.style.opacity = '1');
    logo.addEventListener('click', () => this.manager.navigateTo('landing'));

    // ── Nav menu bar — menu.svg 560×72 ────────────────────────────────────────
    this._navArea = document.createElement('div');
    this._navArea.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0;
      width: 560px;
      height: 72px;
      background: url('/public/header/menu.svg') center/560px 72px no-repeat;
      flex-shrink: 0;
      margin: 0 auto;
    `;

    const navItems = [
      { label: 'KHÁM PHÁ',       scene: 'explore'  },
      { label: 'DIỄN ĐÀN',       scene: 'forum'    },
      { label: 'SUPPORT & LEGAL', scene: 'support'  },
      { label: 'ĐĂNG KÝ GÓI',    scene: 'pricing'  },
    ];

    navItems.forEach(({ label, scene }) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = `
        background: none;
        border: none;
        color: #1a3a6e;
        font-family: monospace;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        cursor: pointer;
        padding: 0 18px;
        height: 100%;
        transition: color 0.18s;
        white-space: nowrap;
      `;
      btn.addEventListener('mouseenter', () => btn.style.color = '#4a90e2');
      btn.addEventListener('mouseleave', () => btn.style.color = '#1a3a6e');
      btn.addEventListener('click', () => this.manager.navigateTo(scene));
      this._navArea.appendChild(btn);
    });

    // ── Cart button — cart.svg 54×50 ──────────────────────────────────────────
    this._cartBtn = document.createElement('button');
    this._cartBtn.style.cssText = `
      background: url('/public/header/cart.svg') center/58px 54px no-repeat;
      border: none;
      width: 58px;
      height: 54px;
      cursor: pointer;
      flex-shrink: 0;
      position: relative;
      transition: opacity 0.2s, transform 0.2s;
      display: none;
    `;
    this._cartBtn.title = 'Giỏ hàng';
    this._cartBtn.addEventListener('mouseenter', () => {
      this._cartBtn.style.opacity = '0.85';
      this._cartBtn.style.transform = 'scale(1.06)';
    });
    this._cartBtn.addEventListener('mouseleave', () => {
      this._cartBtn.style.opacity = '1';
      this._cartBtn.style.transform = 'scale(1)';
    });
    this._cartBtn.addEventListener('click', () => this.manager.navigateTo('checkout'));

    // Cart badge
    this._cartBadge = document.createElement('span');
    this._cartBadge.style.cssText = `
      position: absolute;
      top: 4px;
      right: 4px;
      background: #e84040;
      color: #fff;
      font-size: 7px;
      border-radius: 10px;
      padding: 1px 5px;
      min-width: 14px;
      text-align: center;
      display: none;
      pointer-events: none;
    `;
    this._cartBtn.appendChild(this._cartBadge);

    // ── Auth area ─────────────────────────────────────────────────────────────
    this._authArea = document.createElement('div');
    this._authArea.style.cssText = 'display:flex;align-items:center;flex-shrink:0;position:relative;';

    // Assemble
    el.appendChild(logo);
    el.appendChild(this._navArea);
    el.appendChild(this._cartBtn);
    el.appendChild(this._authArea);
    document.body.appendChild(el);
    this._el = el;

    // Auth listener
    this._unsubAuth = this.manager.auth.onChange((user, profile) => this._updateAuthUI(user, profile));
    this.manager.auth.ready().then(() => {
      this._updateAuthUI(this.manager.auth.user, this.manager.auth.profile);
    });

    // Cart badge listener
    this._onCartUpdated = () => this._updateCartBadge();
    window.addEventListener('cart-updated', this._onCartUpdated);
    this._updateCartBadge();

    // Đóng dropdown khi click ra ngoài
    this._onDocClick = (e) => {
      if (this._dropdown && !this._authArea.contains(e.target)) {
        this._closeDropdown();
      }
    };
    document.addEventListener('click', this._onDocClick);
  }

  // ── Cart badge ──────────────────────────────────────────────────────────────
  _updateCartBadge() {
    const cart = JSON.parse(localStorage.getItem('gallery_cart') || '[]');
    const isLoggedIn = this.manager.auth.isLoggedIn;
    this._cartBtn.style.display = isLoggedIn ? 'block' : 'none';
    if (cart.length === 0) {
      this._cartBadge.style.display = 'none';
    } else {
      this._cartBadge.textContent = cart.length > 9 ? '9+' : cart.length;
      this._cartBadge.style.display = 'inline-block';
    }
  }

  // ── Dropdown ──────────────────────────────────────────────────────────────
  _openDropdown() {
    if (this._dropdown) return;

    const dd = document.createElement('div');
    dd.style.cssText = `
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      background: #fff;
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.15);
      min-width: 190px;
      overflow: hidden;
      z-index: 300;
      animation: fadeSlideDown 0.18s ease;
    `;

    // Inject animation keyframes once
    if (!document.getElementById('header-dd-style')) {
      const style = document.createElement('style');
      style.id = 'header-dd-style';
      style.textContent = `
        @keyframes fadeSlideDown {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `;
      document.head.appendChild(style);
    }

    const isArtist = this.manager.auth.profile?.role === 'artist';

    const _makeBtn = (label, color, hoverBg, onClick) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = `
        width: 100%;
        background: none;
        border: none;
        padding: 13px 20px;
        text-align: left;
        font-family: monospace;
        font-size: 12px;
        font-weight: 700;
        color: ${color};
        cursor: pointer;
        transition: background 0.15s;
        letter-spacing: 0.04em;
      `;
      btn.addEventListener('mouseenter', () => btn.style.background = hoverBg);
      btn.addEventListener('mouseleave', () => btn.style.background = 'none');
      btn.addEventListener('click', onClick);
      return btn;
    };

    dd.appendChild(_makeBtn(
      '⚙  Settings',
      '#1a3a6e',
      'rgba(24,45,88,.07)',
      () => { this._closeDropdown(); this.manager.navigateTo('settings'); }
    ));

    if (isArtist) {
      dd.appendChild(_makeBtn(
        '📦  Quản lý đơn hàng',
        '#1a3a6e',
        'rgba(24,45,88,.07)',
        () => { this._closeDropdown(); this.manager.navigateTo('orders'); }
      ));
    } else {
      dd.appendChild(_makeBtn(
        '🛍  Đơn hàng của tôi',
        '#1a3a6e',
        'rgba(24,45,88,.07)',
        () => { this._closeDropdown(); this.manager.navigateTo('my-orders'); }
      ));
    }

    // Divider
    const divider = document.createElement('div');
    divider.style.cssText = 'height:1px;background:rgba(0,0,0,.07);margin:2px 0;';
    dd.appendChild(divider);

    dd.appendChild(_makeBtn(
      '🚪  Đăng xuất',
      '#c0392b',
      '#fdf0ee',
      async () => {
        this._closeDropdown();
        await this.manager.auth.signOut();
        this.manager.navigateTo('landing');
      }
    ));

    this._authArea.appendChild(dd);
    this._dropdown = dd;
  }

  _closeDropdown() {
    if (this._dropdown) {
      this._dropdown.remove();
      this._dropdown = null;
    }
  }

  _toggleDropdown() {
    if (this._dropdown) {
      this._closeDropdown();
    } else {
      this._openDropdown();
    }
  }

  // ── Auth UI ─────────────────────────────────────────────────────────────────
  _updateAuthUI(user, profile) {
    this._closeDropdown();
    this._authArea.innerHTML = '';
    this._updateCartBadge();

    if (user) {
      // Wrapper gom profile button + arrow button
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'display:flex;align-items:center;gap:10px;';

      // Profile button — hình tròn avatar
      const profileBtn = document.createElement('button');
      profileBtn.style.cssText = `
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: opacity 0.2s, transform 0.2s;
      `;

      const avatarCircle = document.createElement('div');
      avatarCircle.style.cssText = `
        width: 56px;
        height: 54px;
        border-radius: 50%;
        border: 2px solid rgba(255,255,255,0.6);
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #1a3a6e;
        font-size: 18px;
      `;

      const avatarImg = document.createElement('img');
      avatarImg.src = '/public/header/avatar.svg';
      avatarImg.alt = 'Avatar';
      avatarImg.style.cssText = 'width:100%;height:100%;object-fit:cover;';
      avatarCircle.appendChild(avatarImg);

      profileBtn.appendChild(avatarCircle);
      profileBtn.addEventListener('mouseenter', () => profileBtn.style.opacity = '0.85');
      profileBtn.addEventListener('mouseleave', () => profileBtn.style.opacity = '1');
      profileBtn.addEventListener('click', () => this.manager.navigateTo('profile'));

      // Arrow button
      const arrowBtn = document.createElement('button');
      arrowBtn.style.cssText = `
        background: url('/public/header/arrow.svg') center/54px 54px no-repeat;
        border: none;
        width: 54px;
        height: 54px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: opacity 0.2s, transform 0.2s;
        flex-shrink: 0;
        padding: 0;
      `;
      arrowBtn.addEventListener('mouseenter', () => arrowBtn.style.opacity = '0.85');
      arrowBtn.addEventListener('mouseleave', () => arrowBtn.style.opacity = '1');
      arrowBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggleDropdown();
      });

      wrapper.appendChild(profileBtn);
      wrapper.appendChild(arrowBtn);
      this._authArea.appendChild(wrapper);

    } else {
      // Login button — login.svg 283×89
      const loginBtn = document.createElement('button');
      loginBtn.style.cssText = `
        background: url('/public/header/login.svg') center/283px 89px no-repeat;
        border: none;
        width: 283px;
        height: 89px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: opacity 0.2s, transform 0.2s;
      `;

      loginBtn.addEventListener('mouseenter', () => loginBtn.style.opacity = '0.85');
      loginBtn.addEventListener('mouseleave', () => loginBtn.style.opacity = '1');
      loginBtn.addEventListener('click', () => this.manager.navigateTo('login'));

      this._authArea.appendChild(loginBtn);
    }
  }

  hide() { this._el.style.display = 'none'; }
  show() { this._el.style.display = 'flex'; }

  dispose() {
    if (this._unsubAuth) this._unsubAuth();
    if (this._onCartUpdated) window.removeEventListener('cart-updated', this._onCartUpdated);
    if (this._onDocClick) document.removeEventListener('click', this._onDocClick);
    this._el?.parentNode?.removeChild(this._el);
  }
}