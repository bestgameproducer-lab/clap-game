import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('shared staff ordering puts the couple first, followed by wedding groups', async () => {
  const helper = await read('../lib/wedding-roster-order.ts');
  for (const expectation of [
    /principalLabel\.includes\('新郎'\)\) return 0/,
    /principalLabel\.includes\('新娘'\)\) return 1/,
    /team === '家人组'\) return 3/,
    /team === '海岛组'\) return 4/,
    /team === '沙漠组'\) return 5/,
    /weddingRosterNameSortKey\(a\)\.localeCompare\(weddingRosterNameSortKey\(b\), 'zh-CN'\)/,
  ]) assert.match(helper, expectation);
  assert.match(helper, /Number\(a\.active === false\) - Number\(b\.active === false\)/);
  assert.match(helper, /name\.startsWith\('姚刚'\)/);
  assert.match(helper, /name\.startsWith\('金晓峰'\)/);
});

test('registration roster applies the same forward-only order', async () => {
  const migration = await read('../supabase/migrations/202608020006_sort_registration_roster_by_wedding_role.sql');
  assert.match(migration, /create or replace function registration_guest_list/);
  assert.match(migration, /participation_mode='PRINCIPAL' and g\.relationship='新郎' then 0/);
  assert.match(migration, /participation_mode='PRINCIPAL' and g\.relationship='新娘' then 1/);
  assert.match(migration, /g\.team='家人组' then 3/);
  assert.match(migration, /g\.team='海岛组' then 4/);
  assert.match(migration, /g\.team='沙漠组' then 5/);
  assert.match(migration, /g\.active and g\.uses_app/);
  assert.doesNotMatch(migration, /delete from|truncate|drop table|update guests/i);
});

test('the forward-only family adjustment exchanges only Gang Yao and Xiaofeng Jin', async () => {
  const migration = await read('../supabase/migrations/202608020007_swap_family_roster_positions.sql');
  assert.match(migration, /g\.team='家人组' and g\.name like '姚刚%'/);
  assert.match(migration, /regexp_replace\(g\.name,'\^姚刚','金晓峰'\)/);
  assert.match(migration, /g\.team='家人组' and g\.name like '金晓峰%'/);
  assert.match(migration, /regexp_replace\(g\.name,'\^金晓峰','姚刚'\)/);
  assert.doesNotMatch(migration, /delete from|truncate|drop table|update guests/i);
});

test('registration and roster-owning staff data surfaces consume the wedding roster order', async () => {
  const [registration, admin, host] = await Promise.all([
    read('../lib/data/registration.ts'),
    read('../lib/data/admin.ts'),
    read('../lib/data/host.ts'),
  ]);
  assert.match(registration, /permittedOrder/);
  assert.match(admin, /compareWeddingGuests/);
  assert.match(host, /compareWeddingGuests/);
});
