﻿const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// --- IMPORTANT: Create this file for your service account credentials ---
// See instructions below on how to get this file.
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// Basic pages — extend these if you want
const pages = [
  { loc: '/', changefreq: 'daily', priority: '1.0' },
  { loc: '/catalog', changefreq: 'weekly', priority: '0.9' },
  { loc: '/about', changefreq: 'monthly', priority: '0.6' },
  { loc: '/faq', changefreq: 'monthly', priority: '0.6' },
  { loc: '/refer', changefreq: 'monthly', priority: '0.5' },
];

/**
 * Escapes special characters in a string for use in XML.
 * @param {string} unsafe The string to escape.
 * @returns {string} The escaped string.
 */
function escapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&'"]/g, c => {
    return { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c];
  });
}

async function generateSitemap() {
  try {
    // --- NEW: Fetch products directly from Firestore ---
    const productsSnapshot = await db.collection('products').get();
    productsSnapshot.forEach(doc => {
      const product = doc.data();
      if (product && product.name && product.id) {
        // Use the exact same slug generation logic as the main application (ui.js)
        const namePart = product.name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
        const slug = `${namePart}-${product.id}`;
        
        // NEW: Add image information for product pages
        const pageData = { loc: `/product/${slug}`, changefreq: 'weekly', priority: '0.8' };
        if (product.image) {
          pageData.image = {
            loc: product.image,
            title: product.name || '',
            caption: product.desc || ''
          };
        }
        pages.push(pageData);
      }
    });

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${pages.map(page => {
      const today = new Date().toISOString().split("T")[0];
      const imageTag = page.image ? `
    <image:image>
      <image:loc>${escapeXml(page.image.loc)}</image:loc>
      <image:title>${escapeXml(page.image.title)}</image:title>
      <image:caption>${escapeXml(page.image.caption)}</image:caption>
    </image:image>` : '';

      return `  <url>
    <loc>https://coastalfresh.in${page.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
${imageTag}
  </url>`;
    }).join('\n')}
</urlset>`;

    // ensure public folder exists
    const outDir = path.join(__dirname, 'public');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'sitemap.xml'), sitemap, 'utf8');
    console.log('✅ sitemap.xml generated successfully from Firestore at', path.join(outDir, 'sitemap.xml'));

  } catch (err) {
    console.error('❌ Error generating sitemap.xml:', err);
    process.exit(1);
  }
}

generateSitemap();
