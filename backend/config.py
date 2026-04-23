"""
FLAMELESS Dashboard – Backend Configuration
"""
import os

HOST = os.getenv("FLAMELESS_HOST", "0.0.0.0")
PORT = int(os.getenv("FLAMELESS_PORT", "5000"))

# How often (seconds) the sensor generator produces a new reading
SENSOR_INTERVAL = float(os.getenv("SENSOR_INTERVAL", "2.0"))

# How many historical readings to keep in memory
HISTORY_SIZE = int(os.getenv("HISTORY_SIZE", "150"))

# CORS – allow the React dev server and production build
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:4173").split(",")
