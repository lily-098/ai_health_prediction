import os
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from database import Base, User, PatientReport, DoctorLog, get_password_hash, verify_password

TEST_DB_URL = "sqlite:///./test_aegis_records.db"

@pytest.fixture(scope="module")
def db_session():
    # Setup test database
    engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()
    
    yield session
    
    # Teardown
    session.close()
    Base.metadata.drop_all(bind=engine)
    engine.dispose() # Unlock the SQLite file for deletion
    if os.path.exists("./test_aegis_records.db"):
        os.remove("./test_aegis_records.db")

def test_password_hashing():
    pw = "mysecret123"
    hashed = get_password_hash(pw)
    assert hashed != pw
    assert verify_password(pw, hashed) is True
    assert verify_password("wrong", hashed) is False

def test_user_creation(db_session):
    user = User(username="testdoctor", hashed_password=get_password_hash("testpass"))
    db_session.add(user)
    db_session.commit()
    
    db_user = db_session.query(User).filter(User.username == "testdoctor").first()
    assert db_user is not None
    assert db_user.username == "testdoctor"
    assert verify_password("testpass", db_user.hashed_password) is True

def test_patient_report_creation(db_session):
    report = PatientReport(
        age=45.0,
        bmi=28.2,
        systolic_bp=135.0,
        diastolic_bp=85.0,
        heart_rate=78.0,
        spo2=96.0,
        sleep_hours=6.5,
        has_cvd=False,
        risk_level="Moderate",
        model_prediction="Moderate",
        confidence_percent=88.5,
        probabilities='{"Normal": 10.0, "Moderate": 88.5, "High": 1.5, "Critical": 0.0}',
        warnings='[]',
        chat_history='[{"sender": "user", "text": "I feel dizzy"}]'
    )
    db_session.add(report)
    db_session.commit()
    
    db_report = db_session.query(PatientReport).filter(PatientReport.age == 45.0).first()
    assert db_report is not None
    assert db_report.bmi == 28.2
    assert db_report.risk_level == "Moderate"
    assert "dizzy" in db_report.chat_history

def test_doctor_log_creation(db_session):
    log = DoctorLog(
        event_type="TEST",
        message="Running automated tests",
        username="tester"
    )
    db_session.add(log)
    db_session.commit()
    
    db_log = db_session.query(DoctorLog).filter(DoctorLog.event_type == "TEST").first()
    assert db_log is not None
    assert db_log.username == "tester"
    assert db_log.message == "Running automated tests"
