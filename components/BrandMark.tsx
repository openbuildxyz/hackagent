import Image from 'next/image'

export default function BrandMark({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md bg-white border border-black/10 shadow-sm overflow-hidden ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Image
        src="/brand/hackagent-mark-transparent.png"
        alt=""
        width={Math.round(size * 0.78)}
        height={Math.round(size * 0.64)}
        className="object-contain"
        priority={size >= 24}
      />
    </span>
  )
}
