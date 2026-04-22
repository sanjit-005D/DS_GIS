-- ============================================================================
-- COMPREHENSIVE DATA FETCHING QUERIES
-- For Raman Spectroscopy Database
-- Run these queries in phpMyAdmin or MySQL client
-- ============================================================================

-- ============================================================================
-- SECTION 1: FETCH BY ROW (Single or Multiple Samples)
-- ============================================================================

-- Query 1.1: Fetch single sample by s_no (e.g., s_no = 3)
SELECT * FROM v_complete_spectral_data WHERE s_no = 3;

-- Query 1.2: Fetch multiple samples by s_no list
SELECT * FROM v_complete_spectral_data WHERE s_no IN (1, 3, 5, 7);

-- Query 1.3: Fetch range of samples
SELECT * FROM v_complete_spectral_data WHERE s_no BETWEEN 1 AND 5;

-- Query 1.4: Fetch all samples
SELECT * FROM v_complete_spectral_data;

-- Query 1.5: Fetch first N samples (e.g., first 10)
SELECT * FROM v_complete_spectral_data ORDER BY s_no LIMIT 10;

-- Query 1.6: Fetch with pagination (page 2, 5 records per page)
SELECT * FROM v_complete_spectral_data 
ORDER BY s_no 
LIMIT 5 OFFSET 5;  -- Change OFFSET to (page_number - 1) * records_per_page

-- ============================================================================

-- ============================================================================
-- SECTION 2: FETCH BY COLUMN (Specific Fields Only)
-- ============================================================================

-- Query 2.1: Fetch only metadata (no spectral data)
SELECT s_no, sample_name, geotag, uploaded_by, created_at 
FROM v_complete_spectral_data;

-- Query 2.2: Fetch only sample names
SELECT s_no, sample_name FROM v_complete_spectral_data;

-- Query 2.3: Fetch only spectral data (no metadata)
SELECT s_no, wavelength_x, intensity_y, data_points_count 
FROM v_complete_spectral_data;

-- Query 2.4: Fetch specific columns for specific sample
SELECT sample_name, geotag, data_points_count 
FROM v_complete_spectral_data 
WHERE s_no = 3;

-- Query 2.5: Fetch only geotagged samples
SELECT s_no, sample_name, geotag 
FROM v_complete_spectral_data 
WHERE geotag IS NOT NULL AND geotag != '';

-- ============================================================================
-- SECTION 3: FETCH BY FILTER CRITERIA
-- ============================================================================

-- Query 3.1: Fetch by sample name (exact match)
SELECT * FROM v_complete_spectral_data WHERE sample_name = 'Calcite';

-- Query 3.2: Fetch by sample name (partial match - contains)
SELECT * FROM v_complete_spectral_data WHERE sample_name LIKE '%Quartz%';

-- Query 3.3: Fetch by sample name (starts with)
SELECT * FROM v_complete_spectral_data WHERE sample_name LIKE 'Syn%';

-- Query 3.4: Fetch by uploader
SELECT * FROM v_complete_spectral_data WHERE uploaded_by = 'admin';

-- Query 3.5: Fetch by date range
SELECT * FROM v_complete_spectral_data 
WHERE created_at BETWEEN '2026-02-01' AND '2026-02-28';

-- Query 3.6: Fetch samples uploaded today
SELECT * FROM v_complete_spectral_data WHERE DATE(created_at) = CURDATE();

-- Query 3.7: Fetch samples with specific data point count
SELECT * FROM v_complete_spectral_data WHERE data_points_count = 1024;

-- Query 3.8: Fetch samples with data points greater than threshold
SELECT * FROM v_complete_spectral_data WHERE data_points_count > 500;

-- Query 3.9: Fetch by geotag location (contains specific coordinates)
SELECT * FROM v_complete_spectral_data WHERE geotag LIKE '%5.443057%';

-- Query 3.10: Fetch multiple filters combined (AND)
SELECT * FROM v_complete_spectral_data 
WHERE uploaded_by = 'admin' 
  AND data_points_count >= 1000 
  AND DATE(created_at) = CURDATE();

-- Query 3.11: Fetch multiple filters (OR)
SELECT * FROM v_complete_spectral_data 
WHERE sample_name LIKE '%Quartz%' 
   OR sample_name LIKE '%Calcite%';

-- ============================================================================
-- SECTION 4: FETCH WITH SORTING
-- ============================================================================

-- Query 4.1: Fetch all, sorted by s_no ascending
SELECT * FROM v_complete_spectral_data ORDER BY s_no ASC;

-- Query 4.2: Fetch all, sorted by s_no descending (newest first)
SELECT * FROM v_complete_spectral_data ORDER BY s_no DESC;

-- Query 4.3: Fetch sorted by sample name alphabetically
SELECT * FROM v_complete_spectral_data ORDER BY sample_name ASC;

-- Query 4.4: Fetch sorted by upload date (newest first)
SELECT * FROM v_complete_spectral_data ORDER BY created_at DESC;

-- Query 4.5: Fetch sorted by data points count (largest first)
SELECT * FROM v_complete_spectral_data ORDER BY data_points_count DESC;

-- Query 4.6: Fetch with multiple sort criteria
SELECT * FROM v_complete_spectral_data 
ORDER BY uploaded_by ASC, created_at DESC;
-- ============================================================================
-- SECTION 5: FETCH STATISTICS AND AGGREGATIONS
-- ============================================================================

-- Query 5.1: Count total samples
SELECT COUNT(*) AS total_samples FROM common_spectra;

-- Query 5.2: Count samples by uploader
SELECT uploaded_by, COUNT(*) AS sample_count 
FROM common_spectra 
GROUP BY uploaded_by;

-- Query 5.3: Total data points across all samples
SELECT SUM(data_points_count) AS total_data_points FROM spectral_values;

-- Query 5.4: Average data points per sample
SELECT AVG(data_points_count) AS avg_data_points FROM spectral_values;

-- Query 5.5: Min and Max data points
SELECT 
    MIN(data_points_count) AS min_points,
    MAX(data_points_count) AS max_points
FROM spectral_values;

-- Query 5.6: Samples uploaded per day
SELECT 
    DATE(created_at) AS upload_date,
    COUNT(*) AS samples_count
FROM common_spectra
GROUP BY DATE(created_at)
ORDER BY upload_date DESC;

-- Query 5.7: Get sample statistics
SELECT 
    COUNT(*) AS total_samples,
    COUNT(DISTINCT uploaded_by) AS unique_uploaders,
    MIN(created_at) AS first_upload,
    MAX(created_at) AS last_upload
FROM common_spectra;

-- ============================================================================
-- SECTION 6: FETCH FROM INDIVIDUAL TABLES (Detailed)
-- ============================================================================

-- Query 6.1: Fetch from common_spectra only (metadata)
SELECT 
    cs.s_no,
    cs.sample_name,
    cs.geotag,
    cs.uploaded_by,
    cs.created_at,
    cs.updated_at,
    ak.user_name AS api_user,
    ak.api_key
FROM 
    common_spectra cs
    LEFT JOIN api_keys ak ON cs.api_key_id = ak.key_id
WHERE 
    cs.s_no = 3;

-- Query 6.1: Fetch from common_spectra only (metadata)
SELECT 
    cs.s_no,
    cs.sample_name,
    cs.geotag,
    cs.uploaded_by,
    cs.created_at,
    cs.updated_at,
    ak.user_name AS api_user,
    ak.api_key
FROM 
    common_spectra cs
    LEFT JOIN api_keys ak ON cs.api_key_id = ak.key_id
WHERE 
    cs.s_no = 3;  -- Change or remove WHERE for all samples

-- Query 6.2: Fetch from spectral_values only (spectral data)
SELECT 
    point_id,
    s_no,
    wavelength_x,
    intensity_y,
    data_points_count,
    created_at
FROM 
    spectral_values
WHERE 
    s_no = 3;  -- Change or remove WHERE for all samples

-- Query 6.3: Fetch all from common_spectra
SELECT * FROM common_spectra;

-- Query 6.4: Fetch all from spectral_values
SELECT * FROM spectral_values;

-- Query 6.5: Fetch API keys information
SELECT key_id, user_name, user_email, permissions, is_active, created_at 
FROM api_keys;

-- ============================================================================
-- SECTION 7: FETCH WITH JSON OPERATIONS
-- ============================================================================

-- Query 7.1: Get formatted JSON data (pretty print)
SELECT 
    s_no,
    sample_name,
    JSON_PRETTY(wavelength_x) AS wavelength_x_formatted,
    JSON_PRETTY(intensity_y) AS intensity_y_formatted
FROM 
    v_complete_spectral_data
WHERE 
    s_no = 3;

-- Query 7.2: Get specific array elements (first 5 data points)
SELECT 
    s_no,
    sample_name,
    JSON_EXTRACT(wavelength_x, '$[0]') AS wavelength_1,
    JSON_EXTRACT(intensity_y, '$[0]') AS intensity_1,
    JSON_EXTRACT(wavelength_x, '$[1]') AS wavelength_2,
    JSON_EXTRACT(intensity_y, '$[1]') AS intensity_2,
    JSON_EXTRACT(wavelength_x, '$[2]') AS wavelength_3,
    JSON_EXTRACT(intensity_y, '$[2]') AS intensity_3,
    JSON_EXTRACT(wavelength_x, '$[3]') AS wavelength_4,
    JSON_EXTRACT(intensity_y, '$[3]') AS intensity_4,
    JSON_EXTRACT(wavelength_x, '$[4]') AS wavelength_5,
    JSON_EXTRACT(intensity_y, '$[4]') AS intensity_5
FROM 
    v_complete_spectral_data
WHERE 
    s_no = 3;

-- Query 7.3: Get array length (number of data points)
SELECT 
    s_no,
    sample_name,
    JSON_LENGTH(wavelength_x) AS wavelength_count,
    JSON_LENGTH(intensity_y) AS intensity_count
FROM 
    v_complete_spectral_data;

-- Query 7.4: Export as single JSON object
SELECT JSON_OBJECT(
    's_no', s_no,
    'sample_name', sample_name,
    'geotag', geotag,
    'uploaded_by', uploaded_by,
    'created_at', created_at,
    'wavelength_x', wavelength_x,
    'intensity_y', intensity_y,
    'data_points_count', data_points_count
) AS json_data
FROM v_complete_spectral_data
WHERE s_no = 3;

-- Query 7.5: Export multiple samples as JSON array
SELECT JSON_ARRAYAGG(
    JSON_OBJECT(
        's_no', s_no,
        'sample_name', sample_name,
        'geotag', geotag,
        'data_points_count', data_points_count
    )
) AS samples_json
FROM v_complete_spectral_data;

-- ============================================================================
-- SECTION 8: FETCH WITH JOINS (Custom combinations)
-- ============================================================================

-- Query 8.1: Fetch with full JOIN details
SELECT 
    cs.s_no,
    cs.sample_name,
    cs.geotag,
    cs.uploaded_by,
    cs.created_at AS sample_created,
    sv.wavelength_x,
    sv.intensity_y,
    sv.data_points_count,
    sv.created_at AS spectral_created,
    ak.user_name AS api_user,
    ak.permissions AS api_permissions
FROM 
    common_spectra cs
    LEFT JOIN spectral_values sv ON cs.s_no = sv.s_no
    LEFT JOIN api_keys ak ON cs.api_key_id = ak.key_id
WHERE 
    cs.s_no = 3;

-- Query 8.2: Fetch samples with their API key info
SELECT 
    cs.s_no,
    cs.sample_name,
    ak.api_key,
    ak.user_name,
    ak.permissions,
    cs.created_at
FROM 
    common_spectra cs
    INNER JOIN api_keys ak ON cs.api_key_id = ak.key_id;

-- Query 8.3: Fetch only samples that have spectral data
SELECT 
    cs.s_no,
    cs.sample_name,
    sv.data_points_count
FROM 
    common_spectra cs
    INNER JOIN spectral_values sv ON cs.s_no = sv.s_no;

-- Query 8.4: Fetch samples without spectral data (if any)
SELECT 
    cs.s_no,
    cs.sample_name,
    cs.created_at
FROM 
    common_spectra cs
    LEFT JOIN spectral_values sv ON cs.s_no = sv.s_no
WHERE 
    sv.s_no IS NULL;

-- ============================================================================
-- SECTION 9: SEARCH AND PATTERN MATCHING
-- ============================================================================

-- Query 9.1: Search sample name (case-insensitive)
SELECT * FROM v_complete_spectral_data 
WHERE LOWER(sample_name) LIKE LOWER('%calcite%');

-- Query 9.2: Search in multiple fields
SELECT * FROM v_complete_spectral_data 
WHERE sample_name LIKE '%Quartz%' 
   OR uploaded_by LIKE '%admin%' 
   OR geotag LIKE '%12.97%';

-- Query 9.3: Find samples with NULL or empty geotag
SELECT s_no, sample_name, geotag 
FROM v_complete_spectral_data 
WHERE geotag IS NULL OR geotag = '';

-- Query 9.4: Find samples with specific name patterns
SELECT * FROM v_complete_spectral_data 
WHERE sample_name REGEXP '^[A-Z].*ite$';  -- Starts with capital, ends with 'ite'

-- ============================================================================
-- SECTION 10: EXPORT-READY FORMATS
-- ============================================================================

-- Query 10.1: CSV-ready format (basic info)
SELECT 
    s_no AS 'Serial Number',
    sample_name AS 'Sample Name',
    geotag AS 'Location',
    uploaded_by AS 'Uploaded By',
    data_points_count AS 'Data Points',
    DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS 'Upload Date'
FROM 
    v_complete_spectral_data;

-- Query 10.2: Export specific sample with formatted dates
SELECT 
    s_no AS 'S.No',
    sample_name AS 'Sample Name',
    geotag AS 'Geo Tag',
    uploaded_by AS 'Uploaded By',
    data_points_count AS 'Total Data Points',
    DATE_FORMAT(created_at, '%d-%b-%Y %H:%i') AS 'Upload Date'
FROM 
    v_complete_spectral_data
WHERE 
    s_no = 3;

-- Query 10.3: Summary report format
SELECT 
    s_no,
    sample_name,
    CONCAT(data_points_count, ' points') AS data_info,
    uploaded_by AS uploader,
    DATE(created_at) AS upload_date,
    CASE 
        WHEN data_points_count >= 1000 THEN 'High Resolution'
        WHEN data_points_count >= 500 THEN 'Medium Resolution'
        ELSE 'Low Resolution'
    END AS resolution_category
FROM 
    v_complete_spectral_data;

-- ============================================================================
-- SECTION 11: ADVANCED QUERIES
-- ============================================================================

-- Query 11.1: Get samples with above-average data points
SELECT * FROM v_complete_spectral_data 
WHERE data_points_count > (
    SELECT AVG(data_points_count) FROM spectral_values
);

-- Query 11.2: Get latest uploaded sample
SELECT * FROM v_complete_spectral_data 
ORDER BY created_at DESC 
LIMIT 1;

-- Query 11.3: Get oldest uploaded sample
SELECT * FROM v_complete_spectral_data 
ORDER BY created_at ASC 
LIMIT 1;

-- Query 11.4: Get samples uploaded in last 7 days
SELECT * FROM v_complete_spectral_data 
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY);

-- Query 11.5: Rank samples by data points count
SELECT 
    s_no,
    sample_name,
    data_points_count,
    RANK() OVER (ORDER BY data_points_count DESC) AS data_rank
FROM 
    v_complete_spectral_data;

-- Query 11.6: Get samples with duplicate names (quality check)
SELECT 
    sample_name,
    COUNT(*) AS count
FROM 
    common_spectra
GROUP BY 
    sample_name
HAVING 
    COUNT(*) > 1;

-- Query 11.7: Fetch with conditional logic
SELECT 
    s_no,
    sample_name,
    data_points_count,
    CASE 
        WHEN data_points_count = 1024 THEN 'Standard'
        WHEN data_points_count > 1024 THEN 'Extended'
        ELSE 'Reduced'
    END AS data_type,
    CASE 
        WHEN geotag IS NOT NULL AND geotag != '' THEN 'Geotagged'
        ELSE 'Not Geotagged'
    END AS location_status
FROM 
    v_complete_spectral_data;

-- ============================================================================
-- SECTION 12: CUSTOM QUERY TEMPLATES
-- ============================================================================

-- Template 1: Fetch by custom s_no list
-- Replace (?,?,?) with your s_no values
SELECT * FROM v_complete_spectral_data WHERE s_no IN (?,?,?);

-- Template 2: Fetch by date range
-- Replace dates with your range
SELECT * FROM v_complete_spectral_data 
WHERE created_at BETWEEN '?' AND '?';

-- Template 3: Fetch with multiple filters
-- Customize the WHERE conditions
SELECT * FROM v_complete_spectral_data 
WHERE sample_name LIKE '?%' 
  AND uploaded_by = '?' 
  AND data_points_count >= ?;

-- Template 4: Fetch with pagination
-- Replace ? with (page_number - 1) * page_size and page_size
SELECT * FROM v_complete_spectral_data 
ORDER BY s_no 
LIMIT ? OFFSET ?;

-- ============================================================================
-- NOTES AND USAGE INSTRUCTIONS
-- ============================================================================
/*
HOW TO USE THESE QUERIES:

1. SINGLE SAMPLE:
   - Use queries in Section 1 with WHERE s_no = [your_number]
   
2. MULTIPLE SAMPLES:
   - Use queries with WHERE s_no IN (1,2,3,...)
   
3. ALL SAMPLES:
   - Remove WHERE clause or use SELECT * FROM v_complete_spectral_data
   
4. FILTERED DATA:
   - Use queries in Section 3 and modify WHERE conditions
   
5. STATISTICS:
   - Use queries in Section 5 for counts, averages, etc.
   
6. EXPORT:
   - Run query in phpMyAdmin
   - Click "Export" button
   - Choose format (CSV, JSON, Excel, XML, etc.)
   
7. PERFORMANCE:
   - For large datasets, use LIMIT clause
   - Add appropriate WHERE filters
   - Use indexes (already created in schema)

COMMON MODIFICATIONS:
- Change s_no = 3 to any sample number
- Change LIMIT 10 to desired number of records
- Change sample_name to search for different samples
- Combine multiple WHERE conditions with AND/OR
- Add ORDER BY for custom sorting

EXPORTING FROM PHPMYADMIN:
1. Select your database
2. Go to SQL tab
3. Paste desired query
4. Click "Go"
5. Click "Export" below results
6. Select format and download
*/
