'use client'

import React, { useState } from 'react'
import { Clock, Calendar, Play, ChevronDown, ChevronRight, AlertTriangle, CheckCircle, XCircle, RotateCcw, History, Eye } from 'lucide-react'

interface AutomationConfig {
  enabled: boolean
  frequency: 'daily' | 'weekly' | 'monthly' | 'custom'
  time: string
  dayOfWeek?: number  // 0-6 for weekly
  dayOfMonth?: number  // 1-31 for monthly
  customCron?: string
  timezone: string
}

interface AutomationRun {
  id: string
  timestamp: string
  status: 'success' | 'failed' | 'running'
  duration?: number
  stepsProcessed?: number
  errors?: string[]
  logs?: string[]
}

interface AutomationPanelProps {
  projectId: number
  projectName: string
}

export default function AutomationPanel({ projectId, projectName }: AutomationPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showErrorLogs, setShowErrorLogs] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  
  const [config, setConfig] = useState<AutomationConfig>({
    enabled: false,
    frequency: 'daily',
    time: '09:00',
    timezone: 'America/Los_Angeles'
  })

  // Mock data with error logs
  const mockRuns: AutomationRun[] = [
    {
      id: '1',
      timestamp: '2024-01-15T09:00:00Z',
      status: 'failed',
      duration: 12000,
      stepsProcessed: 3,
      errors: ['Google Sheets connection timeout', 'Transform step 4 failed'],
      logs: [
        '[09:00:15] Starting automation pipeline for Project: Data Analytics',
        '[09:00:16] Syncing Google Sheets data sources...',
        '[09:00:17] ✓ Connected to "Sales Data" sheet - 1,234 rows',
        '[09:00:18] ✓ Connected to "Customer Data" sheet - 567 rows', 
        '[09:00:19] Starting transformation pipeline...',
        '[09:00:20] ✓ Step 1: Data Cleaning - Processed 1,234 rows',
        '[09:00:22] ✓ Step 2: Join Tables - Created 1,156 joined rows',
        '[09:00:24] ✓ Step 3: Calculate Metrics - Added 12 calculated columns',
        '[09:00:26] ❌ Step 4: Advanced Analytics - FAILED',
        '[09:00:26] Error: Column "revenue_growth" not found in dataset',
        '[09:00:26] Error: Division by zero in growth calculation',
        '[09:00:27] ❌ Pipeline failed at step 4/8',
        '[09:00:27] Cleaning up partial results...',
        '[09:00:28] ❌ Automation completed with errors'
      ]
    },
    {
      id: '2', 
      timestamp: '2024-01-14T09:00:00Z',
      status: 'success',
      duration: 45000,
      stepsProcessed: 8,
      logs: [
        '[09:00:15] Starting automation pipeline...',
        '[09:00:45] ✓ All 8 steps completed successfully',
        '[09:00:45] ✓ Pipeline completed - 2,346 rows processed'
      ]
    },
    {
      id: '3',
      timestamp: '2024-01-13T09:00:00Z',
      status: 'success',
      duration: 42000,
      stepsProcessed: 8
    }
  ]

  const getNextRunTime = () => {
    if (!config.enabled) return null
    
    const now = new Date()
    const nextRun = new Date()
    
    const [hours, minutes] = config.time.split(':').map(Number)
    nextRun.setHours(hours, minutes, 0, 0)
    
    switch (config.frequency) {
      case 'daily':
        if (nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 1)
        }
        break
      case 'weekly':
        nextRun.setDate(nextRun.getDate() + ((config.dayOfWeek! + 7 - now.getDay()) % 7) || 7)
        if (nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 7)
        }
        break
      case 'monthly':
        nextRun.setDate(config.dayOfMonth!)
        if (nextRun <= now) {
          nextRun.setMonth(nextRun.getMonth() + 1)
        }
        break
    }
    
    return nextRun
  }

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="text-green-500" size={16} />
      case 'failed':
        return <XCircle className="text-red-500" size={16} />
      case 'running':
        return <RotateCcw className="text-blue-500 animate-spin" size={16} />
    }
  }

  const nextRun = getNextRunTime()
  const selectedRun = mockRuns.find(run => run.id === selectedRunId)

  return (
    <div className="space-y-4">
      {/* Enable/Disable Toggle */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-gray-900">Enable Automation</h4>
            <p className="text-sm text-gray-600 mt-1">Automatically sync and run transformations</p>
          </div>
          <button
            onClick={() => setConfig({...config, enabled: !config.enabled})}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
              config.enabled ? 'bg-purple-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                config.enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        
        {config.enabled && nextRun && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Clock size={14} />
              <span>Next run: {nextRun.toLocaleDateString()} at {nextRun.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        )}
      </div>

      {/* Schedule Configuration */}
      {config.enabled && (
        <div className="bg-white rounded-lg border border-gray-200">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Calendar className="text-gray-400" size={18} />
              <div className="text-left">
                <h4 className="font-medium text-gray-900">Schedule Settings</h4>
                <p className="text-sm text-gray-600">
                  {config.frequency.charAt(0).toUpperCase() + config.frequency.slice(1)} at {config.time}
                </p>
              </div>
            </div>
            {isExpanded ? <ChevronDown size={20} className="text-gray-400" /> : <ChevronRight size={20} className="text-gray-400" />}
          </button>

          {isExpanded && (
            <div className="border-t border-gray-200 p-4 space-y-6">
              {/* Frequency Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Frequency</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: 'daily', label: 'Daily' },
                    { value: 'weekly', label: 'Weekly' },
                    { value: 'monthly', label: 'Monthly' },
                    { value: 'custom', label: 'Custom' }
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setConfig({...config, frequency: value as any})}
                      className={`p-3 rounded-lg border-2 text-sm transition-colors ${
                        config.frequency === value
                          ? 'border-purple-500 bg-purple-50 text-purple-700'
                          : 'border-gray-200 hover:border-gray-300 text-gray-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time and Timezone */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
                  <input
                    type="time"
                    value={config.time}
                    onChange={(e) => setConfig({...config, time: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Timezone</label>
                  <select
                    value={config.timezone}
                    onChange={(e) => setConfig({...config, timezone: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                  >
                    <option value="America/Los_Angeles">Pacific</option>
                    <option value="America/New_York">Eastern</option>
                    <option value="America/Chicago">Central</option>
                    <option value="America/Denver">Mountain</option>
                  </select>
                </div>
              </div>

              {/* Additional Options */}
              {config.frequency === 'weekly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Day of Week</label>
                  <div className="flex gap-1">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                      <button
                        key={index}
                        onClick={() => setConfig({...config, dayOfWeek: index})}
                        className={`w-8 h-8 rounded-full text-xs font-medium transition-colors ${
                          config.dayOfWeek === index
                            ? 'bg-purple-500 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {config.frequency === 'monthly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Day of Month</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={config.dayOfMonth || 1}
                    onChange={(e) => setConfig({...config, dayOfMonth: parseInt(e.target.value)})}
                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Manual Run */}
      <button className="w-full bg-green-600 text-white p-3 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2">
        <Play size={16} />
        Run Now
      </button>

      {/* Execution History Button */}
      <button 
        onClick={() => setShowHistory(true)}
        className="w-full bg-gray-100 text-gray-700 p-3 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
      >
        <History size={16} />
        View Previous Runs
      </button>

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Automation History</h3>
              <button
                onClick={() => setShowHistory(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                ×
              </button>
            </div>
            
            <div className="p-6 max-h-96 overflow-y-auto">
              <div className="space-y-4">
                {mockRuns.map((run) => (
                  <div key={run.id} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(run.status)}
                        <div>
                          <p className="font-medium text-gray-900">
                            {new Date(run.timestamp).toLocaleDateString()} at {new Date(run.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <p className="text-sm text-gray-600">
                            {run.status === 'success' && `✓ ${run.stepsProcessed} steps completed in ${formatDuration(run.duration!)}`}
                            {run.status === 'failed' && `✗ Failed after ${formatDuration(run.duration!)} (${run.stepsProcessed}/${run.stepsProcessed + (run.errors?.length || 0)} steps)`}
                          </p>
                        </div>
                      </div>
                      {(run.status === 'failed' || run.logs) && (
                        <button
                          onClick={() => {
                            setSelectedRunId(run.id)
                            setShowErrorLogs(true)
                          }}
                          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                        >
                          <Eye size={14} />
                          View Logs
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Logs Modal */}
      {showErrorLogs && selectedRun && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                {getStatusIcon(selectedRun.status)}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Execution Logs</h3>
                  <p className="text-sm text-gray-600">
                    {new Date(selectedRun.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowErrorLogs(false)
                  setSelectedRunId(null)
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                ×
              </button>
            </div>
            
            <div className="p-6">
              <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-gray-100 max-h-96 overflow-y-auto">
                {selectedRun.logs ? selectedRun.logs.map((log, index) => (
                  <div key={index} className={`mb-1 ${
                    log.includes('❌') ? 'text-red-400' : 
                    log.includes('✓') ? 'text-green-400' : 
                    'text-gray-300'
                  }`}>
                    {log}
                  </div>
                )) : (
                  <div className="text-gray-400">No detailed logs available for this run.</div>
                )}
              </div>
              
              {selectedRun.errors && selectedRun.errors.length > 0 && (
                <div className="mt-4">
                  <h4 className="font-medium text-red-900 mb-2">Errors:</h4>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    {selectedRun.errors.map((error, index) => (
                      <div key={index} className="text-sm text-red-800 mb-1">
                        • {error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}