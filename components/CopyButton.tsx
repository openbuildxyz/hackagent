'use client'

import { useState, type ReactNode } from 'react'
import { Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'

export async function copyToClipboard(text: string): Promise<boolean> {
  let ok = false
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      ok = true
    }
  } catch {
    // fall through to execCommand
  }
  if (!ok && typeof document !== 'undefined') {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      ok = document.execCommand('copy')
      document.body.removeChild(ta)
    } catch {
      ok = false
    }
  }
  return ok
}

export type CopyButtonProps = {
  value: string
  className?: string
  size?: number
  label?: string
  showLabel?: boolean
  silent?: boolean
  onCopied?: () => void
  variant?: 'icon' | 'text' | 'custom'
  children?: (state: { copied: boolean; onClick: () => void }) => ReactNode
  title?: string
}

export default function CopyButton({
  value,
  className = '',
  size = 14,
  label,
  showLabel = false,
  silent = false,
  onCopied,
  variant = 'icon',
  children,
  title,
}: CopyButtonProps) {
  const t = useT()
  const [copied, setCopied] = useState(false)

  const run = async () => {
    const ok = await copyToClipboard(value)
    if (ok) {
      setCopied(true)
      if (!silent) toast.success(t('common.copiedToast'))
      onCopied?.()
      setTimeout(() => setCopied(false), 2000)
    } else {
      toast.error(t('common.copyFailed'))
    }
  }

  if (variant === 'custom' && children) {
    return <>{children({ copied, onClick: run })}</>
  }

  const labelText = label ?? (copied ? t('common.copied') : t('common.copy'))
  const ariaLabel = copied ? t('common.copied') : (title || label || t('common.copy'))

  return (
    <button
      type="button"
      onClick={run}
      className={className}
      aria-label={ariaLabel}
      title={title ?? ariaLabel}
    >
      {copied ? (
        <Check size={size} className="text-[var(--color-success)]" />
      ) : (
        <Copy size={size} />
      )}
      {showLabel && <span className="ml-1.5">{labelText}</span>}
    </button>
  )
}
