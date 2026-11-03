import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { AppText } from '@/shared/ui/AppText';
import { AudioSessionScreen } from '@/features/audio/components/AudioSessionScreen';

export default function ReadyRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const value = Number(id);
  if (!Number.isSafeInteger(value) || value <= 0) return <View><AppText>Invalid audio session.</AppText></View>;
  return <AudioSessionScreen key={value} id={value} view="ready" />;
}
