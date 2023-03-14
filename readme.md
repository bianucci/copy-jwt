# copy-jwt

## Install

Via [Google Chrome Web Store](https://chrome.google.com/webstore/detail/copy-jwt/mnmgmnigoeabimncikdolaekjmfeeghi)

## Usage

Visit website which contains JWT token in local storage and click extension button (key icon).

If a single token was found it is copied directly into the clipboard.

If multiple tokens were found you can select which one you would like to copy.

## Develop

Instructions

1. Build

    ```bash
    npm run dist
    ```

2. Manually install extension to Google Chrome, using `dist` directory.

3. Open `test.html` in Google Chrome and run extension

4. Modify code and `npm run build` to see changes

## Screen Shots

**single token:**
![Example single token](docs/img/modal-single.png)

**multiple token:**
![Example multiple token](docs/img/modal-multiple.png)

**local storage:**
![Example single token](docs/img/localstorage.png)
