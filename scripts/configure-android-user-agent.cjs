const fs = require("node:fs");
const path = require("node:path");

const sourceRoot = path.resolve(__dirname, "..", "android", "app", "src", "main", "java");
const marker = "ApexGridSimulator/2.0";

function findMainActivity(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = findMainActivity(target);
      if (nested) return nested;
    } else if (entry.name === "MainActivity.java") {
      return target;
    }
  }
  return null;
}

if (!fs.existsSync(sourceRoot)) {
  throw new Error("Capacitor Android sources are missing. Run cap add android first.");
}

const activityPath = findMainActivity(sourceRoot);
if (!activityPath) throw new Error("Generated Capacitor MainActivity.java was not found.");

let source = fs.readFileSync(activityPath, "utf8");
if (source.includes(marker)) process.exit(0);

const emptyActivity = /public\s+class\s+MainActivity\s+extends\s+BridgeActivity\s*\{\s*\}/;
if (!emptyActivity.test(source)) {
  throw new Error("Unexpected Capacitor MainActivity template; refusing to patch it blindly.");
}

source = source.replace(
  emptyActivity,
  `public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        android.webkit.WebSettings settings = bridge.getWebView().getSettings();
        String currentAgent = settings.getUserAgentString();
        if (!currentAgent.contains("${marker}")) {
            settings.setUserAgentString(currentAgent + " ${marker} (+https://github.com/baldmartin5385-lab/ApexGrid)");
        }
    }
}`,
);
fs.writeFileSync(activityPath, source, "utf8");
