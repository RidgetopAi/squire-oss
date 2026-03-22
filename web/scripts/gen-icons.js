const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const svgPath = path.join(publicDir, 'squire-icon.svg');

// Check if rsvg-convert (librsvg) is available for high-quality SVG→PNG
function hasRsvg() {
  try {
    execSync('which rsvg-convert', { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

// Check if Inkscape is available
function hasInkscape() {
  try {
    execSync('which inkscape', { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

const sizes = [
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' },
  { size: 72,  name: 'badge-72.png' },
  { size: 180, name: 'apple-touch-icon.png' },
];

if (!fs.existsSync(svgPath)) {
  console.error('Error: squire-icon.svg not found in public/');
  process.exit(1);
}

if (hasRsvg()) {
  console.log('Using rsvg-convert for PNG generation...');
  for (const { size, name } of sizes) {
    const outPath = path.join(publicDir, name);
    execSync(`rsvg-convert -w ${size} -h ${size} "${svgPath}" -o "${outPath}"`);
    console.log(`Created ${name} (${size}x${size})`);
  }
} else if (hasInkscape()) {
  console.log('Using Inkscape for PNG generation...');
  for (const { size, name } of sizes) {
    const outPath = path.join(publicDir, name);
    execSync(`inkscape "${svgPath}" --export-type=png --export-filename="${outPath}" -w ${size} -h ${size}`);
    console.log(`Created ${name} (${size}x${size})`);
  }
} else {
  console.log('Neither rsvg-convert nor inkscape found.');
  console.log('Install librsvg2-bin: sudo apt install librsvg2-bin');
  console.log('Then re-run: node scripts/gen-icons.js');
  console.log('');
  console.log('SVG icon is at: public/squire-icon.svg');
  console.log('You can also open it in a browser and use the manifest with SVG directly.');
  process.exit(1);
}

console.log('Done! All icons generated from squire-icon.svg');
