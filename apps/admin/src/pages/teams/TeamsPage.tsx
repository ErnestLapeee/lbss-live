import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { useAdminSeason } from '@/context/AdminSeasonContext';

/* ───── types ───── */
interface RosterPlayer {
  rosterId: number;
  playerId: number;
  firstName: string;
  lastName: string;
  jerseyNumber: string | null;
  position: string | null;
  teamId: number;
  bats: string | null;
  throws: string | null;
  isActive: boolean;
  licensePaid: string | null; // 'paid' | 'unpaid' | null
}

interface TeamWithRoster {
  id: number;
  name: string;
  shortName: string | null;
  city: string | null;
  foundedYear: number | null;
  isActive: boolean;
  players: RosterPlayer[];
}

interface DirectoryPlayer {
  id: number;
  firstName: string;
  lastName: string;
  nationality: string | null;
  bats: string | null;
  throws: string | null;
  dateOfBirth: string | null;
  heightCm: number | null;
  weightKg: number | null;
  bio: string | null;
  isActive: boolean;
}

interface LeagueOption {
  id: number;
  seasonId: number;
  name: string;
  slug: string;
}

const BATS_OPTIONS = ['R', 'L', 'S'];
const THROWS_OPTIONS = ['R', 'L', 'S'];

/* ───── component ───── */
export function TeamsPage() {
  const { selectedSeasonId, seasonsLoading } = useAdminSeason();
  const [teams, setTeams] = useState<TeamWithRoster[]>([]);
  const [allPlayers, setAllPlayers] = useState<DirectoryPlayer[]>([]);
  const [leaguesForSeason, setLeaguesForSeason] = useState<LeagueOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Team create/edit form
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamWithRoster | null>(null);
  const [teamForm, setTeamForm] = useState({ name: '', shortName: '', city: '', foundedYear: '', description: '', logoUrl: '' });
  const [createLeagueId, setCreateLeagueId] = useState('');

  // Player create form (add new player directly under a team)
  const [showPlayerForm, setShowPlayerForm] = useState(false);
  const [addToTeamId, setAddToTeamId] = useState<number | null>(null);
  const [playerForm, setPlayerForm] = useState({
    firstName: '', lastName: '', nationality: 'LV', dateOfBirth: '',
    bats: '', throws: '', jerseyNumber: '',
  });

  // Assign existing player modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignToTeamId, setAssignToTeamId] = useState<number | null>(null);
  const [assignForm, setAssignForm] = useState({ playerId: '', jerseyNumber: '' });
  const [assignSearchQuery, setAssignSearchQuery] = useState('');

  const [unassignedOpen, setUnassignedOpen] = useState(false);
  const [unassignedQuery, setUnassignedQuery] = useState('');

  // Add player to another team modal
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [movingPlayer, setMovingPlayer] = useState<RosterPlayer | null>(null);
  const [moveTargetTeamId, setMoveTargetTeamId] = useState('');

  const [showDirectoryPlayerEdit, setShowDirectoryPlayerEdit] = useState(false);
  const [directoryPlayerEditId, setDirectoryPlayerEditId] = useState<number | null>(null);
  const [directoryPlayerEditForm, setDirectoryPlayerEditForm] = useState({
    firstName: '',
    lastName: '',
    nationality: 'LV',
    dateOfBirth: '',
    bats: '',
    throws: '',
    heightCm: '',
    weightKg: '',
    bio: '',
  });

  const [saving, setSaving] = useState(false);

  /* ───── data loading ───── */
  const loadRosters = useCallback(async (opts?: { background?: boolean }) => {
    if (!selectedSeasonId) return;
    const background = Boolean(opts?.background);
    if (!background) {
      setLoading(true);
      setError(null);
    }
    try {
      const [rostersData, playersData, leaguesData] = await Promise.all([
        apiGet<TeamWithRoster[]>(`/admin/teams/rosters?seasonId=${selectedSeasonId}`),
        apiGet<DirectoryPlayer[]>('/admin/players'),
        apiGet<LeagueOption[]>('/admin/leagues').catch(() => []),
      ]);
      setTeams(Array.isArray(rostersData) ? rostersData : []);
      setAllPlayers(Array.isArray(playersData) ? playersData : []);
      const lg = Array.isArray(leaguesData)
        ? leaguesData
            .filter((l) => l.seasonId === selectedSeasonId)
            .sort((a, b) => a.name.localeCompare(b.name))
        : [];
      setLeaguesForSeason(lg);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load');
    } finally {
      if (!background) setLoading(false);
    }
  }, [selectedSeasonId]);

  useEffect(() => {
    if (!selectedSeasonId) return;
    loadRosters();
  }, [selectedSeasonId, loadRosters]);

  /* ───── derived: roster membership ───── */
  const rosterTeamIdsByPlayer = useMemo(() => {
    const m = new Map<number, Set<number>>();
    for (const team of teams) {
      for (const player of team.players) {
        const teamIds = m.get(player.playerId) ?? new Set<number>();
        teamIds.add(team.id);
        m.set(player.playerId, teamIds);
      }
    }
    return m;
  }, [teams]);

  const getAssignablePlayers = (teamId: number | null) => {
    if (!teamId) return [];
    return allPlayers.filter((p) => p.isActive && !rosterTeamIdsByPlayer.get(p.id)?.has(teamId));
  };

  const unassignedPlayers = useMemo(
    () => allPlayers.filter((p) => p.isActive && !rosterTeamIdsByPlayer.has(p.id)),
    [allPlayers, rosterTeamIdsByPlayer],
  );

  const unassignedFiltered = useMemo(() => {
    const q = unassignedQuery.trim().toLowerCase();
    const sorted = [...unassignedPlayers].sort((a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, undefined, {
        sensitivity: 'base',
      }),
    );
    if (!q) return sorted;
    return sorted.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q));
  }, [unassignedPlayers, unassignedQuery]);

  const assignableForModal = useMemo(() => {
    if (assignToTeamId == null) return [];
    return allPlayers.filter(
      (p) => p.isActive && !rosterTeamIdsByPlayer.get(p.id)?.has(assignToTeamId),
    );
  }, [assignToTeamId, allPlayers, rosterTeamIdsByPlayer]);

  const assignFiltered = useMemo(() => {
    const sorted = [...assignableForModal].sort((a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, undefined, {
        sensitivity: 'base',
      }),
    );
    const q = assignSearchQuery.trim().toLowerCase();
    if (!q) {
      if (sorted.length <= 80) return sorted;
      return sorted.slice(0, 80);
    }
    const matched = sorted.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q));
    return matched.length > 200 ? matched.slice(0, 200) : matched;
  }, [assignableForModal, assignSearchQuery]);

  /* ───── team CRUD ───── */
  const openCreateTeam = () => {
    setEditingTeam(null);
    setTeamForm({ name: '', shortName: '', city: '', foundedYear: '', description: '', logoUrl: '' });
    setCreateLeagueId(leaguesForSeason[0] ? String(leaguesForSeason[0].id) : '');
    setShowTeamForm(true);
  };

  const openEditTeam = (t: TeamWithRoster) => {
    setEditingTeam(t);
    setTeamForm({
      name: t.name,
      shortName: t.shortName ?? '',
      city: t.city ?? '',
      foundedYear: t.foundedYear ? String(t.foundedYear) : '',
      description: '',
      logoUrl: (t as any).logoUrl ?? '',
    });
    setShowTeamForm(true);
  };

  const handleTeamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: teamForm.name,
        shortName: teamForm.shortName || null,
        city: teamForm.city || null,
        foundedYear: teamForm.foundedYear ? parseInt(teamForm.foundedYear, 10) : null,
        description: teamForm.description || null,
        logoUrl: teamForm.logoUrl || null,
      };
      if (editingTeam) {
        await apiPut(`/admin/teams/${editingTeam.id}`, payload);
      } else {
        if (!selectedSeasonId) {
          alert('Choose a workspace season in the header before creating a team.');
          return;
        }
        if (leaguesForSeason.length === 0) {
          alert('This season has no league yet. Create one under Leagues, then add the team.');
          return;
        }
        const body: Record<string, unknown> = { ...payload, seasonId: selectedSeasonId };
        if (leaguesForSeason.length > 1) {
          const lid = parseInt(createLeagueId, 10);
          if (!Number.isFinite(lid)) {
            alert('Choose which league this team joins for this season.');
            return;
          }
          body.leagueId = lid;
        }
        await apiPost('/admin/teams', body);
      }
      setShowTeamForm(false);
      await loadRosters({ background: true });
    } catch (err: any) {
      alert(err.message || 'Failed to save team');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTeam = async (teamId: number) => {
    if (
      !confirm(
        'Deactivate this club for the whole organization? This is blocked while the team is in a league, has roster rows, or appears on games. To drop it from the current season only, use Season setup instead.',
      )
    ) {
      return;
    }
    try {
      await apiDelete(`/admin/teams/${teamId}`);
      await loadRosters({ background: true });
    } catch (err: any) {
      alert(err.message || 'Failed');
    }
  };

  const handleReactivateTeam = async (teamId: number) => {
    try {
      await apiPost(`/admin/teams/${teamId}/reactivate`, {});
      await loadRosters({ background: true });
    } catch (err: any) {
      alert(err.message || 'Failed to reactivate');
    }
  };

  /* ───── add NEW player to team ───── */
  const openAddPlayer = (teamId: number) => {
    setAddToTeamId(teamId);
    setPlayerForm({
      firstName: '', lastName: '', nationality: 'LV', dateOfBirth: '',
      bats: '', throws: '', jerseyNumber: '',
    });
    setShowPlayerForm(true);
  };

  const handlePlayerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addToTeamId || !selectedSeasonId) return;
    setSaving(true);
    try {
      // 1. Create the player
      const newPlayer = await apiPost<{ id: number }>('/admin/players', {
        firstName: playerForm.firstName.trim(),
        lastName: playerForm.lastName.trim(),
        nationality: playerForm.nationality || 'LV',
        dateOfBirth: playerForm.dateOfBirth || undefined,
        bats: playerForm.bats || undefined,
        throws: playerForm.throws || undefined,
      });
      // 2. Assign to team roster
      await apiPost(`/admin/players/${newPlayer.id}/roster`, {
        teamId: addToTeamId,
        seasonId: selectedSeasonId,
        jerseyNumber: playerForm.jerseyNumber || undefined,
      });
      setShowPlayerForm(false);
      await loadRosters({ background: true });
    } catch (err: any) {
      alert(err.message || 'Failed to add player');
    } finally {
      setSaving(false);
    }
  };

  /* ───── assign EXISTING player to team ───── */
  const openAssignExisting = (teamId: number) => {
    setAssignToTeamId(teamId);
    setAssignForm({ playerId: '', jerseyNumber: '' });
    setAssignSearchQuery('');
    setShowAssignModal(true);
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignToTeamId || !selectedSeasonId) return;
    if (!assignForm.playerId) {
      alert('Pick a player from the search results.');
      return;
    }
    setSaving(true);
    try {
      await apiPost(`/admin/players/${assignForm.playerId}/roster`, {
        teamId: assignToTeamId,
        seasonId: selectedSeasonId,
        jerseyNumber: assignForm.jerseyNumber || undefined,
      });
      setShowAssignModal(false);
      await loadRosters({ background: true });
    } catch (err: any) {
      alert(err.message || 'Failed to assign');
    } finally {
      setSaving(false);
    }
  };

  /* ───── add existing roster player to another team ───── */
  const openMovePlayer = (player: RosterPlayer) => {
    setMovingPlayer(player);
    setMoveTargetTeamId('');
    setShowMoveModal(true);
  };

  const openDirectoryPlayerEdit = (rosterPlayer: RosterPlayer) => {
    const d = allPlayers.find((x) => x.id === rosterPlayer.playerId);
    if (!d) {
      alert('Could not load this player for editing. Try refreshing the page.');
      return;
    }
    setDirectoryPlayerEditId(d.id);
    setDirectoryPlayerEditForm({
      firstName: d.firstName,
      lastName: d.lastName,
      nationality: d.nationality ?? 'LV',
      dateOfBirth: d.dateOfBirth ?? '',
      bats: d.bats ?? '',
      throws: d.throws ?? '',
      heightCm: d.heightCm != null ? String(d.heightCm) : '',
      weightKg: d.weightKg != null ? String(d.weightKg) : '',
      bio: d.bio ?? '',
    });
    setShowDirectoryPlayerEdit(true);
  };

  const closeDirectoryPlayerEdit = () => {
    setShowDirectoryPlayerEdit(false);
    setDirectoryPlayerEditId(null);
  };

  const handleDirectoryPlayerEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (directoryPlayerEditId == null) return;
    setSaving(true);
    try {
      await apiPut(`/admin/players/${directoryPlayerEditId}`, {
        firstName: directoryPlayerEditForm.firstName.trim(),
        lastName: directoryPlayerEditForm.lastName.trim(),
        nationality: directoryPlayerEditForm.nationality.trim() || 'LV',
        dateOfBirth: directoryPlayerEditForm.dateOfBirth || undefined,
        bats: directoryPlayerEditForm.bats || undefined,
        throws: directoryPlayerEditForm.throws || undefined,
        heightCm: directoryPlayerEditForm.heightCm ? parseInt(directoryPlayerEditForm.heightCm, 10) : undefined,
        weightKg: directoryPlayerEditForm.weightKg ? parseInt(directoryPlayerEditForm.weightKg, 10) : undefined,
        bio: directoryPlayerEditForm.bio.trim() || undefined,
      });
      closeDirectoryPlayerEdit();
      await loadRosters({ background: true });
    } catch (err: any) {
      alert(err.message || 'Failed to save player');
    } finally {
      setSaving(false);
    }
  };

  const handleMoveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movingPlayer || !moveTargetTeamId) return;
    setSaving(true);
    try {
      await apiPut(`/admin/teams/roster/${movingPlayer.rosterId}/transfer`, {
        newTeamId: parseInt(moveTargetTeamId, 10),
      });
      setShowMoveModal(false);
      setMovingPlayer(null);
      await loadRosters({ background: true });
    } catch (err: any) {
      alert(err.message || 'Failed to add player to team');
    } finally {
      setSaving(false);
    }
  };

  /* ───── remove player from roster ───── */
  const handleRemoveFromRoster = async (player: RosterPlayer) => {
    if (!confirm(`Remove ${player.firstName} ${player.lastName} from this team's roster?`)) return;
    try {
      await apiDelete(`/admin/teams/roster/${player.rosterId}`);
      await loadRosters({ background: true });
    } catch (err: any) {
      alert(err.message || 'Failed to remove');
    }
  };

  /* ───── toggle license payment ───── */
  const handleToggleLicense = async (player: RosterPlayer) => {
    try {
      const res = await apiPut<{ paymentStatus: string }>(`/admin/teams/roster/${player.rosterId}/toggle-license`, {});
      // Optimistic update in local state
      setTeams(prev => prev.map(t => ({
        ...t,
        players: t.players.map(p =>
          p.rosterId === player.rosterId ? { ...p, licensePaid: res.paymentStatus } : p
        ),
      })));
    } catch (err: any) {
      alert(err.message || 'Failed to toggle license');
    }
  };

  /* ───── shared styles ───── */
  const inputClass =
    'w-full px-3 py-2 border border-border rounded-lg bg-surface-alt text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent';

  /* ───── render ───── */
  return (
    <div>
      {/* header */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h1 className="font-heading text-xl font-bold">Teams & Rosters</h1>
        <button
          type="button"
          onClick={openCreateTeam}
          disabled={!selectedSeasonId || loading || leaguesForSeason.length === 0}
          className="px-4 py-2 bg-accent hover:bg-accent-light text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          + Add Team
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 text-sm">
          {error}
        </div>
      )}

      {seasonsLoading ? (
        <div className="text-center py-16 text-text-muted">Loading seasons…</div>
      ) : !selectedSeasonId ? (
        <div className="text-center py-16 text-text-muted text-sm">No season selected.</div>
      ) : loading ? (
        <div className="text-center py-16 text-text-muted">Loading rosters...</div>
      ) : teams.length === 0 ? (
        <div className="text-center py-16 text-text-muted text-sm">No teams yet.</div>
      ) : (
        <>
          {/* ── Team columns ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
            {teams.map(team => (
              <div
                key={team.id}
                className={`bg-surface rounded-xl border flex flex-col ${
                  team.isActive ? 'border-border' : 'border-amber-500/50 ring-1 ring-amber-500/20'
                }`}
              >
                {/* team header */}
                <div className="px-4 py-3 border-b border-border bg-surface-alt rounded-t-xl">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-heading font-semibold text-sm">{team.name}</h3>
                        {!team.isActive && (
                          <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300 shrink-0">
                            Inactive
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-text-muted">
                        {[team.shortName, team.city].filter(Boolean).join(' · ') || 'No details'}
                        {' · '}{team.players.length} player{team.players.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEditTeam(team)}
                        className="p-1.5 text-text-muted hover:text-accent rounded transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      {team.isActive ? (
                        <button
                          onClick={() => handleDeleteTeam(team.id)}
                          className="p-1.5 text-text-muted hover:text-red-500 rounded transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleReactivateTeam(team.id)}
                          className="px-2 py-1 text-[11px] font-semibold rounded-md bg-amber-500/20 text-amber-800 dark:text-amber-200 hover:bg-amber-500/30 transition-colors"
                        >
                          Reactivate
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* player list */}
                <div className="flex-1 p-3 space-y-2 min-h-[80px]">
                  {team.players.length === 0 ? (
                    <div className="text-center py-6 text-text-muted text-xs">
                      No players assigned
                    </div>
                  ) : (
                    team.players.map(p => (
                      <div
                        key={p.rosterId}
                        className="flex items-center gap-2 px-3 py-2 bg-surface-alt rounded-lg border border-border/50 group hover:border-accent/30 transition-colors"
                      >
                        {/* jersey number badge */}
                        <span className="w-8 h-8 flex items-center justify-center rounded-md bg-accent/10 text-accent font-bold text-xs shrink-0">
                          {p.jerseyNumber || '—'}
                        </span>
                        {/* name & details */}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {p.firstName} {p.lastName}
                          </div>
                          {(p.bats || p.throws) && (
                            <div className="text-xs text-text-muted">
                              {[p.bats ? `B:${p.bats}` : '', p.throws ? `T:${p.throws}` : ''].filter(Boolean).join(' ')}
                            </div>
                          )}
                        </div>
                        {/* license payment toggle */}
                        <button
                          onClick={() => handleToggleLicense(p)}
                          className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide transition-colors ${
                            p.licensePaid === 'paid'
                              ? 'bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25'
                              : 'bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25'
                          }`}
                        >
                          {p.licensePaid === 'paid' ? 'Licensed' : 'Unpaid'}
                        </button>
                        {/* actions */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => openDirectoryPlayerEdit(p)}
                            className="p-1 text-text-muted hover:text-accent rounded"
                            title="Edit player"
                            aria-label="Edit player"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => openMovePlayer(p)}
                            className="p-1 text-text-muted hover:text-accent rounded"
                            title="Move to another team"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleRemoveFromRoster(p)}
                            className="p-1 text-text-muted hover:text-red-500 rounded"
                            title="Remove from roster"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* add player buttons */}
                <div className="px-3 pb-3 flex gap-2">
                  <button
                    onClick={() => openAddPlayer(team.id)}
                    className="flex-1 py-2 text-xs font-semibold text-accent hover:bg-accent/10 border border-dashed border-accent/40 rounded-lg transition-colors"
                  >
                    + New Player
                  </button>
                  {getAssignablePlayers(team.id).length > 0 && (
                    <button
                      onClick={() => openAssignExisting(team.id)}
                      className="flex-1 py-2 text-xs font-semibold text-text-muted hover:bg-surface-alt border border-dashed border-border rounded-lg transition-colors"
                    >
                      + Existing Player
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Unassigned players */}
          {unassignedPlayers.length > 0 && (
            <div className="mt-8 rounded-lg border border-border bg-surface-alt/30 p-4">
              <button
                type="button"
                onClick={() => {
                  setUnassignedOpen((o) => {
                    if (o) setUnassignedQuery('');
                    return !o;
                  });
                }}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <span className="text-sm font-semibold text-text-muted">
                  Not on any team this season ({unassignedPlayers.length})
                </span>
                <span className="text-xs font-medium text-accent shrink-0">{unassignedOpen ? 'Hide' : 'Show list'}</span>
              </button>
              {unassignedOpen && (
                <div className="mt-3">
                  <input
                    type="search"
                    autoComplete="off"
                    placeholder="Filter by name…"
                    value={unassignedQuery}
                    onChange={(e) => setUnassignedQuery(e.target.value)}
                    className={inputClass}
                  />
                  <ul className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-border bg-surface divide-y divide-border/50 text-sm">
                    {unassignedFiltered.map((p) => (
                      <li key={p.id} className="px-3 py-1.5 text-text-muted">
                        <span className="text-text">{p.lastName}</span>, {p.firstName}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ═══════ MODALS ═══════ */}

      {/* ── Team form modal ── */}
      {showTeamForm && (
        <Modal onClose={() => setShowTeamForm(false)}>
          <h2 className="font-heading text-lg font-bold mb-3">
            {editingTeam ? 'Edit Team' : 'Create Team'}
          </h2>
          <form onSubmit={handleTeamSubmit} className="space-y-4">
            {!editingTeam && leaguesForSeason.length > 1 && (
              <Field label="League for this season *">
                <select
                  value={createLeagueId}
                  onChange={(e) => setCreateLeagueId(e.target.value)}
                  className={inputClass}
                  required
                >
                  {leaguesForSeason.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Team Name *">
              <input type="text" value={teamForm.name} onChange={e => setTeamForm(f => ({ ...f, name: e.target.value }))} className={inputClass} required />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Short Name">
                <input type="text" value={teamForm.shortName} onChange={e => setTeamForm(f => ({ ...f, shortName: e.target.value }))} className={inputClass} placeholder="e.g. RIG" />
              </Field>
              <Field label="City">
                <input type="text" value={teamForm.city} onChange={e => setTeamForm(f => ({ ...f, city: e.target.value }))} className={inputClass} />
              </Field>
            </div>
            <Field label="Founded Year">
              <input type="number" value={teamForm.foundedYear} onChange={e => setTeamForm(f => ({ ...f, foundedYear: e.target.value }))} className={inputClass} />
            </Field>
            <Field label="Logo URL">
              <input type="url" value={teamForm.logoUrl} onChange={e => setTeamForm(f => ({ ...f, logoUrl: e.target.value }))} className={inputClass} placeholder="https://example.com/logo.png" />
              {teamForm.logoUrl && (
                <div className="mt-2 flex items-center gap-2">
                  <img src={teamForm.logoUrl} alt="Logo preview" className="w-10 h-10 object-contain rounded border border-border" onError={e => (e.currentTarget.style.display = 'none')} />
                  <span className="text-xs text-gray-500">Preview</span>
                </div>
              )}
            </Field>
            <ModalActions onCancel={() => setShowTeamForm(false)} saving={saving} />
          </form>
        </Modal>
      )}

      {/* ── New player form modal ── */}
      {showPlayerForm && (
        <Modal onClose={() => setShowPlayerForm(false)}>
          <h2 className="font-heading text-lg font-bold mb-3">
            Add New Player to {teams.find(t => t.id === addToTeamId)?.name}
          </h2>
          <form onSubmit={handlePlayerSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="First Name *">
                <input type="text" value={playerForm.firstName} onChange={e => setPlayerForm(f => ({ ...f, firstName: e.target.value }))} className={inputClass} required />
              </Field>
              <Field label="Last Name *">
                <input type="text" value={playerForm.lastName} onChange={e => setPlayerForm(f => ({ ...f, lastName: e.target.value }))} className={inputClass} required />
              </Field>
            </div>
            <Field label="Jersey #">
              <input type="text" value={playerForm.jerseyNumber} onChange={e => setPlayerForm(f => ({ ...f, jerseyNumber: e.target.value }))} className={inputClass} placeholder="e.g. 7" />
            </Field>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Nationality">
                <input type="text" value={playerForm.nationality} onChange={e => setPlayerForm(f => ({ ...f, nationality: e.target.value }))} className={inputClass} />
              </Field>
              <Field label="Bats">
                <select value={playerForm.bats} onChange={e => setPlayerForm(f => ({ ...f, bats: e.target.value }))} className={inputClass}>
                  <option value="">—</option>
                  {BATS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Throws">
                <select value={playerForm.throws} onChange={e => setPlayerForm(f => ({ ...f, throws: e.target.value }))} className={inputClass}>
                  <option value="">—</option>
                  {THROWS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Date of Birth">
              <input type="date" value={playerForm.dateOfBirth} onChange={e => setPlayerForm(f => ({ ...f, dateOfBirth: e.target.value }))} className={inputClass} />
            </Field>
            <ModalActions onCancel={() => setShowPlayerForm(false)} saving={saving} label="Add Player" />
          </form>
        </Modal>
      )}

      {/* ── Assign existing player modal ── */}
      {showAssignModal && (
        <Modal onClose={() => setShowAssignModal(false)} size="lg">
          <h2 className="font-heading text-lg font-bold mb-3">
            Assign Player to {teams.find(t => t.id === assignToTeamId)?.name}
          </h2>
          <form onSubmit={handleAssignSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-muted mb-1">Player *</label>
              <input
                type="search"
                autoComplete="off"
                autoFocus
                placeholder="Search last or first name…"
                value={assignSearchQuery}
                onChange={(e) => setAssignSearchQuery(e.target.value)}
                className={inputClass}
              />
              <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-border bg-surface-alt divide-y divide-border/60">
                {assignFiltered.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setAssignForm((f) => ({ ...f, playerId: String(p.id) }))}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-surface ${
                      assignForm.playerId === String(p.id) ? 'bg-accent/15 text-accent font-medium' : ''
                    }`}
                  >
                    <span className="font-medium">{p.lastName}</span>, {p.firstName}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Jersey #">
              <input type="text" value={assignForm.jerseyNumber} onChange={e => setAssignForm(f => ({ ...f, jerseyNumber: e.target.value }))} className={inputClass} placeholder="e.g. 7" />
            </Field>
            <ModalActions onCancel={() => setShowAssignModal(false)} saving={saving} label="Assign" />
          </form>
        </Modal>
      )}

      {/* ── Edit player (directory) from roster row ── */}
      {showDirectoryPlayerEdit && directoryPlayerEditId != null && (
        <Modal onClose={closeDirectoryPlayerEdit}>
          <h2 className="font-heading text-lg font-bold mb-3">Edit player</h2>
          <form onSubmit={handleDirectoryPlayerEditSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="First Name *">
                <input
                  type="text"
                  value={directoryPlayerEditForm.firstName}
                  onChange={(e) => setDirectoryPlayerEditForm((f) => ({ ...f, firstName: e.target.value }))}
                  className={inputClass}
                  required
                />
              </Field>
              <Field label="Last Name *">
                <input
                  type="text"
                  value={directoryPlayerEditForm.lastName}
                  onChange={(e) => setDirectoryPlayerEditForm((f) => ({ ...f, lastName: e.target.value }))}
                  className={inputClass}
                  required
                />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Nationality">
                <input
                  type="text"
                  value={directoryPlayerEditForm.nationality}
                  onChange={(e) => setDirectoryPlayerEditForm((f) => ({ ...f, nationality: e.target.value }))}
                  className={inputClass}
                />
              </Field>
              <Field label="Bats">
                <select
                  value={directoryPlayerEditForm.bats}
                  onChange={(e) => setDirectoryPlayerEditForm((f) => ({ ...f, bats: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">—</option>
                  {BATS_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Throws">
                <select
                  value={directoryPlayerEditForm.throws}
                  onChange={(e) => setDirectoryPlayerEditForm((f) => ({ ...f, throws: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">—</option>
                  {THROWS_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Date of Birth">
              <input
                type="date"
                value={directoryPlayerEditForm.dateOfBirth}
                onChange={(e) => setDirectoryPlayerEditForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                className={inputClass}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Height (cm)">
                <input
                  type="number"
                  value={directoryPlayerEditForm.heightCm}
                  onChange={(e) => setDirectoryPlayerEditForm((f) => ({ ...f, heightCm: e.target.value }))}
                  className={inputClass}
                  min={1}
                />
              </Field>
              <Field label="Weight (kg)">
                <input
                  type="number"
                  value={directoryPlayerEditForm.weightKg}
                  onChange={(e) => setDirectoryPlayerEditForm((f) => ({ ...f, weightKg: e.target.value }))}
                  className={inputClass}
                  min={1}
                />
              </Field>
            </div>
            <Field label="Bio">
              <textarea
                value={directoryPlayerEditForm.bio}
                onChange={(e) => setDirectoryPlayerEditForm((f) => ({ ...f, bio: e.target.value }))}
                className={inputClass}
                rows={3}
              />
            </Field>
            <ModalActions onCancel={closeDirectoryPlayerEdit} saving={saving} label="Save" />
          </form>
        </Modal>
      )}

      {/* ── Add player to another team modal ── */}
      {showMoveModal && movingPlayer && (
        <Modal onClose={() => { setShowMoveModal(false); setMovingPlayer(null); }}>
          <h2 className="font-heading text-lg font-bold mb-3">
            Add {movingPlayer.firstName} {movingPlayer.lastName} to another team
          </h2>
          <form onSubmit={handleMoveSubmit} className="space-y-4">
            <Field label="Add to team *">
              <select value={moveTargetTeamId} onChange={e => setMoveTargetTeamId(e.target.value)} className={inputClass} required>
                <option value="">Select team...</option>
                {teams.filter(t => !rosterTeamIdsByPlayer.get(movingPlayer.playerId)?.has(t.id)).map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </Field>
            <ModalActions onCancel={() => { setShowMoveModal(false); setMovingPlayer(null); }} saving={saving} label="Add to Team" />
          </form>
        </Modal>
      )}
    </div>
  );
}

/* ───── small reusable bits ───── */

function Modal({
  children,
  onClose,
  size = 'md',
}: {
  children: React.ReactNode;
  onClose: () => void;
  size?: 'md' | 'lg';
}) {
  const maxW = size === 'lg' ? 'max-w-2xl' : 'max-w-lg';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className={`bg-surface rounded-xl border border-border shadow-2xl w-full ${maxW} mx-4 p-6 max-h-[90vh] overflow-y-auto`}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-text-muted mb-1">{label}</label>
      {children}
    </div>
  );
}

function ModalActions({ onCancel, saving, label = 'Save' }: { onCancel: () => void; saving: boolean; label?: string }) {
  return (
    <div className="flex justify-end gap-3 pt-2">
      <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text transition-colors">
        Cancel
      </button>
      <button type="submit" disabled={saving} className="px-4 py-2 bg-accent hover:bg-accent-light text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
        {saving ? 'Saving...' : label}
      </button>
    </div>
  );
}
