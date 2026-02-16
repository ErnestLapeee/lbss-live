export type UserRole = 'public' | 'admin' | 'league_official' | 'statistician';

export interface User {
  id: number;
  email: string;
  displayName: string;
  role: UserRole;
  playerId: number | null;
  isActive: boolean;
  createdAt: string;
}

export interface Session {
  id: string;
  userId: number;
  expiresAt: string;
}
