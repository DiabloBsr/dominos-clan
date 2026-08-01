import { io, type Socket } from 'socket.io-client'

const url = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? 'http://localhost:4001'

export const socket: Socket = io(url, { transports: ['websocket', 'polling'] })

export type Ack =
  | { ok: true; code?: string; selfId?: string }
  | { ok: false; error: string }
