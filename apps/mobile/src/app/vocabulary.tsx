import { Alert } from 'react-native';
import { VocabularyScreen } from '@/features/vocabulary/components/VocabularyScreen';

export default function VocabularyRoute() {
  return <VocabularyScreen onContinue={() => {
    // Issue #30 owns configuration/navigation; selection stays mounted here.
    Alert.alert('Create Audio', 'Audio session configuration is not available yet. Your selection is kept here.');
  }} />;
}
