export interface League {
  id: number;
  seasonId: number;
  name: string;
  slug: string;
  sport: 'baseball' | 'softball';
  level: 'senior' | 'youth' | 'amateur';
  createdAt: string;
}
