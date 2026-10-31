-- P0 additions: email tokens, jobs, shared-place resolution, icon catalog seed

CREATE TABLE email_tokens (
  token_hash  bytea PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     text NOT NULL CHECK (purpose IN ('verify_email','reset_password')),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE jobs (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('export','import')),
  status      text NOT NULL CHECK (status IN ('queued','running','succeeded','failed')),
  progress    real NOT NULL DEFAULT 0,
  params      jsonb NOT NULL DEFAULT '{}',
  summary     jsonb NOT NULL DEFAULT '{}',
  result_mime text,
  result_name text,
  result_body text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

-- 사용자가 공유받아 접근 가능한 장소 (수락된 user 공유, 만료/회수 제외)
CREATE OR REPLACE FUNCTION shared_places(uid uuid)
RETURNS TABLE (place_id uuid, share_id uuid, permission text) AS $$
  SELECT p.id, s.id, s.permission
    FROM shares s
    JOIN places p ON p.id = s.target_id
   WHERE s.target_type = 'place'
     AND s.grantee_user_id = uid AND s.accepted_at IS NOT NULL
     AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at > now())
     AND p.deleted_at IS NULL
  UNION ALL
  SELECT p.id, s.id, s.permission
    FROM shares s
    JOIN categories root ON root.id = s.target_id
    JOIN categories c ON (CASE WHEN s.include_descendants THEN c.path <@ root.path ELSE c.id = root.id END)
                     AND c.deleted_at IS NULL
    JOIN places p ON p.category_id = c.id AND p.deleted_at IS NULL
   WHERE s.target_type = 'category'
     AND s.grantee_user_id = uid AND s.accepted_at IS NOT NULL
     AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at > now())
$$ LANGUAGE sql STABLE;

-- 시스템 아이콘 (docs/06-design-system.md §5)
INSERT INTO icons (key, group_key, label_ko, label_en, svg_url, sort_order) VALUES
  ('pin.default','etc','기본 핀','Pin','/icons/pin.default.svg',0),
  ('food','food','음식점','Restaurant','/icons/food.svg',10),
  ('cafe','food','카페','Cafe','/icons/cafe.svg',11),
  ('bar','food','바','Bar','/icons/bar.svg',12),
  ('bakery','food','베이커리','Bakery','/icons/bakery.svg',13),
  ('travel','travel','여행','Travel','/icons/travel.svg',20),
  ('hotel','travel','숙소','Hotel','/icons/hotel.svg',21),
  ('nature','nature','자연','Nature','/icons/nature.svg',30),
  ('beach','nature','바다','Beach','/icons/beach.svg',31),
  ('mountain','nature','산','Mountain','/icons/mountain.svg',32),
  ('shopping','shopping','쇼핑','Shopping','/icons/shopping.svg',40),
  ('gift','shopping','선물','Gift','/icons/gift.svg',41),
  ('culture','culture','문화','Culture','/icons/culture.svg',50),
  ('art','culture','전시','Art','/icons/art.svg',51),
  ('music','culture','공연','Music','/icons/music.svg',52),
  ('camera','culture','사진 명소','Photo spot','/icons/camera.svg',53),
  ('sport','life','운동','Sport','/icons/sport.svg',60),
  ('health','life','병원','Health','/icons/health.svg',61),
  ('school','life','학교','School','/icons/school.svg',62),
  ('work','life','회사','Work','/icons/work.svg',63),
  ('home','life','집','Home','/icons/home.svg',64),
  ('parking','life','주차','Parking','/icons/parking.svg',65),
  ('star','etc','즐겨찾기','Star','/icons/star.svg',90),
  ('heart','etc','하트','Heart','/icons/heart.svg',91);

ALTER TABLE places ADD COLUMN address_source text;
ALTER TABLE places ADD COLUMN address_postal_code text;

-- 카테고리 아이콘/색 상속: 가장 가까운 조상에서 값을 가져온다
CREATE OR REPLACE FUNCTION category_icon(cid uuid) RETURNS text AS $$
  SELECT a.icon_key FROM categories c JOIN categories a ON a.path @> c.path
   WHERE c.id = cid AND a.icon_key IS NOT NULL AND a.deleted_at IS NULL
   ORDER BY nlevel(a.path) DESC LIMIT 1
$$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION category_color(cid uuid) RETURNS text AS $$
  SELECT a.color FROM categories c JOIN categories a ON a.path @> c.path
   WHERE c.id = cid AND a.color IS NOT NULL AND a.deleted_at IS NULL
   ORDER BY nlevel(a.path) DESC LIMIT 1
$$ LANGUAGE sql STABLE;
