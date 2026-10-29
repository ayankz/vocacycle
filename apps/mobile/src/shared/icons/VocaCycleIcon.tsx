import Svg, { Path } from 'react-native-svg';

type VocaCycleIconProps = {
    size?: number;
    color?: string;
};

export function VocaCycleIcon({
    size = 20,
    color = '#E5A93C',
}: VocaCycleIconProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
            <Path
                d="M12 3v18M8 6v12M4 10v4M16 7v10M20 10v4"
                stroke={color}
                strokeWidth={2.5}
                strokeLinecap="round"
                fill="none"
            />
        </Svg>
    );
}