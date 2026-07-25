import os
import psycopg2
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def init_database():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("[ERROR] DATABASE_URL is not set in your .env file!")
        return
        
    print("[DB] Connecting to Postgres database...")
    try:
        conn = psycopg2.connect(db_url)
        # Enable autocommit so that CREATE EXTENSION and indexing can run smoothly
        conn.autocommit = True
        cur = conn.cursor()
        
        # Read setup_db.sql file
        sql_file_path = os.path.join(os.path.dirname(__file__), 'setup_db.sql')
        if not os.path.exists(sql_file_path):
            print(f"[ERROR] Cannot find '{sql_file_path}'!")
            return
            
        print(f"[INFO] Reading SQL statements from {sql_file_path}...")
        with open(sql_file_path, 'r', encoding='utf-8') as f:
            sql_queries = f.read()
            
        print("[INFO] Executing database initialization queries...")
        cur.execute(sql_queries)
        
        print("[SUCCESS] Database schema initialized successfully! Table and pgvector index created.")
        
    except Exception as e:
        print(f"[ERROR] Error during database initialization: {e}")
    finally:
        if 'cur' in locals():
            cur.close()
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    init_database()
