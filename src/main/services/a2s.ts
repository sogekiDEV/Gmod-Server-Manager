import dgram from 'dgram'
import type { ServerInfo } from '@shared/types'

const HEADER = Buffer.from([0xff, 0xff, 0xff, 0xff])

function buildRequest(challenge?: Buffer): Buffer {
  const parts: Uint8Array[] = [HEADER, Buffer.from([0x54]), Buffer.from('Source Engine Query\0', 'ascii')]
  if (challenge) parts.push(challenge)
  return Buffer.concat(parts)
}

export function parseInfo(data: Buffer, pingMs = 0): ServerInfo | null {
  if (data.length < 6 || !data.subarray(0, 4).equals(HEADER) || data[4] !== 0x49) return null
  let p = 6
  const readString = (): string => {
    const start = p
    while (p < data.length && data[p] !== 0) p++
    const text = data.toString('utf8', start, p)
    p++
    return text
  }
  const name = readString()
  const map = readString()
  readString()
  readString()
  p += 2
  if (p + 3 > data.length) return null
  return { name, map, players: data[p], maxPlayers: data[p + 1], bots: data[p + 2], pingMs }
}

function exchange(socket: dgram.Socket, host: string, port: number, payload: Buffer, timeoutMs: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.removeListener('message', onMessage)
      resolve(null)
    }, timeoutMs)
    const onMessage = (message: Buffer): void => {
      clearTimeout(timer)
      socket.removeListener('message', onMessage)
      resolve(message)
    }
    socket.once('message', onMessage)
    socket.send(payload, port, host, (error) => {
      if (error) {
        clearTimeout(timer)
        socket.removeListener('message', onMessage)
        resolve(null)
      }
    })
  })
}

export async function queryServer(host: string, port: number, timeoutMs = 900): Promise<ServerInfo | null> {
  const socket = dgram.createSocket('udp4')
  socket.on('error', () => undefined)
  const started = Date.now()
  try {
    let reply = await exchange(socket, host, port, buildRequest(), timeoutMs)
    if (reply && reply.length >= 9 && reply[4] === 0x41) {
      reply = await exchange(socket, host, port, buildRequest(reply.subarray(5, 9)), timeoutMs)
    }
    return reply ? parseInfo(reply, Date.now() - started) : null
  } finally {
    socket.close()
  }
}
