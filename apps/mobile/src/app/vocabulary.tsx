import { router } from 'expo-router';
import { VocabularyScreen } from '@/features/vocabulary/components/VocabularyScreen';
export default function VocabularyRoute() {
  return <VocabularyScreen onContinue={wordIds => router.replace({ pathname: '/audio/create', params: { wordIds: JSON.stringify(wordIds) } })} />;
}
