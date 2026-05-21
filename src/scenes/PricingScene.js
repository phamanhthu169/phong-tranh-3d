import { BaseScene } from './BaseScene.js';

const PLANS = {
  monthly: [
    {
      id: 'free',
      name: 'Miễn Phí',
      desc: 'Dành cho ai muốn khám phá nền tảng',
      price: '0',
      unit: '/tháng',
      popular: false,
      features: [
        'Truy cập 3D Studio',
        'Lưu trữ nội dung 500MB',
        'Đăng miễn phí 14 ngày (1 phòng)',
      ],
    },
    {
      id: 'creator',
      name: 'Người Sáng Tác',
      desc: 'Phù hợp cho nghệ sĩ và người dùng cá nhân',
      price: '299.000',
      unit: '/tháng',
      popular: false,
      features: [
        'Truy cập 3D Studio',
        '400 credits mỗi tháng',
        '13 phòng tranh',
        '3 phòng đăng',
        '2GB Lưu trữ Nội dung',
        'Hỗ trợ tiêu chuẩn',
      ],
    },
    {
      id: 'pro',
      name: 'Người Sáng Tác Pro',
      desc: 'Dành cho nghệ sĩ chuyên nghiệp, tổ chức phi lợi nhuận và nhóm nhỏ',
      price: '699.000',
      unit: '/tháng',
      popular: true,
      features: [
        'Truy cập 3D Studio',
        '750 credits mỗi tháng',
        '33 phòng tranh',
        '8 phòng đăng',
        'Tải lên cấu trúc 3D tùy chỉnh',
        '10GB Lưu trữ Nội dung',
        'Kiểm soát giao tiếp',
        'Hỗ trợ ưu tiên',
      ],
    },
    {
      id: 'business',
      name: 'Doanh Nghiệp',
      desc: 'Dành cho tổ chức và doanh nghiệp',
      price: '2.199.000',
      unit: '/tháng',
      popular: false,
      features: [
        'Truy cập 3D Studio với 1 Quận',
        'Không giới hạn phòng tranh',
        '25 phòng đăng',
        'Truy cập không giới hạn tài nguyên & tài sản tích hợp',
        'Tải lên cấu trúc 3D tùy chỉnh',
        '50GB Lưu trữ Nội dung',
        'Kiểm soát giao tiếp',
        'Kiểm soát quyền riêng tư',
        'Tùy chọn thương hiệu',
        'Hỗ trợ chuyên dụng',
        'Bảo mật doanh nghiệp với SSO & kết nối API bên thứ ba',
      ],
    },
  ],
  yearly: [
    {
      id: 'free',
      name: 'Miễn Phí',
      desc: 'Dành cho ai muốn khám phá nền tảng',
      price: '0',
      unit: '/năm',
      popular: false,
      features: [
        'Truy cập 3D Studio',
        'Lưu trữ nội dung 500MB',
        'Đăng miễn phí 14 ngày (1 phòng)',
      ],
    },
    {
      id: 'creator',
      name: 'Người Sáng Tác',
      desc: 'Phù hợp cho nghệ sĩ và người dùng cá nhân',
      price: '2.990.000',
      unit: '/năm',
      popular: false,
      features: [
        'Truy cập 3D Studio',
        '4.800 credits/năm',
        '13 phòng tranh',
        '3 phòng đăng',
        '2GB Lưu trữ Nội dung',
        'Hỗ trợ tiêu chuẩn',
      ],
    },
    {
      id: 'pro',
      name: 'Người Sáng Tác Pro',
      desc: 'Dành cho nghệ sĩ chuyên nghiệp, tổ chức phi lợi nhuận và nhóm nhỏ',
      price: '6.990.000',
      unit: '/năm',
      popular: true,
      features: [
        'Truy cập 3D Studio',
        '9.000 credits/năm',
        '33 phòng tranh',
        '8 phòng đăng',
        'Tải lên cấu trúc 3D tùy chỉnh',
        '10GB Lưu trữ Nội dung',
        'Kiểm soát giao tiếp',
        'Hỗ trợ ưu tiên',
      ],
    },
    {
      id: 'business',
      name: 'Doanh Nghiệp',
      desc: 'Dành cho tổ chức và doanh nghiệp',
      price: '21.990.000',
      unit: '/năm',
      popular: false,
      features: [
        'Truy cập 3D Studio với 1 Quận',
        'Không giới hạn phòng tranh',
        '25 phòng đăng',
        'Truy cập không giới hạn tài nguyên & tài sản tích hợp',
        'Tải lên cấu trúc 3D tùy chỉnh',
        '50GB Lưu trữ Nội dung',
        'Kiểm soát giao tiếp',
        'Kiểm soát quyền riêng tư',
        'Tùy chọn thương hiệu',
        'Hỗ trợ chuyên dụng',
        'Bảo mật doanh nghiệp với SSO & kết nối API bên thứ ba',
      ],
    },
  ],
};

export class PricingScene extends BaseScene {
  async init() {
    this.threeScene.background = null;
    this.camera.position.set(0, 0, 5);
    this._billing = 'monthly';
    this._buildPage();
  }

  _buildPage() {
    const wrap = document.createElement('div');
    wrap.id = 'pricing-wrap';
    wrap.style.cssText = `
      min-height:100vh;
      font-family:'Montserrat',sans-serif;
      background: linear-gradient(180deg,#e8f4ff 0%,#f5f9ff 200px,#ffffff 500px);
      padding-bottom:80px;
    `;

    wrap.innerHTML = `
      <style>
        #pricing-wrap { color:#182D58; }
        #pricing-wrap * { box-sizing:border-box; }
        .pr-title {
          text-align:center;
          font-size:clamp(28px,4vw,48px);
          font-weight:800;
          letter-spacing:-.01em;
          padding:60px 20px 12px;
          color:#0f1f4a;
        }
        .pr-sub {
          text-align:center;
          font-size:15px;
          color:#6b7fa8;
          margin-bottom:36px;
          letter-spacing:.02em;
        }
        .pr-toggle-wrap {
          display:flex;
          align-items:center;
          justify-content:center;
          gap:12px;
          margin-bottom:48px;
          position:relative;
        }
        .pr-toggle {
          display:flex;
          background:#e2eaf5;
          border-radius:40px;
          padding:4px;
          position:relative;
        }
        .pr-toggle-btn {
          border:none;
          background:none;
          font-family:'Montserrat',sans-serif;
          font-size:13px;
          font-weight:700;
          letter-spacing:.06em;
          padding:9px 28px;
          border-radius:36px;
          cursor:pointer;
          color:#6b7fa8;
          transition:all .22s;
          position:relative;
          z-index:1;
        }
        .pr-toggle-btn.active {
          background:#fff;
          color:#182D58;
          box-shadow:0 2px 10px rgba(0,0,0,.10);
        }
        .pr-save-badge {
          background:linear-gradient(135deg,#4a90e2,#2257c5);
          color:#fff;
          font-size:11px;
          font-weight:700;
          letter-spacing:.06em;
          border-radius:20px;
          padding:4px 12px;
          white-space:nowrap;
          position:relative;
        }
        .pr-save-badge::before {
          content:'';
          position:absolute;
          left:-14px;top:50%;transform:translateY(-50%);
          width:0;height:0;
          border-top:6px solid transparent;
          border-bottom:6px solid transparent;
          border-right:8px solid #4a90e2;
        }
        .pr-cards {
          display:grid;
          grid-template-columns:repeat(4,1fr);
          gap:18px;
          max-width:1140px;
          margin:0 auto;
          padding:0 24px;
        }
        @media(max-width:960px){
          .pr-cards{ grid-template-columns:repeat(2,1fr); }
        }
        @media(max-width:580px){
          .pr-cards{ grid-template-columns:1fr; }
        }
        .pr-card {
          background:#fff;
          border:1.5px solid #dde6f5;
          border-radius:14px;
          padding:28px 24px 32px;
          position:relative;
          display:flex;
          flex-direction:column;
          box-shadow:0 2px 12px rgba(18,47,106,.06);
          transition:box-shadow .2s, transform .2s;
        }
        .pr-card:hover {
          box-shadow:0 8px 32px rgba(18,47,106,.13);
          transform:translateY(-2px);
        }
        .pr-card.popular {
          border-color:#4a90e2;
          border-width:2px;
        }
        .pr-popular-badge {
          position:absolute;
          top:-14px;right:20px;
          background:linear-gradient(135deg,#4a90e2,#2257c5);
          color:#fff;
          font-size:10px;
          font-weight:800;
          letter-spacing:.14em;
          padding:4px 14px;
          border-radius:20px;
          text-transform:uppercase;
        }
        .pr-plan-name {
          font-size:18px;
          font-weight:800;
          color:#0f1f4a;
          margin-bottom:6px;
        }
        .pr-plan-desc {
          font-size:11.5px;
          color:#7a90bb;
          line-height:1.5;
          margin-bottom:20px;
          min-height:34px;
        }
        .pr-price-row {
          display:flex;
          align-items:baseline;
          gap:2px;
          margin-bottom:20px;
        }
        .pr-currency {
          font-size:16px;
          font-weight:700;
          color:#0f1f4a;
          align-self:flex-start;
          margin-top:6px;
        }
        .pr-amount {
          font-size:clamp(28px,3vw,38px);
          font-weight:800;
          color:#0f1f4a;
          line-height:1;
        }
        .pr-unit {
          font-size:13px;
          color:#9aadcc;
          margin-left:2px;
        }
        .pr-cta {
          width:100%;
          border:1.5px solid #c5d3e8;
          background:none;
          color:#182D58;
          font-family:'Montserrat',sans-serif;
          font-size:13px;
          font-weight:700;
          letter-spacing:.06em;
          padding:11px 0;
          border-radius:8px;
          cursor:pointer;
          margin-bottom:22px;
          transition:all .2s;
          display:flex;align-items:center;justify-content:center;gap:6px;
        }
        .pr-cta:hover {
          background:#122F6A;
          border-color:#122F6A;
          color:#fff;
        }
        .pr-card.popular .pr-cta {
          background:#122F6A;
          border-color:#122F6A;
          color:#fff;
        }
        .pr-card.popular .pr-cta:hover {
          background:#1a3f8a;
          border-color:#1a3f8a;
        }
        .pr-divider {
          border:none;
          border-top:1px solid #edf2fa;
          margin:0 0 18px;
        }
        .pr-features {
          list-style:none;
          padding:0;margin:0;
          flex:1;
          display:flex;flex-direction:column;gap:10px;
        }
        .pr-feature {
          display:flex;align-items:flex-start;gap:9px;
          font-size:12.5px;
          color:#3d5080;
          line-height:1.45;
        }
        .pr-check {
          width:16px;height:16px;
          background:linear-gradient(135deg,#4a90e2,#2257c5);
          border-radius:50%;
          flex-shrink:0;
          display:flex;align-items:center;justify-content:center;
          margin-top:1px;
        }
        .pr-check svg { display:block; }
      </style>

      <div class="pr-title">Chọn gói của bạn</div>
      <div class="pr-sub">Linh hoạt theo nhu cầu — nâng cấp hoặc hủy bất kỳ lúc nào</div>

      <div class="pr-toggle-wrap">
        <div class="pr-toggle">
          <button class="pr-toggle-btn active" id="pr-btn-monthly">Hàng tháng</button>
          <button class="pr-toggle-btn" id="pr-btn-yearly">Hàng năm</button>
        </div>
        <span class="pr-save-badge">Tiết kiệm 2 tháng</span>
      </div>

      <div class="pr-cards" id="pr-cards-grid"></div>
    `;

    document.body.appendChild(wrap);
    this._el(wrap);
    this._wrap = wrap;

    this._renderCards();

    wrap.querySelector('#pr-btn-monthly').addEventListener('click', () => {
      this._billing = 'monthly';
      wrap.querySelector('#pr-btn-monthly').classList.add('active');
      wrap.querySelector('#pr-btn-yearly').classList.remove('active');
      this._renderCards();
    });
    wrap.querySelector('#pr-btn-yearly').addEventListener('click', () => {
      this._billing = 'yearly';
      wrap.querySelector('#pr-btn-yearly').classList.add('active');
      wrap.querySelector('#pr-btn-monthly').classList.remove('active');
      this._renderCards();
    });
  }

  _showBetaModal() {
    if (document.getElementById('pr-beta-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'pr-beta-modal';
    modal.style.cssText = `
      position:fixed;inset:0;z-index:99999;
      display:flex;align-items:center;justify-content:center;
      background:rgba(10,20,50,.55);
      backdrop-filter:blur(4px);
      animation:prFadeIn .2s ease;
    `;
    modal.innerHTML = `
      <style>
        @keyframes prFadeIn { from{opacity:0} to{opacity:1} }
        @keyframes prSlideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        #pr-beta-modal .pr-modal-box {
          background:#fff;
          border-radius:18px;
          padding:44px 40px 36px;
          max-width:440px;width:90%;
          text-align:center;
          box-shadow:0 24px 80px rgba(10,20,60,.22);
          animation:prSlideUp .25s ease;
          font-family:'Montserrat',sans-serif;
          position:relative;
        }
        #pr-beta-modal .pr-beta-icon {
          width:62px;height:62px;
          background:linear-gradient(135deg,#4a90e2,#2257c5);
          border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          margin:0 auto 20px;
          font-size:28px;
        }
        #pr-beta-modal .pr-beta-tag {
          display:inline-block;
          background:linear-gradient(135deg,#4a90e2,#2257c5);
          color:#fff;
          font-size:10px;font-weight:800;letter-spacing:.18em;
          padding:3px 12px;border-radius:20px;
          margin-bottom:14px;
          text-transform:uppercase;
        }
        #pr-beta-modal h2 {
          font-size:22px;font-weight:800;color:#0f1f4a;
          margin:0 0 12px;line-height:1.3;
        }
        #pr-beta-modal p {
          font-size:14px;color:#5a6e96;line-height:1.65;
          margin:0 0 28px;
        }
        #pr-beta-modal .pr-modal-btn {
          width:100%;
          background:linear-gradient(135deg,#122F6A,#2257c5);
          color:#fff;
          border:none;
          border-radius:10px;
          font-family:'Montserrat',sans-serif;
          font-size:14px;font-weight:700;letter-spacing:.06em;
          padding:13px 0;
          cursor:pointer;
          transition:opacity .2s,transform .2s;
        }
        #pr-beta-modal .pr-modal-btn:hover { opacity:.9;transform:translateY(-1px); }
        #pr-beta-modal .pr-modal-close {
          position:absolute;top:14px;right:18px;
          background:none;border:none;
          font-size:20px;color:#aab;cursor:pointer;
          line-height:1;padding:4px;
          transition:color .15s;
        }
        #pr-beta-modal .pr-modal-close:hover { color:#555; }
      </style>
      <div class="pr-modal-box">
        <button class="pr-modal-close" id="pr-beta-close">✕</button>
        <div class="pr-beta-icon">🚀</div>
        <div class="pr-beta-tag">BETA</div>
        <h2>Web đang trong giai đoạn Beta!</h2>
        <p>
          Hiện tại tất cả các tính năng đều <strong style="color:#2257c5">miễn phí</strong> để trải nghiệm.<br/>
          Thanh toán gói sẽ được kích hoạt sau khi ra mắt chính thức.<br/><br/>
          Hãy đăng ký và tận hưởng toàn bộ nền tảng ngay hôm nay!
        </p>
        <button class="pr-modal-btn" id="pr-beta-cta">Bắt đầu miễn phí ngay</button>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => {
      modal.style.animation = 'prFadeIn .15s ease reverse';
      setTimeout(() => modal.remove(), 150);
    };
    modal.querySelector('#pr-beta-close').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    modal.querySelector('#pr-beta-cta').addEventListener('click', () => {
      close();
      this.manager.navigateTo(this.manager.auth.isLoggedIn ? 'studio' : 'register');
    });
  }

  _renderCards() {
    const grid = this._wrap.querySelector('#pr-cards-grid');
    grid.innerHTML = '';
    const plans = PLANS[this._billing];

    plans.forEach(plan => {
      const card = document.createElement('div');
      card.className = 'pr-card' + (plan.popular ? ' popular' : '');

      const checkSVG = `
        <svg width="9" height="7" viewBox="0 0 9 7" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M1 3.5L3.5 6L8 1" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;

      card.innerHTML = `
        ${plan.popular ? '<div class="pr-popular-badge">PHỔ BIẾN</div>' : ''}
        <div class="pr-plan-name">${plan.name}</div>
        <div class="pr-plan-desc">${plan.desc}</div>
        <div class="pr-price-row">
          ${plan.price === '0'
            ? `<span class="pr-amount">0</span><span class="pr-unit">đ${plan.unit}</span>`
            : `<span class="pr-amount">${plan.price}</span><span class="pr-unit">đ${plan.unit}</span>`
          }
        </div>
        <button class="pr-cta">↗ Bắt đầu</button>
        <hr class="pr-divider"/>
        <ul class="pr-features">
          ${plan.features.map(f => `
            <li class="pr-feature">
              <span class="pr-check">${checkSVG}</span>
              <span>${f}</span>
            </li>`).join('')}
        </ul>
      `;

      card.querySelector('.pr-cta').addEventListener('click', () => {
        this._showBetaModal();
      });

      grid.appendChild(card);
    });
  }
}
