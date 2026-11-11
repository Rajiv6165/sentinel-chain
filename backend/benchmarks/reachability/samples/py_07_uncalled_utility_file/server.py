from flask import Flask

app = Flask(__name__)

@app.route('/info')
def info():
    return {"version": "1.0"}
