/**
 * Path-traversal tests for src/tools/coding/policies.ts
 *
 * Proves isPathTraversal() correctly identifies paths that escape the
 * configured working directory. This is the function that file tools
 * (file_read/write/edit, bash cwd, grep, glob, git) MUST call before
 * acting on user-supplied paths — without it, prompt-injection against
 * any tool with SQUIRE_ENABLE_DANGEROUS_TOOLS=true can read/write
 * arbitrary files (~/.ssh/authorized_keys, /etc/passwd, …).
 *
 * Integration tests in this file also verify each tool handler actually
 * calls the check.
 */

import './setup.ts';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { isPathTraversal, resolvePath } from '../src/tools/coding/policies.ts';
import { config } from '../src/config/index.ts';

// Each integration test owns a tmpdir and points config.coding.workingDirectory
// at it. Setting CODING_WORKING_DIR mid-test does NOT work because config is
// captured at module init.
function withWorkingDir<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const original = config.coding.workingDirectory;
  config.coding.workingDirectory = dir;
  return fn().finally(() => {
    config.coding.workingDirectory = original;
  });
}

const WORKDIR = '/srv/work';

describe('isPathTraversal — escapes the working directory', () => {
  test('rejects ../', () =>
    assert.equal(isPathTraversal('../etc/passwd', WORKDIR), true));
  test('rejects ../../', () =>
    assert.equal(isPathTraversal('../../etc/passwd', WORKDIR), true));
  test('rejects deeply nested ../../../../', () =>
    assert.equal(isPathTraversal('../../../../etc/passwd', WORKDIR), true));
  test('rejects absolute /etc/passwd', () =>
    assert.equal(isPathTraversal('/etc/passwd', WORKDIR), true));
  test('rejects absolute /root/.ssh/authorized_keys', () =>
    assert.equal(isPathTraversal('/root/.ssh/authorized_keys', WORKDIR), true));
  test('rejects sibling directory via traversal', () =>
    assert.equal(isPathTraversal('../work-evil/file', WORKDIR), true));
  test('rejects sibling whose name starts with workdir basename', () => {
    // Classic prefix bug: path.relative('/srv/work', '/srv/workspace')
    // returns '../workspace' (correctly outside), but a naive check that
    // does resolved.startsWith(workdir) would let this through.
    assert.equal(isPathTraversal('/srv/workspace/file', WORKDIR), true);
  });
  test('rejects mixed traversal a/b/../../../etc', () =>
    assert.equal(isPathTraversal('a/b/../../../etc', WORKDIR), true));
});

describe('isPathTraversal — stays inside the working directory', () => {
  test('allows simple relative path', () =>
    assert.equal(isPathTraversal('file.ts', WORKDIR), false));
  test('allows nested relative path', () =>
    assert.equal(isPathTraversal('src/utils/helper.ts', WORKDIR), false));
  test('allows traversal that stays inside (a/../b)', () =>
    assert.equal(isPathTraversal('a/../b/file.ts', WORKDIR), false));
  test('allows ./file', () =>
    assert.equal(isPathTraversal('./file.ts', WORKDIR), false));
  test('allows the working directory itself', () =>
    assert.equal(isPathTraversal('.', WORKDIR), false));
  test('allows absolute path inside workdir', () =>
    assert.equal(isPathTraversal('/srv/work/src/file.ts', WORKDIR), false));
  test('allows nested absolute path inside workdir', () =>
    assert.equal(
      isPathTraversal('/srv/work/deeply/nested/file.ts', WORKDIR),
      false
    ));
});

describe('isPathTraversal — tilde expansion', () => {
  // resolvePath() expands ~/ to $HOME. If $HOME is outside the workdir
  // (which it always is in practice), ~/file should be flagged.
  test('rejects ~/.ssh/authorized_keys when HOME is outside workdir', () => {
    const origHome = process.env.HOME;
    process.env.HOME = '/home/attacker';
    try {
      assert.equal(
        isPathTraversal('~/.ssh/authorized_keys', WORKDIR),
        true
      );
    } finally {
      process.env.HOME = origHome;
    }
  });

  test('allows ~/file when HOME equals workdir', () => {
    const origHome = process.env.HOME;
    process.env.HOME = WORKDIR;
    try {
      assert.equal(isPathTraversal('~/file.ts', WORKDIR), false);
    } finally {
      process.env.HOME = origHome;
    }
  });
});

describe('isPathTraversal — edge cases', () => {
  test('rejects empty string only if it escapes (it does not)', () => {
    // path.resolve('/srv/work', '') === '/srv/work' → relative is '' → safe.
    assert.equal(isPathTraversal('', WORKDIR), false);
  });

  test('handles workdir with trailing slash', () => {
    assert.equal(isPathTraversal('../etc', '/srv/work/'), true);
    assert.equal(isPathTraversal('file.ts', '/srv/work/'), false);
  });

  test('rejects path with embedded null byte (defensive)', () => {
    // Node's fs APIs reject null bytes; we want isPathTraversal to be
    // safe to call on whatever lands in tool args without crashing.
    // path.resolve doesn't throw on null bytes, just keeps them, so the
    // result still needs to be classified. Either outcome (true or
    // explicit throw) is acceptable; what's NOT acceptable is silent
    // pass-through of a clearly-malicious path. We test the current
    // behavior for regression coverage.
    const result = isPathTraversal('safe\0/../../../etc/passwd', WORKDIR);
    // Currently this returns true because the embedded ../../ wins.
    assert.equal(result, true);
  });
});

// ============================================================
// Integration tests: each handler must call isPathTraversal
// ============================================================

const REJECT_PATTERN = /refused|outside the working directory|path traversal/i;

async function makeTmpRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'squire-pt-'));
}

describe('integration — file_write rejects traversal', () => {
  test('refuses to write outside the working directory', async () => {
    const tmpRoot = await makeTmpRoot();
    const sentinel = path.join(os.tmpdir(), `squire-pt-sentinel-${Date.now()}`);
    await withWorkingDir(tmpRoot, async () => {
      const { tools } = await import('../src/tools/coding/write.ts');
      const writeTool = tools.find((t) => t.name === 'file_write');
      assert.ok(writeTool, 'file_write tool not found');
      const result = await writeTool!.handler({
        path: path.relative(tmpRoot, sentinel),
        content: 'pwned',
      });
      assert.match(String(result), REJECT_PATTERN, `got: ${result}`);
      let exists = false;
      try {
        await fs.access(sentinel);
        exists = true;
      } catch {
        /* expected */
      }
      assert.equal(exists, false, `file_write created ${sentinel} — vulnerability!`);
    });
    await fs.rm(tmpRoot, { recursive: true, force: true });
    await fs.rm(sentinel, { force: true }).catch(() => {});
  });

  test('refuses absolute path outside the working directory', async () => {
    const tmpRoot = await makeTmpRoot();
    const sentinel = '/tmp/squire-pt-abs-sentinel-' + Date.now();
    await withWorkingDir(tmpRoot, async () => {
      const { tools } = await import('../src/tools/coding/write.ts');
      const writeTool = tools.find((t) => t.name === 'file_write')!;
      const result = await writeTool.handler({ path: sentinel, content: 'pwned' });
      assert.match(String(result), REJECT_PATTERN, `got: ${result}`);
      let exists = false;
      try {
        await fs.access(sentinel);
        exists = true;
      } catch { /* expected */ }
      assert.equal(exists, false);
    });
    await fs.rm(tmpRoot, { recursive: true, force: true });
    await fs.rm(sentinel, { force: true }).catch(() => {});
  });
});

describe('integration — file_read rejects traversal', () => {
  test('refuses to read outside the working directory', async () => {
    const tmpRoot = await makeTmpRoot();
    const outside = path.join(os.tmpdir(), `squire-pt-outside-${Date.now()}`);
    await fs.writeFile(outside, 'TOPSECRET');
    await withWorkingDir(tmpRoot, async () => {
      const { tools } = await import('../src/tools/coding/read.ts');
      const readTool = tools.find((t) => t.name === 'file_read')!;
      const result = await readTool.handler({
        path: path.relative(tmpRoot, outside),
      });
      assert.match(String(result), REJECT_PATTERN, `got: ${result}`);
      assert.doesNotMatch(String(result), /TOPSECRET/, 'leaked outside content');
    });
    await fs.rm(tmpRoot, { recursive: true, force: true });
    await fs.rm(outside, { force: true });
  });

  test('refuses absolute path outside the working directory', async () => {
    const tmpRoot = await makeTmpRoot();
    await withWorkingDir(tmpRoot, async () => {
      const { tools } = await import('../src/tools/coding/read.ts');
      const readTool = tools.find((t) => t.name === 'file_read')!;
      const result = await readTool.handler({ path: '/etc/hostname' });
      assert.match(String(result), REJECT_PATTERN, `got: ${result}`);
    });
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });
});

describe('integration — file_edit rejects traversal', () => {
  test('refuses to edit outside the working directory', async () => {
    const tmpRoot = await makeTmpRoot();
    const outside = path.join(os.tmpdir(), `squire-pt-outside-${Date.now()}`);
    await fs.writeFile(outside, 'TOPSECRET');
    await withWorkingDir(tmpRoot, async () => {
      const { tools } = await import('../src/tools/coding/edit.ts');
      const editTool = tools.find((t) => t.name === 'file_edit')!;
      const result = await editTool.handler({
        path: path.relative(tmpRoot, outside),
        old_string: 'TOPSECRET',
        new_string: 'PWNED',
      });
      assert.match(String(result), REJECT_PATTERN, `got: ${result}`);
      const after = await fs.readFile(outside, 'utf-8');
      assert.equal(after, 'TOPSECRET', 'file_edit modified outside file!');
    });
    await fs.rm(tmpRoot, { recursive: true, force: true });
    await fs.rm(outside, { force: true });
  });
});

describe('integration — bash_execute rejects traversal in cwd', () => {
  test('refuses cwd outside the working directory', async () => {
    const tmpRoot = await makeTmpRoot();
    await withWorkingDir(tmpRoot, async () => {
      const { tools } = await import('../src/tools/coding/bash.ts');
      const bashTool = tools.find((t) => t.name === 'bash_execute')!;
      const result = await bashTool.handler({ command: 'pwd', cwd: '/etc' });
      assert.match(String(result), REJECT_PATTERN, `got: ${result}`);
    });
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });
});

describe('integration — grep_search rejects traversal in path', () => {
  test('refuses search path outside the working directory', async () => {
    const tmpRoot = await makeTmpRoot();
    await withWorkingDir(tmpRoot, async () => {
      const { tools } = await import('../src/tools/coding/grep.ts');
      const grepTool = tools.find((t) => t.name === 'grep_search')!;
      const result = await grepTool.handler({ pattern: 'root', path: '/etc' });
      assert.match(String(result), REJECT_PATTERN, `got: ${result}`);
    });
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });
});

describe('integration — glob_files rejects traversal in basePath', () => {
  test('refuses base path outside the working directory', async () => {
    const tmpRoot = await makeTmpRoot();
    await withWorkingDir(tmpRoot, async () => {
      const { tools } = await import('../src/tools/coding/glob.ts');
      const globTool = tools.find((t) => t.name === 'glob_files')!;
      const result = await globTool.handler({ pattern: '*.conf', path: '/etc' });
      assert.match(String(result), REJECT_PATTERN, `got: ${result}`);
    });
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });
});

describe('integration — git_operations rejects traversal in cwd', () => {
  test('refuses cwd outside the working directory', async () => {
    const tmpRoot = await makeTmpRoot();
    await withWorkingDir(tmpRoot, async () => {
      const { tools } = await import('../src/tools/coding/git.ts');
      const gitTool = tools.find((t) => t.name === 'git_operations')!;
      const result = await gitTool.handler({ operation: 'status', cwd: '/etc' });
      assert.match(String(result), REJECT_PATTERN, `got: ${result}`);
    });
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });
});

// Sanity check that resolvePath stays consistent with isPathTraversal
describe('resolvePath consistency', () => {
  test('escaped paths from resolvePath are flagged by isPathTraversal', () => {
    const resolved = resolvePath('../etc/passwd', WORKDIR);
    assert.ok(resolved.startsWith('/etc') || !resolved.startsWith(WORKDIR));
    assert.equal(isPathTraversal('../etc/passwd', WORKDIR), true);
  });
});
