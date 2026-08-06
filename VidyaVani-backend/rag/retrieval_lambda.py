import json
import os
import urllib.request
import urllib.error
import urllib.parse
import pg8000.native

GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
DATABASE_URL = os.environ["DATABASE_URL"]

def parse_db_url(url):
    parsed = urllib.parse.urlparse(url)
    return {
        "user": parsed.username,
        "password": parsed.password,
        "host": parsed.hostname,
        "port": parsed.port or 5432,
        "database": parsed.path.lstrip("/")
    }

def embed_query(text):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key={GEMINI_API_KEY}"
    payload = {
        "model": "models/gemini-embedding-001",
        "content": {"parts": [{"text": text}]},
        "task_type": "retrieval_query",
        "output_dimensionality": 768
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        result = json.loads(resp.read().decode("utf-8"))
        return result["embedding"]["values"]

def lambda_handler(event, context):
    conn = None
    try:
        body = json.loads(event.get("body", "{}")) if isinstance(event.get("body"), str) else event
        query = body.get("query")
        top_k = body.get("top_k", 5)
        subject_filter = body.get("subject")
        grade_filter = body.get("grade")

        if not query:
            return _response(400, {"error": "Missing 'query' field"})

        query_embedding = embed_query(query)
        vector_str = "[" + ",".join(map(str, query_embedding)) + "]"

        db_config = parse_db_url(DATABASE_URL)
        conn = pg8000.native.Connection(
            user=db_config["user"],
            password=db_config["password"],
            host=db_config["host"],
            port=db_config["port"],
            database=db_config["database"],
            ssl_context=True
        )

        sql = """
            SELECT chunk_text, subject, chapter, grade, page_number,
                   (embedding <=> :vec) AS distance
            FROM curriculum_chunks
            WHERE 1=1
        """
        params = {"vec": vector_str}
        if subject_filter:
            sql += " AND subject = :subject"
            params["subject"] = subject_filter
        if grade_filter:
            sql += " AND grade = :grade"
            params["grade"] = grade_filter
        sql += " ORDER BY distance ASC LIMIT :top_k"
        params["top_k"] = top_k

        rows = conn.run(sql, **params)

        chunks = [
            {
                "text": r[0],
                "subject": r[1],
                "chapter": r[2],
                "grade": r[3],
                "page": r[4],
                "similarity": round(1 - r[5], 4)
            }
            for r in rows
        ]

        return _response(200, {"query": query, "chunks": chunks})

    except urllib.error.HTTPError as e:
        return _response(502, {"error": f"Gemini API error: {e.read().decode()}"})
    except Exception as e:
        return _response(500, {"error": str(e)})
    finally:
        if conn:
            conn.close()

def _response(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body)
    }