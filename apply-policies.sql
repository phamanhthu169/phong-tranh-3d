-- Thêm cột mới nếu chưa tồn tại
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS province text DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS district text DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ward     text DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS street   text DEFAULT '';
ALTER TABLE orders   ADD COLUMN IF NOT EXISTS payment_proof_url    text        DEFAULT NULL;
ALTER TABLE orders   ADD COLUMN IF NOT EXISTS tracking_code        text        DEFAULT NULL;
ALTER TABLE orders   ADD COLUMN IF NOT EXISTS is_complained        boolean     DEFAULT false;
ALTER TABLE orders   ADD COLUMN IF NOT EXISTS seller_delivered_at  timestamptz DEFAULT NULL;

-- Bảng khiếu nại
CREATE TABLE IF NOT EXISTS complaints (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id    text,
  user_id     uuid,
  buyer_name  text,
  description text,
  screenshot_url text,
  status      text        DEFAULT 'open',
  admin_note  text,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public insert complaints"  ON complaints;
CREATE POLICY "public insert complaints"  ON complaints FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "anon insert complaints"    ON complaints;
CREATE POLICY "anon insert complaints"    ON complaints FOR INSERT TO anon   WITH CHECK (true);
DROP POLICY IF EXISTS "public read complaints"    ON complaints;
CREATE POLICY "public read complaints"    ON complaints FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "anon read complaints"      ON complaints;
CREATE POLICY "anon read complaints"      ON complaints FOR SELECT TO anon   USING (true);
DROP POLICY IF EXISTS "public update complaints"  ON complaints;
CREATE POLICY "public update complaints"  ON complaints FOR UPDATE TO public USING (true);
DROP POLICY IF EXISTS "anon update complaints"    ON complaints;
CREATE POLICY "anon update complaints"    ON complaints FOR UPDATE TO anon   USING (true);

-- Để trở thành admin: chạy lệnh sau trong Supabase SQL Editor (thay YourDisplayName):
-- UPDATE profiles SET role = 'admin' WHERE display_name = 'YourDisplayName';

-- Xóa policies đã tạo thủ công trước đó để tránh conflict
DROP POLICY IF EXISTS "allow_all_patbk" ON storage.objects;
DROP POLICY IF EXISTS "allow_all_forum_media" ON storage.objects;
DROP POLICY IF EXISTS "allow_all_gallery" ON gallery;

-- Bật RLS cho các bảng cần thiết
ALTER TABLE gallery ENABLE ROW LEVEL SECURITY;
ALTER TABLE galleries ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitor_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_completion_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;

-- ── STORAGE POLICIES ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "patbkplc 1rdcmk_0" ON storage.objects;
CREATE POLICY "patbkplc 1rdcmk_0" ON storage.objects FOR SELECT TO public USING (bucket_id = 'patbk');

DROP POLICY IF EXISTS "patbkplc 1rdcmk_1" ON storage.objects;
CREATE POLICY "patbkplc 1rdcmk_1" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'patbk');

DROP POLICY IF EXISTS "public read storage" ON storage.objects;
CREATE POLICY "public read storage" ON storage.objects FOR SELECT TO public USING (bucket_id = 'patbk');

DROP POLICY IF EXISTS "auth upload storage" ON storage.objects;
CREATE POLICY "auth upload storage" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'patbk');

DROP POLICY IF EXISTS "allow upload" ON storage.objects;
CREATE POLICY "allow upload" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'patbk');

DROP POLICY IF EXISTS "allow read" ON storage.objects;
CREATE POLICY "allow read" ON storage.objects FOR SELECT TO public USING (bucket_id = 'patbk');

DROP POLICY IF EXISTS "Allow authenticated upload" ON storage.objects;
CREATE POLICY "Allow authenticated upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'forum-media');

DROP POLICY IF EXISTS "Allow public read" ON storage.objects;
CREATE POLICY "Allow public read" ON storage.objects FOR SELECT TO public USING (bucket_id = 'forum-media');

DROP POLICY IF EXISTS "forum-media: authenticated upload" ON storage.objects;
CREATE POLICY "forum-media: authenticated upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'forum-media');

DROP POLICY IF EXISTS "forum-media: public read" ON storage.objects;
CREATE POLICY "forum-media: public read" ON storage.objects FOR SELECT TO public USING (bucket_id = 'forum-media');

DROP POLICY IF EXISTS "forum-media: anon upload" ON storage.objects;
CREATE POLICY "forum-media: anon upload" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'forum-media');

-- ── DATABASE POLICIES ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "allow insert" ON gallery;
CREATE POLICY "allow insert" ON gallery FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "allow select" ON gallery;
CREATE POLICY "allow select" ON gallery FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Enable all for authenticated users" ON gallery;
CREATE POLICY "Enable all for authenticated users" ON gallery FOR ALL TO public USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all for authenticated" ON gallery;
CREATE POLICY "Allow all for authenticated" ON gallery FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon update gallery" ON gallery;
CREATE POLICY "anon update gallery" ON gallery FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon delete gallery" ON gallery;
CREATE POLICY "anon delete gallery" ON gallery FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS "Allow read messages" ON messages;
CREATE POLICY "Allow read messages" ON messages FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Allow insert messages" ON messages;
CREATE POLICY "Allow insert messages" ON messages FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "own gallery" ON galleries;
CREATE POLICY "own gallery" ON galleries FOR ALL TO public USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "public read gallery" ON galleries;
CREATE POLICY "public read gallery" ON galleries FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Anyone can place an order" ON orders;
CREATE POLICY "Anyone can place an order" ON orders FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "insert orders" ON orders;
CREATE POLICY "insert orders" ON orders FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "read orders" ON orders;
CREATE POLICY "read orders" ON orders FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "anon read orders" ON orders;
CREATE POLICY "anon read orders" ON orders FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "update order status" ON orders;
CREATE POLICY "update order status" ON orders FOR UPDATE TO public USING (true);

DROP POLICY IF EXISTS "Owner can read orders" ON orders;
CREATE POLICY "Owner can read orders" ON orders FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Owner can update order status" ON orders;
CREATE POLICY "Owner can update order status" ON orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "own data only" ON visitor_tokens;
CREATE POLICY "own data only" ON visitor_tokens FOR ALL TO public USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Enable insert for authenticated users" ON profiles;
CREATE POLICY "Enable insert for authenticated users" ON profiles FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Enable select for users" ON profiles;
CREATE POLICY "Enable select for users" ON profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Enable update for users" ON profiles;
CREATE POLICY "Enable update for users" ON profiles FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "anon update own profile" ON profiles;
CREATE POLICY "anon update own profile" ON profiles FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public update own profile" ON profiles;
CREATE POLICY "public update own profile" ON profiles FOR UPDATE TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public_read_posts" ON forum_posts;
CREATE POLICY "public_read_posts" ON forum_posts FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "public_insert_posts" ON forum_posts;
CREATE POLICY "public_insert_posts" ON forum_posts FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "public_update_posts" ON forum_posts;
CREATE POLICY "public_update_posts" ON forum_posts FOR UPDATE TO public USING (true);

DROP POLICY IF EXISTS "author can delete own post" ON forum_posts;
CREATE POLICY "author can delete own post" ON forum_posts FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS "public_read_comments" ON forum_comments;
CREATE POLICY "public_read_comments" ON forum_comments FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "public_insert_comments" ON forum_comments;
CREATE POLICY "public_insert_comments" ON forum_comments FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "read products" ON artist_products;
CREATE POLICY "read products" ON artist_products FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "write products" ON artist_products;
CREATE POLICY "write products" ON artist_products FOR ALL TO public USING (true);

DROP POLICY IF EXISTS "read reviews" ON product_reviews;
CREATE POLICY "read reviews" ON product_reviews FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "write reviews" ON product_reviews;
CREATE POLICY "write reviews" ON product_reviews FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can read stats" ON gallery_stats;
CREATE POLICY "Anyone can read stats" ON gallery_stats FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "anyone can read gallery_stats" ON gallery_stats;
CREATE POLICY "anyone can read gallery_stats" ON gallery_stats FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "anyone can insert gallery_stats" ON gallery_stats;
CREATE POLICY "anyone can insert gallery_stats" ON gallery_stats FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "anyone can update gallery_stats" ON gallery_stats;
CREATE POLICY "anyone can update gallery_stats" ON gallery_stats FOR UPDATE TO public USING (true);

DROP POLICY IF EXISTS "Service role can upsert stats" ON gallery_stats;
CREATE POLICY "Service role can upsert stats" ON gallery_stats FOR ALL TO public USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "public read missions" ON room_missions;
CREATE POLICY "public read missions" ON room_missions FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "auth write missions" ON room_missions;
CREATE POLICY "auth write missions" ON room_missions FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_public_read_room_missions" ON room_missions;
CREATE POLICY "allow_public_read_room_missions" ON room_missions FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "artist_manage_own_missions" ON room_missions;
CREATE POLICY "artist_manage_own_missions" ON room_missions FOR ALL TO authenticated USING (split_part(room_id, ':::', 1) = auth.uid()::text) WITH CHECK (split_part(room_id, ':::', 1) = auth.uid()::text);

DROP POLICY IF EXISTS "Authenticated can write room missions" ON room_missions;
CREATE POLICY "Authenticated can write room missions" ON room_missions FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can read room missions" ON room_missions;
CREATE POLICY "Anyone can read room missions" ON room_missions FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon write missions" ON room_missions;
CREATE POLICY "anon write missions" ON room_missions FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public read completion cfg" ON room_completion_config;
CREATE POLICY "public read completion cfg" ON room_completion_config FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "auth write completion cfg" ON room_completion_config;
CREATE POLICY "auth write completion cfg" ON room_completion_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can write completion config" ON room_completion_config;
CREATE POLICY "Authenticated can write completion config" ON room_completion_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can read completion config" ON room_completion_config;
CREATE POLICY "Anyone can read completion config" ON room_completion_config FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon write completion cfg" ON room_completion_config;
CREATE POLICY "anon write completion cfg" ON room_completion_config FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "own mission completions" ON mission_completions;
CREATE POLICY "own mission completions" ON mission_completions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "User manages own mission completions" ON mission_completions;
CREATE POLICY "User manages own mission completions" ON mission_completions FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public read mission completions" ON mission_completions;
CREATE POLICY "public read mission completions" ON mission_completions FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "public write mission completions" ON mission_completions;
CREATE POLICY "public write mission completions" ON mission_completions FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public read room completions" ON room_completions;
CREATE POLICY "public read room completions" ON room_completions FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "own room completions" ON room_completions;
CREATE POLICY "own room completions" ON room_completions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "User manages own room completions" ON room_completions;
CREATE POLICY "User manages own room completions" ON room_completions FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public write room completions" ON room_completions;
CREATE POLICY "public write room completions" ON room_completions FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "own token balance" ON user_tokens;
CREATE POLICY "own token balance" ON user_tokens FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "public manage user tokens" ON user_tokens;
CREATE POLICY "public manage user tokens" ON user_tokens FOR ALL TO public USING (true) WITH CHECK (true);

-- ── FORUM LIKES ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS forum_likes (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, post_id uuid NOT NULL, created_at timestamptz DEFAULT now(), PRIMARY KEY (id));

ALTER TABLE forum_likes DROP CONSTRAINT IF EXISTS forum_likes_user_post_unique;
ALTER TABLE forum_likes ADD CONSTRAINT forum_likes_user_post_unique UNIQUE (user_id, post_id);

ALTER TABLE forum_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read forum_likes" ON forum_likes;
CREATE POLICY "public read forum_likes" ON forum_likes FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "public insert forum_likes" ON forum_likes;
CREATE POLICY "public insert forum_likes" ON forum_likes FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "public delete forum_likes" ON forum_likes;
CREATE POLICY "public delete forum_likes" ON forum_likes FOR DELETE TO public USING (true);

-- ── GALLERY LIKES ─────────────────────────────────────────────────────────────

ALTER TABLE gallery_likes ENABLE ROW LEVEL SECURITY;

-- Unique constraint cần thiết cho upsert onConflict
ALTER TABLE gallery_likes DROP CONSTRAINT IF EXISTS gallery_likes_user_gallery_unique;
ALTER TABLE gallery_likes ADD CONSTRAINT gallery_likes_user_gallery_unique UNIQUE (user_id, gallery_name);

DROP POLICY IF EXISTS "public read gallery_likes" ON gallery_likes;
CREATE POLICY "public read gallery_likes" ON gallery_likes FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "public insert gallery_likes" ON gallery_likes;
CREATE POLICY "public insert gallery_likes" ON gallery_likes FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "public update gallery_likes" ON gallery_likes;
CREATE POLICY "public update gallery_likes" ON gallery_likes FOR UPDATE TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public delete gallery_likes" ON gallery_likes;
CREATE POLICY "public delete gallery_likes" ON gallery_likes FOR DELETE TO public USING (true);
