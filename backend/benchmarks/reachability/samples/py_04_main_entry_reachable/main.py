import urllib3

def run_worker():
    http = urllib3.PoolManager()
    resp = http.request('GET', 'https://example.com')
    print(resp.status)

if __name__ == '__main__':
    run_worker()
