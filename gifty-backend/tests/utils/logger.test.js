describe('LOG_TO_FILE=false (container mode)', () => {
  const loadIsolated = (modulePath) => {
    const fs = require('fs');
    const mkdir = jest.spyOn(fs, 'mkdirSync');
    let logger;
    jest.isolateModules(() => {
      process.env.LOG_TO_FILE = 'false';
      logger = require(modulePath);
    });
    delete process.env.LOG_TO_FILE;
    const calls = mkdir.mock.calls.map((c) => String(c[0]));
    mkdir.mockRestore();
    return { logger, calls };
  };

  it.each(['../../utils/logger', '../../config/logger'])('%s logs to console only and creates no logs dir', (modulePath) => {
    const { logger, calls } = loadIsolated(modulePath);
    const names = logger.transports.map((t) => t.name);
    expect(names).toContain('console');
    expect(names).not.toContain('file');
    expect(calls.some((p) => /logs$/.test(p))).toBe(false);
  });
});

describe('what a log line carries', () => {
  const { Writable } = require('stream');
  const winston = require('winston');
  let logger;
  let lines;

  beforeAll(() => {
    jest.isolateModules(() => {
      process.env.LOG_TO_FILE = 'false';
      process.env.LOG_LEVEL = 'info';
      logger = require('../../utils/logger');
    });
    delete process.env.LOG_TO_FILE;
    delete process.env.LOG_LEVEL;
    lines = [];
    logger.add(new winston.transports.Stream({
      stream: new Writable({ write(chunk, enc, done) { lines.push(JSON.parse(chunk.toString())); done(); } }),
      format: winston.format.json()
    }));
  });

  beforeEach(() => { lines.length = 0; });

  it('keeps a text or number argument as part of the message', () => {
    logger.warn('Tracking failed:', 'connection reset');
    logger.error('Retries left:', 3);
    expect(lines.map((l) => l.message)).toEqual(['Tracking failed: connection reset', 'Retries left: 3']);
    expect(lines[0]).not.toHaveProperty('0');
  });

  it('keeps an error argument with its message and stack', () => {
    logger.error('Save failed:', new Error('disk full'));
    expect(lines[0].message).toContain('disk full');
    expect(lines[0].stack).toMatch(/Error: disk full/);
  });

  it('still fills %s placeholders', () => {
    logger.info('Hello %s', 'world');
    expect(lines[0].message).toBe('Hello world');
  });

  it('drops levels below the configured one before formatting them', () => {
    // The sensitive-field filter reads every key: a counted getter shows whether it ran
    const counted = () => {
      const meta = { reads: 0 };
      Object.defineProperty(meta, 'detail', { enumerable: true, get() { meta.reads += 1; return 'x'; } });
      return meta;
    };
    const shown = counted();
    logger.info('shown', shown);
    const hidden = counted();
    logger.debug('not shown', hidden);

    expect(lines.map((l) => l.message)).toEqual(['shown']);
    // Only winston's copy of the meta into the entry; no format walked it
    expect(hidden.reads).toBe(1);
    expect(shown.reads).toBeGreaterThan(hidden.reads);
  });
});

// X-Request-ID comes from the client: only a plain id is echoed and logged
describe('request ids', () => {
  const logger = require('../../utils/logger');
  const run = (header) => {
    const req = { headers: header === undefined ? {} : { 'x-request-id': header }, method: 'GET', originalUrl: '/api/x', get: () => undefined };
    const res = { set: jest.fn(), on: jest.fn() };
    const info = jest.spyOn(logger, 'info').mockImplementation(() => {});
    logger.requestMiddleware(req, res, () => {});
    info.mockRestore();
    return req.id;
  };
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  it('keeps a well-formed id from the client or proxy', () => {
    expect(run('123e4567-e89b-12d3-a456-426614174000')).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(run('abcdef0123456789')).toBe('abcdef0123456789');
  });

  it.each([
    ['a line break', 'abc\nFAKE log line'],
    ['markup', '<script>alert(1)</script>'],
    ['an overlong value', 'a'.repeat(200)],
    ['a too-short value', 'abc'],
    ['an empty value', '']
  ])('replaces %s with a generated id', (_, header) => {
    expect(run(header)).toMatch(UUID);
  });

  it('generates one when there is none', () => {
    expect(run(undefined)).toMatch(UUID);
  });
});
