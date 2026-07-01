import React, { useState, useEffect, useMemo, useRef } from "react";

function App() {
  // Theme Configuration (Clinical Mint / Forest Spruce)
  const [theme, setTheme] = useState("light");

  // Landing Hero Intro Collapse State
  const [heroCollapsed, setHeroCollapsed] = useState(false);

  // API Config
  const [apiUrl, setApiUrl] = useState(() => {
    const envUrl = import.meta.env.VITE_API_URL;
    if (envUrl) {
      return envUrl;
    }
    if (typeof window !== "undefined" && window.location) {
      const hostname = window.location.hostname;
      if (hostname === "localhost" || hostname === "127.0.0.1") {
        return `http://${hostname}:8000`;
      }
      // If deployed in production and no VITE_API_URL is provided, 
      // assume backend is on the same host (e.g. via reverse proxy or same domain)
      // or at least use https instead of forcing http and port 8000.
      return `https://${hostname}`;
    }
    return "http://127.0.0.1:8000";
  });
  const [apiSettingsOpen, setApiSettingsOpen] = useState(false);
  const [apiConnected, setApiConnected] = useState(false);
  const [modelInfo, setModelInfo] = useState(null);

  // Portal Role Selection Mode: "select", "patient", "doctor_login", "doctor"
  const [portalMode, setPortalMode] = useState("select");
  
  // Doctor Auth States
  const [doctorUsername, setDoctorUsername] = useState("doctor");
  const [doctorPassword, setDoctorPassword] = useState("");
  const [doctorToken, setDoctorToken] = useState(() => localStorage.getItem("doctorToken") || "");
  const [loginError, setLoginError] = useState("");
  
  // Doctor Dashboard States
  const [doctorReports, setDoctorReports] = useState([]);
  const [doctorLogs, setDoctorLogs] = useState([]);
  const [doctorTab, setDoctorTab] = useState("reports"); // "reports", "logs"
  const [doctorLoading, setDoctorLoading] = useState(false);
  const [doctorError, setDoctorError] = useState("");
  const [selectedChatHistory, setSelectedChatHistory] = useState(null);
  
  // Local Database 2 (Patient Saved Reports)
  const [patientLocalReports, setPatientLocalReports] = useState(() => {
    const saved = localStorage.getItem("patientReports");
    return saved ? JSON.parse(saved) : [];
  });
  
  // Track if current prediction was shared with doctor database
  const [reportShared, setReportShared] = useState(false);
  const [sharingLoading, setSharingLoading] = useState(false);

  // Vitals Recovery Simulator States & Controls
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationOriginalVitals, setSimulationOriginalVitals] = useState(null);

  const startSimulation = () => {
    if (isSimulating) return;
    
    // Save current values to restore later
    const original = {
      bmi: parseFloat(bmi),
      systolicBp: parseInt(systolicBp),
      diastolicBp: parseInt(diastolicBp),
      sleepHours: parseFloat(sleepHours),
      heartRate: parseFloat(heartRate),
      spo2: parseFloat(spo2),
      isSmoker,
      isDiabetic
    };
    setSimulationOriginalVitals(original);
    setIsSimulating(true);
    
    const steps = 6;
    let step = 0;
    
    const interval = setInterval(async () => {
      step++;
      if (step > steps) {
        clearInterval(interval);
        setIsSimulating(false);
        return;
      }
      
      const t = step / steps;
      
      const nextBmi = original.bmi + (22.0 - original.bmi) * t;
      const nextSystolic = Math.round(original.systolicBp + (115 - original.systolicBp) * t);
      const nextDiastolic = Math.round(original.diastolicBp + (75 - original.diastolicBp) * t);
      const nextSleep = original.sleepHours + (8.0 - original.sleepHours) * t;
      const nextHr = original.heartRate + (72.0 - original.heartRate) * t;
      const nextSpo2 = original.spo2 + (98.0 - original.spo2) * t;
      
      setBmi(nextBmi.toFixed(1));
      setSystolicBp(nextSystolic.toString());
      setDiastolicBp(nextDiastolic.toString());
      setSleepHours(nextSleep.toFixed(1));
      setHeartRate(nextHr.toFixed(0));
      setSpo2(nextSpo2.toFixed(0));
      setIsSmoker(false);
      setIsDiabetic(false);
      
      try {
        const payload = {
          age: parseFloat(age),
          bmi: nextBmi,
          systolic_bp: nextSystolic,
          diastolic_bp: nextDiastolic,
          heart_rate: useDefaultHr ? null : nextHr,
          spo2: useDefaultSpo2 ? null : nextSpo2,
          sleep_hours: useDefaultSleep ? null : nextSleep,
          has_cvd: hasCvd,
          sex: patientSex,
          is_smoker: false,
          is_diabetic: false,
          bp_treated: bpTreated,
        };
        const res = await fetch(`${apiUrl}/predict`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const data = await res.json();
          setPrediction(data);
        }
      } catch (err) {
        console.error("Simulation step failed", err);
      }
    }, 900);
  };

  const resetSimulation = () => {
    if (simulationOriginalVitals) {
      setBmi(simulationOriginalVitals.bmi.toFixed(1));
      setSystolicBp(simulationOriginalVitals.systolicBp.toString());
      setDiastolicBp(simulationOriginalVitals.diastolicBp.toString());
      setSleepHours(simulationOriginalVitals.sleepHours.toFixed(1));
      setHeartRate(simulationOriginalVitals.heartRate.toFixed(0));
      setSpo2(simulationOriginalVitals.spo2.toFixed(0));
      setIsSmoker(simulationOriginalVitals.isSmoker);
      setIsDiabetic(simulationOriginalVitals.isDiabetic);
      setSimulationOriginalVitals(null);
      setIsSimulating(false);
    }
  };

  // Helper to parse and render basic markdown clinical summaries
  const renderMarkdown = (text) => {
    if (!text) return null;
    return text.split("\n").map((line, i) => {
      let trimmed = line.trim();
      if (trimmed.startsWith("### ")) {
        return <h3 key={i} style={{ fontSize: "1.1rem", fontWeight: "bold", marginTop: "1rem", marginBottom: "0.5rem", color: "var(--text-main)" }}>{trimmed.slice(4)}</h3>;
      }
      if (trimmed.startsWith("## ")) {
        return <h2 key={i} style={{ fontSize: "1.25rem", fontWeight: "bold", marginTop: "1.25rem", marginBottom: "0.5rem", color: "var(--text-main)" }}>{trimmed.slice(3)}</h2>;
      }
      if (trimmed.startsWith("**")) {
        return <p key={i} style={{ margin: "0.5rem 0", fontWeight: "bold", color: "var(--text-main)" }}>{trimmed.replace(/\*\*/g, "")}</p>;
      }
      if (trimmed.startsWith("- [ ] ")) {
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: "0.4rem 0" }}>
            <input type="checkbox" readOnly checked={false} />
            <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{trimmed.slice(6)}</span>
          </div>
        );
      }
      if (trimmed.startsWith("- ")) {
        return <li key={i} style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginLeft: "1.25rem", marginBottom: "0.25rem" }}>{trimmed.slice(2)}</li>;
      }
      if (trimmed.length === 0) {
        return <div key={i} style={{ height: "0.5rem" }} />;
      }
      return <p key={i} style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: "0.4rem 0", lineHeight: "1.4" }}>{trimmed}</p>;
    });
  };

  // AI Consultation Summary Request Handler
  const handleGenerateSummary = async () => {
    setSummaryLoading(true);
    try {
      const payload = {
        chat_history: chatLog,
        vitals: {
          age: parseFloat(age),
          bmi: parseFloat(bmi),
          systolic_bp: parseFloat(systolicBp),
          diastolic_bp: parseFloat(diastolicBp),
          heart_rate: useDefaultHr ? null : parseFloat(heartRate),
          spo2: useDefaultSpo2 ? null : parseFloat(spo2),
          sleep_hours: useDefaultSleep ? null : parseFloat(sleepHours),
          has_cvd: hasCvd
        }
      };
      
      const res = await fetch(`${apiUrl}/ai-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        setSummaryMemo(data.summary);
      }
    } catch (err) {
      alert("Could not contact clinical summary engine.");
    } finally {
      setSummaryLoading(false);
    }
  };

  // Auto transition to doctor workspace if token present
  useEffect(() => {
    if (doctorToken) {
      setPortalMode("doctor");
    }
  }, [doctorToken]);

  // Active Workspace Tab
  const [activeTab, setActiveTab] = useState("diagnostics");

  // Vitals Inputs
  const [age, setAge] = useState(54);
  const [bmi, setBmi] = useState(26.3);
  const [systolicBp, setSystolicBp] = useState(120);
  const [diastolicBp, setDiastolicBp] = useState(80);
  const [hasCvd, setHasCvd] = useState(false);
  
  // Framingham Input States
  const [patientSex, setPatientSex] = useState("female");
  const [isSmoker, setIsSmoker] = useState(false);
  const [isDiabetic, setIsDiabetic] = useState(false);
  const [bpTreated, setBpTreated] = useState(false);
  
  // AI Consultation Summary States
  const [summaryMemo, setSummaryMemo] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

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

  // Doctor Auth Handlers
  const handleDoctorLogout = () => {
    setDoctorToken("");
    localStorage.removeItem("doctorToken");
    setPortalMode("select");
    setDoctorPassword("");
  };

  const handleDoctorLogin = async (e) => {
    e.preventDefault();
    setLoginError("");
    try {
      const res = await fetch(`${apiUrl}/doctor/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: doctorUsername, password: doctorPassword })
      });
      if (res.ok) {
        const data = await res.json();
        setDoctorToken(data.access_token);
        localStorage.setItem("doctorToken", data.access_token);
        setPortalMode("doctor");
      } else {
        const errData = await res.json().catch(() => ({}));
        setLoginError(errData.detail || "Incorrect username or password.");
      }
    } catch (err) {
      setLoginError("Failed to connect to authentication server.");
    }
  };

  const fetchDoctorData = async () => {
    if (!doctorToken) return;
    setDoctorLoading(true);
    setDoctorError("");
    try {
      const reportsRes = await fetch(`${apiUrl}/doctor/reports`, {
        headers: { "Authorization": `Bearer ${doctorToken}` }
      });
      const logsRes = await fetch(`${apiUrl}/doctor/logs`, {
        headers: { "Authorization": `Bearer ${doctorToken}` }
      });
      
      if (reportsRes.ok && logsRes.ok) {
        const reportsData = await reportsRes.json();
        const logsData = await logsRes.json();
        setDoctorReports(reportsData);
        setDoctorLogs(logsData);
      } else {
        if (reportsRes.status === 401 || logsRes.status === 401) {
          handleDoctorLogout();
          setLoginError("Session expired. Please log in again.");
          setPortalMode("doctor_login");
        } else {
          setDoctorError("Failed to load clinical records.");
        }
      }
    } catch (err) {
      setDoctorError("Could not retrieve portal records from backend.");
    } finally {
      setDoctorLoading(false);
    }
  };

  useEffect(() => {
    if (portalMode === "doctor") {
      fetchDoctorData();
    }
  }, [portalMode, doctorTab]);

  // Compile aggregate statistics for doctor analytics
  const compileDoctorStats = () => {
    if (doctorReports.length === 0) return null;
    
    let totalAge = 0, totalBmi = 0, totalSystolic = 0, totalDiastolic = 0;
    const riskCounts = { Normal: 0, Moderate: 0, High: 0, Critical: 0 };
    
    doctorReports.forEach(r => {
      totalAge += r.age;
      totalBmi += r.bmi;
      totalSystolic += r.systolic_bp;
      totalDiastolic += r.diastolic_bp;
      
      // Standardize casing
      const rLevel = r.risk_level ? r.risk_level.toLowerCase() : "";
      if (rLevel === "normal") riskCounts.Normal++;
      else if (rLevel === "moderate") riskCounts.Moderate++;
      else if (rLevel === "high") riskCounts.High++;
      else if (rLevel === "critical") riskCounts.Critical++;
    });
    
    const count = doctorReports.length;
    return {
      avgAge: (totalAge / count).toFixed(1),
      avgBmi: (totalBmi / count).toFixed(1),
      avgBp: `${Math.round(totalSystolic / count)}/${Math.round(totalDiastolic / count)}`,
      riskCounts
    };
  };

  // Telehealth sharing handler
  const shareReportWithDoctor = async () => {
    if (!prediction) return;
    setSharingLoading(true);
    try {
      const payload = {
        age: parseFloat(age),
        bmi: parseFloat(bmi),
        systolic_bp: parseFloat(systolicBp),
        diastolic_bp: parseFloat(diastolicBp),
        heart_rate: useDefaultHr ? null : parseFloat(heartRate),
        spo2: useDefaultSpo2 ? null : parseFloat(spo2),
        sleep_hours: useDefaultSleep ? null : parseFloat(sleepHours),
        has_cvd: hasCvd,
        sex: patientSex,
        is_smoker: isSmoker,
        is_diabetic: isDiabetic,
        bp_treated: bpTreated,
        risk_level: prediction.risk_level,
        model_prediction: prediction.model_prediction,
        confidence_percent: prediction.confidence_percent,
        probabilities: prediction.probabilities,
        top_factors: prediction.top_factors,
        warnings: prediction.warnings,
        chat_history: chatLog
      };
      
      const res = await fetch(`${apiUrl}/share-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setReportShared(true);
        if (doctorToken) {
          fetchDoctorData();
        }
      } else {
        alert("Failed to share report with the clinician database.");
      }
    } catch (err) {
      alert("Error sharing report. Backend server may be offline.");
    } finally {
      setSharingLoading(false);
    }
  };

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
      sex: patientSex,
      is_smoker: isSmoker,
      is_diabetic: isDiabetic,
      bp_treated: bpTreated,
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
      setReportShared(false);
      
      // Auto-save locally for patients (Database 2)
      const newReport = {
        id: Date.now(),
        timestamp: new Date().toLocaleString(),
        inputs: {
          age: parseFloat(age),
          bmi: parseFloat(bmi),
          systolicBp: parseFloat(systolicBp),
          diastolicBp: parseFloat(diastolicBp),
          heartRate: useDefaultHr ? null : parseFloat(heartRate),
          spo2: useDefaultSpo2 ? null : parseFloat(spo2),
          sleepHours: useDefaultSleep ? null : parseFloat(sleepHours),
          hasCvd
        },
        prediction: data
      };
      setPatientLocalReports((prev) => {
        const updated = [newReport, ...prev];
        localStorage.setItem("patientReports", JSON.stringify(updated));
        return updated;
      });
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
  const handleChatSubmit = async (e) => {
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

    try {
      const payload = {
        message: userText,
        vitals: {
          age: parseFloat(age),
          bmi: parseFloat(bmi),
          systolic_bp: parseFloat(systolicBp),
          diastolic_bp: parseFloat(diastolicBp),
          heart_rate: useDefaultHr ? null : parseFloat(heartRate),
          spo2: useDefaultSpo2 ? null : parseFloat(spo2),
          sleep_hours: useDefaultSleep ? null : parseFloat(sleepHours),
          has_cvd: hasCvd
        }
      };
      
      const res = await fetch(`${apiUrl}/ai-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        const data = await res.json();
        setChatLog((prev) => [
          ...prev,
          {
            sender: "bot",
            text: data.reply,
            isAi: data.ai_mode,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
        speakText(data.reply);
      } else {
        throw new Error("Chat error");
      }
    } catch (err) {
      const errorReply = "I am having trouble reaching the clinical AI coordinator right now. Please verify your connection or ask about another symptom.";
      setChatLog((prev) => [
        ...prev,
        {
          sender: "bot",
          text: errorReply,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      speakText(errorReply);
    } finally {
      setChatTyping(false);
    }
  };

  // Helper to send preset prompts in chatbot
  const handlePresetClick = (text) => {
    setChatInput(text);
    setTimeout(async () => {
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setChatLog((prev) => [
        ...prev,
        { sender: "user", text: text, time: timestamp }
      ]);
      setChatTyping(true);

      try {
        const payload = {
          message: text,
          vitals: {
            age: parseFloat(age),
            bmi: parseFloat(bmi),
            systolic_bp: parseFloat(systolicBp),
            diastolic_bp: parseFloat(diastolicBp),
            heart_rate: useDefaultHr ? null : parseFloat(heartRate),
            spo2: useDefaultSpo2 ? null : parseFloat(spo2),
            sleep_hours: useDefaultSleep ? null : parseFloat(sleepHours),
            has_cvd: hasCvd
          }
        };
        const res = await fetch(`${apiUrl}/ai-chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const data = await res.json();
          setChatLog((prev) => [
            ...prev,
            {
              sender: "bot",
              text: data.reply,
              isAi: data.ai_mode,
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          ]);
          speakText(data.reply);
        } else {
          throw new Error("Chat error");
        }
      } catch (err) {
        const errReply = "Connection to AI consultation service failed.";
        setChatLog((prev) => [
          ...prev,
          { sender: "bot", text: errReply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
        ]);
        speakText(errReply);
      } finally {
        setChatTyping(false);
      }
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
            {portalMode === "patient" && (
              <button className="btn-secondary" style={{ marginRight: "1rem" }} onClick={() => setPortalMode("select")}>
                ← Exit Portal
              </button>
            )}
            {portalMode === "doctor_login" && (
              <button className="btn-secondary" style={{ marginRight: "1rem" }} onClick={() => setPortalMode("select")}>
                ← Back
              </button>
            )}
            {portalMode === "doctor" && (
              <button className="btn-secondary" style={{ marginRight: "1rem" }} onClick={handleDoctorLogout}>
                Logout (Clinician)
              </button>
            )}
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
        
        {portalMode === "select" && (
          <div className="portal-selector-overlay" style={{ width: "100%" }}>
            <div className="portal-selector-card">
              <div className="portal-selector-header">
                <h1>AegisHealth Workspace</h1>
                <p>Select your workspace role to begin screening and assessment.</p>
              </div>
              <div className="portal-options-grid">
                <div className="portal-opt-card" onClick={() => setPortalMode("patient")}>
                  <div className="portal-opt-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                  <div className="portal-opt-details">
                    <h3>Patient Portal</h3>
                    <p>Evaluate your physiological vitals, view AI Doctor assessments, and save screening history.</p>
                  </div>
                </div>
                <div className="portal-opt-card" onClick={() => setPortalMode("doctor_login")}>
                  <div className="portal-opt-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                  <div className="portal-opt-details">
                    <h3>Clinician Dashboard</h3>
                    <p>Monitor telehealth patient reports, analyze system overrides, and view diagnostic audit logs.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {portalMode === "doctor_login" && (
          <div className="portal-selector-overlay" style={{ width: "100%" }}>
            <div className="doctor-login-card">
              <h2 className="doctor-login-title">Clinician Authentication</h2>
              <form className="login-form" onSubmit={handleDoctorLogin}>
                <div className="login-input-group">
                  <label>Username</label>
                  <input 
                    type="text" 
                    className="login-input" 
                    value={doctorUsername} 
                    onChange={(e) => setDoctorUsername(e.target.value)} 
                    required 
                  />
                </div>
                <div className="login-input-group">
                  <label>Password</label>
                  <input 
                    type="password" 
                    className="login-input" 
                    value={doctorPassword} 
                    onChange={(e) => setDoctorPassword(e.target.value)} 
                    required 
                  />
                </div>
                {loginError && <p style={{ color: "var(--risk-critical)", fontSize: "0.85rem", fontWeight: "bold" }}>{loginError}</p>}
                <button type="submit" className="btn-primary" style={{ marginTop: "1rem" }}>
                  Authenticate Credentials
                </button>
              </form>
            </div>
          </div>
        )}

        {portalMode === "doctor" && (
          <div className="doctor-dashboard-container" style={{ width: "100%" }}>
            <div className="hero-banner" style={{ padding: "1.5rem 2rem", borderRadius: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h1 className="hero-headline" style={{ fontSize: "1.75rem" }}>Clinician Portal & Calibration Desk</h1>
                  <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Central telemetry database and system performance auditing desk.</p>
                </div>
                <button className="btn-secondary" onClick={fetchDoctorData} disabled={doctorLoading}>
                  {doctorLoading ? "Refreshing..." : "Refresh Records"}
                </button>
              </div>
            </div>

            <div className="dashboard-tabs" style={{ marginTop: "1rem" }}>
              <button 
                className={`tab-btn ${doctorTab === "reports" ? "active" : ""}`}
                onClick={() => setDoctorTab("reports")}
              >
                Shared Patient Reports ({doctorReports.length})
              </button>
              <button 
                className={`tab-btn ${doctorTab === "stats" ? "active" : ""}`}
                onClick={() => setDoctorTab("stats")}
              >
                Aggregate Clinic Analytics
              </button>
              <button 
                className={`tab-btn ${doctorTab === "logs" ? "active" : ""}`}
                onClick={() => setDoctorTab("logs")}
              >
                System Audit Logs ({doctorLogs.length})
              </button>
            </div>

            {doctorError && (
              <p style={{ color: "var(--risk-critical)", fontWeight: "bold" }}>{doctorError}</p>
            )}

            {doctorTab === "reports" && (
              <section className="card">
                <div className="card-header">
                  <span className="card-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <path d="M9 17h6M9 13h6M9 9h6" />
                    </svg>
                  </span>
                  <span className="card-title">Shared Patient Records (Database 1)</span>
                </div>
                <div className="card-body">
                  {doctorReports.length === 0 ? (
                    <div className="report-empty-state">
                      <h3>No Shared Reports</h3>
                      <p>Reports will appear here once patients submit them from the intake dashboard.</p>
                    </div>
                  ) : (
                    <div className="doctor-reports-table-wrapper">
                      <table className="reports-table">
                        <thead>
                          <tr>
                            <th>Shared Time</th>
                            <th>Vitals Details</th>
                            <th>CVD History</th>
                            <th>Assessed Risk</th>
                            <th>Confidence</th>
                            <th>Consultation Logs</th>
                          </tr>
                        </thead>
                        <tbody>
                          {doctorReports.map((report) => (
                            <tr key={report.id}>
                              <td>{new Date(report.shared_at).toLocaleString()}</td>
                              <td>
                                Age: {report.age} yrs | BMI: {report.bmi} kg/m² | BP: {report.systolic_bp}/{report.diastolic_bp} mmHg
                                {report.heart_rate && ` | HR: ${report.heart_rate} bpm`}
                                {report.spo2 && ` | SpO2: ${report.spo2}%`}
                                {report.sleep_hours && ` | Sleep: ${report.sleep_hours} hrs`}
                              </td>
                              <td>{report.has_cvd ? "Yes" : "No"}</td>
                              <td>
                                <span className={`badge-risk ${report.risk_level}`}>
                                  {report.risk_level}
                                </span>
                              </td>
                              <td>{report.confidence_percent}%</td>
                              <td>
                                {report.chat_history && report.chat_history.length > 0 ? (
                                  <button 
                                    className="btn-secondary" 
                                    style={{ padding: "0.25rem 0.5rem", fontSize: "0.72rem" }}
                                    onClick={() => setSelectedChatHistory(report.chat_history)}
                                  >
                                    View Chat ({report.chat_history.filter(c => c.sender === "user").length} msg)
                                  </button>
                                ) : (
                                  <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>No Chat Log</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* TAB CONTAINER: DOCTOR CLINIC ANALYTICS */}
            {doctorTab === "stats" && (
              <section className="card">
                <div className="card-header">
                  <span className="card-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="20" x2="18" y2="10" />
                      <line x1="12" y1="20" x2="12" y2="4" />
                      <line x1="6" y1="20" x2="6" y2="14" />
                    </svg>
                  </span>
                  <span className="card-title">Clinic Aggregate Analytics Desk</span>
                </div>
                <div className="card-body">
                  {doctorReports.length === 0 ? (
                    <div className="report-empty-state">
                      <h3>No Analytics Available</h3>
                      <p>Share patient reports first to populate clinic aggregate statistics.</p>
                    </div>
                  ) : (
                    (() => {
                      const stats = compileDoctorStats();
                      if (!stats) return null;
                      
                      const total = doctorReports.length;
                      const maxCount = Math.max(...Object.values(stats.riskCounts), 1);
                      
                      return (
                        <div>
                          {/* Grid of Averages */}
                          <div className="grid-3" style={{ marginBottom: "2rem" }}>
                            <div className="telemetry-badge-container" style={{ padding: "1.25rem", borderRadius: "0.75rem", backgroundColor: "var(--bg-input)" }}>
                              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "bold", textTransform: "uppercase" }}>Average Age</div>
                              <div style={{ fontSize: "2rem", fontWeight: "800", color: "var(--primary)" }}>{stats.avgAge} <span style={{ fontSize: "1rem" }}>yrs</span></div>
                            </div>
                            <div className="telemetry-badge-container" style={{ padding: "1.25rem", borderRadius: "0.75rem", backgroundColor: "var(--bg-input)" }}>
                              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "bold", textTransform: "uppercase" }}>Average BMI</div>
                              <div style={{ fontSize: "2rem", fontWeight: "800", color: "var(--primary)" }}>{stats.avgBmi} <span style={{ fontSize: "1rem" }}>kg/m²</span></div>
                            </div>
                            <div className="telemetry-badge-container" style={{ padding: "1.25rem", borderRadius: "0.75rem", backgroundColor: "var(--bg-input)" }}>
                              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "bold", textTransform: "uppercase" }}>Average Blood Pressure</div>
                              <div style={{ fontSize: "2rem", fontWeight: "800", color: "var(--primary)" }}>{stats.avgBp} <span style={{ fontSize: "1.25rem" }}>mmHg</span></div>
                            </div>
                          </div>
                          
                          {/* Risk Distribution Bar Chart */}
                          <div style={{ borderTop: "1px solid var(--border-inner)", paddingTop: "1.5rem" }}>
                            <h3 style={{ fontSize: "1rem", fontWeight: "bold", marginBottom: "1.25rem" }}>Physiological Risk Stratification Profile</h3>
                            
                            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                              {Object.entries(stats.riskCounts).map(([risk, countVal]) => {
                                const pct = total > 0 ? ((countVal / total) * 100).toFixed(0) : 0;
                                const barWidth = total > 0 ? (countVal / maxCount) * 100 : 0;
                                const colorClass = risk.toLowerCase();
                                
                                return (
                                  <div key={risk} style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                                    <div style={{ width: "80px", fontWeight: "bold", fontSize: "0.85rem", textTransform: "capitalize" }}>
                                      {risk}
                                    </div>
                                    <div style={{ flex: 1, height: "18px", backgroundColor: "var(--bg-input)", borderRadius: "4px", overflow: "hidden" }}>
                                      <div 
                                        className={`dist-bar-fill ${colorClass}`}
                                        style={{ width: `${barWidth}%`, height: "100%", transition: "width 0.4s ease" }}
                                      />
                                    </div>
                                    <div style={{ width: "60px", textAlign: "right", fontSize: "0.85rem", fontWeight: "bold" }}>
                                      {countVal} ({pct}%)
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  )}
                </div>
              </section>
            )}

            {doctorTab === "logs" && (
              <section className="card">
                <div className="card-header">
                  <span className="card-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
                      <line x1="9" y1="9" x2="15" y2="9" />
                      <line x1="9" y1="13" x2="13" y2="13" />
                    </svg>
                  </span>
                  <span className="card-title">System Event & Authentication Audit Logs</span>
                </div>
                <div className="card-body">
                  <div className="logs-terminal">
                    {doctorLogs.map((log) => (
                      <div key={log.id} className="log-row">
                        <span className="log-time">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                        <span className={`log-type ${log.event_type}`}>{log.event_type}</span>
                        <span className="log-msg">{log.message}</span>
                      </div>
                    ))}
                    {doctorLogs.length === 0 && (
                      <div style={{ color: "#888", textAlign: "center" }}>No logs recorded in database.</div>
                    )}
                  </div>
                </div>
              </section>
            )}
          </div>
        )}

        {portalMode === "patient" && (
          <>
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

                {/* 3. FRAMINGHAM COVARIATES */}
                <div className="form-section-title" style={{ marginTop: "1rem" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  Framingham Risk Covariates
                </div>

                {/* Biological Sex Toggle */}
                <div className="switch-control-row" style={{ marginBottom: "1rem" }}>
                  <div className="switch-label-group">
                    <span className="switch-title">Biological Sex</span>
                    <span className="switch-subtitle">Used for gender-specific risk equations</span>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button 
                      type="button" 
                      className={`tab-btn ${patientSex === "female" ? "active" : ""}`}
                      onClick={() => setPatientSex("female")}
                      style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem", borderRadius: "0.25rem", border: "1px solid var(--border-inner)" }}
                    >
                      Female
                    </button>
                    <button 
                      type="button" 
                      className={`tab-btn ${patientSex === "male" ? "active" : ""}`}
                      onClick={() => setPatientSex("male")}
                      style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem", borderRadius: "0.25rem", border: "1px solid var(--border-inner)" }}
                    >
                      Male
                    </button>
                  </div>
                </div>

                {/* Smoking Checkbox */}
                <div className="switch-control-row" style={{ marginBottom: "0.75rem" }}>
                  <div className="switch-label-group">
                    <span className="switch-title">Active Tobacco Smoker</span>
                    <span className="switch-subtitle">Regular smoking history increases Framingham multiplier</span>
                  </div>
                  <label className="toggle-switch">
                    <input 
                      type="checkbox" 
                      checked={isSmoker}
                      onChange={(e) => setIsSmoker(e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>

                {/* Diabetes Checkbox */}
                <div className="switch-control-row" style={{ marginBottom: "0.75rem" }}>
                  <div className="switch-label-group">
                    <span className="switch-title">Diabetic Diagnosis</span>
                    <span className="switch-subtitle">Diagnosed Type 1 or Type 2 Diabetes status</span>
                  </div>
                  <label className="toggle-switch">
                    <input 
                      type="checkbox" 
                      checked={isDiabetic}
                      onChange={(e) => setIsDiabetic(e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>

                {/* BP Medication Checkbox */}
                <div className="switch-control-row" style={{ marginBottom: "1rem" }}>
                  <div className="switch-label-group">
                    <span className="switch-title">Hypertension Treatment</span>
                    <span className="switch-subtitle">Active medication for high blood pressure control</span>
                  </div>
                  <label className="toggle-switch">
                    <input 
                      type="checkbox" 
                      checked={bpTreated}
                      onChange={(e) => setBpTreated(e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>

                {/* 4. CARDIOVASCULAR HISTORY */}
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

              {/* Vitals Recovery Simulator Panel */}
              {prediction && (
                <div className="simulator-panel">
                  <div style={{ fontSize: "0.8rem", fontWeight: "bold", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
                    Simulate Recovery Journey
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button 
                      type="button" 
                      className="btn-secondary" 
                      onClick={startSimulation}
                      disabled={isSimulating}
                      style={{ flex: 1, justifyContent: "center", fontSize: "0.8rem", padding: "0.5rem" }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: "0.25rem" }}>
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      {isSimulating ? "Simulating Journey..." : "Start Treatment Journey"}
                    </button>
                    {simulationOriginalVitals && (
                      <button 
                        type="button" 
                        className="btn-secondary" 
                        onClick={resetSimulation}
                        style={{ fontSize: "0.8rem", padding: "0.5rem", color: "var(--risk-critical)" }}
                      >
                        Reset Vitals
                      </button>
                    )}
                  </div>
                </div>
              )}
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
              <button 
                className={`tab-btn ${activeTab === "my_reports" ? "active" : ""}`}
                onClick={() => setActiveTab("my_reports")}
              >
                My Saved Reports ({patientLocalReports.length})
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
                  {prediction && (
                    <button 
                      className="btn-secondary" 
                      onClick={() => window.print()} 
                      style={{ marginLeft: "auto", padding: "0.35rem 0.75rem", fontSize: "0.8rem", height: "32px", display: "flex", alignItems: "center" }}
                      title="Download PDF or Print Diagnostic Report"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: "0.35rem" }}>
                        <polyline points="6 9 6 2 18 2 18 9" />
                        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                        <rect x="6" y="14" width="12" height="8" />
                      </svg>
                      Print PDF
                    </button>
                  )}
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
                      
                      {/* Dual Clinical Risk Engine View */}
                      <div style={{ display: "flex", gap: "1.25rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
                        {/* XGBoost AI Risk Shield */}
                        <div className={`risk-shield-hero ${prediction.risk_level}`} style={{ flex: 1, minWidth: "220px", marginBottom: 0 }}>
                          <div className="risk-shield-label">Aegis AI XGBoost Predictor</div>
                          <div className="risk-shield-value" style={{ fontSize: "2.2rem" }}>{prediction.risk_level}</div>
                          <div className="risk-shield-confidence">
                            {prediction.override_applied ? (
                              <span style={{ color: "var(--risk-critical)" }}>⚠️ Override Rule Engaged</span>
                            ) : (
                              <span>Confidence: {prediction.confidence_percent}%</span>
                            )}
                          </div>
                        </div>

                        {/* Framingham 10-Year Cardiovascular Risk Score */}
                        <div className={`risk-shield-hero ${prediction.framingham_risk_category}`} style={{ flex: 1, minWidth: "220px", marginBottom: 0 }}>
                          <div className="risk-shield-label">Framingham 10-Yr Cardiovascular Risk</div>
                          <div className="risk-shield-value" style={{ fontSize: "2.2rem" }}>{prediction.framingham_risk_percent}%</div>
                          <div className="risk-shield-confidence" style={{ textTransform: "uppercase", fontWeight: "bold" }}>
                            Classification: {prediction.framingham_risk_category} Risk
                          </div>
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

                      {/* Telehealth share to Doctor database (Database 1) */}
                      <div className="share-action-container" style={{ marginBottom: "1.25rem" }}>
                        {reportShared ? (
                          <div className="shared-check-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Report successfully shared with Doctor Database
                          </div>
                        ) : (
                          <button 
                            className="btn-telehealth" 
                            onClick={shareReportWithDoctor}
                            disabled={sharingLoading}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />
                            </svg>
                            {sharingLoading ? "Sharing..." : "Share Report with Doctor"}
                          </button>
                        )}
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

                      {/* SHAP waterfall chart explainer */}
                      {prediction.top_factors && prediction.top_factors.length > 0 && (
                        <div style={{ borderTop: "1px solid var(--border-inner)", paddingTop: "1.25rem" }}>
                          <h4 style={{ fontSize: "0.85rem", fontWeight: "800", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
                            Primary Physiological Risk Drivers (SHAP Waterfall)
                          </h4>
                          
                          <div style={{ marginBottom: "1rem" }}>
                            {(() => {
                              const svgWidth = 400;
                              const svgHeight = 150;
                              const paddingLeft = 110;
                              const paddingRight = 45;
                              const chartWidth = svgWidth - paddingLeft - paddingRight;
                              
                              const maxVal = Math.max(...prediction.top_factors.map(f => Math.abs(f.value || 0)), 0.1);
                              let currentX = chartWidth / 2;
                              const scale = (chartWidth / 2) / maxVal;
                              
                              const rows = prediction.top_factors.map((factor, index) => {
                                const val = factor.value || 0;
                                const barWidth = Math.abs(val) * scale;
                                const startX = val >= 0 ? currentX : currentX - barWidth;
                                const color = val >= 0 ? "var(--risk-critical)" : "var(--risk-low)";
                                
                                const row = {
                                  name: factor.feature.replace(/_/g, " "),
                                  val: val > 0 ? `+${val.toFixed(3)}` : val.toFixed(3),
                                  startX: paddingLeft + startX,
                                  width: barWidth,
                                  y: 15 + index * 38,
                                  color,
                                  isPositive: val >= 0
                                };
                                currentX = val >= 0 ? currentX + barWidth : currentX - barWidth;
                                return row;
                              });

                              return (
                                <svg width="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ backgroundColor: "var(--bg-input)", borderRadius: "8px", padding: "10px" }}>
                                  <line 
                                    x1={paddingLeft + chartWidth / 2} 
                                    y1={10} 
                                    x2={paddingLeft + chartWidth / 2} 
                                    y2={130} 
                                    stroke="var(--text-muted)" 
                                    strokeWidth="1.5" 
                                    strokeDasharray="4"
                                  />
                                  <text x={paddingLeft + chartWidth / 2} y={142} fill="var(--text-muted)" fontSize="9" textAnchor="middle">Baseline</text>

                                  {rows.map((row, index) => (
                                    <g key={index}>
                                      <text x={10} y={row.y + 12} fill="var(--text-secondary)" fontSize="10" fontWeight="bold">
                                        {row.name.length > 15 ? row.name.slice(0, 13) + "..." : row.name}
                                      </text>
                                      <rect 
                                        x={row.startX} 
                                        y={row.y} 
                                        width={row.width || 1} 
                                        height={16} 
                                        fill={row.color} 
                                        rx="3"
                                      />
                                      <text 
                                        x={row.isPositive ? row.startX + row.width + 5 : row.startX - 5} 
                                        y={row.y + 12} 
                                        fill={row.color} 
                                        fontSize="9" 
                                        fontWeight="bold" 
                                        textAnchor={row.isPositive ? "start" : "end"}
                                      >
                                        {row.val}
                                      </text>
                                    </g>
                                  ))}
                                </svg>
                              );
                            })()}
                          </div>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.5rem", fontStyle: "italic" }}>
                            Waterfall bars represent the cumulative attribution weights (SHAP values) of each physiological indicator on the final classification. Red bars increase risk; blue bars reduce risk.
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

                      {/* Clinician Signature block - Print Only */}
                      <div className="print-only-signature" style={{ display: "none", marginTop: "3rem", borderTop: "1px dashed var(--border-inner)", paddingTop: "1.5rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <div>
                            <p style={{ margin: 0, fontWeight: "bold", fontSize: "0.85rem", color: "var(--text-main)" }}>Reviewing Clinician Signature:</p>
                            <div style={{ height: "45px" }} />
                            <div style={{ borderTop: "1px solid var(--text-main)", width: "200px" }} />
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <p style={{ margin: 0, fontWeight: "bold", fontSize: "0.85rem", color: "var(--text-main)" }}>Assessment Date:</p>
                            <div style={{ height: "45px" }} />
                            <div style={{ borderTop: "1px solid var(--text-main)", width: "200px", display: "inline-block" }} />
                          </div>
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

            {/* TAB CONTAINER: LOCAL PATIENT REPORTS */}
            {activeTab === "my_reports" && (
              <section className="card">
                <div className="card-header">
                  <span className="card-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <line x1="9" y1="9" x2="15" y2="9" />
                      <line x1="9" y1="13" x2="15" y2="13" />
                    </svg>
                  </span>
                  <span className="card-title">My Saved Reports (LocalStorage)</span>
                </div>
                <div className="card-body">
                  {patientLocalReports.length === 0 ? (
                    <div className="report-empty-state">
                      <h3>No Reports Saved Yet</h3>
                      <p>Reports are automatically saved in your browser history when you evaluate vitals.</p>
                    </div>
                  ) : (
                    <div className="doctor-reports-table-wrapper">
                      <table className="reports-table">
                        <thead>
                          <tr>
                            <th>Timestamp</th>
                            <th>Vitals (Age / BMI / BP)</th>
                            <th>Risk Level</th>
                            <th>Confidence</th>
                          </tr>
                        </thead>
                        <tbody>
                          {patientLocalReports.map((item) => (
                            <tr key={item.id}>
                              <td>{item.timestamp}</td>
                              <td>
                                Age: {item.inputs.age} yrs | BMI: {item.inputs.bmi} kg/m² | BP: {item.inputs.systolicBp}/{item.inputs.diastolicBp} mmHg
                              </td>
                              <td>
                                <span className={`badge-risk ${item.prediction.risk_level}`}>
                                  {item.prediction.risk_level}
                                </span>
                              </td>
                              <td>{item.prediction.confidence_percent}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>
            )}

          </div>

        </div>
        </>
        )}
      </main>

      {/* FLOATING HEALTH CHATBOT (AegisBot) */}
      {portalMode === "patient" && (
        <>
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

          {/* AI Consultation Summary Generator Trigger */}
          {chatLog.filter(m => m.sender === "user").length > 0 && (
            <div style={{ padding: "0.5rem 1rem", borderBottom: "1px solid var(--border-inner)", backgroundColor: "var(--bg-card-header)", display: "flex", justifyContent: "center" }}>
              <button 
                type="button"
                className="btn-secondary" 
                style={{ fontSize: "0.75rem", padding: "0.35rem 0.6rem", width: "100%", justifyContent: "center", height: "30px", display: "flex", alignItems: "center" }}
                onClick={handleGenerateSummary}
                disabled={summaryLoading}
              >
                {summaryLoading ? "Generating Clinical Memo..." : "📄 Generate Consultation Memo"}
              </button>
            </div>
          )}

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
        </>
      )}

      {/* APP FOOTER */}
      <footer className="app-footer">
        <div className="footer-content">
          <p>
            AegisHealth Clinical Screening & Assessment Portal • Certified Calibration Engine. Patient observations secured locally.
          </p>
        </div>
      </footer>

      {/* CLINICIAN TRANSCRIPT VIEW MODAL */}
      {selectedChatHistory && (
        <div className="portal-selector-overlay" style={{ zIndex: 1000 }}>
          <div className="doctor-login-card" style={{ width: "500px", maxWidth: "90%", display: "flex", flexDirection: "column", maxHeight: "80vh" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-inner)", paddingBottom: "0.75rem", marginBottom: "1rem" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: "bold", margin: 0, color: "var(--text-main)" }}>Clinical Conversation Transcript</h2>
              <button 
                className="btn-secondary" 
                style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem", cursor: "pointer" }} 
                onClick={() => setSelectedChatHistory(null)}
              >
                Close
              </button>
            </div>
            
            <div className="chat-modal-messages" style={{ overflowY: "auto", flex: 1, paddingRight: "0.5rem" }}>
              {selectedChatHistory.map((msg, i) => (
                <div key={i} className={`chat-message-row ${msg.sender}`} style={{ marginBottom: "1rem", display: "flex", flexDirection: "column", alignItems: msg.sender === "user" ? "flex-end" : "flex-start" }}>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>
                    {msg.sender === "user" ? "Patient" : "AegisBot"} • {msg.time || "N/A"}
                  </div>
                  <div 
                    style={{ 
                      padding: "0.6rem 0.9rem", 
                      borderRadius: "0.75rem", 
                      fontSize: "0.85rem", 
                      lineHeight: "1.4",
                      maxWidth: "85%",
                      backgroundColor: msg.sender === "user" ? "var(--primary)" : "var(--bg-input)", 
                      color: msg.sender === "user" ? "#ffffff" : "var(--text-main)" 
                    }}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* AI CONSULTATION SUMMARY MEMO MODAL */}
      {summaryMemo && (
        <div className="portal-selector-overlay summary-memo-modal" style={{ zIndex: 1000 }}>
          <div className="doctor-login-card" style={{ width: "600px", maxWidth: "90%", display: "flex", flexDirection: "column", maxHeight: "80vh" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-inner)", paddingBottom: "0.75rem", marginBottom: "1rem" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: "bold", margin: 0, color: "var(--text-main)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                Clinical Consultation Memo
              </h2>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button 
                  className="btn-secondary" 
                  style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", cursor: "pointer", height: "28px", display: "flex", alignItems: "center" }} 
                  onClick={() => window.print()}
                >
                  Print Memo
                </button>
                <button 
                  className="btn-secondary" 
                  style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", cursor: "pointer", height: "28px", display: "flex", alignItems: "center" }} 
                  onClick={() => setSummaryMemo(null)}
                >
                  Close
                </button>
              </div>
            </div>
            
            <div className="summary-memo-body" style={{ overflowY: "auto", flex: 1, paddingRight: "0.5rem", textAlign: "left" }}>
              {renderMarkdown(summaryMemo)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
