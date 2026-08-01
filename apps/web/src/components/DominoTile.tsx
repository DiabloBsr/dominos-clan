/** Position des points sur une grille 3×3 (indices 0..8) pour chaque valeur 0..6. */
const PIP_LAYOUT: readonly (readonly number[])[] = [
  [],
  [4],
  [0, 8],
  [0, 4, 8],
  [0, 2, 6, 8],
  [0, 2, 4, 6, 8],
  [0, 2, 3, 5, 6, 8],
]

function Half({ value }: { value: number }) {
  const layout = PIP_LAYOUT[value] ?? []
  return (
    <span className="half">
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} className={layout.includes(i) ? 'pip on' : 'pip'} />
      ))}
    </span>
  )
}

export function DominoTile({
  a,
  b,
  vertical = false,
  size = 'md',
  playable = false,
  selected = false,
  onClick,
}: {
  a: number
  b: number
  vertical?: boolean
  size?: 'sm' | 'md'
  playable?: boolean
  selected?: boolean
  onClick?: () => void
}) {
  const classes = [
    'domino',
    vertical ? 'v' : 'h',
    size,
    playable ? 'playable' : '',
    selected ? 'selected' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type="button" className={classes} onClick={onClick} disabled={!onClick} aria-label={`Domino ${a}-${b}`}>
      <Half value={a} />
      <span className="divider" />
      <Half value={b} />
    </button>
  )
}

/** Dos de domino (main adverse : on ne voit que le nombre). */
export function DominoBack({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  return <span className={`domino back ${size}`} aria-hidden="true" />
}
