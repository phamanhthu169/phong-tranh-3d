import { supabase } from '../utils/supabase.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

const STORAGE_KEY = 'creatory_user';
const SALT_ROUNDS = 10;

export class AuthManager {
  constructor() {
    this._profile   = null;
    this._listeners = [];
    this._ready     = this._init();
  }

  async _init() {
    const localProfile = this._loadFromLocal();
    if (!localProfile) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', localProfile.id)
      .maybeSingle();

    if (!error && data) {
      this._profile = { ...localProfile, ...data };
      this._saveToLocal(this._profile);
    } else if (error && error.code !== 'PGRST116') {
      console.error('Lỗi khi đồng bộ profile từ Supabase:', error);
      this._profile = localProfile;
    } else {
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
    // Không lưu password_hash vào localStorage
    const { password_hash, ...safe } = profile;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  }

  async _upsertToSupabase(profile) {
    const payload = {
      id: profile.id,
      display_name: profile.name,
      role: profile.role,
    };
    if (profile.password_hash) payload.password_hash = profile.password_hash;
    if (profile.bank_name !== undefined)           payload.bank_name           = profile.bank_name           || null;
    if (profile.bank_account_number !== undefined) payload.bank_account_number = profile.bank_account_number || null;
    if (profile.bank_account_holder !== undefined) payload.bank_account_holder = profile.bank_account_holder || null;

    const { error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'id' });

    if (error) console.error('Lỗi upsert profile lên Supabase:', error);
  }

  // Public API
  ready() { return this._ready; }
  get profile() { return this._profile; }
  get user() { return this._profile; }
  get isLoggedIn() { return !!this._profile; }
  get isArtist() { return this._profile?.role === 'artist'; }

  // Đăng ký tài khoản mới (tên + role + mật khẩu)
  async register(name, role, password) {
    // Kiểm tra tên đã tồn tại chưa
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('display_name', name)
      .maybeSingle();

    if (existing) throw new Error('Tên này đã được sử dụng, vui lòng chọn tên khác');

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const newProfile = {
      id: uuidv4(),
      name,
      role,
      location: '',
      website: '',
      bio: '',
      password_hash,
    };

    const { error } = await supabase
      .from('profiles')
      .insert({
        id: newProfile.id,
        display_name: newProfile.name,
        role: newProfile.role,
        password_hash: newProfile.password_hash,
      });

    if (error) throw new Error('Có lỗi xảy ra khi tạo tài khoản');

    this._profile = newProfile;
    this._saveToLocal(newProfile);
    this._notify();
  }

  // Đăng nhập bằng tên + mật khẩu
  async login(name, password) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('display_name', name)
      .maybeSingle();

    if (error || !data) throw new Error('Không tìm thấy tài khoản với tên này');
    if (!data.password_hash) throw new Error('Tài khoản này chưa có mật khẩu, vui lòng đăng ký lại');

    const ok = await bcrypt.compare(password, data.password_hash);
    if (!ok) throw new Error('Mật khẩu không đúng');

    this._profile = {
      id: data.id,
      name: data.display_name,
      role: data.role,
      location: data.location || '',
      website: data.website || '',
      bio: data.bio || '',
      bank_name: data.bank_name || '',
      bank_account_number: data.bank_account_number || '',
      bank_account_holder: data.bank_account_holder || '',
    };
    this._saveToLocal(this._profile);
    this._notify();
  }

  // Cập nhật thông tin profile
  async updateProfile(fields) {
    if (!this._profile) throw new Error('Chưa đăng nhập');
    const updated = { ...this._profile, ...fields };
    this._profile = updated;
    this._saveToLocal(updated);
    await this._upsertToSupabase(updated);
    this._notify();
  }

  async changePassword(oldPassword, newPassword) {
    if (!this._profile) throw new Error('Chưa đăng nhập');
    const { data, error } = await supabase
      .from('profiles')
      .select('password_hash')
      .eq('id', this._profile.id)
      .maybeSingle();
    if (error || !data) throw new Error('Không thể xác minh mật khẩu');
    const ok = await bcrypt.compare(oldPassword, data.password_hash);
    if (!ok) throw new Error('Mật khẩu cũ không đúng');
    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ password_hash: newHash })
      .eq('id', this._profile.id);
    if (updateError) throw new Error('Không thể cập nhật mật khẩu');
  }

  async deleteAccount() {
    if (!this._profile) throw new Error('Chưa đăng nhập');
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', this._profile.id);
    if (error) throw new Error('Không thể xóa tài khoản');
    await this.signOut();
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
