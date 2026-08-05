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
    thumbnail: `thumbs/${path.replace(/\.png$/, '.jpg')}`,
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

const cards = rows.map((row, index) => `<article id="step-${index + 1}"><div class="meta"><span>${String(index + 1).padStart(2, '0')}</span><small>${row.surface}</small></div><h2>${row.title}</h2><p>${row.description}</p><a href="${row.path}" target="_blank"><img src="${row.thumbnail}" alt="${row.title}" loading="lazy" decoding="async"></a></article>`).join('\n');
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>婚礼全流程截图验收包</title><style>*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f3ece4;color:#3e302b;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}header{padding:36px max(20px,6vw);background:#4b342d;color:#fff}header h1{margin:0 0 10px;font-family:Georgia,serif;font-size:clamp(30px,5vw,58px)}header p{max-width:760px;line-height:1.7;color:#eadfd8}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}.actions a{display:inline-flex;min-height:44px;align-items:center;padding:0 18px;border-radius:999px;background:#fff8f2;color:#4b342d;text-decoration:none;font-weight:700}.jump{position:sticky;top:0;z-index:5;display:flex;gap:8px;overflow:auto;padding:10px max(14px,5vw);background:rgba(243,236,228,.94);backdrop-filter:blur(14px);border-bottom:1px solid #dfcec2}.jump a{white-space:nowrap;border:1px solid #d5beb0;border-radius:999px;padding:9px 13px;color:#60483f;text-decoration:none}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:24px;padding:32px max(20px,5vw) 70px}article{background:#fffaf5;border:1px solid #dfcec2;border-radius:22px;padding:18px;box-shadow:0 12px 35px rgba(74,50,42,.08);scroll-margin-top:70px}.meta{display:flex;justify-content:space-between;color:#9b7465}.meta span{font-family:Georgia,serif;font-size:28px}.meta small{text-transform:uppercase;letter-spacing:.14em}h2{font-size:21px;margin:10px 0}article p{min-height:48px;color:#78675f;line-height:1.6}img{display:block;width:100%;height:auto;border-radius:14px;border:1px solid #eadfd7;background:#fff}@media(max-width:600px){header{padding:28px 18px 24px}.grid{display:block;padding:16px 12px 48px}article{margin-bottom:16px;padding:14px;border-radius:18px}article p{min-height:0}.jump{padding-left:12px}.actions a{width:100%;justify-content:center}}</style></head><body><header><h1>婚礼全流程截图验收包</h1><p>生成时间：${manifest.generatedAt}<br>使用隔离测试数据渲染真实页面，不连接或修改生产数据库。网页默认加载轻量预览，点击图片可查看原始高清截图。</p><div class="actions"><a href="wedding-review-mobile.pdf">打开手机 PDF</a><a href="README.md">查看文字目录</a></div></header><nav class="jump" aria-label="快速跳转"><a href="#step-1">宾客入口</a><a href="#step-8">任务流程</a><a href="#step-14">身份与终局</a><a href="#step-18">工作人员端</a></nav><main class="grid">${cards}</main></body></html>`;

await writeFile(join(root, 'README.md'), markdown);
await writeFile(join(root, 'index.html'), html);
