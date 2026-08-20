-- ============================================================================
-- RAMAN SPECTROSCOPY DATABASE SCHEMA
-- Three interconnected tables for storing spectral data with API access
-- ============================================================================

-- Table 1: API Keys Storage
-- This table stores API keys for authentication and access control
CREATE TABLE IF NOT EXISTS `api_keys` (
    `key_id` INT AUTO_INCREMENT PRIMARY KEY,
    `api_key` VARCHAR(255) UNIQUE NOT NULL,
    `user_name` VARCHAR(255) NOT NULL,
    `user_email` VARCHAR(255),
    `permissions` ENUM('read_only', 'read_write', 'admin') DEFAULT 'read_only',
    `is_active` BOOLEAN DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `last_used_at` TIMESTAMP NULL,
    `expires_at` TIMESTAMP NULL,
    INDEX idx_api_key (`api_key`),
    INDEX idx_active (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Stores API keys for authentication and access control';

-- Table 2: Common Spectra (Main Table)
-- Stores primary sample information and metadata
CREATE TABLE IF NOT EXISTS `common_spectra` (
    `s_no` INT AUTO_INCREMENT PRIMARY KEY,
    `sample_name` VARCHAR(255) NOT NULL,
    `geotag` VARCHAR(100) COMMENT 'Format: latitude,longitude',
    `uploaded_by` VARCHAR(255) NOT NULL,
    `api_key_id` INT NOT NULL COMMENT 'References the API key used for upload',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Foreign key to api_keys table
    CONSTRAINT fk_common_spectra_api_key 
        FOREIGN KEY (`api_key_id`) 
        REFERENCES `api_keys` (`key_id`)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    
    INDEX idx_sample_name (`sample_name`),
    INDEX idx_uploaded_by (`uploaded_by`),
    INDEX idx_created_at (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Main table storing sample metadata and geolocation';

-- Table 3: Spectral Values (Detail Table)
-- Stores wavelength and intensity data points for each sample
CREATE TABLE IF NOT EXISTS `spectral_values` (
    `point_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `s_no` INT NOT NULL COMMENT 'Foreign key to common_spectra table',
    `wavelength_x` JSON NOT NULL COMMENT 'Array of wavelength values (Raman shift)',
    `intensity_y` JSON NOT NULL COMMENT 'Array of intensity values (Raman intensity)',
    `data_points_count` INT GENERATED ALWAYS AS (JSON_LENGTH(wavelength_x)) STORED,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key to common_spectra table
    CONSTRAINT fk_spectral_values_sample 
        FOREIGN KEY (`s_no`) 
        REFERENCES `common_spectra` (`s_no`)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    
    INDEX idx_s_no (`s_no`),
    INDEX idx_data_points (`data_points_count`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Stores spectral data (wavelength and intensity arrays) for each sample';

-- ============================================================================
-- INSERT SAMPLE API KEY
-- ============================================================================

INSERT INTO `api_keys` 
    (`api_key`, `user_name`, `user_email`, `permissions`, `is_active`) 
VALUES 
    ('REPLACE_WITH_A_NEWLY_GENERATED_SECRET', 'admin', 'admin@example.com', 'admin', TRUE);

-- ============================================================================
-- USEFUL QUERIES AND VIEWS
-- ============================================================================

-- View: Complete Spectral Data
-- Combines data from all three tables for easy querying
CREATE OR REPLACE VIEW `v_complete_spectral_data` AS
SELECT 
    cs.s_no,
    cs.sample_name,
    cs.geotag,
    cs.uploaded_by,
    cs.created_at,
    sv.wavelength_x,
    sv.intensity_y,
    sv.data_points_count,
    ak.user_name AS api_user,
    ak.api_key
FROM 
    common_spectra cs
    LEFT JOIN spectral_values sv ON cs.s_no = sv.s_no
    LEFT JOIN api_keys ak ON cs.api_key_id = ak.key_id;

-- ============================================================================
-- SAMPLE QUERIES FOR FETCHING DATA
-- ============================================================================

-- Query 1: Fetch all samples with their spectral data
-- SELECT * FROM v_complete_spectral_data;

-- Query 2: Fetch specific sample by s_no
-- SELECT * FROM v_complete_spectral_data WHERE s_no = 1;

-- Query 3: Fetch samples by name
-- SELECT * FROM v_complete_spectral_data WHERE sample_name LIKE '%Quartz%';

-- Query 4: Fetch samples uploaded by specific user
-- SELECT * FROM common_spectra WHERE uploaded_by = 'admin';

-- Query 5: Get spectral data for specific sample
-- SELECT 
--     cs.s_no, 
--     cs.sample_name,
--     sv.wavelength_x,
--     sv.intensity_y,
--     sv.data_points_count
-- FROM common_spectra cs
-- JOIN spectral_values sv ON cs.s_no = sv.s_no
-- WHERE cs.s_no = 1;

-- ============================================================================
-- SAMPLE INSERT STATEMENTS
-- ============================================================================

-- Example 1: Insert into common_spectra
-- INSERT INTO common_spectra (sample_name, geotag, uploaded_by, api_key_id)
-- VALUES ('Synthetic Spectrum', '5.443057,-130.012258', 'admin', 1);

-- Example 2: Insert wavelength and intensity arrays
-- INSERT INTO spectral_values (s_no, wavelength_x, intensity_y)
-- VALUES (
--     1,  -- s_no from common_spectra
--     JSON_ARRAY(1, 2, 3, 4, 5, 6, 7, 8, 9, 10),
--     JSON_ARRAY(0.051, 0.028, 0.009, 0.013, 0.017, 0.015, 0.040, 0.003, 0.010, 0.032)
-- );

-- ============================================================================
-- API ACCESS CONTROL QUERIES
-- ============================================================================

-- Validate API key and check permissions
-- SELECT key_id, user_name, permissions, is_active 
-- FROM api_keys 
-- WHERE api_key = '<your_api_key>' AND is_active = TRUE;

-- Update last_used_at timestamp when API is used
-- UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE api_key = '<your_api_key>';

-- ============================================================================
-- STATISTICS QUERIES
-- ============================================================================

-- Query: Count total samples
-- SELECT COUNT(*) as total_samples FROM common_spectra;

-- Query: Count total data points across all samples
-- SELECT SUM(data_points_count) as total_data_points FROM spectral_values;

-- Query: Average data points per sample
-- SELECT AVG(data_points_count) as avg_data_points FROM spectral_values;

-- Query: Samples grouped by uploader
-- SELECT uploaded_by, COUNT(*) as sample_count 
-- FROM common_spectra 
-- GROUP BY uploaded_by;

-- ============================================================================
-- DATABASE RELATIONSHIPS SUMMARY
-- ============================================================================
/*
api_keys (key_id)
    └── common_spectra (api_key_id) [1:N relationship]
            └── spectral_values (s_no) [1:1 or 1:N relationship]

FLOW:
1. User authenticates with API key from 'api_keys' table
2. If valid, user can INSERT into 'common_spectra' (gets s_no)
3. Using that s_no, user inserts wavelength/intensity arrays into 'spectral_values'
4. All data is linked: API key → Sample → Spectral data
*/

-- ============================================================================
-- NOTES
-- ============================================================================
/*
- JSON columns used for wavelength_x and intensity_y to store arrays efficiently
- CASCADE delete: Deleting a sample also deletes its spectral data
- RESTRICT on api_keys: Cannot delete API key if samples exist using it
- All tables use InnoDB for transaction support and foreign key constraints
- UTF8MB4 charset for international character support
- Timestamps track when data was created/modified
- Indexes on frequently queried columns for performance
*/
