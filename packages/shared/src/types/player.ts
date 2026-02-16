export interface Player {
  id: number;
  firstName: string;
  lastName: string;
  slug: string;
  dateOfBirth: string | null;
  nationality: string;
  throws: 'L' | 'R' | 'S' | null;
  bats: 'L' | 'R' | 'S' | null;
  heightCm: number | null;
  weightKg: number | null;
  photoUrl: string | null;
  bio: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface PlayerSeason {
  id: number;
  playerId: number;
  teamId: number;
  seasonId: number;
  jerseyNumber: string | null;
  position: string | null;
  role: 'player' | 'coach' | 'manager';
}
