import { supabase } from '../utils/supabase.js';
import { v4 as uuidv4 } from 'uuid';

const STORAGE_KEY = 'creatory_user';

export class AuthManager {
  constructor() {
    this._profile   = null;
    this._listeners = [];
    this._ready     = this._init();
  }

  // Khởi tạo: load từ localStorage, sau đó kiểm tra và đồng bộ với Supabase
  async _init() {
    const localProfile = this._loadFromLocal();
    if (!localProfile) return;

    // Fetch dữ liệu mới nhất từ Supabase
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', localProfile.id)
      .maybeSingle();

    if (!error && data) {
      // Gộp dữ liệu (ưu tiên Supabase nếu có)
      this._profile = { ...localProfile, ...data };
      this._saveToLocal(this._profile);
    } else if (error && error.code !== 'PGRST116') {
      console.error('Lỗi khi đồng bộ profile từ Supabase:', error);
      this._profile = localProfile;
    } else {
      // Không tìm thấy trên Supabase -> tạo mới
      await this._upsertToSupabase(localProfile);
      this._profile = localProfile;
    }
    this._notify();
  }

  _loadFromLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  _saveToLocal(profile) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }

  async _upsertToSupabase(profile) {
    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: profile.id,
        display_name: profile.name,
        role: profile.role,
        location: profile.location || null,
        website: profile.website || null,
        bio: profile.bio || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (error) console.error('Lỗi upsert profile lên Supabase:', error);
  }

  // Public API
  ready() { return this._ready; }
  get profile() { return this._profile; }
  get user() { return this._profile; }
  get isLoggedIn() { return !!this._profile; }
  get isArtist() { return this._profile?.role === 'artist'; }

  // Đăng ký / đăng nhập lần đầu
  async setProfile(name, role) {
    const newProfile = {
      id: this._profile?.id || uuidv4(),  // giữ nguyên id nếu đã có
      name,
      role,
      location: this._profile?.location || '',
      website: this._profile?.website || '',
      bio: this._profile?.bio || '',
    };
    this._profile = newProfile;
    this._saveToLocal(newProfile);
    await this._upsertToSupabase(newProfile);
    this._notify();
  }

  // Cập nhật thông tin (chỉnh sửa profile)
  async updateProfile(fields) {
    if (!this._profile) throw new Error('Chưa đăng nhập');

    const updated = { ...this._profile, ...fields };
    this._profile = updated;
    this._saveToLocal(updated);
    await this._upsertToSupabase(updated);
    this._notify();
  }

  async signOut() {
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