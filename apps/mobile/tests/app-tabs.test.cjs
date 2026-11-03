const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./helpers/load-ts.cjs');

test('all native tabs share dark backing/theme, amber selection and unchanged routes/icons/insets', () => {
  function NativeTabs() {}
  NativeTabs.Trigger = 'trigger';
  NativeTabs.Trigger.Label = 'label'; NativeTabs.Trigger.Icon = 'icon';
  const load = createLoader({
    'expo-router': { ThemeProvider: 'theme', DarkTheme: { dark: true, colors: {}, fonts: {} } },
    'expo-router/native-tabs': { NativeTabs },
  });
  const tree = load('src/components/app-tabs.tsx').default();
  assert.equal(tree.type, 'theme'); assert.equal(tree.props.value.dark, true);
  assert.equal(tree.props.value.colors.background, '#131418');
  assert.equal(tree.props.value.colors.card, '#131418');
  const tabs = tree.props.children;
  assert.equal(tabs.props.backgroundColor, '#131418');
  assert.equal(tabs.props.blurEffect, 'none');
  assert.equal(tabs.props.disableTransparentOnScrollEdge, true);
  assert.equal(tabs.props.iconColor.selected, '#E5A93C');
  assert.equal(tabs.props.iconColor.default, '#6E727E');
  assert.equal(tabs.props.labelStyle.selected.color, '#E5A93C');
  assert.equal(tabs.props.labelStyle.default.color, '#6E727E');
  assert.deepEqual(Array.from(tabs.props.children, tab => tab.props.name), ['index', 'vocabulary', 'audio', 'progress']);
  for (const tab of tabs.props.children) {
    assert.equal(tab.props.contentStyle.backgroundColor, '#131418');
    assert.equal(tab.props.contentStyle.paddingBottom, undefined);
  }
  assert.equal(tabs.props.children[0].props.children[1].props.sf.selected, 'house.fill');
  assert.equal(tabs.props.children[1].props.children[1].props.sf.selected, 'book.fill');
  assert.equal(tabs.props.children[2].props.children[1].props.sf, 'headphones');
  assert.equal(tabs.props.children[3].props.children[1].props.sf.selected, 'chart.bar.fill');
  assert.equal(tabs.props.children[1].props.disableAutomaticContentInsets, true);
});
