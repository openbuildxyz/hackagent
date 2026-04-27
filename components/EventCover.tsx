import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type EventCoverProps = {
  src?: string | null
  alt?: string
  className?: string
  imageClassName?: string
  fallbackClassName?: string
  fallback?: ReactNode
  children?: ReactNode
}

export default function EventCover({
  src,
  alt = '',
  className,
  imageClassName,
  fallbackClassName,
  fallback = <span className="text-5xl opacity-60">🏆</span>,
  children,
}: EventCoverProps) {
  return (
    <div className={cn('relative w-full aspect-video overflow-hidden shrink-0', className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className={cn('w-full h-full object-cover object-center', imageClassName)}
        />
      ) : (
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center bg-gradient-to-br from-indigo-500/10 to-purple-500/10',
            fallbackClassName
          )}
        >
          {fallback}
        </div>
      )}
      {children}
    </div>
  )
}
