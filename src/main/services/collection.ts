const ENDPOINT = 'https://api.steampowered.com/ISteamRemoteStorage/GetCollectionDetails/v1/'

export class CollectionError extends Error {}

interface CollectionResponse {
  response?: {
    collectiondetails?: Array<{
      result?: number
      children?: Array<{ publishedfileid: string; filetype: number }>
    }>
  }
}

export type CollectionFetcher = (collectionId: string) => Promise<Set<string>>

export async function fetchCollectionIds(collectionId: string, fetchFn: typeof fetch = fetch): Promise<Set<string>> {
  const ids = new Set<string>()
  const seen = new Set<string>()
  const queue = [collectionId]

  while (queue.length > 0) {
    const id = queue.shift() as string
    if (seen.has(id) || seen.size >= 50) continue
    seen.add(id)

    const body = new URLSearchParams({ collectioncount: '1', 'publishedfileids[0]': id })
    let response: Response
    try {
      response = await fetchFn(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(15000)
      })
    } catch (error) {
      throw new CollectionError(`request failed: ${(error as Error).message}`)
    }
    if (!response.ok) throw new CollectionError(`HTTP ${response.status}`)

    const json = (await response.json()) as CollectionResponse
    const details = json.response?.collectiondetails?.[0]
    if (!details || details.result !== 1) throw new CollectionError('collection not found')

    for (const child of details.children ?? []) {
      if (child.filetype === 2) queue.push(String(child.publishedfileid))
      else ids.add(String(child.publishedfileid))
    }
  }
  return ids
}
