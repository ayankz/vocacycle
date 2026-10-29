import Svg, { Circle, Path } from 'react-native-svg';

type SearchIconProps = { size?: number; color?: string };

export function SearchIcon({ size = 20, color = '#6C707D' }: SearchIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round">
      <Circle cx={11} cy={11} r={8} />
      <Path d="m21 21-4.35-4.35" />
    </Svg>
  );
}
