import { Text, type TextProps } from 'react-native';

import { colors } from '@/shared/theme/colors';
import { typography } from '@/shared/theme/typography';

type TypographyVariant = keyof typeof typography;

type AppTextProps = TextProps & {
    variant?: TypographyVariant;
    color?: string;
};

const fontFamilies = {
    '400': 'SpaceGrotesk_400Regular',
    '500': 'SpaceGrotesk_500Medium',
    '600': 'SpaceGrotesk_600SemiBold',
    '700': 'SpaceGrotesk_700Bold',
} as const;

export function AppText({
    variant = 'body',
    color = colors.textPrimary,
    style,
    children,
    ...rest
}: AppTextProps) {
    const { fontWeight, ...textStyle } = typography[variant];

    return (
        <Text
            {...rest}
            style={[
                textStyle,
                {
                    fontFamily: fontFamilies[fontWeight],
                    color,
                },
                style,
            ]}
        >
            {children}
        </Text>
    );
}