'use client'

import { useState, useCallback } from 'react'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  chart_id?: number
  isLoading?: boolean
}

export interface ChatResponse {
  response: string
  chart_data_used: boolean
  follow_up_questions: string[]
  charts_referenced: number[]
  provider_used?: string
  model_used?: string
}

export interface DefaultQuestion {
  text: string
  category: string
  chart_specific: boolean
}

export const useChat = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [defaultQuestions, setDefaultQuestions] = useState<DefaultQuestion[]>([])

  const addMessage = useCallback((message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const newMessage: ChatMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, newMessage])
    return newMessage.id
  }, [])

  const updateMessage = useCallback((id: string, updates: Partial<ChatMessage>) => {
    setMessages(prev => 
      prev.map(msg => msg.id === id ? { ...msg, ...updates } : msg)
    )
  }, [])

  const sendMessage = useCallback(async (
    content: string,
    chartId?: number,
    context?: Record<string, any>
  ): Promise<void> => {
    if (!content.trim()) return

    // Add user message
    addMessage({
      role: 'user',
      content: content.trim(),
      chart_id: chartId
    })

    // Add loading assistant message
    const assistantMessageId = addMessage({
      role: 'assistant',
      content: '',
      isLoading: true
    })

    setIsLoading(true)

    try {
      const response = await fetch('http://localhost:8053/chat/analyze-chart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          message: content,
          chart_id: chartId,
          context: {
            page: 'charts',
            ...context
          }
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data: ChatResponse = await response.json()

      // Update the loading message with the response
      updateMessage(assistantMessageId, {
        content: data.response,
        isLoading: false
      })

      // TODO: Handle follow-up questions if needed
      
    } catch (error) {
      console.error('Chat error:', error)
      updateMessage(assistantMessageId, {
        content: 'Sorry, I encountered an error while processing your request. Please try again.',
        isLoading: false
      })
    } finally {
      setIsLoading(false)
    }
  }, [addMessage, updateMessage])

  const loadDefaultQuestions = useCallback(async (chartIds: number[] = []) => {
    try {
      const chartIdsParam = chartIds.length > 0 ? `?chart_ids=${chartIds.join(',')}` : ''
      const response = await fetch(`http://localhost:8053/chat/default-questions${chartIdsParam}`, {
        credentials: 'include'
      })
      
      if (response.ok) {
        const data = await response.json()
        setDefaultQuestions(data.questions || [])
      }
    } catch (error) {
      console.error('Error loading default questions:', error)
      // Set fallback questions
      setDefaultQuestions([
        { text: "What insights can you provide about my charts?", category: "general", chart_specific: false },
        { text: "How can I improve my data visualizations?", category: "recommendations", chart_specific: false },
        { text: "What patterns do you see in my data?", category: "patterns", chart_specific: false }
      ])
    }
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  const toggleChat = useCallback(() => {
    setIsOpen(prev => !prev)
  }, [])

  return {
    messages,
    isOpen,
    isLoading,
    defaultQuestions,
    addMessage,
    updateMessage,
    sendMessage,
    loadDefaultQuestions,
    clearMessages,
    toggleChat,
    setIsOpen
  }
}