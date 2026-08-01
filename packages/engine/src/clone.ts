/**
 * Clone profond pour les données du jeu (objets/tableaux/nombres/chaînes uniquement).
 * JSON suffit ici et fonctionne partout (Node + navigateurs) sans dépendance.
 */
export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
