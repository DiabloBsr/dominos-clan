import { useMemo } from 'react'

/**
 * 🎉 Pluie de confettis — montée une fois par victoire (la `key` du parent
 * change avec le résultat). Pur CSS : 90 brins générés avec des trajectoires
 * aléatoires, aucun canvas, aucun coût quand ce n'est pas monté.
 */
const COLORS = ['#ffb648', '#e2574c', '#6abe7a', '#9fd4ff', '#f7f2e7', '#ff8fd1']

export function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.9,
        duration: 2.2 + Math.random() * 1.6,
        size: 6 + Math.random() * 7,
        color: COLORS[i % COLORS.length]!,
        spin: (Math.random() * 2 - 1) * 720,
        drift: (Math.random() * 2 - 1) * 18,
      })),
    [],
  )
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.45,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            ['--spin' as string]: `${p.spin}deg`,
            ['--drift' as string]: `${p.drift}vw`,
          }}
        />
      ))}
    </div>
  )
}
