import time
import signal
import sys
import multiprocessing
from services.logger import LogService
from services.validation import ValidationService
from services.web import WebService



class ServiceManager:
    def __init__(self):
        self.running = True
        self.processes = []
        
        # Shared Queues
        self.log_queue = multiprocessing.Queue()
        self.validation_queue = multiprocessing.Queue()

    def start(self):
        print("[Manager] Spawning Services...")

        services = [
            ("Logger", LogService, (self.log_queue,)),
            ("Validation", ValidationService, (self.validation_queue, self.log_queue)),
            ("Web", WebService, (self.validation_queue, self.log_queue))
        ]

        for name, cls, args in services:
            p = multiprocessing.Process(target=self._wrapper, args=(name, cls, args), name=name)
            p.start()
            self.processes.append(p)
            print(f"[Manager] {name} started (PID: {p.pid})")

        self._monitor()

    def _wrapper(self, name, cls, args):
        try:
            service = cls(*args)
            service.run()
        except Exception as e:
            print(f"[Manager] {name} Died: {e}")
            sys.exit(1)

    def _monitor(self):
        while self.running:
            time.sleep(1)
            # TODO - Add respawn logic here

    def stop(self, signum, frame):
        print("\n[Manager] Stopping...")
        self.running = False
        for p in self.processes:
            p.terminate()
        sys.exit(0)

if __name__ == "__main__":
    manager = ServiceManager()
    signal.signal(signal.SIGINT, manager.stop)
    manager.start()