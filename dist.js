const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = __dirname;
const distDir = path.join(rootDir, 'dist');
const manifestSrc = path.join(rootDir, 'src', 'manifest.json');
const imagesSrc = path.join(rootDir, 'src', 'images');
const manifestDest = path.join(distDir, 'manifest.json');
const imagesDest = path.join(distDir, 'images');
const backgroundPath = path.join(distDir, 'background.js');
const zipPath = path.join(rootDir, 'copy-jwt.zip');

function run(command, options = {}) {
  execSync(command, {
    stdio: 'inherit',
    cwd: rootDir,
    ...options,
  });
}

function main() {
  fs.rmSync(distDir, { recursive: true, force: true });

  run('npm run build');

  fs.copyFileSync(manifestSrc, manifestDest);
  fs.cpSync(imagesSrc, imagesDest, { recursive: true });

  const backgroundJs = fs.readFileSync(backgroundPath, 'utf8');
  fs.writeFileSync(backgroundPath, `var exports = {};${backgroundJs}`, 'utf8');

  fs.rmSync(zipPath, { force: true });

  if (process.platform === 'win32') {
    run('powershell -NoProfile -Command "Compress-Archive -Path * -DestinationPath ../copy-jwt.zip -Force"', {
      cwd: distDir,
    });
  } else {
    run('zip -r ../copy-jwt.zip . -x "*.DS_Store"', {
      cwd: distDir,
    });
  }
}

main();
