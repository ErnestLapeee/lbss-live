import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
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

interface Player {
  id: number;
  firstName: string;
  lastName: string;
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
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [leaguesForSeason, setLeaguesForSeason] = useState<LeagueOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Team create/edit form
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamWithRoster | null>(null);
  const [teamForm, setTeamForm] = useState({ name: '', shortName: '', city: '', foundedYear: '', description: '', logoUrl: '' });
  /** When creating a team and the season has multiple leagues, which league gets the initial league_teams row. */
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

  // Add player to another team modal
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [movingPlayer, setMovingPlayer] = useState<RosterPlayer | null>(null);
  const [moveTargetTeamId, setMoveTargetTeamId] = useState('');

  const [saving, setSaving] = useState(false);

  /* ───── data loading ───── */
  const loadRosters = useCallback(async () => {
    if (!selectedSeasonId) return;
    setLoading(true);
    setError(null);
    try {
      const [rostersData, playersData, leaguesData] = await Promise.all([
        apiGet<TeamWithRoster[]>(`/admin/teams/rosters?seasonId=${selectedSeasonId}`),
        apiGet<Player[]>('/admin/players'),
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
    } catch (err: any) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [selectedSeasonId]);

  useEffect(() => {
    if (!selectedSeasonId) return;
    loadRosters();
  }, [selectedSeasonId, loadRosters]);

  /* ───── derived: roster membership ───── */
  const rosterTeamIdsByPlayer = new Map<number, Set<number>>();
  for (const team of teams) {
    for (const player of team.players) {
      const teamIds = rosterTeamIdsByPlayer.get(player.playerId) ?? new Set<number>();
      teamIds.add(team.id);
      rosterTeamIdsByPlayer.set(player.playerId, teamIds);
    }
  }
  const getAssignablePlayers = (teamId: number | null) => {
    if (!teamId) return [];
    return allPlayers.filter((p) => p.isActive && !rosterTeamIdsByPlayer.get(p.id)?.has(teamId));
  };
  const unassignedPlayers = allPlayers.filter(p => p.isActive && !rosterTeamIdsByPlayer.has(p.id));

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
      await loadRosters();
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
      await loadRosters();
    } catch (err: any) {
      alert(err.message || 'Failed');
    }
  };

  const handleReactivateTeam = async (teamId: number) => {
    try {
      await apiPost(`/admin/teams/${teamId}/reactivate`, {});
      await loadRosters();
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
      await loadRosters();
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
    setShowAssignModal(true);
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignToTeamId || !selectedSeasonId) return;
    setSaving(true);
    try {
      await apiPost(`/admin/players/${assignForm.playerId}/roster`, {
        teamId: assignToTeamId,
        seasonId: selectedSeasonId,
        jerseyNumber: assignForm.jerseyNumber || undefined,
      });
      setShowAssignModal(false);
      await loadRosters();
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
      await loadRosters();
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
      await loadRosters();
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
        <div>
          <h1 className="font-heading text-2xl font-bold">Teams & Rosters</h1>
          <p className="text-sm text-text-muted mt-1 max-w-3xl">
            Rosters use the workspace season in the top bar. To attach teams to a league and bulk-copy last
            season&apos;s rosters, use{' '}
            <Link to="/season-setup" className="text-accent hover:text-accent-light font-medium">
              Season setup
            </Link>
            . New teams are registered in the workspace season only (via the season&apos;s league). The roster grid lists
            only clubs that have a league slot or roster row in that season. Deactivating a club (trash icon) is only
            allowed when it has no league membership, roster history, or games; it is organization-wide, not per season. To
            remove a team from one year only, uncheck it under Season setup and save.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateTeam}
          disabled={!selectedSeasonId || loading || leaguesForSeason.length === 0}
          title={
            !selectedSeasonId
              ? 'Choose a workspace season first'
              : loading
                ? 'Loading…'
                : leaguesForSeason.length === 0
                  ? 'Create a league for this season under Leagues before adding teams'
                  : undefined
          }
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
        <div className="text-center py-16 text-text-muted">
          <p className="text-lg mb-2">No season available</p>
          <p className="text-sm">Create a season on the Seasons page, then choose it in the workspace menu above.</p>
        </div>
      ) : loading ? (
        <div className="text-center py-16 text-text-muted">Loading rosters...</div>
      ) : teams.length === 0 ? (
        <div className="text-center py-16 text-text-muted">
          <p className="text-lg mb-2">No teams yet</p>
          <p className="text-sm">Click "+ Add Team" to create your first team.</p>
        </div>
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
                        <h3 className="font-heading font-bold text-base">{team.name}</h3>
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
                        title="Edit team"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      {team.isActive ? (
                        <button
                          onClick={() => handleDeleteTeam(team.id)}
                          className="p-1.5 text-text-muted hover:text-red-500 rounded transition-colors"
                          title="Deactivate club (organization-wide, when no league/roster/games)"
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
                          title="Restore club as active everywhere"
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
                          title={p.licensePaid === 'paid' ? 'License paid — click to mark unpaid' : 'License unpaid — click to mark paid'}
                        >
                          {p.licensePaid === 'paid' ? 'Licensed' : 'Unpaid'}
                        </button>
                        {/* actions */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openMovePlayer(p)}
                            className="p-1 text-text-muted hover:text-accent rounded"
                            title="Add to another team"
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

          {/* ── Unassigned players ── */}
          {unassignedPlayers.length > 0 && (
            <div className="mt-8">
              <h2 className="font-heading text-lg font-bold mb-3 text-text-muted">
                Unassigned Players ({unassignedPlayers.length})
              </h2>
              <div className="flex flex-wrap gap-2">
                {unassignedPlayers.map(p => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border rounded-lg text-sm"
                  >
                    {p.firstName} {p.lastName}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════ MODALS ═══════ */}

      {/* ── Team form modal ── */}
      {showTeamForm && (
        <Modal onClose={() => setShowTeamForm(false)}>
          <h2 className="font-heading text-xl font-bold mb-4">
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
            {!editingTeam && leaguesForSeason.length === 1 && (
              <p className="text-xs text-text-muted">
                This team will join <strong>{leaguesForSeason[0]!.name}</strong> for the workspace season.
              </p>
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
          <h2 className="font-heading text-xl font-bold mb-4">
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
        <Modal onClose={() => setShowAssignModal(false)}>
          <h2 className="font-heading text-xl font-bold mb-4">
            Assign Player to {teams.find(t => t.id === assignToTeamId)?.name}
          </h2>
          <form onSubmit={handleAssignSubmit} className="space-y-4">
            <Field label="Player *">
              <select value={assignForm.playerId} onChange={e => setAssignForm(f => ({ ...f, playerId: e.target.value }))} className={inputClass} required>
                <option value="">Select player...</option>
                {getAssignablePlayers(assignToTeamId).map(p => (
                  <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
                ))}
              </select>
            </Field>
            <Field label="Jersey #">
              <input type="text" value={assignForm.jerseyNumber} onChange={e => setAssignForm(f => ({ ...f, jerseyNumber: e.target.value }))} className={inputClass} placeholder="e.g. 7" />
            </Field>
            <ModalActions onCancel={() => setShowAssignModal(false)} saving={saving} label="Assign" />
          </form>
        </Modal>
      )}

      {/* ── Add player to another team modal ── */}
      {showMoveModal && movingPlayer && (
        <Modal onClose={() => { setShowMoveModal(false); setMovingPlayer(null); }}>
          <h2 className="font-heading text-xl font-bold mb-4">
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
            <p className="text-xs text-text-muted">
              This keeps their existing roster entry, so past and future games can use the correct team.
            </p>
            <ModalActions onCancel={() => { setShowMoveModal(false); setMovingPlayer(null); }} saving={saving} label="Add to Team" />
          </form>
        </Modal>
      )}
    </div>
  );
}

/* ───── small reusable bits ───── */

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-surface rounded-xl border border-border shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
