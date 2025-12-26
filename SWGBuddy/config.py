#stdlib
import os
import json

#3rdparty
from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer


class Config(FileSystemEventHandler):
	"""
	Singleton Configuration Manager
	
	"""
	_instance = None

	def __new__(cls, *args, **kwargs):
		if cls._instance is None:
			cls._instance = super().__new__(cls)
		return cls._instance

	def __init__(self):
		super().__init__()
		self.cfg_path = os.path.join(os.getcwd(), "config.json")
		self.config = None
		self._load_config()
		self.observer = Observer()
		self.observer.schedule(self, path=self.cfg_path, recursive=False)
		self.observer.start()
	
	def _load_config(self):
		with open(self.cfg_path, 'r') as config_file:
			self.config = json.load(config_file)
	
	def get_config(self, tag=None):
		if tag is not None:
			return self.config.get(tag)
		return self.config
	
	def on_modified(self, event: FileSystemEvent):
		if event.src_path == self.cfg_path:
			print("Configuration file changed, reloading...")
			self._load_config()