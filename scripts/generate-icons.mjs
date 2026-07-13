import sharp from "sharp";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const OUT_DIR = fileURLToPath(new URL("../public/icons/", import.meta.url));
const SOURCE = fileURLToPath(new URL("../branding-input/logo.JPG", import.meta.url));
mkdirSync(OUT_DIR, { recursive: true });

const BG = "#000000";

async function renderIcon({ name, size, padding = 0 }) {
  const inner = size - padding * 2;
  const resized = await sharp(SOURCE).resize(inner, inner, { fit: "cover" }).toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 3, background: BG },
  })
    .composite([{ input: resized, left: padding, top: padding }])
    .png()
    .toFile(path.join(OUT_DIR, name));

  console.log("Wrote", name);
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
  await renderIcon(t);
}
