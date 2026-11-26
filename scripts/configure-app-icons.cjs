const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const publicIcons = path.join(root, "public", "icons");
const generatedIcons = path.join(__dirname, "generated-icons");

function configureAndroid() {
  const resourceRoot = path.join(root, "android", "app", "src", "main", "res");
  if (!fs.existsSync(resourceRoot)) {
    throw new Error("Capacitor Android resources are missing. Run cap add android first.");
  }

  const densities = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];
  for (const density of densities) {
    const destination = path.join(resourceRoot, `mipmap-${density}`);
    if (!fs.existsSync(destination)) {
      throw new Error(`Generated Android mipmap resources are missing: ${destination}`);
    }

    fs.copyFileSync(
      path.join(generatedIcons, `android-${density}.png`),
      path.join(destination, "ic_launcher.png"),
    );
    fs.copyFileSync(
      path.join(generatedIcons, `android-${density}.png`),
      path.join(destination, "ic_launcher_round.png"),
    );
    fs.copyFileSync(
      path.join(generatedIcons, `android-foreground-${density}.png`),
      path.join(destination, "ic_launcher_foreground.png"),
    );
  }

  fs.writeFileSync(
    path.join(resourceRoot, "values", "ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#C42E2D</color>
</resources>
`,
  );
}

function configureIOS() {
  const appIconSet = path.join(
    root,
    "ios",
    "App",
    "App",
    "Assets.xcassets",
    "AppIcon.appiconset",
  );
  if (!fs.existsSync(appIconSet)) {
    throw new Error("Capacitor iOS AppIcon asset set is missing. Run cap add ios first.");
  }

  fs.copyFileSync(
    path.join(publicIcons, "icon-1024.png"),
    path.join(appIconSet, "AppIcon.png"),
  );
  fs.writeFileSync(
    path.join(appIconSet, "Contents.json"),
    `${JSON.stringify({
      images: [
        {
          filename: "AppIcon.png",
          idiom: "universal",
          platform: "ios",
          size: "1024x1024",
        },
      ],
      info: { author: "xcode", version: 1 },
    }, null, 2)}\n`,
  );
}

const targets = process.argv.slice(2);
if (targets.length === 0 || targets.some((target) => !["android", "ios"].includes(target))) {
  throw new Error("Usage: node scripts/configure-app-icons.cjs <android|ios> [ios]");
}

for (const target of targets) {
  if (target === "android") configureAndroid();
  else configureIOS();
}
