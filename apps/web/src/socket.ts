import { io, type Socket } from 'socket.io-client'

// En dev, le serveur tourne à part sur :4001 ; en prod (Docker/Space),
// c'est lui qui sert le client → même origine.
const url =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ??
  (import.meta.env.DEV ? 'http://localhost:4001' : window.location.origin)

export const socket: Socket = io(url, { transports: ['websocket', 'polling'] })

export type Ack =
  | { ok: true; code?: string; selfId?: string }
  | { ok: false; error: string }
