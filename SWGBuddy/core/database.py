"""

Database Context module


Currently supports the following databases:

- mysql


"""
#3rdparty
import mysql

#mylib
from core import Core, Serializable
from config import Config



class DatabaseContext(Core, Serializable):
	"""
	
	Class containing connection context for a database
	

	"""
	def __init__(self, db = None):
		self.db = db
		self.conn = None
		self.config = Config()
		

	def _connect(self):
		# TODO - Implement grabbing pertinent values from config module
		host = None
		port = None
		user = None
		
		# TODO - Implement securely fetching the secret
		secret = None
		
		# TODO - Implement connection context on a per-driver basis


	def _write_query(self, query, fetch_result=False, multi=False):
		result = None
		# TODO - Implement submit query on a per-driver basis
		if not self.conn:
			self._connect()

		
		return result