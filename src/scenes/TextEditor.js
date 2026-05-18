// TextEditor.js
import * as THREE from 'three';

/**
 * Text Editor - Ho tro text khong khung, day du dinh dang
 * Co the dat len tuong va chinh sua sau khi click
 */
export class TextEditor {
  constructor(scene, modelMeshes, toastCallback) {
    this.scene = scene;
    this.modelMeshes = modelMeshes;
    this.toast = toastCallback || ((msg) => console.log(msg));

    this.texts = [];
    this.selectedText = null;
    this.selectedTextIndex = -1;

    this.isPlaceMode = false;
    this.previewGroup = null;
    this.previewPlane = null;
    this.previewMaterial = null;
    this.previewTexture = null;
    this.currentPreviewHit = null;

    this.tempCanvas = document.createElement('canvas');
    this.ctx = this.tempCanvas.getContext('2d');

    this.cssInjected = false;
    this.panel = null;
    this.previewMouseMoveHandler = null;

    // Callback bên ngoài (StudioScene) đặt vào để nhận thông báo khi texts thay đổi
    this.onTextsChanged = null;
  }

  injectCSS() {
    if (this.cssInjected) return;

    const style = document.createElement('style');
    style.textContent = `
      #advanced-text-panel {
        transform: scale(0.8);
        transform-origin: top right;
        position: fixed;
        right: 436px;
        top: 137px;
        width: 470px;
        max-height: 90vh;
        overflow-y: auto;
        background: linear-gradient(180deg, rgba(118,170,171,1), rgba(35,92,208,0.5));
        background-size: 100% 100%;
        border: none;
        border-radius: 12px;
        z-index: 100;
        padding: 20px 24px;
        display: none;
        flex-direction: column;
        gap: 10px;
        font-family: 'Montserrat', sans-serif;
        backdrop-filter: none;
        box-shadow: none;
        box-sizing: border-box;
      }
      #advanced-text-panel.open { display: flex; }
      #advanced-text-panel::-webkit-scrollbar { width: 6px; }
      #advanced-text-panel::-webkit-scrollbar-track { background: rgba(255,255,255,0.1); border-radius: 3px; }
      #advanced-text-panel::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.5); border-radius: 3px; }
      #advanced-text-panel::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.8); }

      #advanced-text-panel h3 {
        color: #FFFFFF;
        font-size: 18px;
        font-style: italic;
        font-family: 'Montserrat', sans-serif;
        letter-spacing: 0.1em;
        border-bottom: none;
        padding-bottom: 4px;
        margin: 0 0 4px 0;
      }
      .te-section { border-top: none; padding-top: 6px; margin-top: 2px; }
      .te-section-title {
        color: #FFFFFF;
        font-size: 13px;
        font-family: 'Montserrat', sans-serif;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        margin-bottom: 8px;
      }
      #text-preview-area {
        background: rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(212, 197, 169, 0.2);
        border-radius: 4px;
        padding: 12px;
        min-height: 100px;
        max-height: none;
        overflow-y: auto;
      }
      #text-preview {
        font-family: inherit;
        word-wrap: break-word;
        white-space: pre-wrap;
        margin: 0;
        padding: 0;
        transition: all 0.1s ease;
      }
      .te-textarea {
        width: 100%;
        background: rgba(255, 255, 255, 0.15);
        border: 1px solid rgba(255, 255, 255, 0.3);
        color: #FFFFFF;
        font-family: 'Montserrat', sans-serif;
        font-size: 15px;
        padding: 8px 10px;
        border-radius: 4px;
        outline: none;
        resize: none;
        min-height: 100px;
        box-sizing: border-box;
      }
      .te-textarea:focus { border-color: #FFFFFF; }
      .te-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
      .te-label {
        color: #FFFFFF;
        font-size: 13px;
        font-family: 'Montserrat', sans-serif;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        min-width: 55px;
      }
      .te-input {
        flex: 1;
        background: rgba(255, 255, 255, 0.15);
        border: 1px solid rgba(255, 255, 255, 0.3);
        color: #FFFFFF;
        font-family: 'Montserrat', sans-serif;
        font-size: 14px;
        padding: 5px 8px;
        border-radius: 3px;
        outline: none;
      }
      .te-input:focus { border-color: #FFFFFF; }
      .te-color {
        width: 40px; height: 28px;
        border: 1px solid rgba(212, 197, 169, 0.3);
        border-radius: 3px; cursor: pointer; background: none;
      }
      .te-range {
        flex: 1; -webkit-appearance: none; height: 2px;
        background: rgba(212, 197, 169, 0.2); border-radius: 1px; outline: none;
      }
      .te-range::-webkit-slider-thumb {
        -webkit-appearance: none; width: 10px; height: 10px;
        border-radius: 50%; background: #c8a96e; cursor: pointer;
      }
      .te-btn {
        background: rgba(255, 255, 255, 0.15);
        border: 1px solid rgba(255, 255, 255, 0.3);
        color: #FFFFFF; font-family: 'Montserrat', sans-serif;
        font-size: 14px; padding: 6px 12px; cursor: pointer;
        border-radius: 3px; transition: all 0.2s;
        display: inline-flex; align-items: center; gap: 4px;
      }
      .te-btn:hover { background: rgba(255, 255, 255, 0.28); border-color: #FFFFFF; color: #fff; }
      .te-btn.primary { background: rgba(200, 169, 110, 0.15); border-color: rgba(200, 169, 110, 0.5); color: #c8a96e; }
      .te-btn.primary:hover { background: rgba(200, 169, 110, 0.3); color: #fff; }
      .te-btn.danger { border-color: rgba(181, 74, 58, 0.4); color: rgba(181, 74, 58, 0.8); }
      .te-btn.danger:hover { background: rgba(181, 74, 58, 0.15); color: #ffaaaa; }
      .te-toolbar {
        display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px;
        padding: 5px; background: rgba(0, 0, 0, 0.3); border-radius: 4px;
      }
      .te-tool-btn {
        background: rgba(255, 255, 255, 0.15); border: 1px solid rgba(255, 255, 255, 0.2);
        color: #FFFFFF; font-size: 15px; font-family: 'Montserrat', sans-serif;
        padding: 4px 8px; cursor: pointer; border-radius: 2px; transition: all 0.15s;
      }
      .te-tool-btn:hover, .te-tool-btn.active { background: rgba(255, 255, 255, 0.3); border-color: #FFFFFF; color: #fff; }
      #advanced-text-list { max-height: 180px; overflow-y: auto; margin-top: 8px; }
      .text-list-item {
        display: flex; align-items: center; justify-content: space-between;
        padding: 6px 8px; margin-bottom: 4px;
        background: rgba(212, 197, 169, 0.04); border: 1px solid rgba(212, 197, 169, 0.1);
        border-radius: 3px; cursor: pointer; transition: all 0.15s;
      }
      .text-list-item:hover, .text-list-item.active { background: rgba(200, 169, 110, 0.1); border-color: #c8a96e; }
      .text-list-preview {
        font-size: 14px; font-family: 'Montserrat', sans-serif; color: #FFFFFF;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px;
      }
      .text-list-remove {
        background: rgba(181, 74, 58, 0.6); color: #fff; border: none;
        font-size: 8px; padding: 2px 6px; border-radius: 2px; cursor: pointer;
      }
      .text-list-remove:hover { background: rgba(181, 74, 58, 0.9); }
      .align-group { display: flex; gap: 2px; background: rgba(0,0,0,0.3); border-radius: 3px; padding: 2px; }
      .align-btn { background: transparent; border: none; color: #FFFFFF; font-size: 16px; padding: 4px 8px; cursor: pointer; border-radius: 2px; }
      .align-btn:hover, .align-btn.active { background: rgba(255, 255, 255, 0.2); color: #FFFFFF; }
    `;
    document.head.appendChild(style);
    this.cssInjected = true;
  }

  buildPanel() {
    this.injectCSS();

    const panel = document.createElement('div');
    panel.id = 'advanced-text-panel';
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <h3 style="margin:0;">&#128221; Advanced Text Editor</h3>
        <button id="te-close-panel" style="background:none;border:none;color:rgba(255,255,255,0.7);font-size:20px;cursor:pointer;line-height:1;padding:0 2px;" title="Dong panel">&#10005;</button>
      </div>

      <textarea id="te-content-input" class="te-textarea" placeholder="Nhap noi dung text (toi da 2000 tu)..."></textarea>
      <div style="font-size: 7px; color: #555; text-align: right;"><span id="te-word-count">0</span>/2000 tu</div>

      <div class="te-section">
        <div class="te-section-title">Preview</div>
        <div id="text-preview-area">
          <div id="text-preview">Text preview will appear here</div>
        </div>
      </div>

      <div class="te-section">
        <div class="te-section-title">Font Style</div>
        <div class="te-toolbar">
          <button class="te-tool-btn" id="te-bold" data-style="bold"><b>B</b></button>
          <button class="te-tool-btn" id="te-italic" data-style="italic"><i>I</i></button>
          <button class="te-tool-btn" id="te-underline" data-style="underline"><u>U</u></button>
        </div>
        <div class="te-row">
          <span class="te-label">Mau chu</span>
          <input type="color" id="te-text-color" class="te-color" value="#ffffff">
          <span class="te-label">Co chu</span>
          <input type="range" id="te-font-size" class="te-range" min="0.3" max="2.5" step="0.01" value="0.8">
          <span id="te-font-size-val" style="color:#7a6e5c;font-size:9px;width:35px">0.80</span>
        </div>
        <div class="te-row">
          <span class="te-label">Do rong</span>
          <input type="range" id="te-box-width" class="te-range" min="0.5" max="8" step="0.1" value="2.4">
          <span id="te-box-width-val" style="color:#7a6e5c;font-size:9px;width:35px">2.40</span>
        </div>
      </div>

      <div class="te-section">
        <div class="te-section-title">Alignment</div>
        <div class="align-group">
          <button class="align-btn" id="te-align-left" data-align="left">Trai</button>
          <button class="align-btn" id="te-align-center" data-align="center">Giua</button>
          <button class="align-btn" id="te-align-right" data-align="right">Phai</button>
        </div>
      </div>

      <div class="te-section">
        <div class="te-section-title">Effects</div>
        <div class="te-row">
          <span class="te-label">Outline</span>
          <input type="color" id="te-outline-color" class="te-color" value="#000000">
          <input type="range" id="te-outline-width" min="0" max="8" step="0.5" value="0">
          <span id="te-outline-val" style="color:#7a6e5c;font-size:9px;width:30px">0</span>
        </div>
        <div class="te-row">
          <span class="te-label">Do bong</span>
          <input type="range" id="te-shadow-blur" min="0" max="20" step="0.5" value="0">
          <span id="te-shadow-val" style="color:#7a6e5c;font-size:9px;width:35px">0</span>
        </div>
      </div>

      <div id="position-controls" style="display:none;"></div>

      <div class="te-row" style="gap: 8px; margin-top: 5px;">
        <button class="te-btn primary" id="te-start-placing">Bat dau dat chu len tuong</button>
        <button class="te-btn danger" id="te-cancel">Huy</button>
      </div>

      <hr style="border-color: rgba(212,197,169,0.1); margin: 8px 0;">

      <div class="te-section">
        <div class="te-section-title">Danh sach text</div>
        <div id="advanced-text-list"></div>
        <button class="te-btn danger" id="te-clear-all" style="width:100%; margin-top: 8px;">Xoa het text</button>
      </div>
    `;

    document.body.appendChild(panel);
    this.panel = panel;
    this.bindEvents();
    return panel;
  }

  bindEvents() {
    const contentInput = document.getElementById('te-content-input');
    const wordCountSpan = document.getElementById('te-word-count');

    const updatePreview = () => {
      this.updatePreview();
      if (this.isPlaceMode) {
        this.updatePreviewTexture();
      }
    };

    contentInput.addEventListener('input', () => {
      const text = contentInput.value;
      const wordCount = text.length;
      wordCountSpan.textContent = Math.min(wordCount, 2000);
      if (wordCount > 2000) {
        contentInput.value = text.substring(0, 2000);
        wordCountSpan.textContent = 2000;
        this.toast('Da dat gioi han 2000 tu', 'error');
      }
      updatePreview();
    });

    document.getElementById('te-bold')?.addEventListener('click', () => this.toggleStyle('bold'));
    document.getElementById('te-italic')?.addEventListener('click', () => this.toggleStyle('italic'));
    document.getElementById('te-underline')?.addEventListener('click', () => this.toggleStyle('underline'));

    document.getElementById('te-text-color')?.addEventListener('input', () => updatePreview());
    document.getElementById('te-font-size')?.addEventListener('input', (e) => {
      document.getElementById('te-font-size-val').textContent = (+e.target.value).toFixed(2);
      updatePreview();
    });
    document.getElementById('te-box-width')?.addEventListener('input', (e) => {
      document.getElementById('te-box-width-val').textContent = (+e.target.value).toFixed(2);
      updatePreview();
    });

    document.getElementById('te-align-left')?.addEventListener('click', () => this.setAlignment('left'));
    document.getElementById('te-align-center')?.addEventListener('click', () => this.setAlignment('center'));
    document.getElementById('te-align-right')?.addEventListener('click', () => this.setAlignment('right'));

    document.getElementById('te-outline-width')?.addEventListener('input', (e) => {
      document.getElementById('te-outline-val').textContent = e.target.value;
      updatePreview();
    });
    document.getElementById('te-outline-color')?.addEventListener('input', () => updatePreview());

    document.getElementById('te-shadow-blur')?.addEventListener('input', (e) => {
      document.getElementById('te-shadow-val').textContent = e.target.value;
      updatePreview();
    });

    document.getElementById('te-start-placing')?.addEventListener('click', () => {
      const content = document.getElementById('te-content-input')?.value || '';
      if (!content.trim()) {
        this.toast('Vui long nhap noi dung text truoc', 'error');
        return;
      }
      this.enterPlaceModeWithPreview();
    });

    document.getElementById('te-cancel')?.addEventListener('click', () => {
      this.closePanel();
      this.exitPlaceMode();
      this.selectedTextIndex = -1;
      this.selectedText = null;
      document.getElementById('position-controls').style.display = 'none';
      this.resetForm();
    });

    document.getElementById('te-clear-all')?.addEventListener('click', () => this.clearAllTexts());

    document.getElementById('te-close-panel')?.addEventListener('click', () => this.closePanel());
  }

  toggleStyle(style) {
    const btn = document.getElementById(`te-${style}`);
    if (btn) btn.classList.toggle('active');
    this.updatePreview();
  }

  setAlignment(align) {
    ['left', 'center', 'right'].forEach(a => {
      const btn = document.getElementById(`te-align-${a}`);
      if (btn) btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(`te-align-${align}`);
    if (activeBtn) activeBtn.classList.add('active');
    this.updatePreview();
  }

  getCurrentStyles() {
    return {
      color: document.getElementById('te-text-color')?.value || '#ffffff',
      fontSize: parseFloat(document.getElementById('te-font-size')?.value || 0.8),
      bold: document.getElementById('te-bold')?.classList.contains('active') || false,
      italic: document.getElementById('te-italic')?.classList.contains('active') || false,
      underline: document.getElementById('te-underline')?.classList.contains('active') || false,
      align: this.getActiveAlignment(),
      outlineWidth: parseFloat(document.getElementById('te-outline-width')?.value || 0),
      outlineColor: document.getElementById('te-outline-color')?.value || '#000000',
      shadowBlur: parseFloat(document.getElementById('te-shadow-blur')?.value || 0),
      boxWidth: parseFloat(document.getElementById('te-box-width')?.value || 2.4)
    };
  }

  getActiveAlignment() {
    if (document.getElementById('te-align-left')?.classList.contains('active')) return 'left';
    if (document.getElementById('te-align-center')?.classList.contains('active')) return 'center';
    if (document.getElementById('te-align-right')?.classList.contains('active')) return 'right';
    return 'center';
  }

  updatePreview() {
    const content = document.getElementById('te-content-input')?.value || '';
    const styles = this.getCurrentStyles();
    const previewDiv = document.getElementById('text-preview');
    if (!previewDiv) return;

    let cssText = `color: ${styles.color}; font-size: ${styles.fontSize * 16}px; `;
    cssText += `text-align: ${styles.align}; `;
    if (styles.bold) cssText += `font-weight: bold; `;
    if (styles.italic) cssText += `font-style: italic; `;
    if (styles.underline) cssText += `text-decoration: underline; `;
    if (styles.outlineWidth > 0) {
      cssText += `text-shadow: ${styles.outlineColor} 0px 0px ${styles.outlineWidth}px, `;
      cssText += `${styles.outlineColor} 0px 0px ${styles.outlineWidth}px, `;
      cssText += `${styles.outlineColor} 0px 0px ${styles.outlineWidth}px; `;
    }
    if (styles.shadowBlur > 0) {
      if (styles.outlineWidth > 0) {
        cssText += `text-shadow: ${styles.outlineColor} 0px 0px ${styles.outlineWidth}px, rgba(0,0,0,${Math.min(styles.shadowBlur/20, 0.5)}) 2px 2px ${styles.shadowBlur}px; `;
      } else {
        cssText += `text-shadow: rgba(0,0,0,${Math.min(styles.shadowBlur/20, 0.5)}) 2px 2px ${styles.shadowBlur}px; `;
      }
    }
    previewDiv.style.cssText = cssText;
    previewDiv.textContent = content || 'Preview...';
  }

  /**
   * Ham noi bo chung: ve text len canvas voi resolution tuy chinh.
   * Tat ca tham so ty le theo PX_PER_UNIT nen preview (256) va final (512)
   * cho ket qua hoan toan giong nhau trong khong gian 3D.
   */
  _createTextCanvas(content, styles, PX_PER_UNIT) {
    const BASE_PX = 512;
    const scale = PX_PER_UNIT / BASE_PX;

    const planeWidth3D = styles.boxWidth || 2.4;
    const canvasWidth = Math.max(Math.round(128 * scale), Math.round(planeWidth3D * PX_PER_UNIT));

    // baseFontSize ty le voi scale de giu nguyen kich thuoc chu trong 3D
    const baseFontSize = Math.floor(120 * scale * styles.fontSize);
    let fontString = '';
    if (styles.bold) fontString += 'bold ';
    if (styles.italic) fontString += 'italic ';
    fontString += `${baseFontSize}px "Segoe UI", "Arial", "Helvetica Neue", sans-serif`;

    // Pass 1: do wrapping bang temp canvas
    const measureCtx = this.ctx;
    measureCtx.font = fontString;
    const margin = Math.round(40 * scale);
    const maxWidth = canvasWidth - margin * 2;

    const paragraphs = content.split('\n');
    const lines = [];
    for (const para of paragraphs) {
      if (para === '') { lines.push(''); continue; }
      let currentLine = '';
      for (const char of para) {
        const testLine = currentLine + char;
        if (measureCtx.measureText(testLine).width > maxWidth && currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = char;
        } else {
          currentLine = testLine;
        }
      }
      lines.push(currentLine);
    }

    const lineHeight = baseFontSize * 1.3;
    const padding = Math.round(baseFontSize * 0.4);
    const canvasHeight = Math.max(Math.round(baseFontSize * 2), Math.round(lines.length * lineHeight + padding * 2));

    // Pass 2: ve len canvas that
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.font = fontString;

    lines.forEach((line, idx) => {
      if (!line) return;
      const y = padding + idx * lineHeight + lineHeight / 2;
      let x;
      switch (styles.align) {
        case 'left': x = margin; break;
        case 'right': x = canvasWidth - margin; break;
        default: x = canvasWidth / 2; break;
      }

      ctx.save();
      ctx.fillStyle = styles.color;
      ctx.textAlign = styles.align;
      ctx.textBaseline = 'middle';

      if (styles.outlineWidth > 0) {
        ctx.lineWidth = styles.outlineWidth * scale;
        ctx.strokeStyle = styles.outlineColor;
        ctx.strokeText(line, x, y);
      }

      if (styles.shadowBlur > 0) {
        ctx.shadowColor = 'rgba(0,0,0,' + Math.min(styles.shadowBlur / 20, 0.5) + ')';
        ctx.shadowBlur = styles.shadowBlur * scale;
        ctx.shadowOffsetX = 2 * scale;
        ctx.shadowOffsetY = 2 * scale;
      }

      ctx.fillText(line, x, y);

      if (styles.underline) {
        const metrics = ctx.measureText(line);
        const underlineY = y + baseFontSize * 0.15;
        ctx.beginPath();
        if (styles.align === 'left') {
          ctx.moveTo(x, underlineY);
          ctx.lineTo(x + metrics.width, underlineY);
        } else if (styles.align === 'right') {
          ctx.moveTo(x - metrics.width, underlineY);
          ctx.lineTo(x, underlineY);
        } else {
          ctx.moveTo(x - metrics.width / 2, underlineY);
          ctx.lineTo(x + metrics.width / 2, underlineY);
        }
        ctx.strokeStyle = styles.color;
        ctx.lineWidth = Math.max(scale, baseFontSize * 0.08);
        ctx.stroke();
      }

      ctx.restore();
    });

    const planeHeight3D = (canvasHeight / canvasWidth) * planeWidth3D;
    return { canvas, planeWidth: planeWidth3D, planeHeight: planeHeight3D };
  }

  /**
   * Tao canvas texture chat luong cao de dat len tuong (512px/don vi 3D)
   */
  createTextTexture(content, styles) {
    const { canvas, planeWidth, planeHeight } = this._createTextCanvas(content, styles, 512);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return { texture, canvas, width: canvas.width, height: canvas.height, planeWidth, planeHeight };
  }

  /**
   * Tao preview texture do phan giai thap hon (256px/don vi 3D).
   * Dung cung ham _createTextCanvas nen trong giong het voi final.
   */
  createPreviewTexture(content, styles) {
    const { canvas, planeWidth, planeHeight } = this._createTextCanvas(content, styles, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return { texture, canvas, planeWidth, planeHeight };
  }

  createPreviewGroup(content, styles, position, normal) {
    const { texture, planeWidth, planeHeight } = this.createPreviewTexture(content, styles);

    const group = new THREE.Group();
    group.position.copy(position);

    const angle = Math.atan2(normal.x, normal.z);
    group.rotation.y = angle;

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      opacity: 0.85
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(planeWidth, planeHeight), material);
    group.add(plane);

    return { group, plane, material, texture };
  }

  updatePreviewTexture() {
    if (!this.isPlaceMode || !this.currentPreviewHit) return;

    const content = document.getElementById('te-content-input')?.value || '';
    if (!content.trim()) return;

    const styles = this.getCurrentStyles();
    const position = this.currentPreviewHit.point.clone();
    const normal = this.currentPreviewHit.normal.clone();
    position.add(normal.clone().multiplyScalar(0.05));

    this.updatePreviewGroup(content, styles, position, normal);
  }

  updatePreviewGroup(content, styles, position, normal) {
    if (this.previewGroup) {
      this.scene.remove(this.previewGroup);
      if (this.previewMaterial) this.previewMaterial.dispose();
      if (this.previewTexture) this.previewTexture.dispose();
    }

    const { group, plane, material, texture } = this.createPreviewGroup(content, styles, position, normal);
    this.previewGroup = group;
    this.previewPlane = plane;
    this.previewMaterial = material;
    this.previewTexture = texture;
    this.scene.add(this.previewGroup);
  }

  clearPreview() {
    if (this.previewGroup) {
      this.scene.remove(this.previewGroup);
      if (this.previewMaterial) this.previewMaterial.dispose();
      if (this.previewTexture) this.previewTexture.dispose();
      this.previewGroup = null;
      this.previewPlane = null;
      this.previewMaterial = null;
      this.previewTexture = null;
    }
    this.currentPreviewHit = null;
  }

  enterPlaceModeWithPreview() {
    const content = document.getElementById('te-content-input')?.value || '';
    if (!content.trim()) {
      this.toast('Vui long nhap noi dung text truoc', 'error');
      return;
    }

    this.exitPlaceMode();
    this.isPlaceMode = true;
    this.openPanel();
    this.toast('Di chuot len tuong de xem truoc, click de dat chu', 'info');
  }

  exitPlaceMode() {
    this.isPlaceMode = false;
    this.clearPreview();
  }

  updatePreviewOnMouseMove(raycaster, camera, mouse, modelMeshes) {
    if (!this.isPlaceMode) return false;

    const content = document.getElementById('te-content-input')?.value || '';
    if (!content.trim()) {
      if (this.previewGroup) this.clearPreview();
      return false;
    }

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(modelMeshes, true);

    if (hits.length) {
      const hit = hits[0];
      const point = hit.point.clone();
      const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
      point.add(normal.clone().multiplyScalar(0.05));

      const styles = this.getCurrentStyles();

      if (!this.currentPreviewHit ||
          Math.abs(this.currentPreviewHit.point.x - point.x) > 0.01 ||
          Math.abs(this.currentPreviewHit.point.y - point.y) > 0.01 ||
          Math.abs(this.currentPreviewHit.point.z - point.z) > 0.01) {

        this.currentPreviewHit = { point, normal };
        this.updatePreviewGroup(content, styles, point, normal);
      }
      return true;
    } else {
      if (this.previewGroup) this.clearPreview();
      return false;
    }
  }

  handleCanvasClick(raycaster, camera, mouse, modelMeshes) {
    if (this.isPlaceMode && this.currentPreviewHit) {
      const content = document.getElementById('te-content-input')?.value || '';
      if (!content.trim()) {
        this.toast('Vui long nhap noi dung text', 'error');
        return true;
      }

      const styles = this.getCurrentStyles();
      const position = this.currentPreviewHit.point;
      const normal = this.currentPreviewHit.normal;

      this.placeTextOnWall(content, styles, position, normal);
      this.toast('Da dat text len tuong', 'success');

      this.clearPreview();
      this.toast('Tiep tuc di chuot va click de dat them text', 'info');
      return true;
    }

    return false;
  }

  createTextGroup(content, styles, position, normal) {
    const { texture, canvas, planeWidth, planeHeight } = this.createTextTexture(content, styles);

    const group = new THREE.Group();
    group.position.copy(position);

    const angle = Math.atan2(normal.x, normal.z);
    group.rotation.y = angle;

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(planeWidth, planeHeight), material);
    group.add(plane);

    return { group, plane, material, texture, canvas };
  }

  placeTextOnWall(content, styles, position, normal) {
    const { group, plane, material, texture, canvas } = this.createTextGroup(content, styles, position, normal);
    this.scene.add(group);

    const textObj = {
      group: group,
      plane: plane,
      material: material,
      texture: texture,
      canvas: canvas,
      data: {
        content: content,
        styles: { ...styles },
        position: { x: position.x, y: position.y, z: position.z },
        rotation: group.rotation.y,
        normal: { x: normal.x, y: normal.y, z: normal.z }
      }
    };

    this.texts.push(textObj);
    this.renderTextList();
    this.onTextsChanged?.();
    return textObj;
  }

  updateTextAtIndex(index, content, styles) {
    if (index < 0 || index >= this.texts.length) return null;

    const oldText = this.texts[index];
    const oldPos = oldText.data.position;
    const oldNormal = oldText.data.normal;

    this.scene.remove(oldText.group);
    if (oldText.texture) oldText.texture.dispose();
    if (oldText.material) oldText.material.dispose();

    const pos = new THREE.Vector3(oldPos.x, oldPos.y, oldPos.z);
    const normal = new THREE.Vector3(oldNormal.x, oldNormal.y, oldNormal.z);

    const { group, plane, material, texture, canvas } = this.createTextGroup(content, styles, pos, normal);
    this.scene.add(group);

    this.texts[index] = {
      group: group,
      plane: plane,
      material: material,
      texture: texture,
      canvas: canvas,
      data: {
        content: content,
        styles: { ...styles },
        position: oldPos,
        rotation: group.rotation.y,
        normal: oldNormal
      }
    };

    this.renderTextList();
    this.onTextsChanged?.();
    return this.texts[index];
  }

  selectTextForEdit(idx) {
    if (this.isPlaceMode) {
      this.exitPlaceMode();
    }

    const textObj = this.texts[idx];
    if (!textObj) return;

    this.selectedTextIndex = idx;
    this.selectedText = textObj;

    const data = textObj.data;
    document.getElementById('te-content-input').value = data.content;

    const styles = data.styles;
    document.getElementById('te-text-color').value = styles.color;
    document.getElementById('te-font-size').value = styles.fontSize;
    document.getElementById('te-font-size-val').textContent = styles.fontSize.toFixed(2);
    document.getElementById('te-outline-width').value = styles.outlineWidth;
    document.getElementById('te-outline-val').textContent = styles.outlineWidth;
    document.getElementById('te-shadow-blur').value = styles.shadowBlur;
    document.getElementById('te-shadow-val').textContent = styles.shadowBlur;
    const bw = styles.boxWidth || 2.4;
    document.getElementById('te-box-width').value = bw;
    document.getElementById('te-box-width-val').textContent = bw.toFixed(2);

    const boldBtn = document.getElementById('te-bold');
    const italicBtn = document.getElementById('te-italic');
    const underlineBtn = document.getElementById('te-underline');
    if (styles.bold) boldBtn?.classList.add('active');
    else boldBtn?.classList.remove('active');
    if (styles.italic) italicBtn?.classList.add('active');
    else italicBtn?.classList.remove('active');
    if (styles.underline) underlineBtn?.classList.add('active');
    else underlineBtn?.classList.remove('active');

    this.setAlignment(styles.align);
    this.updatePreview();

    document.getElementById('position-controls').style.display = 'flex';
    this.openPanel();
    this.renderTextList();

    const startBtn = document.getElementById('te-start-placing');
    if (startBtn) {
      startBtn.textContent = 'Cap nhat text';
      startBtn.style.borderColor = '#6aaa7a';
      startBtn.style.color = '#6aaa7a';
    }

    this.toast('Da chon text, chinh sua va nhan "Cap nhat text" de luu', 'info');
  }

  applyUpdateToSelected() {
    const content = document.getElementById('te-content-input')?.value || '';
    if (!content.trim()) {
      this.toast('Vui long nhap noi dung text', 'error');
      return false;
    }

    if (this.selectedTextIndex >= 0) {
      const styles = this.getCurrentStyles();
      this.updateTextAtIndex(this.selectedTextIndex, content, styles);
      this.toast('Da cap nhat text', 'success');
      this.selectedTextIndex = -1;
      this.selectedText = null;
      document.getElementById('position-controls').style.display = 'none';

      const startBtn = document.getElementById('te-start-placing');
      if (startBtn) {
        startBtn.textContent = 'Bat dau dat chu len tuong';
        startBtn.style.borderColor = '';
        startBtn.style.color = '';
      }

      this.closePanel();
      this.resetForm();
      return true;
    }

    return false;
  }

  moveSelectedText(dx, dy, dz) {
    if (this.selectedTextIndex < 0) return;
    const textObj = this.texts[this.selectedTextIndex];
    if (!textObj) return;

    textObj.group.position.x += dx;
    textObj.group.position.y += dy;
    textObj.group.position.z += dz;

    textObj.data.position = {
      x: textObj.group.position.x,
      y: textObj.group.position.y,
      z: textObj.group.position.z
    };
  }

  removeTextAtIndex(idx) {
    const textObj = this.texts[idx];
    if (!textObj) return;

    this.scene.remove(textObj.group);
    if (textObj.texture) textObj.texture.dispose();
    if (textObj.material) textObj.material.dispose();

    this.texts.splice(idx, 1);

    if (this.selectedTextIndex === idx) {
      this.selectedTextIndex = -1;
      this.selectedText = null;
      document.getElementById('position-controls').style.display = 'none';

      const startBtn = document.getElementById('te-start-placing');
      if (startBtn) {
        startBtn.textContent = 'Bat dau dat chu len tuong';
        startBtn.style.borderColor = '';
        startBtn.style.color = '';
      }
    } else if (this.selectedTextIndex > idx) {
      this.selectedTextIndex--;
    }

    this.renderTextList();
    this.onTextsChanged?.();
    this.toast('Da xoa text', 'info');
  }

  clearAllTexts() {
    this.texts.forEach(textObj => {
      this.scene.remove(textObj.group);
      if (textObj.texture) textObj.texture.dispose();
      if (textObj.material) textObj.material.dispose();
    });
    this.texts = [];
    this.selectedTextIndex = -1;
    this.selectedText = null;
    this.renderTextList();
    this.onTextsChanged?.();
    this.toast('Da xoa het text', 'info');
  }

  renderTextList() {
    const list = document.getElementById('advanced-text-list');
    if (!list) return;

    list.innerHTML = '';
    this.texts.forEach((txt, idx) => {
      const item = document.createElement('div');
      item.className = 'text-list-item' + (idx === this.selectedTextIndex ? ' active' : '');
      item.innerHTML = `
        <span class="text-list-preview">${txt.data.content.substring(0, 30)}${txt.data.content.length > 30 ? '...' : ''}</span>
        <button class="text-list-remove" data-idx="${idx}">X</button>
      `;
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('text-list-remove')) return;
        this.selectTextForEdit(idx);
      });
      list.appendChild(item);
    });

    list.querySelectorAll('.text-list-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx);
        this.removeTextAtIndex(idx);
      });
    });
  }

  resetForm() {
    const contentInput = document.getElementById('te-content-input');
    if (contentInput) contentInput.value = '';

    const textColor = document.getElementById('te-text-color');
    if (textColor) textColor.value = '#ffffff';

    const fontSize = document.getElementById('te-font-size');
    if (fontSize) {
      fontSize.value = '0.8';
      document.getElementById('te-font-size-val').textContent = '0.80';
    }

    const outlineWidth = document.getElementById('te-outline-width');
    if (outlineWidth) {
      outlineWidth.value = '0';
      document.getElementById('te-outline-val').textContent = '0';
    }

    const shadowBlur = document.getElementById('te-shadow-blur');
    if (shadowBlur) {
      shadowBlur.value = '0';
      document.getElementById('te-shadow-val').textContent = '0';
    }

    const boxWidth = document.getElementById('te-box-width');
    if (boxWidth) {
      boxWidth.value = '2.4';
      document.getElementById('te-box-width-val').textContent = '2.40';
    }

    const boldBtn = document.getElementById('te-bold');
    const italicBtn = document.getElementById('te-italic');
    const underlineBtn = document.getElementById('te-underline');
    if (boldBtn) boldBtn.classList.remove('active');
    if (italicBtn) italicBtn.classList.remove('active');
    if (underlineBtn) underlineBtn.classList.remove('active');

    this.setAlignment('center');

    const wordCountSpan = document.getElementById('te-word-count');
    if (wordCountSpan) wordCountSpan.textContent = '0';

    document.getElementById('position-controls').style.display = 'none';
    this.updatePreview();

    const startBtn = document.getElementById('te-start-placing');
    if (startBtn) {
      startBtn.textContent = 'Bat dau dat chu len tuong';
      startBtn.style.borderColor = '';
      startBtn.style.color = '';
    }
  }

  openPanel() {
    if (this.panel) {
      this.panel.classList.add('open');
    }
    this.renderTextList();
  }

  closePanel() {
    if (this.panel) {
      this.panel.classList.remove('open');
    }
  }

  togglePanel() {
    if (this.panel) {
      if (this.panel.classList.contains('open')) {
        this.closePanel();
        this.exitPlaceMode();
        this.selectedTextIndex = -1;
        this.selectedText = null;
        document.getElementById('position-controls').style.display = 'none';
        this.resetForm();
      } else {
        this.openPanel();
        this.resetForm();
      }
    }
  }

  getSaveData() {
    return this.texts.map(t => ({
      x: t.group.position.x,
      y: t.group.position.y,
      z: t.group.position.z,
      rotY: t.group.rotation.y,
      rotZ: t.group.rotation.z,
      scale: t.group.scale.x,
      normalX: t.data.normal.x,
      normalY: t.data.normal.y,
      normalZ: t.data.normal.z,
      content: t.data.content,
      styles: t.data.styles
    }));
  }

  async loadFromData(textsData) {
    if (!textsData || !textsData.length) return;

    for (const t of textsData) {
      const pos = new THREE.Vector3(t.x, t.y, t.z);
      const normal = new THREE.Vector3(
        t.normalX !== undefined ? t.normalX : Math.sin(t.rotation || 0),
        t.normalY !== undefined ? t.normalY : 0,
        t.normalZ !== undefined ? t.normalZ : Math.cos(t.rotation || 0)
      );
      const { group, plane, material, texture, canvas } = this.createTextGroup(
        t.content, t.styles, pos, normal
      );
      this.scene.add(group);
      if (t.rotZ) group.rotation.z = t.rotZ;
      if (t.scale && t.scale !== 1) group.scale.setScalar(t.scale);

      this.texts.push({
        group: group,
        plane: plane,
        material: material,
        texture: texture,
        canvas: canvas,
        data: {
          content: t.content,
          styles: { ...t.styles },
          position: { x: t.x, y: t.y, z: t.z },
          rotation: group.rotation.y,
          normal: { x: normal.x, y: normal.y, z: normal.z }
        }
      });
    }

    this.renderTextList();
    this.onTextsChanged?.();
  }

  dispose() {
    this.exitPlaceMode();

    this.texts.forEach(textObj => {
      this.scene.remove(textObj.group);
      if (textObj.texture) textObj.texture.dispose();
      if (textObj.material) textObj.material.dispose();
    });

    if (this.panel && this.panel.parentNode) {
      this.panel.parentNode.removeChild(this.panel);
    }
  }
}
