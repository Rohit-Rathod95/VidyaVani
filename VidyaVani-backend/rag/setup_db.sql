-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop table if existing table has incompatible dimensions (e.g. 384 instead of 768)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_name = 'curriculum_chunks'
    ) THEN
        IF (
            SELECT atttypmod 
            FROM pg_attribute 
            WHERE attrelid = 'curriculum_chunks'::regclass AND attname = 'embedding'
        ) != 768 THEN
            DROP TABLE curriculum_chunks CASCADE;
        END IF;
    END IF;
END $$;

-- Create curriculum_chunks table
CREATE TABLE IF NOT EXISTS curriculum_chunks (
    id SERIAL PRIMARY KEY,
    subject TEXT NOT NULL,
    chapter TEXT NOT NULL,
    grade INTEGER NOT NULL,
    board TEXT NOT NULL DEFAULT 'NCERT',
    chunk_text TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    embedding VECTOR(768) NOT NULL
);

-- Create an ivfflat index for faster cosine similarity searches
CREATE INDEX IF NOT EXISTS curriculum_chunks_embedding_idx 
ON curriculum_chunks USING ivfflat (embedding vector_cosine_ops);
