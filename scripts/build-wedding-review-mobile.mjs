import { chromium } from 'playwright';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(process.argv[2] || 'artifacts/wedding-review-pack');
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
const thumbnailsRoot = join(root, 'thumbs');
const pdfPagesRoot = join(root, '.pdf-pages');
const pdfPath = join(root, 'wedding-review-mobile.pdf');

async function listPngs(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'thumbs' || entry.name === '.pdf-pages') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listPngs(path));
    else if (entry.name.endsWith('.png')) files.push(path);
  }
  return files;
}

await rm(thumbnailsRoot, { recursive: true, force: true });
await rm(pdfPagesRoot, { recursive: true, force: true });
await mkdir(thumbnailsRoot, { recursive: true });
await mkdir(pdfPagesRoot, { recursive: true });

const screenshots = (await listPngs(root)).map((path) => {
  const item = manifest.steps.find((step) => path.endsWith(`${step.file}.png`));
  return { path, item, order: item ? manifest.steps.indexOf(item) : Number.MAX_SAFE_INTEGER };
}).sort((left, right) => left.order - right.order || left.path.localeCompare(right.path));

const browser = await chromium.launch({
  headless: true,
  ...(process.env.WEDDING_TEST_CHROME_EXECUTABLE
    ? { executablePath: process.env.WEDDING_TEST_CHROME_EXECUTABLE }
    : {}),
});
const context = await browser.newContext({ viewport: { width: 480, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const pdfPages = [];

try {
  for (const [shotIndex, shot] of screenshots.entries()) {
    const relativePng = relative(root, shot.path).replaceAll('\\', '/');
    const thumbnailPath = join(thumbnailsRoot, relativePng.replace(/\.png$/, '.jpg'));
    await mkdir(dirname(thumbnailPath), { recursive: true });
    const sourceData = await readFile(shot.path);
    await page.setContent(`<style>html,body{margin:0;background:#f5eee7}#clip{width:480px;overflow:hidden}img{display:block;width:480px;height:auto;transform-origin:top left}</style><div id="clip"><img alt="" src="data:image/png;base64,${sourceData.toString('base64')}"></div>`);
    const image = page.locator('img');
    const frame = page.locator('#clip');
    await image.waitFor({ state: 'visible' });
    await image.evaluate((element) => element.decode());
    const box = await image.boundingBox();
    if (!box) throw new Error(`screenshot_not_visible:${relativePng}`);
    await image.screenshot({ path: thumbnailPath, type: 'jpeg', quality: 68 });

    const chunkHeight = 860;
    const chunkCount = Math.ceil(box.height / chunkHeight);
    for (let part = 0; part < chunkCount; part += 1) {
      const y = part * chunkHeight;
      const height = Math.min(chunkHeight, box.height - y);
      const chunkPath = join(pdfPagesRoot, `${String(shotIndex + 1).padStart(2, '0')}-${String(part + 1).padStart(2, '0')}.jpg`);
      await frame.evaluate((element, clip) => {
        element.style.height = `${clip.height}px`;
        element.querySelector('img').style.transform = `translateY(-${clip.y}px)`;
      }, { y, height });
      await frame.screenshot({ path: chunkPath, type: 'jpeg', quality: 74 });
      pdfPages.push({
        path: chunkPath,
        title: shot.item?.title ?? relativePng,
        surface: shot.item?.surface ?? '',
        step: shotIndex + 1,
        part: part + 1,
        parts: chunkCount,
      });
    }
  }

  const pageMarkup = (await Promise.all(pdfPages.map(async (item) => {
    const imageData = await readFile(item.path);
    return `<section class="page"><header><span>${String(item.step).padStart(2, '0')} · ${item.surface}</span><strong>${item.title}</strong><small>${item.parts > 1 ? `${item.part}/${item.parts}` : ''}</small></header><div class="shot"><img src="data:image/jpeg;base64,${imageData.toString('base64')}" alt=""></div></section>`;
  }))).join('');
  const sourcePath = join(pdfPagesRoot, 'mobile-review.html');
  await writeFile(sourcePath, `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>@page{size:390px 844px;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#efe6dd;color:#3e302b;font-family:-apple-system,BlinkMacSystemFont,"Noto Sans CJK SC","Microsoft YaHei",sans-serif}.page{width:390px;height:844px;padding:18px 18px 20px;page-break-after:always;display:flex;flex-direction:column;overflow:hidden}.page:last-child{page-break-after:auto}header{height:78px;display:grid;grid-template-columns:1fr auto;align-content:center;gap:3px 12px;border-bottom:1px solid #d7c4b8;margin-bottom:14px}header span{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#9b7465}header strong{grid-column:1;font-family:Georgia,"Noto Serif CJK SC",serif;font-size:20px}header small{grid-column:2;grid-row:1/3;align-self:center;color:#9b7465}.shot{flex:1;min-height:0;display:flex;align-items:flex-start;justify-content:center}.shot img{display:block;max-width:100%;max-height:100%;object-fit:contain;border-radius:12px;box-shadow:0 8px 24px rgba(74,50,42,.12)}</style></head><body>${pageMarkup}</body></html>`);
  await page.goto(pathToFileURL(sourcePath).href);
  await page.pdf({ path: pdfPath, width: '390px', height: '844px', printBackground: true, preferCSSPageSize: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
} finally {
  await browser.close();
  await rm(pdfPagesRoot, { recursive: true, force: true });
}

console.log(`Mobile review PDF: ${pdfPath}`);
