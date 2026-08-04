/**
 * Sauvegarde en ligne du profil — Firebase Auth (Google) + Firestore lite.
 *
 * Le profil COMPLET (code ami, pseudo, avatar, liste d'amis) est copié dans
 * `users/{uid}` : se connecter avec le même compte Google sur un autre
 * appareil restaure tout — le code ami reste identique, les amitiés survivent.
 *
 * Sans configuration (VITE_FIREBASE_* absents), tout est désactivé proprement :
 * l'app fonctionne comme avant, 100 % locale.
 */
import type { Friend, Profile } from './profile'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}

export function cloudEnabled(): boolean {
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId)
}

export interface CloudUser {
  uid: string
  name: string
  email: string
  photo: string | null
}

export interface CloudSave {
  profile: Profile
  friends: Friend[]
}

/* Modules chargés à la demande : le SDK Firebase ne pèse sur personne
   tant que la sauvegarde en ligne n'est pas configurée/utilisée. */
type FirebaseBits = {
  auth: import('firebase/auth').Auth
  db: import('firebase/firestore/lite').Firestore
  authMod: typeof import('firebase/auth')
  dbMod: typeof import('firebase/firestore/lite')
}

let bits: Promise<FirebaseBits> | null = null

function firebase(): Promise<FirebaseBits> {
  bits ??= (async () => {
    const [{ initializeApp }, authMod, dbMod] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore/lite'),
    ])
    const app = initializeApp({
      apiKey: config.apiKey!,
      authDomain: config.authDomain!,
      projectId: config.projectId!,
      appId: config.appId!,
    })
    return { auth: authMod.getAuth(app), db: dbMod.getFirestore(app), authMod, dbMod }
  })()
  return bits
}

function toCloudUser(u: import('firebase/auth').User): CloudUser {
  return {
    uid: u.uid,
    name: u.displayName ?? '',
    email: u.email ?? '',
    photo: u.photoURL,
  }
}

/** S'abonner à l'état de connexion Google. Retourne une fonction de désabonnement. */
export function watchCloudAuth(cb: (user: CloudUser | null) => void): () => void {
  if (!cloudEnabled()) return () => {}
  let unsub: (() => void) | null = null
  let cancelled = false
  void firebase().then(({ auth, authMod }) => {
    if (cancelled) return
    unsub = authMod.onAuthStateChanged(auth, (u) => cb(u ? toCloudUser(u) : null))
  })
  return () => {
    cancelled = true
    unsub?.()
  }
}

export async function signInWithGoogle(): Promise<void> {
  const { auth, authMod } = await firebase()
  const provider = new authMod.GoogleAuthProvider()
  await authMod.signInWithPopup(auth, provider)
}

export async function signOutCloud(): Promise<void> {
  const { auth, authMod } = await firebase()
  await authMod.signOut(auth)
}

/** Lit la sauvegarde en ligne (null si première connexion). */
export async function pullCloudSave(uid: string): Promise<CloudSave | null> {
  const { db, dbMod } = await firebase()
  const snap = await dbMod.getDoc(dbMod.doc(db, 'users', uid))
  if (!snap.exists()) return null
  const data = snap.data() as Partial<CloudSave>
  if (!data.profile || typeof data.profile.id !== 'string') return null
  return {
    profile: {
      id: data.profile.id,
      pseudo: (data.profile.pseudo ?? '').toString(),
      avatar: (data.profile.avatar ?? '').toString() || '😎',
    },
    friends: Array.isArray(data.friends)
      ? data.friends
          .filter((f) => typeof f?.id === 'string')
          .map((f) => ({
            id: f.id,
            pseudo: (f.pseudo ?? '').toString().trim(),
            avatar: (f.avatar ?? '').toString().trim() || '❔',
          }))
      : [],
  }
}

/** Pousse le profil + amis de cet appareil vers la sauvegarde en ligne. */
export async function pushCloudSave(uid: string, save: CloudSave): Promise<void> {
  const { db, dbMod } = await firebase()
  await dbMod.setDoc(dbMod.doc(db, 'users', uid), {
    profile: save.profile,
    friends: save.friends,
    updatedAt: Date.now(),
  })
}
