/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */

module.exports = {
  testEnvironment: "jsdom",
  preset: "ts-jest",
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
