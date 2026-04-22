# CRITICAL PHP FIX REQUIRED

## Problem
The `api_fetch.php` on your server is only returning spectral data (wavelength_x, intensity_y) when fetching a SINGLE sample. When fetching ALL samples (for averaged spectrum and map markers), it only returns metadata.

## Current PHP Code (Line 29):
```php
// Fetch the 50 most recent samples (Metadata only for speed)
$sql = "SELECT s_no, sample_name, geotag, uploaded_by, created_at FROM common_spectra ORDER BY created_at DESC LIMIT 50";
```

## Fix Required:
Replace line 29 with:
```php
// Fetch all samples with spectral data from the view
$sql = "SELECT * FROM v_complete_spectral_data ORDER BY s_no ASC";
```

## Why This Fix:
- You only have 17 samples, so performance is not an issue
- The map needs spectral data to display sample markers
- The averaged spectrum needs spectral data to plot graphs
- Without this fix, you'll see "No averaged spectrum" and no markers

## Complete Updated PHP Code:
```php
<?php
header("Content-Type: application/json");
include 'db_connect.php'; 

// 1. Authenticate via API Key
$api_key = $_REQUEST['api_key'] ?? '';

if (empty($api_key)) {
    die(json_encode(["status" => "error", "message" => "API Key required"]));
}

// Validate key against the 'api_keys' table
$auth_query = "SELECT key_id FROM api_keys WHERE api_key = '$api_key' AND is_active = TRUE";
$auth_res = $conn->query($auth_query);

if ($auth_res->num_rows == 0) {
    die(json_encode(["status" => "error", "message" => "Unauthorized"]));
}

// 2. Determine what to fetch
$sample_id = isset($_GET['s_no']) ? (int)$_GET['s_no'] : null;

if ($sample_id) {
    // Fetch one specific sample with all spectral points
    $sql = "SELECT * FROM v_complete_spectral_data WHERE s_no = $sample_id";
} else {
    // Fetch all samples with spectral data (changed from metadata-only query)
    $sql = "SELECT * FROM v_complete_spectral_data ORDER BY s_no ASC";
}

$result = $conn->query($sql);
$output = [];

while ($row = $result->fetch_assoc()) {
    // Convert JSON strings back to arrays
    if (isset($row['wavelength_x'])) {
        $row['wavelength_x'] = json_decode($row['wavelength_x']);
        $row['intensity_y'] = json_decode($row['intensity_y']);
    }
    $output[] = $row;
}

echo json_encode([
    "status" => "success",
    "count" => count($output),
    "data" => $output
]);

$conn->close();
?>
```

## After Applying the Fix:
1. Upload the updated api_fetch.php to your server
2. Reload your webpage
3. You should see:
   - Sample markers on the map
   - Averaged spectrum plot at the bottom
   - All 17 samples with their wavelength/intensity data
