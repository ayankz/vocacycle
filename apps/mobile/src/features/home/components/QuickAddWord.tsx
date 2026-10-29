import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { CheckIcon } from '@/shared/icons/CheckIcon';
import { PlusIcon } from '@/shared/icons/PlusIcon';
import { SearchIcon } from '@/shared/icons/SearchIcon';
import { colors } from '@/shared/theme/colors';
import { radius } from '@/shared/theme/radius';
import { spacing } from '@/shared/theme/spacing';
import { AppText } from '@/shared/ui/AppText';

export function QuickAddWord() {
  const [word, setWord] = useState('');
  // Reference success state; additions are local only until persistence exists.
  const [lastAddedWord, setLastAddedWord] = useState('reluctant');
  const [isFocused, setIsFocused] = useState(false);

  function addWord() {
    const trimmedWord = word.trim();
    if (!trimmedWord) return;

    setLastAddedWord(trimmedWord);
    setWord('');
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
          onChangeText={setWord}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onSubmitEditing={addWord}
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
          onPress={addWord}
          hitSlop={2}
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
        >
          <PlusIcon />
        </Pressable>
      </View>
      <View style={styles.feedback} accessibilityLiveRegion="polite">
        <CheckIcon color={colors.primary} />
        <AppText variant="label" color={colors.primary} style={styles.feedbackText}>
          <AppText variant="label" style={styles.addedWord}>{lastAddedWord}</AppText>
          {' added'}
        </AppText>
      </View>
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
  addedWord: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 11,
    letterSpacing: -0.275,
  },
});
