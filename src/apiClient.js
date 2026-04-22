// Custom API client for eyenetbio database

const DEV_REMOTE_API_BASE = import.meta.env.VITE_REMOTE_API_BASE || '/remote-api'
const API_UPLOAD_URL = import.meta.env.DEV
  ? `${DEV_REMOTE_API_BASE}/api_upload.php`
  : '/api/upload'
const API_FETCH_URL = import.meta.env.DEV
  ? `${DEV_REMOTE_API_BASE}/api_fetch.php`
  : '/api/fetch'
const DEV_API_KEY = import.meta.env.VITE_EYENETBIO_API_KEY || import.meta.env.VITE_API_KEY || ''

const PROD_FETCH_FALLBACKS = ['/api/fetch', '/api/fetch.js']
const PROD_UPLOAD_FALLBACKS = ['/api/upload', '/api/upload.js']

function withQuery(url, queryString = '') {
  return queryString ? `${url}${queryString}` : url
}

function getFetchCandidates(queryString = '') {
  if (import.meta.env.DEV) return [withQuery(API_FETCH_URL, queryString)]
  return PROD_FETCH_FALLBACKS.map((url) => withQuery(url, queryString))
}

function getUploadCandidates() {
  if (import.meta.env.DEV) return [API_UPLOAD_URL]
  return PROD_UPLOAD_FALLBACKS
}

async function fetchWithRouteFallback(urls, options) {
  let lastResponse = null
  let lastError = null

  for (const url of urls) {
    try {
      const response = await fetch(url, options)
      if (response.status === 404) {
        lastResponse = response
        continue
      }
      return response
    } catch (err) {
      lastError = err
    }
  }

  if (lastResponse) return lastResponse
  throw lastError || new Error('Network error')
}

async function buildHttpError(response) {
  let detail = ''
  try {
    const text = await response.text()
    if (text) {
      try {
        const parsed = JSON.parse(text)
        detail = parsed?.message || parsed?.error || text
      } catch {
        detail = text
      }
    }
  } catch {
    // ignore body parse errors
  }

  const suffix = detail ? ` - ${String(detail).slice(0, 300)}` : ''
  return new Error(`HTTP error! Status: ${response.status} ${response.statusText}${suffix}`)
}

function buildFormData(extra = {}) {
  const formData = new URLSearchParams()
  if (import.meta.env.DEV && DEV_API_KEY) {
    formData.set('api_key', DEV_API_KEY)
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined || value === null) continue
    formData.set(key, String(value))
  }
  return formData
}

// Custom headers to avoid bot detection
const customHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9'
}

// Simple runtime availability flag to avoid repeated failing requests
let _available = true
export function setApiAvailable(v) { _available = Boolean(v) }
export function isApiAvailable() { return _available }

// Mock session for compatibility
let currentSession = null
let authListeners = []

// Custom API client for eyenetbio database
const apiClient = {
  // Auth methods (simplified for custom API)
  auth: {
    async signInWithPassword({ email, password }) {
      try {
        const response = await fetchWithRouteFallback(getFetchCandidates(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...customHeaders
          },
          body: buildFormData({ action: 'login', email, password })
        })

        // Check if response is OK
        if (!response.ok) {
          throw await buildHttpError(response)
        }

        // Get response text first to check if it's empty
        const text = await response.text()
        
        console.log('Auth Response Status:', response.status)
        console.log('Auth Response Length:', text.length)
        console.log('Auth Response Preview:', text.substring(0, 300))
        
        if (!text || text.trim() === '') {
          throw new Error('Empty response from authentication API')
        }

        // Parse JSON with error handling
        let result
        try {
          result = JSON.parse(text)
        } catch (parseErr) {
          console.error('Invalid JSON response from auth:', text.substring(0, 200))
          throw new Error('Invalid JSON response from authentication API')
        }
        
        if (result.status === 'success' || response.ok) {
          currentSession = {
            user: { email },
            access_token: result.token || 'session-token'
          }
          authListeners.forEach(listener => listener('SIGNED_IN', currentSession))
          return { data: { session: currentSession }, error: null }
        } else {
          return { data: null, error: { message: result.message || 'Login failed' } }
        }
      } catch (err) {
        return { data: null, error: { message: err.message || 'Network error' } }
      }
    },

    async signOut() {
      currentSession = null
      authListeners.forEach(listener => listener('SIGNED_OUT', null))
      return { error: null }
    },

    async getSession() {
      return { data: { session: currentSession }, error: null }
    },

    onAuthStateChange(callback) {
      authListeners.push(callback)
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              authListeners = authListeners.filter(l => l !== callback)
            }
          }
        }
      }
    }
  },

  // Data fetching methods
  from(tableName) {
    const query = {
      table: tableName,
      columns: '*',
      filters: {},
      limit: 2000,
      order: null
    }

    const executeQuery = async () => {
      try {
        const formData = buildFormData()
        
        let querySuffix = ''
        
        // If specific filters are provided, add them as query parameters
        if (query.filters && Object.keys(query.filters).length > 0) {
          const filterKey = Object.keys(query.filters)[0]
          const filterValue = query.filters[filterKey]
          
          // Support s_no filtering - must be in URL query string, not body
          if (filterKey === 's_no' || filterKey === 'sno' || filterKey === 'id') {
            const queryParams = new URLSearchParams({ s_no: filterValue })
            querySuffix = `?${queryParams.toString()}`
            console.log('Fetching specific sample:', filterValue, 'URL candidates:', getFetchCandidates(querySuffix))
          }
        }

        const response = await fetchWithRouteFallback(getFetchCandidates(querySuffix), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...customHeaders
          },
          body: formData
        })

        // Check if response is OK
        if (!response.ok) {
          throw await buildHttpError(response)
        }

        // Get response text first to check if it's empty
        const text = await response.text()
        
        console.log('API Response Status:', response.status)
        console.log('API Response Length:', text.length)
        console.log('API Response Preview:', text.substring(0, 500))
        
        if (!text || text.trim() === '') {
          throw new Error('Empty response body from API')
        }

        // Parse JSON with error handling
        let result
        try {
          result = JSON.parse(text)
          console.log('Parsed JSON result:', {
            status: result.status,
            count: result.count,
            dataLength: result.data?.length,
            firstItemKeys: result.data?.[0] ? Object.keys(result.data[0]) : [],
            hasWavelength: !!result.data?.[0]?.wavelength_x,
            hasIntensity: !!result.data?.[0]?.intensity_y
          })
        } catch (parseErr) {
          console.error('Invalid JSON response:', text.substring(0, 200))
          throw new Error('Invalid JSON response from API')
        }
        
        if (result.status === 'success' && result.data) {
          // Helper function to safely parse JSON arrays
          const safeParseArray = (value) => {
            if (!value) return []
            try {
              if (Array.isArray(value)) return value
              if (typeof value === 'string') {
                const parsed = JSON.parse(value)
                return Array.isArray(parsed) ? parsed : []
              }
              return []
            } catch (err) {
              console.warn('Failed to parse array:', value)
              return []
            }
          }

          // Transform the data to match expected format
          const transformedData = result.data.map(item => ({
            ...item,
            'S.No': item.s_no,
            sno: item.s_no,
            id: item.s_no,
            'Sample name': item.sample_name,
            sample_name: item.sample_name,
            geo_tag: item.geo_tag || item.geotag,
            geotag: item.geo_tag || item.geotag,
            // New columns from CSV
            'Raman Shift': item['Raman Shift'] || item.raman_shift || '',
            'Raman intensity': item['Raman intensity'] || item.raman_intensity || '',
            raman_shift: item['Raman Shift'] || item.raman_shift || '',
            raman_intensity: item['Raman intensity'] || item.raman_intensity || '',
            // Parse JSON arrays for wavelength and intensity (handle trailing spaces)
            'Shift x axis': safeParseArray(item['wavelength_x '] || item.wavelength_x),
            'Intensity y axis': safeParseArray(item['intensity_y '] || item.intensity_y),
            shift_x_axis: safeParseArray(item['wavelength_x '] || item.wavelength_x),
            intensity_y_axis: safeParseArray(item['intensity_y '] || item.intensity_y),
            wavelength_x: safeParseArray(item['wavelength_x '] || item.wavelength_x),
            intensity_y: safeParseArray(item['intensity_y '] || item.intensity_y),
            x: safeParseArray(item.wavelength_x),
            y: safeParseArray(item.intensity_y),
            created_at: item.created_at,
            updated_at: item.updated_at || item.created_at
          }))
          
          return { data: transformedData, error: null }
        } else {
          return { data: null, error: { message: result.message || 'Fetch failed' } }
        }
      } catch (err) {
        console.error('API fetch error:', err)
        return { data: null, error: { message: err.message || 'Network error' } }
      }
    }

    return {
      select(columns = '*') {
        query.columns = columns
        return this
      },

      eq(column, value) {
        // Normalize column names for s_no
        const normalizedColumn = (column === 'sno' || column === 'id') ? 's_no' : column
        query.filters[normalizedColumn] = value
        return this
      },

      filter(column, operator, value) {
        // Support filter method for compatibility
        // Normalize column names for s_no
        const normalizedColumn = (column === 'sno' || column === 'id') ? 's_no' : column
        if (operator === 'eq') {
          query.filters[normalizedColumn] = value
        }
        return this
      },

      single() {
        // Return single result - wrap executeQuery in a promise that extracts first item
        return executeQuery().then(result => {
          if (result.error) return result
          if (result.data && result.data.length > 0) {
            return { data: result.data[0], error: null }
          }
          return { data: null, error: { message: 'No data found' } }
        })
      },

      order(column, options = {}) {
        query.order = { column, ascending: options.ascending !== false }
        return this
      },

      limit(n) {
        query.limit = n
        return this
      },

      // Make the object thenable so it works with await
      then(resolve, reject) {
        return executeQuery().then(resolve, reject)
      }
    }
  },

  // RPC method for listing tables
  async rpc(functionName, params = {}) {
    if (functionName === 'list_tables') {
      try {
        // For now, return the known table from the database
        // The API doesn't have a list_tables endpoint, so we hardcode the known table
        return { 
          data: [
            { table_name: 'common_spectra' }
          ], 
          error: null 
        }
      } catch (err) {
        return { data: null, error: { message: err.message || 'Network error' } }
      }
    }
    return { data: null, error: { message: 'RPC function not supported' } }
  }
}

export const db = apiClient
export default apiClient

// Expose on window for debugging
if (typeof window !== 'undefined') window.apiClient = apiClient
