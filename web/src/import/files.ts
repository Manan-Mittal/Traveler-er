import { strFromU8, unzipSync } from 'fflate'
import { parseTakeoutFile, type RawPlace } from './takeout'

/** Inside a Takeout zip, lists live in Saved/*.csv and starred places in "Saved Places.json". Skip reviews and the rest. */
const wanted = (path: string) => /(^|\/)Saved\/[^/]+\.csv$/i.test(path) || /(^|\/)Saved Places\.json$/i.test(path)

/** Read Takeout files the user picked: list CSVs, Saved Places.json, or the whole Takeout .zip. */
export async function readTakeout(files: File[]): Promise<{ places: RawPlace[]; lists: string[]; skipped: string[] }> {
  const entries: { path: string; text: string }[] = []
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      const zip = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: (e) => wanted(e.name) })
      for (const [path, data] of Object.entries(zip)) entries.push({ path, text: strFromU8(data) })
    } else entries.push({ path: f.name, text: await f.text() })
  }
  const places: RawPlace[] = []
  const lists: string[] = []
  const skipped: string[] = []
  for (const e of entries) {
    try {
      const got = parseTakeoutFile(e.path, e.text)
      if (got === null) continue
      if (got.length) {
        places.push(...got)
        lists.push(got[0].listName)
      }
    } catch {
      skipped.push(e.path.split('/').pop()!)
    }
  }
  return { places, lists, skipped }
}
