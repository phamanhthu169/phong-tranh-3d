/**
 * Script migrate toàn bộ database từ Supabase project cũ sang project mới.
 * Chạy SAU khi đã migrate storage xong.
 *
 * Cách dùng:
 *   node migrate-database.mjs
 */

import { createClient } from '@supabase/supabase-js';

// ─── CẤU HÌNH ────────────────────────────────────────────────────────────────

const OLD_URL         = 'https://ejdzwaekpejmfajfnccl.supabase.co';
const OLD_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqZHp3YWVrcGVqbWZhamZuY2NsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzYwODI0NiwiZXhwIjoyMDkzMTg0MjQ2fQ.XdUoqkyh1MaGlwZx0T3_Oaw-sMG-K8HXa_kkqOF7i1U';

const NEW_URL         = 'https://rfbntpadxbviolqyihib.supabase.co';
const NEW_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmYm50cGFkeGJ2aW9scXlpaGliIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTYwNzgyMSwiZXhwIjoyMDk1MTgzODIxfQ.k_PMJ0L18Xznhrc775JsINdOorzeLJkuqDXy1P4hUe8';

// Thứ tự insert quan trọng — bảng cha phải trước bảng con (tránh lỗi foreign key)
const TABLES = [
  'profiles',
  'galleries',
  'gallery',
  'gallery_stats',
  'gallery_likes',
  'follows',
  'room_paths',
  'room_missions',
  'room_completion_config',
  'room_completions',
  'ranks',
  'mission_completions',
  'treasure_chests',
  'chest_opens',
  'visitor_tokens',
  'user_tokens',
  'messages',
  'forum_posts',
  'forum_comments',
  'artist_products',
  'product_reviews',
  'orders',
];

// ─────────────────────────────────────────────────────────────────────────────

const oldClient = createClient(OLD_URL, OLD_SERVICE_KEY);
const newClient = createClient(NEW_URL, NEW_SERVICE_KEY);

const OLD_DOMAIN = 'ejdzwaekpejmfajfnccl.supabase.co';
const NEW_DOMAIN = 'rfbntpadxbviolqyihib.supabase.co';

/** Thay URL storage cũ → mới trong toàn bộ object (đệ quy) */
function replaceUrls(obj) {
  if (typeof obj === 'string') {
    return obj.replaceAll(OLD_DOMAIN, NEW_DOMAIN);
  }
  if (Array.isArray(obj)) {
    return obj.map(replaceUrls);
  }
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = replaceUrls(v);
    }
    return result;
  }
  return obj;
}

/** Đọc toàn bộ rows của một bảng (có phân trang) */
async function fetchAll(table) {
  const rows = [];
  const PAGE = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await oldClient
      .from(table)
      .select('*')
      .range(offset, offset + PAGE - 1);

    if (error) throw new Error(`fetch "${table}": ${error.message}`);
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  return rows;
}

async function migrateTable(table) {
  process.stdout.write(`  Đọc dữ liệu... `);
  const rows = await fetchAll(table);
  console.log(`${rows.length} rows`);

  if (rows.length === 0) return;

  // Thay URL storage trong data
  const transformed = replaceUrls(rows);

  // Insert theo từng batch 500 rows
  const BATCH = 500;
  let inserted = 0;

  for (let i = 0; i < transformed.length; i += BATCH) {
    const batch = transformed.slice(i, i + BATCH);
    const { error } = await newClient.from(table).upsert(batch, { onConflict: 'id' });
    if (error) throw new Error(`upsert "${table}" batch ${i}: ${error.message}`);
    inserted += batch.length;
    process.stdout.write(`\r  Đã insert ${inserted}/${transformed.length} rows...`);
  }

  console.log(`\r  ✓ ${inserted} rows inserted${' '.repeat(20)}`);
}

async function main() {
  console.log('🚀 Bắt đầu migrate database\n');

  let ok = 0, fail = 0;

  for (const table of TABLES) {
    console.log(`📋 Bảng: ${table}`);
    try {
      await migrateTable(table);
      ok++;
    } catch (err) {
      console.log(`  ✗ Lỗi: ${err.message}`);
      fail++;
    }
  }

  console.log(`\n✅ Hoàn thành: ${ok} bảng OK, ${fail} bảng lỗi`);
  if (fail > 0) {
    console.log('⚠️  Các bảng lỗi có thể do foreign key — thử chạy lại sau khi các bảng cha đã có data.');
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
