#!/bin/bash
rm -rf dist

npm run build

cp src/manifest.json dist/
cp -r src/images dist/

echo "var exports = {};$(cat dist/background.js)" >dist/background.js

rm copy-jwt.zip
zip -r copy-jwt.zip dist/* -x "*.DS_Store"
