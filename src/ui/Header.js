export class Header {
  constructor(manager) {
    this.manager = manager;
    this._build();
  }

  _build() {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:0;left:0;right:0;height:48px;background:rgba(12,10,9,0.96);border-bottom:1px solid rgba(212,197,169,0.1);display:flex;align-items:center;padding:0 24px;z-index:200;font-family:monospace;user-select:none;';

    // Logo
    const logo = document.createElement('span');
    logo.textContent = 'CREATORY';
    logo.style.cssText = 'color:#d4c5a9;font-size:16px;font-weight:bold;letter-spacing:0.22em;cursor:pointer;transition:color 0.2s;';
    logo.addEventListener('mouseenter', () => logo.style.color = '#c8a96e');
    logo.addEventListener('mouseleave', () => logo.style.color = '#d4c5a9');
    logo.addEventListener('click', () => this.manager.navigateTo('landing'));

    // Khu vực auth bên phải
    this._authArea = document.createElement('div');
    this._authArea.style.cssText = 'margin-left:auto;display:flex;align-items:center;gap:12px;';

    // Nav links giữa header
    this._navArea = document.createElement('div');
    this._navArea.style.cssText = 'display:flex;align-items:center;gap:6px;margin-left:28px;';

    const navItems = [
      { label: 'Khám phá', scene: 'explore' },
      { label: 'Cộng đồng', scene: 'forum' },
    ];
    navItems.forEach(({ label, scene }) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = 'background:none;border:none;color:#4a4038;font-family:monospace;font-size:10px;letter-spacing:.08em;cursor:pointer;padding:4px 10px;border-radius:3px;transition:color .18s;';
      btn.addEventListener('mouseenter', () => btn.style.color = '#c8a96e');
      btn.addEventListener('mouseleave', () => btn.style.color = '#4a4038');
      btn.addEventListener('click', () => this.manager.navigateTo(scene));
      this._navArea.appendChild(btn);
    });

    el.appendChild(logo);
    el.appendChild(this._navArea);
    el.appendChild(this._authArea);
    document.body.appendChild(el);
    this._el = el;

    // Lắng nghe thay đổi auth để cập nhật UI
    this._unsubAuth = this.manager.auth.onChange((user, profile) => this._updateAuthUI(user, profile));

    // Render trạng thái ban đầu sau khi auth sẵn sàng
    this.manager.auth.ready().then(() => {
      this._updateAuthUI(this.manager.auth.user, this.manager.auth.profile);
    });
  }

  _updateAuthUI(user, profile) {
    this._authArea.innerHTML = '';

    if (user) {
      // Tên có thể click → vào profile của mình
      const nameBtn = document.createElement('button');
      nameBtn.textContent = profile?.name || 'Ẩn danh';
      nameBtn.style.cssText = 'background:none;border:none;color:#7a6e5c;font-family:monospace;font-size:11px;letter-spacing:.08em;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;padding:0;transition:color .2s;';
      nameBtn.addEventListener('mouseenter', () => nameBtn.style.color = '#c8a96e');
      nameBtn.addEventListener('mouseleave', () => nameBtn.style.color = '#7a6e5c');
      nameBtn.addEventListener('click', () => this.manager.navigateTo('profile'));

      const logoutBtn = document.createElement('button');
      logoutBtn.textContent = 'Đăng xuất';
      logoutBtn.style.cssText = 'background:none;border:1px solid rgba(212,197,169,.2);color:#555;font-family:monospace;font-size:10px;padding:4px 12px;border-radius:3px;cursor:pointer;letter-spacing:.06em;transition:all .2s;';
      logoutBtn.addEventListener('mouseenter', () => { logoutBtn.style.color = '#d4c5a9'; logoutBtn.style.borderColor = 'rgba(212,197,169,.5)'; });
      logoutBtn.addEventListener('mouseleave', () => { logoutBtn.style.color = '#555';    logoutBtn.style.borderColor = 'rgba(212,197,169,.2)'; });
      logoutBtn.addEventListener('click', async () => {
        await this.manager.auth.signOut();
        this.manager.navigateTo('landing');
      });

      this._authArea.appendChild(nameBtn);
      this._authArea.appendChild(logoutBtn);
    } else {
      // Hiện nút đăng nhập + đăng ký
      const loginBtn = document.createElement('button');
      loginBtn.textContent = 'Đăng nhập';
      loginBtn.style.cssText = 'background:none;border:1px solid rgba(212,197,169,.2);color:#d4c5a9;font-family:monospace;font-size:10px;padding:4px 12px;border-radius:3px;cursor:pointer;letter-spacing:.06em;transition:all .2s;';
      loginBtn.addEventListener('mouseenter', () => loginBtn.style.borderColor = '#c8a96e');
      loginBtn.addEventListener('mouseleave', () => loginBtn.style.borderColor = 'rgba(212,197,169,.2)');
      loginBtn.addEventListener('click', () => this.manager.navigateTo('login'));

      const registerBtn = document.createElement('button');
      registerBtn.textContent = 'Đăng ký';
      registerBtn.style.cssText = 'background:rgba(200,169,110,.12);border:1px solid rgba(200,169,110,.4);color:#c8a96e;font-family:monospace;font-size:10px;padding:4px 12px;border-radius:3px;cursor:pointer;letter-spacing:.06em;transition:all .2s;';
      registerBtn.addEventListener('mouseenter', () => registerBtn.style.background = 'rgba(200,169,110,.25)');
      registerBtn.addEventListener('mouseleave', () => registerBtn.style.background = 'rgba(200,169,110,.12)');
      registerBtn.addEventListener('click', () => this.manager.navigateTo('register'));

      this._authArea.appendChild(loginBtn);
      this._authArea.appendChild(registerBtn);
    }
  }

  dispose() {
    if (this._unsubAuth) this._unsubAuth();
    this._el?.parentNode?.removeChild(this._el);
  }
}
