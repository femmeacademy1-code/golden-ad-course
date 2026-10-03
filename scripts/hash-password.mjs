// Usage: node scripts/hash-password.mjs 'your-admin-password'
// Prints the value to store as the ADMIN_PASSWORD_HASH secret in Cloudflare.
import { webcrypto as crypto } from 'node:crypto';
const pw = process.argv[2];
if (!pw || pw.length < 10) { console.error('Give a password of at least 10 characters.'); process.exit(1); }
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
const b64 = (b) => Buffer.from(b).toString('base64');
console.log(`pbkdf2$100000$${b64(salt)}$${b64(bits)}`);
