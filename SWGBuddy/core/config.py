"""

Config module for SWGBuddy


"""

#stdlib
import os
import json
import threading
import datetime

#3rdparty
from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

#mylib
from core.core import Core, Serializable



class Config(Core, Serializable, FileSystemEventHandler):
	"""
	
	Singleton instance which monitors and controls 

	- reads the cwd/config directory and loads it into memory in dictionary format
	- we keep it stored in memory because the reads are faster and this project is small enough that the footprint is negligible
	- directories found within the "configs" directory are treated as keys and parsed recursively by directory name
	
	- Example if directory looked like this

	configs/
			battlefields/
						config1.json
						config2.json
						config3.json
			resources/
						config1.json
						config2.json
			core.json
	
	Config would read like this

	self.data = {

		"battlefields": {
			"config1": {},
			"config2": {},
			"config3": {},

		},

		"resources": {
			"config1": {},
			"config2": {},

		},

		"core": {},
	}
	
	"""
	_instance = None

	def __new__(cls, *args, **kwargs):
		if cls._instance is None:
			cls._instance = super().__new__(cls)
		return cls._instance


	def __init__(self, cfg_dir):
		super().__init__()
		self.cfg_dir = cfg_dir

		# load the config for the first time
		self._load_config(self.__dict__, self.cfg_dir)

		# TODO - implement watchdog for config file changes
		pass


	def _load_config(self, pos, fp):
		# TODO - implement this
		pass


	def get(self, cfg: str) -> any | None:
		# attempts to get the value found at specified 'cfg'
		# uses '.' delimiter to denote hierarchy
		# returns None if KeyError is raised
		result = None
		try:
			if "." in cfg:
				keys = cfg.split(".")
				pos = self.__dict__[keys[0]]
	
				for k in keys[1:]:
					pos = pos[k]
				result = pos
			else:
				result = self.__dict__[cfg]
		except KeyError:
			self.warning(f"f{self.__class__.__name__} looking for config which does not exist -> {cfg}")

		return result
	

	def _get_cfg_details(self, event):
		# returns the name of the config
		cfg_name = os.path.splitext(os.path.basename(event.src_path))[0]
		cfg_keys = os.path.splitext(event.src_path)[-1].split(self.cfg_dir)[-1].split(os.sep)[1:]
		return cfg_name, cfg_keys
	

	def _update_config(self, cfg_name, cfg_keys):
		# determine where in our config this is supposed to go
		pos = self.__dict__
		for k in cfg_keys:
			pos = pos[k.replace(".json", "")]

		# finally, update the data
		self.debug(f"Previous Config -> {pos}")
		pos.update(cfg_data)


	def on_modified(self, event):
		# config file was modified or created, we need to load the modified config into memory
		cfg_name, cfg_keys = self._get_cfg_details(event)
		timestamp = datetime.datetime.strftime(datetime.datetime.now(), self.get("core.logging.datetime_format"))
		self.debug(f"{cfg_name} created or modified at {timestamp}, loading this new config")
		cfg_data = json.load(event.src_path)
		self._update_config(cfg_name, cfg_keys)