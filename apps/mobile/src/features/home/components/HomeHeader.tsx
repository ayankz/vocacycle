import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { VocaCycleIcon } from '@/shared/icons/VocaCycleIcon';
import { ProfileIcon } from '@/shared/icons/ProfileIcon';
import { colors } from '@/shared/theme/colors';

export function HomeHeader() {
    return (
        <View style={styles.container}>
            <View style={styles.brand}>
                <View style={styles.logo}>
                    <VocaCycleIcon />
                </View>

                <AppText variant="pageTitle" style={styles.title}>
                    VocaCycle
                </AppText>
            </View>

            <Pressable
                style={styles.profile}
                accessibilityRole="button"
                accessibilityLabel="Profile"
            >
                <ProfileIcon />
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 4,
    },

    brand: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },

    logo: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#302515',
        borderWidth: 1,
        borderColor: 'rgba(229, 169, 60, 0.3)',
        alignItems: 'center',
        justifyContent: 'center',
    },

    title: {
        fontSize: 24,
        lineHeight: 30,
        letterSpacing: -0.5,
        color: colors.textPrimary,
    },

    profile: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#202127',
        borderWidth: 1,
        borderColor: '#2D2F38',
        alignItems: 'center',
        justifyContent: 'center',
    },
});