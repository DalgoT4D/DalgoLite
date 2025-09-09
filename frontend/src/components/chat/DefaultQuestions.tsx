'use client'

import { DefaultQuestion } from '@/hooks/useChat'
import { Lightbulb, TrendingUp, BarChart3, AlertTriangle, Target } from 'lucide-react'

interface DefaultQuestionsProps {
  questions: DefaultQuestion[]
  onQuestionClick: (question: string) => void
  isLoading: boolean
}

const getCategoryIcon = (category: string) => {
  switch (category.toLowerCase()) {
    case 'insights':
    case 'general':
      return <Lightbulb size={14} />
    case 'trends':
    case 'patterns':
      return <TrendingUp size={14} />
    case 'recommendations':
    case 'suggestions':
      return <Target size={14} />
    case 'anomalies':
    case 'quality':
      return <AlertTriangle size={14} />
    default:
      return <BarChart3 size={14} />
  }
}

const getCategoryColor = (category: string) => {
  switch (category.toLowerCase()) {
    case 'insights':
    case 'general':
      return 'text-yellow-600 bg-yellow-50 hover:bg-yellow-100 border-yellow-200'
    case 'trends':
    case 'patterns':
      return 'text-green-600 bg-green-50 hover:bg-green-100 border-green-200'
    case 'recommendations':
    case 'suggestions':
      return 'text-blue-600 bg-blue-50 hover:bg-blue-100 border-blue-200'
    case 'anomalies':
    case 'quality':
      return 'text-red-600 bg-red-50 hover:bg-red-100 border-red-200'
    default:
      return 'text-gray-600 bg-gray-50 hover:bg-gray-100 border-gray-200'
  }
}

export default function DefaultQuestions({ 
  questions, 
  onQuestionClick, 
  isLoading 
}: DefaultQuestionsProps) {
  if (questions.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        <Lightbulb size={24} className="mx-auto mb-2 text-gray-400" />
        <p>Loading suggestions...</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <Lightbulb size={16} className="text-yellow-500" />
        Suggested Questions
      </div>
      
      <div className="space-y-2">
        {questions.map((question, index) => (
          <button
            key={index}
            onClick={() => onQuestionClick(question.text)}
            disabled={isLoading}
            className={`w-full text-left p-3 rounded-lg border transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed ${getCategoryColor(question.category)}`}
          >
            <div className="flex items-start gap-2">
              <div className="flex-shrink-0 mt-0.5">
                {getCategoryIcon(question.category)}
              </div>
              <div className="flex-1">
                <p className="leading-relaxed">{question.text}</p>
                {question.chart_specific && (
                  <div className="mt-1 text-xs opacity-75">
                    📊 Chart-specific
                  </div>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
      
      <div className="pt-2 border-t border-gray-100">
        <p className="text-xs text-gray-500 text-center">
          Click any question to get started, or type your own question below
        </p>
      </div>
    </div>
  )
}