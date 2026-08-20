# Raman Spectroscopy Database Tools

Complete solution for uploading and fetching Raman spectroscopy data to/from your MySQL database.

## 📋 Quick Start

### 1. Install Dependencies
```powershell
pip install -r requirements.txt
```

### 2. Set Your API Key
```powershell
$env:EYENETBIO_API_KEY = "your-secret-key-here"   # PowerShell
export EYENETBIO_API_KEY="your-secret-key-here"   # bash/zsh
```
Never hardcode the key in source files or commit it — it has admin permissions.

### 3. Push Data to Database
```powershell
python push_data.py
```

### 4. Fetch Data from Database
```powershell
python fetch_data.py
```

## 📁 Files Overview

### Main Scripts
- **`push_data.py`** - Upload all samples from CSV to database
- **`fetch_data.py`** - Retrieve samples from database (with full spectral data)

### Data Files
- **`data.csv`** - Source file with 17 Raman spectroscopy samples

### SQL Files
- **`create_database_schema.sql`** - Complete 3-table database schema
- **`fetch_queries_general.sql`** - 12 sections of useful SQL queries  
- **`renumber_to_1_17.sql`** - Optional: renumber samples to sequential IDs

### Configuration
- **`requirements.txt`** - Python dependencies
- **`README.md`** - This file

## 🗃️ Database Structure

**3-Table Architecture:**

### 1. `api_keys` Table
- Authentication and permissions
- Admin/user access levels

### 2. `common_spectra` Table
- Sample metadata (s_no, name, geotag, timestamps)
- Links to api_keys via foreign key

### 3. `spectral_values` Table
- Spectral data arrays (wavelength_x, intensity_y as JSON)
- Data point counts
- Links to common_spectra via s_no foreign key

### View: `v_complete_spectral_data`
- Joins all 3 tables for easy querying
- Returns complete sample data in one query

## 📊 Your Data

**17 Raman Spectroscopy Samples:**
1. Synthetic Spectrum
2. Quartz
3. Calcite
4. Basalt
5. Granite
6. Hematite
7. Olivine
8. Gypsum
9. Kaolinite
10. Dolomite
11. Magnetite
12. Feldspar
13. Muscovite
14. Biotite
15. Chlorite
16. Amphibole
17. Technitium

Each sample includes:
- 1024-point wavelength array (X-axis: 1-1024)
- 1024-point intensity array (Y-axis: float values)
- Geographic coordinates (latitude, longitude)
- Raman shift and intensity metadata
- Geographic coordinates
- Timestamp information

## 🚀 Quick Start

```powershell
# Step 1: Generate SQL
python generate_sql.py

# Step 2: Create table in database (use phpMyAdmin or MySQL client)
# Copy the SQL from above and execute it

# Step 3: Upload data
python final_upload.py
```

## 🔧 API Configuration

- **API Key:** set via the `EYENETBIO_API_KEY` environment variable (admin permissions — keep this secret, never commit it)
- **Upload URL:** `http://www.eyenetbio.com/api_upload.php`
- **Fetch URL:** `http://www.eyenetbio.com/api_fetch.php`
- **Authentication:** POST body (api_key parameter)
- **Security:** Mod_Security enabled (api_key must be in POST body, not URL)

## 💡 Usage Examples

### Upload All Samples
```powershell
python push_data.py
```
**Output:**
- Uploads all 17 samples from data.csv
- Shows progress for each sample
- Reports: 17 successful, 0 failed, 17,408 total data points

### Fetch Samples (Interactive)
```powershell
python fetch_data.py
```
**Features:**
- Lists all samples in database
- Prompts for s_no to fetch
- Displays complete sample info with spectral data
- Option to save to JSON file

### Fetch Specific Sample (Programmatic)
```python
import os
import requests
import json

response = requests.post(
    'http://www.eyenetbio.com/api_fetch.php',
    params={'s_no': 7},  # Olivine
    data={'api_key': os.environ['EYENETBIO_API_KEY']},
    headers={'User-Agent': 'Mozilla/5.0'}
)

sample = response.json()['data'][0]
wavelength = json.loads(sample['wavelength_x'])
intensity = json.loads(sample['intensity_y'])
```

## 🛠️ Database Management

### Create Database Schema
```bash
# Via phpMyAdmin: Copy and execute create_database_schema.sql
# Creates 3 tables + 1 view + foreign keys + indexes
```

### Renumber Samples (Optional)
```bash
# If samples have non-sequential s_no (e.g., 38-54 instead of 1-17)
# Execute renumber_to_1_17.sql via phpMyAdmin
# Safely renumbers to sequential 1-17
```

### Useful Queries
See `fetch_queries_general.sql` for:
- Section 1: List all samples
- Section 2: Fetch by s_no
- Section 3: Fetch by name (partial match)
- Section 4: Data point statistics
- Section 5-12: Advanced queries (date ranges, geotags, etc.)

## ⚠️ Troubleshooting

### Upload Issues
- **All samples fail to parse:** Check CSV column names for trailing spaces
- **HTTP 406 error:** api_key must be in POST body, not URL
- **Database empty after upload:** Check auto-increment hasn't skipped IDs
- **JSON parse error:** Verify wavelength_x and intensity_y are JSON formatted

### Fetch Issues
- **HTTP 500 error:** Check if fetching all samples (may timeout)
- **Empty data:** Fetch specific s_no instead of all samples
- **Missing spectral data:** Use params={'s_no': X} for full data

### CSV Format
```csv
s_no,sample_name,Raman Shift,Raman intensity,wavelength_x ,intensity_y ,geo_tag
1,Sample Name,270,999.0,"[1,2,3,...]","[0.05,0.02,...]",12.34,56.78
```
Note: wavelength_x and intensity_y columns have trailing spaces in header!

## 📊 Data Format

### Wavelength Array (wavelength_x)
- JSON array of integers: `[1, 2, 3, ..., 1024]`
- 1024 points representing X-axis
- Sequential values from 1 to 1024

### Intensity Array (intensity_y)
- JSON array of floats: `[0.051, 0.028, 0.009, ...]`
- 1024 points representing Y-axis
- Intensity values (typically 0.0 to 1.0+ range)

### Geotag Format
- String: `"latitude,longitude"`
- Example: `"47.553129,71.118943"`

## 📝 Notes

- Database currently has samples numbered 1-17 (sequential)
- Each sample = 1024 wavelength + 1024 intensity points
- Total data: 17 samples × 1024 points = 17,408 spectral measurements
- Upload time: ~9 seconds for all 17 samples
- JSON file sizes: ~40-50KB per sample with full spectral data

---

**Last Updated:** March 2, 2026  
**Database:** eyenetdb @ www.eyenetbio.com  
**Status:** ✓ All 17 samples uploaded successfully
