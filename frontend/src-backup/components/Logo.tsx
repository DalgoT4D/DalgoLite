import { BarChart3 } from 'lucide-react'

interface LogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg'
  compact?: boolean
  className?: string
}

export default function Logo({ size = 'md', compact = false, className = '' }: LogoProps) {
  const sizeClasses = {
    xs: 'text-lg',
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-3xl'
  }

  const iconSizes = {
    xs: 'w-4 h-4',
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10'
  }

  const compactSizes = {
    xs: 'text-xl',
    sm: 'text-2xl',
    md: 'text-3xl',
    lg: 'text-4xl'
  }

  const isWhiteText = className.includes('text-white')

  // Compact version: Just "D" with blue underline
  if (compact) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <div className="relative">
          <span className={`font-bold ${isWhiteText ? 'text-white' : 'text-gray-800'} ${compactSizes[size]}`}>
            D
          </span>
          <div className={`absolute -bottom-1 left-0 right-0 h-0.5 ${isWhiteText ? 'bg-blue-400' : 'bg-blue-600'} rounded-full`}></div>
        </div>
      </div>
    )
  }

  // Full version: Icon + "DalgoLite" text
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative">
        <BarChart3 className={`${iconSizes[size]} ${isWhiteText ? 'text-white' : 'text-blue-600'}`} />
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
      </div>
      <span className={`font-bold ${isWhiteText ? 'text-white' : 'text-gray-800'} ${sizeClasses[size]}`}>
        Dalgo<span className={isWhiteText ? 'text-blue-400' : 'text-blue-600'}>Lite</span>
      </span>
    </div>
  )
}