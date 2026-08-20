import os
import pandas as pd
import requests
import json
import ast
from datetime import datetime

# API Configuration
API_URL = 'http://www.eyenetbio.com/api_upload.php'
MY_API_KEY = os.environ['EYENETBIO_API_KEY']

# Custom headers to avoid bot detection
custom_headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9'
}

# Read the CSV file
csv_file = 'data.csv'
df = pd.read_csv(csv_file)

print("=" * 80)
print("UPLOADING ALL SAMPLES TO DATABASE")
print("=" * 80)
print(f"Total samples to upload: {len(df)}")
print(f"API Endpoint: {API_URL}")
print(f"Start Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("=" * 80)

# Statistics
success_count = 0
fail_count = 0
total_data_points = 0

# Upload each sample
for index, row in df.iterrows():
    csv_row_number = index + 1  # CSV row number (1-based)
    
    sample_name = str(row['sample_name'])
    geotag = str(row['geo_tag'])
    
    # Parse wavelength and intensity arrays (note: column names have trailing spaces)
    try:
        wavelength_x = json.loads(row['wavelength_x '])
        intensity_y = json.loads(row['intensity_y '])
    except Exception as e:
        print(f"❌ Row {csv_row_number}: Failed to parse arrays for {sample_name} - {e}")
        fail_count += 1
        continue
    
    # Prepare payload with form-encoded data
    payload = {
        "api_key": MY_API_KEY,
        "sample_name": sample_name,
        "geotag": geotag,
        "wavelength_x": json.dumps(wavelength_x),  # Convert list to JSON string
        "intensity_y": json.dumps(intensity_y)     # Convert list to JSON string
    }
    
    print(f"\n[{csv_row_number}/17] Uploading: {sample_name}")
    print(f"    Geotag: {geotag}")
    print(f"    Data points: {len(wavelength_x)}")
    
    try:
        # Send POST request with form-encoded data
        response = requests.post(API_URL, data=payload, headers=custom_headers, timeout=30)
        
        if response.status_code == 200:
            result = response.json()
            
            if result.get('status') == 'success':
                print(f"    ✓ Success - Response: {result.get('message', 'OK')}")
                success_count += 1
                total_data_points += len(wavelength_x)
            else:
                print(f"    ❌ Failed - {result.get('message', 'Unknown error')}")
                fail_count += 1
        else:
            print(f"    ❌ HTTP Error {response.status_code}")
            print(f"    Response: {response.text[:200]}")
            fail_count += 1
    
    except requests.exceptions.Timeout:
        print(f"    ❌ Request timeout")
        fail_count += 1
    except Exception as e:
        print(f"    ❌ Error: {str(e)}")
        fail_count += 1

# Final Summary
print("\n" + "=" * 80)
print("UPLOAD SUMMARY")
print("=" * 80)
print(f"Total Samples: {len(df)}")
print(f"✓ Successful: {success_count}")
print(f"❌ Failed: {fail_count}")
print(f"Total Data Points Uploaded: {total_data_points:,}")
print(f"End Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("=" * 80)

if success_count == len(df):
    print("\n🎉 ALL SAMPLES UPLOADED SUCCESSFULLY!")
    print("\nExpected Database Order (s_no 1-17):")
    for idx, row in df.iterrows():
        print(f"  {idx + 1}. {row['sample_name']}")
elif success_count > 0:
    print(f"\n⚠️ Partial success: {success_count}/{len(df)} samples uploaded")
else:
    print("\n❌ Upload failed - No samples were uploaded")

print("\nNext steps:")
print("1. Run check_sample_count.py to verify uploads")
print("2. Fetch samples to confirm correct s_no numbering")
