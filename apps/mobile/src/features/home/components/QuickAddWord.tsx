import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { CheckIcon } from '@/shared/icons/CheckIcon';
import { PlusIcon } from '@/shared/icons/PlusIcon';
import { SearchIcon } from '@/shared/icons/SearchIcon';
import { colors } from '@/shared/theme/colors';
import { radius } from '@/shared/theme/radius';
import { spacing } from '@/shared/theme/spacing';
import { AppText } from '@/shared/ui/AppText';
import { createWord } from '@/features/home/data/words-api';

type QuickAddWordProps = { onAdded: () => void };

export function QuickAddWord({ onAdded }: QuickAddWordProps) {
  const [word, setWord] = useState('');
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  async function addWord() {
    const trimmedWord = word.trim();
    if (!trimmedWord || submitting) return;

    setSubmitting(true);
    setFeedback(null);
    try {
      const saved = await createWord(trimmedWord);
      setWord('');
      setFeedback({ message: `${saved.text} added`, error: false });
      onAdded();
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'Could not save word. Please try again.', error: true });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View>
      <View style={[styles.inputContainer, isFocused && styles.focused]}>
        <SearchIcon color={isFocused ? colors.primary : '#6C707D'} />
        <TextInput
          accessibilityLabel="English word"
          placeholder="Enter an English word..."
          placeholderTextColor="#646876"
          value={word}
          editable={!submitting}
          onChangeText={setWord}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onSubmitEditing={() => void addWord()}
          submitBehavior="submit"
          returnKeyType="done"
          autoCapitalize="none"
          autoCorrect={false}
          selectionColor={colors.primary}
          underlineColorAndroid="transparent"
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add Word"
          onPress={() => void addWord()}
          disabled={submitting || !word.trim()}
          hitSlop={2}
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
        >
          {submitting ? <ActivityIndicator color={colors.textOnPrimary} /> : <PlusIcon />}
        </Pressable>
      </View>
      {feedback && <View style={styles.feedback} accessibilityLiveRegion="polite">
        {!feedback.error && <CheckIcon color={colors.primary} />}
        <AppText variant="label" color={feedback.error ? colors.error : colors.primary} style={styles.feedbackText}>{feedback.message}</AppText>
      </View>}
    </View>
  );
}

const styles = StyleSheet.create({
  inputContainer: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing[4],
    paddingRight: 6,
    gap: spacing[3],
    backgroundColor: '#191A20',
    borderWidth: 1,
    borderColor: '#252730',
    borderRadius: radius.full,
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  },
  focused: { borderColor: 'rgba(229, 169, 60, 0.6)' },
  input: {
    flex: 1,
    minWidth: 0,
    padding: 0,
    paddingVertical: spacing[2],
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 15,
    color: colors.textPrimary,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  },
  pressed: {
    backgroundColor: colors.primaryPressed,
    transform: [{ scale: 0.9 }],
  },
  feedback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingTop: spacing[2],
  },
  feedbackText: { flexShrink: 1, fontSize: 11, letterSpacing: -0.275 },
});
