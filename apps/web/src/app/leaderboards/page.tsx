import { redirect } from 'next/navigation';

export default function LeaderboardsRedirect() {
  redirect('/stats');
}
