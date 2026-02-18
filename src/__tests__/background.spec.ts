import { setup } from "../background";

type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

const VALID_JWT_ENCODED =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjB9._U45K6oXhpt8xelFL8626lSpnstATbSEFoSvVcPI7hs";
const VALID_JWT_DECODED = new RegExp(`"iat": 0`);

const VALID_JWT_ENCODED_2 =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjEyM30.7x1uKPG4b-rT8wth-zGhZoBrKUk6EQ8ssbodRWj-K38";
const VALID_JWT_DECODED_2 = new RegExp(`"iat": 123`);

const TOKEN_WITH_TYPE_OTHER_THAN_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6Ik5PVEpXVCJ9.eyJpYXQiOjB9.5JlNCW1LMsn4sgnwVZ6PdI0DZPRk5vk9kGZzLH8VYcg";

const NO_TOKEN_TEXT = /No token was found!/gi;

let listener: (tab: chrome.tabs.Tab) => void;
let executeScript: () => Promise<void>;

const mockChrome: DeepPartial<typeof chrome> = {
  action: {
    onClicked: {
      addListener: (l: (tab: chrome.tabs.Tab) => void) => {
        listener = l;
        l({ id: 111 } as chrome.tabs.Tab);
      },
    },
  },
  scripting: {
    executeScript: (options: { func: () => void }) => {
      executeScript = options.func as () => Promise<void>;
    },
  },
};

globalThis.chrome = mockChrome as typeof chrome;

setup();

function setStorage(value: Record<string, string | null | undefined>) {
  Object.defineProperty(window, "localStorage", {
    value,
    writable: true,
  });
}

// --- MSAL crypto test utilities ---

function toBase64url(buf: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function encryptMsalToken(
  jwt: string,
  rawKey: Uint8Array<ArrayBuffer>,
  nonce: Uint8Array<ArrayBuffer>,
  clientId: string
): Promise<string> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    rawKey,
    "HKDF",
    false,
    ["deriveKey"]
  );
  const aesKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      salt: nonce,
      hash: "SHA-256",
      info: new TextEncoder().encode(clientId),
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: new Uint8Array(12) },
    aesKey,
    new TextEncoder().encode(JSON.stringify({ secret: jwt }))
  );
  return toBase64url(encrypted);
}

function setMsalCookie(rawKey: Uint8Array<ArrayBuffer>) {
  const keyB64u = toBase64url(rawKey);
  // document.cookie is already an accessor in jsdom; override the getter directly.
  Object.defineProperty(document, "cookie", {
    get: () =>
      `msal.cache.encryption=${encodeURIComponent(
        JSON.stringify({ key: keyB64u })
      )}`,
    configurable: true,
  });
}

function clearMsalCookie() {
  Object.defineProperty(document, "cookie", {
    get: () => "",
    configurable: true,
  });
}

// ------------------------------------

describe("finding json web tokens", () => {
  beforeEach(() => {
    global.alert = jest.fn();
    window.document.execCommand = jest.fn();
    global.document.body.innerHTML = "";
    clearMsalCookie();
  });

  it("throws error for invalid tab", () => {
    expect(() => listener({ id: 0 } as chrome.tabs.Tab)).toThrowError(
      "no tab id"
    );
  });

  it("handles empty storage", async () => {
    setStorage({});
    await executeScript();
    expect(window.global.document.body.innerHTML).toMatch(NO_TOKEN_TEXT);
  });

  it("handles undefined values", async () => {
    setStorage({ key: undefined });
    await executeScript();
    expect(window.global.document.body.innerHTML).toMatch(NO_TOKEN_TEXT);
  });

  it("handles empty strings", async () => {
    setStorage({ key: "" });
    await executeScript();
    expect(window.global.document.body.innerHTML).toMatch(NO_TOKEN_TEXT);
  });

  it("handles null values", async () => {
    setStorage({ key: null });
    await executeScript();
    expect(window.global.document.body.innerHTML).toMatch(NO_TOKEN_TEXT);
  });

  it("handles tokens which are valid bot not of type JWT", async () => {
    setStorage({
      key: JSON.stringify({ layer1: TOKEN_WITH_TYPE_OTHER_THAN_JWT }),
    });
    await executeScript();
    expect(window.global.document.body.innerHTML).toMatch(NO_TOKEN_TEXT);
  });

  it("handles garbage tokens", async () => {
    setStorage({
      key: "eyasdasdasd",
    });
    await executeScript();
    expect(window.global.document.body.innerHTML).toMatch(NO_TOKEN_TEXT);
  });

  it("handles garbage json", async () => {
    setStorage({
      key: "{something not json eyasdasdasd}",
    });
    await executeScript();
    expect(window.global.document.body.innerHTML).toMatch(NO_TOKEN_TEXT);
  });

  it("handles nested values", async () => {
    setStorage({
      key: JSON.stringify({ deep: { deeper: { jwt: VALID_JWT_ENCODED } } }),
    });
    await executeScript();
    expect(window.global.document.body.innerHTML).toMatch(VALID_JWT_DECODED);
  });

  it("handles array values", async () => {
    setStorage({
      key: JSON.stringify({ deep: { deeper: { jwt: [VALID_JWT_ENCODED] } } }),
    });
    await executeScript();
    expect(window.global.document.body.innerHTML).toMatch(VALID_JWT_DECODED);
  });

  it("handles plain string values", async () => {
    setStorage({ key: VALID_JWT_ENCODED });
    await executeScript();
    expect(window.global.document.body.innerHTML).toMatch(VALID_JWT_DECODED);
  });

  it("handles tokens embedded in objects", async () => {
    setStorage({ key: JSON.stringify({ layer1: VALID_JWT_ENCODED }) });
    await executeScript();
    expect(window.global.document.body.innerHTML).toMatch(VALID_JWT_DECODED);
  });

  it("copies single token", async () => {
    setStorage({ token1: VALID_JWT_ENCODED });
    await executeScript();
    expect(window.global.document.body.innerHTML).toMatch(
      /Copied to clipboard/gi
    );
  });

  it("handles multiple tokens were found", async () => {
    setStorage({ token1: VALID_JWT_ENCODED, token2: VALID_JWT_ENCODED_2 });
    await executeScript();
    expect(window.global.document.body.innerHTML).toMatch(VALID_JWT_ENCODED);
    expect(window.global.document.body.innerHTML).toMatch(VALID_JWT_DECODED);
    expect(window.global.document.body.innerHTML).toMatch(VALID_JWT_ENCODED_2);
    expect(window.global.document.body.innerHTML).toMatch(VALID_JWT_DECODED_2);
  });

  it("translates numbers to date", async () => {
    setStorage({ token1: VALID_JWT_ENCODED, token2: VALID_JWT_ENCODED_2 });
    await executeScript();
    expect(window.global.document.body.innerHTML).toMatch(VALID_JWT_DECODED);
    expect(window.global.document.body.innerHTML).toMatch(
      new RegExp(`"iat_as_date": "${new Date(123).toLocaleString()}"`)
    );
  });

  it("removed modal", async () => {
    setStorage({ token1: VALID_JWT_ENCODED, token2: VALID_JWT_ENCODED_2 });

    expect(global.document.body.children.length).toBe(0);
    await executeScript();
    expect(global.document.body.children.length).toBe(1);

    global.document
      .querySelector<HTMLButtonElement>("#copy-jwt-close-modal")
      ?.click();

    expect(global.document.body.children.length).toBe(0);
  });

  it("copies single value to clipboard", async () => {
    expect(window.document.execCommand).not.toHaveBeenCalled();
    setStorage({ token1: VALID_JWT_ENCODED });
    await executeScript();
    expect(window.document.execCommand).toHaveBeenCalledTimes(1);
  });

  it("copies selected value to clipboard", async () => {
    expect(window.document.execCommand).not.toHaveBeenCalled();
    setStorage({ token1: VALID_JWT_ENCODED, token2: VALID_JWT_ENCODED_2 });
    await executeScript();
    expect(window.document.execCommand).not.toHaveBeenCalled();

    global.document
      .querySelector<HTMLButtonElement>(".copy-jwt-copy-jwt")
      ?.click();

    expect(window.document.execCommand).toHaveBeenCalledTimes(1);
  });
});

describe("finding MSAL tokens", () => {
  const TEST_CLIENT_ID = "test-client-id-1234";
  const MSAL_KEYS_KEY = `msal.2.token.keys.${TEST_CLIENT_ID}`;
  const ID_TOKEN_KEY = `msal.2.idtoken.${TEST_CLIENT_ID}`;
  const ACCESS_TOKEN_KEY = `msal.2.accesstoken.${TEST_CLIENT_ID}`;

  let rawKey: Uint8Array<ArrayBuffer>;
  let nonce: Uint8Array<ArrayBuffer>;

  beforeEach(async () => {
    global.alert = jest.fn();
    window.document.execCommand = jest.fn();
    global.document.body.innerHTML = "";
    // new Uint8Array(typedArray) copies into a plain ArrayBuffer, satisfying
    // TypeScript 5's stricter BufferSource constraint (no SharedArrayBuffer).
    rawKey = new Uint8Array(crypto.getRandomValues(new Uint8Array(32)));
    nonce = new Uint8Array(crypto.getRandomValues(new Uint8Array(16)));
  });

  afterEach(() => {
    clearMsalCookie();
  });

  it("shows no tokens when MSAL cookie is absent", async () => {
    setStorage({});
    await executeScript();
    expect(window.global.document.body.innerHTML).toMatch(NO_TOKEN_TEXT);
  });

  it("shows no tokens when cookie is present but no MSAL token keys exist", async () => {
    setMsalCookie(rawKey);
    setStorage({});
    await executeScript();
    expect(window.global.document.body.innerHTML).toMatch(NO_TOKEN_TEXT);
  });

  it("decrypts and shows a single MSAL idToken", async () => {
    setMsalCookie(rawKey);
    const encrypted = await encryptMsalToken(
      VALID_JWT_ENCODED,
      rawKey,
      nonce,
      TEST_CLIENT_ID
    );
    setStorage({
      [MSAL_KEYS_KEY]: JSON.stringify({ idToken: [ID_TOKEN_KEY] }),
      [ID_TOKEN_KEY]: JSON.stringify({
        nonce: toBase64url(nonce),
        data: encrypted,
      }),
    });
    await executeScript();
    expect(window.global.document.body.innerHTML).toMatch(/MSAL idToken/);
    expect(window.global.document.body.innerHTML).toMatch(VALID_JWT_DECODED);
    expect(window.global.document.body.innerHTML).toMatch(/Copied to clipboard/gi);
  });

  it("decrypts and shows a single MSAL accessToken", async () => {
    setMsalCookie(rawKey);
    const encrypted = await encryptMsalToken(
      VALID_JWT_ENCODED,
      rawKey,
      nonce,
      TEST_CLIENT_ID
    );
    setStorage({
      [MSAL_KEYS_KEY]: JSON.stringify({ accessToken: [ACCESS_TOKEN_KEY] }),
      [ACCESS_TOKEN_KEY]: JSON.stringify({
        nonce: toBase64url(nonce),
        data: encrypted,
      }),
    });
    await executeScript();
    expect(window.global.document.body.innerHTML).toMatch(/MSAL accessToken/);
    expect(window.global.document.body.innerHTML).toMatch(VALID_JWT_DECODED);
  });

  it("decrypts both idToken and accessToken for the same client", async () => {
    setMsalCookie(rawKey);
    const nonce2 = new Uint8Array(crypto.getRandomValues(new Uint8Array(16)));
    const encryptedId = await encryptMsalToken(
      VALID_JWT_ENCODED,
      rawKey,
      nonce,
      TEST_CLIENT_ID
    );
    const encryptedAccess = await encryptMsalToken(
      VALID_JWT_ENCODED_2,
      rawKey,
      nonce2,
      TEST_CLIENT_ID
    );
    setStorage({
      [MSAL_KEYS_KEY]: JSON.stringify({
        idToken: [ID_TOKEN_KEY],
        accessToken: [ACCESS_TOKEN_KEY],
      }),
      [ID_TOKEN_KEY]: JSON.stringify({
        nonce: toBase64url(nonce),
        data: encryptedId,
      }),
      [ACCESS_TOKEN_KEY]: JSON.stringify({
        nonce: toBase64url(nonce2),
        data: encryptedAccess,
      }),
    });
    await executeScript();
    expect(window.global.document.body.innerHTML).toMatch(/MSAL idToken/);
    expect(window.global.document.body.innerHTML).toMatch(/MSAL accessToken/);
    expect(window.global.document.body.innerHTML).toMatch(VALID_JWT_DECODED);
    expect(window.global.document.body.innerHTML).toMatch(VALID_JWT_DECODED_2);
  });

  it("decrypts tokens from multiple MSAL clients", async () => {
    const CLIENT_ID_2 = "second-client-5678";
    const rawKey2 = new Uint8Array(crypto.getRandomValues(new Uint8Array(32)));
    const nonce2 = new Uint8Array(crypto.getRandomValues(new Uint8Array(16)));

    setMsalCookie(rawKey);
    // Set both cookies; second client uses same cookie key (same session)
    const encrypted1 = await encryptMsalToken(
      VALID_JWT_ENCODED,
      rawKey,
      nonce,
      TEST_CLIENT_ID
    );
    const encrypted2 = await encryptMsalToken(
      VALID_JWT_ENCODED_2,
      rawKey,
      nonce2,
      CLIENT_ID_2
    );
    setStorage({
      [MSAL_KEYS_KEY]: JSON.stringify({ idToken: [ID_TOKEN_KEY] }),
      [ID_TOKEN_KEY]: JSON.stringify({
        nonce: toBase64url(nonce),
        data: encrypted1,
      }),
      [`msal.2.token.keys.${CLIENT_ID_2}`]: JSON.stringify({
        idToken: [`msal.2.idtoken.${CLIENT_ID_2}`],
      }),
      [`msal.2.idtoken.${CLIENT_ID_2}`]: JSON.stringify({
        nonce: toBase64url(nonce2),
        data: encrypted2,
      }),
    });
    await executeScript();
    expect(window.global.document.body.innerHTML).toMatch(VALID_JWT_DECODED);
    expect(window.global.document.body.innerHTML).toMatch(VALID_JWT_DECODED_2);
  });

  it("deduplicates MSAL tokens already found as plaintext", async () => {
    setMsalCookie(rawKey);
    const encrypted = await encryptMsalToken(
      VALID_JWT_ENCODED,
      rawKey,
      nonce,
      TEST_CLIENT_ID
    );
    // Token also stored in plaintext (e.g. older MSAL or unencrypted copy)
    setStorage({
      plainJwt: VALID_JWT_ENCODED,
      [MSAL_KEYS_KEY]: JSON.stringify({ idToken: [ID_TOKEN_KEY] }),
      [ID_TOKEN_KEY]: JSON.stringify({
        nonce: toBase64url(nonce),
        data: encrypted,
      }),
    });
    await executeScript();
    // Only one instance of the token should appear
    const count = (
      window.global.document.body.innerHTML.match(/"iat": 0/g) ?? []
    ).length;
    expect(count).toBe(1);
  });

  it("shows plain JWT alongside MSAL token without duplication", async () => {
    setMsalCookie(rawKey);
    const encrypted = await encryptMsalToken(
      VALID_JWT_ENCODED_2,
      rawKey,
      nonce,
      TEST_CLIENT_ID
    );
    setStorage({
      plainJwt: VALID_JWT_ENCODED,
      [MSAL_KEYS_KEY]: JSON.stringify({ idToken: [ID_TOKEN_KEY] }),
      [ID_TOKEN_KEY]: JSON.stringify({
        nonce: toBase64url(nonce),
        data: encrypted,
      }),
    });
    await executeScript();
    expect(window.global.document.body.innerHTML).toMatch(VALID_JWT_DECODED);
    expect(window.global.document.body.innerHTML).toMatch(VALID_JWT_DECODED_2);
    expect(window.global.document.body.innerHTML).toMatch(/MSAL idToken/);
  });

  it("skips a malformed MSAL token entry but shows valid ones", async () => {
    setMsalCookie(rawKey);
    const encrypted = await encryptMsalToken(
      VALID_JWT_ENCODED,
      rawKey,
      nonce,
      TEST_CLIENT_ID
    );
    const BAD_TOKEN_KEY = `msal.2.idtoken.bad`;
    setStorage({
      [MSAL_KEYS_KEY]: JSON.stringify({
        idToken: [BAD_TOKEN_KEY, ID_TOKEN_KEY],
      }),
      [BAD_TOKEN_KEY]: JSON.stringify({ nonce: "notvalidb64", data: "garbage" }),
      [ID_TOKEN_KEY]: JSON.stringify({
        nonce: toBase64url(nonce),
        data: encrypted,
      }),
    });
    await executeScript();
    expect(window.global.document.body.innerHTML).toMatch(VALID_JWT_DECODED);
  });
});
