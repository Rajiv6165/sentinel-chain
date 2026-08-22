import docker
import os
import uuid
import asyncio
import time
from utils.proxy import ProxyServer

def get_current_container_network(client):
    try:
        hostname = os.environ.get('HOSTNAME')
        if not hostname:
            return None
        container = client.containers.get(hostname)
        networks = container.attrs['NetworkSettings']['Networks']
        if networks:
            return list(networks.keys())[0]
    except Exception:
        pass
    return None

def get_current_container_ip(client, network_name):
    try:
        hostname = os.environ.get('HOSTNAME')
        container = client.containers.get(hostname)
        return container.attrs['NetworkSettings']['Networks'][network_name]['IPAddress']
    except Exception:
        return 'host.docker.internal' # fallback for local development without compose

async def run_sandbox_install(ecosystem, package_name, version=None):
    client = docker.from_env()
    
    # Start proxy
    proxy = ProxyServer(host='0.0.0.0', port=0)
    await proxy.start()
    
    network_name = get_current_container_network(client)
    proxy_ip = 'host.docker.internal'
    if network_name:
        proxy_ip = get_current_container_ip(client, network_name)
    else:
        # If not running in docker, use host network
        pass

    proxy_url = f"http://{proxy_ip}:{proxy.actual_port}"
    
    env_vars = {
        'http_proxy': proxy_url,
        'https_proxy': proxy_url,
        'HTTP_PROXY': proxy_url,
        'HTTPS_PROXY': proxy_url,
    }
    
    image = 'node:18-slim' if ecosystem == 'npm' else 'python:3.11-slim'
    
    pkg_str = f"{package_name}@{version}" if version and ecosystem == 'npm' else \
              f"{package_name}=={version}" if version and ecosystem == 'pypi' else \
              package_name

    cmd = f"npm install {pkg_str} --ignore-scripts=false" if ecosystem == 'npm' else \
          f"pip install {pkg_str}"
          
    # We wrap the command in strace to catch executed processes, 
    # but we need to install strace first or use a custom image.
    # For now, let's just do a plain install, we'll add strace later if needed.
    # The prompt says: "Run the installation command wrapped in strace ... to log child processes"
    # To do that, we can run a shell script in the container:
    # apt-get update && apt-get install -y strace && strace -f -e trace=execve npm install ...
    
    full_cmd = f"apt-get update && apt-get install -y strace && strace -f -e trace=execve -o /tmp/strace.log {cmd}"
    
    container = client.containers.run(
        image,
        entrypoint="bash",
        command=["-c", full_cmd],
        environment=env_vars,
        network=network_name,
        cap_add=["SYS_PTRACE"],
        security_opt=["seccomp=unconfined"],
        detach=True,
        mem_limit="512m",
    )
    
    # Wait for completion or timeout
    timeout = 60
    start_time = time.time()
    exit_code = -1
    
    while time.time() - start_time < timeout:
        container.reload()
        if container.status == 'exited':
            exit_code = container.attrs['State']['ExitCode']
            break
        await asyncio.sleep(1)
        
    if container.status != 'exited':
        container.kill()
        exit_code = -1 # timeout
        
    # Get filesystem changes
    diffs = container.diff() or []
    
    # Get strace logs
    strace_logs = ""
    try:
        bits, stat = container.get_archive('/tmp/strace.log')
        import tarfile
        import io
        file_obj = io.BytesIO(b"".join(b for b in bits))
        tar = tarfile.open(fileobj=file_obj)
        member = tar.getmembers()[0]
        f = tar.extractfile(member)
        strace_logs = f.read().decode('utf-8', errors='ignore')
    except Exception as e:
        pass
        
    container.remove()
    
    await proxy.stop()
    captured_network = proxy.get_captured_domains()
    
    return {
        "exit_code": exit_code,
        "fs_diffs": diffs,
        "network": captured_network,
        "strace": strace_logs
    }
