import Svg, { Path } from 'react-native-svg';

type ProfileIconProps = {
    size?: number;
    color?: string;
};

export function ProfileIcon({
    size = 20,
    color = '#9CA3AF',
}: ProfileIconProps) {
    return (
        <Svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill={color}
        >
            <Path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8V21.6h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
        </Svg>
    );
}