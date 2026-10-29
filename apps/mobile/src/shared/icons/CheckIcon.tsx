import Svg, { Path } from 'react-native-svg';

type CheckIconProps = { size?: number; color?: string };

export function CheckIcon({ size = 14, color = '#E5A93C' }: CheckIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m20 6-11 11-5-5" stroke={color} strokeWidth={2.5} />
    </Svg>
  );
}
