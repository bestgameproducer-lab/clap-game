import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('secret draw card grows with long mobile content instead of clipping it', async () => {
  const css = await readFile(new URL('../app/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.secret-card-scene \{[^}]*min-height:490px/);
  assert.match(css, /\.secret-card \{[^}]*min-height:490px; display:grid/);
  assert.match(css, /\.secret-card-back,\.secret-card-front \{[^}]*grid-area:1\/1; min-height:490px; position:relative/);
  assert.equal(css.includes('.secret-card-scene { width:min(350px,86vw); height:490px;'), false);
  assert.match(css, /\.secret-card-scene,\.secret-card,\.secret-card-back,\.secret-card-front\{min-height:465px\}/);
});

test('narrow mission cards constrain text and native photo controls', async () => {
  const css = await readFile(new URL('../app/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.mission-body \{ min-width:0;[^}]*\}/);
  assert.match(css, /\.mission-summary-copy>strong\{[^}]*overflow-wrap:anywhere/);
  assert.match(css, /\.evidence-controls input\[type="file"\] \{[^}]*min-width:0; max-width:100%;[^}]*overflow:hidden/);
  assert.match(css, /\.mission-summary\{grid-template-columns:30px minmax\(0,1fr\) 34px;gap:8px\}/);
  assert.match(css, /\.mission-chevron\{width:34px;height:34px\}/);
});

test('host resource summary stays horizontal instead of inheriting the circular badge', async () => {
  const css = await readFile(new URL('../app/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.host-resource-card \.section-heading>span\{width:auto;height:auto;[^}]*white-space:nowrap\}/);
  assert.match(css, /@media\(max-width:560px\)/);
  assert.match(css, /\.resource-balance-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
  assert.match(css, /\.host-status-grid,\.host-vote-summary\{grid-template-columns:1fr 1fr\}/);
});

test('spy reveal dossiers collapse safely on narrow scoreboard screens', async () => {
  const css = await readFile(new URL('../app/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.spy-dossier-grid \{[^}]*minmax\(250px,1fr\)/);
  assert.match(css, /\.spy-dossier \{ min-width:0;/);
  assert.match(css, /\.spy-dossier header>div>strong \{[^}]*overflow-wrap:anywhere/);
  assert.match(css, /\.spy-dossier-grid\{grid-template-columns:1fr\}\.spy-dossier\{padding:15px\}/);
});
