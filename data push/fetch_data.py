"""
Fetch Sample from Database
Fetches a single sample with complete spectral data by s_no or sample name
"""

import requests
import json
from datetime import datetime

# API Configuration
API_URL = "http://www.eyenetbio.com/api_fetch.php"
MY_API_KEY = "***REMOVED-LEAKED-API-KEY***"

custom_headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}

def fetch_all_samples_list():
    """Get list of all samples with s_no and names"""
    try:
        response = requests.post(
            API_URL,
            data={'api_key': MY_API_KEY},
            headers=custom_headers,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get('status') == 'success' and result.get('data'):
                return result['data']
    except Exception as e:
        print(f"Error fetching sample list: {e}")
    return []

def fetch_sample_by_sno(s_no):
    """Fetch a specific sample by s_no"""
    print(f"\n{'='*70}")
    print(f"FETCHING SAMPLE s_no={s_no}")
    print(f"{'='*70}")
    
    try:
        response = requests.post(
            API_URL,
            params={'s_no': s_no},
            data={'api_key': MY_API_KEY},
            headers=custom_headers,
            timeout=30
        )
        
        print(f"\nHTTP Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            
            if result.get('status') == 'success' and result.get('data'):
                sample = result['data'][0]
                
                # Display sample information
                print(f"\n{'─'*70}")
                print(f"SAMPLE INFORMATION")
                print(f"{'─'*70}")
                print(f"S.No:              {sample.get('s_no')}")
                print(f"Sample Name:       {sample.get('sample_name')}")
                print(f"Geotag:            {sample.get('geotag')}")
                print(f"Data Points:       {sample.get('data_points_count')}")
                print(f"Created At:        {sample.get('created_at')}")
                print(f"{'─'*70}")
                
                # Parse spectral data
                try:
                    def safe_parse_json(val):
                        if isinstance(val, (list, dict)):
                            return val
                        if isinstance(val, str):
                            try:
                                return json.loads(val)
                            except:
                                return []
                        return []

                    wavelength_x = safe_parse_json(sample.get('wavelength_x', '[]'))
                    intensity_y = safe_parse_json(sample.get('intensity_y', '[]'))
                    
                    print(f"\nSPECTRAL DATA:")
                    print(f"  Wavelength array length: {len(wavelength_x)}")
                    print(f"  Intensity array length:  {len(intensity_y)}")
                    
                    if len(wavelength_x) > 0 and len(intensity_y) > 0:
                        print(f"\n  Wavelength range: {wavelength_x[0]} - {wavelength_x[-1]}")
                        print(f"  Intensity range:  {min(intensity_y):.6f} - {max(intensity_y):.6f}")
                        print(f"\n  First 5 data points:")
                        for i in range(min(5, len(wavelength_x))):
                            print(f"    [{i+1}] λ={wavelength_x[i]}, I={intensity_y[i]:.6f}")
                    
                    # Save to file
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    sample_name_safe = sample.get('sample_name', 'unknown').replace(' ', '_')
                    filename = f"{sample_name_safe}_s{s_no}_{timestamp}.json"
                    
                    with open(filename, 'w', encoding='utf-8') as f:
                        json.dump(sample, f, indent=2, ensure_ascii=False)
                    
                    print(f"\n{'─'*70}")
                    print(f"✓ Data saved to: {filename}")
                    print(f"{'─'*70}")
                    
                    return sample
                    
                except json.JSONDecodeError as e:
                    print(f"\n⚠ Warning: Could not parse spectral arrays - {e}")
                    return sample
            else:
                print(f"\n❌ No data found for s_no={s_no}")
                print(f"Response: {result}")
                return None
        else:
            print(f"❌ HTTP Error {response.status_code}")
            print(f"Response: {response.text[:200]}")
            return None
            
    except Exception as e:
        print(f"\n❌ Error fetching sample: {e}")
        return None

def main():
    print(f"\n{'='*70}")
    print(f"RAMAN SPECTROSCOPY DATABASE - SAMPLE FETCHER")
    print(f"{'='*70}")
    
    # First, show all available samples
    print("\nFetching available samples...")
    samples = fetch_all_samples_list()
    
    if samples:
        print(f"\n{'─'*70}")
        print(f"AVAILABLE SAMPLES IN DATABASE:")
        print(f"{'─'*70}")
        print(f"{'S.No':<8} {'Sample Name':<30} {'Data Points':<12} {'Created'}")
        print(f"{'─'*70}")
        for sample in sorted(samples, key=lambda x: x.get('s_no', 0)):
            print(f"{sample.get('s_no', 'N/A'):<8} {sample.get('sample_name', 'N/A'):<30} "
                  f"{sample.get('data_points_count', 'N/A'):<12} {sample.get('created_at', 'N/A')}")
        print(f"{'─'*70}")
        print(f"Total samples: {len(samples)}")
    else:
        print("\n⚠ No samples found in database")
        return
    
    # Prompt user for which sample to fetch
    print("\nEnter s_no to fetch (or press Enter to fetch first sample):")
    user_input = input("> ").strip()
    
    if user_input:
        try:
            s_no = int(user_input)
        except ValueError:
            print(f"❌ Invalid s_no: {user_input}")
            return
    else:
        # Fetch first sample if no input
        s_no = samples[0].get('s_no') if samples else None
        if s_no is None:
            print("❌ No sample to fetch")
            return
        print(f"Fetching first sample (s_no={s_no})...")
    
    # Fetch the sample
    result = fetch_sample_by_sno(s_no)
    
    if result:
        print(f"\n{'='*70}")
        print(f"✓ FETCH COMPLETED SUCCESSFULLY")
        print(f"{'='*70}")
    else:
        print(f"\n{'='*70}")
        print(f"❌ FETCH FAILED")
        print(f"{'='*70}")

if __name__ == "__main__":
    main()
