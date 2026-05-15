import * as THREE from 'three';
import { BaseScene } from './BaseScene.js';

// Màn hình chào — trang đầu tiên người dùng thấy
export class LandingScene extends BaseScene {
  async init() {
    this.threeScene.background = new THREE.Color(0xffffff);
    this.camera.position.set(0, 0, 6);

    // Ánh sáng
    this.threeScene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffe8c0, 1.5);
    dir.position.set(3, 5, 5);
    this.threeScene.add(dir);

    // Nội dung
    this._createTitle();
    this._createButtons();
    this._createParticles();

    // Raycaster để phát hiện click vào nút
    this._raycaster = new THREE.Raycaster();
    this._mouse     = new THREE.Vector2();

    this._on(this.renderer.domElement, 'click',     (e) => this._onClick(e));
    this._on(this.renderer.domElement, 'mousemove', (e) => this._onHover(e));
  }

  // ── Tên nền tảng ─────────────────────────────────────────────
  _createTitle() {
    const cv  = document.createElement('canvas');
    cv.width  = 1024; cv.height = 256;
    const ctx = cv.getContext('2d');

    ctx.fillStyle = '#1a1a1a';
    ctx.font      = 'bold 88px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Phong Tranh 3D', 512, 105);

    ctx.fillStyle = '#666666';
    ctx.font      = '30px monospace';
    ctx.fillText('Tạo & Khám phá phòng tranh ảo', 512, 190);

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 2.25),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true })
    );
    mesh.position.set(0, 1.4, 0);
    this.threeScene.add(mesh);
  }

  // ── Nút bấm 3D ───────────────────────────────────────────────
  _makeBtn(label, color, x, y) {
    const cv  = document.createElement('canvas');
    cv.width  = 512; cv.height = 128;
    const tex = new THREE.CanvasTexture(cv);

    const draw = (hovered) => {
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, 512, 128);
      ctx.fillStyle   = hovered ? 'rgba(200,169,110,0.12)' : 'rgba(30,30,30,0.88)';
      ctx.strokeStyle = hovered ? '#c8a96e' : color;
      ctx.lineWidth   = 3;
      ctx.beginPath(); ctx.roundRect(4, 4, 504, 120, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = hovered ? '#333333' : color;
      ctx.font      = 'bold 46px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, 256, 64);
      tex.needsUpdate = true;
    };

    draw(false);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 0.65),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true })
    );
    mesh.position.set(x, y, 0);
    this.threeScene.add(mesh);
    return { mesh, draw };
  }

  _createButtons() {
    this._btns = [
      { ...this._makeBtn('Khám phá',   '#d4c5a9', -1.45, -0.2),  target: 'explore'  },
      { ...this._makeBtn('Studio',     '#c8a96e',  1.45, -0.2),  target: 'dashboard' },
      { ...this._makeBtn('Đăng nhập',  '#7a6e5c', -1.45, -1.05), target: 'login'    },
      { ...this._makeBtn('Đăng ký',    '#7a6e5c',  1.45, -1.05), target: 'register' },
    ];
  }

  // ── Hạt bụi nền ──────────────────────────────────────────────
  _createParticles() {
    const count = 300;
    const pos   = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) pos[i] = (Math.random() - 0.5) * 22;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this._particles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xcccccc, size: 0.035, transparent: true, opacity: 0.6 })
    );
    this.threeScene.add(this._particles);
  }

  // ── Sự kiện ──────────────────────────────────────────────────
  _pick(e) {
    this._mouse.x =  (e.clientX / innerWidth)  * 2 - 1;
    this._mouse.y = -(e.clientY / innerHeight) * 2 + 1;
    this._raycaster.setFromCamera(this._mouse, this.camera);
    return this._raycaster.intersectObjects(this._btns.map(b => b.mesh));
  }

  _onClick(e) {
    const hits = this._pick(e);
    if (!hits.length) return;
    const btn = this._btns.find(b => b.mesh === hits[0].object);
    if (btn) this.manager.navigateTo(btn.target);
  }

  _onHover(e) {
    const hits    = this._pick(e);
    const hitMesh = hits.length ? hits[0].object : null;
    this._btns.forEach(b => b.draw(b.mesh === hitMesh));
    this.renderer.domElement.style.cursor = hitMesh ? 'pointer' : 'default';
  }

  // ── Update mỗi frame ─────────────────────────────────────────
  update(_dt) {
    if (this._particles) this._particles.rotation.y += _dt * 0.015;
  }
}
