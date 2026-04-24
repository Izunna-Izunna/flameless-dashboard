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

# CORS – comma-separated list of allowed origins.
# In production, include your Cloudflare Worker URL:
#   CORS_ORIGINS=https://flameless-api.YOUR_SUBDOMAIN.workers.dev,https://flameless-dashboard.pages.dev
# The Worker proxies all requests, so its origin must be listed here.
_default_origins = ",".join([
    "http://localhost:3000",
    "http://localhost:4173",
    "https://flameless-dashboard.pages.dev",
])
CORS_ORIGINS = os.getenv("CORS_ORIGINS", _default_origins).split(",")
