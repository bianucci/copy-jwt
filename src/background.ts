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
          return JSON.stringify(
            JSON.parse(atob(encoded.split(".")[1])),
            null,
            2
          );
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

        const tokens = findJwtTokens(localStorage);

        if (!tokens.length) {
          alert("no token was found");
        } else if (tokens.length > 1) {
          console.log(tokens);
          alert("found more than one token, see console");
        } else {
          const token = tokens[0];
          copyToClipboard(token);
          alert(`copied jwt token for: ${prettyJwtPayload(token)}`);
        }
      },
    });
  });
};

setup();
