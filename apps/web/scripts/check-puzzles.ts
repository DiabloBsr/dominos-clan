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

/** Coups qui matent immédiatement dans cette position. */
function matesInOne(fen: string): string[] {
  const chess = new Chess(fen)
  const out: string[] = []
  for (const m of chess.moves({ verbose: true })) {
    const probe = new Chess(fen)
    probe.move({ from: m.from, to: m.to, promotion: m.promotion ?? 'q' })
    if (probe.isCheckmate()) out.push(`${m.from}${m.to}`)
  }
  return out
}

/** Coups qui forcent le mat au coup suivant quelle que soit la défense. */
function matesInTwo(fen: string): string[] {
  const chess = new Chess(fen)
  const out: string[] = []
  for (const m of chess.moves({ verbose: true })) {
    const afterWhite = new Chess(fen)
    afterWhite.move({ from: m.from, to: m.to, promotion: m.promotion ?? 'q' })
    if (afterWhite.isCheckmate() || afterWhite.isStalemate() || afterWhite.isDraw()) continue
    const replies = afterWhite.moves({ verbose: true })
    if (replies.length === 0) continue
    const forced = replies.every((reply) => {
      const afterBlack = new Chess(afterWhite.fen())
      afterBlack.move({ from: reply.from, to: reply.to, promotion: reply.promotion ?? 'q' })
      return matesInOne(afterBlack.fen()).length > 0
    })
    if (forced) out.push(`${m.from}${m.to}`)
  }
  return out
}

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

  // Solutions possibles au niveau annoncé : il doit y en avoir EXACTEMENT une.
  const solutions = p.level === 1 ? matesInOne(p.fen) : matesInTwo(p.fen)

  let played
  try {
    played = chess.move({ from: p.from, to: p.to, promotion: p.promotion ?? 'q' })
  } catch {
    console.error(`❌ ${p.id} : coup ${p.from}→${p.to} ILLÉGAL dans cette position`)
    failed++
    continue
  }

  if (p.level === 1 && !chess.isCheckmate()) {
    console.error(`❌ ${p.id} : ${played.san} ne donne PAS échec et mat`)
    failed++
    continue
  }
  if (p.level === 2) {
    if (chess.isCheckmate()) {
      console.error(`❌ ${p.id} : annoncé mat en 2 mais ${played.san} mate déjà`)
      failed++
      continue
    }
    if (matesInOne(p.fen).length > 0) {
      console.error(`❌ ${p.id} : un mat en 1 existe — le puzzle n’est pas un vrai mat en 2`)
      failed++
      continue
    }
  }
  if (played.san !== p.solutionSan) {
    console.error(`❌ ${p.id} : notation annoncée « ${p.solutionSan} », réelle « ${played.san} »`)
    failed++
    continue
  }
  if (!solutions.includes(`${p.from}${p.to}`)) {
    console.error(`❌ ${p.id} : ${played.san} ne force pas le mat en ${p.level}`)
    failed++
    continue
  }
  if (solutions.length !== 1) {
    console.error(
      `❌ ${p.id} : ${solutions.length} premiers coups gagnants (${solutions.join(', ')}) — solution ambiguë`,
    )
    failed++
    continue
  }
  console.log(`✅ ${p.id} — mat en ${p.level} : ${played.san} (${p.title})`)
}

if (failed > 0) {
  console.error(`\n${failed} puzzle(s) invalide(s) sur ${PUZZLES.length}.`)
  process.exit(1)
}
const n1 = PUZZLES.filter((p) => p.level === 1).length
const n2 = PUZZLES.filter((p) => p.level === 2).length
console.log(
  `\n🎉 ${PUZZLES.length} puzzles valides (${n1} mats en 1, ${n2} mats en 2) : mat forcé, premier coup unique, notation exacte.`,
)
