export const FONT_LINK =
  'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,500;0,9..144,700;1,9..144,400&display=swap';

export const SCREEN = {
  UPLOAD: 'upload',
  CROP: 'crop',
  ASSIGN: 'assign',
  SUMMARY: 'summary'
} as const;

export type Screen = (typeof SCREEN)[keyof typeof SCREEN];

export const palette = {
  bg: '#FAF7F2',
  card: '#FFFFFF',
  accent: '#D4582A',
  accentSoft: '#F5E6DE',
  accentHover: '#B94A22',
  text: '#2C2416',
  textSoft: '#8C8078',
  border: '#E8E2DA',
  green: '#3A7D53',
  greenSoft: '#E4F0E8',
  tagBg: '#F0EBE4',
  shadow: '0 2px 12px rgba(44,36,22,0.07)',
  shadowLg: '0 8px 32px rgba(44,36,22,0.10)'
} as const;

export const baseBtnClass = 'cursor-pointer rounded-xl border-none font-semibold transition-all duration-200';
