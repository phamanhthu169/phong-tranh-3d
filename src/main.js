import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { createClient } from '@supabase/supabase-js';

/* ══════════════════════════════════════════════
   SUPABASE
══════════════════════════════════════════════ */
const supabase = createClient(
  'https://ejdzwaekpejmfajfnccl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqZHp3YWVrcGVqbWZhamZuY2NsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MDgyNDYsImV4cCI6MjA5MzE4NDI0Nn0.69bZ3hQcCuhEPmy-Pi4Phou6OhCrbNIR7kuPR1yfr1I'
);
const STORAGE_BUCKET = 'patbk';
const GALLERY_NAME   = 'main';

/* ══════════════════════════════════════════════
   SCENE / RENDERER / CAMERA
══════════════════════════════════════════════ */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 500);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const ambLight  = new THREE.AmbientLight(0xffffff, 2.5); scene.add(ambLight);
const hemiLight = new THREE.HemisphereLight(0xffe8c0, 0x3a2e20, 0.7); scene.add(hemiLight);
const dirLight  = new THREE.DirectionalLight(0xffffff, 3);
dirLight.position.set(5, 10, 5); dirLight.castShadow = true; scene.add(dirLight);

/* ══════════════════════════════════════════════
   LOAD GLB ROOM
══════════════════════════════════════════════ */
let modelMeshes = [];
const roomLoader = new GLTFLoader();
roomLoader.load('/models/scene.glb', (gltf) => {
  const model = gltf.scene; scene.add(model);
  model.traverse(c => { if (c.isMesh) modelMeshes.push(c); });
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  camera.position.set(center.x, box.min.y + 1.6, center.z);
});

/* ══════════════════════════════════════════════
   CSS
══════════════════════════════════════════════ */
const style = document.createElement('style');
style.textContent = `
  *{box-sizing:border-box} body{margin:0;overflow:hidden}
  .tb-btn{padding:7px 14px;font-size:12px;cursor:pointer;background:rgba(20,18,14,.85);color:#d4c5a9;border:1px solid rgba(212,197,169,.3);border-radius:3px;font-family:monospace;letter-spacing:.06em;transition:all .2s}
  .tb-btn:hover,.tb-btn.active{background:rgba(200,169,110,.25);border-color:#c8a96e;color:#fff}
  .hud-btn{padding:5px 10px;font-size:11px;cursor:pointer;font-family:monospace;background:rgba(212,197,169,.08);color:#d4c5a9;border:1px solid rgba(212,197,169,.2);border-radius:2px;transition:all .15s}
  .hud-btn:hover{background:rgba(212,197,169,.2);color:#fff}
  .hud-btn.danger:hover{background:rgba(181,74,58,.3);border-color:rgba(181,74,58,.6);color:#ffaaaa}
  .uth.sel,.model-th.sel{border-color:#c8a96e!important}
  #toast{position:fixed;bottom:50px;left:50%;transform:translateX(-50%) translateY(20px);background:rgba(20,18,14,.96);border:.5px solid rgba(212,197,169,.18);color:#d4c5a9;font-size:9px;letter-spacing:.14em;text-transform:uppercase;padding:8px 18px;border-radius:3px;pointer-events:none;opacity:0;transition:opacity .3s,transform .3s;z-index:50;white-space:nowrap}
  #toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
  #toast.success{border-color:#6aaa7a;color:#6aaa7a}
  #toast.error{border-color:#b54a3a;color:#b54a3a}
  #light-panel,#path-panel{position:fixed;left:10px;top:60px;width:230px;background:rgba(15,13,12,.97);border:.5px solid rgba(212,197,169,.18);border-radius:4px;z-index:20;padding:12px;flex-direction:column;gap:10px;display:none;font-family:monospace;max-height:80vh;overflow-y:auto}
  #light-panel.open,#path-panel.open{display:flex}
  #light-panel h3,#path-panel h3{color:#d4c5a9;font-size:13px;font-style:italic;letter-spacing:.1em;border-bottom:.5px solid rgba(212,197,169,.18);padding-bottom:6px;margin:0}
  .lp-row{display:flex;align-items:center;justify-content:space-between;gap:8px}
  .lp-label{color:#7a6e5c;font-size:9px;letter-spacing:.1em;text-transform:uppercase;flex-shrink:0}
  .lp-val{color:#d4c5a9;font-size:9px;width:28px;text-align:right;flex-shrink:0}
  .lp-range{flex:1;-webkit-appearance:none;height:2px;background:rgba(212,197,169,.2);border-radius:1px;outline:none;cursor:pointer}
  .lp-range::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;border-radius:50%;background:#d4c5a9;cursor:pointer}
  .lp-color{width:32px;height:20px;border:none;border-radius:2px;cursor:pointer;background:none;padding:0}
  .pp-btn{background:rgba(212,197,169,.08);border:.5px solid rgba(212,197,169,.18);color:#7a6e5c;font-family:monospace;font-size:9px;padding:5px 10px;cursor:pointer;border-radius:2px;letter-spacing:.06em;transition:all .2s;white-space:nowrap}
  .pp-btn:hover{background:rgba(212,197,169,.18);color:#d4c5a9}
  .pp-btn.primary{background:rgba(200,169,110,.15);border-color:rgba(200,169,110,.5);color:#c8a96e}
  .pp-btn.danger{border-color:rgba(181,74,58,.4);color:rgba(181,74,58,.8)}
  .pp-btn.danger:hover{background:rgba(181,74,58,.15)}
  .pp-sep{border:none;border-top:.5px solid rgba(212,197,169,.1);margin:2px 0}
  #wp-list{display:flex;flex-direction:column;gap:4px;max-height:180px;overflow-y:auto;margin-top:4px}
  .wp-item{display:flex;align-items:center;gap:6px;background:rgba(212,197,169,.04);border:.5px solid rgba(212,197,169,.12);border-radius:2px;padding:5px 8px;cursor:pointer}
  .wp-item:hover,.wp-item.active{border-color:#c8a96e;background:rgba(200,169,110,.08)}
  .wp-num{color:#c8a96e;font-size:9px;min-width:16px}
  .wp-lbl{color:#7a6e5c;font-size:8px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .wp-del{background:rgba(181,74,58,.6);color:#fff;border:none;font-size:7px;cursor:pointer;padding:1px 5px;border-radius:1px}
  #path-nav-bar{position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(15,13,12,.94);border:.5px solid #c8a96e;border-radius:4px;padding:6px 10px;display:none;align-items:center;gap:8px;z-index:25;font-family:monospace}
  #path-nav-bar.show{display:flex}
  .pnb-arrow{background:rgba(200,169,110,.12);border:.5px solid rgba(200,169,110,.4);color:#c8a96e;font-size:14px;width:28px;height:28px;cursor:pointer;border-radius:3px;display:flex;align-items:center;justify-content:center;transition:all .2s}
  .pnb-arrow:hover{background:rgba(200,169,110,.28);color:#fff}
  .pnb-arrow:disabled{opacity:.3;cursor:not-allowed}
  #pnb-info{display:flex;flex-direction:column;align-items:center;min-width:90px}
  #pnb-num{color:#c8a96e;font-size:11px;font-style:italic}
  #pnb-label{color:#7a6e5c;font-size:7px;letter-spacing:.1em;text-transform:uppercase;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #pnb-close{background:none;border:.5px solid rgba(212,197,169,.15);color:#555;font-size:9px;cursor:pointer;border-radius:2px;padding:2px 6px;transition:all .2s}
  #pnb-close:hover{color:#d4c5a9}
`;
document.head.appendChild(style);

/* ══════════════════════════════════════════════
   MODE
══════════════════════════════════════════════ */
let mode = 'walk';
function setMode(m) {
  mode = m;
  document.querySelectorAll('.tb-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('btn-' + m)?.classList.add('active');
  renderer.domElement.style.cursor = m === 'place' ? 'crosshair' : 'default';
  if (m !== 'select') deselectItem();
}

/* ══════════════════════════════════════════════
   TOOLBAR
══════════════════════════════════════════════ */
const toolbar = document.createElement('div');
toolbar.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:10;';
toolbar.innerHTML = `
  <button class="tb-btn active" id="btn-walk">🚶 Walk</button>
  <button class="tb-btn" id="btn-place">📌 Place</button>
  <button class="tb-btn" id="btn-select">✦ Select</button>
  <button class="tb-btn" id="btn-light">💡 Light</button>
  <button class="tb-btn" id="btn-path">🛤 Path</button>
  <button class="tb-btn" id="btn-save">💾 Save</button>
`;
document.body.appendChild(toolbar);

const toastEl = document.createElement('div');
toastEl.id = 'toast';
document.body.appendChild(toastEl);
function toast(msg, type = 'info', duration = 2800) {
  toastEl.textContent = msg; toastEl.className = 'show ' + type;
  clearTimeout(toastEl._t); toastEl._t = setTimeout(() => { toastEl.className = ''; }, duration);
}

document.getElementById('btn-walk').addEventListener('click', () => setMode('walk'));
document.getElementById('btn-place').addEventListener('click', () => setMode('place'));
document.getElementById('btn-select').addEventListener('click', () => setMode('select'));
document.getElementById('btn-save').addEventListener('click', saveGallery);

/* ══════════════════════════════════════════════
   LIGHT PANEL
══════════════════════════════════════════════ */
const lightPanel = document.createElement('div');
lightPanel.id = 'light-panel';
lightPanel.innerHTML = `
  <h3>💡 Ánh sáng</h3>
  <div class="lp-row"><span class="lp-label">Cường độ</span><input type="range" class="lp-range" id="amb-intensity" min="0" max="5" step="0.05" value="2.5"><span class="lp-val" id="amb-val">2.50</span></div>
  <div class="lp-row"><span class="lp-label">Màu sáng</span><input type="color" class="lp-color" id="amb-color" value="#ffffff"></div>
  <div class="lp-row"><span class="lp-label">Đèn nền</span><input type="range" class="lp-range" id="hemi-intensity" min="0" max="3" step="0.05" value="0.7"><span class="lp-val" id="hemi-val">0.70</span></div>
  <div class="lp-row"><span class="lp-label">Đèn hướng</span><input type="range" class="lp-range" id="dir-intensity" min="0" max="6" step="0.05" value="3"><span class="lp-val" id="dir-val">3.00</span></div>
`;
document.body.appendChild(lightPanel);
document.getElementById('btn-light').addEventListener('click', () => {
  lightPanel.classList.toggle('open'); pathPanel.classList.remove('open');
  document.getElementById('btn-light').classList.toggle('active', lightPanel.classList.contains('open'));
  document.getElementById('btn-path').classList.remove('active');
});
document.getElementById('amb-intensity').addEventListener('input', function () { ambLight.intensity = +this.value; document.getElementById('amb-val').textContent = (+this.value).toFixed(2); });
document.getElementById('amb-color').addEventListener('input', function () { ambLight.color.set(this.value); });
document.getElementById('hemi-intensity').addEventListener('input', function () { hemiLight.intensity = +this.value; document.getElementById('hemi-val').textContent = (+this.value).toFixed(2); });
document.getElementById('dir-intensity').addEventListener('input', function () { dirLight.intensity = +this.value; document.getElementById('dir-val').textContent = (+this.value).toFixed(2); });

/* ══════════════════════════════════════════════
   PANEL BÊN PHẢI
══════════════════════════════════════════════ */
const panel = document.createElement('div');
panel.style.cssText = 'position:fixed;right:0;top:0;bottom:0;width:165px;background:rgba(15,13,12,.97);border-left:1px solid rgba(212,197,169,.15);display:flex;flex-direction:column;z-index:10;overflow-y:auto;font-family:monospace;';
panel.innerHTML = `
  <div style="color:#d4c5a9;font-size:13px;font-style:italic;padding:12px 12px 8px;border-bottom:1px solid rgba(212,197,169,.1)">Tác phẩm</div>
  <div style="color:#555;font-size:9px;letter-spacing:.15em;text-transform:uppercase;padding:9px 12px 4px">Upload ảnh / video</div>
  <div id="uz-img" style="margin:5px 10px;padding:10px 5px;text-align:center;cursor:pointer;background:rgba(20,18,14,.6);color:#e8d8ff;border:1px solid rgba(200,150,255,.4);font-size:10px;letter-spacing:.1em;text-transform:uppercase;line-height:1.8;border-radius:2px">+ JPG · PNG · MP4</div>
  <input type="file" id="fi-img" accept="image/*,video/*" multiple style="display:none">
  <div id="uw-img" style="padding:3px 10px"></div>
  <div style="color:#555;font-size:9px;letter-spacing:.15em;text-transform:uppercase;padding:9px 12px 4px;border-top:1px solid rgba(212,197,169,.08)">Upload 3D model</div>
  <div id="uz-3d" style="margin:5px 10px;padding:10px 5px;text-align:center;cursor:pointer;background:rgba(20,18,14,.6);color:#d8f0e8;border:1px solid rgba(100,200,150,.4);font-size:10px;letter-spacing:.1em;text-transform:uppercase;line-height:1.8;border-radius:2px">+ GLB · GLTF · OBJ</div>
  <input type="file" id="fi-3d" accept=".glb,.gltf,.obj" multiple style="display:none">
  <div id="uw-3d" style="padding:3px 10px"></div>
  <div style="color:#555;font-size:9px;letter-spacing:.08em;text-transform:uppercase;padding:10px 12px;line-height:2;border-top:1px solid rgba(212,197,169,.08);margin-top:auto">Chọn file<br>→ Place<br>→ click tường/sàn</div>
`;
document.body.appendChild(panel);
document.getElementById('uz-img').addEventListener('click', () => document.getElementById('fi-img').click());
document.getElementById('uz-3d').addEventListener('click', () => document.getElementById('fi-3d').click());

/* ══════════════════════════════════════════════
   DATA
══════════════════════════════════════════════ */
const artworks = [], models3d = [];
let selectedSource = null, selectedItem = null;
const frameMat   = new THREE.MeshLambertMaterial({ color: 0x2a2018 });
const gltfLoader = new GLTFLoader();
const objLoader  = new OBJLoader();

function selectSource(src) {
  selectedSource = src;
  document.querySelectorAll('.uth,.model-th').forEach(e => e.classList.remove('sel'));
}

/* ══════════════════════════════════════════════
   UPLOAD
══════════════════════════════════════════════ */
async function uploadToStorage(file) {
  const path = `${Date.now()}_${file.name}`;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: true });
  if (error) { console.error(error.message); return null; }
  return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

document.getElementById('fi-img').addEventListener('change', async function (e) {
  const wrap = document.getElementById('uw-img');
  for (const file of Array.from(e.target.files)) {
    const isVideo = file.type.startsWith('video/');
    if (isVideo) {
      try {
        toast('Đang upload video...', 'info', 15000);
        const storageUrl = await uploadToStorage(file);
        if (!storageUrl) { toast('Upload thất bại', 'error'); continue; }
        const vid = document.createElement('video');
        vid.src = storageUrl; vid.loop = true; vid.muted = true; vid.playsInline = true; vid.crossOrigin = 'anonymous';
        vid.addEventListener('loadeddata', () => {
          const tex = new THREE.VideoTexture(vid); tex.minFilter = THREE.LinearFilter;
          const src = { isVideo: true, texture: tex, videoEl: vid, storageUrl };
          const wi = document.createElement('div'); wi.style.cssText = 'position:relative;margin-bottom:4px';
          const th = document.createElement('canvas'); th.width=120; th.height=90; th.className='uth';
          th.style.cssText = 'width:100%;aspect-ratio:4/3;cursor:pointer;border:1.5px solid transparent;display:block;border-radius:2px;';
          setTimeout(() => { vid.currentTime=0.5; vid.addEventListener('seeked', () => { th.getContext('2d').drawImage(vid,0,0,120,90); }, {once:true}); }, 200);
          th.addEventListener('click', () => { selectSource(src); document.querySelectorAll('.uth,.model-th').forEach(e=>e.classList.remove('sel')); th.classList.add('sel'); });
          const lbl = document.createElement('div'); lbl.style.cssText='font-size:9px;color:#555;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:4px';
          lbl.textContent = '▶ ' + file.name.substring(0,18);
          wi.appendChild(th); wi.appendChild(lbl); wrap.appendChild(wi);
          selectSource(src); th.classList.add('sel'); vid.play(); setMode('place');
          toast('Video ✓ — click tường để đặt', 'success');
        });
      } catch(err) { toast('Lỗi: '+err.message, 'error'); }
    } else {
      toast('Đang upload...', 'info', 10000);
      const storageUrl = await uploadToStorage(file);
      const img = new Image();
      img.onload = () => {
        const nw=img.naturalWidth, nh=img.naturalHeight;
        const cv=document.createElement('canvas'); cv.width=512; cv.height=Math.round(512*nh/nw);
        cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
        const tex=new THREE.CanvasTexture(cv);
        const src={canvas:cv, texture:tex, naturalWidth:nw, naturalHeight:nh, storageUrl};
        const wi=document.createElement('div'); wi.style.cssText='position:relative;margin-bottom:4px';
        const th=document.createElement('canvas'); th.width=120; th.height=90; th.className='uth';
        th.style.cssText='width:100%;aspect-ratio:4/3;cursor:pointer;border:1.5px solid transparent;display:block;border-radius:2px;';
        th.getContext('2d').drawImage(img,0,0,120,90);
        th.addEventListener('click', () => { selectSource(src); document.querySelectorAll('.uth,.model-th').forEach(e=>e.classList.remove('sel')); th.classList.add('sel'); });
        const lbl=document.createElement('div'); lbl.style.cssText='font-size:9px;color:#555;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:4px';
        lbl.textContent=file.name.substring(0,20);
        wi.appendChild(th); wi.appendChild(lbl); wrap.appendChild(wi);
        selectSource(src); th.classList.add('sel'); setMode('place');
        toast('Ảnh ✓ — click tường để đặt', 'success');
      };
      img.src = URL.createObjectURL(file);
    }
  }
  this.value = '';
});

document.getElementById('fi-3d').addEventListener('change', async function (e) {
  for (const file of Array.from(e.target.files)) {
    const ext = file.name.split('.').pop().toLowerCase();
    try {
      toast('Đang upload ' + file.name + '...', 'info', 15000);
      const storageUrl = await uploadToStorage(file);
      if (!storageUrl) { toast('Upload thất bại', 'error'); continue; }
      toast('Đang load model...', 'info', 10000);
      const onLoad = (object) => {
        const src = { type:'model3d', object, name:file.name, storageUrl };
        const th = document.createElement('div'); th.className='model-th';
        th.style.cssText='width:100%;padding:8px 0;text-align:center;font-size:20px;cursor:pointer;border:1.5px solid transparent;border-radius:2px;background:#111;margin-bottom:2px;transition:border-color .2s';
        th.textContent='📦'; th.title=file.name;
        th.addEventListener('click', () => { selectSource(src); document.querySelectorAll('.uth,.model-th').forEach(e=>e.classList.remove('sel')); th.classList.add('sel'); });
        const lbl=document.createElement('div'); lbl.style.cssText='font-size:9px;color:#555;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:5px';
        lbl.textContent=file.name.substring(0,20);
        document.getElementById('uw-3d').appendChild(th); document.getElementById('uw-3d').appendChild(lbl);
        selectSource(src); th.classList.add('sel'); setMode('place');
        toast('Model ✓ — click sàn để đặt', 'success');
      };
      const onErr = () => toast('Không load được: '+file.name, 'error');
      if (ext==='glb'||ext==='gltf') gltfLoader.load(storageUrl, g=>onLoad(g.scene), null, onErr);
      else if (ext==='obj') objLoader.load(storageUrl, obj=>{ obj.traverse(c=>{if(c.isMesh)c.material=new THREE.MeshLambertMaterial({color:0xccbbaa});}); onLoad(obj); }, null, onErr);
      else toast('Không hỗ trợ: .'+ext, 'error');
    } catch(err) { toast('Lỗi: '+err.message, 'error'); }
  }
  this.value='';
});

/* ══════════════════════════════════════════════
   PEDESTAL + PLACE 3D
══════════════════════════════════════════════ */
function makePedestal(pos) {
  const g=new THREE.Group();
  const base=new THREE.Mesh(new THREE.BoxGeometry(1.1,.08,1.1),new THREE.MeshLambertMaterial({color:0xddd8d0})); base.position.set(0,.04,0); g.add(base);
  const col=new THREE.Mesh(new THREE.BoxGeometry(.9,.8,.9),new THREE.MeshLambertMaterial({color:0xf0ece6})); col.position.set(0,.44,0); g.add(col);
  const top=new THREE.Mesh(new THREE.BoxGeometry(1.05,.06,1.05),new THREE.MeshLambertMaterial({color:0xddd8d0})); top.position.set(0,.87,0); g.add(top);
  g.position.copy(pos); scene.add(g); return g;
}

function place3DModel(object, pos, storageUrl, name, meta={}, scaleVec=null) {
  if (scaleVec) { object.scale.copy(scaleVec); }
  else { const box=new THREE.Box3().setFromObject(object); const sz=box.getSize(new THREE.Vector3()); object.scale.setScalar(1.2/Math.max(sz.x,sz.y,sz.z)); }
  object.position.copy(pos); object.position.y=.88; scene.add(object);
  const pl=new THREE.PointLight(0xfff0dd,1.5,4); pl.position.set(pos.x,pos.y+2,pos.z); scene.add(pl);
  const ped=makePedestal(new THREE.Vector3(pos.x,0,pos.z));
  const md={object,light:pl,pedestal:ped,storageUrl:storageUrl||null,name:name||null,meta:{title:'',artist:'',year:'',desc:'',price:'',...meta}};
  models3d.push(md); return md;
}

/* ══════════════════════════════════════════════
   PLACE ARTWORK
══════════════════════════════════════════════ */
function placeArtwork(src, pos, rot, meta={}, scaleVec=null) {
  const tex=src.texture||new THREE.CanvasTexture(src.canvas);
  let ar=4/3;
  if (src.naturalWidth&&src.naturalHeight) ar=src.naturalWidth/src.naturalHeight;
  else if (src.isVideo&&src.videoEl&&src.videoEl.videoWidth) ar=src.videoEl.videoWidth/src.videoEl.videoHeight;
  const AH=1.65, AW=AH*ar;
  const group=new THREE.Group(); group.position.copy(pos); group.rotation.set(...rot);
  if (scaleVec) group.scale.copy(scaleVec);
  const frame=new THREE.Mesh(new THREE.BoxGeometry(AW+.16,AH+.16,.08),frameMat); group.add(frame);
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(AW,AH),new THREE.MeshBasicMaterial({map:tex})); plane.position.z=.046; group.add(plane);
  scene.add(group);
  const ad={group,frame,plane,isVideo:src.isVideo||false,videoTex:src.isVideo?tex:null,storageUrl:src.storageUrl||null,
    naturalWidth:src.naturalWidth||(src.isVideo&&src.videoEl?src.videoEl.videoWidth:1),
    naturalHeight:src.naturalHeight||(src.isVideo&&src.videoEl?src.videoEl.videoHeight:1),
    meta:{title:'',artist:'',year:'',desc:'',price:'',...meta}};
  artworks.push(ad); return ad;
}

/* ══════════════════════════════════════════════
   SELECT / HUD (dùng chung tranh + model)
══════════════════════════════════════════════ */
const hud = document.createElement('div');
hud.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:rgba(15,13,12,.95);border:1px solid rgba(212,197,169,.2);border-radius:4px;padding:10px 14px;display:none;flex-direction:column;gap:8px;z-index:20;font-family:monospace;min-width:320px;';
hud.innerHTML=`
  <div style="display:flex;justify-content:space-between;align-items:center">
    <span id="hud-name" style="color:#d4c5a9;font-size:11px;font-style:italic"></span>
    <button id="hud-close" style="background:none;border:none;color:#555;cursor:pointer;font-size:14px">✕</button>
  </div>
  <div style="display:flex;gap:5px;flex-wrap:wrap">
    <button class="hud-btn" id="th-up">↑</button>
    <button class="hud-btn" id="th-down">↓</button>
    <button class="hud-btn" id="th-left">←</button>
    <button class="hud-btn" id="th-right">→</button>
    <button class="hud-btn" id="th-rot-l">↺</button>
    <button class="hud-btn" id="th-rot-r">↻</button>
    <button class="hud-btn" id="th-scale-up">＋</button>
    <button class="hud-btn" id="th-scale-dn">－</button>
    <button class="hud-btn" id="th-info">📝 Info</button>
    <button class="hud-btn danger" id="th-remove">🗑</button>
  </div>
`;
document.body.appendChild(hud);

function getSelObj() { if(!selectedItem) return null; return selectedItem.type==='artwork'?selectedItem.data.group:selectedItem.data.object; }
function selectItem(type, data, index) {
  selectedItem={type,data,index}; hud.style.display='flex';
  document.getElementById('hud-name').textContent=data.meta?.title||(type==='model'?`Model #${index+1}`:`Tác phẩm #${index+1}`);
}
function deselectItem() { selectedItem=null; hud.style.display='none'; infoPopup.style.display='none'; }

document.getElementById('hud-close').addEventListener('click', deselectItem);
const MS=0.1, RS=Math.PI/24, SS=0.1;
document.getElementById('th-up').addEventListener('click', ()=>{const o=getSelObj();if(o)o.position.y+=MS;});
document.getElementById('th-down').addEventListener('click', ()=>{const o=getSelObj();if(o)o.position.y-=MS;});
document.getElementById('th-left').addEventListener('click', ()=>{const o=getSelObj();if(o)o.position.addScaledVector(new THREE.Vector3(-1,0,0).applyEuler(o.rotation),MS);});
document.getElementById('th-right').addEventListener('click', ()=>{const o=getSelObj();if(o)o.position.addScaledVector(new THREE.Vector3(1,0,0).applyEuler(o.rotation),MS);});
document.getElementById('th-rot-l').addEventListener('click', ()=>{const o=getSelObj();if(o)o.rotation.y+=RS;});
document.getElementById('th-rot-r').addEventListener('click', ()=>{const o=getSelObj();if(o)o.rotation.y-=RS;});
document.getElementById('th-scale-up').addEventListener('click', ()=>{const o=getSelObj();if(o){const s=o.scale;s.setScalar(s.x+SS);}});
document.getElementById('th-scale-dn').addEventListener('click', ()=>{const o=getSelObj();if(o){const s=o.scale;s.setScalar(Math.max(.05,s.x-SS));}});
document.getElementById('th-remove').addEventListener('click', ()=>{
  if(!selectedItem) return;
  if(selectedItem.type==='artwork'){scene.remove(selectedItem.data.group);artworks.splice(selectedItem.index,1);toast('Đã xoá tranh','info');}
  else{scene.remove(selectedItem.data.object);scene.remove(selectedItem.data.light);scene.remove(selectedItem.data.pedestal);models3d.splice(selectedItem.index,1);toast('Đã xoá model','info');}
  deselectItem();
});

/* ══════════════════════════════════════════════
   INFO POPUP
══════════════════════════════════════════════ */
const infoPopup = document.createElement('div');
infoPopup.style.cssText='position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(15,13,12,.97);border:1px solid rgba(212,197,169,.2);border-radius:4px;padding:16px;width:260px;flex-direction:column;gap:10px;z-index:30;font-family:monospace;display:none;';
infoPopup.innerHTML=`
  <div style="color:#d4c5a9;font-size:14px;font-style:italic">📝 Thông tin</div>
  ${['title:Tên','artist:Nghệ sĩ','year:Năm','price:Giá'].map(f=>{const[k,lbl]=f.split(':');return`<div style="display:flex;flex-direction:column;gap:3px"><label style="color:#555;font-size:9px;letter-spacing:.12em;text-transform:uppercase">${lbl}</label><input id="pop-${k}" style="background:rgba(212,197,169,.05);border:1px solid rgba(212,197,169,.15);color:#d4c5a9;font-family:monospace;font-size:11px;padding:5px 8px;border-radius:2px;outline:none"></div>`;}).join('')}
  <div style="display:flex;flex-direction:column;gap:3px">
    <label style="color:#555;font-size:9px;letter-spacing:.12em;text-transform:uppercase">Mô tả</label>
    <textarea id="pop-desc" rows="2" style="background:rgba(212,197,169,.05);border:1px solid rgba(212,197,169,.15);color:#d4c5a9;font-family:monospace;font-size:11px;padding:5px 8px;border-radius:2px;outline:none;resize:vertical"></textarea>
  </div>
  <div style="display:flex;gap:6px;justify-content:flex-end">
    <button id="pop-cancel" style="padding:5px 10px;font-size:10px;font-family:monospace;cursor:pointer;background:rgba(212,197,169,.08);color:#7a6e5c;border:1px solid rgba(212,197,169,.15);border-radius:2px">Huỷ</button>
    <button id="pop-save" style="padding:5px 10px;font-size:10px;font-family:monospace;cursor:pointer;background:rgba(106,170,122,.15);color:#6aaa7a;border:1px solid rgba(106,170,122,.3);border-radius:2px">Lưu</button>
  </div>
`;
document.body.appendChild(infoPopup);
document.getElementById('th-info').addEventListener('click', ()=>{
  if(!selectedItem) return;
  const m=selectedItem.data.meta;
  ['title','artist','year','desc','price'].forEach(k=>{document.getElementById('pop-'+k).value=m[k]||'';});
  infoPopup.style.display='flex';
});
document.getElementById('pop-cancel').addEventListener('click', ()=>{infoPopup.style.display='none';});
document.getElementById('pop-save').addEventListener('click', ()=>{
  if(!selectedItem) return;
  ['title','artist','year','desc','price'].forEach(k=>{selectedItem.data.meta[k]=document.getElementById('pop-'+k).value;});
  document.getElementById('hud-name').textContent=selectedItem.data.meta.title||(selectedItem.type==='model'?`Model #${selectedItem.index+1}`:`Tác phẩm #${selectedItem.index+1}`);
  infoPopup.style.display='none'; toast('Đã lưu thông tin','success');
});

/* ══════════════════════════════════════════════
   WAYPOINT
══════════════════════════════════════════════ */
const pathWaypoints=[], pathMarkers=[];
let currentWpIdx=-1, wpTravelTarget=null, wpTravelFrom=null, wpTravelT=0;
let yaw=0, pitch=0;

function makeWpTex(num, hovered) {
  const c=document.createElement('canvas'); c.width=256; c.height=256;
  const ctx=c.getContext('2d');
  const grd=ctx.createRadialGradient(128,128,70,128,128,128);
  grd.addColorStop(0,hovered?'rgba(255,220,130,.4)':'rgba(200,169,110,.2)');
  grd.addColorStop(1,'rgba(200,169,110,0)');
  ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(128,128,128,0,Math.PI*2); ctx.fill();
  const inner=ctx.createRadialGradient(115,115,0,128,128,88);
  inner.addColorStop(0,hovered?'rgba(255,235,155,.98)':'rgba(225,195,125,.9)');
  inner.addColorStop(1,hovered?'rgba(200,155,75,.9)':'rgba(165,135,75,.78)');
  ctx.fillStyle=inner; ctx.beginPath(); ctx.arc(128,128,88,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=hovered?'rgba(255,255,210,.95)':'rgba(255,230,160,.72)'; ctx.lineWidth=8;
  ctx.beginPath(); ctx.arc(128,128,88,0,Math.PI*2); ctx.stroke();
  ctx.fillStyle='#0f0d0a'; ctx.font=`bold ${num>9?'58':'66'}px sans-serif`;
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(String(num),128,134);
  return new THREE.CanvasTexture(c);
}

function addWaypoint(wx,wy,wz,wyaw,wpitch,label) {
  const idx=pathWaypoints.length;
  pathWaypoints.push({x:wx,y:wy,z:wz,yaw:wyaw||0,pitch:wpitch||0,label:label||''});
  const disc=new THREE.Mesh(
    new THREE.CircleGeometry(0.55,32),
    new THREE.MeshBasicMaterial({map:makeWpTex(idx+1,false),transparent:true,depthWrite:false,side:THREE.DoubleSide})
  );
  disc.rotation.x=-Math.PI/2; disc.position.set(wx,wy-1.65+0.012,wz);
  disc.userData.waypointIdx=idx; disc.userData.isWpDisc=true; scene.add(disc);
  let line=null;
  if(idx>0){
    const prev=pathWaypoints[idx-1];
    line=new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(prev.x,prev.y-1.65+0.015,prev.z),new THREE.Vector3(wx,wy-1.65+0.015,wz)]),
      new THREE.LineBasicMaterial({color:0xc8a96e,transparent:true,opacity:0.45})
    ); scene.add(line);
  }
  pathMarkers.push({mesh:disc,line}); renderWpList();
}

function removeWaypoint(idx) {
  pathWaypoints.splice(idx,1);
  pathMarkers.forEach(m=>{scene.remove(m.mesh);if(m.line)scene.remove(m.line);}); pathMarkers.length=0;
  const copy=[...pathWaypoints]; pathWaypoints.length=0;
  copy.forEach(wp=>addWaypoint(wp.x,wp.y,wp.z,wp.yaw,wp.pitch,wp.label));
}

function clearWaypoints() {
  pathMarkers.forEach(m=>{scene.remove(m.mesh);if(m.line)scene.remove(m.line);}); pathMarkers.length=0; pathWaypoints.length=0; renderWpList();
}

function renderWpList() {
  const list=document.getElementById('wp-list'); if(!list) return;
  document.getElementById('wp-count').textContent=pathWaypoints.length;
  list.innerHTML='';
  pathWaypoints.forEach((wp,i)=>{
    const item=document.createElement('div'); item.className='wp-item'+(i===currentWpIdx?' active':'');
    item.innerHTML=`<span class="wp-num">${i+1}</span><span class="wp-lbl">${wp.label||`(${wp.x.toFixed(1)}, ${wp.z.toFixed(1)})`}</span><button class="wp-del" data-i="${i}">✕</button>`;
    item.addEventListener('click',e=>{if(e.target.classList.contains('wp-del'))return;travelToWaypoint(i);});
    list.appendChild(item);
  });
  list.querySelectorAll('.wp-del').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();removeWaypoint(+btn.dataset.i);}));
}

function lerpAngle(a,b,t){let d=b-a;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;return a+d*t;}

function travelToWaypoint(idx) {
  if(idx<0||idx>=pathWaypoints.length) return;
  currentWpIdx=idx; const wp=pathWaypoints[idx];
  wpTravelFrom={x:camera.position.x,y:camera.position.y,z:camera.position.z,yaw,pitch};
  wpTravelTarget={x:wp.x,y:wp.y,z:wp.z,yaw:wp.yaw,pitch:wp.pitch};
  wpTravelT=0; updateNavBar(); renderWpList();
}

function updateNavBar() {
  const bar=document.getElementById('path-nav-bar'); if(!bar) return;
  if(pathWaypoints.length===0){bar.classList.remove('show');return;}
  bar.classList.add('show');
  document.getElementById('pnb-num').textContent=`${currentWpIdx+1} / ${pathWaypoints.length}`;
  document.getElementById('pnb-label').textContent=pathWaypoints[currentWpIdx]?.label||'—';
  document.getElementById('pnb-prev').disabled=currentWpIdx<=0;
  document.getElementById('pnb-next').disabled=currentWpIdx>=pathWaypoints.length-1;
}

const pathPanel=document.createElement('div'); pathPanel.id='path-panel';
pathPanel.innerHTML=`
  <h3>🛤 Lộ trình tham quan</h3>
  <div style="font-size:8px;color:#555;line-height:1.8">Đứng ở vị trí muốn thêm rồi nhấn nút bên dưới.</div>
  <button class="pp-btn primary" id="pp-add-current" style="width:100%">＋ Thêm điểm hiện tại</button>
  <hr class="pp-sep">
  <div style="font-size:8px;color:#555;letter-spacing:.12em;text-transform:uppercase">Điểm dừng (<span id="wp-count">0</span>)</div>
  <div id="wp-list"></div>
  <hr class="pp-sep">
  <button class="pp-btn danger" id="pp-clear" style="width:100%">✕ Xoá hết</button>
`;
document.body.appendChild(pathPanel);

const navBar=document.createElement('div'); navBar.id='path-nav-bar';
navBar.innerHTML=`<button class="pnb-arrow" id="pnb-prev">&#9664;</button><div id="pnb-info"><span id="pnb-num">1/1</span><span id="pnb-label">—</span></div><button class="pnb-arrow" id="pnb-next">&#9654;</button><button id="pnb-close">✕</button>`;
document.body.appendChild(navBar);

document.getElementById('btn-path').addEventListener('click', ()=>{
  pathPanel.classList.toggle('open'); lightPanel.classList.remove('open');
  document.getElementById('btn-path').classList.toggle('active',pathPanel.classList.contains('open'));
  document.getElementById('btn-light').classList.remove('active');
});
document.getElementById('pp-add-current').addEventListener('click', ()=>{
  addWaypoint(camera.position.x,camera.position.y,camera.position.z,yaw,pitch,'');
  updateNavBar(); toast(`Đã thêm điểm ${pathWaypoints.length}`,'success');
});
document.getElementById('pp-clear').addEventListener('click', ()=>{clearWaypoints();updateNavBar();navBar.classList.remove('show');toast('Đã xoá hết điểm','info');});
document.getElementById('pnb-prev').addEventListener('click', ()=>travelToWaypoint(currentWpIdx-1));
document.getElementById('pnb-next').addEventListener('click', ()=>travelToWaypoint(currentWpIdx+1));
document.getElementById('pnb-close').addEventListener('click', ()=>{navBar.classList.remove('show');currentWpIdx=-1;});

/* ══════════════════════════════════════════════
   RAYCASTER
══════════════════════════════════════════════ */
const raycaster=new THREE.Raycaster(), mouse=new THREE.Vector2();
let didDrag=false;

renderer.domElement.addEventListener('click', e=>{
  if(didDrag) return;
  mouse.x=(e.clientX/innerWidth)*2-1; mouse.y=-(e.clientY/innerHeight)*2+1;
  raycaster.setFromCamera(mouse,camera);

  if(mode==='place'){
    if(!selectedSource) return;
    if(selectedSource.type==='model3d'){
      const hits=raycaster.intersectObjects(modelMeshes,true); if(!hits.length) return;
      place3DModel(selectedSource.object.clone(),hits[0].point.clone(),selectedSource.storageUrl||null,selectedSource.name||null);
      toast('Model đặt thành công ✓','success'); return;
    }
    const hits=raycaster.intersectObjects(modelMeshes,true); if(!hits.length) return;
    const hit=hits[0], pt=hit.point.clone();
    const n=hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
    pt.add(n.clone().multiplyScalar(.05));
    if(selectedSource.isVideo) selectedSource.videoEl.play();
    placeArtwork(selectedSource,pt,[0,Math.atan2(n.x,n.z),0]);
    toast('Đã đặt tranh ✓','success'); return;
  }

  if(mode==='select'){
    // Waypoint discs
    const wpHits=raycaster.intersectObjects(pathMarkers.map(m=>m.mesh),false);
    if(wpHits.length){travelToWaypoint(wpHits[0].object.userData.waypointIdx);updateNavBar();return;}
    // Artworks
    const aHits=raycaster.intersectObjects(artworks.map(a=>a.group),true);
    if(aHits.length){
      let h=aHits[0].object; while(h.parent&&!artworks.find(a=>a.group===h))h=h.parent;
      const idx=artworks.findIndex(a=>a.group===h); if(idx!==-1){selectItem('artwork',artworks[idx],idx);return;}
    }
    // Models
    const mHits=raycaster.intersectObjects(models3d.map(m=>m.object),true);
    if(mHits.length){
      let h=mHits[0].object; while(h.parent&&!models3d.find(m=>m.object===h))h=h.parent;
      const idx=models3d.findIndex(m=>m.object===h); if(idx!==-1){selectItem('model',models3d[idx],idx);return;}
    }
    deselectItem();
  }
});

/* ══════════════════════════════════════════════
   CAMERA LOOK
══════════════════════════════════════════════ */
let isLeftDown=false, lastX=0, lastY=0;
renderer.domElement.addEventListener('mousedown', e=>{if(e.button===0){isLeftDown=true;didDrag=false;lastX=e.clientX;lastY=e.clientY;}});
window.addEventListener('mouseup', e=>{if(e.button===0)isLeftDown=false;});
renderer.domElement.addEventListener('mousemove', e=>{
  if(!isLeftDown) return;
  const dx=e.clientX-lastX, dy=e.clientY-lastY;
  if(Math.abs(dx)>2||Math.abs(dy)>2) didDrag=true;
  lastX=e.clientX; lastY=e.clientY;
  yaw-=dx*0.003; pitch-=dy*0.003;
  pitch=Math.max(-Math.PI/2,Math.min(Math.PI/2,pitch));
  camera.quaternion.setFromEuler(new THREE.Euler(pitch,yaw,0,'YXZ'));
});

/* ══════════════════════════════════════════════
   WASD + ANIMATE
══════════════════════════════════════════════ */
const keys={};
document.addEventListener('keydown', e=>keys[e.code]=true);
document.addEventListener('keyup',   e=>keys[e.code]=false);
const clock=new THREE.Clock(), moveDir=new THREE.Vector3(), fwd=new THREE.Vector3(), rgt=new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),0.1);
  if(wpTravelTarget){
    wpTravelT+=0.035; const et=wpTravelT<1?wpTravelT*wpTravelT*(3-2*wpTravelT):1;
    camera.position.x=wpTravelFrom.x+(wpTravelTarget.x-wpTravelFrom.x)*et;
    camera.position.y=wpTravelFrom.y+(wpTravelTarget.y-wpTravelFrom.y)*et;
    camera.position.z=wpTravelFrom.z+(wpTravelTarget.z-wpTravelFrom.z)*et;
    yaw=lerpAngle(wpTravelFrom.yaw,wpTravelTarget.yaw,et);
    pitch=wpTravelFrom.pitch+(wpTravelTarget.pitch-wpTravelFrom.pitch)*et;
    camera.quaternion.setFromEuler(new THREE.Euler(pitch,yaw,0,'YXZ'));
    if(wpTravelT>=1) wpTravelTarget=null;
  } else {
    const speed=8, posY=camera.position.y;
    moveDir.set(0,0,0);
    camera.getWorldDirection(fwd); fwd.y=0; fwd.normalize();
    rgt.crossVectors(fwd,new THREE.Vector3(0,1,0)).normalize();
    if(keys['KeyW']||keys['ArrowUp'])    moveDir.addScaledVector(fwd, speed*dt);
    if(keys['KeyS']||keys['ArrowDown'])  moveDir.addScaledVector(fwd,-speed*dt);
    if(keys['KeyA']||keys['ArrowLeft'])  moveDir.addScaledVector(rgt,-speed*dt);
    if(keys['KeyD']||keys['ArrowRight']) moveDir.addScaledVector(rgt, speed*dt);
    camera.position.add(moveDir); camera.position.y=posY;
  }
  artworks.forEach(a=>{if(a.isVideo&&a.videoTex)a.videoTex.needsUpdate=true;});
  renderer.render(scene,camera);
}
animate();

window.addEventListener('resize', ()=>{
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight);
});

/* ══════════════════════════════════════════════
   SAVE / LOAD
══════════════════════════════════════════════ */
async function saveGallery() {
  const btn=document.getElementById('btn-save'); btn.textContent='⏳ Saving...';
  const galleryData={
    artworks:artworks.map(a=>({x:a.group.position.x,y:a.group.position.y,z:a.group.position.z,ry:a.group.rotation.y,sx:a.group.scale.x,sy:a.group.scale.y,sz:a.group.scale.z,storageUrl:a.storageUrl||null,isVideo:a.isVideo||false,naturalWidth:a.naturalWidth,naturalHeight:a.naturalHeight,meta:a.meta})),
    models:models3d.map(m=>({x:m.object.position.x,y:m.object.position.y,z:m.object.position.z,sx:m.object.scale.x,sy:m.object.scale.y,sz:m.object.scale.z,storageUrl:m.storageUrl||null,name:m.name||null,meta:m.meta})),
    waypoints:pathWaypoints.map(wp=>({x:wp.x,y:wp.y,z:wp.z,yaw:wp.yaw,pitch:wp.pitch,label:wp.label}))
  };
  await supabase.from('gallery').delete().eq('name',GALLERY_NAME);
  const{error}=await supabase.from('gallery').insert([{name:GALLERY_NAME,scene_data:galleryData}]);
  btn.textContent='💾 Save';
  if(error) toast('Lưu thất bại: '+error.message,'error');
  else toast('Đã lưu gallery ✓','success');
}

async function loadGallery() {
  const{data,error}=await supabase.from('gallery').select('*').eq('name',GALLERY_NAME).order('created_at',{ascending:false}).limit(1);
  if(error||!data||!data.length) return;
  const sd=data[0].scene_data;
  if(sd.artworks?.length){
    for(const a of sd.artworks){
      if(!a.storageUrl) continue;
      const pos=new THREE.Vector3(a.x,a.y,a.z);
      const sv=a.sx?new THREE.Vector3(a.sx,a.sy,a.sz):null;
      if(a.isVideo){
        const vid=document.createElement('video'); vid.src=a.storageUrl; vid.loop=true; vid.muted=true; vid.playsInline=true; vid.crossOrigin='anonymous';
        vid.addEventListener('loadeddata',()=>{const tex=new THREE.VideoTexture(vid);tex.minFilter=THREE.LinearFilter;placeArtwork({isVideo:true,texture:tex,videoEl:vid,storageUrl:a.storageUrl},pos,[0,a.ry||0,0],a.meta||{},sv);vid.play();});
      } else {
        const tex=await new Promise(resolve=>new THREE.TextureLoader().load(a.storageUrl,resolve,undefined,()=>resolve(null)));
        if(!tex) continue;
        placeArtwork({texture:tex,storageUrl:a.storageUrl,naturalWidth:a.naturalWidth||1,naturalHeight:a.naturalHeight||1},pos,[0,a.ry||0,0],a.meta||{},sv);
      }
    }
  }
  if(sd.models?.length){
    for(const m of sd.models){
      if(!m.storageUrl) continue;
      const ext=(m.name||m.storageUrl).split('.').pop().toLowerCase();
      const pos=new THREE.Vector3(m.x,m.y,m.z);
      const sv=m.sx?new THREE.Vector3(m.sx,m.sy,m.sz):null;
      await new Promise(resolve=>{
        const onLoad=obj=>{place3DModel(obj,pos,m.storageUrl,m.name||null,m.meta||{},sv);resolve();};
        const onErr=()=>resolve();
        if(ext==='glb'||ext==='gltf') gltfLoader.load(m.storageUrl,g=>onLoad(g.scene),null,onErr);
        else if(ext==='obj') objLoader.load(m.storageUrl,obj=>{obj.traverse(c=>{if(c.isMesh)c.material=new THREE.MeshLambertMaterial({color:0xccbbaa});});onLoad(obj);},null,onErr);
        else resolve();
      });
    }
  }
  if(sd.waypoints?.length){
    sd.waypoints.forEach(wp=>addWaypoint(wp.x,wp.y,wp.z,wp.yaw||0,wp.pitch||0,wp.label||''));
    currentWpIdx=0; updateNavBar();
  }
}

loadGallery();