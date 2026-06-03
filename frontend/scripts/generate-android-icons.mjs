import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const source = resolve("resources", "icon.svg");

const webOutputs = [
  ["public/icons/icon-192.png", 192],
  ["public/icons/icon-256.png", 256],
  ["public/icons/icon-512.png", 512]
];

const androidOutputs = [
  ["android/app/src/main/res/mipmap-mdpi/ic_launcher.png", 48],
  ["android/app/src/main/res/mipmap-hdpi/ic_launcher.png", 72],
  ["android/app/src/main/res/mipmap-xhdpi/ic_launcher.png", 96],
  ["android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png", 144],
  ["android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png", 192],
  ["android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png", 108],
  ["android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png", 162],
  ["android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png", 216],
  ["android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png", 324],
  ["android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png", 432],
  ["android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png", 48],
  ["android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png", 72],
  ["android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png", 96],
  ["android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png", 144],
  ["android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png", 192]
];

const outputs = [...webOutputs];

try {
  await access(resolve("android", "app", "src", "main", "res"));
  outputs.push(...androidOutputs);
} catch {
  console.log("Android project not found yet; generated web icons only.");
}

for (const [relativePath, size] of outputs) {
  const target = resolve(relativePath);
  await mkdir(dirname(target), { recursive: true });
  await sharp(source).resize(size, size).png().toFile(target);
}

const icoPng = await readFile(resolve("public/icons/icon-256.png"));
const icoHeader = Buffer.alloc(22);
icoHeader.writeUInt16LE(0, 0);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(1, 4);
icoHeader.writeUInt8(0, 6);
icoHeader.writeUInt8(0, 7);
icoHeader.writeUInt8(0, 8);
icoHeader.writeUInt8(0, 9);
icoHeader.writeUInt16LE(1, 10);
icoHeader.writeUInt16LE(32, 12);
icoHeader.writeUInt32LE(icoPng.length, 14);
icoHeader.writeUInt32LE(22, 18);
await writeFile(resolve("public/icons/agro.ico"), Buffer.concat([icoHeader, icoPng]));

console.log(`Generated ${outputs.length} mobile icon assets.`);
