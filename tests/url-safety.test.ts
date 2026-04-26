/**
 * SSRF guard tests for src/utils/url-safety.ts
 *
 * Proves the load-bearing security claim that assertPublicUrl() refuses to
 * fetch private/internal addresses. The risks if this is broken:
 *   - 169.254.169.254 → cloud metadata → IAM credentials
 *   - 127.0.0.1 / ::1 → other services on the host
 *   - 10.x / 172.16-31.x / 192.168.x → internal network
 *   - 100.64-127.x → CGNAT incl. Tailscale mesh
 *   - file:// / gopher:// → local file read or protocol smuggling
 *   - DNS rebinding → hostname that resolves to a private IP
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import dns from 'dns/promises';
import { assertPublicUrl } from '../src/utils/url-safety.ts';

async function expectReject(url: string): Promise<void> {
  await assert.rejects(() => assertPublicUrl(url), `expected ${url} to be rejected`);
}

async function expectAccept(url: string): Promise<void> {
  await assert.doesNotReject(() => assertPublicUrl(url), `expected ${url} to be accepted`);
}

describe('assertPublicUrl — scheme rejection', () => {
  test('rejects file://', () => expectReject('file:///etc/passwd'));
  test('rejects gopher://', () => expectReject('gopher://example.com/'));
  test('rejects ftp://', () => expectReject('ftp://example.com/'));
  test('rejects javascript:', () => expectReject('javascript:alert(1)'));
  test('rejects data:', () => expectReject('data:text/plain,hello'));
});

describe('assertPublicUrl — malformed input', () => {
  test('rejects garbage string', () => expectReject('not a url'));
  test('rejects empty string', () => expectReject(''));
});

describe('assertPublicUrl — IPv4 literals (private)', () => {
  test('rejects cloud metadata 169.254.169.254', () =>
    expectReject('http://169.254.169.254/latest/meta-data/'));
  test('rejects loopback 127.0.0.1', () => expectReject('http://127.0.0.1/'));
  test('rejects loopback range 127.5.5.5', () => expectReject('http://127.5.5.5/'));
  test('rejects RFC1918 10.0.0.1', () => expectReject('http://10.0.0.1/'));
  test('rejects RFC1918 10.255.255.255', () => expectReject('http://10.255.255.255/'));
  test('rejects RFC1918 172.16.0.1', () => expectReject('http://172.16.0.1/'));
  test('rejects RFC1918 172.31.255.255', () => expectReject('http://172.31.255.255/'));
  test('rejects RFC1918 192.168.1.1', () => expectReject('http://192.168.1.1/'));
  test('rejects link-local 169.254.0.1', () => expectReject('http://169.254.0.1/'));
  test('rejects unspecified 0.0.0.0', () => expectReject('http://0.0.0.0/'));
  test('rejects CGNAT/Tailscale 100.64.0.1', () => expectReject('http://100.64.0.1/'));
  test('rejects CGNAT/Tailscale 100.122.107.49', () =>
    expectReject('http://100.122.107.49/'));
  test('rejects CGNAT boundary 100.127.255.255', () =>
    expectReject('http://100.127.255.255/'));
  test('rejects multicast 224.0.0.1', () => expectReject('http://224.0.0.1/'));
  test('rejects reserved 240.0.0.1', () => expectReject('http://240.0.0.1/'));
  test('rejects broadcast 255.255.255.255', () =>
    expectReject('http://255.255.255.255/'));
  test('rejects TEST-NET 192.0.2.1', () => expectReject('http://192.0.2.1/'));
});

describe('assertPublicUrl — IPv4 literals (boundary checks that should pass)', () => {
  // Just outside private ranges — these are public IPs and must be accepted.
  test('accepts 11.0.0.1 (just past 10/8)', () => expectAccept('http://11.0.0.1/'));
  test('accepts 172.15.0.1 (just before 172.16/12)', () =>
    expectAccept('http://172.15.0.1/'));
  test('accepts 172.32.0.1 (just past 172.16/12)', () =>
    expectAccept('http://172.32.0.1/'));
  test('accepts 192.167.0.1 (just before 192.168/16)', () =>
    expectAccept('http://192.167.0.1/'));
  test('accepts 192.169.0.1 (just past 192.168/16)', () =>
    expectAccept('http://192.169.0.1/'));
  test('accepts 100.63.255.255 (just before CGNAT)', () =>
    expectAccept('http://100.63.255.255/'));
  test('accepts 100.128.0.1 (just past CGNAT)', () =>
    expectAccept('http://100.128.0.1/'));
  test('accepts 8.8.8.8 (Google DNS)', () => expectAccept('http://8.8.8.8/'));
  test('accepts 1.1.1.1 (Cloudflare DNS)', () => expectAccept('http://1.1.1.1/'));
});

describe('assertPublicUrl — IPv6 literals', () => {
  test('rejects loopback ::1', () => expectReject('http://[::1]/'));
  test('rejects unspecified ::', () => expectReject('http://[::]/'));
  test('rejects link-local fe80::1', () => expectReject('http://[fe80::1]/'));
  test('rejects ULA fc00::1', () => expectReject('http://[fc00::1]/'));
  test('rejects ULA fd12:3456:789a::1', () =>
    expectReject('http://[fd12:3456:789a::1]/'));
  test('rejects multicast ff02::1', () => expectReject('http://[ff02::1]/'));
  test('rejects IPv4-mapped ::ffff:127.0.0.1', () =>
    expectReject('http://[::ffff:127.0.0.1]/'));
  test('rejects IPv4-mapped ::ffff:169.254.169.254', () =>
    expectReject('http://[::ffff:169.254.169.254]/'));
});

describe('assertPublicUrl — DNS rebinding', () => {
  // Attack model: attacker controls a hostname that resolves to a private IP.
  // The guard must use the *resolved* address, not pattern-match the hostname.
  // We can't depend on a real attacker-controlled domain, so monkey-patch
  // dns.lookup to simulate rebinding and verify the guard still rejects.
  test('rejects hostname that resolves to 127.0.0.1', async () => {
    const orig = dns.lookup;
    (dns as { lookup: typeof dns.lookup }).lookup = async () => ({
      address: '127.0.0.1',
      family: 4,
    });
    try {
      await expectReject('http://totally-legit-domain.example/');
    } finally {
      (dns as { lookup: typeof dns.lookup }).lookup = orig;
    }
  });

  test('rejects hostname that resolves to 169.254.169.254', async () => {
    const orig = dns.lookup;
    (dns as { lookup: typeof dns.lookup }).lookup = async () => ({
      address: '169.254.169.254',
      family: 4,
    });
    try {
      await expectReject('http://metadata-rebind.example/');
    } finally {
      (dns as { lookup: typeof dns.lookup }).lookup = orig;
    }
  });

  test('rejects hostname that resolves to ::1', async () => {
    const orig = dns.lookup;
    (dns as { lookup: typeof dns.lookup }).lookup = async () => ({
      address: '::1',
      family: 6,
    });
    try {
      await expectReject('http://v6-rebind.example/');
    } finally {
      (dns as { lookup: typeof dns.lookup }).lookup = orig;
    }
  });

  test('rejects hostname whose DNS lookup fails (fail closed)', async () => {
    const orig = dns.lookup;
    (dns as { lookup: typeof dns.lookup }).lookup = async () => {
      throw new Error('ENOTFOUND');
    };
    try {
      await expectReject('http://does-not-resolve.example/');
    } finally {
      (dns as { lookup: typeof dns.lookup }).lookup = orig;
    }
  });
});

describe('assertPublicUrl — public hostname (network-dependent)', () => {
  test('accepts example.com when DNS resolves to a public IP', async () => {
    // Sanity check using the real network. If this fails because the test
    // host is offline or DNS is broken, that's a network problem, not a
    // guard problem — skip rather than fail.
    try {
      const { address } = await dns.lookup('example.com');
      if (
        address.startsWith('10.') ||
        address.startsWith('127.') ||
        address.startsWith('192.168.')
      ) {
        return; // unusual environment; skip
      }
    } catch {
      return; // offline; skip
    }
    await expectAccept('http://example.com/');
  });
});
