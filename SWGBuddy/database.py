"""

Database module


Currently supports the following databases:

- PostgreSQL (psycopg2)


"""
#3rdparty
import psycopg2

#mylib
from config import Config


class DatabaseContextConfigException(Exception):
	pass

class DatabaseDriverMissingException(Exception):
	pass


class DatabaseContext:
	"""
	
	Class containing connection context for a database
	

	"""
	DRIVERS = {
		"postgres": psycopg2
	}

	def __init__(self, db=""):
		self.db = db
		self.conn = None
		self.config = Config().get_config("database")
		
	def _connect(self):
		# TODO - Implement grabbing pertinent values from config module
		# TODO - Implement connection context on a per-driver basis
		pass
		if not self.db:
			raise DatabaseContextConfigException(f"No Database config found for {self.db}")

	def _disconnect(self):
		pass

	def _write_query(self, query, fetch_result=False, multi=False):
		result = None
		# TODO - Implement submit query on a per-driver basis
		if not self.conn:
			self._connect()

		return result