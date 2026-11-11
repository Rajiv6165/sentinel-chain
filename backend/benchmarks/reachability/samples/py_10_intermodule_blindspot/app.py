from flask import Flask
from service import execute_remote_call

app = Flask(__name__)

@app.route('/trigger', methods=['POST'])
def trigger():
    res = execute_remote_call("https://api.internal/webhook")
    return {"ok": True}
