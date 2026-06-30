import os
import json
import datetime
import bcrypt
from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean, DateTime, Text
from sqlalchemy.orm import declarative_base, sessionmaker

# Database configuration
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'aegis_records.db')}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="doctor") # e.g. doctor, admin
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class PatientReport(Base):
    __tablename__ = "patient_reports"
    
    id = Column(Integer, primary_key=True, index=True)
    # Demographics and Vitals
    age = Column(Float, nullable=False)
    bmi = Column(Float, nullable=False)
    systolic_bp = Column(Float, nullable=False)
    diastolic_bp = Column(Float, nullable=False)
    heart_rate = Column(Float, nullable=True)
    spo2 = Column(Float, nullable=True)
    sleep_hours = Column(Float, nullable=True)
    has_cvd = Column(Boolean, default=False)
    
    # Framingham variables
    sex = Column(String, default="female")
    is_smoker = Column(Boolean, default=False)
    is_diabetic = Column(Boolean, default=False)
    bp_treated = Column(Boolean, default=False)
    
    # Model Outputs
    risk_level = Column(String, nullable=False)
    model_prediction = Column(String, nullable=False)
    confidence_percent = Column(Float, nullable=False)
    probabilities = Column(Text, nullable=False) # JSON-string representation
    top_factors = Column(Text, nullable=True)     # JSON-string representation
    warnings = Column(Text, nullable=False)        # JSON-string representation
    chat_history = Column(Text, nullable=True)     # JSON-string representation
    
    shared_at = Column(DateTime, default=datetime.datetime.utcnow)

class DoctorLog(Base):
    __tablename__ = "doctor_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    event_type = Column(String, nullable=False) # e.g. "AUTH", "INFERENCE", "TELEHEALTH"
    message = Column(Text, nullable=False)
    username = Column(String, nullable=True)     # Who performed the action

def get_password_hash(password: str) -> str:
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    password_bytes = plain_password.encode('utf-8')
    hashed_bytes = hashed_password.encode('utf-8')
    return bcrypt.checkpw(password_bytes, hashed_bytes)

def init_db():
    Base.metadata.create_all(bind=engine)
    
    # SQLite Migrations: dynamically add columns if table already exists on disk
    import sqlite3
    db_path = os.path.join(BASE_DIR, 'aegis_records.db')
    if os.path.exists(db_path):
        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute("PRAGMA table_info(patient_reports)")
            columns = [row[1] for row in cursor.fetchall()]
            
            # Alter table blocks to guarantee backward-compatible alignment
            if "chat_history" not in columns:
                cursor.execute("ALTER TABLE patient_reports ADD COLUMN chat_history TEXT")
            if "sex" not in columns:
                cursor.execute("ALTER TABLE patient_reports ADD COLUMN sex TEXT DEFAULT 'female'")
            if "is_smoker" not in columns:
                cursor.execute("ALTER TABLE patient_reports ADD COLUMN is_smoker BOOLEAN DEFAULT 0")
            if "is_diabetic" not in columns:
                cursor.execute("ALTER TABLE patient_reports ADD COLUMN is_diabetic BOOLEAN DEFAULT 0")
            if "bp_treated" not in columns:
                cursor.execute("ALTER TABLE patient_reports ADD COLUMN bp_treated BOOLEAN DEFAULT 0")
                
            conn.commit()
            conn.close()
        except Exception as migration_error:
            print(f"Database migration exception: {migration_error}")

    # Seed default doctor account if not exists
    db = SessionLocal()
    try:
        default_doctor = db.query(User).filter(User.username == "doctor").first()
        if not default_doctor:
            hashed_pw = get_password_hash("doctor123")
            admin_user = User(
                username="doctor",
                hashed_password=hashed_pw,
                role="doctor"
            )
            db.add(admin_user)
            db.commit()
            print("Default doctor account seeded successfully (doctor / doctor123).")
    except Exception as e:
        print(f"Error seeding database: {e}")
        db.rollback()
    finally:
        db.close()
