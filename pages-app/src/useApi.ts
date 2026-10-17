import { useEffect, useState } from 'react'

export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(Boolean(url))
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setData(null)
    setError('')
    setLoading(Boolean(url))
    if (!url) return () => controller.abort()
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as T & { error?: string }
        if (!response.ok) throw new Error(body.error || '请求失败，请稍后重试。')
        return body as T
      })
      .then((body) => {
        if (!controller.signal.aborted) setData(body)
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : '网络连接失败。')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [url, attempt])
  return { data, error, loading, retry: () => setAttempt((value) => value + 1) }
}
