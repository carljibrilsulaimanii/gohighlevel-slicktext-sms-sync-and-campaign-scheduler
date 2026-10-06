// custom-code.test.mjs
// ---------------------------------------------------------------------------
// Author:  Jibril Sulaiman
// Date:    2026-10-06
// Deploy:  Local only: `npm test`. Never pasted into GoHighLevel.
// What:    Runs both GHL custom code files the way GHL does (wrapped in an async
//          function, with inputData and, for the search, a fake customRequest), and
//          checks the outputs, including the Eastern-to-UTC offset on both sides of DST.
// Why:     GHL's "Test Your Code" can't see custom values, so a wrong offset or a
//          broken output name otherwise only shows up as a campaign sent at the
//          wrong hour.
// ---------------------------------------------------------------------------
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = (f) => readFileSync(new URL(`../ghl-custom-code/${f}`, import.meta.url), 'utf8');

// GHL wraps the code in an async function; the schedule code assigns `output`,
// the search code returns its object.
async function runGhl(source, inputData, customRequest) {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const fn = new AsyncFunction('inputData', 'customRequest', `let output; const __r = await (async () => { ${source} })(); return __r !== undefined ? __r : output;`);
  return JSON.parse(JSON.stringify(await fn(inputData, customRequest)));
}

test('winter class: Eastern Standard Time is UTC-5', async () => {
  const out = await runGhl(load('campaign-send-times.js'), { class_date_et: '2026-02-12' });
  assert.equal(out.class_date_et, '2026-02-12');
  assert.equal(out.et_1, '2026-02-11 10:00:00');
  assert.equal(out.utc_1, '2026-02-11 15:00:00');
  assert.equal(out.utc_4, '2026-02-12 23:45:00');
  assert.equal(out.utc_5, '2026-02-13 01:30:00');   // 8:30pm ET is the next day in UTC
  assert.equal(out.utc_9, '2026-02-14 15:00:00');
});

test('summer class: Eastern Daylight Time is UTC-4', async () => {
  const out = await runGhl(load('campaign-send-times.js'), { class_date_et: '2026-07-16 19:00:00' });
  assert.equal(out.class_date_et, '2026-07-16');
  assert.equal(out.utc_2, '2026-07-16 14:00:00');
  assert.equal(out.utc_8, '2026-07-17 22:50:00');
});

test('a class right after the spring DST change uses the new offset', async () => {
  const out = await runGhl(load('campaign-send-times.js'), { class_date_et: '2026-03-08' });
  assert.equal(out.utc_1, '2026-03-07 15:00:00');   // day before: still EST
  assert.equal(out.utc_2, '2026-03-08 14:00:00');   // class day: EDT
});

test('a missing class date fails loudly', async () => {
  await assert.rejects(runGhl(load('campaign-send-times.js'), {}), /Missing inputData.class_date_et/);
});

test('search: a found contact returns exists=true and its id as a string', async () => {
  let called;
  const customRequest = {
    get: async (url, opts) => {
      called = { url, opts };
      return { data: { data: [{ contact_id: 123456, first_name: 'Alex', last_name: 'Rivera', opt_in_status: 'subscribed' }] } };
    },
  };
  const out = await runGhl(load('search-slicktext-contact.js'), { phone: '+15550100', api_key: 'test-key' }, customRequest);
  assert.deepEqual(out, { exists: 'true', contact_id: '123456', first_name: 'Alex', last_name: 'Rivera', opt_in_status: 'subscribed' });
  assert.ok(called.url.endsWith('/contacts?mobile_number=%2B15550100'));
  assert.equal(called.opts.headers.Authorization, 'Bearer test-key');
});

test('search: no match returns exists=false with empty fields', async () => {
  const customRequest = { get: async () => ({ data: { data: [] } }) };
  const out = await runGhl(load('search-slicktext-contact.js'), { phone: '+15550101', api_key: 'k' }, customRequest);
  assert.deepEqual(out, { exists: 'false', contact_id: '', first_name: '', last_name: '', opt_in_status: '' });
});
