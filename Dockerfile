# Use a slim Python runtime
FROM python:3.12-slim

# Set environment variables to optimize Python runtime behavior
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV MODEL_DIR=/app/model

# Set the working directory inside the container
WORKDIR /app

# Install build-essential (in case any dependencies require compiling, e.g., shap on certain platforms)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create model directory and copy model files
RUN mkdir -p /app/model
COPY health_risk_model.json /app/model/
COPY label_mapping.json /app/model/
COPY model_metrics.json /app/model/

# Copy main application code
COPY main.py .

# Expose the API port
EXPOSE 8000

# Start the FastAPI application with Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
