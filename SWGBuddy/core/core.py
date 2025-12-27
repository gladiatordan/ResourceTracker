"""

Core module for SWGBuddy

Contains base classes with helpful functions for inherited classes to utilize

"""

#stdlib
import json
import inspect
import logging
import textwrap


class Serializable:
	"""
	
	Base class which overrides certain built-in functions and adds new ones
	
	"""
	def __init__(self):
		pass

	def __str__(self):
		# produces a generic string representation of the instance's data attribute
		result = textwrap.dedent(f"""
		{self.__class__.__name__} Instance
		
		Data:
		
		""")
		for k, v in self.__dict__:
			if type(v) == type(object):
				# try converting object to a string
				v = str(v)
			result += f"{k} -> {v}\n"
		result += "\n"
		return result


class Core(Serializable):
	"""
	
	Base class containing utils to be used by other objects
	
	"""
	def __init__(self):
		# figure out which module called us
		self.mod = self._get_caller_module()
		
		# get logger, return root logger if module cannot be found
		self.logger = logging.getLogger(self.mod) if self.mod else logging.getLogger()
		super().__init__()
		# get Manager instance
		# self.mgr = Manager()


	def _get_caller_module(self):
		frame  = inspect.currentframe().f_back
		module = inspect.getmodule(frame)
		return module.__name__ if module else None

	def _log(self, message, level):
		# if logger is not attached to this instance then we don't log anything
		if not self.logger:
			return

		match level:
			case 10:
				self.logger.debug(message)
			case 20:
				self.logger.info(message)
			case 30:
				self.logger.warning(message)
			case 40:
				self.logger.error(message)
			case 50:
				self.logger.critical(message)
			case _:
				self.logger.warning(f"Level specified could not be read -> {level} | Using info level instead")
				self.logger.info(message)

	def debug(self, message):
		self._log(message, 10)

	def info(self, message):
		self._log(message, 20)

	def warning(self, message):
		self._log(message, 30)

	def error(self, message):
		self._log(message, 40)

	def critical(self, message):
		self._log(message, 50)
