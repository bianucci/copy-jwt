// jsdom 20 exposes window.crypto.getRandomValues but not crypto.subtle,
// and does not expose TextEncoder/TextDecoder as VM-level globals.
// Polyfill all three from Node builtins.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { webcrypto } = require("crypto");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodeUtil = require("util");

Object.defineProperty(globalThis, "crypto", {
  value: webcrypto,
  configurable: true,
});
Object.defineProperty(globalThis, "TextEncoder", {
  value: nodeUtil.TextEncoder,
  configurable: true,
});
Object.defineProperty(globalThis, "TextDecoder", {
  value: nodeUtil.TextDecoder,
  configurable: true,
});
