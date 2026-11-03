import { DarkTheme, ThemeProvider } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';

import { colors } from '@/shared/theme/colors';

const tabTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.primary,
    background: colors.tabBarBackground,
    card: colors.tabBarBackground,
    border: colors.tabBarBorder,
    text: colors.textPrimary,
  },
};
const tabContentStyle = { backgroundColor: colors.tabBarBackground };

export default function AppTabs() {
  return (
    <ThemeProvider value={tabTheme}>
    <NativeTabs
      hidden={false}
      minimizeBehavior="never"
      preferredPlacement="tabBar"
      activityEnabled={false}
      backgroundColor={colors.tabBarBackground}
      tintColor={colors.primary}
      iconColor={{ default: colors.tabInactive, selected: colors.primary }}
      labelStyle={{ default: { color: colors.tabInactive }, selected: { color: colors.primary } }}
      blurEffect="none"
      disableTransparentOnScrollEdge
    >
      <NativeTabs.Trigger name="index" contentStyle={tabContentStyle}>
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'house', selected: 'house.fill' }}
          md="home"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="vocabulary" contentStyle={tabContentStyle} disableAutomaticContentInsets>
        <NativeTabs.Trigger.Label>Vocabulary</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'book', selected: 'book.fill' }}
          md="menu_book"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="audio" disablePopToTop disableAutomaticContentInsets contentStyle={tabContentStyle}>
        <NativeTabs.Trigger.Label>Audio</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="headphones" md="headphones" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="progress" contentStyle={tabContentStyle}>
        <NativeTabs.Trigger.Label>Progress</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{
            default: 'chart.bar',
            selected: 'chart.bar.fill',
          }}
          md="bar_chart"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
    </ThemeProvider>
  );
}
