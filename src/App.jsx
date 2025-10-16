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
      <h1>Spectroscopic Data Viewer</h1>
      {!loggedIn ? (
        <form onSubmit={handleLogin} className="login-form">
          <h2>Login</h2>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <button type="submit" disabled={loading}>Login</button>
          {error && <p className="error">{error}</p>}
        </form>
      ) : (
        <div>
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
              >
                {data.map(row => (
                  <option key={row["S.No"]} value={String(row["S.No"])}>{String(row["S.No"])}</option>
                ))}
              </select>
              {selectedRow ? (
                <div className="curve-container">
                  <h3>Sample: {selectedRow["Sample name"]}</h3>

                  {(() => {
                    // Only plot Shift x axis and Intensity y axis
                    let x = toNumArray(selectedRow["Shift x axis"]);
                    let y = toNumArray(selectedRow["Intensity y axis"]);

                    const hasData = x.length > 0 && y.length > 0;

                    return (
                      <>
                        <Plot
                          data={[{
                            x: hasData ? x : [0],
                            y: hasData ? y : [0],
                            type: 'scatter',
                            mode: 'lines+markers',
                            marker: { color: 'blue' },
                            name: 'Spectra',
                          }]}
                          layout={{
                            title: 'Spectroscopic Curve',
                            xaxis: { title: 'Shift (X Axis)' },
                            yaxis: { title: 'Intensity (Y Axis)' },
                            autosize: true,
                          }}
                          style={{ width: '100%', height: '400px' }}
                        />
                        <div style={{
                          marginTop: '1em',
                          background: '#f8f8f8',
                          padding: '1em',
                          borderRadius: '6px'
                        }}>
                          <strong>Raw Data for S.No {selectedSNo}:</strong>
                          <table style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            marginTop: '0.5em'
                          }}>
                            <thead>
                              <tr style={{ background: '#e0e0e0' }}>
                                <th style={{ border: '1px solid #ccc', padding: '6px' }}>Column Name (Data Type)</th>
                                <th style={{ border: '1px solid #ccc', padding: '6px' }}>Value</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(selectedRow).map(([key, value]) => {
                                let dataType = typeof value;
                                if (Array.isArray(value)) dataType = 'array';
                                else if (value === null) dataType = 'null';
                                else if (!isNaN(Number(value)) && value !== "") dataType = 'float8';
                                else if (typeof value === 'string' && /^[0-9]+$/.test(value)) dataType = 'int8';
                                else dataType = 'text';

                                return (
                                  <tr key={key}>
                                    <td style={{ border: '1px solid #ccc', padding: '4px', fontWeight: 'bold' }}>
                                      {key} ({dataType})
                                    </td>
                                    <td style={{ border: '1px solid #ccc', padding: '4px' }}>
                                      {Array.isArray(value) ? value.join(', ') : String(value)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div className="curve-container">
                  <Plot
                    data={[{
                      x: [0],
                      y: [0],
                      type: 'scatter',
                      mode: 'lines+markers',
                      marker: { color: 'blue' },
                      name: 'Spectra',
                    }]}
                    layout={{
                      title: 'Spectroscopic Curve',
                      xaxis: { title: 'Shift' },
                      yaxis: { title: 'Intensity' },
                      autosize: true,
                    }}
                    style={{ width: '100%', height: '400px' }}
                  />
                  <p>No data found for this S.No.</p>
                </div>
              )}
            </>
          ) : (
            <p>No data found in the table.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default App;