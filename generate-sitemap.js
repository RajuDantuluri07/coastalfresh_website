const fs = require('fs');
const path = require('path');

// Basic pages — extend these if you want
const pages = [
  { loc: '/', changefreq: 'daily', priority: '1.0' },
  { loc: '/catalog', changefreq: 'weekly', priority: '0.9' },
  { loc: '/about', changefreq: 'monthly', priority: '0.6' },
  { loc: '/faq', changefreq: 'monthly', priority: '0.6' },
  { loc: '/refer', changefreq: 'monthly', priority: '0.5' },
];

// --- IMPROVEMENT: Dynamically generate product slugs from products.json ---
try {
  const productsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'products.json'), 'utf8'));
  productsData.forEach(product => {
    const namePart = product.name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
    const slug = `${namePart}-${product.id}`;
    pages.push({ loc: `/product/${slug}`, changefreq: 'weekly', priority: '0.8' });
  });
} catch (error) {
  console.error('❌ Could not read products.json to generate product URLs:', error);
}

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
}).join('\n')}
</urlset>`;

try {
  // ensure public folder exists
  const outDir = path.join(__dirname, 'public');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'sitemap.xml'), sitemap, 'utf8');
  console.log('✅ sitemap.xml generated successfully at', path.join(outDir, 'sitemap.xml'));
} catch (err) {
  console.error('❌ Error generating sitemap.xml:', err);
  process.exit(1);
}
