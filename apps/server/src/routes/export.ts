import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../app.js';
import { HttpError, notFound } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { parse, uuid } from '../lib/validate.js';

type Fmt = 'geojson' | 'csv' | 'gpx' | 'kml' | 'full_json';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
const csvCell = (s: unknown) => {
  const v = s == null ? '' : Array.isArray(s) ? s.join('|') : s instanceof Date ? s.toISOString() : String(s);
  return /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
};

export function exportRoutes(app: FastifyInstance, ctx: Ctx) {
  const { sql } = ctx;

  const jobJson = (j: any) => ({
    id: j.id,
    kind: j.kind,
    status: j.status,
    progress: j.progress,
    result_url: j.status === 'succeeded' ? `/v1/jobs/${j.id}/download` : null,
    summary: j.summary,
    created_at: j.created_at,
  });

  /** P0: 동기 실행 후 결과를 jobs에 저장 (P1에서 큐/오브젝트 스토리지로 이전) */
  app.post('/export', async (req, reply) => {
    const { userId } = await ctx.auth(req);
    const body = parse(z.object({ format: z.enum(['geojson', 'csv', 'gpx', 'kml', 'full_json']), category_id: uuid.optional() }), req.body);
    const rows = await sql<any[]>`
      SELECT p.id, p.title, ST_Y(p.location::geometry) AS lat, ST_X(p.location::geometry) AS lng,
             p.address_road, p.address_jibun, p.address_detail, p.icon_key, p.color, p.rating, p.visited_at,
             p.created_at, p.updated_at, c.name AS category,
             COALESCE((SELECT array_agg(t.name ORDER BY pt.tagged_at) FROM place_tags pt JOIN tags t ON t.id = pt.tag_id
                        WHERE pt.place_id = p.id AND pt.deleted_at IS NULL), '{}') AS tags,
             COALESCE((SELECT json_agg(json_build_object('body', n.body, 'noted_at', n.noted_at, 'is_private', n.is_private)
                                       ORDER BY n.noted_at)
                         FROM notes n WHERE n.place_id = p.id AND n.deleted_at IS NULL), '[]') AS notes
        FROM places p LEFT JOIN categories c ON c.id = p.category_id AND c.deleted_at IS NULL
       WHERE p.owner_id = ${userId} AND p.deleted_at IS NULL
         ${body.category_id ? sql`AND p.category_id IN (SELECT c2.id FROM categories c2 JOIN categories r ON r.id = ${body.category_id}
                                                        WHERE c2.path <@ r.path AND r.owner_id = ${userId})` : sql``}
       ORDER BY p.created_at`;
    const { mime, ext, text } = render(body.format, rows);
    const id = newId();
    const stamp = new Date().toISOString().slice(0, 10);
    await sql`
      INSERT INTO jobs (id, user_id, kind, status, progress, params, summary, result_mime, result_name, result_body, finished_at)
      VALUES (${id}, ${userId}, 'export', 'succeeded', 1, ${sql.json(body)}, ${sql.json({ places: rows.length })},
              ${mime}, ${`mappin-${stamp}.${ext}`}, ${text}, now())`;
    const [job] = await sql`SELECT * FROM jobs WHERE id = ${id}`;
    return reply.code(202).send(jobJson(job));
  });

  app.post('/import', async (req) => {
    await ctx.auth(req);
    throw new HttpError(501, 'NOT_IMPLEMENTED', '가져오기는 다음 버전(P1)에서 지원해요');
  });

  app.get<{ Params: { jobId: string } }>('/jobs/:jobId', async (req) => {
    const { userId } = await ctx.auth(req);
    const [job] = await sql`SELECT * FROM jobs WHERE id = ${parse(uuid, req.params.jobId)} AND user_id = ${userId}`;
    if (!job) throw notFound('작업');
    return jobJson(job);
  });

  app.get<{ Params: { jobId: string } }>('/jobs/:jobId/download', async (req, reply) => {
    const { userId } = await ctx.auth(req);
    const [job] = await sql`SELECT * FROM jobs WHERE id = ${parse(uuid, req.params.jobId)} AND user_id = ${userId} AND status = 'succeeded'`;
    if (!job) throw notFound('작업');
    return reply
      .type(job.result_mime)
      .header('content-disposition', `attachment; filename="${job.result_name}"`)
      .send(job.result_body);
  });
}

export function render(format: Fmt, rows: any[]): { mime: string; ext: string; text: string } {
  switch (format) {
    case 'geojson':
    case 'full_json':
      return {
        mime: 'application/geo+json',
        ext: format === 'geojson' ? 'geojson' : 'json',
        text: JSON.stringify(
          {
            type: 'FeatureCollection',
            features: rows.map((r) => ({
              type: 'Feature',
              id: r.id,
              geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
              properties: {
                title: r.title,
                category: r.category,
                tags: r.tags,
                icon: r.icon_key,
                color: r.color,
                address: r.address_road ?? r.address_jibun,
                created_at: r.created_at,
                ...(format === 'full_json' ? { notes: r.notes, rating: r.rating, visited_at: r.visited_at, address_detail: r.address_detail } : {}),
              },
            })),
          },
          null,
          2,
        ),
      };
    case 'csv': {
      const head = ['id', 'title', 'lat', 'lng', 'category', 'tags', 'address', 'icon', 'color', 'created_at', 'latest_note'];
      const lines = rows.map((r) =>
        [r.id, r.title, r.lat, r.lng, r.category, r.tags, r.address_road ?? r.address_jibun, r.icon_key, r.color, r.created_at, r.notes.at(-1)?.body]
          .map(csvCell)
          .join(','),
      );
      return { mime: 'text/csv; charset=utf-8', ext: 'csv', text: '﻿' + [head.join(','), ...lines].join('\n') };
    }
    case 'gpx':
      return {
        mime: 'application/gpx+xml',
        ext: 'gpx',
        text: `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Mappin" xmlns="http://www.topografix.com/GPX/1/1">\n${rows
          .map((r) => `  <wpt lat="${r.lat}" lon="${r.lng}"><name>${esc(r.title)}</name>${r.category ? `<type>${esc(r.category)}</type>` : ''}</wpt>`)
          .join('\n')}\n</gpx>\n`,
      };
    case 'kml':
      return {
        mime: 'application/vnd.google-earth.kml+xml',
        ext: 'kml',
        text: `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Mappin</name>\n${rows
          .map((r) => `  <Placemark><name>${esc(r.title)}</name><Point><coordinates>${r.lng},${r.lat}</coordinates></Point></Placemark>`)
          .join('\n')}\n</Document></kml>\n`,
      };
  }
}
