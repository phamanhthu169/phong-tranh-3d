/**
 * Script migrate toàn bộ file từ Supabase project cũ sang project mới.
 *
 * Cách dùng:
 *   node migrate-storage.mjs
 *
 * Trước khi chạy:
 *   1. Điền OLD_SERVICE_KEY và NEW_* bên dưới
 *   2. Tạo bucket cùng tên trên project mới (Settings > Storage)
 *   3. Đặt bucket mới là Public (nếu bucket cũ là Public)
 */

import { createClient } from '@supabase/supabase-js';

// ─── CẤU HÌNH ────────────────────────────────────────────────────────────────

const OLD_URL         = 'https://ejdzwaekpejmfajfnccl.supabase.co';
const OLD_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqZHp3YWVrcGVqbWZhamZuY2NsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzYwODI0NiwiZXhwIjoyMDkzMTg0MjQ2fQ.XdUoqkyh1MaGlwZx0T3_Oaw-sMG-K8HXa_kkqOF7i1U'; // ← lấy ở Supabase > Settings > API > service_role

const NEW_URL         = 'https://rfbntpadxbviolqyihib.supabase.co'; // ← URL project mới
const NEW_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmYm50cGFkeGJ2aW9scXlpaGliIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTYwNzgyMSwiZXhwIjoyMDk1MTgzODIxfQ.k_PMJ0L18Xznhrc775JsINdOorzeLJkuqDXy1P4hUe8'; // ← service_role key project mới

const BUCKETS = ['forum-media']; // migrate cả 2 bucket

// ─────────────────────────────────────────────────────────────────────────────

const oldClient = createClient(OLD_URL, OLD_SERVICE_KEY);
const newClient = createClient(NEW_URL, NEW_SERVICE_KEY);

/** Liệt kê đệ quy tất cả file trong bucket (xử lý phân trang) */
async function listAllFiles(bucket, prefix = '') {
  const files = [];
  let offset = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await oldClient.storage
      .from(bucket)
      .list(prefix, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } });

    if (error) throw new Error(`list("${prefix}"): ${error.message}`);
    if (!data || data.length === 0) break;

    for (const item of data) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) {
        // Đây là file
        files.push(fullPath);
      } else {
        // Đây là folder — đệ quy vào
        const sub = await listAllFiles(bucket, fullPath);
        files.push(...sub);
      }
    }

    if (data.length < PAGE) break;
    offset += PAGE;
  }

  return files;
}

async function migrateBucket(bucket) {
  console.log(`\n📂 Bucket: ${bucket}`);
  const files = await listAllFiles(bucket);
  console.log(`   Tìm thấy ${files.length} file`);

  let ok = 0, fail = 0;
  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    const progress = `[${String(i + 1).padStart(String(files.length).length)}/${files.length}]`;
    process.stdout.write(`   ${progress} ${filePath} ... `);
    try {
      const { data: blob, error: dlErr } = await oldClient.storage.from(bucket).download(filePath);
      if (dlErr) throw new Error(`download: ${dlErr.message}`);
      const { error: upErr } = await newClient.storage.from(bucket).upload(filePath, blob, { upsert: true });
      if (upErr) throw new Error(`upload: ${upErr.message}`);
      console.log('✓');
      ok++;
    } catch (err) {
      console.log(`✗  ${err.message}`);
      fail++;
    }
  }
  console.log(`   ✅ ${ok} OK, ${fail} lỗi`);
  return fail;
}

async function main() {
  let totalFail = 0;
  for (const bucket of BUCKETS) {
    totalFail += await migrateBucket(bucket);
  }
  if (totalFail > 0) console.log('\n⚠️  Chạy lại script để thử lại các file lỗi.');
  else console.log('\n✅ Tất cả bucket đã migrate xong!');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
