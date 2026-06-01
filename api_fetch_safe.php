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
    // Fetch one specific sample - try the view first, then fallback to JOIN
    $sql = "SELECT * FROM v_complete_spectral_data WHERE s_no = $sample_id";
    $result = $conn->query($sql);
    
    // If view doesn't exist, try direct JOIN
    if (!$result) {
        $sql = "SELECT 
            cs.s_no,
            cs.sample_name,
            cs.geotag,
            cs.uploaded_by,
            cs.created_at,
            sv.wavelength_x,
            sv.intensity_y
        FROM common_spectra cs
        LEFT JOIN spectral_values sv ON cs.s_no = sv.s_no
        WHERE cs.s_no = $sample_id";
        $result = $conn->query($sql);
    }
} else {
    // Fetch all samples - try the view first, then fallback to JOIN
    $sql = "SELECT * FROM v_complete_spectral_data ORDER BY s_no ASC";
    $result = $conn->query($sql);
    
    // If view doesn't exist, try direct JOIN
    if (!$result) {
        $sql = "SELECT 
            cs.s_no,
            cs.sample_name,
            cs.geotag,
            cs.uploaded_by,
            cs.created_at,
            sv.wavelength_x,
            sv.intensity_y
        FROM common_spectra cs
        LEFT JOIN spectral_values sv ON cs.s_no = sv.s_no
        ORDER BY cs.s_no ASC";
        $result = $conn->query($sql);
    }
}

// Check if query succeeded
if (!$result) {
    die(json_encode([
        "status" => "error", 
        "message" => "Database query failed: " . $conn->error
    ]));
}

$output = [];

while ($row = $result->fetch_assoc()) {
    // Convert JSON strings back to arrays
    if (isset($row['wavelength_x']) && is_string($row['wavelength_x'])) {
        $row['wavelength_x'] = json_decode($row['wavelength_x']);
    }
    if (isset($row['intensity_y']) && is_string($row['intensity_y'])) {
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
