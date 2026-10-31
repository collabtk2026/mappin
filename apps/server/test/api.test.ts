import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AGREE, Client, setup, signup, type TestEnv } from './helpers.js';

let env: TestEnv;
beforeAll(async () => {
  env = await setup();
});
afterAll(async () => {
  await env.close();
});

const SEONGSU = { lat: 37.5446, lng: 127.0559 };
const JEJU = { lat: 33.4996, lng: 126.5312 };

describe('auth', () => {
  it('signup → me, duplicate email, login, wrong password', async () => {
    const { client, res } = await signup(env.app, 'auth@example.com', '민지');
    expect(res.body.refresh_token).toBeTruthy();
    const me = await client.get('/me');
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ email: 'auth@example.com', display_name: '민지', email_verified: false, stats: { places: 0 } });

    const anon = new Client(env.app);
    const dup = await anon.post('/auth/signup', { email: 'AUTH@example.com', password: 'correct-horse-1', display_name: 'x', agreements: AGREE });
    expect(dup.status).toBe(409);
    expect(dup.headers['content-type']).toContain('application/problem+json');

    expect((await anon.post('/auth/login', { email: 'auth@example.com', password: 'nope' })).status).toBe(401);
    const ok = await anon.post('/auth/login', { email: 'auth@example.com', password: 'correct-horse-1', client: { type: 'ios' } });
    expect(ok.status).toBe(200);
    expect(ok.body.user.id).toBe(me.body.id);
  });

  it('requires agreements and strong password', async () => {
    const anon = new Client(env.app);
    const r = await anon.post('/auth/signup', { email: 'weak@example.com', password: 'short', display_name: 'x', agreements: { ...AGREE, location: false } });
    expect(r.status).toBe(422);
    expect(r.body.errors.map((e: any) => e.field)).toEqual(expect.arrayContaining(['password', 'agreements.location']));
  });

  it('refresh token rotates and reuse revokes the session', async () => {
    const { res } = await signup(env.app, 'rotate@example.com');
    const anon = new Client(env.app);
    const r1 = await anon.post('/auth/refresh', { refresh_token: res.body.refresh_token });
    expect(r1.status).toBe(200);
    expect(r1.body.refresh_token).not.toBe(res.body.refresh_token);
    // 이전 토큰 재사용 → 탈취로 간주, 세션 폐기
    expect((await anon.post('/auth/refresh', { refresh_token: res.body.refresh_token })).status).toBe(401);
    expect((await anon.post('/auth/refresh', { refresh_token: r1.body.refresh_token })).status).toBe(401);
    expect((await new Client(env.app, r1.body.access_token).get('/me')).status).toBe(401);
  });

  it('web uses HttpOnly cookie + CSRF header for refresh', async () => {
    const anon = new Client(env.app);
    const r = await anon.post('/auth/signup', { email: 'web@example.com', password: 'correct-horse-1', display_name: 'w', agreements: AGREE, client: { type: 'web' } });
    expect(r.body.refresh_token).toBeUndefined();
    const cookie = String(r.headers['set-cookie']);
    expect(cookie).toMatch(/mp_rt=.+HttpOnly/);
    const raw = cookie.split(';')[0]!;
    expect((await anon.post('/auth/refresh', {}, { cookie: raw })).status).toBe(403);
    const ok = await anon.post('/auth/refresh', {}, { cookie: raw, 'x-mappin-csrf': '1' });
    expect(ok.status).toBe(200);
    expect(ok.body.access_token).toBeTruthy();
  });

  it('logout invalidates the access token immediately', async () => {
    const { client } = await signup(env.app, 'logout@example.com');
    expect((await client.post('/auth/logout')).status).toBe(204);
    expect((await client.get('/me')).status).toBe(401);
  });

  it('password reset + email verification through mailed tokens', async () => {
    const { client } = await signup(env.app, 'reset@example.com');
    const verifyMail = env.mailer.sent.find((m) => m.to === 'reset@example.com' && m.subject.includes('인증'))!;
    const vtoken = /token=([\w-]+)/.exec(verifyMail.text)![1];
    const anon = new Client(env.app);
    expect((await anon.post('/auth/email/verify', { token: vtoken })).status).toBe(204);
    expect((await anon.post('/auth/email/verify', { token: vtoken })).status).toBe(400);
    expect((await client.get('/me')).body.email_verified).toBe(true);

    expect((await anon.post('/auth/password/forgot', { email: 'nobody@example.com' })).status).toBe(202);
    expect((await anon.post('/auth/password/forgot', { email: 'reset@example.com' })).status).toBe(202);
    const mail = env.mailer.sent.findLast((m) => m.to === 'reset@example.com')!;
    const token = /token=([\w-]+)/.exec(mail.text)![1];
    expect((await anon.post('/auth/password/reset', { token, new_password: 'brand-new-pass-2' })).status).toBe(204);
    expect((await client.get('/me')).status).toBe(401); // 모든 세션 폐기
    expect((await anon.post('/auth/login', { email: 'reset@example.com', password: 'brand-new-pass-2' })).status).toBe(200);
  });

  it('social login: new user needs agreements, then reuses identity', async () => {
    const anon = new Client(env.app);
    expect((await anon.post('/auth/oauth/kakao', { access_token: 'k-100|kakao@example.com' })).status).toBe(428);
    const r = await anon.post('/auth/oauth/kakao', { access_token: 'k-100|kakao@example.com', agreements: AGREE, client: { type: 'ios' } });
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({ email: 'kakao@example.com', email_verified: true, has_password: false });
    const again = await anon.post('/auth/oauth/kakao', { access_token: 'k-100|kakao@example.com' });
    expect(again.body.user.id).toBe(r.body.user.id);
    expect((await anon.post('/auth/oauth/google', { id_token: 'x' })).status).toBe(501);
  });
});

describe('places, notes, tags, categories', () => {
  let me: Client;
  let catFood: string;
  let catSeoul: string;
  let placeId: string;

  beforeAll(async () => {
    me = (await signup(env.app, 'places@example.com', '수진')).client;
  });

  it('builds a category tree with counts', async () => {
    catFood = (await me.post('/categories', { name: '맛집', icon_key: 'food', color: '#E4572E' })).body.id;
    const seoul = await me.post('/categories', { name: '서울', parent_id: catFood });
    expect(seoul.status).toBe(201);
    catSeoul = seoul.body.id;
    expect((await me.post('/categories', { name: '서울', parent_id: catFood })).status).toBe(409);
    const tree = await me.get('/categories');
    expect(tree.body.items).toHaveLength(1);
    expect(tree.body.items[0]).toMatchObject({ name: '맛집', children: [{ name: '서울' }] });
  });

  it('creates a place with tags, first note, address and resolved icon', async () => {
    const r = await me.post(
      '/places',
      {
        title: '성수 라멘',
        location: SEONGSU,
        category_id: catSeoul,
        new_tags: ['데이트', '웨이팅'],
        first_note: { body: '첫 방문. 국물이 진하다' },
        source: 'search',
        provider_ref: { provider: 'kakao', external_id: 'K1' },
      },
      { 'idempotency-key': 'create-1' },
    );
    expect(r.status).toBe(201);
    expect(r.headers.etag).toBe('"1"');
    placeId = r.body.id;
    expect(r.body).toMatchObject({
      title: '성수 라멘',
      location: SEONGSU,
      permission: 'owner',
      icon: { key: 'food', color: '#E4572E', source: 'category' },
      address: { road: '서울특별시 성동구 성수이로 78', source: 'kakao' },
      category_path: [{ name: '맛집' }, { name: '서울' }],
      provider_refs: [{ provider: 'kakao', external_id: 'K1' }],
      note_count: 1,
    });
    expect(r.body.tags.map((t: any) => t.name)).toEqual(['데이트', '웨이팅']);
    expect(r.body.tags[0].tagged_at).toBeTruthy();

    // 같은 Idempotency-Key 재시도는 중복 생성하지 않음
    const replay = await me.post('/places', { title: '성수 라멘', location: SEONGSU }, { 'idempotency-key': 'create-1' });
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.body.id).toBe(placeId);

    const jeju = await me.post('/places', { title: '제주 오름', location: JEJU, icon_key: 'mountain', color: '#2E9F6B', new_tags: ['데이트'] });
    expect(jeju.status, JSON.stringify(jeju.body)).toBe(201);
    const cafe = await me.post('/places', { title: '성수 카페', location: { lat: 37.5452, lng: 127.0571 }, icon_key: 'cafe' });
    expect(cafe.status, JSON.stringify(cafe.body)).toBe(201);
  });

  it('lists by bbox / near / category subtree / tags / keyword', async () => {
    const seoulBox = '126.9,37.4,127.2,37.7';
    const inSeoul = await me.get(`/places?bbox=${seoulBox}`);
    expect(inSeoul.body.items.map((p: any) => p.title).sort()).toEqual(['성수 라멘', '성수 카페']);
    const near = await me.get(`/places?near=${SEONGSU.lat},${SEONGSU.lng},200&sort=distance`);
    expect(near.body.items[0].title).toBe('성수 라멘');
    expect(near.body.items[0].distance_m).toBeLessThan(1);
    expect((await me.get(`/places?category_id=${catFood}`)).body.items).toHaveLength(1);
    expect((await me.get(`/places?category_id=${catFood}&include_subcategories=false`)).body.items).toHaveLength(0);
    expect((await me.get('/places?uncategorized=true')).body.items).toHaveLength(2);

    const tags = (await me.get('/tags')).body.items;
    const date = tags.find((t: any) => t.name === '데이트');
    const wait = tags.find((t: any) => t.name === '웨이팅');
    expect(date.place_count).toBe(2);
    expect((await me.get(`/places?tag=${date.id}&tag=${wait.id}`)).body.items).toHaveLength(2);
    expect((await me.get(`/places?tag=${date.id}&tag=${wait.id}&tag_mode=all`)).body.items).toHaveLength(1);
    expect((await me.get(`/places?q=${encodeURIComponent('국물')}`)).body.items[0].title).toBe('성수 라멘');

    const page1 = await me.get('/places?limit=2');
    expect(page1.body.items).toHaveLength(2);
    const page2 = await me.get(`/places?limit=2&cursor=${page1.body.next_cursor}`);
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.next_cursor).toBeNull();
  });

  it('updates with optimistic locking and records events', async () => {
    expect((await me.patch(`/places/${placeId}`, { title: 'x' })).status).toBe(428);
    expect((await me.patch(`/places/${placeId}`, { title: 'x' }, { 'if-match': '"9"' })).status).toBe(412);
    const r = await me.patch(
      `/places/${placeId}`,
      { title: '성수 라멘집', location: { lat: 37.5447, lng: 127.056 }, icon_key: 'food', color: '#7B61FF' },
      { 'if-match': '"1"' },
    );
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ title: '성수 라멘집', version: 2, icon: { key: 'food', color: '#7B61FF', source: 'place' } });
    expect(r.headers.etag).toBe('"2"');
  });

  it('keeps note timeline and revision history', async () => {
    const add = await me.post(`/places/${placeId}/notes`, { body: '재방문: 웨이팅 30분', noted_at: '2026-11-02T03:00:00Z' });
    expect(add.status).toBe(201);
    const noteId = add.body.id;
    expect((await me.patch(`/notes/${noteId}`, { body: 'x' }, { 'if-match': '"2"' })).status).toBe(412);
    const edit = await me.patch(`/notes/${noteId}`, { body: '재방문: 웨이팅 40분' }, { 'if-match': '"1"' });
    expect(edit.body).toMatchObject({ revision: 2, edited: true, body: '재방문: 웨이팅 40분' });
    const revs = await me.get(`/notes/${noteId}/revisions`);
    expect(revs.body.items.map((r: any) => [r.revision, r.body])).toEqual([
      [2, '재방문: 웨이팅 40분'],
      [1, '재방문: 웨이팅 30분'],
    ]);
    await me.post(`/places/${placeId}/notes`, { body: '나만 보는 메모', is_private: true });

    const tl = await me.get(`/places/${placeId}/timeline`);
    const kinds = tl.body.items.map((i: any) => (i.kind === 'note' ? `note:${i.note.body}` : `event:${i.event.type}`));
    expect(kinds).toEqual(expect.arrayContaining(['event:place.created', 'event:tag.added', 'event:place.moved', 'event:icon.changed', 'event:place.updated', 'note:첫 방문. 국물이 진하다', 'note:재방문: 웨이팅 40분']));
    // 시간 역순 정렬
    const times = tl.body.items.map((i: any) => new Date(i.at).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it('attaches/detaches tags idempotently with tagged_at', async () => {
    const tag = (await me.post('/tags', { name: '재방문의사', color: '#2E9F6B' })).body;
    expect((await me.post('/tags', { name: '재방문의사' })).status).toBe(409);
    const a1 = await me.put(`/places/${placeId}/tags/${tag.id}`);
    const a2 = await me.put(`/places/${placeId}/tags/${tag.id}`);
    expect(a1.body.tagged_at).toBe(a2.body.tagged_at);
    expect((await me.del(`/places/${placeId}/tags/${tag.id}`)).status).toBe(204);
    const p = await me.get(`/places/${placeId}`);
    expect(p.body.tags.map((t: any) => t.name)).not.toContain('재방문의사');
    const events = (await me.get(`/places/${placeId}/timeline?types=event`)).body.items.map((i: any) => i.event.type);
    expect(events.filter((t: string) => t === 'tag.added')).toHaveLength(3);
    expect(events).toContain('tag.removed');
  });

  it('moves categories without cycles and deletes with move_to_parent', async () => {
    const sub = (await me.post('/categories', { name: '성수', parent_id: catSeoul })).body.id;
    expect((await me.patch(`/categories/${catFood}`, { parent_id: sub })).status).toBe(409);
    const travel = (await me.post('/categories', { name: '여행', icon_key: 'travel' })).body.id;
    expect((await me.patch(`/categories/${catSeoul}`, { parent_id: travel })).status).toBe(200);
    const tree = (await me.get('/categories')).body.items;
    const t = tree.find((c: any) => c.name === '여행');
    expect(t.children[0]).toMatchObject({ name: '서울', place_count: 1, children: [{ name: '성수' }] });
    expect(t.place_count).toBe(1);
    // 서울 삭제 → 장소는 부모(여행)로 이동, 하위(성수)도 삭제
    expect((await me.del(`/categories/${catSeoul}?places=move_to_parent`)).status).toBe(204);
    const p = await me.get(`/places/${placeId}`);
    expect(p.body.category_id).toBe(travel);
    expect((await me.get('/categories?format=flat')).body.items.map((c: any) => c.name).sort()).toEqual(['맛집', '여행']);
  });

  it('soft deletes to trash and restores', async () => {
    const tmp = (await me.post('/places', { title: '임시', location: SEONGSU })).body.id;
    expect((await me.del(`/places/${tmp}`)).status).toBe(204);
    expect((await me.get('/places?deleted=true')).body.items.map((p: any) => p.id)).toEqual([tmp]);
    expect((await me.post(`/places/${tmp}/restore`)).body.deleted_at).toBeNull();
    const b = await me.post('/places/batch', { place_ids: [tmp], action: 'delete' });
    expect(b.body).toEqual({ succeeded: [tmp], failed: [] });
  });

  it('geo search marks already saved places; map config and clusters', async () => {
    const s = await me.get(`/geo/search?q=${encodeURIComponent('라멘')}&near=37.54,127.05`);
    expect(s.status).toBe(200);
    expect(s.body.items[0]).toMatchObject({ provider_ref: { provider: 'kakao', external_id: 'K1' }, already_saved_place_id: placeId, suggested_icon_key: 'food' });
    expect(s.body.items[1]).toMatchObject({ already_saved_place_id: null, suggested_icon_key: 'cafe' });
    const cfg = await me.get('/map/config?platform=web');
    expect(cfg.body.default_provider.id).toBe('maplibre');
    const cl = await me.get('/map/clusters?bbox=124,33,132,39&zoom=5');
    expect(cl.body.clusters[0].count).toBe(2); // 성수 두 곳
    expect(cl.body.places.map((p: any) => p.title)).toEqual(['제주 오름']);
    const icons = await me.get('/icons');
    expect(icons.body.items.length).toBeGreaterThan(20);
  });

  it('exports GeoJSON and CSV', async () => {
    const job = await me.post('/export', { format: 'geojson' });
    expect(job.status).toBe(202);
    expect(job.body.status).toBe('succeeded');
    const dl = await me.get(job.body.result_url);
    expect(dl.headers['content-disposition']).toContain('.geojson');
    expect(dl.body.features).toHaveLength(3);
    const csv = await me.post('/export', { format: 'csv' });
    const text = (await me.get(csv.body.result_url)).body as string;
    expect(text).toContain('성수 라멘집');
  });
});

describe('sharing', () => {
  let owner: Client;
  let friend: Client;
  let stranger: Client;
  let cat: string;
  let place: string;

  beforeAll(async () => {
    owner = (await signup(env.app, 'owner@example.com', '하늘')).client;
    friend = (await signup(env.app, 'friend@example.com', '바다')).client;
    stranger = (await signup(env.app, 'stranger@example.com', '낯선이')).client;
    cat = (await owner.post('/categories', { name: '성수 맛집', icon_key: 'food', color: '#E4572E' })).body.id;
    place = (await owner.post('/places', { title: '공유 라멘', location: SEONGSU, category_id: cat, first_note: { body: '모두 보는 메모' } })).body.id;
    await owner.post(`/places/${place}/notes`, { body: '비밀 메모', is_private: true });
  });

  it('shares a category with a user who must accept', async () => {
    expect((await stranger.get(`/places/${place}`)).status).toBe(404);
    const s = await owner.post('/shares', { target_type: 'category', target_id: cat, grantee: { type: 'email', email: 'friend@example.com' } });
    expect(s.status).toBe(201);
    expect(s.body).toMatchObject({ grantee_type: 'user', status: 'pending', place_count: 1, target_title: '성수 맛집' });
    const inbox = await friend.get('/shared-with-me');
    expect(inbox.body.items).toHaveLength(1);
    expect((await friend.get(`/places/${place}`)).status).toBe(404); // 수락 전
    expect((await friend.post(`/shares/${s.body.id}/accept`)).body.status).toBe('accepted');

    const layer = await friend.get('/places?scope=shared');
    expect(layer.body.items).toHaveLength(1);
    expect(layer.body.items[0]).toMatchObject({ id: place, via_share_id: s.body.id, note_count: 1 });
    const detail = await friend.get(`/places/${place}`);
    expect(detail.body.permission).toBe('viewer');
    expect(detail.body.recent_notes.map((n: any) => n.body)).toEqual(['모두 보는 메모']);
    const cats = await friend.get('/categories?scope=shared');
    expect(cats.body.items[0].name).toBe('성수 맛집');

    // viewer는 수정 불가, 장소 추가 시 공유 범위 자동 반영
    expect((await friend.patch(`/places/${place}`, { title: 'hack' }, { 'if-match': '"1"' })).status).toBe(403);
    await owner.post('/places', { title: '공유 카페', location: SEONGSU, category_id: cat });
    expect((await friend.get('/places?scope=shared')).body.items).toHaveLength(2);

    // 내 장소로 복사
    const copy = await friend.post(`/places/${place}/copy`, { include_notes: true });
    expect(copy.status).toBe(201);
    expect(copy.body).toMatchObject({ owner_id: friend.userId, source: 'shared_copy', note_count: 1, permission: 'owner' });

    // 회수하면 즉시 사라짐
    expect((await owner.del(`/shares/${s.body.id}`)).status).toBe(204);
    expect((await friend.get('/places?scope=shared')).body.items).toHaveLength(0);
    expect((await friend.get(`/places/${place}`)).status).toBe(404);
  });

  it('editor can edit, invite by email claims on signup', async () => {
    const s = await owner.post('/shares', { target_type: 'place', target_id: place, grantee: { type: 'email', email: 'later@example.com' }, permission: 'editor' });
    expect(s.body).toMatchObject({ grantee_type: 'email', status: 'pending' });
    const later = (await signup(env.app, 'later@example.com', '나중')).client;
    const inbox = await later.get('/shared-with-me');
    expect(inbox.body.items[0].id).toBe(s.body.id);
    await later.post(`/shares/${s.body.id}/accept`);
    const v = (await later.get(`/places/${place}`)).body.version;
    const upd = await later.patch(`/places/${place}`, { title: '공유 라멘 (편집됨)' }, { 'if-match': `"${v}"` });
    expect(upd.status).toBe(200);
    expect((await later.del(`/places/${place}`)).status).toBe(403);
  });

  it('link share: public read-only view without private notes, rotate and revoke', async () => {
    const s = await owner.post('/shares', { target_type: 'category', target_id: cat, grantee: { type: 'link' }, permission: 'editor' });
    expect(s.body.permission).toBe('viewer');
    const token = s.body.link_url.split('/s/')[1];
    const anon = new Client(env.app);
    const view = await anon.get(`/public/shares/${token}`);
    expect(view.status).toBe(200);
    expect(view.body.share).toMatchObject({ title: '성수 맛집', owner: { display_name: '하늘' } });
    expect(view.body.places).toHaveLength(2);
    const notes = view.body.places.flatMap((p: any) => p.recent_notes.map((n: any) => n.body));
    expect(notes).toContain('모두 보는 메모');
    expect(notes).not.toContain('비밀 메모');
    expect(JSON.stringify(view.body)).not.toContain('owner@example.com');

    const rotated = await owner.post(`/shares/${s.body.id}/rotate-link`);
    expect((await anon.get(`/public/shares/${token}`)).status).toBe(404);
    const token2 = rotated.body.link_url.split('/s/')[1];
    expect((await anon.get(`/public/shares/${token2}`)).status).toBe(200);
    await owner.del(`/shares/${s.body.id}`);
    expect((await anon.get(`/public/shares/${token2}`)).status).toBe(410);
  });

  it('cannot share what you do not own or to yourself', async () => {
    expect((await stranger.post('/shares', { target_type: 'place', target_id: place, grantee: { type: 'link' } })).status).toBe(404);
    expect((await owner.post('/shares', { target_type: 'place', target_id: place, grantee: { type: 'email', email: 'owner@example.com' } })).status).toBe(422);
  });
});

describe('account deletion', () => {
  it('blocks login, revokes sessions and shares', async () => {
    const { client } = await signup(env.app, 'bye@example.com');
    const other = (await signup(env.app, 'bye-friend@example.com')).client;
    const p = (await client.post('/places', { title: '안녕', location: SEONGSU })).body.id;
    const s = (await client.post('/shares', { target_type: 'place', target_id: p, grantee: { type: 'email', email: 'bye-friend@example.com' } })).body;
    await other.post(`/shares/${s.id}/accept`);
    expect((await other.get(`/places/${p}`)).status).toBe(200);
    expect((await client.del('/me')).status).toBe(202);
    expect((await client.get('/me')).status).toBe(401);
    expect((await new Client(env.app).post('/auth/login', { email: 'bye@example.com', password: 'correct-horse-1' })).status).toBe(401);
    expect((await other.get(`/places/${p}`)).status).toBe(404);
  });
});
