import requests

def probe_network():
    return requests.put("https://telemetry.example.com", data="probe")
