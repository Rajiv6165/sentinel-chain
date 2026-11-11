from flask import Flask
from requests import get as http_get

app = Flask(__name__)

@app.route('/ping')
def ping():
    resp = http_get("https://example.com/health")
    return str(resp.status_code)
