import requests

def execute_remote_call(target_url):
    return requests.post(target_url, json={"status": "ping"})
