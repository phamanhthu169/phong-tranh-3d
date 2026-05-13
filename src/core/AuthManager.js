const STORAGE_KEY = 'creatory_user';

export class AuthManager {
  constructor() {
    this._profile   = this._load();
    this._listeners = [];
    this._ready     = Promise.resolve();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  _save(profile) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    this._profile = profile;
    this._notify();
  }

  ready()         { return this._ready; }
  get profile()   { return this._profile; }
  get user()      { return this._profile; }
  get isLoggedIn(){ return !!this._profile; }
  get isArtist()  { return this._profile?.role === 'artist'; }

  // Đặt name + role khi đăng ký/đăng nhập lần đầu
  setProfile(name, role) {
    const existing = this._profile || {};
    this._save({ ...existing, name, role });
  }

  // Cập nhật bất kỳ field nào của profile (merge)
  updateProfile(fields) {
    if (!this._profile) return;
    this._save({ ...this._profile, ...fields });
  }

  signOut() {
    localStorage.removeItem(STORAGE_KEY);
    this._profile = null;
    this._notify();
  }

  onChange(fn) {
    this._listeners.push(fn);
    return () => { this._listeners = this._listeners.filter(l => l !== fn); };
  }

  _notify() {
    this._listeners.forEach(fn => fn(this._profile, this._profile));
  }
}
