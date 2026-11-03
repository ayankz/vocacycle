import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-screens/experimental';
import { AppText } from '@/shared/ui/AppText';
import { colors } from '@/shared/theme/colors';
import { AudioSessionScreen } from '@/features/audio/components/AudioSessionScreen';
import { sessionStyles as styles } from '@/features/audio/components/session-styles';

export default function AudioLibraryRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();
  const id = Number(sessionId);
  if (Number.isSafeInteger(id) && id > 0) return <AudioSessionScreen key={id} id={id} view="library" />;
  return <SafeAreaView style={styles.screen} edges={{ top: true, bottom: true, left: true, right: true }}>
    <View style={styles.content}>
      <AppText variant="pageTitle">Audio Library</AppText>
      <AppText color={colors.textSecondary}>Open a generated session here from Audio Ready. Browsing all saved sessions is not available yet.</AppText>
      <Pressable accessibilityRole="button" onPress={() => router.navigate({ pathname: '/vocabulary', params: { mode: 'select' } })} style={styles.primary}>
        <AppText variant="button" color={colors.textOnPrimary}>Choose words for audio</AppText>
      </Pressable>
    </View>
  </SafeAreaView>;
}
