import Svg, { Path } from 'react-native-svg';

type PlayIconProps = { size?: number; color?: string };

export function PlayIcon({ size = 20, color = '#000000' }: PlayIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M8 5v14l11-7z" />
    </Svg>
  );
}
