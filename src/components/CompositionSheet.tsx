import { useState } from 'react'
import { X, ArrowLeftRight } from 'lucide-react'
import { useFootballPositions } from '../hooks/useFootballPositions'

interface StarterInfo {
  id: string
  member_id: string
  playerName: string
  position_id: string | null
  positionName: string | null
}

interface CompositionSheetProps {
  jerseyNumber?: number | null
  open: boolean
  onClose: () => void
  playerName: string
  currentRole: 'starter' | 'sub' | null
  currentPositionId: string | null
  defaultPositionId: string | null
  startersAtLimit: boolean
  currentStarters: StarterInfo[]
  onSave: (role: 'starter' | 'sub' | null, positionId: string | null) => void
  onSwap: (outgoingId: string, incomingPositionId: string | null) => void
  saving?: boolean
}

export function CompositionSheet({
  jerseyNumber,
  open,
  onClose,
  playerName,
  currentRole,
  currentPositionId,
  defaultPositionId,
  startersAtLimit,
  currentStarters,
  onSave,
  onSwap,
  saving = false,
}: CompositionSheetProps) {
  const { grouped, loading } = useFootballPositions()
  const [role, setRole] = useState<'starter' | 'sub' | null>(currentRole)
  const [positionId, setPositionId] = useState<string | null>(
    currentPositionId || defaultPositionId
  )
  const [swapMode, setSwapMode] = useState(false)

  if (!open) return null

  const needsSwap = startersAtLimit && currentRole !== 'starter'

  const handleRoleChange = (newRole: 'starter' | 'sub' | null) => {
    if (newRole === 'starter' && needsSwap) {
      setRole('starter')
      setSwapMode(true)
      return
    }
    setRole(newRole)
    setSwapMode(false)
    if (newRole === null) {
      onSave(null, null)
      onClose()
    }
  }

  const handleSwapPick = (outgoing: StarterInfo) => {
    onSwap(outgoing.id, outgoing.position_id)
    onClose()
  }

  const handleConfirm = () => {
    onSave(role, role ? positionId : null)
    onClose()
  }

  return (
    <>
      <div className="compo-sheet-backdrop" onClick={onClose} />
      <div className="compo-sheet">
        <div className="compo-sheet-header">
          <span className="compo-sheet-title">{jerseyNumber != null && <span style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', marginRight: '6px' }}>#{jerseyNumber}</span>}{playerName}</span>
          <button onClick={onClose} className="compo-sheet-close">
            <X size={20} />
          </button>
        </div>

        {/* Swap picker mode */}
        {swapMode ? (
          <div className="compo-sheet-section">
            <div className="compo-sheet-label">
              <ArrowLeftRight size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
              {playerName} remplace quel titulaire ?
            </div>
            <div className="compo-swap-list">
              {currentStarters.map(s => (
                <button
                  key={s.id}
                  className="compo-swap-item"
                  onClick={() => handleSwapPick(s)}
                  disabled={saving}
                >
                  <span className="compo-swap-name">{s.playerName}</span>
                  {s.positionName && (
                    <span className="compo-swap-pos">{s.positionName}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="compo-sheet-footer">
              <button
                className="compo-cancel-btn"
                onClick={() => { setSwapMode(false); setRole(currentRole) }}
                disabled={saving}
              >
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Role choice */}
            <div className="compo-sheet-section">
              <div className="compo-sheet-label">Rôle</div>
              <div className="compo-role-group">
                <button
                  className={`compo-role-btn ${role === 'starter' ? 'compo-role-btn--active' : ''}`}
                  onClick={() => handleRoleChange('starter')}
                  disabled={saving}
                >
                  Titulaire
                  {needsSwap && <span className="compo-role-hint"> (remplacement)</span>}
                </button>
                <button
                  className={`compo-role-btn ${role === 'sub' ? 'compo-role-btn--active' : ''}`}
                  onClick={() => handleRoleChange('sub')}
                  disabled={saving}
                >
                  Remplaçant
                </button>
                <button
                  className={`compo-role-btn compo-role-btn--remove ${role === null && currentRole !== null ? 'compo-role-btn--active' : ''}`}
                  onClick={() => handleRoleChange(null)}
                  disabled={saving}
                >
                  Retirer de la compo
                </button>
              </div>
            </div>

            {/* Position picker (only if role is set) */}
            {role && (
              <div className="compo-sheet-section">
                <div className="compo-sheet-label">Poste</div>
                {loading ? (
                  <div className="compo-positions-loading">Chargement...</div>
                ) : (
                  <div className="compo-positions-list">
                    {grouped.map(group => (
                      <div key={group.category} className="compo-pos-group">
                        <div className="compo-pos-category">{group.category}</div>
                        {group.positions.map(pos => (
                          <button
                            key={pos.id}
                            className={`compo-pos-item ${positionId === pos.id ? 'compo-pos-item--selected' : ''}`}
                            onClick={() => setPositionId(pos.id)}
                            disabled={saving}
                          >
                            {pos.name}
                            {pos.id === defaultPositionId && (
                              <span className="compo-pos-default">principal</span>
                            )}
                          </button>
                        ))}
                      </div>
                    ))}
                    <button
                      className={`compo-pos-item ${positionId === null ? 'compo-pos-item--selected' : ''}`}
                      onClick={() => setPositionId(null)}
                      disabled={saving}
                    >
                      Aucun poste
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Confirm button */}
            {role && (
              <div className="compo-sheet-footer">
                <button
                  className="compo-confirm-btn"
                  onClick={handleConfirm}
                  disabled={saving}
                >
                  {saving ? 'Enregistrement...' : 'Confirmer'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
