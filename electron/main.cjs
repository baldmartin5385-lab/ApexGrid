const { app, BrowserWindow, session } = require("electron");
const path = require("node:path");

const MAP_SERVICE_URLS = [
  "https://tile.openstreetmap.org/*",
  "https://basemaps.cartocdn.com/*",
  "https://server.arcgisonline.com/*",
  "https://tile.openmaps.fr/*",
  "https://nominatim.openstreetmap.org/*",
  "https://overpass-api.de/*",
  "https://router.project-osrm.org/*",
];
const MAP_USER_AGENT =
  "ApexGridSimulator/2.0 (+https://github.com/baldmartin5385-lab/ApexGrid)";

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0b1014",
    title: "ApexGrid",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: MAP_SERVICE_URLS },
    (details, callback) => {
      callback({
        requestHeaders: {
          ...details.requestHeaders,
          "User-Agent": MAP_USER_AGENT,
        },
      });
    },
  );
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
