import urllib.request
import json
import sys

BASE_URL = "http://127.0.0.1:8000"

def make_post_request(path, data):
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(url, method="POST")
    req.add_header("Content-Type", "application/json")
    
    jsondata = json.dumps(data).encode("utf-8")
    try:
        with urllib.request.urlopen(req, data=jsondata) as response:
            status = response.status
            body = json.loads(response.read().decode("utf-8"))
            return status, body
    except urllib.error.HTTPError as e:
        try:
            err_body = json.loads(e.read().decode("utf-8"))
        except Exception:
            err_body = e.reason
        return e.code, err_body
    except Exception as e:
        return 500, str(e)

# Test Cases
test_cases = [
    {
        "name": "Test 1: Normal Patient",
        "payload": {
            "age": 35.0,
            "bmi": 22.0,
            "systolic_bp": 115.0,
            "diastolic_bp": 75.0,
            "heart_rate": 72.0,
            "spo2": 98.0,
            "sleep_hours": 8.0,
            "has_cvd": False
        }
    },
    {
        "name": "Test 2: Patient with SpO2=89 (Clinical Override)",
        "payload": {
            "age": 35.0,
            "bmi": 22.0,
            "systolic_bp": 115.0,
            "diastolic_bp": 75.0,
            "heart_rate": 72.0,
            "spo2": 89.0,  # Below 90 -> Forced "Critical"
            "sleep_hours": 8.0,
            "has_cvd": False
        }
    },
    {
        "name": "Test 3: Missing Optional Fields (Median Fallback)",
        "payload": {
            "age": 40.0,
            "bmi": 24.0,
            "systolic_bp": 120.0,
            "diastolic_bp": 80.0,
            "has_cvd": False
            # heart_rate, spo2, sleep_hours omitted
        }
    },
    {
        "name": "Test 4: Invalid Input (diastolic_bp >= systolic_bp)",
        "payload": {
            "age": 35.0,
            "bmi": 22.0,
            "systolic_bp": 80.0,
            "diastolic_bp": 120.0,  # Invalid: diastolic >= systolic
            "heart_rate": 72.0,
            "spo2": 98.0,
            "sleep_hours": 8.0,
            "has_cvd": False
        }
    }
]

print("=== Running Health Risk Prediction API Tests ===")
for case in test_cases:
    print(f"\nRunning: {case['name']}")
    status, body = make_post_request("/predict", case["payload"])
    print(f"Status Code: {status}")
    print(json.dumps(body, indent=2))
