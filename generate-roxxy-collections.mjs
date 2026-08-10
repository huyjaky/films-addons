import { writeFile } from "node:fs/promises";

const manifestUrl = "https://stremio.roxxy-tech.com/u/-ueKFbA4o6T4A8xuBdy0KA/manifest.json";
const manifest = await fetch(manifestUrl).then((response) => {
  if (!response.ok) throw new Error(`Manifest request failed: ${response.status}`);
  return response.json();
});

const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const source = (catalog, genre) => ({
  provider: "addon",
  addonId: manifest.id,
  type: catalog.type,
  catalogId: catalog.id,
  ...(genre ? { genre } : {}),
});
const folder = (id, title, catalog, genre) => ({
  id,
  title,
  sources: [source(catalog, genre)],
});
const javSorts = new Set(["latest updates", "new releases", "most liked", "most viewed", "most favorite"]);
const uniqueOptions = (catalog, options) => {
  const seen = new Set();
  return options.filter((option) => {
    const key = option.trim().toLowerCase();
    if ((catalog.type === "jav" && catalog.id === "genres" && javSorts.has(key)) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const streamGroups = new Map([
  ["JAV", []],
  ["HENTAI", []],
  ["PORN", []],
  ["ONLYFANS", []],
]);
const streamGroup = (type) =>
  type === "jav" ? "JAV"
    : type === "hentai" ? "HENTAI"
      : ["onlyfans", "pimpbunny"].includes(type) ? "ONLYFANS"
        : "PORN";
const collections = [];

for (const [catalogIndex, catalog] of manifest.catalogs.entries()) {
  const genre = catalog.extra?.find((extra) => extra.name === "genre");
  if (!genre?.isRequired) {
    streamGroups.get(streamGroup(catalog.type)).push(source(catalog));
    continue;
  }

  const options = uniqueOptions(catalog, genre.options ?? []);
  collections.push({
    id: `roxxy-${slug(catalog.type)}-${slug(catalog.id)}`,
    title: `${catalog.type.toUpperCase()} - ${catalog.name}`,
    pinToTop: true,
    viewMode: "TABBED_GRID",
    showAllTab: true,
    folders: options.map((option, optionIndex) =>
      folder(`option-${optionIndex}-${slug(option)}`, option, catalog, option),
    ),
  });
}

collections.unshift({
  id: "roxxy-stream",
  title: "Stream",
  pinToTop: true,
  viewMode: "TABBED_GRID",
  showAllTab: true,
  folders: [...streamGroups].map(([title, sources]) => ({
    id: `stream-${slug(title)}`,
    title,
    sources,
  })),
});

await writeFile("nuvio-roxxy-after-dark-collections.json", `${JSON.stringify(collections, null, 2)}\n`);
console.log(`Created ${collections.length} collections with ${collections.reduce((sum, item) => sum + item.folders.length, 0)} folders.`);
