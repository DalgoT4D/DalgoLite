import { BarChart3 } from 'lucide-react'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export default function Logo({ size = 'md', className = '' }: LogoProps) {
  const sizeClasses = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-3xl'
  }

  const iconSizes = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10'
  }

  const isWhiteText = className.includes('text-white')

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