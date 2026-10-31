export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public errors?: { field: string; message: string }[],
  ) {
    super(message);
  }
}

export const badRequest = (code: string, msg: string) => new HttpError(400, code, msg);
export const unauthorized = (msg = '로그인이 필요해요') => new HttpError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg = '권한이 없어요') => new HttpError(403, 'FORBIDDEN', msg);
export const notFound = (what = '리소스') => new HttpError(404, 'NOT_FOUND', `${what}를 찾을 수 없어요`);
export const conflict = (code: string, msg: string) => new HttpError(409, code, msg);
export const preconditionFailed = (msg = '다른 곳에서 먼저 수정됐어요. 새로고침 후 다시 시도해 주세요') =>
  new HttpError(412, 'VERSION_CONFLICT', msg);
