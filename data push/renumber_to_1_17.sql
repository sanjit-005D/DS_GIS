-- =====================================================================
-- RENUMBER SAMPLES FROM s_no 38-54 TO 1-17
-- =====================================================================
-- Current State: 17 samples with s_no 38-54 (auto-increment)
-- Desired State: 17 samples with s_no 1-17 (matching CSV order)
-- 
-- MAPPING:
-- 38 (Synthetic Spectrum) → 1
-- 39 (Quartz) → 2
-- 40 (Calcite) → 3
-- 41 (Basalt) → 4
-- 42 (Granite) → 5
-- 43 (Hematite) → 6
-- 44 (Olivine) → 7
-- 45 (Gypsum) → 8
-- 46 (Kaolinite) → 9
-- 47 (Dolomite) → 10
-- 48 (Magnetite) → 11
-- 49 (Feldspar) → 12
-- 50 (Muscovite) → 13
-- 51 (Biotite) → 14
-- 52 (Chlorite) → 15
-- 53 (Amphibole) → 16
-- 54 (Technitium) → 17
-- =====================================================================

USE eyenetdb;

-- Show current state BEFORE renumbering
SELECT 'BEFORE RENUMBERING:' AS status;
SELECT s_no, sample_name, created_at 
FROM common_spectra 
WHERE s_no >= 38 AND s_no <= 54 
ORDER BY s_no;

-- STEP 1: Temporarily disable foreign key checks
SET FOREIGN_KEY_CHECKS = 0;

-- STEP 2: Create backup of original s_no values (optional but recommended)
ALTER TABLE common_spectra ADD COLUMN IF NOT EXISTS old_s_no INT;
UPDATE common_spectra SET old_s_no = s_no WHERE s_no >= 38 AND s_no <= 54;

-- STEP 3: Delete any existing entries with s_no 1-17 (if they exist)
DELETE FROM spectral_values WHERE s_no >= 1 AND s_no <= 17;
DELETE FROM common_spectra WHERE s_no >= 1 AND s_no <= 17;

-- STEP 4: Two-phase renumbering to avoid conflicts
-- Phase 1: Add 1000 to current s_no to move them out of the way
UPDATE spectral_values SET s_no = s_no + 1000 WHERE s_no >= 38 AND s_no <= 54;
UPDATE common_spectra SET s_no = s_no + 1000 WHERE s_no >= 38 AND s_no <= 54;

-- Phase 2: Renumber from 1038-1054 to 1-17
UPDATE spectral_values SET s_no = 1 WHERE s_no = 1038;   -- Synthetic Spectrum
UPDATE spectral_values SET s_no = 2 WHERE s_no = 1039;   -- Quartz
UPDATE spectral_values SET s_no = 3 WHERE s_no = 1040;   -- Calcite
UPDATE spectral_values SET s_no = 4 WHERE s_no = 1041;   -- Basalt
UPDATE spectral_values SET s_no = 5 WHERE s_no = 1042;   -- Granite
UPDATE spectral_values SET s_no = 6 WHERE s_no = 1043;   -- Hematite
UPDATE spectral_values SET s_no = 7 WHERE s_no = 1044;   -- Olivine
UPDATE spectral_values SET s_no = 8 WHERE s_no = 1045;   -- Gypsum
UPDATE spectral_values SET s_no = 9 WHERE s_no = 1046;   -- Kaolinite
UPDATE spectral_values SET s_no = 10 WHERE s_no = 1047;  -- Dolomite
UPDATE spectral_values SET s_no = 11 WHERE s_no = 1048;  -- Magnetite
UPDATE spectral_values SET s_no = 12 WHERE s_no = 1049;  -- Feldspar
UPDATE spectral_values SET s_no = 13 WHERE s_no = 1050;  -- Muscovite
UPDATE spectral_values SET s_no = 14 WHERE s_no = 1051;  -- Biotite
UPDATE spectral_values SET s_no = 15 WHERE s_no = 1052;  -- Chlorite
UPDATE spectral_values SET s_no = 16 WHERE s_no = 1053;  -- Amphibole
UPDATE spectral_values SET s_no = 17 WHERE s_no = 1054;  -- Technitium

UPDATE common_spectra SET s_no = 1 WHERE s_no = 1038;   -- Synthetic Spectrum
UPDATE common_spectra SET s_no = 2 WHERE s_no = 1039;   -- Quartz
UPDATE common_spectra SET s_no = 3 WHERE s_no = 1040;   -- Calcite
UPDATE common_spectra SET s_no = 4 WHERE s_no = 1041;   -- Basalt
UPDATE common_spectra SET s_no = 5 WHERE s_no = 1042;   -- Granite
UPDATE common_spectra SET s_no = 6 WHERE s_no = 1043;   -- Hematite
UPDATE common_spectra SET s_no = 7 WHERE s_no = 1044;   -- Olivine
UPDATE common_spectra SET s_no = 8 WHERE s_no = 1045;   -- Gypsum
UPDATE common_spectra SET s_no = 9 WHERE s_no = 1046;   -- Kaolinite
UPDATE common_spectra SET s_no = 10 WHERE s_no = 1047;  -- Dolomite
UPDATE common_spectra SET s_no = 11 WHERE s_no = 1048;  -- Magnetite
UPDATE common_spectra SET s_no = 12 WHERE s_no = 1049;  -- Feldspar
UPDATE common_spectra SET s_no = 13 WHERE s_no = 1050;  -- Muscovite
UPDATE common_spectra SET s_no = 14 WHERE s_no = 1051;  -- Biotite
UPDATE common_spectra SET s_no = 15 WHERE s_no = 1052;  -- Chlorite
UPDATE common_spectra SET s_no = 16 WHERE s_no = 1053;  -- Amphibole
UPDATE common_spectra SET s_no = 17 WHERE s_no = 1054;  -- Technitium

-- STEP 5: Reset auto-increment to 18 for next insert
ALTER TABLE common_spectra AUTO_INCREMENT = 18;

-- STEP 6: Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

-- Show final state AFTER renumbering
SELECT 'AFTER RENUMBERING:' AS status;
SELECT s_no, sample_name, created_at 
FROM common_spectra 
WHERE s_no >= 1 AND s_no <= 17 
ORDER BY s_no;

-- Verify data integrity
SELECT 
    'Data Integrity Check' AS status,
    COUNT(DISTINCT cs.s_no) AS samples_in_common_spectra,
    COUNT(DISTINCT sv.s_no) AS samples_in_spectral_values,
    SUM(sv.data_points_count) AS total_data_points
FROM common_spectra cs
LEFT JOIN spectral_values sv ON cs.s_no = sv.s_no
WHERE cs.s_no >= 1 AND cs.s_no <= 17;

-- =====================================================================
-- ROLLBACK INSTRUCTIONS (if needed):
-- =====================================================================
-- To restore original state if something goes wrong:
-- SET FOREIGN_KEY_CHECKS = 0;
-- UPDATE common_spectra SET s_no = old_s_no WHERE old_s_no IS NOT NULL;
-- UPDATE spectral_values sv 
--   JOIN common_spectra cs ON sv.s_no = cs.s_no 
--   SET sv.s_no = cs.old_s_no WHERE cs.old_s_no IS NOT NULL;
-- ALTER TABLE common_spectra DROP COLUMN old_s_no;
-- SET FOREIGN_KEY_CHECKS = 1;
-- =====================================================================
