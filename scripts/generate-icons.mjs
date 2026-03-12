import sharp from "sharp";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Transparent background, black logo — fallback for browsers that don't support SVG favicons
const iconSvg = `<svg viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg" fill="none">
  <rect x="93" y="93" width="34" height="34" rx="3" stroke="#000" stroke-width="6" fill="none"/>
  <rect x="101" y="101" width="18" height="18" rx="2" fill="#000"/>
  <path d="M110 93 L110 51 L72 29" stroke="#000" stroke-width="6" stroke-linecap="round" fill="none"/>
  <path d="M110 93 L110 51 L148 29" stroke="#000" stroke-width="6" stroke-linecap="round" fill="none"/>
  <rect x="62" y="21" width="20" height="16" rx="5" fill="none" stroke="#000" stroke-width="5"/>
  <rect x="138" y="21" width="20" height="16" rx="5" fill="none" stroke="#000" stroke-width="5"/>
  <path d="M127 110 L169 110 L191 78" stroke="#000" stroke-width="6" stroke-linecap="round" fill="none"/>
  <path d="M127 110 L169 110 L191 142" stroke="#000" stroke-width="6" stroke-linecap="round" fill="none"/>
  <rect x="183" y="70" width="16" height="16" rx="5" fill="none" stroke="#000" stroke-width="5"/>
  <rect x="183" y="134" width="16" height="16" rx="5" fill="none" stroke="#000" stroke-width="5"/>
  <path d="M110 127 L110 169 L72 191" stroke="#000" stroke-width="6" stroke-linecap="round" fill="none"/>
  <path d="M110 127 L110 169 L148 191" stroke="#000" stroke-width="6" stroke-linecap="round" fill="none"/>
  <rect x="62" y="183" width="20" height="16" rx="5" fill="none" stroke="#000" stroke-width="5"/>
  <rect x="138" y="183" width="20" height="16" rx="5" fill="none" stroke="#000" stroke-width="5"/>
  <path d="M93 110 L51 110 L29 78" stroke="#000" stroke-width="6" stroke-linecap="round" fill="none"/>
  <path d="M93 110 L51 110 L29 142" stroke="#000" stroke-width="6" stroke-linecap="round" fill="none"/>
  <rect x="21" y="70" width="16" height="16" rx="5" fill="none" stroke="#000" stroke-width="5"/>
  <rect x="21" y="134" width="16" height="16" rx="5" fill="none" stroke="#000" stroke-width="5"/>
</svg>`;

// Dark circle background, white logo — for iOS home screen
const appleIconSvg = `<svg viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg" fill="none">
  <circle cx="110" cy="110" r="108" fill="#111118"/>
  <rect x="93" y="93" width="34" height="34" rx="3" stroke="#fff" stroke-width="6" fill="none"/>
  <rect x="101" y="101" width="18" height="18" rx="2" fill="#fff"/>
  <path d="M110 93 L110 51 L72 29" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none"/>
  <path d="M110 93 L110 51 L148 29" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none"/>
  <rect x="62" y="21" width="20" height="16" rx="5" fill="none" stroke="#fff" stroke-width="5"/>
  <rect x="138" y="21" width="20" height="16" rx="5" fill="none" stroke="#fff" stroke-width="5"/>
  <path d="M127 110 L169 110 L191 78" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none"/>
  <path d="M127 110 L169 110 L191 142" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none"/>
  <rect x="183" y="70" width="16" height="16" rx="5" fill="none" stroke="#fff" stroke-width="5"/>
  <rect x="183" y="134" width="16" height="16" rx="5" fill="none" stroke="#fff" stroke-width="5"/>
  <path d="M110 127 L110 169 L72 191" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none"/>
  <path d="M110 127 L110 169 L148 191" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none"/>
  <rect x="62" y="183" width="20" height="16" rx="5" fill="none" stroke="#fff" stroke-width="5"/>
  <rect x="138" y="183" width="20" height="16" rx="5" fill="none" stroke="#fff" stroke-width="5"/>
  <path d="M93 110 L51 110 L29 78" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none"/>
  <path d="M93 110 L51 110 L29 142" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none"/>
  <rect x="21" y="70" width="16" height="16" rx="5" fill="none" stroke="#fff" stroke-width="5"/>
  <rect x="21" y="134" width="16" height="16" rx="5" fill="none" stroke="#fff" stroke-width="5"/>
</svg>`;

await sharp(Buffer.from(iconSvg)).resize(32, 32).png().toFile(join(root, "src/app/icon.png"));
console.log("Generated src/app/icon.png (32x32, transparent)");

await sharp(Buffer.from(appleIconSvg)).resize(180, 180).png().toFile(join(root, "src/app/apple-icon.png"));
console.log("Generated src/app/apple-icon.png (180x180, dark bg)");
