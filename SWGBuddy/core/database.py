"""
SWGBuddy Database Module

Provides a thread-safe Database Context for services to access PostgreSQL directly.

"""
import os
import sys
import psycopg2
import logging
from psycopg2 import pool
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager

# Local import to access the LogService queue via the standard logging mechanism if needed,
# though DatabaseContext is usually a lower-level utility.
# We will use simple print/stderr for critical DB failures to avoid circular dependency with Core.

class DatabaseContext:
	_pool = None
	_pool_pid = None  # Track which process created the pool

	@classmethod
	def initialize(cls):
		"""
		Initializes the connection pool. 
		MUST be called once at the start of each Process (Web, Validation, etc).
		"""
		if cls._pool is None:
			try:
				if cls._pool:
					cls.close() # Close existing if any
					
				# ThreadedConnectionPool allows multiple threads in Flask to share this pool safely.
				cls._pool = psycopg2.pool.ThreadedConnectionPool(
					minconn=1, 
					maxconn=20, # Allow up to 20 concurrent connections per service
					# mTLS Configuration
					host=os.getenv("SWG_DB_HOST", "127.0.0.1"),
					database=os.getenv("SWG_DB_NAME", "swgbuddy"),
					user=os.getenv("SWG_DB_USER", "swgbuddy_service"),
					password=None, # Unused due to mTLS authentication
					
					# SSL strict mode and cert paths
					sslmode="verify-full",
					sslrootcert=os.getenv("SWG_SSL_ROOT_CERT"),
					sslcert=os.getenv("SWG_SSL_CLIENT_CERT"),
					sslkey=os.getenv("SWG_SSL_CLIENT_KEY"),
					
					cursor_factory=RealDictCursor
				)
				cls._pool_pid = os.getpid()
				logging.info(f"[Database] Pool initialized for PID: {cls._pool_pid}")
			except Exception as e:
				logging.error(f"[Database] Init failed: {e}")
				raise

	@classmethod
	def close_all(cls):
		"""Closes all connections in the pool (shutdown cleanup)."""
		if cls._pool:
			cls._pool.closeall()
			cls._pool = None

	@classmethod
	def get_connection(cls):
		"""Gets a connection, resetting pool if in a new process."""
		current_pid = os.getpid()
		
		# Fork Detection: If PID changed, the pool is invalid (inherited). Reset it.
		if cls._pool_pid != current_pid:
			logging.warning(f"[Database] Fork detected (Old PID: {cls._pool_pid}, New: {current_pid}). Resetting pool.")
			cls._pool = None
			cls.initialize()

		if not cls._pool:
			cls.initialize()
			
		return cls._pool.getconn()

	@classmethod
	def return_connection(cls, conn):
		"""Safely returns a connection to the pool."""
		if cls._pool:
			try:
				cls._pool.putconn(conn)
			except Exception as e:
				logging.error(f"[Database] Error returning connection: {e}")
				# If return fails, try to close explicitly to prevent leaks
				try:
					conn.close()
				except:
					pass

	@classmethod
	@contextmanager
	def cursor(cls, commit=False):
		"""Context manager for database operations."""
		conn = None
		try:
			conn = cls.get_connection()
			# Use RealDictCursor to access columns by name
			with conn.cursor(cursor_factory=RealDictCursor) as cur:
				yield cur
				if commit:
					conn.commit()
		except Exception as e:
			if conn:
				conn.rollback()
			logging.error(f"[Database] Query Error: {e}")
			raise e
		finally:
			if conn:
				cls.return_connection(conn)

	@classmethod
	def close(cls):
		"""Closes all connections in the pool."""
		if cls._pool:
			cls._pool.closeall()
			cls._pool = None