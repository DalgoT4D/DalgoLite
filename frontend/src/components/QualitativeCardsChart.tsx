'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Search, X, Info } from 'lucide-react'

interface QualitativeCardsChartProps {
  data: any
  title?: string
  config?: {
    unique_column: string
    qualitative_column: string
    quantitative_columns: string[]
    quantitative_labels: string[]
    value_formatting?: { [key: string]: string }
  }
  metadata?: {
    unique_column?: string
    qualitative_column?: string
    quantitative_columns?: string[]
    is_unique?: boolean
    duplicate_values?: string[]
  }
}

interface CardData {
  id: string
  title: string
  content: string
  metrics: Array<{
    value: any
    label: string
    formatting?: string
  }>
}

const formatValue = (value: any, formatting?: string): string => {
  if (value === null || value === undefined) return '-'
  
  const numValue = typeof value === 'number' ? value : parseFloat(value)
  
  if (isNaN(numValue)) return String(value)
  
  switch (formatting?.toLowerCase()) {
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(numValue)
    case 'percentage':
      return new Intl.NumberFormat('en-US', {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(numValue / 100)
    case 'decimal':
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(numValue)
    case 'integer':
      return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 0,
      }).format(numValue)
    default:
      return new Intl.NumberFormat('en-US').format(numValue)
  }
}

const QualitativeCardsChart: React.FC<QualitativeCardsChartProps> = ({
  data,
  title,
  config,
  metadata
}) => {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [showSearch, setShowSearch] = useState(false)

  // Transform data into card format
  const { cards, duplicateValues: computedDuplicates } = useMemo(() => {
    if (!data || !config) return { cards: [], duplicateValues: [] as string[] }

    const rawData = Array.isArray(data) ? data : data.raw_data || []
    if (!Array.isArray(rawData)) return { cards: [], duplicateValues: [] as string[] }

    const seenValues = new Map<string, string>()
    const duplicateSet = new Set<string>()

    const metricColumns = config.quantitative_columns || []

    const mappedCards = rawData.map((row: Record<string, any>, index: number) => {
      const rawValue = row?.[config.unique_column]
      const normalized = typeof rawValue === 'string' ? rawValue.trim().toLowerCase() : String(rawValue ?? '')
      const displayValue = rawValue === null || rawValue === undefined || rawValue === '' ? '[blank]' : String(rawValue)
      if (seenValues.has(normalized)) {
        duplicateSet.add(displayValue)
      } else {
        seenValues.set(normalized, displayValue)
      }

      const titleValue = String(rawValue || `Item ${index + 1}`)
      const content = String(row?.[config.qualitative_column] || '')

      const metrics = metricColumns.map((col, idx) => ({
        value: row?.[col],
        label: config.quantitative_labels?.[idx] || col,
        formatting: config.value_formatting?.[col]
      }))

      return {
        id: `${index}-${titleValue}`,
        title: titleValue,
        content,
        metrics
      }
    })

    return {
      cards: mappedCards,
      duplicateValues: Array.from(duplicateSet)
    }
  }, [data, config])

  const duplicateValues = metadata?.duplicate_values && metadata.duplicate_values.length > 0
    ? metadata.duplicate_values
    : computedDuplicates
  const isUnique = metadata?.is_unique ?? duplicateValues.length === 0
  const uniqueColumnLabel = metadata?.unique_column || config?.unique_column

  // Filter cards based on search
  const filteredCards = useMemo(() => {
    if (!searchTerm.trim()) return cards
    
    const term = searchTerm.toLowerCase()
    return cards.filter(card => 
      card.title.toLowerCase().includes(term) ||
      card.content.toLowerCase().includes(term)
    )
  }, [cards, searchTerm])

  // Reset current index when filtered cards change
  useEffect(() => {
    if (currentIndex >= filteredCards.length && filteredCards.length > 0) {
      setCurrentIndex(0)
    }
  }, [filteredCards, currentIndex])

  const currentCard = filteredCards[currentIndex]
  const totalCards = filteredCards.length

  const goToPrevious = () => {
    setCurrentIndex(prev => prev > 0 ? prev - 1 : totalCards - 1)
  }

  const goToNext = () => {
    setCurrentIndex(prev => prev < totalCards - 1 ? prev + 1 : 0)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      goToPrevious()
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      goToNext()
    } else if (e.key === 'Escape' && showSearch) {
      setShowSearch(false)
      setSearchTerm('')
    }
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-100 rounded-lg">
        <p className="text-gray-500">Chart configuration required for Qualitative Cards</p>
      </div>
    )
  }

  if (cards.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-100 rounded-lg">
        <p className="text-gray-500">No data available for cards</p>
      </div>
    )
  }

  if (filteredCards.length === 0) {
    return (
      <div className="h-full flex flex-col">
        {/* Search Header */}
        <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <Search size={16} className="text-gray-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search cards..."
              className="bg-transparent outline-none text-sm placeholder-gray-500"
              autoFocus
            />
          </div>
          <button
            onClick={() => {
              setShowSearch(false)
              setSearchTerm('')
            }}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        
        <div className="flex-1 flex items-center justify-center bg-gray-100 rounded-lg">
          <div className="text-center">
            <p className="text-gray-500 mb-2">No cards match your search</p>
            <button
              onClick={() => setSearchTerm('')}
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              Clear search
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div 
      className="h-full w-full flex flex-col focus:outline-none overflow-hidden"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Header with Search */}
      <div className="flex items-center justify-between mb-3 px-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          {title && (
            <h3 className="text-base font-semibold text-gray-900 truncate">{title}</h3>
          )}
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded whitespace-nowrap">
            {currentIndex + 1} of {totalCards}
          </span>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {showSearch ? (
            <div className="flex items-center gap-1 bg-gray-50 rounded-lg px-2 py-1">
              <Search size={14} className="text-gray-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search..."
                className="bg-transparent outline-none text-xs placeholder-gray-500 w-20"
                autoFocus
              />
              <button
                onClick={() => {
                  setShowSearch(false)
                  setSearchTerm('')
                }}
                className="p-1 hover:bg-gray-200 rounded transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSearch(true)}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              title="Search cards"
            >
              <Search size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Card Display */}
      <div className="flex-1 bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/30 rounded-xl border border-gray-200 shadow-sm p-4 mb-3 mx-2 overflow-hidden min-h-0">
        {currentCard && (
          <div className="h-full flex flex-col overflow-hidden">
            {/* Card Title */}
            <h2 className="text-lg font-bold text-gray-900 mb-3 pb-2 border-b border-gray-300 flex-shrink-0">
              {currentCard.title}
            </h2>
            
            {/* Card Content */}
            <div className="flex-1 mb-3 overflow-y-auto min-h-0">
              <p className="text-gray-700 leading-relaxed text-sm">
                {currentCard.content}
              </p>
            </div>
            
            {/* Metrics */}
            {currentCard.metrics.length > 0 && (
              <div className="border-t border-gray-300 pt-3 flex-shrink-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {currentCard.metrics.map((metric, idx) => (
                    <div key={idx} className="bg-white/60 rounded-lg p-3 border border-gray-200/50 shadow-sm">
                      <div className="text-lg font-bold text-gray-800 mb-1">
                        {formatValue(metric.value, metric.formatting)}
                      </div>
                      <div className="text-xs font-medium text-gray-600">
                        {metric.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between px-2 flex-shrink-0">
        <button
          onClick={goToPrevious}
          disabled={totalCards <= 1}
          className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400 rounded-lg transition-colors text-sm"
        >
          <ChevronLeft size={14} />
          Previous
        </button>

        {/* Pagination Dots */}
        {totalCards > 1 && totalCards <= 10 && (
          <div className="flex items-center gap-1">
            {filteredCards.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  idx === currentIndex 
                    ? 'bg-blue-600' 
                    : 'bg-gray-300 hover:bg-gray-400'
                }`}
              />
            ))}
          </div>
        )}

        <button
          onClick={goToNext}
          disabled={totalCards <= 1}
          className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400 rounded-lg transition-colors text-sm"
        >
          Next
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

export default QualitativeCardsChart
