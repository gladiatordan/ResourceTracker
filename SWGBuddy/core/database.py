"""
SWGBuddy Database Module

Provides a thread-safe Database Context for services to access PostgreSQL directly.

"""
import os
import sys
import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager

# Local import to access the LogService queue via the standard logging mechanism if needed,
# though DatabaseContext is usually a lower-level utility.
# We will use simple print/stderr for critical DB failures to avoid circular dependency with Core.

class DatabaseContext:
    _pool = None

    @classmethod
    def initialize(cls):
        """
        Initializes the connection pool. 
        MUST be called once at the start of each Process (Web, Validation, etc).
        """
        if cls._pool is None:
            try:
                # ThreadedConnectionPool allows multiple threads in Flask to share this pool safely.
                cls._pool = psycopg2.pool.ThreadedConnectionPool(
                    minconn=1, 
                    maxconn=20, # Allow up to 20 concurrent connections per service
                    host=os.getenv("SWG_DB_HOST", "127.0.0.1"),
                    database=os.getenv("SWG_DB_NAME", "swgbuddy"),
                    user=os.getenv("SWG_DB_USER", "swgbuddy_service"),
                    password=os.getenv("SWG_DB_PASSWORD"), 
                    sslmode="prefer", # Use 'verify-full' in production if using mTLS
                    cursor_factory=RealDictCursor
                )
            except Exception as e:
                print(f"[DatabaseContext] CRITICAL: Failed to connect to DB: {e}", file=sys.stderr)
                raise e

    @classmethod
    def close_all(cls):
        """Closes all connections in the pool (shutdown cleanup)."""
        if cls._pool:
            cls._pool.closeall()
            cls._pool = None

    @classmethod
    @contextmanager
    def connection(cls):
        """
        Context Manager: Yields a raw connection.
        Use this if you need transaction control (conn.commit(), conn.rollback()).
        """
        if cls._pool is None:
            cls.initialize()
        
        conn = cls._pool.getconn()
        try:
            yield conn
        finally:
            cls._pool.putconn(conn)

    @classmethod
    @contextmanager
    def cursor(cls, commit=False):
        """
        Context Manager: Yields a dictionary cursor.
        Automatically handles commit/rollback and putting the connection back.
        
        Usage:
            with DatabaseContext.cursor() as cur:
                cur.execute("SELECT * FROM table")
                rows = cur.fetchall()
                
        Usage (Write):
            with DatabaseContext.cursor(commit=True) as cur:
                cur.execute("INSERT INTO ...")
        """
        with cls.connection() as conn:
            try:
                with conn.cursor() as cur:
                    yield cur
                if commit:
                    conn.commit()
            except Exception:
                conn.rollback()
                raise