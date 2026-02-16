export type LicenseStatus = 'pending' | 'approved' | 'expired' | 'suspended' | 'rejected';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'waived';

export interface License {
  id: number;
  playerId: number;
  seasonId: number;
  status: LicenseStatus;
  medicalClearance: boolean;
  insuranceVerified: boolean;
  paymentStatus: PaymentStatus;
  issuedAt: string | null;
  expiresAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
