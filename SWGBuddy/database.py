"""

Database module


Currently supports the following databases:

- PostgreSQL (psycopg2)


"""
#3rdparty
import psycopg2
from psycopg2.extras import RealDictCursor

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
		self.config = Config().get_config("database")[self.db]
		
	def __enter__(self):
		"""Entry point for 'with' statement"""
		self._connect()
		return self
	
	def __exit__(self, exc_type, exc_val, exc_tb):
		"""Exit point for the 'with' statement, handles commits and rollbacks."""
		if exc_type:
			if self.conn:
				self.conn.rollback() # rolls back on error
		else:
			if self.conn:
				self.conn.commit() # commit on success
		self._disconnect()

	def _connect(self):
		if self.db not in self.DRIVERS:
			raise DatabaseDriverMissingException(f"Driver for {self.db} is not implemented!")
		
		if not self.db_config:
			raise DatabaseContextConfigException(f"No Database config found for {self.db}")
		
		try:
			if self.db == "postgres":
				self.conn = self.DRIVERS["postgres"].connect(**self.db_config)
		except Exception as e:
			print(f"Failed to connect to {self.db}: {e}")
			raise

	def _disconnect(self):
		if self.conn:
			self.conn.close()
			self.conn = None

	def execute_query(self, query, params=None, fetch_result=True):
		if not self.conn:
			self._connect()
		
		with self.conn.cursor(cursor_factor=RealDictCursor) as cur:
			cur.execute(query, params)
			if fetch_result:
				return cur.fetchall()
			return None