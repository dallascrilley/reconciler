/**
 * Provider escape hatch — framework-free contract for describing, requesting,
 * and safe-guarding external provider API calls.
 *
 * Extracted from the analytics/provider-api-request pattern.
 * Core has no agent-native, app-context, or request-context dependencies.
 */

// ---------------------------------------------------------------------------
// Provider catalog entry
// ---------------------------------------------------------------------------

export interface ProviderAuthRequirement {
  type: "api-key" | "bearer-token" | "oauth2" | "basic" | "custom";
  /** Which headers the credential injects. */
  headerTemplate?: Record<string, string>;
  /** Which query parameters the credential injects. */
  queryTemplate?: Record<string, string>;
  notes?: string;
}

export interface ProviderEndpoint {
  path: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";
  summary: string;
  /** Placeholder keys for path/query/header substitution. */
  placeholders?: string[];
}

export interface ProviderCatalogEntry {
  id: string;
  name: string;
  baseUrl: string;
  /** Allowed hosts for SSRF safety — baseUrl must match one. */
  allowedHosts: string[];
  auth: ProviderAuthRequirement;
  endpoints: ProviderEndpoint[];
  /** Documentation URL template — {id} and {endpoint} are substituted. */
  docsUrl?: string;
  /** Pagination convention hints. */
  paginationHints?: {
    type: "cursor" | "page" | "offset" | "none";
    cursorPath?: string;
    pageParam?: string;
    offsetParam?: string;
  };
}

// ---------------------------------------------------------------------------
// Provider request args
// ---------------------------------------------------------------------------

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";

export interface ProviderRequestArgs {
  method: HttpMethod;
  /** Absolute URL or path relative to provider baseUrl. */
  url: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
  authMode: "inherit" | "none" | "override";
  pagination?: PaginationConfig;
  /** If set, stage the response under this key for later querying. */
  stageAs?: string;
}

export interface PaginationConfig {
  nextCursorPath?: string;
  cursorParam?: string;
  cursorBodyPath?: string;
  pageParam?: string;
  startPage?: number;
  offsetParam?: string;
  pageSize?: number;
  maxPages?: number;
}

// ---------------------------------------------------------------------------
// Credential resolver interface
// ---------------------------------------------------------------------------

export interface ProviderCredentials {
  headers: Record<string, string>;
  queryParams: Record<string, string>;
}

export interface CredentialResolver {
  /** Resolve credentials for a given provider ID. Returns null if unavailable. */
  getCredentials(providerId: string): Promise<ProviderCredentials | null>;
}

// ---------------------------------------------------------------------------
// SSRF and redaction boundaries
// ---------------------------------------------------------------------------

export interface SSRFConfig {
  allowedHosts: string[];
  allowedSchemes: string[];
  /** Whether private/loopback IPs are permitted. */
  allowPrivateIps: boolean;
}

export const DEFAULT_SSRF_CONFIG: SSRFConfig = {
  allowedHosts: [],
  allowedSchemes: ["https"],
  allowPrivateIps: false,
};

/** Is a dotted-quad IPv4 string in a private / loopback / link-local range? */
function isPrivateIpv4(ip: string): boolean {
  const octets = ip.split(".");
  if (octets.length !== 4) return false;
  const nums = octets.map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = nums as [number, number, number, number];
  return (
    a === 0 || // 0.0.0.0/8 (includes the 0.0.0.0 unspecified address)
    a === 127 || // 127.0.0.0/8 loopback (not just 127.0.0.1)
    a === 10 || // 10.0.0.0/8
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 169 && b === 254) // 169.254.0.0/16 link-local (cloud metadata)
  );
}

/**
 * Normalize a URL hostname to a comparable host token: strip IPv6 brackets,
 * lowercase, and decode the two numeric-IPv4 obfuscations that slip past naive
 * dotted-quad checks — a bare 32-bit decimal integer (e.g. 2130706433 ->
 * 127.0.0.1) and an IPv4-mapped IPv6 address (::ffff:127.0.0.1).
 */
function normalizeHost(hostname: string): string {
  let host = hostname.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);

  // IPv4-mapped IPv6, dotted (::ffff:127.0.0.1) — extract the embedded IPv4.
  const mappedDotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(host);
  if (mappedDotted?.[1]) return mappedDotted[1];

  // IPv4-mapped IPv6, hex-compressed (WHATWG-URL normalizes ::ffff:127.0.0.1 to
  // ::ffff:7f00:1) — recombine the trailing 32 bits into dotted IPv4.
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
  if (mappedHex?.[1] && mappedHex[2]) {
    const n = ((parseInt(mappedHex[1], 16) << 16) | parseInt(mappedHex[2], 16)) >>> 0;
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
  }

  // Bare 32-bit decimal integer host (curl/browsers route it as an IPv4).
  if (/^\d+$/.test(host)) {
    const n = Number(host);
    if (Number.isInteger(n) && n >= 0 && n <= 0xffffffff) {
      return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
    }
  }
  return host;
}

/**
 * Validate that a URL is safe to call under SSRF rules. Returns an error string
 * when the URL must be rejected, or null when it is allowed.
 *
 * SECURITY POSTURE: set `allowedHosts` in production. That allowlist is the
 * robust control — a non-matching host (in any encoding) is rejected outright.
 * The private/loopback IP block here is defense-in-depth for the empty-allowlist
 * case; it canonicalizes the common obfuscations (bracketed/`::1`/IPv4-mapped
 * IPv6, 32-bit decimal hosts) but is NOT a complete IP canonicalizer — exotic
 * encodings (per-octet octal like `0177.0.0.1`, short forms like `127.1`) are
 * resolver-dependent and not decoded here. Do not rely on an empty allowlist as
 * your only SSRF boundary.
 */
export function validateUrl(url: string, config: SSRFConfig): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `Invalid URL: "${url}".`;
  }

  if (!config.allowedSchemes.includes(parsed.protocol.replace(":", ""))) {
    return `Scheme "${parsed.protocol}" is not allowed.`;
  }

  // Embedded credentials (https://user:pass@host) are a credential-leak /
  // allowlist-obfuscation vector — reject them outright.
  if (parsed.username || parsed.password) {
    return `URL must not contain embedded credentials.`;
  }

  const host = normalizeHost(parsed.hostname);

  if (
    config.allowedHosts.length > 0 &&
    !config.allowedHosts.some(
      (h) => host === h.toLowerCase() || host.endsWith("." + h.toLowerCase()),
    )
  ) {
    return `Host "${parsed.hostname}" is not in the allowed list.`;
  }

  if (!config.allowPrivateIps) {
    const isLoopbackName = host === "localhost";
    const isIpv6Loopback = host === "::1" || host === "::";
    if (isLoopbackName || isIpv6Loopback || isPrivateIpv4(host)) {
      return `Host "${parsed.hostname}" appears to be a private or loopback address.`;
    }
  }

  return null;
}

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "x-api-key",
  "cookie",
  "set-cookie",
  "proxy-authorization",
]);

/**
 * Strip unsafe headers (auth, cookies) from a response before returning.
 */
export function redactResponseHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!SENSITIVE_HEADERS.has(key.toLowerCase())) {
      safe[key] = value;
    }
  }
  return safe;
}

/** Marker written in place of a redacted value. */
export const REDACTED = "[REDACTED]";

/**
 * Immutably replace the value at `segments` with {@link REDACTED}. Returns a new
 * object/array along the touched path; untouched branches are shared by
 * reference. A `*` segment maps over every element of an array. A path that does
 * not exist is a safe no-op (the input is returned structurally unchanged).
 */
function redactPath(node: unknown, segments: string[]): unknown {
  if (segments.length === 0) return REDACTED;
  const [head, ...rest] = segments as [string, ...string[]];

  if (head === "*" && Array.isArray(node)) {
    return node.map((el) => redactPath(el, rest));
  }
  if (Array.isArray(node)) {
    const index = Number(head);
    if (!Number.isInteger(index) || index < 0 || index >= node.length) return node;
    const next = node.slice();
    next[index] = redactPath(node[index], rest);
    return next;
  }
  if (typeof node === "object" && node !== null) {
    if (!Object.prototype.hasOwnProperty.call(node, head)) return node;
    const obj = node as Record<string, unknown>;
    return { ...obj, [head]: redactPath(obj[head], rest) };
  }
  return node;
}

/**
 * Redact sensitive values from a response body, one dot-path per pattern (e.g.
 * `{ path: "data.token" }`, or `{ path: "items.*.secret" }` to redact a field in
 * every array element). Pure and immutable: the input is never mutated and only
 * paths that actually exist are touched, so it is safe to run on any response
 * before logging or staging it.
 */
export function redactSensitiveValues(
  body: unknown,
  patterns: Array<{ path: string }>,
): unknown {
  if (typeof body !== "object" || body === null) return body;
  let result: unknown = body;
  for (const { path } of patterns) {
    const segments = path.split(".").filter((s) => s.length > 0);
    if (segments.length > 0) result = redactPath(result, segments);
  }
  return result;
}
