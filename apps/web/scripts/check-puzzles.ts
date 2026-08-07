/**
 * Vérifie CHAQUE puzzle de la section Apprendre avec chess.js :
 *  - la position se charge et le bon camp est au trait ;
 *  - le coup solution (from → to) est légal ;
 *  - il donne bien échec et MAT ;
 *  - la notation affichée correspond au coup réellement joué ;
 *  - le mat est UNIQUE (sinon le joueur peut trouver une autre solution
 *    correcte et l'app la refuserait — piège classique).
 */
import { Chess } from 'chess.js'
import { PUZZLES } from '../src/learn/content'

let failed = 0

for (const p of PUZZLES) {
  const chess = new Chess()
  try {
    chess.load(p.fen)
  } catch (e) {
    console.error(`❌ ${p.id} : FEN invalide — ${(e as Error).message}`)
    failed++
    continue
  }

  if (chess.turn() !== p.side) {
    console.error(`❌ ${p.id} : trait annoncé « ${p.side} », FEN dit « ${chess.turn()} »`)
    failed++
    continue
  }

  // Tous les mats en 1 disponibles dans la position.
  const mates: string[] = []
  for (const m of chess.moves({ verbose: true })) {
    const probe = new Chess(p.fen)
    probe.move({ from: m.from, to: m.to, promotion: m.promotion ?? 'q' })
    if (probe.isCheckmate()) mates.push(`${m.from}${m.to}`)
  }

  let played
  try {
    played = chess.move({ from: p.from, to: p.to, promotion: p.promotion ?? 'q' })
  } catch {
    console.error(`❌ ${p.id} : coup ${p.from}→${p.to} ILLÉGAL dans cette position`)
    failed++
    continue
  }

  if (!chess.isCheckmate()) {
    console.error(`❌ ${p.id} : ${played.san} ne donne PAS échec et mat`)
    failed++
    continue
  }
  if (played.san !== p.solutionSan) {
    console.error(`❌ ${p.id} : notation annoncée « ${p.solutionSan} », réelle « ${played.san} »`)
    failed++
    continue
  }
  if (mates.length !== 1) {
    console.error(`❌ ${p.id} : ${mates.length} mats en 1 possibles (${mates.join(', ')}) — solution ambiguë`)
    failed++
    continue
  }
  console.log(`✅ ${p.id} — ${played.san} (${p.title})`)
}

if (failed > 0) {
  console.error(`\n${failed} puzzle(s) invalide(s) sur ${PUZZLES.length}.`)
  process.exit(1)
}
console.log(`\n🎉 ${PUZZLES.length} puzzles valides : mat en 1, unique, notation exacte.`)
