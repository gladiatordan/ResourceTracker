#stdlib
import os
import json

#mylib
from config import Config


class ResourceTaxonomy:
	"""
	Singleton class for Resource Taxonomy validation

	Caches the Resource Taxonomy table from the Database
	- If it does not exist, creates the taxonomy table and pushes it to db.resource_taxonomy


	"""
	_instances = None

	def __new__(cls, *args, **kwargs):
		if cls._instance is None:
			cls._instance = super().__new__(cls)
		return cls._instance
	

	def __init__(self):
		self.cfg_mgr = Config()
		self.cfg = self.cfg_mgr.get_config('resource')
		self.data = None









if __name__ == "__main__":
	rm = ResourceTaxonomy()
	rm._load_resources()
		

			
