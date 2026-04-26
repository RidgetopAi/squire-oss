/**
 * URL safety helpers — SSRF guard for tools that fetch arbitrary URLs.
 *
 * Tools (fetch_url, browser_navigate, …) accept URLs that ultimately
 * trace back to LLM-generated text or LLM-retrieved memory/documents.
 * A prompt-injection attack against any of those surfaces could ask the
 * LLM to fetch http://169.254.169.254/ (cloud metadata), localhost
 * services, internal-network IPs, or file:// URIs and exfiltrate the
 * response back to the attacker via the tool result. assertPublicUrl
 * is the choke-point that prevents this.
 *
 * The check uses dns.lookup() and validates the *resolved* IP, not the
 * hostname, so DNS rebinding ("evil.example.com → 127.0.0.1") fails too.
 */

import dns from 'dns/promises';
import { isIPv4, isIPv6 } from 'net';

const PRIVATE_V4_PATTERNS = [
  /^10\./,                                          // RFC1918
  /^172\.(1[6-9]|2[0-9]|3[01])\./,                  // RFC1918
  /^192\.168\./,                                    // RFC1918
  /^127\./,                                         // Loopback
  /^169\.254\./,                                    // Link-local + cloud metadata
  /^0\./,                                           // Unspecified
  /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./, // CGNAT (incl. Tailscale)
  /^192\.0\.0\./,                                   // IETF protocol assignments
  /^192\.0\.2\./,                                   // TEST-NET-1
  /^198\.51\.100\./,                                // TEST-NET-2
  /^203\.0\.113\./,                                 // TEST-NET-3
  /^224\./, /^225\./, /^226\./, /^227\./,           // multicast 224.0.0.0/4
  /^228\./, /^229\./, /^230\./, /^231\./,
  /^232\./, /^233\./, /^234\./, /^235\./,
  /^236\./, /^237\./, /^238\./, /^239\./,
  /^240\./, /^241\./, /^242\./, /^243\./,           // reserved 240.0.0.0/4
  /^244\./, /^245\./, /^246\./, /^247\./,
  /^248\./, /^249\./, /^250\./, /^251\./,
  /^252\./, /^253\./, /^254\./, /^255\./,
];

function isPrivateV4(addr: string): boolean {
  return PRIVATE_V4_PATTERNS.some((re) => re.test(addr));
}

function isPrivateV6(addr: string): boolean {
  const lower = addr.toLowerCase();
  if (lower === '::1' || lower === '::') return true;          // loopback / unspecified
  if (lower.startsWith('fe80:') || lower.startsWith('fe9') ||  // link-local fe80::/10
      lower.startsWith('fea') || lower.startsWith('feb')) return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA fc00::/7
  if (lower.startsWith('ff')) return true;                     // multicast ff00::/8
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) — extract and re-check
  const v4Mapped = lower.match(/^::ffff:([0-9.]+)$/);
  if (v4Mapped) return isPrivateV4(v4Mapped[1]!);
  return false;
}

/**
 * Throw if the URL is not safe to fetch from a tool.
 *
 * Rejects:
 *  - non-http/https schemes (file://, gopher://, etc.)
 *  - hosts that resolve to private/loopback/link-local/multicast IPs
 *  - any DNS lookup error (we fail closed)
 *
 * Callers should wrap with try/catch and surface a clean error to the
 * LLM, e.g. "URL fetch refused: private/internal address".
 */
export async function assertPublicUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('URL is malformed');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`URL refused: only http(s) is allowed (got ${parsed.protocol})`);
  }

  // Some clients pass an IP literal directly; skip DNS in that case.
  let address: string;
  if (isIPv4(parsed.hostname) || isIPv6(parsed.hostname)) {
    address = parsed.hostname;
  } else {
    try {
      const result = await dns.lookup(parsed.hostname);
      address = result.address;
    } catch (err) {
      throw new Error(`URL refused: DNS lookup failed for ${parsed.hostname}`);
    }
  }

  if (isIPv4(address) && isPrivateV4(address)) {
    throw new Error('URL refused: resolves to a private/internal address');
  }
  if (isIPv6(address) && isPrivateV6(address)) {
    throw new Error('URL refused: resolves to a private/internal address');
  }
}
