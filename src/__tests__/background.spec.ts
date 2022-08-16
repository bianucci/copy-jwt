import { setup } from "../background";

type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

const VALID_JWT_ENCODED =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjB9._U45K6oXhpt8xelFL8626lSpnstATbSEFoSvVcPI7hs";

const VALID_JWT_PAYLOAD = `{
  "iat": 0
}`;

const TOKEN_WITH_TYPE_OTHER_THAN_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6Ik5PVEpXVCJ9.eyJpYXQiOjB9.5JlNCW1LMsn4sgnwVZ6PdI0DZPRk5vk9kGZzLH8VYcg";

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

window.document.execCommand = jest.fn();

function setStorage(value: Record<string, string | null | undefined>) {
  Object.defineProperty(window, "localStorage", {
    value,
    writable: true,
  });
}

describe("finding json web tokens", () => {
  beforeEach(() => {
    global.alert = jest.fn();
  });

  it("throws error for invalid tab", () => {
    expect(() => listener({ id: 0 } as chrome.tabs.Tab)).toThrowError(
      "no tab id"
    );
  });

  it("handles empty storage", () => {
    setStorage({});
    executeScript();
    expect(window.alert).toHaveBeenCalledWith("no token was found");
  });

  it("handles undefined values", () => {
    setStorage({ key: undefined });
    executeScript();
    expect(window.alert).toHaveBeenCalledWith("no token was found");
  });

  it("handles empty strings", () => {
    setStorage({ key: "" });
    executeScript();
    expect(window.alert).toHaveBeenCalledWith("no token was found");
  });

  it("handles null values", () => {
    setStorage({ key: null });
    executeScript();
    expect(window.alert).toHaveBeenCalledWith("no token was found");
  });

  it("handles tokens which are valid bot not of type JWT", () => {
    setStorage({
      key: JSON.stringify({ layer1: TOKEN_WITH_TYPE_OTHER_THAN_JWT }),
    });
    executeScript();
    expect(window.alert).toHaveBeenCalledWith("no token was found");
  });

  it("handles garbage tokens", () => {
    setStorage({
      key: "eyasdasdasd",
    });
    executeScript();
    expect(window.alert).toHaveBeenCalledWith("no token was found");
  });

  it("handles garbage json", () => {
    setStorage({
      key: "{something not json eyasdasdasd}",
    });
    executeScript();
    expect(window.alert).toHaveBeenCalledWith("no token was found");
  });

  it("handles nested values", () => {
    setStorage({
      key: JSON.stringify({ deep: { deeper: { jwt: VALID_JWT_ENCODED } } }),
    });
    executeScript();
    expect(window.alert).toHaveBeenCalledWith(
      `copied jwt token for: ${VALID_JWT_PAYLOAD}`
    );
  });

  it("handles array values", () => {
    setStorage({
      key: JSON.stringify({ deep: { deeper: { jwt: [VALID_JWT_ENCODED] } } }),
    });
    executeScript();
    expect(window.alert).toHaveBeenCalledWith(
      `copied jwt token for: ${VALID_JWT_PAYLOAD}`
    );
  });

  it("handles plain string values", () => {
    setStorage({ key: VALID_JWT_ENCODED });
    executeScript();
    expect(window.alert).toHaveBeenCalledWith(
      `copied jwt token for: ${VALID_JWT_PAYLOAD}`
    );
  });

  it("handles tokens embedded in objects", () => {
    setStorage({ key: JSON.stringify({ layer1: VALID_JWT_ENCODED }) });
    executeScript();
    expect(window.alert).toHaveBeenCalledWith(
      `copied jwt token for: ${VALID_JWT_PAYLOAD}`
    );
  });

  it("handles multiple tokens were found", () => {
    setStorage({ token1: VALID_JWT_ENCODED, token2: VALID_JWT_ENCODED });
    executeScript();
    expect(window.alert).toHaveBeenCalledWith(
      `found more than one token, see console`
    );
  });
});
