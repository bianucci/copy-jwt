import { InitialOptionsTsJest } from "ts-jest";

const options: InitialOptionsTsJest = {
  testEnvironment: "jsdom",
  preset: "ts-jest",
  globals: {
    "ts-jest": {},
    chrome: {
      action: {
        onClicked: {
          addListener: () => "",
        },
      },
    },
  },
};

module.exports = options;
