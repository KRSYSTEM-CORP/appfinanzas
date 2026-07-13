import sharp from "sharp";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const OUT_DIR = fileURLToPath(new URL("../public/icons/", import.meta.url));
mkdirSync(OUT_DIR, { recursive: true });

// Simple wordmark: near-black rounded square with a white "K", matching the
// app's neutral black/white theme (see app/globals.css --primary).
function svgIcon({ size, padding = 0 }) {
  const inner = size - padding * 2;
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#111111"/>
  <text
    x="50%"
    y="50%"
    dominant-baseline="central"
    text-anchor="middle"
    font-family="Georgia, 'Times New Roman', serif"
    font-weight="700"
    font-size="${inner * 0.58}"
    fill="#ffffff"
  >K</text>
</svg>`;
}

const targets = [
  { name: "icon-192.png", size: 192, padding: 0 },
  { name: "icon-512.png", size: 512, padding: 0 },
  // Maskable icons need extra padding so the logo stays inside the "safe zone"
  // when the OS crops it into a circle/squircle.
  { name: "icon-maskable-192.png", size: 192, padding: 24 },
  { name: "icon-maskable-512.png", size: 512, padding: 64 },
  { name: "apple-touch-icon.png", size: 180, padding: 0 },
];

for (const t of targets) {
  const svg = Buffer.from(svgIcon(t));
  await sharp(svg).png().toFile(path.join(OUT_DIR, t.name));
  console.log("Wrote", t.name);
}
