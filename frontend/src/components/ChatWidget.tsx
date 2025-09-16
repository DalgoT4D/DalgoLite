'use client'

import { useState, useRef, useEffect } from 'react'
import { MessageCircle, Send, X, Minimize2, Maximize2 } from 'lucide-react'
import { getApiUrl, API_ENDPOINTS } from '@/lib/config'

interface Message {
  id: string
  type: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface ChatWidgetProps {
  chartId?: number
  sheetId?: number
  projectId?: number
  context?: string // Additional context like "viewing bar chart" etc.
  onChartCreated?: () => void // Callback to refresh charts when created
}

interface FormattedBlock {
  type: 'text' | 'bold' | 'list' | 'section'
  content?: string | string[]
  items?: string[]
  title?: string
}

export default function ChatWidget({ chartId, sheetId, projectId, context, onChartCreated }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const formatAssistantMessage = (content: string): FormattedBlock[] => {
    const blocks: FormattedBlock[] = []
    const lines = content.split('\n')
    let currentList: string[] = []
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      
      if (!line) {
        if (currentList.length > 0) {
          blocks.push({ type: 'list', items: currentList })
          currentList = []
        }
        continue
      }
      
      // Check for bullet points
      if (line.startsWith('• ') || line.startsWith('- ')) {
        currentList.push(line.substring(2))
        continue
      }
      
      // Flush any pending list
      if (currentList.length > 0) {
        blocks.push({ type: 'list', items: currentList })
        currentList = []
      }
      
      // Check for bold text (entire line)
      if (line.includes('**') && line.match(/^\*\*.*\*\*:?$/)) {
        const boldText = line.replace(/\*\*/g, '').replace(/:$/, '')
        blocks.push({ type: 'bold', content: boldText })
        continue
      }
      
      // Regular text with inline bold formatting
      if (line.includes('**')) {
        const formattedText = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        blocks.push({ type: 'text', content: formattedText })
      } else {
        blocks.push({ type: 'text', content: line })
      }
    }
    
    // Flush any remaining list
    if (currentList.length > 0) {
      blocks.push({ type: 'list', items: currentList })
    }
    
    return blocks
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (isOpen && !isMinimized && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen, isMinimized])

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputMessage.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInputMessage('')
    setIsLoading(true)

    try {
      const requestBody = {
        message: inputMessage.trim(),
        chart_id: chartId,
        sheet_id: sheetId,
        project_id: projectId
      }

      const response = await fetch(getApiUrl('/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      })

      if (response.ok) {
        const data = await response.json()
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: data.response,
          timestamp: new Date()
        }
        setMessages(prev => [...prev, assistantMessage])
        
        // If charts were created, refresh the parent page
        if (data.charts_created && data.charts_created.some((chart: any) => chart.success)) {
          if (onChartCreated) {
            onChartCreated()
          }
        }
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }))
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: `Sorry, I encountered an error: ${errorData.detail}`,
          timestamp: new Date()
        }
        setMessages(prev => [...prev, errorMessage])
      }
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: 'Sorry, I\'m having trouble connecting. Please try again.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    setMessages([])
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 z-40"
        title="Chat with Data"
      >
        <MessageCircle size={24} />
      </button>
    )
  }

  return (
    <div className={`fixed bottom-6 right-6 bg-white rounded-lg shadow-xl border border-gray-200 z-40 transition-all duration-200 ${
      isMinimized ? 'w-80 h-12' : 'w-96 h-[500px]'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50 rounded-t-lg">
        <div className="flex items-center gap-2">
          <MessageCircle className="text-blue-600" size={20} />
          <h3 className="font-semibold text-gray-900">Chat with Data</h3>
          {context && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
              {context}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
            title={isMinimized ? "Maximize" : "Minimize"}
          >
            {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
            title="Close chat"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 h-[380px]">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <MessageCircle className="mx-auto mb-2" size={32} />
                <p className="text-sm">Ask me anything about your data!</p>
                <p className="text-xs text-gray-400 mt-1">
                  I can help with data quality, insights, and chart recommendations
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                      message.type === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    {message.type === 'user' ? (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    ) : (
                      <div className="space-y-2">
                        {formatAssistantMessage(message.content).map((block, idx) => (
                          <div key={idx}>
                            {block.type === 'text' && (
                              <p 
                                className="text-gray-700"
                                dangerouslySetInnerHTML={{ __html: block.content || '' }}
                              />
                            )}
                            {block.type === 'bold' && <p className="text-gray-900 font-semibold">{block.content}</p>}
                            {block.type === 'list' && (
                              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                                {block.items?.map((item, itemIdx) => (
                                  <li key={itemIdx} dangerouslySetInnerHTML={{ __html: item }} />
                                ))}
                              </ul>
                            )}
                            {block.type === 'section' && (
                              <div className="mt-3">
                                <h4 className="font-semibold text-gray-900 mb-1">{block.title}</h4>
                                <div className="space-y-1">
                                  {Array.isArray(block.content) && block.content.map((item, itemIdx) => (
                                    <p key={itemIdx} className="text-gray-700 text-sm">{item}</p>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <p className={`text-xs mt-1 ${
                      message.type === 'user' ? 'text-blue-100' : 'text-gray-500'
                    }`}>
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-900 px-3 py-2 rounded-lg text-sm">
                  <div className="flex items-center gap-2">
                    <div className="animate-pulse flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                    <span>Thinking...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about your data..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                disabled={isLoading}
              />
              <button
                onClick={sendMessage}
                disabled={!inputMessage.trim() || isLoading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white p-2 rounded-lg transition-colors"
                title="Send message"
              >
                <Send size={16} />
              </button>
            </div>
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="text-xs text-gray-500 hover:text-gray-700 mt-2 transition-colors"
              >
                Clear conversation
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}