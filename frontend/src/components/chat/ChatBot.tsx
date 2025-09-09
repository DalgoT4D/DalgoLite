'use client'

import { useEffect, useRef } from 'react'
import { useChat } from '@/hooks/useChat'
import { MessageCircle, X, Minimize2, RotateCcw } from 'lucide-react'
import ChatMessage from './ChatMessage'
import ChatInput from './ChatInput'
import DefaultQuestions from './DefaultQuestions'

interface ChatBotProps {
  availableChartIds?: number[]
  currentChartId?: number
  context?: Record<string, any>
}

export default function ChatBot({ 
  availableChartIds = [], 
  currentChartId,
  context = {}
}: ChatBotProps) {
  const {
    messages,
    isOpen,
    isLoading,
    defaultQuestions,
    sendMessage,
    loadDefaultQuestions,
    clearMessages,
    toggleChat,
    setIsOpen
  } = useChat()

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load default questions when component mounts or chart IDs change
  useEffect(() => {
    if (isOpen) {
      loadDefaultQuestions(availableChartIds)
    }
  }, [isOpen, availableChartIds, loadDefaultQuestions])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSendMessage = (message: string, chartId?: number) => {
    sendMessage(message, chartId || currentChartId, {
      available_charts: availableChartIds,
      ...context
    })
  }

  const handleQuestionClick = (question: string) => {
    handleSendMessage(question, currentChartId)
  }

  const handleClearChat = () => {
    clearMessages()
    loadDefaultQuestions(availableChartIds)
  }

  if (!isOpen) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={toggleChat}
          className="w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-110"
        >
          <MessageCircle size={24} />
        </button>
      </div>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Chat Window */}
      <div className="w-96 h-[32rem] bg-white rounded-lg shadow-xl border border-gray-200 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-blue-600 text-white rounded-t-lg">
          <div className="flex items-center gap-2">
            <MessageCircle size={20} />
            <div>
              <h3 className="font-semibold text-sm">Chart Analyst</h3>
              <p className="text-xs text-blue-100">
                {availableChartIds.length > 0 
                  ? `${availableChartIds.length} chart${availableChartIds.length !== 1 ? 's' : ''} available`
                  : 'Ready to help'
                }
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={handleClearChat}
                className="p-1.5 hover:bg-blue-500 rounded-lg transition-colors"
                title="Clear chat"
              >
                <RotateCcw size={16} />
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 hover:bg-blue-500 rounded-lg transition-colors"
              title="Minimize chat"
            >
              <Minimize2 size={16} />
            </button>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            // Show default questions when no messages
            <DefaultQuestions
              questions={defaultQuestions}
              onQuestionClick={handleQuestionClick}
              isLoading={isLoading}
            />
          ) : (
            // Show chat messages
            <div className="h-full">
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <ChatInput
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          selectedChartId={currentChartId}
          placeholder={
            messages.length === 0 
              ? "Ask me about your charts..." 
              : "Continue the conversation..."
          }
        />
      </div>
    </div>
  )
}