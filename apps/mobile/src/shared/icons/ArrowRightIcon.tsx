import Svg, { Path } from 'react-native-svg';

type ArrowRightIconProps = { size?: number; color?: string };

export function ArrowRightIcon({ size = 14, color = '#000000' }: ArrowRightIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12h14M12 5l7 7-7 7" stroke={color} strokeWidth={2} />
    </Svg>
  );
}
