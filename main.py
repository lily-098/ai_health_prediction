import os
import json
import warnings
import datetime
from typing import Optional, List

import numpy as np
import xgboost as xgb
import jwt
import google.generativeai as genai
from fastapi import FastAPI, HTTPException, Query, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator

from database import SessionLocal, init_db, User, PatientReport, DoctorLog, verify_password

warnings.filterwarnings("ignore")

# Load environment variables from local .env file if it exists
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if os.path.exists(env_path):
    with open(env_path, "r") as f:
        for line in f:
            if line.strip() and not line.startswith("#"):
                parts = line.strip().split("=", 1)
                if len(parts) == 2:
                    os.environ[parts[0].strip()] = parts[1].strip()

SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "aegis_super_secret_key_123")
ALGORITHM = "HS256"

def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    try:
        if authorization.startswith("Bearer "):
            token = authorization.split(" ")[1]
        else:
            token = authorization
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token credentials")
        return username
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")


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

# SHAP is loaded lazily on first explain request to speed up server startup
explainer = None
SHAP_AVAILABLE = False
_shap_init_done = False

def _ensure_shap():
    global explainer, SHAP_AVAILABLE, _shap_init_done
    if _shap_init_done:
        return
    _shap_init_done = True
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
import math

def calculate_framingham_risk(
    age: float,
    bmi: float,
    systolic_bp: float,
    bp_treated: bool,
    is_smoker: bool,
    is_diabetic: bool,
    sex: str
) -> float:
    # Framingham BMI-based model (D'Agostino et al., 2008)
    age = max(30.0, min(74.0, age))
    bmi = max(15.0, min(50.0, bmi))
    systolic_bp = max(90.0, min(200.0, systolic_bp))
    is_male = (sex.lower() == "male")
    
    if is_male:
        b_age = 3.06117
        b_bmi = 1.79588
        b_sbp = 2.15515 if bp_treated else 1.99881
        b_smoker = 0.56471
        b_diabetes = 0.57367
        mean_risk = 23.9802
        baseline_survival = 0.88936
    else:
        b_age = 2.72107
        b_bmi = 0.51125
        b_sbp = 2.88267 if bp_treated else 2.81299
        b_smoker = 0.61868
        b_diabetes = 0.77763
        mean_risk = 26.1931
        baseline_survival = 0.95012
        
    sum_beta = (
        b_age * math.log(age) +
        b_bmi * math.log(bmi) +
        b_sbp * math.log(systolic_bp) +
        (b_smoker if is_smoker else 0.0) +
        (b_diabetes if is_diabetic else 0.0)
    )
    
    risk_score = 1.0 - math.pow(baseline_survival, math.exp(sum_beta - mean_risk))
    return round(risk_score * 100, 1)

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
    sex: str = Field("female", description="Biological sex: male or female.")
    is_smoker: bool = Field(False, description="Is the patient a smoker?")
    is_diabetic: bool = Field(False, description="Does the patient have diabetes?")
    bp_treated: bool = Field(False, description="Is the patient on hypertension treatment?")

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
    top_factors: Optional[List[dict]] = None
    warnings: List[str]
    fields_filled_with_median: List[str]
    disclaimer: str
    framingham_risk_percent: float
    framingham_risk_category: str


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
    if explain:
        _ensure_shap()
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
            top_factors = [{"feature": FEATURE_COLS[i], "value": round(float(sv_row[i]), 4)} for i in top_idx]
        except Exception:
            top_factors = None

    # Calculate Framingham score
    f_risk = calculate_framingham_risk(
        age=patient.age,
        bmi=patient.bmi,
        systolic_bp=patient.systolic_bp,
        bp_treated=patient.bp_treated,
        is_smoker=patient.is_smoker,
        is_diabetic=patient.is_diabetic,
        sex=patient.sex
    )
    
    if f_risk < 10.0:
        f_cat = "low"
    elif f_risk <= 20.0:
        f_cat = "intermediate"
    else:
        f_cat = "high"

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
        framingham_risk_percent=f_risk,
        framingham_risk_category=f_cat,
    )


# ================================================================
# DATABASE & PORTAL EXTENSION ENDPOINTS
# ================================================================

class ShareReportRequest(BaseModel):
    age: float
    bmi: float
    systolic_bp: float
    diastolic_bp: float
    heart_rate: Optional[float] = None
    spo2: Optional[float] = None
    sleep_hours: Optional[float] = None
    has_cvd: bool
    risk_level: str
    model_prediction: str
    confidence_percent: float
    probabilities: dict
    top_factors: Optional[List[dict]] = None
    warnings: List[str]
    chat_history: Optional[List[dict]] = None

class ChatRequest(BaseModel):
    message: str
    vitals: Optional[dict] = None

class LoginRequest(BaseModel):
    username: str
    password: str


@app.on_event("startup")
def on_startup():
    init_db()


@app.post("/share-report")
def share_report(report_data: ShareReportRequest):
    db = SessionLocal()
    try:
        report = PatientReport(
            age=report_data.age,
            bmi=report_data.bmi,
            systolic_bp=report_data.systolic_bp,
            diastolic_bp=report_data.diastolic_bp,
            heart_rate=report_data.heart_rate,
            spo2=report_data.spo2,
            sleep_hours=report_data.sleep_hours,
            has_cvd=report_data.has_cvd,
            risk_level=report_data.risk_level,
            model_prediction=report_data.model_prediction,
            confidence_percent=report_data.confidence_percent,
            probabilities=json.dumps(report_data.probabilities),
            top_factors=json.dumps(report_data.top_factors) if report_data.top_factors else None,
            warnings=json.dumps(report_data.warnings),
            chat_history=json.dumps(report_data.chat_history) if report_data.chat_history else None
        )
        db.add(report)
        
        tele_log = DoctorLog(
            event_type="TELEHEALTH",
            message=f"New report shared by patient. Risk Level: {report_data.risk_level}"
        )
        db.add(tele_log)
        db.commit()
        return {"status": "success", "message": "Report shared with doctor database successfully."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        db.close()


@app.post("/ai-chat")
def ai_chat(chat_data: ChatRequest):
    gemini_key = os.environ.get("GEMINI_API_KEY")
    
    # Prompt context engineering
    system_prompt = (
        "You are AegisBot, an AI clinical screening doctor assistant. "
        "A user is chatting with you. You must provide helpful, empathetic, "
        "and accurate medical educational advice. You are NOT diagnosing them "
        "definitively, but you can interpret symptoms and discuss possible causes based on general guidelines. "
        "Always include a professional medical disclaimer to see a qualified doctor if symptoms are severe. "
    )
    
    if chat_data.vitals:
        vitals_str = ", ".join([f"{k}: {v}" for k, v in chat_data.vitals.items() if v is not None])
        system_prompt += f"\nThe patient has active vitals entered: [{vitals_str}]."
        
    system_prompt += f"\nUser Query: {chat_data.message}\n"
    
    if gemini_key:
        try:
            genai.configure(api_key=gemini_key)
            model = genai.GenerativeModel("gemini-1.5-flash")
            response = model.generate_content(system_prompt)
            return {"reply": response.text, "ai_mode": True}
        except Exception as e:
            print(f"Gemini API Error: {e}")
            return {
                "reply": "Excuse me, I encountered a temporary connection issue. However, based on your request, please monitor your vitals closely and consult a primary care physician.",
                "ai_mode": False
            }
    else:
        # Fallback to local rule-based matching if no Gemini key is provided
        text = chat_data.message.lower()
        if "interpret" in text or "vital" in text or "current" in text:
            reply = "Please run the intake assessment using the left panel. Based on the rules, we check thresholds like SpO2 < 90% or BP >= 180/120 for critical warnings."
        elif "how to use" in text or "guide" in text:
            reply = "To use the dashboard, input vitals in the left form, click 'Evaluate Patient Risk Profile', and inspect the risk report on the diagnostics tab."
        else:
            reply = "Hi! (Note: AI mode is disabled because GEMINI_API_KEY is not set). As a basic assistant, I recommend checking your physiological risk drivers using the intake panel or consulting a doctor if you feel unwell."
        return {"reply": reply, "ai_mode": False}


@app.post("/doctor/login")
def login(credentials: LoginRequest):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == credentials.username).first()
        if not user or not verify_password(credentials.password, user.hashed_password):
            auth_log = DoctorLog(
                event_type="AUTH",
                message=f"Failed login attempt for username: {credentials.username}"
            )
            db.add(auth_log)
            db.commit()
            raise HTTPException(status_code=400, detail="Incorrect username or password")
            
        auth_log = DoctorLog(
            event_type="AUTH",
            message=f"User {credentials.username} logged in successfully",
            username=credentials.username
        )
        db.add(auth_log)
        db.commit()
        
        expire = datetime.datetime.utcnow() + datetime.timedelta(hours=2)
        payload = {"sub": user.username, "exp": expire}
        token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
        
        return {"access_token": token, "token_type": "bearer"}
    finally:
        db.close()


@app.get("/doctor/reports")
def get_doctor_reports(username: str = Depends(get_current_user)):
    db = SessionLocal()
    try:
        reports = db.query(PatientReport).order_by(PatientReport.shared_at.desc()).all()
        parsed_reports = []
        for r in reports:
            parsed_reports.append({
                "id": r.id,
                "age": r.age,
                "bmi": r.bmi,
                "systolic_bp": r.systolic_bp,
                "diastolic_bp": r.diastolic_bp,
                "heart_rate": r.heart_rate,
                "spo2": r.spo2,
                "sleep_hours": r.sleep_hours,
                "has_cvd": r.has_cvd,
                "risk_level": r.risk_level,
                "model_prediction": r.model_prediction,
                "confidence_percent": r.confidence_percent,
                "probabilities": json.loads(r.probabilities),
                "top_factors": json.loads(r.top_factors) if r.top_factors else None,
                "warnings": json.loads(r.warnings),
                "chat_history": json.loads(r.chat_history) if r.chat_history else [],
                "shared_at": r.shared_at.isoformat()
            })
        return parsed_reports
    finally:
        db.close()


@app.get("/doctor/logs")
def get_doctor_logs(username: str = Depends(get_current_user)):
    db = SessionLocal()
    try:
        logs = db.query(DoctorLog).order_by(DoctorLog.timestamp.desc()).limit(100).all()
        parsed_logs = []
        for l in logs:
            parsed_logs.append({
                "id": l.id,
                "timestamp": l.timestamp.isoformat(),
                "event_type": l.event_type,
                "message": l.message,
                "username": l.username
            })
        return parsed_logs
    finally:
        db.close()

class SummaryRequest(BaseModel):
    chat_history: List[dict]
    vitals: dict

@app.post("/ai-summary")
def generate_consultation_summary(req: SummaryRequest):
    api_key = os.environ.get("GEMINI_API_KEY")
    vitals_text = ", ".join([f"{k}: {v}" for k, v in req.vitals.items()])
    chat_text = "\n".join([f"{msg.get('sender')}: {msg.get('text')}" for msg in req.chat_history])
    
    system_prompt = (
        "You are an expert clinical medical scribe. Your task is to analyze the patient's vitals "
        "and their text conversation with AegisBot to compile a professional, highly structured "
        "Clinical Consultation Summary Memo. Format the response strictly in Markdown.\n\n"
        "The memo MUST have the following structure:\n"
        "1. **Patient Intake Summary**: A concise summary of their vitals and demographics.\n"
        "2. **Reported Symptoms & Concerns**: Synthesize what symptoms they discussed (e.g. headaches, dizziness).\n"
        "3. **AI Preliminary Attributions**: What risk factors might be linked (e.g. high blood pressure, sleep deprivation).\n"
        "4. **Lifestyle & Dietary Guidance**: Suggest evidence-based recommendations (e.g. low-sodium diet, stress reduction).\n"
        "5. **Consultation Checklist**: A checklist of 3-4 specific questions they should ask their doctor.\n\n"
        "CRITICAL: Include a clear warning at the top and bottom: '⚠️ DISCLAIMER: This is an AI-generated consultation summary memo and does not substitute for professional medical diagnosis or care.'\n"
        "Do not diagnose any specific diseases directly."
    )
    user_prompt = f"Patient Vitals:\n{vitals_text}\n\nChat Conversation History:\n{chat_text}"
    
    if api_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel("gemini-1.5-flash")
            response = model.generate_content(f"{system_prompt}\n\n{user_prompt}")
            return {"summary": response.text}
        except Exception:
            pass
            
    fallback_markdown = (
        "⚠️ **DISCLAIMER: This is an AI-generated consultation summary memo and does not substitute for professional medical diagnosis or care.**\n\n"
        "### CLINICAL CONSULTATION SUMMARY MEMO\n\n"
        "**Patient Intake Summary:**\n"
        f"- BP: {req.vitals.get('systolic_bp', 'N/A')}/{req.vitals.get('diastolic_bp', 'N/A')} mmHg\n"
        f"- BMI: {req.vitals.get('bmi', 'N/A')} kg/m²\n"
        f"- Age: {req.vitals.get('age', 'N/A')} yrs\n\n"
        "**Reported Symptoms & Concerns:**\n"
        "Patient completed AegisBot intake chat logs. Common clinical observations from reports note primary concerns related to cardiorespiratory and sleep quality.\n\n"
        "**AI Preliminary Attributions:**\n"
        "- Elevated BP readings correlate with cardiovascular workload.\n"
        "- Standard clinical recommendation is to monitor daily trends.\n\n"
        "**Lifestyle & Dietary Guidance:**\n"
        "- Reduce dietary sodium intake (<2g daily).\n"
        "- Optimize sleep hygiene to achieve 7-8 hours nightly.\n\n"
        "**Consultation Checklist (Ask Your Doctor):**\n"
        "- [ ] Are my home BP measurements indicative of hypertension?\n"
        "- [ ] Should I obtain a comprehensive lipid panel?\n"
        "- [ ] Are my reported symptoms linked to cardiovascular workload?\n\n"
        "⚠️ **DISCLAIMER: This is an AI-generated consultation summary memo and does not substitute for professional medical diagnosis or care.**"
    )
    return {"summary": fallback_markdown}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

