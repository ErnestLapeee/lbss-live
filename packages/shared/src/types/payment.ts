export type PaymentMethod = 'stripe' | 'bank_transfer' | 'cash' | 'waived';

export interface Payment {
  id: number;
  licenseId: number;
  amountCents: number;
  currency: string;
  method: PaymentMethod;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  stripePaymentId: string | null;
  referenceNumber: string | null;
  confirmedBy: number | null;
  confirmedAt: string | null;
  notes: string | null;
  createdAt: string;
}
