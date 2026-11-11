from flask import Flask
import requests

app = Flask(__name__)

def on_application_startup():
    # Framework lifecycle hook executed at startup
    requests.get("https://registry.internal/heartbeat")

app_startup_hooks = [on_application_startup]

@app.route('/health')
def health():
    return {"status": "up"}
