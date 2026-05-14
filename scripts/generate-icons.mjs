import { Jimp } from 'jimp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

async function generate() {
  const logo = await Jimp.read(join(root, 'assets/images/logo.jpg'));

  // === 1. Main app icon — 1024x1024, logo centered with padding ===
  const ICON_SIZE = 1024;
  const PADDING = 140; // padding on each side
  const maxLogoSize = ICON_SIZE - PADDING * 2;

  // Scale logo to fit within maxLogoSize keeping aspect ratio
  const lw = logo.bitmap.width;
  const lh = logo.bitmap.height;
  const scale = Math.min(maxLogoSize / lw, maxLogoSize / lh);
  const newW = Math.round(lw * scale);
  const newH = Math.round(lh * scale);

  const logoCopy = logo.clone().resize({ w: newW, h: newH });

  // Create dark background
  const icon = new Jimp({ width: ICON_SIZE, height: ICON_SIZE, color: 0x0A0A0Aff });

  // Center the logo
  const x = Math.round((ICON_SIZE - newW) / 2);
  const y = Math.round((ICON_SIZE - newH) / 2);
  icon.composite(logoCopy, x, y);

  await icon.write(join(root, 'assets/icon.png'));
  console.log('✅ assets/icon.png — 1024x1024');

  // === 2. Adaptive icon foreground — 1024x1024, smaller (safe zone = 66%) ===
  const ADAPTIVE_SIZE = 1024;
  const SAFE_ZONE = 0.55; // keep logo within 55% of canvas for Android safe zone
  const maxAdaptive = Math.round(ADAPTIVE_SIZE * SAFE_ZONE);
  const scale2 = Math.min(maxAdaptive / lw, maxAdaptive / lh);
  const aw = Math.round(lw * scale2);
  const ah = Math.round(lh * scale2);

  const logoCopy2 = logo.clone().resize({ w: aw, h: ah });

  // Transparent background for adaptive icon
  const adaptive = new Jimp({ width: ADAPTIVE_SIZE, height: ADAPTIVE_SIZE, color: 0x00000000 });
  const ax = Math.round((ADAPTIVE_SIZE - aw) / 2);
  const ay = Math.round((ADAPTIVE_SIZE - ah) / 2);
  adaptive.composite(logoCopy2, ax, ay);

  await adaptive.write(join(root, 'assets/adaptive-icon.png'));
  console.log('✅ assets/adaptive-icon.png — 1024x1024 (adaptive, safe zone)');

  // === 3. Splash icon — 1242x2688 (tall), logo centered ===
  const SW = 1242, SH = 2688;
  const splashMax = 600;
  const scale3 = Math.min(splashMax / lw, splashMax / lh);
  const sw = Math.round(lw * scale3);
  const sh = Math.round(lh * scale3);
  const logoCopy3 = logo.clone().resize({ w: sw, h: sh });
  const splash = new Jimp({ width: SW, height: SH, color: 0x0A0A0Aff });
  splash.composite(logoCopy3, Math.round((SW - sw) / 2), Math.round((SH - sh) / 2));
  await splash.write(join(root, 'assets/splash-icon.png'));
  console.log('✅ assets/splash-icon.png — 1242x2688');

  // === 4. Favicon — 48x48 ===
  const favicon = logo.clone().resize({ w: 48, h: 48 });
  await favicon.write(join(root, 'assets/favicon.png'));
  console.log('✅ assets/favicon.png — 48x48');

  console.log('\nAll icons generated successfully!');
}

generate().catch(console.error);
