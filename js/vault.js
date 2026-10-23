// ===== Lull — encryption for the cloud backup =====
// The email and password never leave the phone. From them we derive:
//   user   – a fingerprint of the email, so the server can find the account
//   auth   – proof of the password, which the server checks (it only keeps a hash of it)
//   key    – the AES key that locks the backup; the server never sees it
// So whoever runs the server (or breaks into it) sees only scrambled bytes.
// The flip side: a forgotten password can't be reset — nobody else holds the key.

const enc = new TextEncoder(), dec = new TextDecoder();
const ITERATIONS = 600000;                // OWASP's 2023+ figure for PBKDF2-SHA256: slows down password guessing

const hex = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const unhex = (h) => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));
const sha256 = (s) => crypto.subtle.digest('SHA-256', enc.encode(s));

function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const unb64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export const normEmail = (email) => String(email || '').trim().toLowerCase();
export const looksLikeEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail(email));

/** Turn email + password into { user, auth, keyHex }. Takes ~1 second on purpose. */
export async function deriveAccount(email, password) {
  const e = normEmail(email);
  const salt = await sha256('lull-account-v1|' + e);
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const master = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, base, 256);
  const hkdf = await crypto.subtle.importKey('raw', master, 'HKDF', false, ['deriveBits']);
  const part = (info) => crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode(info) }, hkdf, 256);
  return {
    user: hex(await sha256('lull-user-v1|' + e)),
    auth: hex(await part('lull-auth-v1')),
    keyHex: hex(await part('lull-enc-v1')),
  };
}

const aesKey = (keyHex) => crypto.subtle.importKey('raw', unhex(keyHex), 'AES-GCM', false, ['encrypt', 'decrypt']);

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** object -> "1.<iv>.<ciphertext>" (JSON, gzipped, then AES-GCM locked to this account) */
export async function seal(obj, keyHex, user) {
  const packed = await pipe(enc.encode(JSON.stringify(obj)), new CompressionStream('gzip'));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(user) }, await aesKey(keyHex), packed);
  return `1.${b64(iv)}.${b64(new Uint8Array(ct))}`;
}

/** The reverse of seal. Throws if the key is wrong or the data was tampered with. */
export async function open(blob, keyHex, user) {
  const [v, iv, ct] = String(blob).split('.');
  if (v !== '1') throw new Error('Unknown backup format');
  const packed = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: enc.encode(user) },
    await aesKey(keyHex), unb64(ct));
  return JSON.parse(dec.decode(await pipe(new Uint8Array(packed), new DecompressionStream('gzip'))));
}
