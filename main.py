import os
import json
import warnings
from typing import Optional, List

import numpy as np
import xgboost as xgb
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator

warnings.filterwarnings("ignore")

# ================================================================
# CONFIG — paths
# ================================================================
MODEL_DIR = os.environ.get("MODEL_DIR", os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(MODEL_DIR, "health_risk_model.json")
MAPPING_PATH = os.path.join(MODEL_DIR, "label_mapping.json")
METRICS_PATH = os.path.join(MODEL_DIR, "model_metrics.json")

DISCLAIMER = (
    "This tool is for health awareness / educational purposes only. "
    "Labels were derived from a custom clinical scoring formula, not "
    "real patient outcomes for most records. It is NOT a substitute "
    "for professional medical advice, diagnosis, or treatment. "
    "Always consult a qualified healthcare provider."
)

# ================================================================
# LOAD MODEL + MAPPING AT STARTUP
# ================================================================
if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(
        f"Model file not found at {MODEL_PATH}. "
        f"Set MODEL_DIR env var or place health_risk_model.json next to main.py."
    )
if not os.path.exists(MAPPING_PATH):
    raise FileNotFoundError(
        f"label_mapping.json not found at {MAPPING_PATH}. "
        f"Place it next to main.py or set MODEL_DIR."
    )

with open(MAPPING_PATH, "r") as f:
    MAPPING = json.load(f)

CLASS_ORDER: List[str] = MAPPING["class_order"]
INT_TO_LABEL = {int(k): v for k, v in MAPPING["int_to_label"].items()}
LABEL_TO_INT = MAPPING["label_to_int"]
FEATURE_COLS: List[str] = MAPPING["features"]
POPULATION_MEDIANS = MAPPING["population_medians"]

booster = xgb.Booster()
booster.load_model(MODEL_PATH)

# Try to respect early-stopping cutoff if it was saved on the booster
_best_iteration = None
try:
    attr_val = booster.attr("best_iteration")
    if attr_val is not None:
        _best_iteration = int(attr_val)
except Exception:
    _best_iteration = None

try:
    import shap

    explainer = shap.TreeExplainer(booster)
    SHAP_AVAILABLE = True
except Exception:
    explainer = None
    SHAP_AVAILABLE = False

MODEL_METRICS = None
if os.path.exists(METRICS_PATH):
    with open(METRICS_PATH, "r") as f:
        MODEL_METRICS = json.load(f)

# ================================================================
# CLINICAL OVERRIDES — must match training script exactly
# First matching rule wins (list is ordered most → less severe)
# ================================================================
def get_clinical_overrides(age, bmi, hr, sbp, dbp, spo2, sleep):
    rules = [
        (spo2 < 90, "Critical", "SpO2 critically low (<90%). Seek emergency care immediately."),
        (sbp >= 180, "Critical", "Hypertensive crisis (systolic >=180 mmHg). Seek emergency care immediately."),
        (dbp >= 120, "Critical", "Hypertensive crisis (diastolic >=120 mmHg). Seek emergency care immediately."),
        (hr >= 130, "Critical", "Severe tachycardia (HR >=130 bpm). Seek medical attention immediately."),
        (spo2 < 94 and sbp >= 140, "Critical", "Dangerous combination: hypoxemia + high blood pressure."),
        (bmi >= 40 and sbp >= 140, "Critical", "Dangerous combination: morbid obesity + hypertension."),
        (spo2 < 94, "High", "SpO2 below safe threshold (<94%). Consult a doctor soon."),
        (sbp >= 140, "High", "Stage 2 hypertension detected. Consult a doctor."),
    ]
    warnings_list = []
    forced_label = None
    for condition, label, message in rules:
        if condition:
            warnings_list.append(message)
            if forced_label is None:
                forced_label = label  # first (most severe) match wins
    return forced_label, warnings_list


# ================================================================
# FEATURE ENGINEERING — must match training script exactly
# ================================================================
def engineer_features(age, bmi, hr, sbp, dbp, spo2, sleep, has_cvd) -> np.ndarray:
    pulse_pressure = sbp - dbp
    bmi_age = bmi * age / 100
    cardio_stress = sbp * hr / 1000
    map_val = (sbp + 2 * dbp) / 3
    spo2_age = spo2 * (1 - age / 200)

    if sbp < 120:
        hypertension_stage = 0
    elif sbp < 130:
        hypertension_stage = 1
    elif sbp < 140:
        hypertension_stage = 2
    elif sbp < 180:
        hypertension_stage = 3
    else:
        hypertension_stage = 4

    if bmi < 18.5:
        obesity_stage = 0
    elif bmi < 25:
        obesity_stage = 1
    elif bmi < 30:
        obesity_stage = 2
    elif bmi < 35:
        obesity_stage = 3
    else:
        obesity_stage = 4

    sleep_risk = float(sleep < 7) + float(sleep < 6) + float(sleep < 5)
    spo2_risk = (
        float(spo2 < 96) + float(spo2 < 94) + float(spo2 < 92) + float(spo2 < 90) * 2
    )

    row = {
        "age": age,
        "bmi": bmi,
        "heart_rate": hr,
        "systolic_bp": sbp,
        "diastolic_bp": dbp,
        "spo2": spo2,
        "sleep_hours": sleep,
        "pulse_pressure": pulse_pressure,
        "bmi_age": bmi_age,
        "cardio_stress": cardio_stress,
        "map": map_val,
        "spo2_age": spo2_age,
        "hypertension_stage": hypertension_stage,
        "obesity_stage": obesity_stage,
        "sleep_risk": sleep_risk,
        "spo2_risk": spo2_risk,
        "has_cvd": float(has_cvd),
    }

    # Build the array strictly in the order FEATURE_COLS expects
    return np.array([[row[col] for col in FEATURE_COLS]], dtype=np.float32)


# ================================================================
# REQUEST / RESPONSE SCHEMAS
# ================================================================
class PatientInput(BaseModel):
    age: float = Field(..., ge=18, le=90, description="Age in years. Model trained on 18-90.")
    bmi: float = Field(..., ge=10, le=60, description="Body Mass Index.")
    systolic_bp: float = Field(..., ge=70, le=250, description="Systolic blood pressure (mmHg).")
    diastolic_bp: float = Field(..., ge=40, le=150, description="Diastolic blood pressure (mmHg).")

    heart_rate: Optional[float] = Field(
        None, ge=40, le=140, description="Resting heart rate (bpm). Omit to use population median."
    )
    spo2: Optional[float] = Field(
        None, ge=85, le=100, description="Blood oxygen saturation (%). Omit to use population median."
    )
    sleep_hours: Optional[float] = Field(
        None, ge=3, le=12, description="Average nightly sleep hours. Omit to use population median."
    )
    has_cvd: bool = Field(
        False, description="Has the patient been clinically diagnosed with cardiovascular disease?"
    )

    @model_validator(mode="after")
    def check_bp_consistency(self):
        if self.systolic_bp <= self.diastolic_bp:
            raise ValueError("systolic_bp must be greater than diastolic_bp")
        return self


class PatientOutput(BaseModel):
    risk_level: str
    model_prediction: str
    override_applied: bool
    confidence_percent: float
    probabilities: dict
    top_factors: Optional[List[str]] = None
    warnings: List[str]
    fields_filled_with_median: List[str]
    disclaimer: str


# ================================================================
# APP
# ================================================================
app = FastAPI(
    title="Health Risk Prediction API",
    description="Educational health-risk classifier. NOT a medical device. " + DISCLAIMER,
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "service": "Health Risk Prediction API",
        "status": "ok",
        "docs": "/docs",
        "disclaimer": DISCLAIMER,
    }


@app.get("/health")
def health_check():
    return {"status": "ok", "model_loaded": True, "shap_available": SHAP_AVAILABLE}


@app.get("/model-info")
def model_info():
    return {
        "features": FEATURE_COLS,
        "classes": CLASS_ORDER,
        "population_medians": POPULATION_MEDIANS,
        "metrics": MODEL_METRICS,
    }


@app.post("/predict", response_model=PatientOutput)
def predict(patient: PatientInput, explain: bool = Query(True, description="Compute SHAP top factors")):
    # ---- fill missing optional fields with population medians ----
    filled = []
    hr = patient.heart_rate
    if hr is None:
        hr = POPULATION_MEDIANS["heart_rate"]
        filled.append("heart_rate")

    spo2 = patient.spo2
    if spo2 is None:
        spo2 = POPULATION_MEDIANS["spo2"]
        filled.append("spo2")

    sleep = patient.sleep_hours
    if sleep is None:
        sleep = POPULATION_MEDIANS["sleep_hours"]
        filled.append("sleep_hours")

    age, bmi, sbp, dbp = patient.age, patient.bmi, patient.systolic_bp, patient.diastolic_bp
    has_cvd = patient.has_cvd

    # ---- clinical overrides (checked BEFORE the model, same as training) ----
    forced_label, override_warnings = get_clinical_overrides(age, bmi, hr, sbp, dbp, spo2, sleep)

    # ---- feature engineering (must mirror training exactly) ----
    features = engineer_features(age, bmi, hr, sbp, dbp, spo2, sleep, has_cvd)

    # ---- model prediction via raw Booster ----
    dmat = xgb.DMatrix(features, feature_names=FEATURE_COLS)
    if _best_iteration is not None:
        proba = booster.predict(dmat, iteration_range=(0, _best_iteration + 1))[0]
    else:
        proba = booster.predict(dmat)[0]

    model_pred_int = int(np.argmax(proba))
    model_label = INT_TO_LABEL[model_pred_int]
    final_label = forced_label if forced_label else model_label

    prob_dict = {c: round(float(p) * 100, 1) for c, p in zip(CLASS_ORDER, proba)}
    confidence = round(float(np.max(proba)) * 100, 1)

    # ---- SHAP top-3 factors (best-effort, never fails the request) ----
    top_factors = None
    if explain and SHAP_AVAILABLE:
        try:
            sv = explainer.shap_values(features)
            class_idx = LABEL_TO_INT[final_label]
            if isinstance(sv, np.ndarray) and sv.ndim == 3:
                sv_row = sv[0, :, class_idx]
            elif isinstance(sv, list):
                sv_row = sv[class_idx][0]
            else:
                sv_row = sv[0]
            abs_vals = np.abs(sv_row)
            top_idx = np.argsort(abs_vals)[::-1][:3]
            top_factors = [FEATURE_COLS[i] for i in top_idx]
        except Exception:
            top_factors = None

    return PatientOutput(
        risk_level=final_label,
        model_prediction=model_label,
        override_applied=bool(forced_label),
        confidence_percent=confidence,
        probabilities=prob_dict,
        top_factors=top_factors,
        warnings=override_warnings,
        fields_filled_with_median=filled,
        disclaimer=DISCLAIMER,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
