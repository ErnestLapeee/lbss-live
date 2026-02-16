export const POSITIONS = {
  P: 'Pitcher', C: 'Catcher', '1B': 'First Base', '2B': 'Second Base',
  '3B': 'Third Base', SS: 'Shortstop', LF: 'Left Field', CF: 'Center Field',
  RF: 'Right Field', DH: 'Designated Hitter', PH: 'Pinch Hitter', PR: 'Pinch Runner',
} as const;

export const POSITION_CODES = Object.keys(POSITIONS) as (keyof typeof POSITIONS)[];
