"""

SWGBuddy Core Module

Base classes for standardizing logging, configuration, and secret redaction.
Refactored for Monolithic Multiprocessing.

"""
import json
import inspect
import sys

class Serializable:
    """
    Base class that provides string representation with secret redaction.
    """
    _redact_ = ['password', 'token', 'secret', 'key', 'client_secret']

    def __init__(self):
        pass

    def __str__(self):
        data = {}
        for k, v in self.__dict__.items():
            if k in self._redact_ or any(x in k.lower() for x in self._redact_):
                data[k] = "[REDACTED]"
            else:
                try:
                    # Test if serializable
                    json.dumps(v)
                    data[k] = v
                except (TypeError, OverflowError):
                    data[k] = str(v)
        
        return f"{self.__class__.__name__} Instance\n{json.dumps(data, indent=4, default=str)}"


class Core(Serializable):
    """
    Base class for all services.
    Routes log messages to the central LogService queue.
    """
    def __init__(self, log_queue=None):
        # Identify the child class name for the "Source" tag
        self.mod = self._get_caller_module()
        self.log_queue = log_queue
        super().__init__()

    def set_log_queue(self, log_queue):
        """Allows injecting the queue after instantiation if necessary."""
        self.log_queue = log_queue

    def _get_caller_module(self):
        """Walks the stack to find the name of the subclass."""
        try:
            frame = inspect.currentframe().f_back
            while frame:
                module = inspect.getmodule(frame)
                # Skip Core itself to find the caller
                if module and module.__name__ != __name__:
                    # Return class name (e.g. ValidationService)
                    return module.__name__.split('.')[-1]
                frame = frame.f_back
        except:
            pass
        return "Unknown"

    def _send_log(self, level, message):
        """Internal helper to route logs to the queue."""
        msg_str = str(message)
        
        if self.log_queue:
            try:
                self.log_queue.put({
                    "level": level,
                    "source": self.mod,
                    "msg": msg_str
                })
            except Exception as e:
                # Fallback to stderr if queue is broken
                print(f"[Core] Queue Error: {e} | [{level}] [{self.mod}] {msg_str}", file=sys.stderr)
        else:
            # Fallback for standalone scripts / testing
            print(f"[{level}] [{self.mod}] {msg_str}")

    # Standardized Log Wrappers
    def debug(self, message):
        self._send_log("DEBUG", message)

    def info(self, message):
        self._send_log("INFO", message)

    def warning(self, message):
        self._send_log("WARNING", message)

    def error(self, message):
        self._send_log("ERROR", message)

    def critical(self, message):
        self._send_log("CRITICAL", message)