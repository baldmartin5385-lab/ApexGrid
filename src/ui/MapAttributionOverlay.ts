const ATTRIBUTIONS = [
  { label: "© OpenStreetMap contributors (ODbL)", href: "https://www.openstreetmap.org/copyright" },
  { label: "© CARTO", href: "https://carto.com/attributions" },
  { label: "© Esri", href: "https://www.esri.com/en-us/legal/terms/full-master-agreement" },
  { label: "© OpenTopoMap", href: "https://opentopomap.org/about" },
];

export function createMapAttributionOverlay(): HTMLDivElement {
  const badge = document.createElement("div");
  badge.className = "map-attribution";
  badge.setAttribute("aria-label", "Map data and tile provider attribution");
  for (const [index, attribution] of ATTRIBUTIONS.entries()) {
    if (index > 0) {
      const separator = document.createElement("span");
      separator.className = "map-attribution-separator";
      separator.textContent = " | ";
      badge.append(separator);
    }
    const link = document.createElement("a");
    link.href = attribution.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = attribution.label;
    badge.append(link);
  }
  return badge;
}
