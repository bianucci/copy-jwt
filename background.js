chrome.action.onClicked.addListener(function (tab) {
  findJwtTokenForTab(tab);
});

async function findJwtTokenForTab(tab) {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: () => {
      function copy(text) {
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

      // iterate over local storage values
      const tokens = Object.values(localStorage)
        .filter((entry) => entry.includes("ey"))
        .map((entry) => {
          // jwt found as simple string
          if (entry.startsWith("ey")) {
            return [entry];
          }

          try {
            // try to find jwt inside JSON
            const object = JSON.parse(entry);
            return Object.values(object).filter((jwtCandidate) =>
              jwtCandidate.includes("ey")
            );
          } catch {
            return [];
          }
        })
        .reduce((acc, jwtCandidates) => {
          return [...acc, ...jwtCandidates];
        }, [])
        .filter((jwtCandidate) => {
          try {
            return JSON.parse(atob(jwtCandidate.split(".")[0])).typ === "JWT";
          } catch {
            return false;
          }
        });

      if (!tokens.length) {
        alert("no token was found");
      } else if (tokens.length > 1) {
        console.log(tokens);
        alert("found more than one token, see console");
      } else {
        const token = tokens[0];
        copy(token);
        alert(
          `copied jwt token for: \n${JSON.stringify(
            JSON.parse(atob(token.split(".")[1])),
            null,
            2
          )}`
        );
      }

      window.close();
    },
  });
}
