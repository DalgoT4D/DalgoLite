'use client'

import { ChatMessage as ChatMessageType } from '@/hooks/useChat'
import { User, Bot, Loader2 } from 'lucide-react'

interface ChatMessageProps {
  message: ChatMessageType
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex gap-3 p-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser 
          ? 'bg-blue-600 text-white' 
          : 'bg-gray-100 text-gray-600'
      }`}>
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>

      {/* Message Content */}
      <div className={`flex-1 max-w-[80%] ${isUser ? 'text-right' : 'text-left'}`}>
        <div className={`inline-block px-4 py-2 rounded-lg ${
          isUser
            ? 'bg-blue-600 text-white rounded-br-none'
            : 'bg-gray-100 text-gray-900 rounded-bl-none'
        }`}>
          {message.isLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Analyzing...</span>
            </div>
          ) : (
            <div className="text-sm whitespace-pre-wrap">{message.content}</div>
          )}
        </div>
        
        {/* Timestamp */}
        <div className={`text-xs text-gray-500 mt-1 ${isUser ? 'text-right' : 'text-left'}`}>
          {message.timestamp.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}
        </div>

        {/* Chart reference indicator */}
        {message.chart_id && (
          <div className={`text-xs text-gray-400 mt-1 ${isUser ? 'text-right' : 'text-left'}`}>
            📊 Chart #{message.chart_id}
          </div>
        )}
      </div>
    </div>
  )
}