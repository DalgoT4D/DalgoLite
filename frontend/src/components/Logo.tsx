import Image from 'next/image'

interface LogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg'
  compact?: boolean
  className?: string
}

export default function Logo({ size = 'md', compact = false, className = '' }: LogoProps) {
  const logoSizes = {
    xs: { width: 100, height: 40 },
    sm: { width: 150, height: 60 },
    md: { width: 200, height: 80 },
    lg: { width: 250, height: 100 }
  }

  const compactSizes = {
    xs: 'text-xl',
    sm: 'text-2xl',
    md: 'text-3xl',
    lg: 'text-4xl'
  }

  const isWhiteText = className.includes('text-white')

  // Compact version: Just "D" with green underline (matching the logo)
  if (compact) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <div className="relative">
          <span className={`font-bold ${isWhiteText ? 'text-white' : 'text-gray-800'} ${compactSizes[size]}`}>
            D
          </span>
          <div className={`absolute -bottom-1 left-0 right-0 h-0.5 ${isWhiteText ? 'bg-green-400' : 'bg-green-500'} rounded-full`}></div>
        </div>
      </div>
    )
  }

  // Full version: Use the new Dalgo logo image
  return (
    <div className={`flex items-center ${className}`}>
      <Image
        src="/dalgo-logo.png"
        alt="Dalgo - A Project Tech4Dev Initiative"
        width={logoSizes[size].width}
        height={logoSizes[size].height}
        className="object-contain"
        priority
      />
    </div>
  )
}