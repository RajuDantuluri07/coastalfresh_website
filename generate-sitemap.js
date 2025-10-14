﻿﻿﻿﻿const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// --- SECURITY FIX: Load credentials securely from environment variables ---
// In your deployment environment (like Vercel, Netlify, etc.), create an
// environment variable named `GOOGLE_APPLICATION_CREDENTIALS_JSON` and
// paste the entire content of your `serviceAccountKey.json` file as its value.
let serviceAccount;
if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
  try {
    serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  } catch (e) {
    console.error('Error parsing GOOGLE_APPLICATION_CREDENTIALS_JSON:', e);
    process.exit(1);
  }
} else {
  // Fallback for local development (ensure serviceAccountKey.json is in .gitignore)
  console.warn("Using local 'serviceAccountKey.json'. For production, use environment variables.");
  serviceAccount = require('./serviceAccountKey.json');
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// Basic pages — extend these if you want
const pages = [
  { loc: '/', changefreq: 'daily', priority: '1.0' },
  { loc: '/catalog', changefreq: 'weekly', priority: '0.9' },
  { loc: '/about-us', changefreq: 'monthly', priority: '0.7' },
  { loc: '/contact-us', changefreq: 'monthly', priority: '0.7' },
  { loc: '/profile', changefreq: 'monthly', priority: '0.5' },
  { loc: '/refer', changefreq: 'monthly', priority: '0.5' },
];

/**
 * Escapes special characters in a string for use in XML.
 * @param {string} unsafe The string to escape.
 * @returns {string} The escaped string.
 */
function escapeXml(unsafe) {
  // FIX: Ensure the input is a string before trying to replace.
  // If it's not a string (e.g., it's a URL in the caption field), return an empty string.
  if (typeof unsafe !== 'string') {
    return '';
  }
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
      // FIX: Use the current date for lastmod, not a future date.
      const today = new Date().toISOString().split('T')[0];
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
