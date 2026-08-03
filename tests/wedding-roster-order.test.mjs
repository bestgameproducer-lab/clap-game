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
    /localeCompare\(b\.name, 'zh-CN'\)/,
  ]) assert.match(helper, expectation);
  assert.match(helper, /Number\(a\.active === false\) - Number\(b\.active === false\)/);
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
