const fs = require("fs");
const path = require("path");

// Basic pages — extend these if you want
const pages = [
  { loc: "/", changefreq: "daily", priority: "1.0" },
  { loc: "/catalog", changefreq: "weekly", priority: "0.9" },
  { loc: "/about", changefreq: "monthly", priority: "0.6" },
  { loc: "/faq", changefreq: "monthly", priority: "0.6" },
  { loc: "/refer", changefreq: "monthly", priority: "0.5" },
];

// Product slugs — update this list as needed
const productSlugs = [
  "white-pomfret-1","black-pomfret-2","sea-bass-3","yellowfin-tuna-4",
  "pink-perch-5","koyyinga-6","kanagadathalu-7","vanjaram-seer-8",
  "nettallu-anchovies-9","katte-parigelu-10","rohu-11","rupchand-12",
  "catla-13","korameenu-murrel-14","sea-tiger-prawns-l-15",
  "sea-tiger-prawns-m-16","sea-tiger-prawns-s-17","godavari-prawns-18",
  "freshwater-prawns-s-19","freshwater-prawns-20","freshwater-prawns-l-21",
  "live-crab-22","egg-crab-23","blue-crab-24","3-dot-crab-26",
  "prawns-pickle-27","chicken-pickle-28"
];

productSlugs.forEach(slug => {
  pages.push({ loc: `/product/${slug}`, changefreq: "weekly", priority: "0.8" });
});

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(page => {
  const today = new Date().toISOString().split("T")[0];
  return `  <url>
    <loc>https://coastalfresh.in${page.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`;
}).join("\n")}
</urlset>`;

try {
  // ensure public folder exists
  const outDir = path.join(__dirname, "public");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "sitemap.xml"), sitemap, "utf8");
  console.log("✅ sitemap.xml generated successfully at", path.join(outDir, "sitemap.xml"));
} catch (err) {
  console.error("❌ Error generating sitemap.xml:", err);
  process.exit(1);
}
