export const USER_ROLES = ['public', 'admin', 'league_official', 'statistician'] as const;

export const ROLE_LABELS: Record<string, string> = {
  public: 'Public User',
  admin: 'Administrator',
  league_official: 'League Official',
  statistician: 'Statistician',
};

export const ROLE_HIERARCHY: Record<string, number> = {
  public: 0,
  statistician: 1,
  league_official: 2,
  admin: 3,
};
