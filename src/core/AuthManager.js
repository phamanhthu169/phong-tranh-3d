import { supabase } from '../utils/supabase.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

const STORAGE_KEY = 'creatory_user';
const SALT_ROUNDS = 10;

// Danh sách câu hỏi bí mật dùng cho đăng ký & khôi phục mật khẩu.
// Dùng chung 1 nguồn để RegisterScene và ForgotPasswordScene luôn đồng bộ.
export const SECURITY_QUESTIONS = [
  'Tên con vật cưu đầu tiên của bạn là gì?',
  'Tên trường tiểu học của bạn là gì?',
  'Bạn sinh ra ở thành phố/tỉnh nào?',
  'Món ăn yêu thích thời nhỏ của bạn là gì?',
  'Tên người bạn thân nhất thời cấp 1 của bạn là gì?',
];

const normalizeAnswer = (answer) => answer.trim().toLowerCase();

export class AuthManager {
  constructor() {
    this._profile   = null;
    this._listeners = [];
    this._ready     = this._init();
  }

  // Chuẩn hoá 1 row raw từ Supabase (snake_case) sang field app dùng (camelCase/tên rút gọn).
  // Dùng chung cho _init() và mọi nơi khác cần đọc lại profile từ DB.
  _normalizeRow(data) {
    return {
      id: data.id,
      name: data.display_name,
      role: data.role,
      location: data.location || '',
      website: data.website || '',
      bio: data.bio || '',
      avatarUrl: data.avatar_url || '',
      coverUrl: data.cover_url || '',
      bank_name: data.bank_name || '',
      bank_account_number: data.bank_account_number || '',
      bank_account_holder: data.bank_account_holder || '',
      province: data.province || '',
      district: data.district || '',
      ward:     data.ward     || '',
      street:   data.street   || '',
    };
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
      // data (DB) là nguồn sự thật, localProfile chỉ bổ sung field nào DB không có (vd password_hash không select)
      this._profile = { ...localProfile, ...this._normalizeRow(data) };
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
    // Map field phía JS (camelCase / tên rút gọn) sang tên cột thật trong Supabase.
    // CHÚ Ý: mỗi khi thêm field mới vào profile (avatar, cover, bio, ...) phải thêm
    // vào map này, nếu không field sẽ chỉ tồn tại ở RAM + localStorage, không bao giờ
    // được lưu xuống DB → mất khi đăng xuất / đăng nhập lại trên thiết bị khác.
    const FIELD_MAP = {
      name:                'display_name',
      role:                'role',
      password_hash:       'password_hash',
      location:            'location',
      website:             'website',
      bio:                 'bio',
      avatarUrl:           'avatar_url',
      coverUrl:            'cover_url',
      bank_name:           'bank_name',
      bank_account_number: 'bank_account_number',
      bank_account_holder: 'bank_account_holder',
      province:            'province',
      district:            'district',
      ward:                'ward',
      street:              'street',
    };

    const payload = { id: profile.id };
    for (const [jsKey, dbCol] of Object.entries(FIELD_MAP)) {
      if (profile[jsKey] === undefined) continue;
      // password_hash chỉ gửi khi có giá trị thật (tránh ghi đè rỗng nếu chưa set)
      if (jsKey === 'password_hash' && !profile[jsKey]) continue;
      payload[dbCol] = profile[jsKey] === '' ? null : profile[jsKey];
    }

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
  get isAdmin()  { return this._profile?.role === 'admin'; }

  // Đăng ký tài khoản mới (tên + role + mật khẩu + thông tin đơn xin cấp duyệt nếu là artist
  // + câu hỏi bí mật { question, answer } dùng để khôi phục mật khẩu sau này)
  async register(name, role, password, artistInfo = null, security = null) {
    // Kiểm tra tên đã tồn tại chưa
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('display_name', name)
      .maybeSingle();

    if (existing) throw new Error('Tên này đã được sử dụng, vui lòng chọn tên khác');

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    let security_question = null;
    let security_answer_hash = null;
    if (security && security.question && security.answer) {
      security_question = security.question;
      security_answer_hash = await bcrypt.hash(normalizeAnswer(security.answer), SALT_ROUNDS);
    }

    // Trong lúc chờ duyệt, tài khoản chọn "artist" vẫn được cấp quyền user bình thường
    const actualRole = role === 'artist' ? 'user' : role;

    const newProfile = {
      id: uuidv4(),
      name,
      role: actualRole,
      location: '',
      website: '',
      bio: '',
      password_hash,
      security_question,
      security_answer_hash,
    };

    const { error } = await supabase
      .from('profiles')
      .insert({
        id: newProfile.id,
        display_name: newProfile.name,
        role: newProfile.role,
        password_hash: newProfile.password_hash,
        security_question: newProfile.security_question,
        security_answer_hash: newProfile.security_answer_hash,
      });

    if (error) throw new Error('Có lỗi xảy ra khi tạo tài khoản');

    if (role === 'artist' && artistInfo) {
      const { error: appError } = await supabase
        .from('artist_applications')
        .insert({
          profile_id: newProfile.id,
          full_name: artistInfo.full_name,
          phone: artistInfo.phone,
          facebook_link: artistInfo.facebook_link || null,
          portfolio_link: artistInfo.portfolio_link || null,
          address: artistInfo.address,
          province: artistInfo.province,
          status: 'pending',
        });
      if (appError) console.error('Lỗi khi gửi đơn xin cấp duyệt Nghệ sĩ:', appError);
    }

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

    this._profile = this._normalizeRow(data);
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

  // Lấy câu hỏi bí mật của 1 tài khoản theo tên hiển thị (dùng cho luồng quên mật khẩu)
  async getSecurityQuestion(name) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, security_question')
      .eq('display_name', name)
      .maybeSingle();

    if (error || !data) throw new Error('Không tìm thấy tài khoản với tên này');
    if (!data.security_question) {
      throw new Error('Tài khoản này chưa thiết lập câu hỏi bí mật, vui lòng liên hệ admin để được hỗ trợ');
    }
    return data.security_question;
  }

  // Đặt lại mật khẩu bằng câu trả lời bí mật (xác minh + cập nhật trong cùng 1 lượt)
  async resetPasswordWithSecurityAnswer(name, answer, newPassword) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, security_answer_hash')
      .eq('display_name', name)
      .maybeSingle();

    if (error || !data) throw new Error('Không tìm thấy tài khoản với tên này');
    if (!data.security_answer_hash) {
      throw new Error('Tài khoản này chưa thiết lập câu hỏi bí mật, vui lòng liên hệ admin để được hỗ trợ');
    }

    const ok = await bcrypt.compare(normalizeAnswer(answer), data.security_answer_hash);
    if (!ok) throw new Error('Câu trả lời không đúng, vui lòng thử lại');

    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ password_hash: newHash })
      .eq('id', data.id);
    if (updateError) throw new Error('Không thể đặt lại mật khẩu, vui lòng thử lại');
  }

  // Admin đặt lại mật khẩu cho 1 tài khoản bất kỳ theo id (dùng khi user không thể tự khôi phục)
  async adminResetPassword(profileId, newPassword) {
    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const { error } = await supabase
      .from('profiles')
      .update({ password_hash: newHash })
      .eq('id', profileId);
    if (error) throw new Error('Không thể đặt lại mật khẩu');
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