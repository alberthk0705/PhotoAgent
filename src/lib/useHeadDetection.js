import { useCallback, useEffect, useRef, useState } from 'react'
import { detectHeads } from './faces.js'

/**
 * Runs head detection for one photo, on demand.
 * `heads` is null until a run finishes, then an array (possibly empty).
 */
export function useHeadDetection(photo) {
  const [heads, setHeads] = useState(null)
  const [status, setStatus] = useState('idle') // idle | loading | done | error
  const [error, setError] = useState('')
  const runId = useRef(0)

  // Results belong to one photo; switching photos discards them.
  useEffect(() => {
    runId.current++
    setHeads(null)
    setStatus('idle')
    setError('')
  }, [photo?.id])

  const run = useCallback(async () => {
    if (!photo) return
    const id = ++runId.current
    setStatus('loading')
    setError('')
    try {
      const found = await detectHeads(photo)
      if (id !== runId.current) return // a newer run (or photo) superseded this one
      setHeads(found)
      setStatus('done')
    } catch (err) {
      if (id !== runId.current) return
      setError(err?.message || 'Detection failed')
      setStatus('error')
    }
  }, [photo])

  const clear = useCallback(() => {
    runId.current++
    setHeads(null)
    setStatus('idle')
    setError('')
  }, [])

  return { heads, status, error, run, clear }
}
