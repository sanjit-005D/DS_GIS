import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Plot from 'react-plotly.js';
import './App.css';

const supabaseUrl = "https://uieniviriyblquryluxx.supabase.co";
const supabaseKey = "sb_publishable_-L-eQJsyRREQZBO7dnTMPw_e2Se9VcF";
const supabase = createClient(supabaseUrl, supabaseKey);

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState([]);
  const [selectedSNo, setSelectedSNo] = useState("");
  const [loading, setLoading] = useState(false);

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
        setError(loginError.message);
        setLoading(false);
        return;
      }
      setLoggedIn(true);
      // Fetch data after login
      fetchData();
    } catch (err) {
      setError("Login failed. " + err.message);
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
      if (tableData && tableData.length > 0) {
        setSelectedSNo(tableData[0]["S.No"]);
      }
    } catch (err) {
      setError("Data fetch failed. " + err.message);
    }
    setLoading(false);
  };

  const selectedRow = data.find(row => String(row["S.No"]) === String(selectedSNo));

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

  return (
    <div className="container">
      {/* When not logged in, show overlay with login form and the logo/title inside the modal */}
      {!loggedIn ? (
        <div className="login-overlay">
          <div className="login-modal">
            <div className="login-header">
              {/* use the newly added public asset logo_log.jpg for login modal */}
              <img src="/logo_log.jpg" alt="Company logo" className="brand-logo" />
              <div>
                {/* company name should come first as requested */}
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
                onChange={e => setEmail(e.target.value)}
                required
              />
              <div className="password-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
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
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 3l18 18" stroke="#e6eef8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M10.58 10.58a3 3 0 0 0 4.24 4.24" stroke="#e6eef8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M9.88 5.88C11.26 5.35 12.61 5 14 5c4 0 7.27 2.55 9 7-1.04 2.36-2.84 4.25-4.94 5.41M4.22 4.22C2.98 6.14 2 8.44 2 12c1.73 4.45 5 7 9 7 1.28 0 2.53-.2 3.67-.6" stroke="#e6eef8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="#e6eef8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="3" stroke="#e6eef8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
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

              {/* stacked layout: plot centered with raw data below */}
              <div className="visual-row visual-stack">
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
                                marker: { color: '#caa6ff' },
                                line: { color: '#caa6ff', width: 3 },
                                marker: { color: '#caa6ff', size: 5 },
                                name: 'Spectra',
                              },
                              // glow layer: wider semi-transparent line without markers
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
                              xaxis: {
                                title: { text: 'Shift (X Axis)', font: { family: 'Poppins, Arial, sans-serif', size: 15, color: '#ffffff' } },
                                tickfont: { family: 'Poppins, Arial, sans-serif', size: 15, color: '#ffffff' },
                                automargin: true,
                                color: '#ffffff',
                                gridcolor: 'rgba(255,255,255,0.06)',
                                zerolinecolor: 'rgba(255,255,255,0.06)'
                              },
                              yaxis: {
                                title: { text: 'Intensity (Y Axis)', font: { family: 'Poppins, Arial, sans-serif', size: 15, color: '#ffffff' } },
                                tickfont: { family: 'Poppins, Arial, sans-serif', size: 15, color: '#ffffff' },
                                automargin: true,
                                color: '#ffffff',
                                gridcolor: 'rgba(255,255,255,0.06)',
                                zerolinecolor: 'rgba(255,255,255,0.06)'
                              },
                              legend: { orientation: 'h', x: 0.5, xanchor: 'center', y: -0.12, font: { color: '#ffffff' } },
                              autosize: true,
                            }}
                            style={{ width: '1200px', maxWidth: '100%', height: '680px' }}
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
                            xaxis: { title: { text: 'Shift', font: { family: 'Poppins, Arial, sans-serif', size: 15, color: '#ffffff' } }, tickfont: { family: 'Poppins, Arial, sans-serif', size: 14, color: '#ffffff' }, automargin: true, color: '#ffffff', gridcolor: 'rgba(255,255,255,0.06)', zerolinecolor: 'rgba(255,255,255,0.06)' },
                            yaxis: { title: { text: 'Intensity', font: { family: 'Poppins, Arial, sans-serif', size: 15, color: '#ffffff' } }, tickfont: { family: 'Poppins, Arial, sans-serif', size: 14, color: '#ffffff' }, automargin: true, color: '#ffffff', gridcolor: 'rgba(255,255,255,0.06)', zerolinecolor: 'rgba(255,255,255,0.06)' },
                            legend: { orientation: 'h', x: 0.5, xanchor: 'center', y: -0.12, font: { color: '#ffffff' } },
                            autosize: true
                          }}
                        style={{ width: '1200px', maxWidth: '100%', height: '680px' }}
                      />
                    </div>
                  )}
                </div>

                <div className="rawdata-area">
                  <div className="rawdata-card expanded">
                    <strong>Raw Data for S.No {selectedSNo}:</strong>
                    <table className="raw-table">
                      <thead>
                        <tr>
                          <th>Column Name (Data Type)</th>
                          <th>Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRow && Object.entries(selectedRow).map(([key, value]) => {
                          let dataType = typeof value;
                          if (Array.isArray(value)) dataType = 'array';
                          else if (value === null) dataType = 'null';
                          else if (!isNaN(Number(value)) && value !== "") dataType = 'float8';
                          else if (typeof value === 'string' && /^[0-9]+$/.test(value)) dataType = 'int8';
                          else dataType = 'text';

                          return (
                            <tr key={key}>
                              <td className="col-name">{key} ({dataType})</td>
                              <td className="col-value">{Array.isArray(value) ? value.join(', ') : String(value)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
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

export default App;