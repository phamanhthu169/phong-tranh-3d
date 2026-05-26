-- Sequence cho bảng ranks (phải tạo trước)
CREATE SEQUENCE IF NOT EXISTS ranks_id_seq;

-- Tables
CREATE TABLE IF NOT EXISTS profiles (id uuid NOT NULL, display_name text, role text DEFAULT 'user'::text, created_at timestamptz DEFAULT now(), token_balance integer NOT NULL DEFAULT 0, password_hash text, bank_name text, bank_account_number text, bank_account_holder text, location text DEFAULT ''::text, website text DEFAULT ''::text, bio text DEFAULT ''::text, PRIMARY KEY (id));

CREATE TABLE IF NOT EXISTS galleries (id uuid NOT NULL DEFAULT gen_random_uuid(), owner_id uuid, name text, scene_data jsonb, updated_at timestamptz DEFAULT now(), PRIMARY KEY (id));

CREATE TABLE IF NOT EXISTS gallery (id uuid NOT NULL DEFAULT gen_random_uuid(), scene_data jsonb NOT NULL, created_at timestamptz DEFAULT now(), name text, data jsonb, updated_at timestamp DEFAULT now(), PRIMARY KEY (id));

CREATE TABLE IF NOT EXISTS gallery_stats (gallery_name text NOT NULL, views integer NOT NULL DEFAULT 0, PRIMARY KEY (gallery_name));

CREATE TABLE IF NOT EXISTS gallery_likes (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, gallery_name text NOT NULL, created_at timestamptz DEFAULT now(), PRIMARY KEY (id));

CREATE TABLE IF NOT EXISTS follows (follower_id uuid NOT NULL, following_id uuid NOT NULL, created_at timestamptz DEFAULT now(), PRIMARY KEY (follower_id, following_id));

CREATE TABLE IF NOT EXISTS ranks (id integer NOT NULL DEFAULT nextval('ranks_id_seq'::regclass), name text NOT NULL, min_tokens integer NOT NULL, badge_url text, display_order integer NOT NULL, PRIMARY KEY (id));

CREATE TABLE IF NOT EXISTS room_paths (id uuid NOT NULL DEFAULT gen_random_uuid(), room_id text NOT NULL, path_data jsonb NOT NULL, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now(), PRIMARY KEY (id));

CREATE TABLE IF NOT EXISTS room_missions (id uuid NOT NULL DEFAULT gen_random_uuid(), room_id text NOT NULL, mission_index smallint NOT NULL, mission_type text NOT NULL, title text, hidden_clue text, hidden_object_url text, hidden_object_ftype text, hidden_pos_x double precision, hidden_pos_y double precision, hidden_pos_z double precision, hidden_rot_y double precision DEFAULT 0, hidden_scale double precision DEFAULT 1, riddle_text text, riddle_answer text, riddle_artwork_url text, story_artwork_urls text[], story_hint text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), easter_eggs jsonb DEFAULT '[]'::jsonb, PRIMARY KEY (id));

CREATE TABLE IF NOT EXISTS room_completion_config (room_id text NOT NULL, completion_message text, token_reward integer NOT NULL DEFAULT 100, created_at timestamptz DEFAULT now(), PRIMARY KEY (room_id));

CREATE TABLE IF NOT EXISTS room_completions (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, room_id text NOT NULL, tokens_awarded integer NOT NULL DEFAULT 100, completed_at timestamptz DEFAULT now(), PRIMARY KEY (id));

CREATE TABLE IF NOT EXISTS mission_completions (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, room_id text NOT NULL, mission_index smallint NOT NULL, completed_at timestamptz DEFAULT now(), PRIMARY KEY (id));

CREATE TABLE IF NOT EXISTS treasure_chests (id uuid NOT NULL DEFAULT gen_random_uuid(), room_id text NOT NULL, pos_x double precision NOT NULL DEFAULT 0, pos_y double precision NOT NULL DEFAULT 0, pos_z double precision NOT NULL DEFAULT 0, rot_y double precision NOT NULL DEFAULT 0, question text NOT NULL, answer text NOT NULL, token_amount integer NOT NULL DEFAULT 50, created_at timestamptz NOT NULL DEFAULT now(), chest_scale double precision NOT NULL DEFAULT 1.0, PRIMARY KEY (id));

CREATE TABLE IF NOT EXISTS chest_opens (id uuid NOT NULL DEFAULT gen_random_uuid(), chest_id uuid NOT NULL, user_id uuid NOT NULL, opened_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (id));

CREATE TABLE IF NOT EXISTS visitor_tokens (user_id uuid NOT NULL, tokens integer DEFAULT 0, log jsonb DEFAULT '[]'::jsonb, quest_done jsonb DEFAULT '[]'::jsonb, quest_prog jsonb DEFAULT '{}'::jsonb, hidden_collected jsonb DEFAULT '[]'::jsonb, updated_at timestamptz DEFAULT now(), PRIMARY KEY (user_id));

CREATE TABLE IF NOT EXISTS user_tokens (user_id uuid NOT NULL, balance integer NOT NULL DEFAULT 0, updated_at timestamptz DEFAULT now(), PRIMARY KEY (user_id));

CREATE TABLE IF NOT EXISTS messages (id bigint NOT NULL, created_at timestamptz DEFAULT now(), room text NOT NULL, username text NOT NULL, content text NOT NULL, PRIMARY KEY (id));

CREATE TABLE IF NOT EXISTS forum_posts (id uuid NOT NULL DEFAULT gen_random_uuid(), author_name text NOT NULL, author_role text NOT NULL DEFAULT 'visitor'::text, content text NOT NULL, like_count integer NOT NULL DEFAULT 0, comment_count integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), checkin text, mentions text[], media jsonb, PRIMARY KEY (id));

CREATE TABLE IF NOT EXISTS forum_comments (id uuid NOT NULL DEFAULT gen_random_uuid(), post_id uuid NOT NULL, author_name text NOT NULL, author_role text NOT NULL DEFAULT 'visitor'::text, content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (id));

CREATE TABLE IF NOT EXISTS forum_likes (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, post_id uuid NOT NULL, created_at timestamptz DEFAULT now(), PRIMARY KEY (id), UNIQUE (user_id, post_id));

CREATE TABLE IF NOT EXISTS artist_products (id uuid NOT NULL DEFAULT gen_random_uuid(), artist_name text NOT NULL, title text NOT NULL, description text, price text, image_url text, created_at timestamptz DEFAULT now(), media_urls jsonb DEFAULT '[]'::jsonb, material text, dimensions text, stock_qty integer, variants jsonb DEFAULT '[]'::jsonb, PRIMARY KEY (id));

CREATE TABLE IF NOT EXISTS product_reviews (id uuid NOT NULL DEFAULT gen_random_uuid(), product_id uuid NOT NULL, reviewer_name text, rating integer NOT NULL, comment text, created_at timestamptz DEFAULT now(), PRIMARY KEY (id));

CREATE TABLE IF NOT EXISTS orders (id uuid NOT NULL DEFAULT gen_random_uuid(), order_id text NOT NULL, buyer_name text, buyer_phone text, buyer_email text, buyer_address text, buyer_district text, buyer_city text, note text, payment_method text, artworks jsonb, total text, status text NOT NULL DEFAULT 'new'::text, created_at timestamptz NOT NULL DEFAULT now(), user_id uuid, PRIMARY KEY (id));
