/**
 * Dangerous-tools gate tests for src/tools/index.ts
 *
 * Proves the load-bearing security claim that tools which can shell out,
 * mutate the host filesystem, or drive a browser are NOT exposed to the
 * LLM unless SQUIRE_ENABLE_DANGEROUS_TOOLS is explicitly set to 'true'.
 *
 * If this gate fails, every prompt-injection vector escalates to RCE on
 * the operator's machine. We assert directly against the spec arrays
 * (the security boundary) rather than the runtime registry, because the
 * registry is built once at module import and depends on the env var
 * value at that moment — testing the boundary itself is what matters.
 */

import './setup.ts';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { safeToolSpecs, dangerousToolSpecs } from '../src/tools/index.ts';

const safeNames = new Set(safeToolSpecs.map((s) => s.name));
const dangerousNames = new Set(dangerousToolSpecs.map((s) => s.name));

describe('dangerous-tools gate — list contents', () => {
  // Tools we explicitly promise are gated. If any of these escape the
  // gate, prompt-injection → RCE.
  const mustBeGated = [
    'bash_execute',
    'claude_code',
    'file_read',
    'file_write',
    'file_edit',
    'grep_search',
    'glob_files',
    'git_operations',
    'sandbox',
    'sandbox_cleanup',
  ];

  for (const name of mustBeGated) {
    test(`${name} is gated`, () => {
      assert.ok(
        dangerousNames.has(name),
        `${name} must be in dangerousToolSpecs`
      );
      assert.ok(
        !safeNames.has(name),
        `${name} must NOT be in safeToolSpecs`
      );
    });
  }

  test('all browser_* tools are gated', () => {
    const browserTools = [...dangerousNames].filter((n) =>
      n.startsWith('browser_')
    );
    assert.ok(browserTools.length > 0, 'expected at least one browser_* tool');
    for (const n of browserTools) {
      assert.ok(!safeNames.has(n), `${n} must not be in safeToolSpecs`);
    }
  });

  test('no file_*, sandbox*, or browser_* tool slipped into safeToolSpecs', () => {
    const leaked = [...safeNames].filter(
      (n) =>
        n.startsWith('file_') ||
        n.startsWith('sandbox') ||
        n.startsWith('browser_') ||
        n === 'bash_execute' ||
        n === 'claude_code' ||
        n === 'grep_search' ||
        n === 'glob_files' ||
        n === 'git_operations'
    );
    assert.deepEqual(leaked, [], `dangerous tools leaked into safe list: ${leaked.join(', ')}`);
  });
});

describe('dangerous-tools gate — no leakage', () => {
  test('safe and dangerous lists are disjoint', () => {
    const overlap = [...dangerousNames].filter((n) => safeNames.has(n));
    assert.deepEqual(
      overlap,
      [],
      `tools appearing in BOTH lists would defeat the gate: ${overlap.join(', ')}`
    );
  });

  test('no tool name in the safe list looks dangerous', () => {
    // Belt-and-suspenders: even if the dangerous list is somehow incomplete,
    // anything matching these patterns has no business being always-on.
    const dangerousPatterns = [
      /^bash(_execute)?$/,
      /^claude_code$/,
      /^file_(read|write|edit|delete|append)$/,
      /^sandbox/,
      /^browser_/,
      /^grep_search$/,
      /^glob_files$/,
      /^git_operations$/,
      /^exec(ute)?$/,
      /^shell$/,
    ];
    for (const name of safeNames) {
      for (const pat of dangerousPatterns) {
        assert.ok(
          !pat.test(name),
          `${name} matches dangerous pattern ${pat} but is in safeToolSpecs`
        );
      }
    }
  });
});

describe('dangerous-tools gate — env var contract', () => {
  // We can't easily re-import index.ts under different env conditions
  // (module init happens once and the registry is global), but we can
  // assert the contract that the env var must equal the literal string
  // 'true'. This is the property that matters: 'TRUE', '1', 'yes',
  // 'enabled', or an unset variable must NOT enable dangerous tools.
  test("gate uses strict === 'true' check (fail-safe default)", async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(
      new URL('../src/tools/index.ts', import.meta.url),
      'utf8'
    );
    // The gate condition. If someone weakens this to truthy-coercion
    // (Boolean(x), !!x, x == 'true' loose, x?.toLowerCase() === 'true')
    // that's a regression — fail the test.
    assert.ok(
      src.includes("process.env.SQUIRE_ENABLE_DANGEROUS_TOOLS === 'true'"),
      'gate must use strict === comparison against the literal string "true"'
    );
    // Also assert the dangerous list is only spread into allToolSpecs
    // when dangerousEnabled is true — no second concat path.
    assert.ok(
      src.includes('dangerousEnabled\n  ? [...safeToolSpecs, ...dangerousToolSpecs]'),
      'allToolSpecs must include dangerous specs ONLY when dangerousEnabled is true'
    );
  });
});

describe('dangerous-tools gate — shape sanity', () => {
  test('every dangerous spec has a name, description, parameters, handler', () => {
    for (const spec of dangerousToolSpecs) {
      assert.ok(typeof spec.name === 'string' && spec.name.length > 0);
      assert.ok(typeof spec.description === 'string');
      assert.ok(spec.parameters && typeof spec.parameters === 'object');
      assert.ok(typeof spec.handler === 'function');
    }
  });

  test('every safe spec has a name, description, parameters, handler', () => {
    for (const spec of safeToolSpecs) {
      assert.ok(typeof spec.name === 'string' && spec.name.length > 0);
      assert.ok(typeof spec.description === 'string');
      assert.ok(spec.parameters && typeof spec.parameters === 'object');
      assert.ok(typeof spec.handler === 'function');
    }
  });

  test('no duplicate names within either list', () => {
    assert.equal(
      safeNames.size,
      safeToolSpecs.length,
      'safeToolSpecs has duplicates'
    );
    assert.equal(
      dangerousNames.size,
      dangerousToolSpecs.length,
      'dangerousToolSpecs has duplicates'
    );
  });
});
