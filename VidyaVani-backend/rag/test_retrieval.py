import os
import re
import argparse
import psycopg2
import time
from dotenv import load_dotenv
import google.generativeai as genai

# Load environment variables
load_dotenv()
if '__file__' in locals() or '__file__' in globals():
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))

def embed_query_with_retry(text, model="models/text-embedding-004"):
    """
    Calls the Gemini Embedding API for queries with fallback to models/gemini-embedding-001 (768-dim) 
    if models/text-embedding-004 is not found/supported.
    """
    max_retries = 5
    base_delay = 2
    current_model = model
    
    for attempt in range(max_retries):
        try:
            kwargs = {
                "model": current_model,
                "content": text,
                "task_type": "retrieval_query"
            }
            if current_model in ["models/gemini-embedding-001", "models/gemini-embedding-2"]:
                kwargs["output_dimensionality"] = 768
                
            response = genai.embed_content(**kwargs)
            return response['embedding']
        except Exception as e:
            error_str = str(e)
            if "not found" in error_str.lower() and current_model == "models/text-embedding-004":
                print(f"[FALLBACK] {current_model} not supported/found. Falling back to models/gemini-embedding-001...")
                current_model = "models/gemini-embedding-001"
                try:
                    res = genai.embed_content(
                        model=current_model,
                        content=text,
                        task_type="retrieval_query",
                        output_dimensionality=768
                    )
                    return res['embedding']
                except Exception as fallback_err:
                    print(f"[FALLBACK ERROR] Fallback failed: {fallback_err}")
                    raise fallback_err
            
            if "429" in error_str or "ResourceExhausted" in error_str or "quota" in error_str.lower():
                delay = base_delay * (2 ** attempt)
                print(f"[RATE LIMIT] Received 429. Retrying in {delay}s (Attempt {attempt+1}/{max_retries})...")
                time.sleep(delay)
            else:
                raise e
    raise RuntimeError("Failed to obtain Gemini query embedding due to persistent errors.")

def main():
    parser = argparse.ArgumentParser(description="Test pgvector retrieval from the RAG database.")
    parser.add_argument("query", help="The query string to search for")
    args = parser.parse_args()
    
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise ValueError("DATABASE_URL environment variable is not set in .env file.")
        
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable is not set in .env file.")
    genai.configure(api_key=api_key)
        
    print(f"[QUERY] Query string: '{args.query}'")
    
    # 1. Embed query
    print("[EMBED] Embedding query via Gemini API...")
    query_embedding = embed_query_with_retry(args.query)
    vector_str = "[" + ",".join(map(str, query_embedding)) + "]"
    
    # 2. Run retrieval
    print("[DB] Connecting to Postgres Database...")
    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        
        # Cosine distance operator is <=>
        # Note: We fetch the top 5 closest chunks
        cur.execute(
            """
            SELECT chunk_text, subject, chapter, grade, page_number, (embedding <=> %s) AS distance
            FROM curriculum_chunks
            ORDER BY distance ASC
            LIMIT 5
            """,
            (vector_str,)
        )
        
        rows = cur.fetchall()
        
        print("\n================ RETRIEVAL RESULTS (Top 5) ================")
        if not rows:
            print("[INFO] No matching chunks found. Make sure you have ingested some data!")
        else:
            for idx, (chunk_text, subject, chapter, grade, page_num, distance) in enumerate(rows):
                similarity = 1.0 - distance
                print(f"\n[{idx + 1}] Rank | Subject: {subject} | {chapter} (Grade {grade}) | Page: {page_num}")
                print(f"[METRIC] Cosine Distance: {distance:.4f} | Similarity: {similarity:.4f}")
                # Print a clean snippet of the chunk text
                snippet = chunk_text.replace('\n', ' ').strip()
                if len(snippet) > 300:
                    snippet = snippet[:300] + "..."
                print(f"[CONTENT] Content: {snippet}")
        print("===========================================================\n")
        
    except Exception as db_err:
        print(f"[ERROR] Database error: {db_err}")
    finally:
        if 'cur' in locals():
            cur.close()
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    main()
