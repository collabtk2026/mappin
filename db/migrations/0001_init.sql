-- Mappin initial schema (PostgreSQL 16 + PostGIS 3)
-- 원칙: 사용자 데이터는 공급자 독립(WGS84). 모든 변경 가능 테이블은 change_seq / updated_at / deleted_at 보유 (동기화 피드).

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 전역 변경 시퀀스: 동기화 커서
CREATE SEQUENCE change_seq_global;

CREATE OR REPLACE FUNCTION touch_row() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  NEW.change_seq := nextval('change_seq_global');
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- ───────────────────────── 계정 ─────────────────────────
CREATE TABLE users (
  id            uuid PRIMARY KEY,                 -- UUIDv7 (앱/서버 생성)
  email         citext UNIQUE,
  email_verified_at timestamptz,
  password_hash text,                             -- argon2id, 소셜 전용 계정은 NULL
  display_name  text NOT NULL,
  avatar_url    text,
  handle        citext UNIQUE,                    -- 친구 검색용 (@handle)
  locale        text NOT NULL DEFAULT 'ko-KR',
  timezone      text NOT NULL DEFAULT 'Asia/Seoul',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,                      -- 탈퇴 요청 시각 (유예 후 하드 삭제)
  change_seq    bigint NOT NULL DEFAULT nextval('change_seq_global')
);

CREATE TABLE auth_identities (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider    text NOT NULL CHECK (provider IN ('google','apple','kakao','naver')),
  subject     text NOT NULL,                      -- 공급자 사용자 ID (sub)
  email       citext,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, subject)
);

CREATE TABLE sessions (
  id                 uuid PRIMARY KEY,
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash bytea NOT NULL UNIQUE,       -- SHA-256, 회전 시 교체
  previous_token_hash bytea,                      -- 재사용 탐지
  client_type        text NOT NULL CHECK (client_type IN ('web','ios','android')),
  device_name        text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  last_used_at       timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  revoked_at         timestamptz
);
CREATE INDEX sessions_user_idx ON sessions(user_id) WHERE revoked_at IS NULL;

-- ───────────────────────── 분류 ─────────────────────────
CREATE TABLE categories (
  id          uuid PRIMARY KEY,
  owner_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id   uuid REFERENCES categories(id) ON DELETE CASCADE,
  path        ltree NOT NULL,                     -- 조상 경로 (uuid 하이픈 제거 라벨) — 하위 트리 조회/공유 판정
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 50),
  icon_key    text,                               -- 기본 아이콘 (icons.key)
  color       text CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  change_seq  bigint NOT NULL DEFAULT nextval('change_seq_global')
);
CREATE INDEX categories_owner_idx ON categories(owner_id) WHERE deleted_at IS NULL;
CREATE INDEX categories_path_gist ON categories USING gist(path);
CREATE UNIQUE INDEX categories_sibling_name_uq
  ON categories(owner_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))
  WHERE deleted_at IS NULL;

CREATE TABLE tags (
  id          uuid PRIMARY KEY,
  owner_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 30),
  color       text CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  change_seq  bigint NOT NULL DEFAULT nextval('change_seq_global')
);
CREATE UNIQUE INDEX tags_owner_name_uq ON tags(owner_id, lower(name)) WHERE deleted_at IS NULL;

-- 시스템 아이콘 카탈로그 (커스텀 업로드는 P2: owner_id 추가)
CREATE TABLE icons (
  key         text PRIMARY KEY,                   -- 'food.ramen', 'cafe', 'pin.star' ...
  group_key   text NOT NULL,                      -- 'food','travel','shopping'...
  label_ko    text NOT NULL,
  label_en    text NOT NULL,
  svg_url     text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0
);

-- ───────────────────────── 장소(POI) ─────────────────────────
CREATE TABLE places (
  id              uuid PRIMARY KEY,
  owner_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id     uuid REFERENCES categories(id) ON DELETE SET NULL,
  title           text NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  location        geography(Point, 4326) NOT NULL, -- WGS84 (lng, lat)
  accuracy_m      real,                           -- 위치 정확도 (GPS로 찍었을 때)
  altitude_m      real,
  address_road    text,                           -- 도로명주소 (공공 API로 정규화)
  address_jibun   text,
  address_detail  text,                           -- 사용자 입력 (층/호 등)
  country_code    char(2),
  icon_key        text REFERENCES icons(key),     -- NULL이면 카테고리 기본 아이콘
  color           text CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  rating          smallint CHECK (rating BETWEEN 1 AND 5),
  visited_at      timestamptz,                    -- 최초/대표 방문 시각 (선택)
  source          text NOT NULL DEFAULT 'manual'
                  CHECK (source IN ('manual','search','current_location','import','shared_copy')),
  copied_from_place_id uuid,                      -- 공유받은 장소를 복사한 경우 원본
  version         integer NOT NULL DEFAULT 1,     -- 낙관적 잠금 (If-Match)
  created_at      timestamptz NOT NULL DEFAULT now(), -- 저장한 시간
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,                    -- 휴지통 (30일 후 하드 삭제)
  change_seq      bigint NOT NULL DEFAULT nextval('change_seq_global')
);
CREATE INDEX places_owner_idx      ON places(owner_id, updated_at DESC, id) WHERE deleted_at IS NULL;
CREATE INDEX places_location_gist  ON places USING gist(location);
CREATE INDEX places_category_idx   ON places(category_id) WHERE deleted_at IS NULL;
CREATE INDEX places_title_trgm     ON places USING gin(title gin_trgm_ops);
CREATE INDEX places_change_seq_idx ON places(owner_id, change_seq);

-- 외부 지도사 장소 참조: ID만 저장 (약관 준수 — 상세는 실시간 조회)
CREATE TABLE provider_refs (
  place_id     uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  provider     text NOT NULL CHECK (provider IN ('kakao','naver','google','osm')),
  external_id  text NOT NULL,
  linked_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (place_id, provider)
);

-- 태그 부착 (태그한 시간/사람)
CREATE TABLE place_tags (
  place_id    uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  tag_id      uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  tagged_at   timestamptz NOT NULL DEFAULT now(),
  tagged_by   uuid NOT NULL REFERENCES users(id),
  deleted_at  timestamptz,                        -- 태그 해제 (동기화 툼스톤)
  change_seq  bigint NOT NULL DEFAULT nextval('change_seq_global'),
  PRIMARY KEY (place_id, tag_id)
);
CREATE INDEX place_tags_tag_idx ON place_tags(tag_id) WHERE deleted_at IS NULL;

-- 메모 타임라인
CREATE TABLE notes (
  id          uuid PRIMARY KEY,
  place_id    uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES users(id),
  body        text NOT NULL CHECK (length(body) BETWEEN 1 AND 10000),
  is_private  boolean NOT NULL DEFAULT false,     -- 공유 시 제외
  noted_at    timestamptz NOT NULL DEFAULT now(), -- 사용자가 지정 가능한 "기록 시점" (예: 과거 방문 메모)
  revision    integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  change_seq  bigint NOT NULL DEFAULT nextval('change_seq_global')
);
CREATE INDEX notes_place_idx ON notes(place_id, noted_at DESC) WHERE deleted_at IS NULL;

-- 메모 수정 이력 (수정 전 내용 보존)
CREATE TABLE note_revisions (
  note_id     uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  revision    integer NOT NULL,
  body        text NOT NULL,
  edited_by   uuid NOT NULL REFERENCES users(id),
  edited_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (note_id, revision)
);

CREATE TABLE note_attachments (                   -- P1: 사진
  id          uuid PRIMARY KEY,
  note_id     uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  mime_type   text NOT NULL,
  width       integer,
  height      integer,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 장소 변경 이력 (감사 로그 / 타임라인)
CREATE TABLE place_events (
  id          bigserial PRIMARY KEY,
  place_id    uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  actor_id    uuid NOT NULL REFERENCES users(id),
  type        text NOT NULL,   -- place.created|place.updated|place.moved|place.deleted|place.restored
                               -- |icon.changed|category.changed|tag.added|tag.removed|note.added|note.edited|note.deleted
  data        jsonb NOT NULL DEFAULT '{}',        -- {field: {from, to}} 등
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX place_events_place_idx ON place_events(place_id, occurred_at DESC);

-- ───────────────────────── 관계·공유 ─────────────────────────
CREATE TABLE friendships (
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       text NOT NULL CHECK (status IN ('pending','accepted','blocked')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  PRIMARY KEY (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);
CREATE INDEX friendships_addressee_idx ON friendships(addressee_id, status);

CREATE TABLE shares (
  id                  uuid PRIMARY KEY,
  owner_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type         text NOT NULL CHECK (target_type IN ('place','category')),
  target_id           uuid NOT NULL,
  include_descendants boolean NOT NULL DEFAULT true,  -- category 공유 시 하위 포함
  grantee_type        text NOT NULL CHECK (grantee_type IN ('user','email','link')),
  grantee_user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  grantee_email       citext,                     -- 미가입자 초대 → 가입 시 user로 전환
  link_token_hash     bytea UNIQUE,               -- 링크 공유 (토큰 원문은 생성 시 1회만 반환)
  permission          text NOT NULL DEFAULT 'viewer' CHECK (permission IN ('viewer','editor')),
  message             text,
  accepted_at         timestamptz,
  expires_at          timestamptz,
  revoked_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  change_seq          bigint NOT NULL DEFAULT nextval('change_seq_global'),
  CHECK (
    (grantee_type = 'user'  AND grantee_user_id IS NOT NULL) OR
    (grantee_type = 'email' AND grantee_email   IS NOT NULL) OR
    (grantee_type = 'link'  AND link_token_hash IS NOT NULL AND permission = 'viewer')
  )
);
CREATE INDEX shares_grantee_idx ON shares(grantee_user_id) WHERE revoked_at IS NULL;
CREATE INDEX shares_target_idx  ON shares(target_type, target_id) WHERE revoked_at IS NULL;

-- ───────────────────────── 운영 ─────────────────────────
CREATE TABLE idempotency_keys (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key         text NOT NULL,
  request_hash bytea NOT NULL,
  response    jsonb NOT NULL,
  status_code smallint NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

-- 위치정보법: 위치정보 수집·이용·제공 사실 확인자료 (보존 기간 정책은 법무 확정)
CREATE TABLE location_access_logs (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL,
  action      text NOT NULL CHECK (action IN ('collect','use','provide')),
  purpose     text NOT NULL,
  recipient   text,                               -- 제공 시 제공받는 자 (공유 대상)
  occurred_at timestamptz NOT NULL DEFAULT now()
);

-- 변경 트리거
CREATE TRIGGER users_touch       BEFORE UPDATE ON users       FOR EACH ROW EXECUTE FUNCTION touch_row();
CREATE TRIGGER categories_touch  BEFORE UPDATE ON categories  FOR EACH ROW EXECUTE FUNCTION touch_row();
CREATE TRIGGER tags_touch        BEFORE UPDATE ON tags        FOR EACH ROW EXECUTE FUNCTION touch_row();
CREATE TRIGGER places_touch      BEFORE UPDATE ON places      FOR EACH ROW EXECUTE FUNCTION touch_row();
CREATE TRIGGER notes_touch       BEFORE UPDATE ON notes       FOR EACH ROW EXECUTE FUNCTION touch_row();
CREATE TRIGGER shares_touch      BEFORE UPDATE ON shares      FOR EACH ROW EXECUTE FUNCTION touch_row();

CREATE OR REPLACE FUNCTION touch_place_tag() RETURNS trigger AS $$
BEGIN
  NEW.change_seq := nextval('change_seq_global');
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER place_tags_touch BEFORE UPDATE ON place_tags FOR EACH ROW EXECUTE FUNCTION touch_place_tag();
