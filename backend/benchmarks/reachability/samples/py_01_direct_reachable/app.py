from flask import Flask, request
import requests

app = Flask(__name__)

@app.route('/fetch', methods=['GET'])
def fetch_remote():
    target = request.args.get('url', 'https://example.com')
    resp = requests.get(target)
    return resp.text
