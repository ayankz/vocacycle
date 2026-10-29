import { NativeTabs } from 'expo-router/native-tabs';

import { colors } from '@/shared/theme/colors';

export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor={colors.tabBarBackground}
      tintColor={colors.primary}
      iconColor={colors.tabInactive}
      disableTransparentOnScrollEdge
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'house', selected: 'house.fill' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="vocabulary">
        <NativeTabs.Trigger.Label>Vocabulary</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'book', selected: 'book.fill' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="audio">
        <NativeTabs.Trigger.Label>Audio</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="headphones" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="progress">
        <NativeTabs.Trigger.Label>Progress</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{
            default: 'chart.bar',
            selected: 'chart.bar.fill',
          }}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}