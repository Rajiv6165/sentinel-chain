from flask import Flask
import requests

app = Flask(__name__)

def perform_post_dispatch(target_url):
    return requests.post(target_url, json={"status": "ping"})

@app.route('/trigger', methods=['POST'])
def trigger():
    res = perform_post_dispatch("https://api.internal/webhook")
    return {"ok": True}
