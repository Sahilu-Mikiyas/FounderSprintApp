export const colors = {
  black: '#0A0A0A',
  white: '#FFFFFF',
  grey900: '#1A1A1A',
  grey800: '#2A2A2A',
  grey600: '#666666',
  grey400: '#A0A0A0',
  grey200: '#E8E8E8',

  // Category colors
  revenue: '#22C55E',
  clients: '#3B82F6',
  content: '#A855F7',
  development: '#F97316',
  learning: '#EAB308',
  habit: '#EC4899',

  // Day type colors
  fyp: '#6366F1',
  review: '#06B6D4',
} as const;

export type ColorKey = keyof typeof colors;
