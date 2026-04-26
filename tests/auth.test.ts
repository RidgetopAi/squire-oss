/**
 * API key auth tests for src/api/middleware/auth.ts
 *
 * Proves two load-bearing security claims:
 *
 *   1. Key comparison is timing-safe — uses crypto.timingSafeEqual,
 *      not === or .startsWith. A timing-channel attacker can extract
 *      the key one byte at a time if comparison short-circuits.
 *
 *   2. Production fail-fast — if NODE_ENV=production and no API key is
 *      configured, the server must refuse to start. Otherwise a
 *      misconfigured deploy runs wide open.
 *
 * The Express middleware is exercised with hand-rolled req/res mocks
 * (no supertest dep — keeps this lean). The fail-fast is exercised by
 * spawning a child node process with controlled env, since the check
 * runs at module init.
 */

import './setup.ts';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { apiKeyAuth, verifyApiKey } from '../src/api/middleware/auth.ts';
import { config } from '../src/config/index.ts';

const REAL_KEY = 'a'.repeat(64);

type MockReq = { headers: Record<string, string | undefined> };
type MockRes = {
  statusCode: number;
  body: unknown;
  status: (n: number) => MockRes;
  json: (b: unknown) => MockRes;
};

function makeReq(headers: Record<string, string | undefined> = {}): MockReq {
  return { headers };
}

function makeRes(): MockRes {
  const res: MockRes = {
    statusCode: 0,
    body: undefined,
    status(n: number) {
      this.statusCode = n;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
  };
  return res;
}

// We mutate config.security.apiKey to simulate different deployments.
// Restore between tests so cross-test ordering doesn't matter.
const originalKey = config.security.apiKey;
function setKey(k: string): void {
  config.security.apiKey = k;
}

describe('apiKeyAuth — accepts valid keys', () => {
  before(() => setKey(REAL_KEY));
  after(() => setKey(originalKey));

  test('accepts correct key in x-api-key header', () => {
    const req = makeReq({ 'x-api-key': REAL_KEY });
    const res = makeRes();
    let nextCalled = false;
    apiKeyAuth(req as never, res as never, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 0);
  });

  test('accepts correct key in Authorization: Bearer header', () => {
    const req = makeReq({ authorization: `Bearer ${REAL_KEY}` });
    const res = makeRes();
    let nextCalled = false;
    apiKeyAuth(req as never, res as never, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  });
});

describe('apiKeyAuth — rejects bad keys', () => {
  before(() => setKey(REAL_KEY));
  after(() => setKey(originalKey));

  test('rejects missing key (no headers)', () => {
    const req = makeReq();
    const res = makeRes();
    apiKeyAuth(req as never, res as never, () => {
      throw new Error('next() should not be called');
    });
    assert.equal(res.statusCode, 401);
  });

  test('rejects wrong key (same length)', () => {
    const req = makeReq({ 'x-api-key': 'b'.repeat(64) });
    const res = makeRes();
    apiKeyAuth(req as never, res as never, () => {
      throw new Error('next() should not be called');
    });
    assert.equal(res.statusCode, 401);
  });

  test('rejects key with wrong length (timingSafeEqual would throw)', () => {
    // Critical: shorter or longer keys must be rejected cleanly, not
    // crash the request handler. timingSafeEqual throws on length
    // mismatch — the safeEqual wrapper must short-circuit first.
    const req = makeReq({ 'x-api-key': 'short' });
    const res = makeRes();
    apiKeyAuth(req as never, res as never, () => {
      throw new Error('next() should not be called');
    });
    assert.equal(res.statusCode, 401);
  });

  test('rejects malformed Authorization header (no Bearer prefix)', () => {
    const req = makeReq({ authorization: REAL_KEY });
    const res = makeRes();
    apiKeyAuth(req as never, res as never, () => {
      throw new Error('next() should not be called');
    });
    assert.equal(res.statusCode, 401);
  });

  test('rejects Bearer with wrong key', () => {
    const req = makeReq({ authorization: `Bearer ${'c'.repeat(64)}` });
    const res = makeRes();
    apiKeyAuth(req as never, res as never, () => {
      throw new Error('next() should not be called');
    });
    assert.equal(res.statusCode, 401);
  });
});

describe('apiKeyAuth — dev mode (no key configured)', () => {
  before(() => setKey(''));
  after(() => setKey(originalKey));

  test('passes through with no key configured', () => {
    const req = makeReq();
    const res = makeRes();
    let nextCalled = false;
    apiKeyAuth(req as never, res as never, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  });

  test('passes through even with garbage in headers', () => {
    const req = makeReq({ 'x-api-key': 'whatever', authorization: 'Bearer xxx' });
    const res = makeRes();
    let nextCalled = false;
    apiKeyAuth(req as never, res as never, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  });
});

describe('verifyApiKey — Socket.IO helper', () => {
  before(() => setKey(REAL_KEY));
  after(() => setKey(originalKey));

  test('accepts correct token', () => {
    assert.equal(verifyApiKey(REAL_KEY), true);
  });

  test('rejects wrong token', () => {
    assert.equal(verifyApiKey('b'.repeat(64)), false);
  });

  test('rejects non-string token', () => {
    assert.equal(verifyApiKey(undefined), false);
    assert.equal(verifyApiKey(null), false);
    assert.equal(verifyApiKey(12345), false);
    assert.equal(verifyApiKey({}), false);
  });

  test('rejects mismatched-length token without throwing', () => {
    assert.equal(verifyApiKey('short'), false);
  });

  test('returns true in dev mode (no key configured)', () => {
    setKey('');
    try {
      assert.equal(verifyApiKey('anything'), true);
      assert.equal(verifyApiKey(undefined), true);
    } finally {
      setKey(REAL_KEY);
    }
  });
});

describe('apiKeyAuth — uses crypto.timingSafeEqual', () => {
  test('source code uses timingSafeEqual, not === or includes', async () => {
    // Static check: the comparison primitive must be timingSafeEqual.
    // If a future refactor swaps in === or .startsWith, that's a
    // timing-channel regression; fail the test loudly.
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(
      new URL('../src/api/middleware/auth.ts', import.meta.url),
      'utf8'
    );
    assert.ok(
      src.includes('crypto.timingSafeEqual'),
      'auth.ts must use crypto.timingSafeEqual'
    );
    // Make sure no plain === comparison sneaks in for the key.
    // (We allow length comparison via !== which is fine — length isn't secret.)
    const keyEqualsPattern = /provided\s*===\s*expected|expected\s*===\s*provided/;
    assert.ok(
      !keyEqualsPattern.test(src),
      'auth.ts must NOT use === to compare keys directly'
    );
  });

  test('timingSafeEqual is what we think it is (sanity)', () => {
    // Sanity check that node's crypto.timingSafeEqual does indeed throw
    // on length mismatch — which is why safeEqual length-checks first.
    assert.throws(() =>
      crypto.timingSafeEqual(Buffer.from('a'), Buffer.from('bb'))
    );
  });
});

describe('production startup fail-fast', () => {
  // The check at src/api/server.ts:52-58 throws at module init when
  // NODE_ENV=production and SQUIRE_API_KEY is missing. We can't import
  // server.ts in this process (it would start the server); we spawn a
  // child node process that imports it under controlled env and assert
  // the throw fires.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, '..');
  const tsxBin = path.join(repoRoot, 'node_modules', '.bin', 'tsx');

  function spawnServer(env: Record<string, string>): {
    status: number | null;
    stderr: string;
    stdout: string;
  } {
    const result = spawnSync(
      tsxBin,
      ['-e', "import('./src/api/server.ts').catch(e => { console.error(String(e?.message ?? e)); process.exit(1); });"],
      {
        cwd: repoRoot,
        env: { ...process.env, ...env },
        encoding: 'utf8',
        timeout: 15_000,
      }
    );
    return {
      status: result.status,
      stderr: result.stderr ?? '',
      stdout: result.stdout ?? '',
    };
  }

  test('refuses to start when NODE_ENV=production and no API key', () => {
    const { status, stderr } = spawnServer({
      NODE_ENV: 'production',
      SQUIRE_API_KEY: '',
      CORS_ORIGIN: 'https://app.example.com', // valid so we exercise the API key check, not CORS
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    });
    assert.notEqual(status, 0, 'server should have exited non-zero');
    assert.match(
      stderr,
      /SQUIRE_API_KEY is required in production/,
      `expected fail-fast error in stderr; got: ${stderr.slice(0, 500)}`
    );
  });

  test('refuses to start when NODE_ENV=production and CORS_ORIGIN is localhost', () => {
    const { status, stderr } = spawnServer({
      NODE_ENV: 'production',
      SQUIRE_API_KEY: REAL_KEY,
      CORS_ORIGIN: 'http://localhost:3001',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    });
    assert.notEqual(status, 0, 'server should have exited non-zero');
    assert.match(
      stderr,
      /CORS_ORIGIN must be set to your frontend origin/,
      `expected CORS fail-fast error in stderr; got: ${stderr.slice(0, 500)}`
    );
  });

  test('refuses to start when NODE_ENV=production and CORS_ORIGIN is unset', () => {
    const { status, stderr } = spawnServer({
      NODE_ENV: 'production',
      SQUIRE_API_KEY: REAL_KEY,
      CORS_ORIGIN: '',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    });
    assert.notEqual(status, 0, 'server should have exited non-zero');
    assert.match(
      stderr,
      /CORS_ORIGIN must be set/,
      `expected CORS fail-fast error in stderr; got: ${stderr.slice(0, 500)}`
    );
  });
});
