export const colors = {
    background: '#0D0E11',
    backgroundSecondary: '#121316',

    surface: '#1B1B1F',
    surfaceElevated: '#222328',
    input: '#16171B',

    primary: '#E5A93C',
    primaryPressed: '#F0B84D',
    primarySubtle: 'rgba(229, 169, 60, 0.12)',

    textPrimary: '#FFFFFF',
    textSecondary: '#A0A2AB',
    textMuted: '#646670',
    textOnPrimary: '#0D0E11',

    border: 'rgba(255, 255, 255, 0.08)',

    success: '#4ADE80',
    error: '#F87171',
    appBackground: '#0B0C0E',
    tabBarBackground: '#131418',
    tabBarBorder: '#23252D',
    tabInactive: '#6E727E',
} as const;

export type ColorToken = keyof typeof colors;