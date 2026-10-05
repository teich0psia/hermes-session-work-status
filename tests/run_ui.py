"""Own an ephemeral loopback server; avoid with_server.py's occupied-port false readiness."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
import runpy
import threading
from urllib.request import urlopen

root = Path(__file__).resolve().parents[1]
handler = partial(SimpleHTTPRequestHandler, directory=str(root / 'tests/harness'))
server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
worker = threading.Thread(target=server.serve_forever, daemon=True)
worker.start()
os.environ['UI_TEST_URL'] = f'http://127.0.0.1:{server.server_port}'
try:
    with urlopen(os.environ['UI_TEST_URL']) as response:
        assert b'Session Work Status' in response.read(), 'Wrong test server'
    runpy.run_path(str(root / 'tests/ui_test.py'), run_name='__main__')
finally:
    server.shutdown()
    server.server_close()
    worker.join()
    print('Owned ephemeral harness server closed')
