"""

Core module for SWGBuddy

Contains base classes for standardizing logging, configuration, and secret redaction.
"""
# stdlib
import json
import inspect
import logging
import textwrap


class Serializable:
    """
    Base class that provides string representation with secret redaction.
    Define _redact_ list in child classes to scrub specific attributes from logs.
    """
    _redact_ = ['password', 'token', 'secret', 'key', 'client_secret']

    def __init__(self):
        pass

    def __str__(self):
        # Produces a safe string representation of the instance
        data = {}
        for k, v in self.__dict__.items():
            if k in self._redact_ or any(x in k.lower() for x in self._redact_):
                data[k] = "[REDACTED]"
            else:
                # Handle non-serializable objects gracefully
                try:
                    # Test if serializable
                    json.dumps(v)
                    data[k] = v
                except (TypeError, OverflowError):
                    data[k] = str(v)
        
        return f"{self.__class__.__name__} Instance\n{json.dumps(data, indent=4, default=str)}"


class Core(Serializable):
    """
    Base class for all services and managers.
    Provides standardized logging access.
    """
    def __init__(self):
        # Figure out which module called us
        self.mod = self._get_caller_module()
        # Get logger
        self.logger = logging.getLogger(self.mod) if self.mod else logging.getLogger()
        super().__init__()

    def _get_caller_module(self):
        frame = inspect.currentframe().f_back
        module = inspect.getmodule(frame)
        return module.__name__ if module else "Unknown"

    # Standardized Log Wrappers
    def debug(self, message):
        self.logger.debug(message)

    def info(self, message):
        self.logger.info(message)

    def warning(self, message):
        self.logger.warning(message)

    def error(self, message):
        self.logger.error(message)

    def critical(self, message):
        self.logger.critical(message)