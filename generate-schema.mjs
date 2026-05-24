/**
 * Đọc schema từ Supabase project cũ → tạo file schema.sql
 * Paste nội dung schema.sql vào SQL Editor của project mới để tạo bảng.
 *
 * Cách dùng:
 *   node generate-schema.mjs
 */

import pg from 'pg';
import { writeFileSync } from 'fs';

const { Client } = pg;

const DB_URL = 'postgresql://postgres:phamanhthu169@db.ejdzwaekpejmfajfnccl.supabase.co:5432/postgres';

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

async function getTableSQL(client, table) {
  const { rows: cols } = await client.query(`
    SELECT
      column_name,
      data_type,
      udt_name,
      character_maximum_length,
      numeric_precision,
      numeric_scale,
      is_nullable,
      column_default,
      ordinal_position
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `, [table]);

  if (cols.length === 0) return null;

  const colDefs = cols.map(col => {
    let type = col.data_type;
    if      (type === 'USER-DEFINED')              type = col.udt_name;
    else if (type === 'ARRAY')                     type = col.udt_name.replace(/^_/, '') + '[]';
    else if (type === 'character varying')         type = col.character_maximum_length ? `varchar(${col.character_maximum_length})` : 'varchar';
    else if (type === 'character')                 type = `char(${col.character_maximum_length || 1})`;
    else if (type === 'numeric' && col.numeric_precision) type = `numeric(${col.numeric_precision},${col.numeric_scale || 0})`;
    else if (type === 'timestamp without time zone') type = 'timestamp';
    else if (type === 'timestamp with time zone')  type = 'timestamptz';
    else if (type === 'double precision')          type = 'float8';
    else if (type === 'integer')                   type = 'int4';
    else if (type === 'bigint')                    type = 'int8';
    else if (type === 'boolean')                   type = 'bool';

    let def = `  ${col.column_name} ${type}`;
    if (col.is_nullable === 'NO') def += ' NOT NULL';
    if (col.column_default !== null) def += ` DEFAULT ${col.column_default}`;
    return def;
  });

  // Primary key
  const { rows: pks } = await client.query(`
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_schema = 'public' AND tc.table_name = $1
    ORDER BY kcu.ordinal_position
  `, [table]);

  if (pks.length > 0) {
    colDefs.push(`  PRIMARY KEY (${pks.map(r => r.column_name).join(', ')})`);
  }

  // Unique constraints
  const { rows: uqs } = await client.query(`
    SELECT tc.constraint_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'UNIQUE'
      AND tc.table_schema = 'public' AND tc.table_name = $1
    ORDER BY tc.constraint_name, kcu.ordinal_position
  `, [table]);

  const uqGroups = {};
  for (const row of uqs) {
    if (!uqGroups[row.constraint_name]) uqGroups[row.constraint_name] = [];
    uqGroups[row.constraint_name].push(row.column_name);
  }
  for (const cols of Object.values(uqGroups)) {
    colDefs.push(`  UNIQUE (${cols.join(', ')})`);
  }

  return `CREATE TABLE IF NOT EXISTS ${table} (\n${colDefs.join(',\n')}\n);`;
}

async function getForeignKeys(client, table) {
  const { rows } = await client.query(`
    SELECT
      tc.constraint_name,
      kcu.column_name,
      ccu.table_name  AS ref_table,
      ccu.column_name AS ref_column,
      rc.delete_rule,
      rc.update_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
    JOIN information_schema.constraint_column_usage ccu
      ON rc.unique_constraint_name = ccu.constraint_name AND rc.unique_constraint_schema = ccu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public' AND tc.table_name = $1
  `, [table]);

  return rows.map(r =>
    `ALTER TABLE ${table} ADD CONSTRAINT ${r.constraint_name} ` +
    `FOREIGN KEY (${r.column_name}) REFERENCES ${r.ref_table}(${r.ref_column}) ` +
    `ON DELETE ${r.delete_rule} ON UPDATE ${r.update_rule};`
  );
}

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

  console.log('Đang kết nối database cũ...');
  await client.connect();
  console.log('✓ Kết nối thành công\n');

  let output = '-- Schema tự động tạo từ project cũ\n-- Paste toàn bộ file này vào SQL Editor của project mới\n\n';
  const allFKs = [];

  for (const table of TABLES) {
    process.stdout.write(`  ${table}... `);
    try {
      const sql = await getTableSQL(client, table);
      if (sql) {
        output += sql + '\n\n';
        const fks = await getForeignKeys(client, table);
        allFKs.push(...fks);
        console.log('✓');
      } else {
        console.log('(trống)');
      }
    } catch (err) {
      console.log(`✗ ${err.message}`);
    }
  }

  if (allFKs.length > 0) {
    output += '-- Foreign Key Constraints\n';
    output += allFKs.join('\n') + '\n';
  }

  writeFileSync('schema.sql', output, 'utf8');
  console.log('\n✅ Đã tạo schema.sql');
  console.log('👉 Mở Supabase Dashboard → project MỚI → SQL Editor → paste nội dung schema.sql → Run');

  await client.end();
}

main().catch(err => {
  console.error('Lỗi:', err.message);
  process.exit(1);
});
