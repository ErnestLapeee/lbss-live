export interface Team {
  id: number;
  name: string;
  shortName: string | null;
  slug: string;
  city: string | null;
  logoUrl: string | null;
  foundedYear: number | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}
