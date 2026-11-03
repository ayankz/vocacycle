import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { AppText } from '@/shared/ui/AppText';
import { AudioPlayerScreen } from '@/features/audio/components/AudioPlayerScreen';

export default function PlayerRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const value = Number(id);
  if (!Number.isSafeInteger(value) || value <= 0) return <View><AppText>Invalid audio session.</AppText></View>;
  return <AudioPlayerScreen key={value} id={value} />;
}
