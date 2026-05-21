import { BaseScene } from './BaseScene.js';

const FAQ_ITEMS = [
  {
    q: 'Creatory là gì?',
    a: `Creatory là một nền tảng mô hình 3D đa tính năng. Các tính năng hiện tại bao gồm:
<ul>
  <li>Cho phép các cá nhân hoặc nhóm thiết kế, chỉnh sửa và xuất bản không gian phòng triển lãm 3D sống động mà không cần kiến thức lập trình hay 3D render.</li>
  <li>Hỗ trợ hoạt động mua/bán các tác phẩm nghệ thuật trong không gian nền tảng.</li>
  <li>Trao đổi, giao lưu với các người dùng khác trong diễn đàn.</li>
  <li>Cho phép các tài khoản để lại bình luận và lượt thích cho các không gian triển lãm.</li>
  <li>Hệ thống tự động xếp hạng Creator và Viewer dựa trên điểm thu thập được.</li>
</ul>`,
  },
  {
    q: 'Creatory hỗ trợ những thiết bị nào?',
    a: 'Creatory có thể được truy cập thông qua các trình duyệt web trên máy tính, bao gồm Google Chrome, Cốc Cốc… Trang web tương thích tốt nhất với thiết bị máy tính/laptop.',
  },
  {
    q: 'Những thể loại tác phẩm nào có thể được treo trong không gian 3D của Creatory?',
    a: 'Các lĩnh vực nghệ thuật, sáng tạo bao gồm tranh vẽ truyền thống, tranh vẽ kỹ thuật số, sản phẩm thiết kế, ảnh chụp… đều có thể được sử dụng trong không gian của Creatory.',
  },
  {
    q: 'Những định dạng và kích cỡ file nào có thể được đăng tải trong phòng 3D của Creatory?',
    a: `Các định dạng file được hỗ trợ trong không gian số của Creatory bao gồm:
<ul>
  <li><b>Hình ảnh:</b> PNG, JPG/JPEG, WEBP, GIF…</li>
  <li><b>Video:</b> MP4, WEBM… (hoặc nhúng qua link YouTube)</li>
  <li><b>Âm thanh:</b> MP3, WAV, OGG…</li>
  <li><b>Mô hình 3D:</b> GLB, GLTF, OBJ</li>
</ul>
Kích thước mỗi file không được vượt quá <b>50 MB</b>.`,
  },
  {
    q: 'Làm thế nào để đảm bảo tiến độ của tôi được lưu lại trong quá trình chỉnh sửa không gian triển lãm khi chưa xuất bản?',
    a: `Các thay đổi của bạn được lưu thủ công hoặc tự động trong khi chỉnh sửa không gian.
<ul>
  <li>Bạn có thể nhấp vào <b>Lưu</b> bất cứ lúc nào để lưu tiến trình của mình.</li>
  <li>Hoặc hệ thống sẽ tự động lưu sau vài giây mỗi khi bạn thực hiện thay đổi nhờ tính năng <b>Autosave</b>. Bạn có thể bật/tắt Autosave tại thanh công cụ phía trên của Studio.</li>
</ul>
Để tránh các vấn đề về đồng bộ hóa, hãy đảm bảo rằng cùng một không gian làm việc không được mở ở chế độ chỉnh sửa trên nhiều tab hoặc cửa sổ trình duyệt cùng một lúc, vì điều này có thể dẫn đến các thay đổi xung đột hoặc mất tiến độ công việc.`,
  },
  {
    q: 'Việc tạo không gian triển lãm 3D có miễn phí không?',
    a: 'Việc tạo và xuất bản không gian triển lãm 3D tại Creatory là hoàn toàn miễn phí.',
  },
  {
    q: 'Tôi có thể chia sẻ đường link dẫn đến không gian 3D của mình như thế nào?',
    a: 'Sau khi không gian được xuất bản, bạn truy cập trang xem phòng tranh và nhấp vào biểu tượng chia sẻ (<b>🔗</b>) ở góc trên màn hình. Đường link sẽ tự động được sao chép vào clipboard để bạn dán và chia sẻ ở bất kỳ đâu.',
  },
  {
    q: 'Khách truy cập có cần đăng ký tài khoản trên Creatory để truy cập không gian 3D của tôi không?',
    a: 'Không. Khách truy cập có thể xem và điều hướng không gian 3D đã được xuất bản thông qua đường dẫn liên kết chia sẻ mà không cần tạo tài khoản. Tài khoản chỉ cần thiết nếu họ muốn tương tác, chẳng hạn như để lại bình luận trong không gian hoặc trò chuyện với chủ sở hữu không gian và những khách truy cập khác trong diễn đàn.',
  },
  {
    q: 'Tôi có được bảo vệ quyền sở hữu cho các tác phẩm đăng tải trong không gian triển lãm không?',
    a: 'Có. Creatory cam kết không xâm phạm quyền sở hữu đối với tất cả các tác phẩm trên hệ thống.',
  },
  {
    q: 'Có khoản phí nào áp dụng cho các sản phẩm nghệ thuật được bán thông qua Creatory không?',
    a: 'Creatory tổ chức hoạt động mua/bán tác phẩm nghệ thuật một cách gián tiếp, vì vậy không thu bất kỳ khoản phí nào cho hoạt động này. Creatory không sử dụng cổng thanh toán, API hay bất kỳ hình thức giữ tiền trực tiếp nào. Do đó, Creatory không chịu trách nhiệm cho các khoản thanh toán được thực hiện thông qua nền tảng.',
  },
];

export class SupportScene extends BaseScene {
  async init() {
    this.threeScene.background = null;
    this.camera.position.set(0, 0, 5);
    this._buildPage();
  }

  _buildPage() {
    const wrap = document.createElement('div');
    wrap.id = 'support-wrap';
    wrap.style.cssText = `
      min-height: 100vh;
      font-family: 'Montserrat', sans-serif;
      background: linear-gradient(180deg, #e8f4ff 0%, #f5f9ff 200px, #ffffff 500px);
      padding-bottom: 80px;
    `;

    wrap.innerHTML = `
      <style>
        #support-wrap { color: #182D58; }
        #support-wrap * { box-sizing: border-box; }

        .sp-hero {
          text-align: center;
          padding: 64px 20px 48px;
        }
        .sp-hero-tag {
          display: inline-block;
          background: linear-gradient(135deg, #4a90e2, #2257c5);
          color: #fff;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .18em;
          padding: 4px 14px;
          border-radius: 20px;
          text-transform: uppercase;
          margin-bottom: 18px;
        }
        .sp-hero-title {
          font-size: clamp(28px, 4vw, 46px);
          font-weight: 800;
          color: #0f1f4a;
          letter-spacing: -.01em;
          margin: 0 0 14px;
          line-height: 1.15;
        }
        .sp-hero-sub {
          font-size: 15px;
          color: #6b7fa8;
          max-width: 480px;
          margin: 0 auto;
          line-height: 1.6;
        }

        .sp-faq-wrap {
          max-width: 780px;
          margin: 0 auto;
          padding: 0 24px;
        }
        .sp-faq-title {
          font-size: 13px;
          font-weight: 800;
          letter-spacing: .14em;
          text-transform: uppercase;
          color: #4a90e2;
          margin: 0 0 24px;
        }

        .sp-item {
          border: 1.5px solid #dde6f5;
          border-radius: 12px;
          margin-bottom: 10px;
          overflow: hidden;
          background: #fff;
          box-shadow: 0 2px 8px rgba(18,47,106,.05);
          transition: box-shadow .2s;
        }
        .sp-item:hover {
          box-shadow: 0 4px 18px rgba(18,47,106,.10);
        }
        .sp-item.open {
          border-color: #4a90e2;
        }

        .sp-q {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 18px 22px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 700;
          color: #0f1f4a;
          line-height: 1.4;
          transition: color .15s;
          user-select: none;
        }
        .sp-item.open .sp-q {
          color: #2257c5;
        }

        .sp-chevron {
          flex-shrink: 0;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #eef4ff;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background .2s, transform .25s;
        }
        .sp-item.open .sp-chevron {
          background: #4a90e2;
          transform: rotate(180deg);
        }
        .sp-chevron svg { display: block; }
        .sp-item.open .sp-chevron svg path { stroke: #fff; }

        .sp-a {
          max-height: 0;
          overflow: hidden;
          transition: max-height .32s ease, padding .22s ease;
          padding: 0 22px;
          font-size: 13.5px;
          color: #3d5080;
          line-height: 1.75;
        }
        .sp-a.open {
          max-height: 600px;
          padding: 0 22px 20px;
        }
        .sp-a ul {
          margin: 10px 0 4px 0;
          padding-left: 20px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .sp-a li { line-height: 1.6; }
        .sp-a b { color: #1a3a6e; }
      </style>

      <div class="sp-hero">
        <div class="sp-hero-tag">Support & Legal</div>
        <h1 class="sp-hero-title">Câu hỏi thường gặp</h1>
        <p class="sp-hero-sub">Tìm câu trả lời nhanh cho các thắc mắc phổ biến về Creatory.</p>
      </div>

      <div class="sp-faq-wrap">
        <div class="sp-faq-title">FAQ</div>
        <div id="sp-faq-list"></div>
      </div>
    `;

    document.body.appendChild(wrap);
    this._el(wrap);

    const list = wrap.querySelector('#sp-faq-list');
    const chevronSVG = `
      <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
        <path d="M1 1.5L6 6.5L11 1.5" stroke="#4a90e2" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;

    FAQ_ITEMS.forEach((item) => {
      const el = document.createElement('div');
      el.className = 'sp-item';
      el.innerHTML = `
        <div class="sp-q">
          <span>${item.q}</span>
          <span class="sp-chevron">${chevronSVG}</span>
        </div>
        <div class="sp-a">${item.a}</div>
      `;

      const q = el.querySelector('.sp-q');
      const a = el.querySelector('.sp-a');
      q.addEventListener('click', () => {
        const isOpen = el.classList.contains('open');
        // Đóng tất cả
        list.querySelectorAll('.sp-item').forEach(i => {
          i.classList.remove('open');
          i.querySelector('.sp-a').classList.remove('open');
        });
        if (!isOpen) {
          el.classList.add('open');
          a.classList.add('open');
        }
      });

      list.appendChild(el);
    });
  }
}
