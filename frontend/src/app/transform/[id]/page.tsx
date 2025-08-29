'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Play, Eye, Settings } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import Navigation from '@/components/Navigation'

interface Project {
  id: number
  name: string
  description: string
  mode: string
  sheet_ids: number[]
  created_at: string
}

interface Sheet {
  id: number
  title: string
  columns: string[]
  total_rows: number
}

interface JoinPreview {
  preview_data: string[][]
  columns: string[]
  total_rows: number
  join_stats: {
    left_rows: number
    right_rows: number
    joined_rows: number
    join_type: string
  }
}

export default function ProjectDetailsPage({ params }: { params: { id: string } }) {
  const { isAuthenticated, logout } = useAuth()
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [joinConfig, setJoinConfig] = useState({
    left_sheet_id: '',
    right_sheet_id: '',
    left_column: '',
    right_column: '',
    join_type: 'inner'
  })
  const [joinPreview, setJoinPreview] = useState<JoinPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [previewing, setPreviewing] = useState(false)
  const [joinError, setJoinError] = useState<string>('')

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/')
      return
    }
    fetchProjectData()
  }, [isAuthenticated, router])

  const fetchProjectData = async () => {
    try {
      // Fetch project details
      const projectResponse = await fetch(`http://localhost:8000/projects/${params.id}`)
      if (!projectResponse.ok) {
        router.push('/home')
        return
      }
      
      const projectData = await projectResponse.json()
      setProject(projectData)

      // Fetch sheet details
      const sheetsResponse = await fetch('http://localhost:8000/sheets/connected')
      if (sheetsResponse.ok) {
        const allSheets = await sheetsResponse.json()
        const projectSheets = allSheets.sheets.filter((sheet: any) => 
          projectData.sheet_ids.includes(sheet.id)
        )
        setSheets(projectSheets)
        
        // Initialize join config with first two sheets
        if (projectSheets.length >= 2) {
          setJoinConfig(prev => ({
            ...prev,
            left_sheet_id: projectSheets[0].id.toString(),
            right_sheet_id: projectSheets[1].id.toString()
          }))
        }
      }
    } catch (error) {
      console.error('Error fetching project data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePreviewJoin = async () => {
    if (!joinConfig.left_sheet_id || !joinConfig.right_sheet_id || 
        !joinConfig.left_column || !joinConfig.right_column) {
      setJoinError('Please select sheets and join columns before previewing.')
      return
    }

    setPreviewing(true)
    setJoinError('')
    setJoinPreview(null)
    
    try {
      const response = await fetch(`http://localhost:8000/projects/${params.id}/preview-join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          left_sheet_id: parseInt(joinConfig.left_sheet_id),
          right_sheet_id: parseInt(joinConfig.right_sheet_id),
          left_column: joinConfig.left_column,
          right_column: joinConfig.right_column,
          join_type: joinConfig.join_type
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        setJoinPreview(data)
      } else {
        const errorData = await response.json()
        setJoinError(errorData.detail || 'Failed to preview join')
      }
    } catch (error) {
      console.error('Error previewing join:', error)
      setJoinError('Network error - please check your connection and try again')
    } finally {
      setPreviewing(false)
    }
  }

  const getSheetById = (id: string) => sheets.find(s => s.id.toString() === id)

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

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation isAuthenticated={isAuthenticated} onLogout={logout} />
        <div className="text-center py-20">
          <p className="text-gray-600">Project not found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation isAuthenticated={isAuthenticated} onLogout={logout} />
      
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/home')}
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium mb-4"
          >
            <ArrowLeft size={20} />
            Back to Dashboard  
          </button>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{project.name}</h1>
          <p className="text-gray-600">{project.description}</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Join Configuration */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center gap-3 mb-6">
              <Settings className="text-blue-600" size={24} />
              <h2 className="text-xl font-semibold">Configure Join</h2>
            </div>

            <div className="space-y-4">
              {/* Sheet Selection */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Left Sheet</label>
                  <select
                    value={joinConfig.left_sheet_id}
                    onChange={(e) => setJoinConfig(prev => ({...prev, left_sheet_id: e.target.value}))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    {sheets.map(sheet => (
                      <option key={sheet.id} value={sheet.id}>{sheet.title}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Right Sheet</label>
                  <select
                    value={joinConfig.right_sheet_id}
                    onChange={(e) => setJoinConfig(prev => ({...prev, right_sheet_id: e.target.value}))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    {sheets.map(sheet => (
                      <option key={sheet.id} value={sheet.id}>{sheet.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Column Selection */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Join Column (Left)</label>
                  <select
                    value={joinConfig.left_column}
                    onChange={(e) => setJoinConfig(prev => ({...prev, left_column: e.target.value}))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select column...</option>
                    {getSheetById(joinConfig.left_sheet_id)?.columns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Join Column (Right)</label>
                  <select
                    value={joinConfig.right_column}
                    onChange={(e) => setJoinConfig(prev => ({...prev, right_column: e.target.value}))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select column...</option>
                    {getSheetById(joinConfig.right_sheet_id)?.columns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Join Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Join Type</label>
                <select
                  value={joinConfig.join_type}
                  onChange={(e) => setJoinConfig(prev => ({...prev, join_type: e.target.value}))}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="inner">Inner Join (only matching rows)</option>
                  <option value="left">Left Join (all from left sheet)</option>
                  <option value="right">Right Join (all from right sheet)</option>
                  <option value="outer">Full Join (all rows from both)</option>
                </select>
              </div>

              <button
                onClick={handlePreviewJoin}
                disabled={!joinConfig.left_column || !joinConfig.right_column || previewing}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2"
              >
                {previewing ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <Eye size={20} />
                )}
                {previewing ? 'Generating Preview...' : 'Preview Join'}
              </button>
            </div>
          </div>

          {/* Join Preview */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center gap-3 mb-6">
              <Play className="text-green-600" size={24} />
              <h2 className="text-xl font-semibold">Join Preview</h2>
            </div>

            {joinError && (
              <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
                <p className="text-red-800 font-medium">❌ Join Error</p>
                <p className="text-sm text-red-700 mt-1">{joinError}</p>
              </div>
            )}

            {joinPreview ? (
              <div className="space-y-4">
                {/* Stats */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-medium text-gray-900 mb-2">Join Statistics</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Left rows:</span>
                      <span className="ml-2 font-medium">{joinPreview.join_stats.left_rows}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Right rows:</span>
                      <span className="ml-2 font-medium">{joinPreview.join_stats.right_rows}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Result rows:</span>
                      <span className="ml-2 font-medium">{joinPreview.join_stats.joined_rows}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Join type:</span>
                      <span className="ml-2 font-medium">{joinPreview.join_stats.join_type}</span>
                    </div>
                  </div>
                </div>

                {/* Data Preview */}
                <div>
                  <h3 className="font-medium text-gray-900 mb-3">Data Preview (First 10 rows)</h3>
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          {joinPreview.columns.map((col, idx) => (
                            <th key={idx} className="px-3 py-2 text-left font-medium text-gray-900 border-r border-gray-200">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {joinPreview.preview_data.map((row, rowIdx) => (
                          <tr key={rowIdx} className="border-t border-gray-200">
                            {row.map((cell, cellIdx) => (
                              <td key={cellIdx} className="px-3 py-2 border-r border-gray-200 max-w-32 truncate">
                                {cell || '-'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Success Actions */}
                <div className="bg-green-50 p-4 rounded-lg">
                  <p className="text-green-800 font-medium mb-2">✅ Join looks good!</p>
                  <p className="text-sm text-green-700 mb-3">
                    Your joined dataset has {joinPreview.total_rows} rows and {joinPreview.columns.length} columns.
                  </p>
                  <button
                    onClick={() => router.push(`/charts?project=${project.id}`)}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium"
                  >
                    Create Charts from Joined Data
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>Configure the join settings on the left and click "Preview Join" to see the result.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}