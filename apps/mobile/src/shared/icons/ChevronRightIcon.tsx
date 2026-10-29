import Svg, { Path } from 'react-native-svg';

type ChevronRightIconProps = { size?: number; color?: string };

export function ChevronRightIcon({ size = 14, color = '#8B8E9B' }: ChevronRightIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m9 18 6-6-6-6" stroke={color} strokeWidth={2} />
    </Svg>
  );
}
