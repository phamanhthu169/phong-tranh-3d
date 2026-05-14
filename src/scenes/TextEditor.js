// TextEditor.js
import * as THREE from 'three';

/**
 * Text Editor - Hỗ trợ text không khung, đầy đủ định dạng
 * Có thể đặt lên tường và chỉnh sửa sau khi click
 */
export class TextEditor {
  constructor(scene, modelMeshes, toastCallback) {
    this.scene = scene;
    this.modelMeshes = modelMeshes;
    this.toast = toastCallback || ((msg) => console.log(msg));
    
    // Danh sách text objects
    this.texts = [];
    
    // Text đang được chọn để chỉnh sửa
    this.selectedText = null;
    this.selectedTextIndex = -1;
    
    // Chế độ đặt text với preview
    this.isPlaceMode = false;
    this.previewGroup = null;
    this.previewPlane = null;
    this.previewMaterial = null;
    this.previewTexture = null;
    this.currentPreviewHit = null;
    
    // Canvas chung để tạo texture
    this.tempCanvas = document.createElement('canvas');
    this.ctx = this.tempCanvas.getContext('2d');
    
    // Đã inject CSS chưa
    this.cssInjected = false;
    this.panel = null;
    
    // Mouse move handler reference
    this.previewMouseMoveHandler = null;
  }
  
  /**
   * Inject CSS cho text editor panel
   */
  injectCSS() {
    if (this.cssInjected) return;
    
    const style = document.createElement('style');
    style.textContent = `
      /* Text Editor Panel Styles */
      #advanced-text-panel {
        position: fixed;
        right: 20px;
        top: 60px;
        width: 380px;
        background: rgba(15, 13, 12, 0.98);
        border: 1px solid rgba(212, 197, 169, 0.25);
        border-radius: 8px;
        z-index: 100;
        padding: 16px;
        display: none;
        flex-direction: column;
        gap: 12px;
        font-family: monospace;
        backdrop-filter: blur(8px);
        max-height: 85vh;
        overflow-y: auto;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      }
      #advanced-text-panel.open { display: flex; }
      
      #advanced-text-panel h3 {
        color: #c8a96e;
        font-size: 14px;
        font-style: italic;
        letter-spacing: 0.1em;
        border-bottom: 1px solid rgba(212, 197, 169, 0.2);
        padding-bottom: 8px;
        margin: 0 0 4px 0;
      }
      
      .te-section {
        border-top: 1px solid rgba(212, 197, 169, 0.1);
        padding-top: 10px;
        margin-top: 4px;
      }
      
      .te-section-title {
        color: #7a6e5c;
        font-size: 9px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        margin-bottom: 8px;
      }
      
      /* Text preview area */
      #text-preview-area {
        background: rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(212, 197, 169, 0.2);
        border-radius: 4px;
        padding: 12px;
        min-height: 100px;
        max-height: 150px;
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
      
      /* Text input */
      .te-textarea {
        width: 100%;
        background: rgba(212, 197, 169, 0.08);
        border: 1px solid rgba(212, 197, 169, 0.2);
        color: #d4c5a9;
        font-family: monospace;
        font-size: 11px;
        padding: 8px 10px;
        border-radius: 4px;
        outline: none;
        resize: vertical;
        box-sizing: border-box;
      }
      .te-textarea:focus {
        border-color: #c8a96e;
      }
      
      /* Controls row */
      .te-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        flex-wrap: wrap;
      }
      .te-label {
        color: #7a6e5c;
        font-size: 9px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        min-width: 55px;
      }
      .te-input {
        flex: 1;
        background: rgba(212, 197, 169, 0.08);
        border: 1px solid rgba(212, 197, 169, 0.2);
        color: #d4c5a9;
        font-family: monospace;
        font-size: 10px;
        padding: 5px 8px;
        border-radius: 3px;
        outline: none;
      }
      .te-input:focus {
        border-color: #c8a96e;
      }
      .te-color {
        width: 40px;
        height: 28px;
        border: 1px solid rgba(212, 197, 169, 0.3);
        border-radius: 3px;
        cursor: pointer;
        background: none;
      }
      .te-range {
        flex: 1;
        -webkit-appearance: none;
        height: 2px;
        background: rgba(212, 197, 169, 0.2);
        border-radius: 1px;
        outline: none;
      }
      .te-range::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #c8a96e;
        cursor: pointer;
      }
      
      /* Buttons */
      .te-btn {
        background: rgba(212, 197, 169, 0.08);
        border: 1px solid rgba(212, 197, 169, 0.2);
        color: #d4c5a9;
        font-family: monospace;
        font-size: 10px;
        padding: 6px 12px;
        cursor: pointer;
        border-radius: 3px;
        transition: all 0.2s;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .te-btn:hover {
        background: rgba(212, 197, 169, 0.18);
        border-color: #c8a96e;
        color: #fff;
      }
      .te-btn.primary {
        background: rgba(200, 169, 110, 0.15);
        border-color: rgba(200, 169, 110, 0.5);
        color: #c8a96e;
      }
      .te-btn.primary:hover {
        background: rgba(200, 169, 110, 0.3);
        color: #fff;
      }
      .te-btn.danger {
        border-color: rgba(181, 74, 58, 0.4);
        color: rgba(181, 74, 58, 0.8);
      }
      .te-btn.danger:hover {
        background: rgba(181, 74, 58, 0.15);
        color: #ffaaaa;
      }
      
      /* Toolbar buttons group */
      .te-toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-bottom: 8px;
        padding: 5px;
        background: rgba(0, 0, 0, 0.3);
        border-radius: 4px;
      }
      .te-tool-btn {
        background: rgba(212, 197, 169, 0.08);
        border: 1px solid rgba(212, 197, 169, 0.15);
        color: #d4c5a9;
        font-size: 11px;
        padding: 4px 8px;
        cursor: pointer;
        border-radius: 2px;
        transition: all 0.15s;
      }
      .te-tool-btn:hover, .te-tool-btn.active {
        background: rgba(200, 169, 110, 0.25);
        border-color: #c8a96e;
        color: #fff;
      }
      
      /* Text list */
      #advanced-text-list {
        max-height: 180px;
        overflow-y: auto;
        margin-top: 8px;
      }
      .text-list-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 8px;
        margin-bottom: 4px;
        background: rgba(212, 197, 169, 0.04);
        border: 1px solid rgba(212, 197, 169, 0.1);
        border-radius: 3px;
        cursor: pointer;
        transition: all 0.15s;
      }
      .text-list-item:hover, .text-list-item.active {
        background: rgba(200, 169, 110, 0.1);
        border-color: #c8a96e;
      }
      .text-list-preview {
        font-size: 10px;
        color: #d4c5a9;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 220px;
      }
      .text-list-remove {
        background: rgba(181, 74, 58, 0.6);
        color: #fff;
        border: none;
        font-size: 8px;
        padding: 2px 6px;
        border-radius: 2px;
        cursor: pointer;
      }
      .text-list-remove:hover {
        background: rgba(181, 74, 58, 0.9);
      }
      
      /* Alignment buttons group */
      .align-group {
        display: flex;
        gap: 2px;
        background: rgba(0, 0, 0, 0.3);
        border-radius: 3px;
        padding: 2px;
      }
      .align-btn {
        background: transparent;
        border: none;
        color: #7a6e5c;
        font-size: 12px;
        padding: 4px 8px;
        cursor: pointer;
        border-radius: 2px;
      }
      .align-btn:hover, .align-btn.active {
        background: rgba(200, 169, 110, 0.2);
        color: #c8a96e;
      }
    `;
    document.head.appendChild(style);
    this.cssInjected = true;
  }
  
  /**
   * Xây dựng panel UI
   */
  buildPanel() {
    this.injectCSS();
    
    const panel = document.createElement('div');
    panel.id = 'advanced-text-panel';
    panel.innerHTML = `
      <h3>📝 Advanced Text Editor</h3>
      
      <!-- Text input area -->
      <textarea id="te-content-input" class="te-textarea" rows="4" placeholder="Nhập nội dung text (tối đa 2000 từ)..."></textarea>
      <div style="font-size: 7px; color: #555; text-align: right;"><span id="te-word-count">0</span>/2000 từ</div>
      
      <!-- Preview area -->
      <div class="te-section">
        <div class="te-section-title">🔍 Preview</div>
        <div id="text-preview-area">
          <div id="text-preview">Text preview will appear here</div>
        </div>
      </div>
      
      <!-- Font styles toolbar -->
      <div class="te-section">
        <div class="te-section-title">✏️ Font Style</div>
        <div class="te-toolbar">
          <button class="te-tool-btn" id="te-bold" data-style="bold"><b>B</b></button>
          <button class="te-tool-btn" id="te-italic" data-style="italic"><i>I</i></button>
          <button class="te-tool-btn" id="te-underline" data-style="underline"><u>U</u></button>
        </div>
        
        <div class="te-row">
          <span class="te-label">Màu chữ</span>
          <input type="color" id="te-text-color" class="te-color" value="#ffffff">
          <span class="te-label">Cỡ chữ</span>
          <input type="range" id="te-font-size" class="te-range" min="0.3" max="2.5" step="0.01" value="0.8">
          <span id="te-font-size-val" style="color:#7a6e5c;font-size:9px;width:35px">0.80</span>
        </div>
      </div>
      
      <!-- Alignment -->
      <div class="te-section">
        <div class="te-section-title">📐 Alignment</div>
        <div class="align-group">
          <button class="align-btn" id="te-align-left" data-align="left">⬅️ Trái</button>
          <button class="align-btn" id="te-align-center" data-align="center">⬌ Giữa</button>
          <button class="align-btn" id="te-align-right" data-align="right">➡️ Phải</button>
        </div>
      </div>
      
      <!-- Outline & Shadow -->
      <div class="te-section">
        <div class="te-section-title">✨ Effects</div>
        <div class="te-row">
          <span class="te-label">Outline</span>
          <input type="color" id="te-outline-color" class="te-color" value="#000000">
          <input type="range" id="te-outline-width" min="0" max="8" step="0.5" value="0">
          <span id="te-outline-val" style="color:#7a6e5c;font-size:9px;width:30px">0</span>
        </div>
        <div class="te-row">
          <span class="te-label">Đổ bóng</span>
          <input type="range" id="te-shadow-blur" min="0" max="20" step="0.5" value="0">
          <span id="te-shadow-val" style="color:#7a6e5c;font-size:9px;width:35px">0</span>
        </div>
      </div>
      
      <!-- Position controls -->
      <div class="te-section" id="position-controls" style="display: none;">
        <div class="te-section-title">📍 Position</div>
        <div class="te-row">
          <button class="te-tool-btn" id="te-move-up">⬆️ Lên</button>
          <button class="te-tool-btn" id="te-move-down">⬇️ Xuống</button>
          <button class="te-tool-btn" id="te-move-left">⬅️ Trái</button>
          <button class="te-tool-btn" id="te-move-right">➡️ Phải</button>
        </div>
      </div>
      
      <!-- Action buttons -->
      <div class="te-row" style="gap: 8px; margin-top: 5px;">
        <button class="te-btn primary" id="te-start-placing">🖱️ Bắt đầu đặt chữ lên tường</button>
        <button class="te-btn danger" id="te-cancel">✕ Huỷ</button>
      </div>
      
      <hr style="border-color: rgba(212,197,169,0.1); margin: 8px 0;">
      
      <!-- Text list -->
      <div class="te-section">
        <div class="te-section-title">📋 Danh sách text</div>
        <div id="advanced-text-list"></div>
        <button class="te-btn danger" id="te-clear-all" style="width:100%; margin-top: 8px;">✕ Xoá hết text</button>
      </div>
    `;
    
    document.body.appendChild(panel);
    this.panel = panel;
    
    // Bind events
    this.bindEvents();
    
    return panel;
  }
  
  /**
   * Bind các sự kiện cho panel
   */
  bindEvents() {
    // Content input với word count
    const contentInput = document.getElementById('te-content-input');
    const wordCountSpan = document.getElementById('te-word-count');
    
    const updatePreview = () => {
      this.updatePreview();
      // Nếu đang ở chế độ place mode, cập nhật luôn preview texture
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
        this.toast('Đã đạt giới hạn 2000 từ', 'error');
      }
      updatePreview();
    });
    
    // Font style buttons
    document.getElementById('te-bold')?.addEventListener('click', () => this.toggleStyle('bold'));
    document.getElementById('te-italic')?.addEventListener('click', () => this.toggleStyle('italic'));
    document.getElementById('te-underline')?.addEventListener('click', () => this.toggleStyle('underline'));
    
    // Color and size
    document.getElementById('te-text-color')?.addEventListener('input', () => updatePreview());
    document.getElementById('te-font-size')?.addEventListener('input', (e) => {
      document.getElementById('te-font-size-val').textContent = (+e.target.value).toFixed(2);
      updatePreview();
    });
    
    // Alignment
    document.getElementById('te-align-left')?.addEventListener('click', () => this.setAlignment('left'));
    document.getElementById('te-align-center')?.addEventListener('click', () => this.setAlignment('center'));
    document.getElementById('te-align-right')?.addEventListener('click', () => this.setAlignment('right'));
    
    // Outline
    document.getElementById('te-outline-width')?.addEventListener('input', (e) => {
      document.getElementById('te-outline-val').textContent = e.target.value;
      updatePreview();
    });
    document.getElementById('te-outline-color')?.addEventListener('input', () => updatePreview());
    
    // Shadow
    document.getElementById('te-shadow-blur')?.addEventListener('input', (e) => {
      document.getElementById('te-shadow-val').textContent = e.target.value;
      updatePreview();
    });
    
    // Start placing button (thay vì place mode riêng)
    document.getElementById('te-start-placing')?.addEventListener('click', () => {
      const content = document.getElementById('te-content-input')?.value || '';
      if (!content.trim()) {
        this.toast('Vui lòng nhập nội dung text trước', 'error');
        return;
      }
      this.enterPlaceModeWithPreview();
    });
    
    // Cancel button
    document.getElementById('te-cancel')?.addEventListener('click', () => {
      this.closePanel();
      this.exitPlaceMode();
      this.selectedTextIndex = -1;
      this.selectedText = null;
      document.getElementById('position-controls').style.display = 'none';
      this.resetForm();
    });
    
    // Clear all
    document.getElementById('te-clear-all')?.addEventListener('click', () => this.clearAllTexts());
    
    // Position controls
    document.getElementById('te-move-up')?.addEventListener('click', () => this.moveSelectedText(0, 0.05, 0));
    document.getElementById('te-move-down')?.addEventListener('click', () => this.moveSelectedText(0, -0.05, 0));
    document.getElementById('te-move-left')?.addEventListener('click', () => this.moveSelectedText(-0.05, 0, 0));
    document.getElementById('te-move-right')?.addEventListener('click', () => this.moveSelectedText(0.05, 0, 0));
  }
  
  /**
   * Toggle style (bold/italic/underline)
   */
  toggleStyle(style) {
    const btn = document.getElementById(`te-${style}`);
    if (btn) {
      btn.classList.toggle('active');
    }
    this.updatePreview();
  }
  
  /**
   * Set alignment
   */
  setAlignment(align) {
    ['left', 'center', 'right'].forEach(a => {
      const btn = document.getElementById(`te-align-${a}`);
      if (btn) btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(`te-align-${align}`);
    if (activeBtn) activeBtn.classList.add('active');
    this.updatePreview();
  }
  
  /**
   * Lấy trạng thái style hiện tại
   */
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
      shadowBlur: parseFloat(document.getElementById('te-shadow-blur')?.value || 0)
    };
  }
  
  getActiveAlignment() {
    if (document.getElementById('te-align-left')?.classList.contains('active')) return 'left';
    if (document.getElementById('te-align-center')?.classList.contains('active')) return 'center';
    if (document.getElementById('te-align-right')?.classList.contains('active')) return 'right';
    return 'center';
  }
  
  /**
   * Cập nhật preview text trong panel
   */
  updatePreview() {
    const content = document.getElementById('te-content-input')?.value || '';
    const styles = this.getCurrentStyles();
    const previewDiv = document.getElementById('text-preview');
    
    if (!previewDiv) return;
    
    // Build CSS text
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
   * Tạo canvas texture từ nội dung và styles
   */
  createTextTexture(content, styles, width = 2048, height = 1024) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, width, height);
    
    const baseFontSize = Math.floor(120 * styles.fontSize);
    let fontString = '';
    if (styles.bold) fontString += 'bold ';
    if (styles.italic) fontString += 'italic ';
    fontString += `${baseFontSize}px "Segoe UI", "Arial", "Helvetica Neue", sans-serif`;
    ctx.font = fontString;
    
    const maxWidth = width - 100;
    const words = content.split('');
    let lines = [];
    let currentLine = '';
    
    for (let i = 0; i < words.length; i++) {
      const testLine = currentLine + words[i];
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = words[i];
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine);
    
    const lineHeight = baseFontSize * 1.3;
    const totalHeight = lines.length * lineHeight;
    let startY = (height - totalHeight) / 2;
    
    lines.forEach((line, idx) => {
      let x;
      const y = startY + idx * lineHeight + lineHeight / 2;
      
      switch (styles.align) {
        case 'left': x = 40; break;
        case 'right': x = width - 40; break;
        default: x = width / 2; break;
      }
      
      ctx.save();
      
      ctx.fillStyle = styles.color;
      ctx.textAlign = styles.align;
      ctx.textBaseline = 'middle';
      
      if (styles.outlineWidth > 0) {
        ctx.lineWidth = styles.outlineWidth;
        ctx.strokeStyle = styles.outlineColor;
        ctx.strokeText(line, x, y);
      }
      
      if (styles.shadowBlur > 0) {
        ctx.shadowColor = 'rgba(0,0,0,' + Math.min(styles.shadowBlur / 20, 0.5) + ')';
        ctx.shadowBlur = styles.shadowBlur;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
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
        ctx.lineWidth = Math.max(2, baseFontSize * 0.08);
        ctx.stroke();
      }
      
      ctx.restore();
    });
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    
    return { texture, canvas, width: canvas.width, height: canvas.height };
  }
  
  /**
   * Tạo preview texture (kích thước nhỏ hơn để performance tốt)
   */
  createPreviewTexture(content, styles, width = 1024, height = 512) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, width, height);
    
    const baseFontSize = Math.floor(80 * styles.fontSize);
    let fontString = '';
    if (styles.bold) fontString += 'bold ';
    if (styles.italic) fontString += 'italic ';
    fontString += `${baseFontSize}px "Segoe UI", "Arial", "Helvetica Neue", sans-serif`;
    ctx.font = fontString;
    
    const maxWidth = width - 80;
    const words = content.split('');
    let lines = [];
    let currentLine = '';
    
    for (let i = 0; i < words.length; i++) {
      const testLine = currentLine + words[i];
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = words[i];
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine);
    
    const lineHeight = baseFontSize * 1.3;
    const totalHeight = lines.length * lineHeight;
    let startY = (height - totalHeight) / 2;
    
    lines.forEach((line, idx) => {
      let x;
      const y = startY + idx * lineHeight + lineHeight / 2;
      
      switch (styles.align) {
        case 'left': x = 40; break;
        case 'right': x = width - 40; break;
        default: x = width / 2; break;
      }
      
      ctx.save();
      ctx.fillStyle = styles.color;
      ctx.textAlign = styles.align;
      ctx.textBaseline = 'middle';
      
      if (styles.outlineWidth > 0) {
        ctx.lineWidth = styles.outlineWidth;
        ctx.strokeStyle = styles.outlineColor;
        ctx.strokeText(line, x, y);
      }
      
      if (styles.shadowBlur > 0) {
        ctx.shadowColor = 'rgba(0,0,0,' + Math.min(styles.shadowBlur / 20, 0.5) + ')';
        ctx.shadowBlur = styles.shadowBlur;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
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
        ctx.lineWidth = Math.max(2, baseFontSize * 0.08);
        ctx.stroke();
      }
      
      ctx.restore();
    });
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    
    return { texture, canvas };
  }
  
  /**
   * Tạo preview group để hiển thị trên tường
   */
  createPreviewGroup(content, styles, position, normal) {
    const { texture, canvas } = this.createPreviewTexture(content, styles);
    const aspect = canvas.width / canvas.height;
    const planeHeight = 1.2 * styles.fontSize;
    const planeWidth = planeHeight * aspect;
    
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
  
  /**
   * Cập nhật texture preview khi style thay đổi
   */
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
  
  /**
   * Cập nhật preview group
   */
  updatePreviewGroup(content, styles, position, normal) {
    // Xóa preview cũ
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
  
  /**
   * Xóa preview
   */
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
  
  /**
   * Bắt đầu chế độ đặt text với preview
   */
  enterPlaceModeWithPreview() {
    const content = document.getElementById('te-content-input')?.value || '';
    if (!content.trim()) {
      this.toast('Vui lòng nhập nội dung text trước', 'error');
      return;
    }
    
    this.exitPlaceMode(); // Clean up old state
    this.isPlaceMode = true;
    this.openPanel();
    this.toast('✨ Di chuột lên tường để xem trước, click để đặt chữ', 'info');
  }
  
  /**
   * Thoát chế độ đặt text
   */
  exitPlaceMode() {
    this.isPlaceMode = false;
    this.clearPreview();
  }
  
  /**
   * Cập nhật preview khi di chuột (được gọi từ StudioScene)
   */
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
      
      // Kiểm tra nếu vị trí thay đổi thì cập nhật
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
  
  /**
   * Xử lý click để đặt text (được gọi từ StudioScene)
   */
  handleCanvasClick(raycaster, camera, mouse, modelMeshes) {
    // Nếu đang ở chế độ place text với preview
    if (this.isPlaceMode && this.currentPreviewHit) {
      const content = document.getElementById('te-content-input')?.value || '';
      if (!content.trim()) {
        this.toast('Vui lòng nhập nội dung text', 'error');
        return true;
      }
      
      const styles = this.getCurrentStyles();
      const position = this.currentPreviewHit.point;
      const normal = this.currentPreviewHit.normal;
      
      this.placeTextOnWall(content, styles, position, normal);
      this.toast('Đã đặt text lên tường ✓', 'success');
      
      // Không thoát chế độ place mode, artist có thể đặt tiếp
      // Chỉ clear preview hiện tại, vẫn giữ nguyên text trong form để đặt tiếp
      this.clearPreview();
      this.toast('🖱️ Tiếp tục di chuột và click để đặt thêm text', 'info');
      return true;
    }
    
    // Nếu đang ở chế độ select và click vào text
    const textHits = raycaster.intersectObjects(this.texts.map(t => t.group), true);
    if (textHits.length) {
      let hitObj = textHits[0].object;
      while (hitObj.parent && !this.texts.find(t => t.group === hitObj)) {
        hitObj = hitObj.parent;
      }
      const idx = this.texts.findIndex(t => t.group === hitObj);
      if (idx !== -1) {
        this.selectTextForEdit(idx);
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Tạo text group (không khung) để đặt lên tường
   */
  createTextGroup(content, styles, position, normal) {
    const { texture, canvas, width: texWidth, height: texHeight } = this.createTextTexture(content, styles);
    
    const aspect = texWidth / texHeight;
    const planeHeight = 1.2 * styles.fontSize;
    const planeWidth = planeHeight * aspect;
    
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
  
  /**
   * Đặt text lên tường
   */
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
    
    return textObj;
  }
  
  /**
   * Cập nhật text đã tồn tại
   */
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
    return this.texts[index];
  }
  
  /**
   * Chọn text để chỉnh sửa
   */
  selectTextForEdit(idx) {
    // Nếu đang ở chế độ place mode, thoát ra trước
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
    
    // Thay đổi nút action
    const startBtn = document.getElementById('te-start-placing');
    if (startBtn) {
      startBtn.textContent = '✏️ Cập nhật text';
      startBtn.style.borderColor = '#6aaa7a';
      startBtn.style.color = '#6aaa7a';
    }
    
    this.toast('Đã chọn text, chỉnh sửa nội dung và nhấn "Cập nhật text" để lưu', 'info');
  }
  
  /**
   * Áp dụng cập nhật cho text đã chọn
   */
  applyUpdateToSelected() {
    const content = document.getElementById('te-content-input')?.value || '';
    if (!content.trim()) {
      this.toast('Vui lòng nhập nội dung text', 'error');
      return false;
    }
    
    if (this.selectedTextIndex >= 0) {
      const styles = this.getCurrentStyles();
      this.updateTextAtIndex(this.selectedTextIndex, content, styles);
      this.toast('Đã cập nhật text ✓', 'success');
      this.selectedTextIndex = -1;
      this.selectedText = null;
      document.getElementById('position-controls').style.display = 'none';
      
      // Reset button
      const startBtn = document.getElementById('te-start-placing');
      if (startBtn) {
        startBtn.textContent = '🖱️ Bắt đầu đặt chữ lên tường';
        startBtn.style.borderColor = '';
        startBtn.style.color = '';
      }
      
      this.closePanel();
      this.resetForm();
      return true;
    }
    
    return false;
  }
  
  /**
   * Di chuyển text đã chọn
   */
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
  
  /**
   * Xoá text theo index
   */
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
        startBtn.textContent = '🖱️ Bắt đầu đặt chữ lên tường';
        startBtn.style.borderColor = '';
        startBtn.style.color = '';
      }
    } else if (this.selectedTextIndex > idx) {
      this.selectedTextIndex--;
    }
    
    this.renderTextList();
    this.toast('Đã xoá text', 'info');
  }
  
  /**
   * Xoá tất cả text
   */
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
    this.toast('Đã xoá hết text', 'info');
  }
  
  /**
   * Render danh sách text trong panel
   */
  renderTextList() {
    const list = document.getElementById('advanced-text-list');
    if (!list) return;
    
    list.innerHTML = '';
    this.texts.forEach((txt, idx) => {
      const item = document.createElement('div');
      item.className = 'text-list-item' + (idx === this.selectedTextIndex ? ' active' : '');
      item.innerHTML = `
        <span class="text-list-preview">${txt.data.content.substring(0, 30)}${txt.data.content.length > 30 ? '...' : ''}</span>
        <button class="text-list-remove" data-idx="${idx}">✕</button>
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
  
  /**
   * Reset form về giá trị mặc định
   */
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
    
    // Reset button
    const startBtn = document.getElementById('te-start-placing');
    if (startBtn) {
      startBtn.textContent = '🖱️ Bắt đầu đặt chữ lên tường';
      startBtn.style.borderColor = '';
      startBtn.style.color = '';
    }
  }
  
  /**
   * Mở panel
   */
  openPanel() {
    if (this.panel) {
      this.panel.classList.add('open');
    }
    this.renderTextList();
  }
  
  /**
   * Đóng panel
   */
  closePanel() {
    if (this.panel) {
      this.panel.classList.remove('open');
    }
  }
  
  /**
   * Toggle panel
   */
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
  
  /**
   * Lấy dữ liệu để save
   */
  getSaveData() {
    return this.texts.map(t => ({
      x: t.data.position.x,
      y: t.data.position.y,
      z: t.data.position.z,
      rotation: t.data.rotation,
      normalX: t.data.normal.x,
      normalY: t.data.normal.y,
      normalZ: t.data.normal.z,
      content: t.data.content,
      styles: t.data.styles
    }));
  }
  
  /**
   * Load dữ liệu đã save
   */
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
  }
  
  /**
   * Dọn dẹp khi thoát scene
   */
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