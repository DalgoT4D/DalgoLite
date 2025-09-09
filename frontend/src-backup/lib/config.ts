// API Configuration
export const API_CONFIG = {
  BASE_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005',
  FRONTEND_URL: process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3005',
} as const

// API endpoint helpers
export const getApiUrl = (path: string) => {
  // Remove leading slash if present to avoid double slashes
  const cleanPath = path.startsWith('/') ? path.slice(1) : path
  return `${API_CONFIG.BASE_URL}/${cleanPath}`
}

// Common API endpoints
export const API_ENDPOINTS = {
  // Auth
  LOGOUT: '/auth/logout',
  
  // Sheets
  SHEETS_CONNECTED: '/sheets/connected',
  SHEETS_ANALYZE: '/sheets/analyze',
  SHEET_DATA: (sheetId: number) => `/sheets/${sheetId}/data`,
  SHEET_RESYNC: (sheetId: number) => `/sheets/${sheetId}/resync`,
  
  // Projects
  PROJECTS: '/projects',
  PROJECT: (projectId: number) => `/projects/${projectId}`,
  PROJECT_DATA: (projectId: number) => `/projects/${projectId}/data`,
  PROJECT_CANVAS_LAYOUT: (projectId: number) => `/projects/${projectId}/canvas-layout`,
  PROJECT_JOINS: (projectId: number) => `/projects/${projectId}/joins`,
  PROJECT_JOIN: (projectId: number, joinId: number) => `/projects/${projectId}/joins/${joinId}`,
  PROJECT_JOIN_DATA: (projectId: number, joinId: number) => `/projects/${projectId}/joins/${joinId}/data`,
  
  // Transformations
  AI_TRANSFORMATION_DATA: (stepId: number) => `/ai-transformations/${stepId}/data`,
  
  // Charts
  CHARTS: '/charts',
  CHART: (chartId: number) => `/charts/${chartId}`,
} as const