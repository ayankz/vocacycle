import Svg, { Path } from 'react-native-svg';

export function AudioUnavailableIcon({ color }: { color: string }) {
  return <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M11 5 6 9H3v6h3l5 4V5ZM16 9l6 6m0-6-6 6" />
  </Svg>;
}
