import { defineConfig } from 'vite'
export default defineConfig({
  base: '/',
  // trả về index.html cho mọi URL — cần thiết để /studio, /explore, ... hoạt động
  appType: 'spa',
})
