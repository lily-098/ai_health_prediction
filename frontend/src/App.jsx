import React, { useState, useEffect, useMemo, useRef } from "react";

function App() {
  // Theme Configuration (Clinical Mint / Forest Spruce)
  const [theme, setTheme] = useState("light");

  // Landing Hero Intro Collapse State
  const [heroCollapsed, setHeroCollapsed] = useState(false);

  // API Config
  const [apiUrl, setApiUrl] = useState("http://127.0.0.1:8000");
  const [apiSettingsOpen, setApiSettingsOpen] = useState(false);
  const [apiConnected, setApiConnected] = useState(false);
  const [modelInfo, setModelInfo] = useState(null);

  // Active Workspace Tab
  const [activeTab, setActiveTab] = useState("diagnostics");

  // Vitals Inputs
  const [age, setAge] = useState(54);
  const [bmi, setBmi] = useState(26.3);
  const [systolicBp, setSystolicBp] = useState(120);
  const [diastolicBp, setDiastolicBp] = useState(80);
  const [hasCvd, setHasCvd] = useState(false);

  // Optional Fields Toggles & Custom values
  const [useDefaultHr, setUseDefaultHr] = useState(true);
  const [heartRate, setHeartRate] = useState(80);

  const [useDefaultSpo2, setUseDefaultSpo2] = useState(true);
  const [spo2, setSpo2] = useState(96);

  const [useDefaultSleep, setUseDefaultSleep] = useState(true);
  const [sleepHours, setSleepHours] = useState(7.0);

  // Results & Loading
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [apiError, setApiError] = useState("");

  // Patient Scenario Comparison Slot ("Patient A")
  const [savedPatientA, setSavedPatientA] = useState(null);

  // CHATBOT STATES
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [chatLog, setChatLog] = useState([
    {
      sender: "bot",
      text: "Hello! I am AegisBot, your clinical screening assistant. I can guide you on using the platform, explain the primary physiological risk drivers, or interpret your current patient vitals in real-time. Ask me anything!",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [chatTyping, setChatTyping] = useState(false);
  const [unreadCount, setUnreadCount] = useState(1);

  const chatMessagesEndRef = useRef(null);

  // Initialize Theme on startup — targets body to support full-page transition
  useEffect(() => {
    if (theme === "dark") {
      document.body.classList.add("dark-theme");
    } else {
      document.body.classList.remove("dark-theme");
    }
  }, [theme]);

  // Test and Fetch API Connection
  const checkApiConnection = async () => {
    try {
      const res = await fetch(`${apiUrl}/health`);
      if (res.ok) {
        setApiConnected(true);
        // Fetch model info
        const infoRes = await fetch(`${apiUrl}/model-info`);
        if (infoRes.ok) {
          const infoData = await infoRes.json();
          setModelInfo(infoData);
        }
      } else {
        setApiConnected(false);
      }
    } catch (err) {
      setApiConnected(false);
      console.warn("API health check failed:", err);
    }
  };

  // Check connection on load or when apiUrl changes
  useEffect(() => {
    checkApiConnection();
  }, [apiUrl]);

  // Scroll Chat to bottom on message updates
  useEffect(() => {
    if (chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatLog, chatTyping]);

  // TEXT-TO-SPEECH VOICE GENERATOR
  const speakText = (text) => {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    
    // Cancel any ongoing voice synthesis
    window.speechSynthesis.cancel();

    // Clean up text of markdown stars, emojis, or bullets for clean vocalization
    const cleanText = text
      .replace(/[⚠️•*]/g, "")
      .replace(/\n/g, " ");

    const utterance = new SpeechSynthesisUtterance(cleanText);
    const voices = window.speechSynthesis.getVoices();
    // Prefer English voices
    const englishVoice = voices.find((v) => v.lang.startsWith("en"));
    if (englishVoice) {
      utterance.voice = englishVoice;
    }
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  };

  // Toggle voice mute/unmute state
  const handleToggleVoice = (e) => {
    e.stopPropagation();
    const nextVal = !voiceEnabled;
    setVoiceEnabled(nextVal);
    if (!nextVal && ('speechSynthesis' in window)) {
      window.speechSynthesis.cancel();
    }
  };

  // Toggle chatbot panel and trigger greeting speech
  const toggleChat = () => {
    const nextOpen = !chatOpen;
    setChatOpen(nextOpen);
    if (nextOpen) {
      setUnreadCount(0);
      speakText(chatLog[0].text);
    } else {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }
  };

  // Sync Input Handlers (bidirectional typing & sliding)
  const handleAgeChange = (val) => {
    const parsed = Math.max(18, Math.min(90, Number(val) || 18));
    setAge(parsed);
  };
  const handleBmiChange = (val) => {
    const parsed = Math.max(10, Math.min(60, Math.round(Number(val) * 10) / 10 || 10));
    setBmi(parsed);
  };
  const handleSystolicChange = (val) => {
    const parsed = Math.max(70, Math.min(250, Number(val) || 70));
    setSystolicBp(parsed);
  };
  const handleDiastolicChange = (val) => {
    const parsed = Math.max(40, Math.min(150, Number(val) || 40));
    setDiastolicBp(parsed);
  };
  const handleHrChange = (val) => {
    const parsed = Math.max(40, Math.min(140, Number(val) || 40));
    setHeartRate(parsed);
  };
  const handleSpo2Change = (val) => {
    const parsed = Math.max(85, Math.min(100, Number(val) || 85));
    setSpo2(parsed);
  };
  const handleSleepChange = (val) => {
    const parsed = Math.max(3, Math.min(12, Math.round(Number(val) * 10) / 10 || 3));
    setSleepHours(parsed);
  };

  // Client side validation
  const validateForm = () => {
    if (parseFloat(systolicBp) <= parseFloat(diastolicBp)) {
      setValidationError("Systolic blood pressure must be greater than Diastolic blood pressure.");
      return false;
    }
    setValidationError("");
    return true;
  };

  // Make Prediction
  const handlePredict = async (e) => {
    if (e) e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setApiError("");
    setPrediction(null);
    setActiveTab("diagnostics");

    const payload = {
      age: parseFloat(age),
      bmi: parseFloat(bmi),
      systolic_bp: parseFloat(systolicBp),
      diastolic_bp: parseFloat(diastolicBp),
      heart_rate: useDefaultHr ? null : parseFloat(heartRate),
      spo2: useDefaultSpo2 ? null : parseFloat(spo2),
      sleep_hours: useDefaultSleep ? null : parseFloat(sleepHours),
      has_cvd: hasCvd,
    };

    try {
      const response = await fetch(`${apiUrl}/predict?explain=true`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData?.detail?.[0]?.msg || `API responded with status code ${response.status}`;
        throw new Error(errMsg);
      }

      const data = await response.json();
      setPrediction(data);
    } catch (err) {
      setApiError(err.message || "An unexpected connection error occurred.");
    } finally {
      setLoading(false);
    }
  };

  // Live Patient vitals class estimators (calculated on drag/type)
  const bpEstimation = useMemo(() => {
    const s = parseFloat(systolicBp);
    const d = parseFloat(diastolicBp);
    if (s >= 180 || d >= 120) return { label: "Crisis / Severe", class: "critical" };
    if (s >= 140 || d >= 90) return { label: "Stage 2 Hypertension", class: "critical" };
    if ((s >= 130 && s <= 139) || (d >= 80 && d <= 89)) return { label: "Stage 1 Hypertension", class: "high" };
    if (s >= 120 && s <= 129 && d < 80) return { label: "Elevated BP", class: "moderate" };
    if (s < 120 && d < 80) return { label: "Normal BP", class: "normal" };
    return { label: "Indeterminate BP", class: "moderate" };
  }, [systolicBp, diastolicBp]);

  const bmiEstimation = useMemo(() => {
    const val = parseFloat(bmi);
    if (val >= 30) return { label: "Obese Category", class: "critical" };
    if (val >= 25 && val <= 29.9) return { label: "Overweight Category", class: "high" };
    if (val >= 18.5 && val <= 24.9) return { label: "Healthy Weight", class: "normal" };
    return { label: "Underweight Category", class: "moderate" };
  }, [bmi]);

  // Lock current prediction parameters as "Patient A"
  const saveToComparison = () => {
    if (!prediction) return;
    setSavedPatientA({
      inputs: {
        age,
        bmi,
        systolicBp,
        diastolicBp,
        heartRate: useDefaultHr ? (modelInfo?.population_medians?.heart_rate || 80.5) : heartRate,
        spo2: useDefaultSpo2 ? (modelInfo?.population_medians?.spo2 || 96.9) : spo2,
        sleepHours: useDefaultSleep ? (modelInfo?.population_medians?.sleep_hours || 7.0) : sleepHours,
        hasCvd,
      },
      results: prediction
    });
    setActiveTab("comparison");
  };

  // Clear Comparison Workspace
  const clearComparison = () => {
    setSavedPatientA(null);
  };

  // Live Scenario comparison deltas
  const comparisonDeltas = useMemo(() => {
    if (!savedPatientA || !prediction) return null;
    const a = savedPatientA.inputs;
    
    const bHr = useDefaultHr ? (modelInfo?.population_medians?.heart_rate || 80.5) : heartRate;
    const bSpo2 = useDefaultSpo2 ? (modelInfo?.population_medians?.spo2 || 96.9) : spo2;
    const bSleep = useDefaultSleep ? (modelInfo?.population_medians?.sleep_hours || 7.0) : sleepHours;

    const calcDelta = (prev, cur, decimals = 1) => {
      const diff = cur - prev;
      const pct = prev !== 0 ? (diff / prev) * 100 : 0;
      const sign = diff > 0 ? "+" : "";
      return {
        diff: `${sign}${diff.toFixed(decimals)}`,
        pct: `${sign}${pct.toFixed(1)}%`,
        worse: diff > 0,
        better: diff < 0
      };
    };

    return {
      age: calcDelta(a.age, age, 0),
      bmi: calcDelta(a.bmi, bmi, 1),
      systolicBp: calcDelta(a.systolicBp, systolicBp, 0),
      diastolicBp: calcDelta(a.diastolicBp, diastolicBp, 0),
      heartRate: calcDelta(a.heartRate, bHr, 0),
      spo2: {
        ...calcDelta(a.spo2, bSpo2, 1),
        worse: bSpo2 < a.spo2,
        better: bSpo2 > a.spo2
      },
      sleepHours: {
        ...calcDelta(a.sleepHours, bSleep, 1),
        worse: bSleep < a.sleepHours,
        better: bSleep > a.sleepHours
      }
    };
  }, [savedPatientA, prediction, age, bmi, systolicBp, diastolicBp, heartRate, useDefaultHr, spo2, useDefaultSpo2, sleepHours, useDefaultSleep, modelInfo]);

  // Health risk warnings and custom recommendations engine
  const clinicalRecommendations = useMemo(() => {
    const list = [];
    const s = parseFloat(systolicBp);
    const d = parseFloat(diastolicBp);
    if (s >= 140 || d >= 90) {
      list.push({
        title: "Hypertension Management Plan",
        text: "Systolic BP >= 140 or Diastolic >= 90 indicates severe/moderate hypertension. Standard clinical guidelines suggest initiating a low-sodium diet, regular aerobic exercise, daily BP logging, and a consult with a cardiologist for potential pharmacotherapy.",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        )
      });
    }

    const currentSpo2 = useDefaultSpo2 ? (modelInfo?.population_medians?.spo2 || 96.9) : parseFloat(spo2);
    if (currentSpo2 < 94) {
      list.push({
        title: "Respiratory Evaluation (Oxygen Saturation)",
        text: "Oxygen saturation level is below 94%, which is the standard safety cutoff for normal respiratory function. We strongly advise checking for symptoms of dyspnea, consulting a healthcare professional, and checking for cardiorespiratory issues.",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M2 12h20M12 2v20" />
          </svg>
        )
      });
    }

    const currentBmi = parseFloat(bmi);
    if (currentBmi >= 30) {
      list.push({
        title: "Metabolic Risk Counseling",
        text: "A BMI of 30+ falls in the obese category, which is associated with increased risks of diabetes and atherosclerotic cardiovascular disease. A registered dietitian consult for weight management and cardiovascular risk evaluation is recommended.",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
            <line x1="7" y1="7" x2="7.01" y2="7" />
          </svg>
        )
      });
    }

    if (hasCvd) {
      list.push({
        title: "Cardiovascular Disease Care Protocol",
        text: "Patient has a prior diagnosis of CVD. Vitals must be strictly managed to prevent secondary cardiac events. Targets: Systolic BP < 130 mmHg, normal SpO2, and resting heart rate within stable zones (60-80 bpm). Guidelines recommend formal cardiac rehabilitation.",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        )
      });
    }

    const currentSleep = useDefaultSleep ? (modelInfo?.population_medians?.sleep_hours || 7.0) : parseFloat(sleepHours);
    if (currentSleep < 6.0) {
      list.push({
        title: "Sleep Optimization Guide",
        text: "Average sleep under 6 hours correlates with sympathetic nervous system activation, elevated baseline blood pressure, and impaired cardiovascular recovery. Prioritize consistent bedtimes, dark sleeping environments, and limit caffeine/electronic screens.",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )
      });
    }

    if (list.length === 0) {
      list.push({
        title: "Routine Health Maintenance",
        text: "The patient vitals are within normal range thresholds. Maintain general cardiovascular health through 150 minutes/week of moderate physical activity, a nutrient-dense diet rich in fiber and lean proteins, and routine clinical physical exams.",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        )
      });
    }

    return list;
  }, [systolicBp, diastolicBp, bmi, spo2, useDefaultSpo2, sleepHours, useDefaultSleep, hasCvd, modelInfo]);

  // CHATBOT CLINICAL INTERPRETATION FUNCTION
  const interpretActiveVitals = () => {
    const bpText = `Blood Pressure: ${systolicBp}/${diastolicBp} mmHg (${bpEstimation.label})`;
    const bmiText = `BMI: ${bmi} kg/m² (${bmiEstimation.label})`;
    const hrText = useDefaultHr ? "Heart Rate: 80.5 bpm (Population Average)" : `Heart Rate: ${heartRate} bpm`;
    const spo2Text = useDefaultSpo2 ? "Oxygen Saturation: 96.9% (Population Average)" : `Oxygen Saturation: ${spo2}%`;
    const sleepText = useDefaultSleep ? "Sleep: 7.0 hours (Population Average)" : `Sleep: ${sleepHours} hours/night`;
    const cvdText = `Prior Cardiac History: ${hasCvd ? "Yes" : "No"}`;

    // Overrides check
    const overrides = [];
    const currentSpo2 = useDefaultSpo2 ? 96.9 : parseFloat(spo2);
    const s = parseFloat(systolicBp);
    const d = parseFloat(diastolicBp);
    const currentHr = useDefaultHr ? 80.5 : parseFloat(heartRate);
    const currentBmi = parseFloat(bmi);

    if (currentSpo2 < 90) overrides.push("Critical Hypoxemia (SpO2 < 90%)");
    if (s >= 180 || d >= 120) overrides.push("Hypertensive Crisis (BP >= 180/120)");
    if (currentHr >= 130) overrides.push("Severe Tachycardia (HR >= 130)");
    if (currentSpo2 < 94 && s >= 140) overrides.push("Hypoxemia + Stage 2 BP combo");
    if (currentBmi >= 40 && s >= 140) overrides.push("Morbid Obesity + Stage 2 BP combo");

    let overrideWarning = "";
    if (overrides.length > 0) {
      overrideWarning = `\n⚠️ CRITICAL SAFETY THRESHOLDS DETECTED: [${overrides.join(", ")}]. The patient risk status has been escalated to Critical, bypassing standard assessment scoring.`;
    }

    return (
      `Here is a clinical interpretation of the current active patient vitals:\n\n` +
      `• Patient Age: ${age} years\n` +
      `• ${bpText}\n` +
      `• ${bmiText}\n` +
      `• ${hrText}\n` +
      `• ${spo2Text}\n` +
      `• ${sleepText}\n` +
      `• ${cvdText}\n` +
      `${overrideWarning}\n\n` +
      `Click 'Evaluate Patient Risk Profile' on the intake panel to run the risk analysis breakdown and primary risk drivers report.`
    );
  };

  // CHATBOT INCOMING MESSAGE PROCESSOR
  const handleChatSubmit = (e) => {
    if (e) e.preventDefault();
    if (!chatInput.trim()) return;

    const userText = chatInput;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Add user message
    setChatLog((prev) => [
      ...prev,
      { sender: "user", text: userText, time: timestamp }
    ]);
    setChatInput("");
    setChatTyping(true);

    // Process Bot response after a short organic delay
    setTimeout(() => {
      let botResponse = "";
      const text = userText.toLowerCase();

      if (text.includes("interpret") || text.includes("vital") || text.includes("check my") || text.includes("current")) {
        botResponse = interpretActiveVitals();
      } else if (text.includes("how to use") || text.includes("guide") || text.includes("help") || text.includes("use this")) {
        botResponse = (
          "To assess patient risk:\n\n" +
          "1. **Input Patient Parameters**: Drag the Age, BMI, and Blood Pressure sliders (or type values in the boxes) on the left panel.\n" +
          "2. **Add Covariates**: Optionally specify custom Heart Rate, Oxygen (SpO2), or Sleep values, and toggle Cardiac History if applicable.\n" +
          "3. **Run Assessment**: Click the green 'Evaluate Patient Risk Profile' button.\n" +
          "4. **Analyze Report**: Inspect the Diagnostic Report for risk labels, likelihood breakdown, clinical warning messages, physiological risk drivers, and advisory guidelines."
        );
      } else if (text.includes("driver") || text.includes("physiological") || text.includes("factor") || text.includes("shap")) {
        botResponse = (
          "Physiological Risk Drivers represent the specific vital measurements (such as elevated blood pressure, low oxygen saturation, or body mass index) that are contributing most heavily to the patient's elevated health risk classification. AegisHealth's diagnostic engine analyzes these indicators to isolate which factors are driving clinical stress above the standard population baseline."
        );
      } else if (text.includes("override") || text.includes("safety") || text.includes("rules") || text.includes("threshold")) {
        botResponse = (
          "Clinical safety overrides are rule-based safeguards designed to bypass standard risk calculations when emergency thresholds are crossed. For example, if a patient exhibits hypertensive crisis (BP >= 180/120), severe hypoxemia (SpO2 < 90%), or severe tachycardia (HR >= 130), the system automatically flags them as Critical to ensure immediate medical attention."
        );
      } else if (text.includes("model") || text.includes("system") || text.includes("accuracy") || text.includes("dataset") || text.includes("calibrat")) {
        botResponse = (
          "The AegisHealth diagnostic engine is calibrated against 71,550 clinical screening observations to ensure clinical-grade precision. It has a verified diagnostic accuracy of 99.34%. You can view the full analytics in the 'System Performance & Analytics' tab."
        );
      } else if (text.includes("hello") || text.includes("hi") || text.includes("hey") || text.includes("greetings")) {
        botResponse = "Hi there! I'm AegisBot. How can I assist you with clinical screening queries today?";
      } else {
        botResponse = (
          "I understand you're asking about that. As AegisBot, I recommend using the **'Interpret my current vitals'** or " +
          "**'Physiological Risk Drivers'** buttons below, or clicking 'Evaluate Patient Risk Profile' on the left form to run the risk screening! Let me know if you have specific clinical questions."
        );
      }

      setChatLog((prev) => [
        ...prev,
        {
          sender: "bot",
          text: botResponse,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      setChatTyping(false);
      
      // TRIGGER SPEECH
      speakText(botResponse);
    }, 700);
  };

  // Helper to send preset prompts in chatbot
  const handlePresetClick = (text) => {
    setChatInput(text);
    setTimeout(() => {
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setChatLog((prev) => [
        ...prev,
        { sender: "user", text: text, time: timestamp }
      ]);
      setChatTyping(true);

      setTimeout(() => {
        let botResponse = "";
        const lower = text.toLowerCase();
        if (lower.includes("interpret")) {
          botResponse = interpretActiveVitals();
        } else if (lower.includes("how to use")) {
          botResponse = (
            "To assess patient risk:\n\n" +
            "1. **Input Patient Parameters**: Drag the Age, BMI, and Blood Pressure sliders (or type values in the boxes) on the left panel.\n" +
            "2. **Add Covariates**: Optionally specify custom Heart Rate, Oxygen (SpO2), or Sleep values, and toggle Cardiac History if applicable.\n" +
            "3. **Run Assessment**: Click the green 'Evaluate Patient Risk Profile' button.\n" +
            "4. **Analyze Report**: Inspect the Diagnostic Report for risk labels, likelihood breakdown, clinical warning messages, physiological risk drivers, and advisory guidelines."
          );
        } else if (lower.includes("drivers") || lower.includes("physiological")) {
          botResponse = (
            "Physiological Risk Drivers represent the specific vital measurements (such as elevated blood pressure, low oxygen saturation, or body mass index) that are contributing most heavily to the patient's elevated health risk classification. AegisHealth's diagnostic engine analyzes these indicators to isolate which factors are driving clinical stress above the standard population baseline."
          );
        } else if (lower.includes("override") || lower.includes("safety")) {
          botResponse = (
            "Clinical safety overrides are rule-based safeguards designed to bypass standard risk calculations when emergency thresholds are crossed. For example, if a patient exhibits hypertensive crisis (BP >= 180/120), severe hypoxemia (SpO2 < 90%), or severe tachycardia (HR >= 130), the system automatically flags them as Critical to ensure immediate medical attention."
          );
        }

        setChatLog((prev) => [
          ...prev,
          {
            sender: "bot",
            text: botResponse,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
        setChatTyping(false);
        
        // TRIGGER SPEECH
        speakText(botResponse);
      }, 700);

    }, 50);
    setChatInput("");
  };

  return (
    <div id="root">
      
      {/* HEADER NAVIGATION */}
      <nav className="main-nav">
        <div className="nav-content">
          <div className="brand-section">
            <span className="brand-logo">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </span>
            <div className="brand-title">
              AegisHealth
              <span className="brand-subtitle">Clinical Assessment & Physiological Risk Analysis</span>
            </div>
          </div>

          <div className="nav-actions">
            {/* Live API status Badge dropdown */}
            <div className="api-dropdown-container">
              <button 
                className="connection-badge" 
                onClick={() => setApiSettingsOpen(!apiSettingsOpen)}
                title="Click to edit backend URL connection settings"
              >
                <span className={`status-dot ${apiConnected ? "connected" : "disconnected"}`} />
                {apiConnected ? "System Connected" : "System Offline"}
              </button>

              {apiSettingsOpen && (
                <div className="api-settings-panel">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label>CALIBRATION SERVER URL</label>
                    <button 
                      style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.8rem", fontWeight: "bold" }}
                      onClick={() => setApiSettingsOpen(false)}
                    >
                      Close
                    </button>
                  </div>
                  <input
                    type="text"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    placeholder="http://127.0.0.1:8000"
                  />
                  <button 
                    className="btn-secondary" 
                    style={{ fontSize: "0.75rem", justifyContent: "center" }}
                    onClick={() => { checkApiConnection(); setApiSettingsOpen(false); }}
                  >
                    Test Connection
                  </button>
                </div>
              )}
            </div>

            {/* Light/Dark Toggle */}
            <button 
              className="theme-toggle-btn"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              title={`Switch to ${theme === "light" ? "Spruce Dark" : "Clinical Light"} mode`}
            >
              {theme === "light" ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* CORE CONTENT LAYOUT */}
      <main className="app-container">
        
        {/* PLATFORM LANDING BANNER / HERO SECTION */}
        {!heroCollapsed ? (
          <section className="hero-banner">
            <div className="hero-header-row">
              <div className="hero-title-group">
                <span className="hero-tag">Clinical Screening Portal</span>
                <h1 className="hero-headline">Diagnostics & Physiological Risk Analysis</h1>
                <p className="hero-tagline">
                  Fusing clinical-grade safety thresholds with diagnostic evaluations to generate real-time patient assessments.
                </p>
              </div>
              <button className="btn-collapse-hero" onClick={() => setHeroCollapsed(true)}>
                Hide Platform Overview
              </button>
            </div>

            <div className="hero-features-grid">
              <div className="hero-feature-card">
                <div className="hero-feat-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                </div>
                <div className="hero-feat-details">
                  <h4>Intelligent Intake</h4>
                  <p>Real-time calculators evaluate patient Blood Pressure stage and Body Mass Index ranges as values are modified.</p>
                </div>
              </div>

              <div className="hero-feature-card">
                <div className="hero-feature-card">
                  <div className="hero-feat-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polygon points="12 2 2 7 12 12 22 7 12 2" />
                      <polyline points="2 17 12 22 22 17" />
                      <polyline points="2 12 12 17 22 12" />
                    </svg>
                  </div>
                  <div className="hero-feat-details">
                    <h4>Risk Attributions</h4>
                    <p>Attributes physiological indicators to determine the specific drivers of cardiovascular and respiratory stress.</p>
                  </div>
                </div>
              </div>

              <div className="hero-feature-card">
                <div className="hero-feat-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                    <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                    <line x1="6" y1="6" x2="6.01" y2="6" />
                    <line x1="6" y1="18" x2="6.01" y2="18" />
                  </svg>
                </div>
                <div className="hero-feat-details">
                  <h4>Safety safeguards</h4>
                  <p>Safety screening immediately overrides assessment status for critical vital boundary violations.</p>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <div className="collapsed-hero-bar">
            <span className="collapsed-hero-text">AegisHealth Clinical Risk Platform is active.</span>
            <button className="btn-collapse-hero" style={{ padding: "0.25rem 0.60rem" }} onClick={() => setHeroCollapsed(false)}>
              Show Platform Overview
            </button>
          </div>
        )}

        {/* CORE GRID */}
        <div className="dashboard-grid">
          
          {/* LEFT COLUMN: PATIENT INTAKE FORM */}
          <div className="form-column">
            <section className="card">
              <div className="card-header">
                <span className="card-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </span>
                <span className="card-title">Patient Intake Profile</span>
              </div>

              <form className="card-body" onSubmit={handlePredict}>
                
                {/* 1. DEMOGRAPHICS & PRIMARY VITALS */}
                <div className="form-section-title">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v8M8 12h8" />
                  </svg>
                  Primary Clinical Features
                </div>

                <div className="form-grid-2col">
                  {/* Age */}
                  <div className="vital-input-widget">
                    <div className="vital-label-row">
                      <span className="vital-label">Age</span>
                      <div className="vital-value-controls">
                        <input 
                          type="number" 
                          className="vital-number-box"
                          min="18" 
                          max="90"
                          value={age}
                          onChange={(e) => handleAgeChange(e.target.value)}
                        />
                        <span className="vital-unit">yrs</span>
                      </div>
                    </div>
                    <input 
                      type="range" 
                      className="range-slider"
                      min="18" 
                      max="90" 
                      value={age}
                      onChange={(e) => handleAgeChange(e.target.value)}
                    />
                  </div>

                  {/* BMI */}
                  <div className="vital-input-widget">
                    <div className="vital-label-row">
                      <span className="vital-label">Body Mass Index (BMI)</span>
                      <div className="vital-value-controls">
                        <input 
                          type="number" 
                          className="vital-number-box"
                          min="10" 
                          max="60"
                          step="0.1"
                          value={bmi}
                          onChange={(e) => handleBmiChange(e.target.value)}
                        />
                        <span className="vital-unit">kg/m²</span>
                      </div>
                    </div>
                    <input 
                      type="range" 
                      className="range-slider"
                      min="10" 
                      max="60" 
                      step="0.1"
                      value={bmi}
                      onChange={(e) => handleBmiChange(e.target.value)}
                    />
                    <span className={`live-estimator-badge ${bmiEstimation.class}`}>
                      {bmiEstimation.label}
                    </span>
                  </div>
                </div>

                {/* Blood Pressure Row */}
                <div className="form-grid-2col">
                  {/* Systolic */}
                  <div className="vital-input-widget">
                    <div className="vital-label-row">
                      <span className="vital-label">Systolic BP (top)</span>
                      <div className="vital-value-controls">
                        <input 
                          type="number" 
                          className="vital-number-box"
                          min="70" 
                          max="250"
                          value={systolicBp}
                          onChange={(e) => handleSystolicChange(e.target.value)}
                        />
                        <span className="vital-unit">mmHg</span>
                      </div>
                    </div>
                    <input 
                      type="range" 
                      className="range-slider"
                      min="70" 
                      max="250" 
                      value={systolicBp}
                      onChange={(e) => handleSystolicChange(e.target.value)}
                    />
                  </div>

                  {/* Diastolic */}
                  <div className="vital-input-widget">
                    <div className="vital-label-row">
                      <span className="vital-label">Diastolic BP (bottom)</span>
                      <div className="vital-value-controls">
                        <input 
                          type="number" 
                          className="vital-number-box"
                          min="40" 
                          max="150"
                          value={diastolicBp}
                          onChange={(e) => handleDiastolicChange(e.target.value)}
                        />
                        <span className="vital-unit">mmHg</span>
                      </div>
                    </div>
                    <input 
                      type="range" 
                      className="range-slider"
                      min="40" 
                      max="150" 
                      value={diastolicBp}
                      onChange={(e) => handleDiastolicChange(e.target.value)}
                    />
                    <span className={`live-estimator-badge ${bpEstimation.class}`}>
                      {bpEstimation.label}
                    </span>
                  </div>
                </div>

                {/* 2. OPTIONAL CLINICAL METRICS */}
                <div className="form-section-title" style={{ marginTop: "1rem" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  Optional Risk Covariates
                </div>

                {/* Heart Rate */}
                <div className="switch-control-row">
                  <div className="switch-label-group">
                    <span className="switch-title">Resting Heart Rate</span>
                    <span className="switch-subtitle">
                      {useDefaultHr ? "Using median (80.5 bpm)" : `Specified: ${heartRate} bpm`}
                    </span>
                  </div>
                  <label className="toggle-switch">
                    <input 
                      type="checkbox" 
                      checked={!useDefaultHr}
                      onChange={(e) => setUseDefaultHr(!e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
                {!useDefaultHr && (
                  <div className="vital-input-widget" style={{ marginBottom: "1.25rem", marginTop: "-0.5rem" }}>
                    <input 
                      type="range" 
                      className="range-slider"
                      min="40" 
                      max="140"
                      value={heartRate}
                      onChange={(e) => handleHrChange(e.target.value)}
                    />
                  </div>
                )}

                {/* SpO2 */}
                <div className="switch-control-row">
                  <div className="switch-label-group">
                    <span className="switch-title">Oxygen Saturation (SpO2)</span>
                    <span className="switch-subtitle">
                      {useDefaultSpo2 ? "Using median (96.9%)" : `Specified: ${spo2}%`}
                    </span>
                  </div>
                  <label className="toggle-switch">
                    <input 
                      type="checkbox" 
                      checked={!useDefaultSpo2}
                      onChange={(e) => setUseDefaultSpo2(!e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
                {!useDefaultSpo2 && (
                  <div className="vital-input-widget" style={{ marginBottom: "1.25rem", marginTop: "-0.5rem" }}>
                    <input 
                      type="range" 
                      className="range-slider"
                      min="85" 
                      max="100"
                      value={spo2}
                      onChange={(e) => handleSpo2Change(e.target.value)}
                    />
                    <span className={`live-estimator-badge ${spo2 < 90 ? "critical" : spo2 < 94 ? "high" : "normal"}`}>
                      {spo2 < 90 ? "Hypoxemia Emergency" : spo2 < 94 ? "Borderline Hypoxic" : "Oxygenated Range"}
                    </span>
                  </div>
                )}

                {/* Sleep Hours */}
                <div className="switch-control-row">
                  <div className="switch-label-group">
                    <span className="switch-title">Average Nightly Sleep</span>
                    <span className="switch-subtitle">
                      {useDefaultSleep ? "Using median (7.0 hrs)" : `Specified: ${sleepHours} hours`}
                    </span>
                  </div>
                  <label className="toggle-switch">
                    <input 
                      type="checkbox" 
                      checked={!useDefaultSleep}
                      onChange={(e) => setUseDefaultSleep(!e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
                {!useDefaultSleep && (
                  <div className="vital-input-widget" style={{ marginBottom: "1.25rem", marginTop: "-0.5rem" }}>
                    <input 
                      type="range" 
                      className="range-slider"
                      min="3" 
                      max="12" 
                      step="0.5"
                      value={sleepHours}
                      onChange={(e) => handleSleepChange(e.target.value)}
                    />
                  </div>
                )}

                {/* 3. CARDIOVASCULAR HISTORY */}
                <label className="cvd-custom-box" style={{ marginTop: "1rem", marginBottom: "1.5rem" }}>
                  <input
                    type="checkbox"
                    checked={hasCvd}
                    onChange={(e) => setHasCvd(e.target.checked)}
                  />
                  <div className="cvd-details">
                    <span className="cvd-title">Prior Cardiovascular Disease Diagnosis</span>
                    <span className="cvd-desc">Check if patient has clinical history of coronary artery disease, stroke, or heart failure.</span>
                  </div>
                </label>

                {validationError && (
                  <div style={{ color: "var(--risk-critical)", background: "var(--risk-critical-bg)", border: "1px dashed rgba(220,38,38,0.2)", padding: "0.75rem 1.0rem", borderRadius: "0.5rem", marginBottom: "1rem", fontSize: "0.85rem", fontWeight: "bold" }}>
                    ⚠️ {validationError}
                  </div>
                )}

                <button 
                  type="submit" 
                  className="btn-primary" 
                  disabled={loading || !apiConnected}
                >
                  {loading ? (
                    <>Evaluating Risk Profiles...</>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                      </svg>
                      Evaluate Patient Risk Profile
                    </>
                  )}
                </button>

              </form>
            </section>
          </div>

          {/* RIGHT COLUMN: WORKSPACE TABS & DIAGNOSTICS REPORT */}
          <div className="report-column">
            
            {/* TABS SELECTION BAR */}
            <div className="dashboard-tabs">
              <button 
                className={`tab-btn ${activeTab === "diagnostics" ? "active" : ""}`}
                onClick={() => setActiveTab("diagnostics")}
              >
                Diagnostic Report
              </button>
              <button 
                className={`tab-btn ${activeTab === "comparison" ? "active" : ""}`}
                onClick={() => setActiveTab("comparison")}
                disabled={!prediction && !savedPatientA}
              >
                Scenario Comparison
              </button>
              <button 
                className={`tab-btn ${activeTab === "performance" ? "active" : ""}`}
                onClick={() => setActiveTab("performance")}
              >
                System Performance & Analytics
              </button>
              <button 
                className={`tab-btn ${activeTab === "explainers" ? "active" : ""}`}
                onClick={() => setActiveTab("explainers")}
              >
                Safety Thresholds & Critical Escalations
              </button>
            </div>

            {/* TAB CONTAINER: DIAGNOSTIC REPORT */}
            {activeTab === "diagnostics" && (
              <section className="card">
                <div className="card-header">
                  <span className="card-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <line x1="9" y1="9" x2="15" y2="9" />
                      <line x1="9" y1="13" x2="15" y2="13" />
                      <line x1="9" y1="17" x2="15" y2="17" />
                    </svg>
                  </span>
                  <span className="card-title">Diagnostics & Assessment Report</span>
                </div>

                <div className="card-body">
                  
                  {/* Empty States */}
                  {!prediction && !loading && !apiError && (
                    <div className="report-empty-state">
                      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                      <h3>No Diagnostic Report Generated</h3>
                      <p>Adjust vitals in the intake profile on the left, then click 'Evaluate Patient Risk' to retrieve clinical risk assessments.</p>
                    </div>
                  )}

                  {/* Loading */}
                  {loading && (
                    <div style={{ textAlign: "center", padding: "4rem 0" }}>
                      <div style={{
                        width: "48px",
                        height: "48px",
                        border: "4px solid var(--border-color)",
                        borderTopColor: "var(--primary)",
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                        margin: "0 auto 1.5rem auto"
                      }} />
                      <style>{`
                        @keyframes spin {
                          0% { transform: rotate(0deg); }
                          100% { transform: rotate(360deg); }
                        }
                      `}</style>
                      <h4 style={{ color: "var(--text-secondary)", marginBottom: "0.5rem" }}>Running Clinical Risk Integration</h4>
                      <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Analyzing patient vital ratios, verifying safety boundaries, and assessing health metrics...</p>
                    </div>
                  )}

                  {/* Connection errors */}
                  {apiError && (
                    <div style={{ padding: "2rem 1rem", textAlign: "center", background: "var(--risk-critical-bg)", border: "1px dashed rgba(220, 38, 38, 0.2)", borderRadius: "0.75rem" }}>
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--risk-critical)" strokeWidth="2" style={{ marginBottom: "1rem" }}>
                        <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <h3 style={{ color: "var(--risk-critical)", marginBottom: "0.5rem" }}>Diagnostic Request Failed</h3>
                      <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>{apiError}</p>
                    </div>
                  )}

                  {/* Predicted output details */}
                  {prediction && !loading && (
                    <div className="results-wrapper">
                      
                      {/* Classification Badge Shield */}
                      <div className={`risk-shield-hero ${prediction.risk_level}`}>
                        <div className="risk-shield-label">Calculated Risk Classification</div>
                        <div className="risk-shield-value">{prediction.risk_level}</div>
                        <div className="risk-shield-confidence">
                          {prediction.override_applied ? (
                            <span style={{ color: "var(--risk-critical)" }}>⚠️ Safety Rule Override Engaged</span>
                          ) : (
                            <span>Confidence: {prediction.confidence_percent}%</span>
                          )}
                        </div>
                      </div>

                      {/* Scenario Comparison Action Hook */}
                      <div className="comparison-banner-actions">
                        <span className="comparison-banner-text">Lock this report to compare with alternative clinical scenarios:</span>
                        <button className="btn-secondary" onClick={saveToComparison}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <path d="M9 17h6M9 13h6M9 9h6" />
                          </svg>
                          Lock as Patient A
                        </button>
                      </div>

                      {/* Safety warnings triggered */}
                      {prediction.warnings && prediction.warnings.length > 0 && (
                        <div className="clinical-warning-box">
                          <div className="warning-box-title">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                              <line x1="12" y1="9" x2="12" y2="13" />
                              <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                            CLINICAL OVERRIDE CRITICAL MESSAGES
                          </div>
                          <ul className="warning-list">
                            {prediction.warnings.map((warn, i) => (
                              <li key={i}>{warn}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Class Probability distribution */}
                      <div>
                        <h4 style={{ fontSize: "0.85rem", fontWeight: "800", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
                          Clinical Risk Integration & Analysis Breakdown
                        </h4>
                        <div className="distribution-list">
                          {Object.entries(prediction.probabilities).map(([risk, prob]) => (
                            <div className="dist-bar-row" key={risk}>
                              <div className="dist-bar-header">
                                <span>{risk} Risk Range</span>
                                <span>{prob}%</span>
                              </div>
                              <div className="dist-bar-track">
                                <div 
                                  className={`dist-bar-fill ${risk}`} 
                                  style={{ width: `${prob}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* SHAP chart explainer */}
                      {prediction.top_factors && prediction.top_factors.length > 0 && (
                        <div style={{ borderTop: "1px solid var(--border-inner)", paddingTop: "1.25rem" }}>
                          <h4 style={{ fontSize: "0.85rem", fontWeight: "800", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
                            Primary Physiological Risk Drivers
                          </h4>
                          <div className="shap-bar-chart">
                            {prediction.top_factors.map((factor, index) => {
                              const rankWidth = index === 0 ? 100 : index === 1 ? 70 : 45;
                              return (
                                <div className="shap-bar-item" key={factor}>
                                  <div className="shap-bar-label" title={factor}>
                                    {factor.replace(/_/g, " ")}
                                  </div>
                                  <div className="shap-bar-gauge-track">
                                    <div 
                                      className="shap-bar-gauge-fill" 
                                      style={{ width: `${rankWidth}%` }}
                                    />
                                  </div>
                                  <div className="shap-rank-badge">#{index + 1}</div>
                                </div>
                              );
                            })}
                          </div>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.5rem", fontStyle: "italic" }}>
                            Rank represents the physiological factors carrying the highest weight in the patient's diagnostic classification.
                          </div>
                        </div>
                      )}

                      {/* Population Median Fallbacks info */}
                      {prediction.fields_filled_with_median && prediction.fields_filled_with_median.length > 0 && (
                        <div style={{ borderTop: "1px solid var(--border-inner)", paddingTop: "1rem" }}>
                          <h4 style={{ fontSize: "0.75rem", fontWeight: "800", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
                            Missing Inputs Filled with Population Baseline Medians
                          </h4>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                            {prediction.fields_filled_with_median.map((field) => (
                              <span 
                                key={field}
                                style={{ background: "var(--bg-input)", border: "1px solid var(--border-inner)", padding: "0.25rem 0.5rem", borderRadius: "0.25rem", fontSize: "0.72rem", fontWeight: "600", color: "var(--text-secondary)" }}
                              >
                                {field.replace(/_/g, " ")}: {modelInfo?.population_medians?.[field] || "Median"}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Clinical Recommendations */}
                      <div style={{ borderTop: "1px solid var(--border-inner)", paddingTop: "1.25rem" }}>
                        <h4 style={{ fontSize: "0.85rem", fontWeight: "800", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
                          Advisory Recommendations (Vitals-based)
                        </h4>
                        <div className="health-recs-panel">
                          {clinicalRecommendations.map((rec, i) => (
                            <div className="rec-item" key={i}>
                              <div className="rec-icon">{rec.icon}</div>
                              <div className="rec-content">
                                <span className="rec-title">{rec.title}</span>
                                <span className="rec-text">{rec.text}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  )}

                </div>
              </section>
            )}

            {/* TAB CONTAINER: SCENARIO COMPARISON */}
            {activeTab === "comparison" && (
              <section className="card">
                <div className="card-header">
                  <span className="card-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M4 4l5 5M12 12l9 9" />
                    </svg>
                  </span>
                  <span className="card-title">Scenario Workspace (Side-by-Side Delta)</span>
                </div>

                <div className="card-body">
                  {!savedPatientA && (
                    <div className="report-empty-state">
                      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <line x1="9" y1="9" x2="15" y2="9" />
                        <line x1="9" y1="13" x2="15" y2="13" />
                      </svg>
                      <h3>Workspace Empty</h3>
                      <p>Generate a diagnostic report first, then click 'Lock as Patient A' in the report page to enable delta comparisons.</p>
                    </div>
                  )}

                  {savedPatientA && (
                    <div>
                      {/* Control Panel */}
                      <div className="comparison-banner-actions">
                        <span className="comparison-banner-text">Comparing locked scenario with live input values:</span>
                        <button className="btn-secondary" style={{ color: "var(--risk-critical)", borderColor: "var(--risk-critical)" }} onClick={clearComparison}>
                          Clear Patient A Slot
                        </button>
                      </div>

                      <div className="comparison-grid">
                        
                        {/* PATIENT A COLUMN */}
                        <div className="comparison-column">
                          <div className="comparison-header">Patient A (Locked Profile)</div>
                          <div className={`comparison-risk-badge ${savedPatientA.results.risk_level}`}>
                            {savedPatientA.results.risk_level} Risk
                          </div>
                          
                          <div className="comparison-row">
                            <span className="comparison-row-key">Age</span>
                            <span className="comparison-row-val">{savedPatientA.inputs.age} yrs</span>
                          </div>

                          <div className="comparison-row">
                            <span className="comparison-row-key">BMI</span>
                            <span className="comparison-row-val">{savedPatientA.inputs.bmi} kg/m²</span>
                          </div>

                          <div className="comparison-row">
                            <span className="comparison-row-key">Systolic BP</span>
                            <span className="comparison-row-val">{savedPatientA.inputs.systolicBp} mmHg</span>
                          </div>

                          <div className="comparison-row">
                            <span className="comparison-row-key">Diastolic BP</span>
                            <span className="comparison-row-val">{savedPatientA.inputs.diastolicBp} mmHg</span>
                          </div>

                          <div className="comparison-row">
                            <span className="comparison-row-key">Heart Rate</span>
                            <span className="comparison-row-val">{savedPatientA.inputs.heartRate} bpm</span>
                          </div>

                          <div className="comparison-row">
                            <span className="comparison-row-key">Oxygen (SpO2)</span>
                            <span className="comparison-row-val">{savedPatientA.inputs.spo2}%</span>
                          </div>

                          <div className="comparison-row">
                            <span className="comparison-row-key">Sleep hours</span>
                            <span className="comparison-row-val">{savedPatientA.inputs.sleepHours} hrs</span>
                          </div>

                          <div className="comparison-row">
                            <span className="comparison-row-key">Cardiac History</span>
                            <span className="comparison-row-val">{savedPatientA.inputs.hasCvd ? "Yes" : "No"}</span>
                          </div>
                        </div>

                        {/* PATIENT B COLUMN */}
                        <div className="comparison-column">
                          <div className="comparison-header">Patient B (Current Live Profile)</div>
                          
                          {prediction ? (
                            <div className={`comparison-risk-badge ${prediction.risk_level}`}>
                              {prediction.risk_level} Risk
                            </div>
                          ) : (
                            <div className="comparison-risk-badge" style={{ backgroundColor: "var(--border-inner)", color: "var(--text-muted)" }}>
                              Calculate Vitals first
                            </div>
                          )}

                          {/* Age comparisons */}
                          <div className="comparison-row">
                            <span className="comparison-row-key">Age</span>
                            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                              <span className="comparison-row-val">{age} yrs</span>
                              {comparisonDeltas && age !== savedPatientA.inputs.age && (
                                <span style={{ fontSize: "0.72rem", fontWeight: "bold", color: "var(--text-muted)" }}>
                                  ({comparisonDeltas.age.diff})
                                </span>
                              )}
                            </div>
                          </div>

                          {/* BMI comparisons */}
                          <div className="comparison-row">
                            <span className="comparison-row-key">BMI</span>
                            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                              <span className="comparison-row-val">{bmi} kg/m²</span>
                              {comparisonDeltas && bmi !== savedPatientA.inputs.bmi && (
                                <span style={{ fontSize: "0.72rem", fontWeight: "bold", color: comparisonDeltas.bmi.better ? "var(--risk-low)" : "var(--risk-critical)" }}>
                                  ({comparisonDeltas.bmi.diff})
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Systolic BP comparisons */}
                          <div className="comparison-row">
                            <span className="comparison-row-key">Systolic BP</span>
                            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                              <span className="comparison-row-val">{systolicBp} mmHg</span>
                              {comparisonDeltas && systolicBp !== savedPatientA.inputs.systolicBp && (
                                <span style={{ fontSize: "0.72rem", fontWeight: "bold", color: comparisonDeltas.systolicBp.better ? "var(--risk-low)" : "var(--risk-critical)" }}>
                                  ({comparisonDeltas.systolicBp.diff})
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Diastolic BP comparisons */}
                          <div className="comparison-row">
                            <span className="comparison-row-key">Diastolic BP</span>
                            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                              <span className="comparison-row-val">{diastolicBp} mmHg</span>
                              {comparisonDeltas && diastolicBp !== savedPatientA.inputs.diastolicBp && (
                                <span style={{ fontSize: "0.72rem", fontWeight: "bold", color: comparisonDeltas.diastolicBp.better ? "var(--risk-low)" : "var(--risk-critical)" }}>
                                  ({comparisonDeltas.diastolicBp.diff})
                                </span>
                              )}
                            </div>
                          </div>

                          {/* HR comparisons */}
                          <div className="comparison-row">
                            <span className="comparison-row-key">Heart Rate</span>
                            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                              <span className="comparison-row-val">
                                {useDefaultHr ? (modelInfo?.population_medians?.heart_rate || 80.5) : heartRate} bpm
                              </span>
                              {comparisonDeltas && (useDefaultHr ? 80.5 : heartRate) !== savedPatientA.inputs.heartRate && (
                                <span style={{ fontSize: "0.72rem", fontWeight: "bold", color: "var(--text-muted)" }}>
                                  ({comparisonDeltas.heartRate.diff})
                                </span>
                              )}
                            </div>
                          </div>

                          {/* SpO2 comparisons */}
                          <div className="comparison-row">
                            <span className="comparison-row-key">Oxygen (SpO2)</span>
                            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                              <span className="comparison-row-val">
                                {useDefaultSpo2 ? (modelInfo?.population_medians?.spo2 || 96.9) : spo2}%
                              </span>
                              {comparisonDeltas && (useDefaultSpo2 ? 96.9 : spo2) !== savedPatientA.inputs.spo2 && (
                                <span style={{ fontSize: "0.72rem", fontWeight: "bold", color: comparisonDeltas.spo2.better ? "var(--risk-low)" : "var(--risk-critical)" }}>
                                  ({comparisonDeltas.spo2.diff})
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Sleep comparisons */}
                          <div className="comparison-row">
                            <span className="comparison-row-key">Sleep hours</span>
                            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                              <span className="comparison-row-val">
                                {useDefaultSleep ? (modelInfo?.population_medians?.sleep_hours || 7.0) : sleepHours} hrs
                              </span>
                              {comparisonDeltas && (useDefaultSleep ? 7.0 : sleepHours) !== savedPatientA.inputs.sleepHours && (
                                <span style={{ fontSize: "0.72rem", fontWeight: "bold", color: comparisonDeltas.sleepHours.better ? "var(--risk-low)" : "var(--risk-critical)" }}>
                                  ({comparisonDeltas.sleepHours.diff})
                                </span>
                              )}
                            </div>
                          </div>

                          {/* CVD comparisons */}
                          <div className="comparison-row">
                            <span className="comparison-row-key">Cardiac History</span>
                            <span className="comparison-row-val">{hasCvd ? "Yes" : "No"}</span>
                          </div>

                        </div>

                      </div>
                    </div>
                  )}

                </div>
              </section>
            )}

            {/* TAB CONTAINER: SYSTEM PERFORMANCE & ANALYTICS */}
            {activeTab === "performance" && (
              <section className="card">
                <div className="card-header">
                  <span className="card-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                      <line x1="6" y1="6" x2="6.01" y2="6" />
                      <line x1="6" y1="18" x2="6.01" y2="18" />
                    </svg>
                  </span>
                  <span className="card-title">System Performance & Calibrator Stats</span>
                </div>

                <div className="card-body">
                  {!modelInfo && (
                    <div className="report-empty-state">
                      <p>Could not load database analytics. Please ensure the calibration server is connected.</p>
                    </div>
                  )}

                  {modelInfo && (
                    <div>
                      {/* Metric Micro Cards */}
                      {modelInfo.metrics && (
                        <div className="metrics-grid-3col">
                          <div className="metric-micro-card">
                            <div className="metric-micro-label">Verified Accuracy</div>
                            <div className="metric-micro-value">{(modelInfo.metrics.test_accuracy * 100).toFixed(2)}%</div>
                          </div>
                          <div className="metric-micro-card">
                            <div className="metric-micro-label">Weighted F1 Score</div>
                            <div className="metric-micro-value">{(modelInfo.metrics.f1_weighted * 100).toFixed(2)}%</div>
                          </div>
                          <div className="metric-micro-card">
                            <div className="metric-micro-label">Calibration Records</div>
                            <div className="metric-micro-value">{modelInfo.metrics.total_rows?.toLocaleString() || "71,550"}</div>
                          </div>
                        </div>
                      )}

                      {/* Median Pop Vitals */}
                      <h4 style={{ fontSize: "0.85rem", fontWeight: "800", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem", marginTop: "1.25rem" }}>
                        Active Population Baseline Medians
                      </h4>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
                        <thead>
                          <tr style={{ borderBottom: "2px solid var(--border-inner)", textAlign: "left" }}>
                            <th style={{ padding: "0.5rem", color: "var(--text-secondary)" }}>Biological Indicator</th>
                            <th style={{ padding: "0.5rem", color: "var(--text-secondary)" }}>Median Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(modelInfo.population_medians || {}).map(([key, val]) => (
                            <tr key={key} style={{ borderBottom: "1px solid var(--border-inner)" }}>
                              <td style={{ padding: "0.5rem", fontWeight: "600", color: "var(--text-secondary)" }}>
                                {key.replace(/_/g, " ")}
                              </td>
                              <td style={{ padding: "0.5rem", fontWeight: "700", color: "var(--text-primary)" }}>{val}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {/* Label distributions */}
                      {modelInfo.metrics?.label_distribution && (
                        <div>
                          <h4 style={{ fontSize: "0.85rem", fontWeight: "800", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
                            Clinical Record Class Distributions
                          </h4>
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                            {Object.entries(modelInfo.metrics.label_distribution).map(([lbl, count]) => {
                              const totalCount = Object.values(modelInfo.metrics.label_distribution).reduce((a, b) => a + b, 0);
                              const pct = ((count / totalCount) * 100).toFixed(1);
                              return (
                                <div key={lbl} style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", fontWeight: "700" }}>
                                    <span style={{ color: "var(--text-secondary)" }}>{lbl} Risk Range</span>
                                    <span style={{ color: "var(--text-muted)" }}>{count.toLocaleString()} cases ({pct}%)</span>
                                  </div>
                                  <div style={{ height: "6px", background: "var(--border-inner)", borderRadius: "3px", overflow: "hidden" }}>
                                    <div 
                                      className={`dist-bar-fill ${lbl}`}
                                      style={{ width: `${pct}%`, height: "100%" }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                    </div>
                  )}
                </div>
              </section>
            )}

            {/* TAB CONTAINER: SAFETY THRESHOLDS */}
            {activeTab === "explainers" && (
              <section className="card">
                <div className="card-header">
                  <span className="card-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5" />
                      <line x1="12" y1="22" x2="12" y2="15.5" />
                      <polyline points="22 8.5 12 15.5 2 8.5" />
                      <polyline points="2 15.5 12 8.5 22 15.5" />
                      <line x1="12" y1="2" x2="12" y2="8.5" />
                    </svg>
                  </span>
                  <span className="card-title">Clinical Safety & Critical Boundaries</span>
                </div>

                <div className="card-body">
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: "1.5" }}>
                      Patient safety is our primary objective. Standard numerical calculations can occasionally result in delays if high-severity signs are masked. To prevent critical failures, AegisHealth applies immediate rule-based emergency safety overrides *before* finalizing classifications. If any threshold is violated, the patient's risk status is automatically escalated to <strong>High</strong> or <strong>Critical</strong>.
                    </p>

                    <div className="clinical-rules-explainer">
                      <div className="form-section-title">Safety Threshold Rules (Precedence Order)</div>
                      
                      <div className="clinical-rule-item critical">
                        <span className="clinical-rule-key">1. SpO2 &lt; 90%</span>
                        <span className="clinical-rule-val">Escalate to Critical</span>
                      </div>

                      <div className="clinical-rule-item critical">
                        <span className="clinical-rule-key">2. Systolic BP &ge; 180 mmHg</span>
                        <span className="clinical-rule-val">Escalate to Critical</span>
                      </div>

                      <div className="clinical-rule-item critical">
                        <span className="clinical-rule-key">3. Diastolic BP &ge; 120 mmHg</span>
                        <span className="clinical-rule-val">Escalate to Critical</span>
                      </div>

                      <div className="clinical-rule-item critical">
                        <span className="clinical-rule-key">4. Resting Heart Rate &ge; 130 bpm</span>
                        <span className="clinical-rule-val">Escalate to Critical</span>
                      </div>

                      <div className="clinical-rule-item critical">
                        <span className="clinical-rule-key">5. SpO2 &lt; 94% AND Systolic BP &ge; 140 mmHg</span>
                        <span className="clinical-rule-val">Escalate to Critical</span>
                      </div>

                      <div className="clinical-rule-item critical">
                        <span className="clinical-rule-key">6. BMI &ge; 40 AND Systolic BP &ge; 140 mmHg</span>
                        <span className="clinical-rule-val">Escalate to Critical</span>
                      </div>

                      <div className="clinical-rule-item high">
                        <span className="clinical-rule-key">7. SpO2 &lt; 94%</span>
                        <span className="clinical-rule-val">Escalate to High</span>
                      </div>

                      <div className="clinical-rule-item high">
                        <span className="clinical-rule-key">8. Systolic BP &ge; 140 mmHg</span>
                        <span className="clinical-rule-val">Escalate to High</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

          </div>

        </div>
      </main>

      {/* FLOATING HEALTH CHATBOT (AegisBot) */}
      <button 
        className="chatbot-launcher" 
        onClick={toggleChat}
        title="Open AegisBot assistant"
      >
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <rect x="3" y="11" width="18" height="10" rx="2" />
          <circle cx="12" cy="5" r="2" />
          <path d="M12 7v4" />
          <line x1="8" y1="16" x2="8.01" y2="16" />
          <line x1="16" y1="16" x2="16.01" y2="16" />
          <path d="M9 11v-2a3 3 0 0 1 6 0v2" />
        </svg>
        <span className="chatbot-launcher-pulse" />
        {unreadCount > 0 && !chatOpen && (
          <span className="chatbot-launcher-badge">{unreadCount}</span>
        )}
      </button>

      {chatOpen && (
        <div className="chatbot-window">
          {/* Header */}
          <div className="chatbot-header">
            <div className="chatbot-bot-info">
              <div className="chatbot-avatar">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="3" y="11" width="18" height="10" rx="2" />
                  <circle cx="12" cy="5" r="2" />
                  <path d="M12 7v4" />
                  <line x1="8" y1="16" x2="8.01" y2="16" />
                  <line x1="16" y1="16" x2="16.01" y2="16" />
                  <path d="M9 11v-2a3 3 0 0 1 6 0v2" />
                </svg>
              </div>
              <div className="chatbot-name-group">
                <span className="chatbot-name">AegisBot</span>
                <span className="chatbot-status">Active Assistant</span>
              </div>
            </div>
            
            <div style={{ display: "flex", alignItems: "center" }}>
              {/* Mute/Unmute Voice button */}
              <button 
                className="chatbot-voice-toggle" 
                onClick={handleToggleVoice}
                title={voiceEnabled ? "Mute voice reader" : "Unmute voice reader"}
              >
                {voiceEnabled ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                )}
              </button>
              
              <button className="chatbot-close-btn" onClick={() => setChatOpen(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages Logs */}
          <div className="chatbot-messages">
            {chatLog.map((msg, i) => (
              <div key={i} className={`chat-bubble-container ${msg.sender}`}>
                <div className="chat-bubble">
                  {msg.text.split("\n").map((line, k) => (
                    <React.Fragment key={k}>
                      {line}
                      <br />
                    </React.Fragment>
                  ))}
                  <span className="chat-bubble-time">{msg.time}</span>
                </div>
              </div>
            ))}
            
            {chatTyping && (
              <div className="chat-bubble-container bot">
                <div className="chat-bubble">
                  <div className="typing-dots">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                </div>
              </div>
            )}
            
            <div ref={chatMessagesEndRef} />
          </div>

          {/* Preset Prompts Chips */}
          <div className="chatbot-presets-container">
            <button className="chat-preset-chip" onClick={() => handlePresetClick("Interpret my current vitals")}>
              Interpret Current Vitals
            </button>
            <button className="chat-preset-chip" onClick={() => handlePresetClick("How to use this tool?")}>
              How to use?
            </button>
            <button className="chat-preset-chip" onClick={() => handlePresetClick("What are Physiological Risk Drivers?")}>
              Risk Drivers
            </button>
            <button className="chat-preset-chip" onClick={() => handlePresetClick("What are clinical overrides?")}>
              Safety Thresholds
            </button>
          </div>

          {/* Footer Input */}
          <form className="chatbot-footer" onSubmit={handleChatSubmit}>
            <input
              type="text"
              className="chatbot-input"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask AegisBot..."
            />
            <button type="submit" className="chatbot-send-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>
        </div>
      )}

      {/* APP FOOTER */}
      <footer className="app-footer">
        <div className="footer-content">
          <p>
            AegisHealth Clinical Screening & Assessment Portal • Certified Calibration Engine. Patient observations secured locally.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
