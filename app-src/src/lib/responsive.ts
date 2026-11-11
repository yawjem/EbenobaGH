// One place for screen-size decisions, so phones, small phones, tablets and rotation all behave.
import { useWindowDimensions } from 'react-native';

// Forms and lists stop growing on tablets and stay centred, instead of stretching edge to edge.
export const column = { width: '100%', maxWidth: 720, alignSelf: 'center' } as const;

export function useResponsive() {
  const { width, height } = useWindowDimensions();   // updates when the phone is rotated or the window is resized
  const cols = width >= 1000 ? 5 : width >= 800 ? 4 : width >= 560 ? 3 : 2;    // product grid columns
  const small = width < 360;                                                    // small phones
  const card = Math.round(Math.min(Math.max((width - 40) / 2.3, 130), 190));    // width of tiles in horizontal rows
  const banner = Math.round(Math.min(Math.max(width * 0.82, 240), 420));        // offer banner width
  const gallery = Math.min(width, 560);                                         // product photo size
  return { width, height, cols, small, card, banner, gallery };
}
