// Ebenoba GH theme. Crimson + white stay the stars; the accents below each have ONE job so the app
// feels rich without fighting the brand:
//   crimson  -> brand, buttons, sale prices, badges that need attention
//   navy     -> structure and calm "we're working on it" states, dark feature bands
//   teal     -> logistics and trust: delivery, tracking, secure payment
//   gold     -> stars, featured, highlights (never body text)
//   green    -> success only (delivered, in stock)
export const colors = {
  primary: '#D50100',
  deep: '#88050D',
  darkest: '#7B0305',
  blush: '#FDECEC',

  navy: '#1B2A41',
  navySoft: '#E9EDF3',
  teal: '#0E7C86',
  tealSoft: '#E1F2F3',
  gold: '#F2B134',
  goldSoft: '#FFF4DC',
  sand: '#FFF8EE',

  bg: '#FFFFFF',
  surface: '#FAF7F7',
  text: '#1F1A1B',
  muted: '#6B6466',
  border: '#EDE7E8',
  success: '#1E8E5A',
  successSoft: '#E4F4EC',
  // darker shades for small TEXT on the soft tints above (all >= 4.5:1); use the bright ones for icons/dots/shapes
  goldText: '#8A5A00',
  tealText: '#0A6770',
  greenText: '#17714A',
  warning: '#F2A93B',
};

// Category tiles cycle through these so the home screen is colourful but coherent.
export const tileTints = [
  { bg: colors.blush, fg: colors.primary },
  { bg: colors.tealSoft, fg: colors.teal },
  { bg: colors.goldSoft, fg: '#8A5A00' },
  { bg: colors.navySoft, fg: colors.navy },
  { bg: colors.successSoft, fg: colors.success },
];

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
export const space = (n: number) => n * 4;
