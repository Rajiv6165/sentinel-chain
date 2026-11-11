from flask import Flask, request
import requests  # Unused import

app = Flask(__name__)

@app.route('/calculate')
def calculate():
    a = int(request.args.get('a', 0))
    b = int(request.args.get('b', 0))
    return {"sum": a + b}
