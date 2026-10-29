const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/project-issue-sync.yml'), 'utf8');
const source = workflow.split('          script: |\n')[1].split('\n')
  .map(line => line.replace(/^ {12}/, '')).join('\n');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const execute = new AsyncFunction('github', 'context', 'core', 'process', source);
const connection = nodes => ({ nodes, pageInfo: { hasNextPage: false, endCursor: null } });

async function scenario({ body = '## Estimate\n1.5 hours', existing = true,
  status, priority, race, apiFailure = false, paginate = false } = {}) {
  const state = { updates: [], warnings: [], failures: [], adds: 0, reads: 0, fieldReads: 0,
    values: { s: status, p: priority, e: 2, a: 0.75 } };
  const item = { id: 'item', project: { id: 'project' } };
  const fields = [
    { id: 's', name: 'Status', dataType: 'SINGLE_SELECT', options: [{ id: 'todo', name: 'Todo' }] },
    { id: 'p', name: 'Priority', dataType: 'SINGLE_SELECT', options: [{ id: 'critical', name: 'Critical' }] },
    { id: 'e', name: 'Estimate (hours)', dataType: 'NUMBER' },
    { id: 'a', name: 'Actual (hours)', dataType: 'NUMBER' },
  ];
  const github = { graphql: async (query, vars) => {
    if (query.includes('user(login:')) {
      if (apiFailure) throw { status: 403 };
      return { user: { projectsV2: connection([{ id: 'project', title: 'VocaCycle — MVP' }]) } };
    }
    if (query.includes('repository(owner:')) return { repository: { issue: { id: 'issue', body } } };
    if (query.includes('fields(first:')) return { node: { fields: connection(fields) } };
    if (query.includes('projectItems(first:')) {
      state.reads++;
      return { node: { projectItems: connection(existing || (race && state.reads > 1) ? [item] : []) } };
    }
    if (query.includes('addProjectV2ItemById')) {
      state.adds++;
      if (race === 'error') throw { status: 409 };
      return { addProjectV2ItemById: { item } };
    }
    if (query.includes('fieldValues(first:')) {
      state.fieldReads++;
      assert.ok(query.includes('optionId'));
      const selections = ['s', 'p'].filter(id => state.values[id])
        .map(id => ({ optionId: state.values[id], field: { id } }));
      if (paginate && !vars.after) return { node: { fieldValues: {
        nodes: [{}], pageInfo: { hasNextPage: true, endCursor: 'next' },
      } } };
      return { node: { fieldValues: connection(selections) } };
    }
    if (query.includes('updateProjectV2ItemFieldValue')) {
      assert.notEqual(vars.field, 'a', 'Actual must never be mutated');
      state.updates.push(vars);
      state.values[vars.field] = vars.value.singleSelectOptionId ?? vars.value.number;
      return { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'item' } } };
    }
    throw new Error('Unexpected GraphQL operation');
  } };
  await execute(github, { repo: { owner: 'ayankz', repo: 'vocacycle' }, eventName: 'issues' }, {
    info() {}, error() {}, warning: text => state.warnings.push(text),
    setFailed: text => state.failures.push(text),
  }, { env: { ISSUE_NUMBER: '4' } });
  assert.equal(state.values.a, 0.75);
  if (!apiFailure) assert.deepEqual(state.failures, []);
  return state;
}

test('new item gets defaults and parsed estimate', async () => {
  const s = await scenario({ existing: false });
  assert.equal(s.adds, 1);
  assert.deepEqual(s.values, { s: 'todo', p: 'critical', e: 1.5, a: 0.75 });
});
test('edited In Progress issue preserves manual status/priority and updates estimate', async () => {
  const s = await scenario({ status: 'in-progress', priority: 'low', body: '## Estimate\n3 hours' });
  assert.equal(s.adds, 0);
  assert.deepEqual(s.updates.map(v => v.field), ['e']);
  assert.deepEqual(s.values, { s: 'in-progress', p: 'low', e: 3, a: 0.75 });
});
for (const [status, priority, initialized] of [['in-progress', undefined, 'p'], [undefined, 'low', 's']]) {
  test(`only initializes unset field ${initialized}`, async () => {
    const s = await scenario({ status, priority });
    assert.deepEqual(s.updates.map(v => v.field), ['e', initialized]);
  });
}
for (const race of ['success', 'error']) {
  test(`Auto-add ${race} race preserves existing selections`, async () => {
    const s = await scenario({ existing: false, race, status: 'in-progress', priority: 'high' });
    assert.equal(s.adds, 1);
    assert.deepEqual(s.updates.map(v => v.field), ['e']);
    assert.equal(s.values.s, 'in-progress');
  });
}
test('paginated selections preserve In Progress on later page', async () => {
  const s = await scenario({ paginate: true, status: 'in-progress', priority: 'low' });
  assert.equal(s.fieldReads, 2);
  assert.deepEqual(s.updates.map(v => v.field), ['e']);
});
for (const body of ['', '## Estimate\ninvalid', '## Estimate\n-1 hour',
  '## Estimate\n1 hour\n## Estimate\n2 hours', '```md\n## Estimate\n5 hours\n```']) {
  test(`invalid/absent estimate is preserved: ${JSON.stringify(body)}`, async () => {
    const s = await scenario({ body, status: 'in-progress', priority: 'low' });
    assert.equal(s.values.e, 2);
    assert.equal(s.updates.length, 0);
    assert.equal(s.warnings.length, 1);
  });
}
test('zero estimate is valid', async () => {
  const s = await scenario({ body: '## Estimate\n0 hours' });
  assert.equal(s.values.e, 0);
});
test('API errors fail explicitly without mutations', async () => {
  const s = await scenario({ apiFailure: true });
  assert.deepEqual(s.failures, ['Find user Project failed.']);
  assert.equal(s.updates.length, 0);
});
