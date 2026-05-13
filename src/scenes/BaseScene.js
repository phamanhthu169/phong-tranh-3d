import * as THREE from 'three';
import { HEADER_H } from '../core/SceneManager.js';

// Bản mẫu chung — mọi màn hình đều kế thừa từ đây
export class BaseScene {
  constructor(renderer, manager) {
    this.renderer   = renderer;
    this.manager    = manager;
    this.threeScene = new THREE.Scene();
    // chiều cao thực tế của canvas = toàn màn hình trừ header
    this.camera     = new THREE.PerspectiveCamera(70, innerWidth / (innerHeight - HEADER_H), 0.05, 500);

    this._listeners = []; // danh sách event listener để dọn dẹp khi rời màn hình
    this._elements  = []; // danh sách HTML element để xoá khi rời màn hình
    this._disposed  = false;
  }

  // gọi khi vào màn hình — mỗi màn hình tự override
  async init() {}

  // gọi mỗi frame — mỗi màn hình tự override
  update(_dt) {}

  // gọi khi resize cửa sổ
  onResize() {
    this.camera.aspect = innerWidth / (innerHeight - HEADER_H);
    this.camera.updateProjectionMatrix();
  }

  // gọi khi rời màn hình — tự động dọn dẹp listener và element
  dispose() {
    this._disposed = true;
    this._listeners.forEach(([target, type, fn]) => target.removeEventListener(type, fn));
    this._listeners = [];
    this._elements.forEach(el => el.parentNode?.removeChild(el));
    this._elements = [];
  }

  // thêm event listener có quản lý (tự xoá khi dispose)
  _on(target, type, fn) {
    target.addEventListener(type, fn);
    this._listeners.push([target, type, fn]);
  }

  // đăng ký HTML element để tự xoá khi dispose
  _el(el) {
    this._elements.push(el);
    return el;
  }
}
