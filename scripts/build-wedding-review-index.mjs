import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('review_pack_directory_required');

async function listPngs(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listPngs(path));
    else if (entry.name.endsWith('.png')) files.push(path);
  }
  return files;
}

function titleFor(path) {
  return path.split('/').pop().replace(/\.png$/, '').replace(/^\d+-/, '').replaceAll('-', ' ');
}

const manifestPath = join(root, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const screenshots = (await listPngs(root))
  .map((path) => relative(root, path).replaceAll('\\', '/'))
  .sort();

const rows = screenshots.map((path) => {
  const item = manifest.steps.find((step) => path.endsWith(`${step.file}.png`));
  return {
    path,
    title: item?.title ?? titleFor(path),
    description: item?.description ?? '',
    surface: item?.surface ?? path.split('/')[0],
    order: item ? manifest.steps.indexOf(item) : Number.MAX_SAFE_INTEGER,
  };
}).sort((left, right) => left.order - right.order || left.path.localeCompare(right.path));

const markdown = [
  '# 婚礼全流程截图验收包',
  '',
  `生成时间：${manifest.generatedAt}`,
  '',
  '这套截图使用隔离的确定性测试数据渲染真实应用页面，不连接或修改生产 Supabase。',
  '',
  ...rows.flatMap((row, index) => [
    `## ${String(index + 1).padStart(2, '0')} · ${row.title}`,
    '',
    row.description,
    '',
    `![${row.title}](${row.path})`,
    '',
  ]),
].join('\n');

const cards = rows.map((row, index) => `<article><div class="meta"><span>${String(index + 1).padStart(2, '0')}</span><small>${row.surface}</small></div><h2>${row.title}</h2><p>${row.description}</p><a href="${row.path}" target="_blank"><img src="${row.path}" alt="${row.title}" loading="lazy"></a></article>`).join('\n');
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>婚礼全流程截图验收包</title><style>body{margin:0;background:#f3ece4;color:#3e302b;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}header{padding:40px max(24px,6vw);background:#4b342d;color:#fff}header h1{margin:0 0 10px;font-family:Georgia,serif;font-size:clamp(30px,5vw,58px)}header p{max-width:760px;line-height:1.7;color:#eadfd8}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:24px;padding:32px max(20px,5vw) 70px}article{background:#fffaf5;border:1px solid #dfcec2;border-radius:22px;padding:18px;box-shadow:0 12px 35px rgba(74,50,42,.08)}.meta{display:flex;justify-content:space-between;color:#9b7465}.meta span{font-family:Georgia,serif;font-size:28px}.meta small{text-transform:uppercase;letter-spacing:.14em}h2{font-size:21px;margin:10px 0}article p{min-height:48px;color:#78675f;line-height:1.6}img{display:block;width:100%;height:auto;border-radius:14px;border:1px solid #eadfd7;background:#fff}</style></head><body><header><h1>婚礼全流程截图验收包</h1><p>生成时间：${manifest.generatedAt}<br>使用隔离测试数据渲染真实页面，不连接或修改生产数据库。点击任意截图可查看原始尺寸。</p></header><main class="grid">${cards}</main></body></html>`;

await writeFile(join(root, 'README.md'), markdown);
await writeFile(join(root, 'index.html'), html);
