#!/usr/bin/env node
/**
 * Screenshot each slide at desktop size and assemble a WYSIWYG PDF
 * with clickable link annotations. Matches the on-screen deck.
 *
 * Usage: npm run pdf
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { PDFDocument, PDFString } from 'pdf-lib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 'index.html');
const outPath = path.join(root, 'MiJory-Wellness-Investor-Deck.pdf');

const SLIDE_W = 1440;
const SLIDE_H = 810;
const SCALE = 2;

/** Bump the deck footer "Updated …" stamp so web + PDF share the same version time. */
function stampDeckUpdated() {
  const now = new Date();

  // Chicago wall-clock parts for a stable meta value
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'longOffset',
    })
      .formatToParts(now)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value])
  );
  // timeZoneName like "GMT-05:00"
  const offset = (parts.timeZoneName || 'GMT-05:00').replace(/^GMT/, '') || '-05:00';
  const metaContent = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}${offset}`;

  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(now)
    .replace(/\u202f/g, ' ');
  const stampLabel = `Updated ${label} CT`;

  let html = fs.readFileSync(indexPath, 'utf8');
  if (/<meta name="deck-updated"/.test(html)) {
    html = html.replace(
      /<meta name="deck-updated" content="[^"]*"/,
      `<meta name="deck-updated" content="${metaContent}"`
    );
  } else {
    html = html.replace(
      /<meta name="viewport"[^>]*>/,
      (m) => `${m}\n    <meta name="deck-updated" content="${metaContent}">`
    );
  }
  if (/class="deck-updated"/.test(html)) {
    html = html.replace(
      /<span class="deck-updated">[^<]*<\/span>/g,
      `<span class="deck-updated">${stampLabel}</span>`
    );
  }
  fs.writeFileSync(indexPath, html);
  console.log(`Stamped deck updated: ${stampLabel}`);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const rel = urlPath === '/' ? '/index.html' : urlPath;
      const filePath = path.normalize(path.join(root, rel));
      if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

function addLinkAnnotation(pdfDoc, pdfPage, { href, x, y, w, h }) {
  const context = pdfDoc.context;
  const annot = context.register(
    context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [x, y, x + w, y + h],
      Border: [0, 0, 0],
      A: {
        Type: 'Action',
        S: 'URI',
        URI: PDFString.of(href),
      },
    })
  );
  pdfPage.node.addAnnot(annot);
}

async function main() {
  stampDeckUpdated();
  const { server, port } = await startServer();
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: SLIDE_W + 80,
      height: SLIDE_H + 120,
      deviceScaleFactor: SCALE,
    });
    await page.emulateMediaType('screen');
    await page.goto(`http://127.0.0.1:${port}/index.html`, {
      waitUntil: 'networkidle0',
      timeout: 120000,
    });
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    });

    // Capture desktop screen layout (not print/mobile CSS)
    await page.addStyleTag({
      content: `
        body {
          background: #ffffff !important;
          padding: 0 !important;
          gap: 0 !important;
          margin: 0 !important;
          align-items: stretch !important;
        }
        .slide-container {
          width: ${SLIDE_W}px !important;
          max-width: ${SLIDE_W}px !important;
          height: ${SLIDE_H}px !important;
          margin: 0 !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          flex-shrink: 0 !important;
          overflow: hidden !important;
        }
      `,
    });
    await new Promise((r) => setTimeout(r, 400));

    const slideCount = await page.$$eval('.slide-container', (els) => els.length);
    const pdfDoc = await PDFDocument.create();
    let totalLinks = 0;

    for (let i = 0; i < slideCount; i++) {
      const handle = (await page.$$('.slide-container'))[i];
      await handle.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await new Promise((r) => setTimeout(r, 80));

      const shot = await handle.screenshot({ type: 'png' });
      const links = await handle.evaluate((el) => {
        const slideRect = el.getBoundingClientRect();
        return [...el.querySelectorAll('a[href]')]
          .map((a) => {
            const href = a.href;
            if (!href || href.startsWith('javascript:')) return null;
            const r = a.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) return null;
            return {
              href,
              x: r.left - slideRect.left,
              y: r.top - slideRect.top,
              w: Math.min(r.width, slideRect.width - (r.left - slideRect.left)),
              h: Math.min(r.height, slideRect.height - (r.top - slideRect.top)),
            };
          })
          .filter(Boolean);
      });

      const png = await pdfDoc.embedPng(shot);
      const pdfPage = pdfDoc.addPage([SLIDE_W, SLIDE_H]);
      pdfPage.drawImage(png, { x: 0, y: 0, width: SLIDE_W, height: SLIDE_H });

      for (const link of links) {
        addLinkAnnotation(pdfDoc, pdfPage, {
          href: link.href,
          x: link.x,
          y: SLIDE_H - link.y - link.h,
          w: link.w,
          h: link.h,
        });
        totalLinks += 1;
      }

      process.stdout.write(`\rCaptured slide ${i + 1}/${slideCount}`);
    }
    process.stdout.write('\n');

    const bytes = await pdfDoc.save({ useObjectStreams: false });
    fs.writeFileSync(outPath, bytes);
    console.log(`Wrote ${outPath}`);
    console.log(
      `Slides: ${slideCount} | Links: ${totalLinks} | Size: ${(bytes.length / (1024 * 1024)).toFixed(2)} MB`
    );
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
