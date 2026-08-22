import asyncio
import logging

logger = logging.getLogger("sandbox-proxy")

class ProxyServer:
    def __init__(self, host='0.0.0.0', port=0):
        self.host = host
        self.port = port # 0 means OS will assign a random free port
        self.server = None
        self.captured_domains = []
        self.running = False
        self.actual_port = None

    async def handle_client(self, reader, writer):
        try:
            request_line = await reader.readline()
            if not request_line:
                writer.close()
                return

            req_str = request_line.decode('utf-8').strip()
            parts = req_str.split()
            if len(parts) < 3:
                writer.close()
                return
            
            method, url, version = parts[0], parts[1], parts[2]
            
            domain = ""
            port = 80
            
            if method == 'CONNECT':
                host_port = url.split(':')
                domain = host_port[0]
                port = int(host_port[1]) if len(host_port) > 1 else 443
                
                self.captured_domains.append({"domain": domain, "port": port, "method": method})
                
                writer.write(b'HTTP/1.1 200 Connection Established\r\n\r\n')
                await writer.drain()
                
                try:
                    remote_reader, remote_writer = await asyncio.open_connection(domain, port)
                except Exception as e:
                    logger.error(f"Failed to connect to {domain}:{port} - {e}")
                    writer.close()
                    return
                
                await asyncio.gather(
                    self.relay(reader, remote_writer),
                    self.relay(remote_reader, writer)
                )
            else:
                if url.startswith("http://"):
                    url = url[7:]
                
                host_path = url.split('/', 1)
                host_port = host_path[0].split(':')
                domain = host_port[0]
                port = int(host_port[1]) if len(host_port) > 1 else 80
                
                self.captured_domains.append({"domain": domain, "port": port, "method": method})
                
                try:
                    remote_reader, remote_writer = await asyncio.open_connection(domain, port)
                except Exception as e:
                    logger.error(f"Failed to connect to {domain}:{port} - {e}")
                    writer.close()
                    return
                
                remote_writer.write(request_line)
                
                while True:
                    line = await reader.readline()
                    remote_writer.write(line)
                    if line == b'\r\n':
                        break
                        
                await remote_writer.drain()
                
                await asyncio.gather(
                    self.relay(reader, remote_writer),
                    self.relay(remote_reader, writer)
                )
        except Exception as e:
            pass
        finally:
            if not writer.is_closing():
                writer.close()

    async def relay(self, reader, writer):
        try:
            while True:
                data = await reader.read(4096)
                if not data:
                    break
                writer.write(data)
                await writer.drain()
        except Exception:
            pass
        finally:
            if not writer.is_closing():
                writer.close()

    async def start(self):
        self.server = await asyncio.start_server(self.handle_client, self.host, self.port)
        addr = self.server.sockets[0].getsockname()
        self.actual_port = addr[1]
        self.running = True
        logger.info(f'Serving proxy on {addr}')

    async def stop(self):
        self.running = False
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            
    def get_captured_domains(self):
        return self.captured_domains
