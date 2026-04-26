'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body style={{ fontFamily: 'monospace', padding: '20px', background: '#fff' }}>
        <h2 style={{ color: '#e00' }}>客户端错误</h2>
        <pre style={{ background: '#f5f5f5', padding: '12px', overflowX: 'auto', fontSize: '12px' }}>
          {error?.message}
          {'\n\n'}
          {error?.stack}
        </pre>
        <button onClick={reset} style={{ marginTop: '12px', padding: '8px 16px', cursor: 'pointer' }}>
          重试
        </button>
      </body>
    </html>
  )
}
