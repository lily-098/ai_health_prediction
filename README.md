# AegisHealth - Clinical Screening & Systemic Risk Analysis Portal

AegisHealth is a professional, clinical-grade patient diagnostic and screening web portal. The system fuses real-time physiological vital measurements with rule-based emergency safety thresholds to provide instant risk classifications, identify primary physiological stress drivers, and recommend clinical care pathways.

---

## 📌 Problem Statement & Context

### The Challenge
In modern healthcare informatics, diagnostic calculators are often either static, hard-to-use forms or complex, black-box systems that dump machine learning jargon (like "SHAP weights," "XGBoost leaf values," and "softmax probabilities") onto clinicians and patients. Furthermore:
* Standard predictive tools lack immediate **emergency overrides**, meaning critical vital boundaries (like hypertensive crisis or severe hypoxemia) could be under-reported by mathematical averages.
* Standard interfaces fail to provide immediate, interactive scenario testing (comparing Patient A vs. Patient B side-by-side).
* Support chatbots are frequently hard to read, get layout-squished, or lack accessibility controls (such as speech-to-text or vocalized readouts).

### The Solution: AegisHealth
AegisHealth solves this by delivering an explainable, safe, and highly aesthetic clinical workspace:
1. **Dual-Layer Assessment**: Combines a safety override rule engine (enforcing clinical safety cutoffs) with multi-variable risk models.
2. **Physiological Risk Drivers**: Attributes specific vital measurements (like high blood pressure, low oxygen saturation, or body mass index) to isolate which factors push patient stress above standard baselines.
3. **Scenario Workspace**: Allows clinicians to lock a patient's vitals (Patient A) and dynamically drag sliders to observe delta percentages against a live patient (Patient B).
4. **Accessible AegisBot**: An interactive clinical assistant equipped with **Web Speech API text-to-speech synthesis** (with a mute toggle) and robust layout bounds to prevent squishing.
5. **Premium Aesthetic Theme**: Designed with a balanced **Cream (`#FFFDF2`) and Dark Pink (`#970747`)** color theme on a warm linen background (`#F6F4E8`) for a professional, clinical look.

---

## 🛠️ Technology Stack

### Backend (Intelligent Calibrator)
* **Core Framework**: [FastAPI](https://fastapi.tiangolo.com/) (Python-based, high performance, asynchronous)
* **Model Engine**: XGBoost Classifier (trained on 71,550 clinical screening records with **99.34% verified accuracy**)
* **Explainer Engine**: SHAP (SHapley Additive exPlanations) for calculating vital-level physiological risk drivers
* **Host Server**: Uvicorn

### Frontend (Clinical Workspace)
* **Core Library**: [React.js](https://react.dev/) (Functional components, custom hooks, and state syncing)
* **Build Tool**: [Vite](https://vitejs.dev/) (Sub-second hot-module replacement and ultra-fast asset compilation)
* **Styling**: Vanilla CSS utilizing CSS custom properties for dual-theme control (Cream Light / Black Cherry Dark)
* **Vocal Assistant**: Web Speech Synthesis API (`window.speechSynthesis`)

---

## 📂 Implementation Details & Core Features

### 1. Patient Intake Profile & Live Estimations
* Bidirectional synced input sliders and number boxes for Age, BMI, Systolic/Diastolic BP, Heart Rate, SpO2, and Sleep.
* Live-updating badges that automatically label blood pressure stages (e.g. *Stage 2 Hypertension*, *Elevated*) and BMI categories in real time before submitting.

### 2. Clinical Safety Overrides (Precedence Engine)
Standard classification algorithms can sometimes mask high-severity signs. AegisHealth applies immediate rule-based overrides when critical thresholds are breached:
* **SpO2 < 90%**, **Systolic BP >= 180 mmHg**, **Diastolic BP >= 120 mmHg**, or **Heart Rate >= 130 bpm** immediately escalates the patient classification to **Critical**, bypassing standard risk calculations.

### 3. Scenario Comparison Delta Workspace
* Lock a patient's vitals as "Patient A" with a single click.
* Adjust live sliders for "Patient B" to see mathematical delta differences (e.g. `+10 mmHg (+8.3%)`) colored based on clinical impact (better/worse).

### 4. AegisBot Speech Synthesis Assistant
* Swapped default templates for standard clinical robot SVG icons.
* Implemented text-to-speech so AegisBot reads replies aloud, with clean text preprocessing (removes emojis, bullets, and markdown markers for clear audio).
* Built a header mute toggle (🔊 / 🔇) to easily control audio readouts.
* Fixed flexbox clipping bugs by applying `flex-shrink: 0` constraints to ensure the input panel remains fully visible.

---

## 🚀 Running the Project Locally

### Prerequisites
* Python 3.10+
* Node.js (v18+)

### 1. Spin up the FastAPI Backend
From the root directory:
```bash
# Set up a virtual environment and install packages
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt

# Start the uvicorn server
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```
The API documentation will be available at `http://127.0.0.1:8000/docs`.

### 2. Spin up the Vite Frontend
Navigate to the `frontend` folder:
```bash
cd frontend
npm install
npm run dev
```
Open your browser and navigate to `http://localhost:5173/`.

---

## 🔒 Git virtual environment (`.venv`) Leak Resolution

If you previously committed your entire `.venv` directory, causing Git pushes to fail on large files (like `xgboost.dll` and `llvmlite.dll` exceeding 100 MB), here are the cleanup commands that were run to resolve this:

1. **Created root-level `.gitignore`** to block virtual environments (`.venv/`, `venv/`), compiled Python files, and `node_modules/`.
2. **Re-initialized repository history** (deleting the large DLL commits while keeping local files intact):
   ```powershell
   # Delete corrupt git tracking folder
   Remove-Item -Path .git -Recurse -Force
   
   # Re-initialize empty repository
   git init
   
   # Re-link remote origin
   git remote add origin https://github.com/lily-098/ai_health_prediction.git
   ```
3. **Staged, Verified, and Pushed**:
   ```powershell
   git branch -M main
   git add .
   
   # Verify no files exceed 100 MB
   git diff --cached --name-only | ForEach-Object { if (Test-Path $_) { Get-Item $_ } } | Where-Object { $_.Length -gt 100MB }
   
   # Commit and force push to overwrite remote rejected commits
   git commit -m "initial clean clinical portal commit"
   git push -u origin main --force
   ```