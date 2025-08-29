'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Database, CheckCircle, Users, Zap } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import Navigation from '@/components/Navigation'

interface ConnectedSheet {
  id: number
  title: string
  sheet_name: string
  total_rows: number
  columns: string[]
  sample_data: string[][]
}

interface JoinSuggestion {
  sheet1_id: number
  sheet1_title: string
  sheet2_id: number
  sheet2_title: string
  suggested_joins: Array<{
    column1: string
    column2: string
    confidence: string
    reason: string
  }>
}

export default function TransformPage() {
  const { isAuthenticated, logout } = useAuth()
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [sheets, setSheets] = useState<ConnectedSheet[]>([])
  const [selectedSheets, setSelectedSheets] = useState<number[]>([])
  const [joinSuggestions, setJoinSuggestions] = useState<JoinSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [projectName, setProjectName] = useState('')

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/')
      return
    }
    fetchSheets()
  }, [isAuthenticated, router])

  const fetchSheets = async () => {
    try {
      const response = await fetch('http://localhost:8000/sheets/connected')
      if (response.ok) {
        const data = await response.json()
        setSheets(data.sheets)
      }
    } catch (error) {
      console.error('Error fetching sheets:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSheetSelection = (sheetId: number) => {
    setSelectedSheets(prev => 
      prev.includes(sheetId)
        ? prev.filter(id => id !== sheetId)
        : [...prev, sheetId]
    )
  }

  const handleAnalyzeJoins = async () => {
    if (selectedSheets.length < 2) return
    
    try {
      const response = await fetch('http://localhost:8000/projects/analyze-join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheet_ids: selectedSheets })
      })
      
      if (response.ok) {
        const data = await response.json()
        setJoinSuggestions(data.join_suggestions)
        setStep(2)
      }
    } catch (error) {
      console.error('Error analyzing joins:', error)
    }
  }

  const handleCreateProject = async () => {
    if (!projectName.trim()) return
    
    try {
      const response = await fetch('http://localhost:8000/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projectName,
          description: `Transform and join ${selectedSheets.length} sheets`,
          sheet_ids: selectedSheets,
          mode: 'simple'
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        // Show success message and redirect to project page
        alert(`Project "${data.name}" created successfully!`)
        router.push(`/transform/${data.id}`)
      } else {
        const errorData = await response.json()
        alert(`Error creating project: ${errorData.detail}`)
      }
    } catch (error) {
      console.error('Error creating project:', error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation isAuthenticated={isAuthenticated} onLogout={logout} />
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation isAuthenticated={isAuthenticated} onLogout={logout} />
      
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <button
            onClick={() => router.push('/home')}
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium mb-4"
          >
            <ArrowLeft size={20} />
            Back to Dashboard
          </button>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Transform Multiple Sheets</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Combine and clean your data from multiple Google Sheets to create powerful visualizations
          </p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center gap-4">
            <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
              step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              1
            </div>
            <div className={`w-16 h-1 ${step >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
            <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
              step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              2
            </div>
            <div className={`w-16 h-1 ${step >= 3 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
            <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
              step >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              3
            </div>
          </div>
        </div>

        {/* Step 1: Select Sheets */}
        {step === 1 && (
          <div className="bg-white rounded-xl shadow-sm border p-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Step 1: Select Sheets to Transform</h2>
            
            {sheets.length < 2 ? (
              <div className="text-center py-8">
                <p className="text-gray-600">You need at least 2 connected sheets to use transformations.</p>
                <button
                  onClick={() => router.push('/dashboard')}
                  className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg"
                >
                  Connect More Sheets
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {sheets.map((sheet) => (
                  <div
                    key={sheet.id}
                    onClick={() => handleSheetSelection(sheet.id)}
                    className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                      selectedSheets.includes(sheet.id)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900">{sheet.title}</h3>
                        <p className="text-sm text-gray-600">
                          {sheet.total_rows} rows, {sheet.columns.length} columns
                        </p>
                        <div className="flex gap-1 mt-2">
                          {sheet.columns.slice(0, 4).map((col, idx) => (
                            <span key={idx} className="text-xs bg-gray-100 px-2 py-1 rounded">
                              {col}
                            </span>
                          ))}
                          {sheet.columns.length > 4 && (
                            <span className="text-xs text-gray-500">+{sheet.columns.length - 4} more</span>
                          )}
                        </div>
                      </div>
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                        selectedSheets.includes(sheet.id)
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-gray-300'
                      }`}>
                        {selectedSheets.includes(sheet.id) && (
                          <CheckCircle className="text-white" size={16} />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                
                <div className="flex justify-end pt-4">
                  <button
                    onClick={handleAnalyzeJoins}
                    disabled={selectedSheets.length < 2}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2"
                  >
                    Analyze Joins
                    <ArrowRight size={20} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Review Join Suggestions */}
        {step === 2 && (
          <div className="bg-white rounded-xl shadow-sm border p-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Step 2: How should we combine your sheets?</h2>
            
            {joinSuggestions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600 mb-4">
                  We couldn't automatically detect common columns between your sheets.
                </p>
                <p className="text-sm text-gray-500">
                  You can still create a project and manually configure joins in the next step.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {joinSuggestions.map((suggestion, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-6">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="bg-blue-100 p-2 rounded">
                        <Users className="text-blue-600" size={20} />
                      </div>
                      <div>
                        <h3 className="font-semibold">
                          {suggestion.sheet1_title} + {suggestion.sheet2_title}
                        </h3>
                        <p className="text-sm text-gray-600">Suggested join points:</p>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      {suggestion.suggested_joins.map((join, joinIdx) => (
                        <div key={joinIdx} className="bg-gray-50 p-3 rounded flex items-center justify-between">
                          <div>
                            <span className="font-medium">{join.column1}</span>
                            <span className="text-gray-400 mx-2">↔</span>
                            <span className="font-medium">{join.column2}</span>
                          </div>
                          <div className={`px-2 py-1 rounded text-xs font-medium ${
                            join.confidence === 'high' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {join.confidence} confidence
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <div className="flex justify-between pt-6">
              <button
                onClick={() => setStep(1)}
                className="text-gray-600 hover:text-gray-700 flex items-center gap-2"
              >
                <ArrowLeft size={20} />
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2"
              >
                Continue
                <ArrowRight size={20} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Create Project */}
        {step === 3 && (
          <div className="bg-white rounded-xl shadow-sm border p-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Step 3: Create Your Transformation Project</h2>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Project Name
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. Sales & Customer Data Analysis"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-medium text-blue-900 mb-2">Selected Sheets:</h3>
                <div className="space-y-2">
                  {selectedSheets.map(sheetId => {
                    const sheet = sheets.find(s => s.id === sheetId)
                    return sheet ? (
                      <div key={sheetId} className="flex items-center gap-3">
                        <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                        <span className="font-medium">{sheet.title}</span>
                        <span className="text-sm text-blue-600">({sheet.total_rows} rows)</span>
                      </div>
                    ) : null
                  })}
                </div>
              </div>

              <div className="bg-green-50 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="text-green-600" size={20} />
                  <h3 className="font-medium text-green-900">What's Next?</h3>
                </div>
                <p className="text-sm text-green-800">
                  After creating your project, you'll be able to:
                </p>
                <ul className="text-sm text-green-700 mt-2 space-y-1">
                  <li>• Join your sheets on common columns</li>
                  <li>• Clean and standardize data formats</li>
                  <li>• Handle missing values and duplicates</li>
                  <li>• Create charts from your combined dataset</li>
                </ul>
              </div>
            </div>
            
            <div className="flex justify-between pt-6">
              <button
                onClick={() => setStep(2)}
                className="text-gray-600 hover:text-gray-700 flex items-center gap-2"
              >
                <ArrowLeft size={20} />
                Back
              </button>
              <button
                onClick={handleCreateProject}
                disabled={!projectName.trim()}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2"
              >
                Create Project
                <ArrowRight size={20} />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}