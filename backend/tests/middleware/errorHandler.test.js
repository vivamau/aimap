const { HttpError, notFound, errorHandler } = require('../../middleware/errorHandler');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(s) { this.statusCode = s; return this; },
    json(b) { this.body = b; return this; },
  };
}

describe('HttpError', () => {
  test('captures status, message, details', () => {
    const e = new HttpError(400, 'bad', ['x']);
    expect(e.status).toBe(400);
    expect(e.message).toBe('bad');
    expect(e.details).toEqual(['x']);
  });
});

describe('notFound()', () => {
  test('returns 404 with the path', () => {
    const res = mockRes();
    notFound({ originalUrl: '/missing' }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Not found', path: '/missing' });
  });
});

describe('errorHandler()', () => {
  test('uses err.status and includes details when present', () => {
    const res = mockRes();
    errorHandler(new HttpError(409, 'conflict', ['id']), {}, res, () => {});
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'conflict', details: ['id'] });
  });

  test('falls back to 500 and a generic message', () => {
    const res = mockRes();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    errorHandler(new Error(), {}, res, () => {});
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    spy.mockRestore();
  });

  test('omits details when not provided', () => {
    const res = mockRes();
    errorHandler(new HttpError(400, 'bad'), {}, res, () => {});
    expect(res.body).toEqual({ error: 'bad' });
  });
});
