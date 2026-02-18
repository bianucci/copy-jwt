type Searchable = {
  [key: string]: string | Searchable;
};

type TokenEntry = { token: string; label?: string };

export const setup = () => {
  chrome.action.onClicked.addListener(function (tab) {
    if (!tab.id) {
      throw new Error("no tab id");
    }

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (async () => {
        function b64u(s: string): Uint8Array<ArrayBuffer> {
          s = s.replace(/-/g, "+").replace(/_/g, "/");
          if (s.length % 4 === 2) s += "==";
          if (s.length % 4 === 3) s += "=";
          return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
        }

        function prettyJwtPayload(encoded: string) {
          const parsed = Object.entries(
            JSON.parse(atob(encoded.split(".")[1]))
          ).reduce((acc, [key, value]) => {
            acc[key] = value;
            if (typeof value == "number") {
              acc[`${key}_as_date`] = new Date(value * 1000).toLocaleString();
            } else {
            }
            return acc;
          }, {} as Record<string, unknown>);
          return JSON.stringify(parsed, null, 2);
        }

        function copyToClipboard(text: string) {
          const ta = document.createElement("textarea");
          ta.style.cssText =
            "opacity:0; position:fixed; width:1px; height:1px; top:0; left:0;";
          ta.value = text;
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }

        function findJwtTokens(searchable: Searchable): string[] {
          // values in local storage which may contain jwt token starting with "ey..."
          const candidateEntries = Object.values(searchable).filter((entry) => {
            if (!entry) {
              return false;
            }
            if (typeof entry === "string") {
              return entry.includes("ey");
            } else {
              return Object.entries(entry).length;
            }
          });

          const jwtCandidates = candidateEntries
            .map((candidate) => {
              if (typeof candidate === "string" && candidate.startsWith("ey")) {
                // jwt is simple string
                return [candidate];
              }

              try {
                let furtherSearchable = candidate;

                if (typeof candidate === "string") {
                  furtherSearchable = JSON.parse(candidate);
                }

                const tokens = Object.values(furtherSearchable).reduce(
                  (acc, jwtCandidate) => {
                    if (typeof jwtCandidate !== "string") {
                      return [...acc, ...findJwtTokens(jwtCandidate)];
                    } else if (jwtCandidate.includes("ey")) {
                      acc.push(jwtCandidate);
                    }
                    return acc;
                  },
                  [] as string[]
                );

                return tokens as string[];
              } catch {
                return [] as string[];
              }
            })
            .reduce((acc, jwtCandidates) => {
              return [...acc, ...jwtCandidates];
            }, []);

          // decode and parse tokens to check for actual typ === JWT
          return jwtCandidates.filter((jwtCandidate) => {
            try {
              return JSON.parse(atob(jwtCandidate.split(".")[0])).typ === "JWT";
            } catch {
              return false;
            }
          });
        }

        async function getMsalCookieKey(): Promise<string | null> {
          try {
            let cookieRaw: string | undefined;

            const cookieStoreValue = await (
              window as unknown as {
                cookieStore?: { get?: (name: string) => Promise<{ value: string } | null> };
              }
            ).cookieStore?.get?.("msal.cache.encryption");

            if (cookieStoreValue?.value) {
              cookieRaw = cookieStoreValue.value;
            } else {
              const cookieStr = document.cookie
                .split("; ")
                .find((c) => c.startsWith("msal.cache.encryption="));
              if (cookieStr) {
                cookieRaw = cookieStr.substring("msal.cache.encryption=".length);
              }
            }

            if (!cookieRaw) return null;

            const { key } = JSON.parse(decodeURIComponent(cookieRaw));
            return key as string;
          } catch {
            return null;
          }
        }

        async function findMsalTokens(rawKey: string): Promise<TokenEntry[]> {
          const results: TokenEntry[] = [];

          let baseKey: CryptoKey;
          try {
            baseKey = await crypto.subtle.importKey(
              "raw",
              b64u(rawKey),
              "HKDF",
              false,
              ["deriveKey"]
            );
          } catch {
            return results;
          }

          const tkKeys = Object.keys(localStorage).filter((k) =>
            k.startsWith("msal.2.token.keys.")
          );

          for (const tkKey of tkKeys) {
            const clientId = tkKey.substring("msal.2.token.keys.".length);

            let tokenKeyMap: { idToken?: string[]; accessToken?: string[] };
            try {
              tokenKeyMap = JSON.parse((localStorage[tkKey] as string | null) ?? "{}");
            } catch {
              continue;
            }

            const tokenTypes: Array<[string[], string]> = [
              [tokenKeyMap.idToken ?? [], "MSAL idToken"],
              [tokenKeyMap.accessToken ?? [], "MSAL accessToken"],
            ];

            for (const [keys, label] of tokenTypes) {
              for (const tokenKey of keys) {
                try {
                  const entry = JSON.parse(
                    (localStorage[tokenKey] as string | null) ?? "{}"
                  );
                  const { nonce, data } = entry as {
                    nonce: string;
                    data: string;
                  };

                  const aesKey = await crypto.subtle.deriveKey(
                    {
                      name: "HKDF",
                      salt: b64u(nonce),
                      hash: "SHA-256",
                      info: new TextEncoder().encode(clientId),
                    },
                    baseKey,
                    { name: "AES-GCM", length: 256 },
                    false,
                    ["decrypt"]
                  );

                  const decrypted = await crypto.subtle.decrypt(
                    { name: "AES-GCM", iv: new Uint8Array(12) },
                    aesKey,
                    b64u(data)
                  );

                  const secret: string = JSON.parse(
                    new TextDecoder().decode(decrypted)
                  ).secret;

                  results.push({ token: secret, label });
                } catch {
                  // skip tokens that fail to decrypt
                }
              }
            }
          }

          return results;
        }

        function asModal(entries: TokenEntry[]) {
          return `<div id="copy-jwt-modal">
            <div id="copy-jwt-modal-content">
              <div id="copy-jwt-modal-header">
                <h1>
                  copy-jwt
                </h1>
                <button id="copy-jwt-close-modal">
                  Close
                </button>
              </div>
              <div id="copy-jwt-modal-body">
              ${
                entries.length
                  ? entries.reduce(
                      (acc, entry, index) =>
                        (acc += `<div style="margin: 8px 0px;">
                          ${entry.label ? `<small style="color: gray">${entry.label}</small><br/>` : ""}
                          ${
                            entries.length === 1
                              ? `<span style="color: red">Copied to clipboard!</span>`
                              : `<button class="copy-jwt-copy-jwt" jwt="${entry.token}">Copy JWT</button>`
                          }
                          <pre>${prettyJwtPayload(entry.token)}</pre>
                        </div>
                        ${index < entries.length - 1 ? "<hr/>" : ""}`),
                      ""
                    )
                  : "No token was found!"
              }
              </div>
            </div>
            <style>
              #copy-jwt-modal {
                display:flex;
                position:absolute;
                top:0;
                left:0;
                right:0;
                bottom:0;
                align-items: center;
                justify-content: center;
                background: rgba(0,0,0,0.2);
                z-index: 2147483647;
              }

              #copy-jwt-modal * {
                font-family: Arial, sans-serif;
                font-size: 1em;
              }

              #copy-jwt-modal-content {
                position: relative;
                background:white;
                box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);
                border-bottom:1px solid gray;
              }

              #copy-jwt-modal-header {
                padding: 8px;
                top: 0;
                left: 0;
                right: 0;
                box-shadow: 0 1px 3px rgb(0 0 0 / 20%);
                display: flex;
                flex-direction: row;
                justify-content: space-between;
                align-items: center;
              }

              #copy-jwt-modal-body {
                max-height: 80vh;
                overflow: scroll;
                padding: 8px;
              }

              #copy-jwt-modal button {
                background: white;
                border: 1px solid rgba(0,0,0,0.3);
                border-radius: 5px;
                padding: 2px 5px;
              }

              #copy-jwt-modal button:hover {
                background: rgba(0,0,0,0.1);
              }

              #copy-jwt-modal pre {
                background: rgba(0,0,0,0.02);
                padding: 8px;
                border: 1px solid rgba(0,0,0,0.3);
                border-radius: 5px;
                font-family: monospace;
                margin: 5px 0;
              }

              #copy-jwt-modal hr {
                margin: 20px 0;
              }
            </style>
          <div>`;
        }

        const plainTokens: TokenEntry[] = findJwtTokens(localStorage).map(
          (t) => ({ token: t })
        );

        const cookieKey = await getMsalCookieKey();
        const msalTokens: TokenEntry[] = cookieKey
          ? await findMsalTokens(cookieKey)
          : [];

        const seen = new Set(plainTokens.map((e) => e.token));
        const allTokens = [
          ...plainTokens,
          ...msalTokens.filter((e) => !seen.has(e.token)),
        ];

        if (allTokens.length === 1) {
          copyToClipboard(allTokens[0].token);
        }

        document.body.insertAdjacentHTML("beforeend", asModal(allTokens));

        document
          .getElementById("copy-jwt-close-modal")
          ?.addEventListener("click", () => {
            document.getElementById("copy-jwt-modal")?.remove();
          });

        document.querySelectorAll(".copy-jwt-copy-jwt").forEach((button) => {
          button.addEventListener("click", (event) => {
            const button = event.target as HTMLButtonElement | null;
            if (button) {
              copyToClipboard(button.getAttribute("jwt") as string);
            }
          });
        });
      }) as () => void,
    });
  });
};

setup();
