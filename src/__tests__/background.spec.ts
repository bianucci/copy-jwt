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
let executeScript: () => void;

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
      executeScript = options.func;
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

describe("finding json web tokens", () => {
  beforeEach(() => {
    global.alert = jest.fn();
    window.document.execCommand = jest.fn();
    global.document.body.innerHTML = "";
  });

  it("throws error for invalid tab", () => {
    expect(() => listener({ id: 0 } as chrome.tabs.Tab)).toThrowError(
      "no tab id"
    );
  });

  it("handles empty storage", () => {
    setStorage({});
    executeScript();
    expect(window.global.document.body.innerHTML).toMatch(NO_TOKEN_TEXT);
  });

  it("handles undefined values", () => {
    setStorage({ key: undefined });
    executeScript();
    expect(window.global.document.body.innerHTML).toMatch(NO_TOKEN_TEXT);
  });

  it("handles empty strings", () => {
    setStorage({ key: "" });
    executeScript();
    expect(window.global.document.body.innerHTML).toMatch(NO_TOKEN_TEXT);
  });

  it("handles null values", () => {
    setStorage({ key: null });
    executeScript();
    expect(window.global.document.body.innerHTML).toMatch(NO_TOKEN_TEXT);
  });

  it("handles tokens which are valid bot not of type JWT", () => {
    setStorage({
      key: JSON.stringify({ layer1: TOKEN_WITH_TYPE_OTHER_THAN_JWT }),
    });
    executeScript();
    expect(window.global.document.body.innerHTML).toMatch(NO_TOKEN_TEXT);
  });

  it("handles garbage tokens", () => {
    setStorage({
      key: "eyasdasdasd",
    });
    executeScript();
    expect(window.global.document.body.innerHTML).toMatch(NO_TOKEN_TEXT);
  });

  it("handles garbage json", () => {
    setStorage({
      key: "{something not json eyasdasdasd}",
    });
    executeScript();
    expect(window.global.document.body.innerHTML).toMatch(NO_TOKEN_TEXT);
  });

  it("handles nested values", () => {
    setStorage({
      key: JSON.stringify({ deep: { deeper: { jwt: VALID_JWT_ENCODED } } }),
    });
    executeScript();
    expect(window.global.document.body.innerHTML).toMatch(VALID_JWT_DECODED);
  });

  it("handles array values", () => {
    setStorage({
      key: JSON.stringify({ deep: { deeper: { jwt: [VALID_JWT_ENCODED] } } }),
    });
    executeScript();
    expect(window.global.document.body.innerHTML).toMatch(VALID_JWT_DECODED);
  });

  it("handles plain string values", () => {
    setStorage({ key: VALID_JWT_ENCODED });
    executeScript();
    expect(window.global.document.body.innerHTML).toMatch(VALID_JWT_DECODED);
  });

  it("handles tokens embedded in objects", () => {
    setStorage({ key: JSON.stringify({ layer1: VALID_JWT_ENCODED }) });
    executeScript();
    expect(window.global.document.body.innerHTML).toMatch(VALID_JWT_DECODED);
  });

  it("copies single token", () => {
    setStorage({ token1: VALID_JWT_ENCODED });
    executeScript();
    expect(window.global.document.body.innerHTML).toMatch(
      /Copied to clipboard/gi
    );
  });

  it("handles multiple tokens were found", () => {
    setStorage({ token1: VALID_JWT_ENCODED, token2: VALID_JWT_ENCODED_2 });
    executeScript();
    expect(window.global.document.body.innerHTML).toMatch(VALID_JWT_ENCODED);
    expect(window.global.document.body.innerHTML).toMatch(VALID_JWT_DECODED);
    expect(window.global.document.body.innerHTML).toMatch(VALID_JWT_ENCODED_2);
    expect(window.global.document.body.innerHTML).toMatch(VALID_JWT_DECODED_2);
  });

  it("translates numbers to date", () => {
    setStorage({ token1: VALID_JWT_ENCODED, token2: VALID_JWT_ENCODED_2 });
    executeScript();
    expect(window.global.document.body.innerHTML).toMatch(VALID_JWT_DECODED);
    expect(window.global.document.body.innerHTML).toMatch(
      new RegExp(`"iat_as_date": "${new Date(123).toLocaleString()}"`)
    );
  });

  it("removed modal", () => {
    setStorage({ token1: VALID_JWT_ENCODED, token2: VALID_JWT_ENCODED_2 });

    expect(global.document.body.children.length).toBe(0);
    executeScript();
    expect(global.document.body.children.length).toBe(1);

    global.document
      .querySelector<HTMLButtonElement>("#copy-jwt-close-modal")
      ?.click();

    expect(global.document.body.children.length).toBe(0);
  });

  it("copies single value to clipboard", () => {
    expect(window.document.execCommand).not.toHaveBeenCalled();
    setStorage({ token1: VALID_JWT_ENCODED });
    executeScript();
    expect(window.document.execCommand).toHaveBeenCalledTimes(1);
  });

  it("copies selected value to clipboard", () => {
    expect(window.document.execCommand).not.toHaveBeenCalled();
    setStorage({ token1: VALID_JWT_ENCODED, token2: VALID_JWT_ENCODED_2 });
    executeScript();
    expect(window.document.execCommand).not.toHaveBeenCalled();

    global.document
      .querySelector<HTMLButtonElement>(".copy-jwt-copy-jwt")
      ?.click();

    expect(window.document.execCommand).toHaveBeenCalledTimes(1);
  });
});
