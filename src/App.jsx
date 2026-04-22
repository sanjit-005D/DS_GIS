import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { db } from './apiClient' // Custom API client (eyenetbio database)
import Plot from 'react-plotly.js';
import './App.css';
import GlobeModal from './GlobeModal'


const ARRAY_ROWS = 1024;

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignupMode, setIsSignupMode] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [database, setDatabase] = useState('v_complete_spectral_data'); // selected table name (labelled "database" in UI)
  const [tableNames, setTableNames] = useState([]);
  const [tableFetchError, setTableFetchError] = useState('');
  const [manualTable, setManualTable] = useState('');
  const [idColumn, setIdColumn] = useState('S.No');
  const [showPassword, setShowPassword] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState([]);
  const [columnTypes, setColumnTypes] = useState({}); // map of column name -> type (udt_name or data_type)
  const [selectedSNo, setSelectedSNo] = useState("");
  const [detailedSample, setDetailedSample] = useState(null); // Detailed sample data with spectral arrays
  const [loading, setLoading] = useState(false);
  const [globeOpen, setGlobeOpen] = useState(() => {
    try {
      return sessionStorage.getItem('globeOpen') === 'true'
    } catch {
      return false
    }
  });
  const [globeHovered, setGlobeHovered] = useState(false);
  // spectral ranges (X1, X2, ...). Each item: { name: 'X1', start: number, end: number }
  const [spectralRanges, setSpectralRanges] = useState([{ name: 'X1', start: 200, end: 1100 }])
  const [activeRangeIndex, setActiveRangeIndex] = useState(0)

  // Persist globeOpen state across refreshes
  useEffect(() => {
    try {
      sessionStorage.setItem('globeOpen', globeOpen.toString())
    } catch (err) {
      // console.error('Error saving globeOpen state:', err)
    }
  }, [globeOpen])

  // Check for existing session on page load (persist login on refresh)
  useEffect(() => {
    const checkSession = async () => {
      try {
        // Check if this is a new browser session (tab was closed and reopened)
        const sessionActive = sessionStorage.getItem('appSessionActive')
        
        if (!sessionActive) {
          // New session - logout any existing session
          await db.auth.signOut()
          setLoggedIn(false)
        } else {
          // Existing session - check if user is logged in
          const { data: { session } } = await db.auth.getSession()
          if (session) {
            setLoggedIn(true)
          }
        }
        
        // Mark session as active
        sessionStorage.setItem('appSessionActive', 'true')
      } catch (err) {
        // console.error('Error checking session:', err)
      } finally {
        setSessionChecking(false)
      }
    }
    checkSession()

    // Listen for auth state changes
    const { data: { subscription } } = db.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setLoggedIn(true)
        sessionStorage.setItem('appSessionActive', 'true')
      } else if (event === 'SIGNED_OUT') {
        setLoggedIn(false)
        sessionStorage.removeItem('appSessionActive')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Logout handler
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
      setLoggedIn(false)
      setEmail('')
      setPassword('')
      setData([])
      setSelectedSNo('')
      setGlobeOpen(false)
      sessionStorage.removeItem('globeOpen')
    } catch (err) {
      // console.error('Logout error:', err)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Check localStorage for registered users
      const storedUsers = JSON.parse(localStorage.getItem('registeredUsers') || '[]');
      const user = storedUsers.find(u => u.email === email && u.password === password);
      
      if (user) {
        // Local user found
        setLoggedIn(true);
        sessionStorage.setItem('currentUser', JSON.stringify({ email: user.email, name: user.name }));
      } else {
        // Try API login as fallback
        const { error: loginError } = await db.auth.signInWithPassword({
          email,
          password,
        });
        if (loginError) {
          setError('Invalid email or password')
          setLoading(false);
          return;
        }
        setLoggedIn(true);
      }
    } catch (err) {
      setError("Login failed. " + (err && err.message ? err.message : String(err)));
    }
    setLoading(false);
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    
    try {
      // Validation
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        setLoading(false);
        return;
      }
      
      if (password.length < 6) {
        setError('Password must be at least 6 characters');
        setLoading(false);
        return;
      }
      
      // Check if user already exists
      const storedUsers = JSON.parse(localStorage.getItem('registeredUsers') || '[]');
      const existingUser = storedUsers.find(u => u.email === email);
      
      if (existingUser) {
        setError('User with this email already exists');
        setLoading(false);
        return;
      }
      
      // Create new user
      const newUser = {
        email,
        password, // In production, this should be hashed
        name: email.split('@')[0],
        createdAt: new Date().toISOString()
      };
      
      storedUsers.push(newUser);
      localStorage.setItem('registeredUsers', JSON.stringify(storedUsers));
      
      // Auto-login after signup
      setLoggedIn(true);
      sessionStorage.setItem('currentUser', JSON.stringify({ email: newUser.email, name: newUser.name }));
      setError('');
      
    } catch (err) {
      setError("Signup failed. " + (err && err.message ? err.message : String(err)));
    }
    setLoading(false);
  };

  // When the logged-in state or selected database changes, (re)fetch the table data.
  useEffect(() => {
    if (loggedIn) {
      void fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, database]);

  // When selectedSNo changes, fetch detailed sample data with spectral arrays
  useEffect(() => {
    const fetchDetailedSample = async () => {
      if (!selectedSNo || !loggedIn) {
        setDetailedSample(null);
        return;
      }

      try {
        const targetTable = database || 'v_complete_spectral_data';
        const { data: sampleData, error: sampleError } = await db
          .from(targetTable)
          .select('*')
          .eq('s_no', selectedSNo)
          .single();
        
        if (sampleError) {
          console.error('Error fetching detailed sample:', sampleError);
          setDetailedSample(null);
        } else {
          setDetailedSample(sampleData);
        }
      } catch (err) {
        console.error('Failed to fetch detailed sample:', err);
        setDetailedSample(null);
      }
    };

    fetchDetailedSample();
  }, [selectedSNo, loggedIn, database]);

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const targetTable = database || 'v_complete_spectral_data';
      const { data: tableData, error: tableError } = await db
        .from(targetTable)
        .select('*');
      if (tableError) {
        setError(tableError.message);
        setLoading(false);
        return;
      }
      setData(tableData);
      // infer column types from the first row (safer than querying information_schema via the public REST API)
      try {
        if (tableData && tableData.length > 0) {
          const inferred = inferTypesFromSample(tableData[0]);
          setColumnTypes(inferred);
        }
      } catch (err) {
        // console.log('Error inferring column metadata', err.message || err);
      }
      if (tableData && tableData.length > 0) {
        // Detect a sensible identifier column for this table (prefer S.No, sno, id, etc.)
        const firstRow = tableData[0];
        const lowerMap = Object.keys(firstRow).reduce((acc, k) => { acc[k.toLowerCase()] = k; return acc }, {});
        const prefer = ['s.no', 'sno', 's_no', 'id'];
        let detected = null;
        for (const p of prefer) {
          if (lowerMap[p]) { detected = lowerMap[p]; break }
        }
        if (!detected) {
          // try to find a key that contains 'sno' or is exactly 'id'
          for (const k of Object.keys(firstRow)) {
            const kl = k.toLowerCase();
            if (kl.includes('sno') || kl === 'id') { detected = k; break }
          }
        }
        if (!detected) detected = Object.keys(firstRow)[0];
        setIdColumn(detected);
        setSelectedSNo(firstRow[detected]);
      }
    } catch (err) {
      setError("Data fetch failed. " + err.message);
    }
    setLoading(false);
  };

  // Attempt to fetch table names from the custom database API.
  // Note: We try the list_tables RPC endpoint first, then fall back to a minimal list.
  const fetchTableNames = useCallback(async () => {
    setTableFetchError('');
    // Preferred: call the API's list_tables endpoint that returns available table names.
    try {
      const { data: rpcData, error: rpcErr } = await db.rpc('list_tables');
      if (!rpcErr && Array.isArray(rpcData) && rpcData.length > 0) {
        // rpc should return array of { table_name }
        const list = rpcData.map(r => r.table_name || r.tablename || String(r)).filter(Boolean);
        setTableNames(list);
        if (!database && list.length > 0) setDatabase(list[0]);
        return;
      }
    } catch (e) {
      // console.debug('RPC list_tables failed or not present', e?.message || e);
    }

    // If RPC is not available, fall back to trying the catalog queries (may be blocked for anon key)
    try {
      // 1) information_schema.tables
      const { data: infoData, error: infoErr } = await db
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .order('table_name', { ascending: true });
      if (!infoErr && Array.isArray(infoData) && infoData.length > 0) {
        const list = infoData.map(r => r.table_name).filter(Boolean);
        setTableNames(list);
        if (!database && list.length > 0) setDatabase(list[0]);
        return;
      }
    } catch (e) {
      // console.debug('information_schema query failed', e?.message || e);
    }

    try {
      // 2) pg_catalog.pg_tables
      const { data: pgData, error: pgErr } = await db
        .from('pg_catalog.pg_tables')
        .select('tablename')
        .eq('schemaname', 'public')
        .order('tablename', { ascending: true });
      if (!pgErr && Array.isArray(pgData) && pgData.length > 0) {
        const list = pgData.map(r => r.tablename || r.table_name).filter(Boolean);
        setTableNames(list);
        if (!database && list.length > 0) setDatabase(list[0]);
        return;
      }
    } catch (e) {
      // console.debug('pg_catalog query failed', e?.message || e);
    }

    // If we reach here, listing tables failed. Use v_complete_spectral_data as the only available table.
    const fallback = ['v_complete_spectral_data'];
    setTableNames(fallback);
    if (!database || database === 'test') setDatabase(fallback[0]);
    setTableFetchError('');
  }, [database]);

  useEffect(() => {
    fetchTableNames();
  }, [fetchTableNames]);

  // When user logs in, re-run table listing (some endpoints may require auth)
  useEffect(() => {
    if (loggedIn) {
      void fetchTableNames();
    }
  }, [loggedIn, fetchTableNames]);

  // Optional mapping from display labels to actual DB column names when they differ.
  const colNameMap = {
    'Shift x axis': 'shift_x_axis',
    'Intensity y axis': 'intensity_y_axis',
    'Sample name': 'sample_name',
    'geo_tag': 'geo_tag',
    'Shift (X)': 'shift_x_axis',
    'Intensity (Y)': 'intensity_y_axis',
    'Raman Shift': 'raman_shift',
    'Raman intensity': 'raman_intensity'
  };

  // If information_schema is unavailable, we can infer types from the first returned row.
  const inferTypesFromSample = (sampleRow) => {
    if (!sampleRow || typeof sampleRow !== 'object') return {};
    const inferred = {};
    Object.keys(sampleRow).forEach(k => {
      const v = sampleRow[k];
      if (v === null || v === undefined) {
        inferred[k] = 'unknown';
      } else if (Array.isArray(v)) {
        inferred[k] = 'jsonb';
      } else if (typeof v === 'object') {
        inferred[k] = 'jsonb';
      } else if (typeof v === 'number') {
        // differentiate integer vs float
        inferred[k] = Number.isInteger(v) ? 'int8' : 'float8';
      } else if (typeof v === 'string') {
        // check if it's a JSON array string
        const t = v.trim();
        if ((t.startsWith('[') && t.endsWith(']')) || (t.startsWith('{') && t.endsWith('}'))) {
          inferred[k] = 'jsonb';
        } else {
          inferred[k] = 'text';
        }
      } else if (typeof v === 'boolean') {
        inferred[k] = 'bool';
      } else {
        inferred[k] = String(typeof v);
      }
    });
    return inferred;
  };

  // Resolve a sensible column type label for a displayed column name.
  const resolveColType = (colLabel, fallback) => {
    if (!colLabel) return fallback || '';
    // 1) direct match in fetched columnTypes
    if (columnTypes && columnTypes[colLabel]) return columnTypes[colLabel];
    // 2) try common transformations against columnTypes keys
    const lower = colLabel.toLowerCase();
    for (const k of Object.keys(columnTypes || {})) {
      if (k.toLowerCase() === lower) return columnTypes[k];
      if (k.toLowerCase().replace(/_/g, ' ') === lower) return columnTypes[k];
      if (k.toLowerCase() === lower.replace(/ /g, '_')) return columnTypes[k];
    }
    // 3) try explicit mapping from display label to DB column name
    const mapped = colNameMap[colLabel] || colNameMap[colLabel.trim()];
    if (mapped && columnTypes && columnTypes[mapped]) return columnTypes[mapped];
    // 4) try a lowercase/underscore variant of mapping
    if (mapped) {
      const mLower = mapped.toLowerCase();
      for (const k of Object.keys(columnTypes || {})) {
        if (k.toLowerCase() === mLower) return columnTypes[k];
      }
    }
    // 5) lastly, infer from first data row if available
    if (data && data.length > 0) {
      const inferred = inferTypesFromSample(data[0]);
      // try display label direct match
      if (inferred[colLabel]) return inferred[colLabel];
      // try mapped name
      if (mapped && inferred[mapped]) return inferred[mapped];
      // try lowercase/underscore variants
      for (const k of Object.keys(inferred)) {
        if (k.toLowerCase() === lower) return inferred[k];
        if (k.toLowerCase().replace(/_/g, ' ') === lower) return inferred[k];
        if (k.toLowerCase() === lower.replace(/ /g, '_')) return inferred[k];
      }
    }
    return fallback || '';
  };

  // Use detailedSample if available (includes spectral arrays), otherwise find from list
  const selectedRow = detailedSample || data.find(row => String(row[idColumn]) === String(selectedSNo));

  // derive numeric arrays for XY table (safe parsing)
  const toNumArrayLocal = val => {
    if (!val && val !== 0) return [];
    if (Array.isArray(val)) return val.map(v => Number(v)).filter(n => !Number.isNaN(n));
    if (typeof val === 'number') return [val];
    if (typeof val === 'string') {
      // try JSON.parse first (handles strings like "[1,2,3]")
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) return parsed.map(v => Number(v)).filter(n => !Number.isNaN(n));
      } catch (e) { void e /* fall through to regex extraction */ }
      // extract numeric tokens (handles brackets, whitespace, commas, etc.)
      const matches = val.match(/-?\d+\.?\d*(?:e[+-]?\d+)?/ig);
      if (matches) return matches.map(Number).filter(n => !Number.isNaN(n));
      // last-resort split
      return val.replace(/^\[|\]$/g, '').split(/[,\s]+/).filter(Boolean).map(Number).filter(n => !Number.isNaN(n));
    }
    return [];
  };

  const xArr = toNumArrayLocal(selectedRow?.['Shift x axis']);
  const yArr = toNumArrayLocal(selectedRow?.['Intensity y axis']);

  // Helper to convert various formats to array of numbers
  const toNumArray = val => {
    if (Array.isArray(val)) return val.map(Number);
    if (typeof val === "string") {
      try {
        const arr = JSON.parse(val);
        if (Array.isArray(arr)) return arr.map(Number);
      } catch (e) { void e; return val.split(',').map(Number).filter(v => !isNaN(v)); }
    }
    if (typeof val === "number") return [val];
    return [];
  };

  // (formatBelowValue removed — unused)

  // Compute peak (max y) and corresponding x value
  const computePeak = (xA, yA) => {
    if (!Array.isArray(yA) || yA.length === 0) return { x: '', y: '' };
    // find index of maximum numeric y
    let maxIdx = 0;
    for (let i = 1; i < yA.length; i++) {
      const a = Number(yA[i]);
      const b = Number(yA[maxIdx]);
      if (!Number.isNaN(a) && (Number.isNaN(b) || a > b)) maxIdx = i;
    }
    const yVal = yA[maxIdx];
    const xVal = Array.isArray(xA) && xA.length > maxIdx ? xA[maxIdx] : (xA && xA.length === 1 ? xA[0] : '');
    return { x: xVal, y: yVal };
  };

  // format helpers
  const formatX = (v) => {
    const n = Number(v);
    if (Number.isNaN(n) || v === '' || v === null || v === undefined) return '';
    return n.toFixed(2);
  };

  const formatY = (v) => {
    const n = Number(v);
    if (Number.isNaN(n) || v === '' || v === null || v === undefined) return '';
    return n.toFixed(6);
  };

  return (
    <>
      <div className="container">
        {/* Show nothing while checking session to prevent flash */}
        {sessionChecking ? null : (
          <>
        {/* When not logged in, show overlay with login form and the logo/title inside the modal */}
        {!loggedIn ? (
        <div className="login-overlay">
          <div className="login-modal">
            <div className="login-header">
              <img src="/logo_log.jpg" alt="Company logo" className="brand-logo" />
              <div>
                <div className="company-name">Deep Spectrum</div>
                <h1>Spectroscopic Data Viewer</h1>
                <div className="subtitle">Interactive spectra viewer</div>
              </div>
            </div>
            <form onSubmit={isSignupMode ? handleSignup : handleLogin} className="login-form">
              <h2>{isSignupMode ? 'Create Account' : 'Login'}</h2>
              <input
                type="email"
                placeholder="Email"
                value={email}
                id="login-email"
                name="email"
                onChange={e => setEmail(e.target.value)}
                required
              />
              <div className="password-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  id="login-password"
                  name="password"
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword(s => !s)}
                >
                  {showPassword ? (
                    /* eye-slash icon - hide password */
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 2l20 20" />
                      <path d="M6.71 6.71C3.94 8.56 2 12 2 12s4 8 10 8c1.71 0 3.29-.45 4.66-1.2" />
                      <path d="M17.29 17.29C20.06 15.44 22 12 22 12s-4-8-10-8c-1.71 0-3.29.45-4.66 1.2" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    /* eye icon - show password */
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8-10-8-10-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {isSignupMode && (
                <div className="password-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Confirm Password"
                    value={confirmPassword}
                    id="confirm-password"
                    name="confirmPassword"
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
              )}
              <button type="submit" disabled={loading}>
                {isSignupMode ? 'Sign Up' : 'Login'}
              </button>
              {error && <p className="error">{error}</p>}
              <div className="auth-toggle">
                {isSignupMode ? (
                  <p>
                    Already have an account?{' '}
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        setIsSignupMode(false);
                        setError('');
                        setConfirmPassword('');
                      }}
                    >
                      Login here
                    </button>
                  </p>
                ) : (
                  <p>
                    Don't have an account?{' '}
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        setIsSignupMode(true);
                        setError('');
                      }}
                    >
                      Sign up
                    </button>
                  </p>
                )}
              </div>
            </form>
          </div>
        </div>
      ) : (
        <div className="app-content" style={{ position: 'relative', marginTop: -60 }}>
          {/* Top right controls container */}
          <div style={{
            position: 'fixed',
            top: 20,
            right: 20,
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 8
          }}>
            {/* Logout button */}
            <button
              onClick={handleLogout}
              style={{
                height: 36,
                paddingLeft: 12,
                paddingRight: 14,
                background: 'transparent',
                border: 'none',
                color: '#000',
                cursor: 'pointer',
                boxShadow: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                fontWeight: 600
              }}
              title="Logout"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Logout
            </button>
          </div>

          <div className="app-header">
            <img src="/logo_log.jpg" alt="Company logo" className="brand-logo" />
            <div>
              <div className="company-name">Deep Spectrum</div>
              <h1>Spectroscopic Data Viewer</h1>
              <div className="subtitle">Interactive spectra viewer</div>
            </div>
            <GlobeModal
              open={globeOpen}
              onClose={() => setGlobeOpen(false)}
              selectedSNo={selectedSNo}
              selectedTable={database}
              selectedIdColumn={idColumn}
              spectralRanges={spectralRanges}
              setSpectralRanges={setSpectralRanges}
              activeRangeIndex={activeRangeIndex}
              setActiveRangeIndex={setActiveRangeIndex}
            />
          </div>

          {/* Database selector is shown after login so users pick the table in the main UI */}
          <div style={{ marginBottom: 12, marginTop: 45, marginLeft: -10, display: 'flex', alignItems: 'center' }}>
            <label htmlFor="database-select" style={{ color: '#213547', fontWeight: 'bold', marginLeft: 10 }}>Database:</label>
            {tableNames && tableNames.length > 0 && tableFetchError === '' ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 8 }}>
                <select
                  id="database-select"
                  value={database}
                  onChange={e => setDatabase(e.target.value)}
                  style={{ fontSize: 12, padding: '8px 12px', minWidth: 90 }}
                >
                  {tableNames.map(t => <option key={t} value={t}>{t}</option>)}
                </select>

                {/* S.No selector - inline with database */}
                {data.length > 0 && (
                  <>
                    <label htmlFor="sno-select" style={{ color: '#213547', fontWeight: 'bold', marginLeft: 20 }}>S.No:</label>
                    <select
                      id="sno-select"
                      value={String(selectedSNo)}
                      onChange={e => setSelectedSNo(e.target.value)}
                      style={{ fontSize: 11, padding: '5px 8px', minWidth: 70, marginLeft: 8 }}
                    >
                      {data.map(row => (
                        <option key={row[idColumn]} value={String(row[idColumn])}>{String(row[idColumn])}</option>
                      ))}
                    </select>
                  </>
                )}

                {/* Wavelength ranges are now managed inside the GIS modal (Globe). */}
              </div>
            ) : (
              <div style={{ display: 'inline-block', marginLeft: 8 }}>
                <select
                  id="database-select"
                  value={database}
                  onChange={e => setDatabase(e.target.value)}
                  disabled
                  style={{ fontSize: 14, padding: '8px 12px', minWidth: 180 }}
                >
                  <option value="test">test</option>
                </select>
                <div style={{ fontSize: 12, color: '#ffcc00' }}>
                  {tableFetchError ? (
                    <>
                      {tableFetchError}
                      <div>
                        <button type="button" onClick={() => { setTableFetchError(''); fetchTableNames(); }} style={{ marginTop: 6 }}>Retry listing</button>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'inline-block', marginLeft: 8 }}>Loading table list...</div>
                  )}
                </div>
                <div style={{ marginTop: 6 }}>
                  <label htmlFor="manual-table" style={{ display: 'block', fontSize: 12 }}>Or enter table name manually</label>
                  <input id="manual-table" placeholder="table name (e.g. test)" value={manualTable} onChange={e => setManualTable(e.target.value)} style={{ width: 220 }} />
                  <div style={{ marginTop: 6 }}>
                    <button type="button" onClick={() => { if (manualTable) { setDatabase(manualTable); setTableNames([manualTable]); } }}>Use table</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <h2>Data Table: {database || 'test'}</h2>
          {loading && <p>Loading data...</p>}
          {error && <p className="error">{error}</p>}

          {data.length > 0 ? (
            <>

              <div className="visual-row">
                <div className="plot-area centered">
                  {selectedRow ? (
                    <div className="curve-container">
                      <h3>Sample: {selectedRow["Sample name"]}</h3>
                      {(() => {
                        let x = toNumArray(selectedRow["Shift x axis"]);
                        let y = toNumArray(selectedRow["Intensity y axis"]);
                        const hasData = x.length > 0 && y.length > 0;
                        return (
                          <Plot
                            data={[
                              {
                                x: hasData ? x : [0],
                                y: hasData ? y : [0],
                                type: 'scatter',
                                mode: 'lines+markers',
                                marker: { color: '#0044ffff', size: 5 },
                                line: { color: '#0044ffff', width: 3 },
                                name: 'Spectra',
                              },
                              {
                                x: hasData ? x : [0],
                                y: hasData ? y : [0],
                                type: 'scatter',
                                mode: 'lines',
                                line: { color: '#0044ffff', width: 6, opacity: 0.08 },
                                hoverinfo: 'skip',
                                showlegend: false,
                              }
                            ]}
                            layout={{
                              title: 'Spectroscopic Curve',
                              plot_bgcolor: 'rgba(255,255,255,0)',
                              paper_bgcolor: 'rgba(255,255,255,0)',
                              font: { family: 'Poppins, Arial, sans-serif', size: 15, color: '#000000' },
                              xaxis: { title: { text: 'Shift (X Axis)', font: { size: 15, color: '#000000' } }, tickfont: { size: 15, color: '#000000' }, automargin: true, color: '#000000', gridcolor: 'rgba(0,0,0,0.08)' },
                              yaxis: { title: { text: 'Intensity (Y Axis)', font: { size: 15, color: '#000000' } }, tickfont: { size: 15, color: '#000000' }, automargin: true, color: '#000000', gridcolor: 'rgba(0,0,0,0.08)' },
                              legend: { orientation: 'h', x: 0.5, xanchor: 'center', y: -0.18, font: { color: '#000000' } },
                              margin: { b: 48 }, // add space at bottom (~1cm)
                              autosize: true,
                            }}
                            style={{ width: '820px', maxWidth: '100%', height: '480px' }}
                          />
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="curve-container">
                      <Plot
                        data={[
                          { x: [0], y: [0], type: 'scatter', mode: 'lines+markers', marker: { color: '#ff0000', size: 5 }, line: { color: '#ff0000', width: 3 } },
                          { x: [0], y: [0], type: 'scatter', mode: 'lines', line: { color: '#ff0000', width: 6, opacity: 0.08 }, hoverinfo: 'skip', showlegend: false }
                        ]}
                        layout={{
                          title: 'Spectroscopic Curve',
                          plot_bgcolor: 'rgba(255,255,255,0)',
                          paper_bgcolor: 'rgba(255,255,255,0)',
                          font: { family: 'Poppins, Arial, sans-serif', size: 13, color: '#000000' },
                          xaxis: { title: { text: 'Shift', font: { size: 15, color: '#000000' } }, tickfont: { size: 14, color: '#000000' }, automargin: true, color: '#000000', gridcolor: 'rgba(0,0,0,0.08)' },
                          yaxis: { title: { text: 'Intensity', font: { size: 15, color: '#000000' } }, tickfont: { size: 14, color: '#000000' }, automargin: true, color: '#000000', gridcolor: 'rgba(0,0,0,0.08)' },
                          legend: { orientation: 'h', x: 0.5, xanchor: 'center', y: -0.18, font: { color: '#000000' } },
                          margin: { b: 48 }, // add space at bottom (~1cm)
                          autosize: true
                        }}
                        style={{ width: '820px', maxWidth: '100%', height: '520px' }}
                      />
                    </div>
                  )}
                </div>

                <div className="rawdata-area">
                  <div className="xy-card rawdata-card">
                    <div className="xy-table-scroll" style={{ maxHeight: 520, overflowY: 'auto', overflowX: 'hidden', marginTop: 18 }}>
                      <table className="raw-table xy-table">
                        <thead>
                          <tr>
                            <th>Shift (X) <span className="col-type">{'{' + resolveColType('Shift x axis', 'number') + '}'}</span></th>
                            <th>Intensity (Y) <span className="col-type">{'{' + resolveColType('Intensity y axis', 'number') + '}'}</span></th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: ARRAY_ROWS }).map((_, i) => (
                            <tr key={i}>
                              <td className="col-value">{xArr[i] !== undefined && xArr[i] !== null && xArr[i] !== '' ? formatX(xArr[i]) : ''}</td>
                              <td className="col-value">{yArr[i] !== undefined && yArr[i] !== null && yArr[i] !== '' ? formatY(yArr[i]) : ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

              </div>

              {/* Below the visual-row: single-row 4-column table with Sample name, Raman shift, Raman intensity and geo_tag for the selected S.No */}
              <div className="below-table">
                <div className="rawdata-card below-card">
                  <table className="raw-table below-raw-table">
                    <thead>
                      <tr>
                        <th>Sample name <span className="col-type">{'{' + resolveColType('Sample name', 'text') + '}'}</span></th>
                        <th>Raman Shift <span className="col-type">{'{' + resolveColType('Raman Shift', 'number') + '}'}</span></th>
                        <th>Raman intensity <span className="col-type">{'{' + resolveColType('Raman intensity', 'number') + '}'}</span></th>
                        <th>geo_tag <span className="col-type">{'{' + resolveColType('geo_tag', 'text') + '}'}</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="col-value">{selectedRow?.['Sample name'] ?? ''}</td>
                        {(() => {
                          // Use database columns if available, otherwise compute from peak
                          const ramanShift = selectedRow?.['Raman Shift'] || selectedRow?.raman_shift;
                          const ramanIntensity = selectedRow?.['Raman intensity'] || selectedRow?.raman_intensity;
                          
                          if (ramanShift !== undefined && ramanShift !== null && ramanShift !== '') {
                            return (
                              <>
                                <td className="col-value">{formatX(ramanShift)}</td>
                                <td className="col-value">{formatY(ramanIntensity)}</td>
                              </>
                            );
                          } else {
                            // Fallback to computed peak if columns not available
                            const peak = computePeak(xArr, yArr);
                            return (
                              <>
                                <td className="col-value">{peak.x !== '' ? formatX(peak.x) : ''}</td>
                                <td className="col-value">{peak.y !== '' ? formatY(peak.y) : ''}</td>
                              </>
                            );
                          }
                        })()}
                        <td className="col-value">{selectedRow?.['geo_tag'] ?? ''}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <p>No data found in the table.</p>
          )}
        </div>
      )}
      
      {/* small corner logo fixed to bottom-right */}
      <img src="/logo_log.jpg" alt="logo" className="corner-logo" />
          </>
        )}
      </div>
      
      {/* Globe/GIS button - rendered via Portal directly to body for true fixed positioning */}
      {loggedIn && !globeOpen && createPortal(
        <>
          <img 
            src="/GIS.png" 
            alt="GIS" 
            className="header-gis" 
            style={{
              position: 'fixed',
              top: '80px',
              right: '20px',
              zIndex: 9999,
              width: '120px',
              height: '120px'
            }}
            onClick={() => {
              setGlobeHovered(false)
              setGlobeOpen(true)
            }} 
            onMouseEnter={() => setGlobeHovered(true)}
            onMouseLeave={() => setGlobeHovered(false)}
          />
          {/* Globe hover tooltip */}
          {globeHovered && (
            <div style={{
              position: 'fixed',
              top: '210px',
              right: '20px',
              background: 'rgba(0, 0, 0, 0.9)',
              color: '#fff',
              padding: '8px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '500',
              whiteSpace: 'nowrap',
              zIndex: 10000,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              pointerEvents: 'none'
            }}>
              Click on the globe to experience GIS System with Spectral Analytics
            </div>
          )}
        </>,
        document.body
      )}
    </>
  );
}

export default App;