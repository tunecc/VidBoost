import fs from 'fs';
import path from 'path';

// 1x1 Transparent PNG
const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';
const buffer = Buffer.from(base64, 'base64');

const sizes = [16, 48, 128];
const iconsDir = path.resolve('public/icons');

if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

sizes.forEach(size => {
    fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), buffer);
    console.log(`Generated icon${size}.png`);
});
