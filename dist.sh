#!/bin/bash
rm -rf dist

npm run build

cp src/manifest.json dist/
cp -r src/images dist/

echo "var exports = {};$(cat dist/background.js)" >dist/background.js
