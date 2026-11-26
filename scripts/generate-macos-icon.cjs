const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

if (process.platform !== "darwin") {
  throw new Error("The macOS app icon can only be generated on macOS.");
}

const root = path.resolve(__dirname, "..");
const source = path.join(root, "public", "icons", "icon-1024.png");
const iconsetRoot = fs.mkdtempSync(path.join(os.tmpdir(), "apexgrid-icon-"));
const iconset = path.join(iconsetRoot, "ApexGrid.iconset");
const output = path.join(root, "electron", "icon.icns");
fs.mkdirSync(iconset);

const sizes = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024],
];

try {
  for (const [filename, size] of sizes) {
    execFileSync(
      "sips",
      ["-z", String(size), String(size), source, "--out", path.join(iconset, filename)],
      { stdio: "inherit" },
    );
  }
  execFileSync("iconutil", ["-c", "icns", iconset, "-o", output], { stdio: "inherit" });
} finally {
  fs.rmSync(iconsetRoot, { recursive: true, force: true });
}
