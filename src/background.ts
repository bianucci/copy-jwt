type Searchable = {
  [key: string]: string | Searchable;
};

export const setup = () => {
  chrome.action.onClicked.addListener(function (tab) {
    if (!tab.id) {
      throw new Error("no tab id");
    }

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
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

        function asModal(tokens: string[]) {
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
                tokens.length
                  ? tokens.reduce(
                      (acc, token, index) =>
                        (acc += `<div style="margin: 8px 0px;">
                          ${
                            tokens.length === 1
                              ? `<span style="color: red">Copied to clipboard!</span>`
                              : `<button class="copy-jwt-copy-jwt" jwt="${token}">Copy JWT</button>`
                          }
                          <pre>${prettyJwtPayload(token)}</pre>
                        </div>
                        ${index < tokens.length - 1 ? "<hr/>" : ""}`),
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

        const tokens = findJwtTokens(localStorage);
        if (tokens.length === 1) {
          copyToClipboard(tokens[0]);
        }

        document.body.insertAdjacentHTML("beforeend", asModal(tokens));

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
      },
    });
  });
};

setup();
