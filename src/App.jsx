import { useState } from 'react';
import { supabase } from './supabaseClient'
import Plot from 'react-plotly.js';
import './App.css';
import GlobeModal from './GlobeModal'


const ARRAY_ROWS = 1024;

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState([]);
  const [columnTypes, setColumnTypes] = useState({}); // map of column name -> type (udt_name or data_type)
  const [selectedSNo, setSelectedSNo] = useState("");
  const [loading, setLoading] = useState(false);
  const [globeOpen, setGlobeOpen] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (loginError) {
        console.error('Supabase login error object:', loginError);
        try { console.error('Supabase login error (string):', JSON.stringify(loginError)) } catch (e) {}
        setError(loginError.message || 'Login failed')
        setLoading(false);
        return;
      }
      setLoggedIn(true);
      // Fetch data after login
      fetchData();
    } catch (err) {
      console.error('Exception during login:', err);
      try { console.error(JSON.stringify(err)) } catch (e) {}
      setError("Login failed. " + (err && err.message ? err.message : String(err)));
    }
    setLoading(false);
  };

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const { data: tableData, error: tableError } = await supabase
        .from('test')
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
        console.log('Error inferring column metadata', err.message || err);
      }
      if (tableData && tableData.length > 0) {
        setSelectedSNo(tableData[0]["S.No"]);
      }
    } catch (err) {
      setError("Data fetch failed. " + err.message);
    }
    setLoading(false);
  };

  // Optional mapping from display labels to actual DB column names when they differ.
  const colNameMap = {
    'Shift x axis': 'shift_x_axis',
    'Intensity y axis': 'intensity_y_axis',
    'Sample name': 'sample_name',
    'geo_tag': 'geo_tag',
    'Shift (X)': 'shift_x_axis',
    'Intensity (Y)': 'intensity_y_axis'
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
        inferred[k] = 'jsonb (inferred)';
      } else if (typeof v === 'object') {
        inferred[k] = 'jsonb (inferred)';
      } else if (typeof v === 'number') {
        // differentiate integer vs float
        inferred[k] = Number.isInteger(v) ? 'int8 (inferred)' : 'float8 (inferred)';
      } else if (typeof v === 'string') {
        // check if it's a JSON array string
        const t = v.trim();
        if ((t.startsWith('[') && t.endsWith(']')) || (t.startsWith('{') && t.endsWith('}'))) {
          inferred[k] = 'jsonb (inferred)';
        } else {
          inferred[k] = 'text (inferred)';
        }
      } else if (typeof v === 'boolean') {
        inferred[k] = 'bool (inferred)';
      } else {
        inferred[k] = String(typeof v) + ' (inferred)';
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

  const selectedRow = data.find(row => String(row["S.No"]) === String(selectedSNo));

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
      } catch (e) {
        // fall through to regex extraction
      }
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
      } catch {
        return val.split(',').map(Number).filter(v => !isNaN(v));
      }
    }
    if (typeof val === "number") return [val];
    return [];
  };

  // Format values for the below-plot single-row table: if an array has one item show that item
  const formatBelowValue = (val) => {
    if (val === undefined || val === null) return '';
    if (Array.isArray(val)) {
      if (val.length === 1) return String(val[0]);
      return val.join(', ');
    }
    if (typeof val === 'string') {
      const t = val.trim();
      // try to parse JSON arrays
      if (t.startsWith('[') && t.endsWith(']')) {
        try {
          const p = JSON.parse(t);
          if (Array.isArray(p)) return p.length === 1 ? String(p[0]) : p.join(', ');
        } catch (e) {
          // fallthrough
        }
      }
      // comma-separated string
      if (t.includes(',')) {
        const parts = t.split(',').map(s => s.trim()).filter(Boolean);
        return parts.length === 1 ? parts[0] : parts.join(', ');
      }
      return t;
    }
    return String(val);
  };

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
    <div className="container">
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
            <form onSubmit={handleLogin} className="login-form">
              <h2>Login</h2>
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
                    /* eye-off icon */
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-5.05 0-9.27-3.11-11-7 1.05-2.25 2.89-4.06 5.09-5.06" />
                      <path d="M1 1l22 22" />
                      <path d="M9.53 9.53A3.5 3.5 0 0 0 12 15a3.5 3.5 0 0 0 3.47-2.47" />
                    </svg>
                  ) : (
                    /* eye icon */
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              <button type="submit" disabled={loading}>Login</button>
              {error && <p className="error">{error}</p>}
            </form>
          </div>
        </div>
      ) : (
        <div className="app-content">
          <div className="app-header">
            <img src="/logo_log.jpg" alt="Company logo" className="brand-logo" />
            <div>
              <div className="company-name">Deep Spectrum</div>
              <h1>Spectroscopic Data Viewer</h1>
              <div className="subtitle">Interactive spectra viewer</div>
            </div>
            <img src="/GIS.png" alt="GIS" className="header-gis" onClick={() => setGlobeOpen(true)} />
            <GlobeModal open={globeOpen} onClose={() => setGlobeOpen(false)} selectedSNo={selectedSNo} />
          </div>

          <h2>Data Table: test_raman</h2>
          {loading && <p>Loading data...</p>}
          {error && <p className="error">{error}</p>}

          {data.length > 0 ? (
            <>
              <label htmlFor="sno-select">Select S.No:</label>
              <select
                id="sno-select"
                value={String(selectedSNo)}
                onChange={e => setSelectedSNo(e.target.value)}
                className="sno-select"
              >
                {data.map(row => (
                  <option key={row["S.No"]} value={String(row["S.No"]) }>{String(row["S.No"])}</option>
                ))}
              </select>

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
                                marker: { color: '#caa6ff', size: 5 },
                                line: { color: '#caa6ff', width: 3 },
                                name: 'Spectra',
                              },
                              {
                                x: hasData ? x : [0],
                                y: hasData ? y : [0],
                                type: 'scatter',
                                mode: 'lines',
                                line: { color: '#caa6ff', width: 6, opacity: 0.06 },
                                hoverinfo: 'skip',
                                showlegend: false,
                              }
                            ]}
                            layout={{
                              title: 'Spectroscopic Curve',
                              plot_bgcolor: 'rgba(0,0,0,0)',
                              paper_bgcolor: 'rgba(0,0,0,0)',
                              font: { family: 'Poppins, Arial, sans-serif', size: 15, color: '#ffffff' },
                              xaxis: { title: { text: 'Shift (X Axis)', font: { size: 15, color: '#ffffff' } }, tickfont: { size: 15, color: '#ffffff' }, automargin: true, color: '#ffffff', gridcolor: 'rgba(255,255,255,0.06)' },
                              yaxis: { title: { text: 'Intensity (Y Axis)', font: { size: 15, color: '#ffffff' } }, tickfont: { size: 15, color: '#ffffff' }, automargin: true, color: '#ffffff', gridcolor: 'rgba(255,255,255,0.06)' },
                              legend: { orientation: 'h', x: 0.5, xanchor: 'center', y: -0.18, font: { color: '#ffffff' } },
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
                          { x: [0], y: [0], type: 'scatter', mode: 'lines+markers', marker: { color: '#caa6ff', size: 5 }, line: { color: '#caa6ff', width: 3 } },
                          { x: [0], y: [0], type: 'scatter', mode: 'lines', line: { color: '#caa6ff', width: 6, opacity: 0.06 }, hoverinfo: 'skip', showlegend: false }
                        ]}
                        layout={{
                          title: 'Spectroscopic Curve',
                          plot_bgcolor: '#05060a',
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          font: { family: 'Poppins, Arial, sans-serif', size: 13, color: '#ffffff' },
                          xaxis: { title: { text: 'Shift', font: { size: 15, color: '#ffffff' } }, tickfont: { size: 14, color: '#ffffff' }, automargin: true, color: '#ffffff', gridcolor: 'rgba(255,255,255,0.06)' },
                          yaxis: { title: { text: 'Intensity', font: { size: 15, color: '#ffffff' } }, tickfont: { size: 14, color: '#ffffff' }, automargin: true, color: '#ffffff', gridcolor: 'rgba(255,255,255,0.06)' },
                          legend: { orientation: 'h', x: 0.5, xanchor: 'center', y: -0.18, font: { color: '#ffffff' } },
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
                        <th>Raman shift <span className="col-type">{'{' + resolveColType('Shift x axis', 'number') + '}'}</span></th>
                        <th>Raman intensity <span className="col-type">{'{' + resolveColType('Intensity y axis', 'number') + '}'}</span></th>
                        <th>geo_tag <span className="col-type">{'{' + resolveColType('geo_tag', 'text') + '}'}</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="col-value">{selectedRow?.['Sample name'] ?? ''}</td>
                        {(() => {
                          const peak = computePeak(xArr, yArr);
                          return (
                            <>
                              <td className="col-value">{peak.x !== '' ? formatX(peak.x) : ''}</td>
                              <td className="col-value">{peak.y !== '' ? formatY(peak.y) : ''}</td>
                            </>
                          );
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
    </div>
  );
}

export default App;