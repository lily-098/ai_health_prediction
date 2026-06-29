import pytest
from fastapi.testclient import TestClient
from main import app, get_clinical_overrides, engineer_features, FEATURE_COLS, POPULATION_MEDIANS

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["model_loaded"] is True
    assert data["shap_available"] is True

def test_model_info_endpoint():
    response = client.get("/model-info")
    assert response.status_code == 200
    data = response.json()
    assert "features" in data
    assert "classes" in data
    assert "population_medians" in data
    assert data["population_medians"] == POPULATION_MEDIANS

def test_clinical_overrides():
    # SpO2 < 90 override -> Critical
    label, warnings = get_clinical_overrides(age=35, bmi=22, hr=72, sbp=115, dbp=75, spo2=89, sleep=8)
    assert label == "Critical"
    assert any("SpO2 critically low" in w for w in warnings)

    # SBP >= 180 override -> Critical
    label, warnings = get_clinical_overrides(age=35, bmi=22, hr=72, sbp=180, dbp=75, spo2=98, sleep=8)
    assert label == "Critical"
    assert any("Hypertensive crisis" in w for w in warnings)

    # DBP >= 120 override -> Critical
    label, warnings = get_clinical_overrides(age=35, bmi=22, hr=72, sbp=120, dbp=120, spo2=98, sleep=8)
    assert label == "Critical"
    assert any("Hypertensive crisis" in w for w in warnings)

    # HR >= 130 override -> Critical
    label, warnings = get_clinical_overrides(age=35, bmi=22, hr=130, sbp=120, dbp=80, spo2=98, sleep=8)
    assert label == "Critical"
    assert any("Severe tachycardia" in w for w in warnings)

    # No override -> None
    label, warnings = get_clinical_overrides(age=35, bmi=22, hr=72, sbp=115, dbp=75, spo2=98, sleep=8)
    assert label is None
    assert len(warnings) == 0

def test_feature_engineering():
    features = engineer_features(age=40, bmi=25, hr=80, sbp=120, dbp=80, spo2=98, sleep=7, has_cvd=False)
    assert features.shape == (1, len(FEATURE_COLS))
    # Pulse pressure: sbp - dbp = 120 - 80 = 40
    # MAP: (sbp + 2*dbp)/3 = (120 + 160)/3 = 93.3333
    pulse_pressure_idx = FEATURE_COLS.index("pulse_pressure")
    map_idx = FEATURE_COLS.index("map")
    assert features[0, pulse_pressure_idx] == 40.0
    assert abs(features[0, map_idx] - 93.3333) < 1e-3

def test_predict_normal():
    payload = {
        "age": 35.0,
        "bmi": 22.0,
        "systolic_bp": 115.0,
        "diastolic_bp": 75.0,
        "heart_rate": 72.0,
        "spo2": 98.0,
        "sleep_hours": 8.0,
        "has_cvd": False
    }
    response = client.post("/predict", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "risk_level" in data
    assert data["override_applied"] is False

def test_predict_override():
    payload = {
        "age": 35.0,
        "bmi": 22.0,
        "systolic_bp": 115.0,
        "diastolic_bp": 75.0,
        "heart_rate": 72.0,
        "spo2": 89.0,  # Below 90 -> Forced "Critical"
        "sleep_hours": 8.0,
        "has_cvd": False
    }
    response = client.post("/predict", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["risk_level"] == "Critical"
    assert data["override_applied"] is True
    assert len(data["warnings"]) > 0

def test_predict_missing_optionals():
    payload = {
        "age": 40.0,
        "bmi": 24.0,
        "systolic_bp": 120.0,
        "diastolic_bp": 80.0,
        "has_cvd": False
    }
    response = client.post("/predict", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert set(data["fields_filled_with_median"]) == {"heart_rate", "spo2", "sleep_hours"}

def test_predict_invalid_bp():
    payload = {
        "age": 35.0,
        "bmi": 22.0,
        "systolic_bp": 80.0,
        "diastolic_bp": 120.0,  # Invalid: diastolic >= systolic
        "has_cvd": False
    }
    response = client.post("/predict", json=payload)
    assert response.status_code == 422
    data = response.json()
    assert "systolic_bp must be greater than diastolic_bp" in data["detail"][0]["msg"]
