/**
 * Confirmation MAISON : popup centrée aux couleurs de l'app (veil + carte),
 * remplace les window.confirm natifs du navigateur partout dans le jeu.
 */
export interface ConfirmRequest {
  message: string
  /** Libellé du bouton d'action (défaut « Confirmer »). */
  yesLabel?: string
  onYes: () => void
}

export function ConfirmBox({
  req,
  onClose,
}: {
  req: ConfirmRequest | null
  onClose: () => void
}) {
  if (!req) return null
  return (
    <>
      <div className="panel-veil confirm-veil" onClick={onClose} />
      <div className="game-modal card confirm-box" role="alertdialog" aria-modal="true">
        <p className="confirm-msg">{req.message}</p>
        <div className="lobby-actions">
          <button className="btn ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn danger"
            onClick={() => {
              req.onYes()
              onClose()
            }}
          >
            {req.yesLabel ?? 'Confirmer'}
          </button>
        </div>
      </div>
    </>
  )
}
