'use client'

import React, { useEffect, useRef } from 'react'
import { Zap, Link } from 'lucide-react'

interface ContextMenuProps {
  x: number
  y: number
  onClose: () => void
  onCreateAITransformation: () => void
  onCreateJoin: () => void
}

export default function ContextMenu({ 
  x, 
  y, 
  onClose, 
  onCreateAITransformation, 
  onCreateJoin 
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscapeKey)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscapeKey)
    }
  }, [onClose])

  const menuItems = [
    {
      label: 'Create AI Transformation',
      icon: Zap,
      onClick: () => {
        onCreateAITransformation()
        onClose()
      },
      description: 'Transform data using natural language'
    },
    {
      label: 'Create Join',
      icon: Link,
      onClick: () => {
        onCreateJoin()
        onClose()
      },
      description: 'Join two or more datasets together'
    }
  ]

  return (
    <div
      ref={menuRef}
      className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-2 z-50 min-w-64"
      style={{
        left: x,
        top: y,
      }}
    >
      {menuItems.map((item, index) => {
        const Icon = item.icon
        return (
          <button
            key={index}
            onClick={item.onClick}
            className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-start gap-3 group"
          >
            <Icon size={18} className="text-gray-600 group-hover:text-gray-900 mt-0.5" />
            <div>
              <div className="font-medium text-gray-900">{item.label}</div>
              <div className="text-sm text-gray-500">{item.description}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}