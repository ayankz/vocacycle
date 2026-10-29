import Svg, { Path } from 'react-native-svg';

type PlusIconProps = { size?: number; color?: string };

export function PlusIcon({ size = 20, color = '#000000' }: PlusIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.5} />
    </Svg>
  );
}
