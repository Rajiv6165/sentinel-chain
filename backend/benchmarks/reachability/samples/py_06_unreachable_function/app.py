from flask import Flask
import requests

app = Flask(__name__)

def legacy_cleanup_job():
    # Dead function - never invoked from any entry point
    return requests.delete("https://api.internal/old-records")

@app.route('/status')
def status():
    return {"status": "healthy"}
