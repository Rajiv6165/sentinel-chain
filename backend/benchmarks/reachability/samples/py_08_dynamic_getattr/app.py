from flask import Flask, request
import requests

app = Flask(__name__)

@app.route('/dispatch')
def dispatch():
    action = request.args.get('action', 'get')
    method = getattr(requests, action)
    resp = method("https://example.com/api")
    return resp.text
