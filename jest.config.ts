import type { JestConfigWithTsJest } from "ts-jest";

const config: JestConfigWithTsJest = {
  testEnvironment: "jsdom",
  setupFiles: ["./jest.setup.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {}],
  },
  globals: {
    chrome: {
      action: {
        onClicked: {
          addListener: () => "",
        },
      },
    },
  },
};

module.exports = config;
