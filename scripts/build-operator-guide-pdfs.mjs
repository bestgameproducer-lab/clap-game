import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const outputDir = path.join(root, "output", "guides");
const screenshotDir = path.join(root, "docs", "assets", "operator-guides");

const guides = [
  {
    source: "docs/host-operator-guide.md",
    output: "主持人流程台使用指南.pdf",
    eyebrow: "BALI WEDDING · LIVE OPERATIONS",
    images: {
      "页面四个入口": ["23-host-console.png"],
      "环节一：宾客签到": ["02-invitation-gate.png", "05-selfie-required.png", "07-card-revealed.png", "07b-trickster-card-reveal.png"],
      "环节二：等待仪式": ["08-round-one-task.png"],
      "环节三：婚礼仪式": ["10-ceremony-pause.png"],
      "环节五：婚宴前奏": ["11-awakening-notice.png"],
      "环节六：婚宴开始": ["13-dinner-menu.png"],
      "团队结算与线索发放": ["12e-team-score-clue-reward.png"],
      "环节八：最终投票": ["16-final-vote.png"],
      "环节九：身份揭晓、积分与颁奖": ["23b-host-published-results.png", "17-guest-results.png"],
    },
  },
  {
    source: "docs/admin-operator-guide.md",
    output: "主办方后台使用指南.pdf",
    eyebrow: "BALI WEDDING · CONTROL CENTER",
    images: {
      "后台四个主入口": ["20-admin-opening.png"],
      "婚礼当天开场前 60 分钟": ["20-admin-opening.png"],
      "环节一：宾客签到": ["02-invitation-gate.png", "05-selfie-required.png", "07-card-revealed.png", "07b-trickster-card-reveal.png"],
      "环节二：等待仪式与第一轮执行": ["24-station-review.png", "08-round-one-task.png"],
      "环节三：婚礼仪式": ["10-ceremony-pause.png"],
      "环节五：婚宴前奏与第二轮派发": ["21-admin-live-flow.png", "11-awakening-notice.png"],
      "环节六：婚宴开始": ["13-dinner-menu.png"],
      "团队积分结算并发放线索": ["12e-team-score-clue-reward.png"],
      "环节八：最终投票": ["22-admin-finale.png", "16-final-vote.png"],
      "环节九：身份揭晓、最终积分与奖项": ["22b-admin-published-results.png", "17-guest-results.png"],
    },
  },
];

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function inline(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

async function imageData(filename) {
  const file = path.join(screenshotDir, filename);
  const data = await fs.readFile(file);
  return `data:image/png;base64,${data.toString("base64")}`;
}

async function markdownToHtml(markdown, imageMap) {
  const lines = markdown.split(/\r?\n/);
  const output = [];
  let list = null;
  const closeList = () => {
    if (list) output.push(`</${list}>`);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const ordered = /^\d+\.\s+(.+)$/.exec(line);
    const bullet = /^-\s+(.+)$/.exec(line);

    if (!line) {
      closeList();
      continue;
    }
    if (heading) {
      closeList();
      const level = heading[1].length;
      const text = heading[2];
      output.push(`<h${level}>${inline(text)}</h${level}>`);
      const filenames = imageMap[text] ?? [];
      if (filenames.length) {
        output.push(`<div class="figure-grid ${filenames.length === 1 ? "single" : "multiple"}">`);
        for (const filename of filenames) {
          output.push(`<figure><img src="${await imageData(filename)}" alt="${escapeHtml(text)}真实页面截图"><figcaption>${escapeHtml(text)} · 真实页面示例</figcaption></figure>`);
        }
        output.push("</div>");
      }
      continue;
    }
    if (ordered || bullet) {
      const nextList = ordered ? "ol" : "ul";
      if (list !== nextList) {
        closeList();
        list = nextList;
        output.push(`<${list}>`);
      }
      output.push(`<li>${inline((ordered ?? bullet)[1])}</li>`);
      continue;
    }
    closeList();
    output.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return output.join("\n");
}

function documentHtml(body, eyebrow) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
    @page { size: Letter; margin: 16mm 17mm 17mm; }
    * { box-sizing: border-box; }
    html { color: #332b27; font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; }
    body { margin: 0; font-size: 10.5pt; line-height: 1.62; }
    body::before { content: "${eyebrow}"; display: block; color: #a56f43; font: 700 8pt/1.2 Arial, sans-serif; letter-spacing: .12em; margin-bottom: 8mm; }
    h1 { color: #4f3028; font-size: 25pt; line-height: 1.15; margin: 0 0 8mm; padding-bottom: 5mm; border-bottom: 2px solid #c7a66a; }
    h2 { color: #663e34; font-size: 16pt; line-height: 1.25; margin: 9mm 0 4mm; break-after: avoid; }
    h3 { color: #4f3028; font-size: 12pt; margin: 6mm 0 2mm; break-after: avoid; }
    p { margin: 0 0 3mm; orphans: 3; widows: 3; break-inside: avoid; }
    h1 + p { background: #60473e; color: white; border-radius: 5mm; padding: 5mm 6mm; font-size: 12pt; }
    ol, ul { margin: 2mm 0 5mm; padding-left: 7mm; break-inside: avoid; }
    li { margin: 0 0 2.5mm; padding-left: 1mm; break-inside: avoid; }
    strong { color: #5e382e; }
    code { font: 600 9.5pt ui-monospace, SFMono-Regular, Menlo, monospace; background: #f3ece6; border-radius: 2mm; padding: 1mm 2mm; }
    .figure-grid { display: grid; gap: 4mm; margin: 5mm 0 7mm; break-inside: avoid; }
    .figure-grid.multiple { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .figure-grid.multiple figure:nth-child(3):last-child { grid-column: 1 / -1; width: 48%; justify-self: center; }
    figure { margin: 0; padding: 3mm; border: 1px solid #dfcfc4; border-radius: 5mm; background: #fbf7f2; break-inside: avoid; }
    img { display: block; width: 100%; max-height: 112mm; object-fit: contain; object-position: top center; border-radius: 3mm; }
    .figure-grid.multiple img { max-height: 94mm; }
    figcaption { margin-top: 2mm; color: #806d63; font-size: 8.5pt; text-align: center; }
    h2:not(:first-of-type) { border-top: 1px solid #e7d8ce; padding-top: 5mm; }
    @media print { a { color: inherit; text-decoration: none; } }
  </style></head><body>${body}</body></html>`;
}

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const guide of guides) {
    const markdown = await fs.readFile(path.join(root, guide.source), "utf8");
    const content = await markdownToHtml(markdown, guide.images);
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1 });
    await page.setContent(documentHtml(content, guide.eyebrow), { waitUntil: "load" });
    await page.emulateMedia({ media: "print" });
    await page.pdf({
      path: path.join(outputDir, guide.output),
      format: "Letter",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div style="font:8px Arial;color:#8a776e;width:100%;text-align:right;padding-right:17mm">ZIMIN &amp; ANRONG · WEDDING MISSION</div>',
      footerTemplate: '<div style="font:8px Arial;color:#8a776e;width:100%;text-align:center"><span class="pageNumber"></span></div>',
      margin: { top: "16mm", right: "17mm", bottom: "17mm", left: "17mm" },
    });
    await page.close();
    process.stdout.write(`${path.join(outputDir, guide.output)}\n`);
  }
} finally {
  await browser.close();
}
