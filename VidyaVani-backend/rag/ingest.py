import os
import re
import argparse
import psycopg2
import time
from dotenv import load_dotenv
# pyrefly: ignore [missing-import]
import pdfplumber
import google.generativeai as genai

# Load environment variables from local .env and parent .env
load_dotenv()
if '__file__' in locals() or '__file__' in globals():
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))

# A list of common English words to detect reversed lines
COMMON_WORDS = {'the', 'and', 'you', 'know', 'with', 'for', 'that', 'this', 'are', 'from', 
                'have', 'not', 'but', 'what', 'who', 'they', 'their', 'cell', 'life', 
                'organism', 'energy', 'water', 'food', 'plant', 'animal', 'process', 
                'stomach', 'lung', 'heart', 'oxygen', 'carbon', 'blood', 'vein', 'artery'}

def collapse_character_repetitions(text):
    """
    Collapses repeated character patterns (length >= 5) using division-by-5.
    If a character is repeated, say, 5 times, it collapses to 1.
    If repeated 10 times, it collapses to 2, etc.
    Also runs a post-processing pass to replace unrecoverable garbled references.
    """
    if not text:
        return ""
        
    rep_pattern = re.compile(r'([^\s])\1{4,}')
    
    def collapse_match(m):
        char = m.group(1)
        length = len(m.group(0))
        count = max(1, round(length / 5.0))
        return char * count
        
    def process_word(match):
        word = match.group(0)
        if rep_pattern.search(word):
            collapsed_word = rep_pattern.sub(collapse_match, word)
            clean_word = re.sub(r'[^\w]', '', collapsed_word)
            lower_word = clean_word.lower()
            if lower_word.startswith('f') and 'g' in lower_word and 'r' in lower_word and lower_word != 'figure':
                if lower_word not in {'finger', 'frog', 'fringe', 'forgive'}:
                    return '[Figure reference]'
            if lower_word.startswith('a') and 'c' in lower_word and 't' in lower_word and lower_word != 'activity':
                if lower_word not in {'active', 'act', 'action', 'actor', 'actual'}:
                    return '[Activity reference]'
            return collapsed_word
        return word

    return re.sub(r'[^\s]+', process_word, text)

def strip_callout_boxes(text):
    """
    Strips out "Do You Know?" and "More to Know!" callout boxes entirely.
    """
    if not text:
        return "", 0
        
    lines = text.split('\n')
    cleaned_lines = []
    in_callout = False
    removed_count = 0
    
    for line in lines:
        stripped = line.strip()
        if not stripped:
            cleaned_lines.append(line)
            continue
            
        has_reversed_keyword = any(kw in stripped for kw in ["?wonK", "eroM", "!wonK"])
        
        if has_reversed_keyword:
            if not in_callout:
                in_callout = True
                removed_count += 1
                print(f"[CALLOUT REMOVAL] Started removing callout box at line: '{stripped}'")
            continue
            
        if in_callout:
            is_exit = False
            # Check if this line marks the exit of the callout box
            if re.match(r'^\d+\.\d+(?:\.\d+)?\s+[A-Za-z]', stripped):
                is_exit = True
            elif re.match(r'^Activity\s+\d+', stripped, re.IGNORECASE):
                is_exit = True
            elif re.match(r'^Q\s*U\s*E\s*S\s*T\s*I\s*O\s*N\s*S', stripped, re.IGNORECASE):
                is_exit = True
            elif re.match(r'^(?:What\s+you\s+have\s+learnt|Exercises)', stripped, re.IGNORECASE):
                is_exit = True
            elif any(stripped.startswith(h) for h in [
                "Our pump", "Oxygen enters", "The tubes", "Maintenance by", 
                "Lymph", "Transportation in Plants", "Excretion in Plants",
                "Excretion in Human Beings"
            ]):
                is_exit = True
                
            if is_exit:
                in_callout = False
                print(f"[CALLOUT REMOVAL] Exited callout box at line: '{stripped}'")
                cleaned_lines.append(line)
            else:
                # Discard the line
                pass
        else:
            cleaned_lines.append(line)
            
    return '\n'.join(cleaned_lines), removed_count

def strip_headers_footers(text, page_num, subject_name, chapter_name):
    """
    Strips running headers/footers matching `{ChapterName} {PageNumber}` 
    or `{PageNumber} {SubjectName}` from the top or bottom lines of each page.
    """
    if not text or (not subject_name and not chapter_name):
        return text, 0
        
    lines = text.split('\n')
    cleaned_lines = list(lines)
    stripped_count = 0
    
    escaped_chapter = re.escape(chapter_name)
    escaped_subject = re.escape(subject_name)
    
    chapter_pattern = re.compile(rf'^\s*(?:{escaped_chapter}\s+\d+|\d+\s+{escaped_chapter})\s*$', re.IGNORECASE)
    subject_pattern = re.compile(rf'^\s*(?:{escaped_subject}\s+\d+|\d+\s+{escaped_subject})\s*$', re.IGNORECASE)
    
    # Check start lines (first 3 non-empty lines)
    start_indices = []
    count = 0
    for idx, line in enumerate(lines):
        if line.strip():
            start_indices.append(idx)
            count += 1
            if count >= 3:
                break
                
    # Check end lines (last 3 non-empty lines)
    end_indices = []
    count = 0
    for idx in range(len(lines) - 1, -1, -1):
        if lines[idx].strip():
            end_indices.append(idx)
            count += 1
            if count >= 3:
                break
                
    indices_to_check = set(start_indices + end_indices)
    
    for idx in sorted(indices_to_check):
        line = lines[idx]
        stripped = line.strip()
        if chapter_pattern.match(stripped) or subject_pattern.match(stripped):
            print(f"[HEADER/FOOTER STRIP] Page {page_num}: Stripping header/footer line '{stripped}'")
            cleaned_lines[idx] = ""
            stripped_count += 1
            
    return '\n'.join([line for line in cleaned_lines if line.strip()]), stripped_count

def clean_ocr_artifacts(text):
    """
    Cleans up OCR/PDF extraction artifacts.
    Specifically detects and reverses lines that were extracted backwards.
    Returns the cleaned text and the count of corrected lines.
    """
    if not text:
        return "", 0
        
    lines = text.split('\n')
    cleaned_lines = []
    reversed_count = 0
    
    for line in lines:
        stripped = line.strip()
        if not stripped:
            cleaned_lines.append(line)
            continue
            
        words = stripped.lower().split()
        original_matches = sum(1 for w in words if w in COMMON_WORDS)
        
        # Reverse character-by-character and check
        reversed_line = stripped[::-1]
        reversed_words = reversed_line.lower().split()
        reversed_matches = sum(1 for w in reversed_words if w in COMMON_WORDS)
        
        # Heuristic: If reversed text has more matches (or reversed has matches and original has 0), it is reversed.
        if (reversed_matches > original_matches) or (original_matches == 0 and reversed_matches >= 1):
            cleaned_lines.append(reversed_line)
            reversed_count += 1
            print(f"[OCR FIX] Corrected reversed line: '{stripped}' -> '{reversed_line}'")
        else:
            cleaned_lines.append(line)
            
    return '\n'.join(cleaned_lines), reversed_count

def clean_text(text, page_num):
    """
    Cleans raw text from PDF by removing NCERT headers, footers, reprint details,
    copyright notices, and standalone page numbers.
    """
    if not text:
        return ""
        
    lines = text.split('\n')
    cleaned_lines = []
    
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
            
        # 1. Remove NCERT reprint, rationalisation & publishing statements
        if re.search(r'\b(?:reprint|rationalised|rationalized|edition|published|printed|preface|foreword)\b', stripped, re.IGNORECASE):
            continue
            
        # 2. Remove year ranges (e.g. 2021-22, 2022-23, 2005–06)
        if re.search(r'\b\d{4}[-\u2013\u2014]\d{2,4}\b', stripped):
            continue
            
        # 3. Remove standalone page numbers (e.g. '123' if it's close to actual page number, or single digits)
        if stripped.isdigit():
            val = int(stripped)
            if abs(val - page_num) < 15 or val < 5:
                continue
                
        # 4. Remove standard NCERT copyright / rights statement
        if '© ncert' in stripped.lower() or 'not to be republished' in stripped.lower():
            continue
            
        cleaned_lines.append(line)
        
    return '\n'.join(cleaned_lines)

def detect_headings(line):
    """
    Detects if a line is a subsection heading (e.g., '4.1 Photosynthesis', 'Chapter 4', '13.2.1 Cell').
    Also detects title-case short lines under 8 words.
    """
    stripped = line.strip()
    if not stripped:
        return False
        
    # Pattern 1: Numbered headings (e.g., 5.4.1 Transportation in Human Beings)
    if re.match(r'^\d+\.\d+(?:\.\d+)?\s+[A-Za-z]', stripped):
        if len(stripped.split()) <= 12 and len(stripped) <= 80:
            return True
            
    # Pattern 2: Chapter-level headings (e.g., "Chapter 5" or "CHAPTER 5")
    if re.match(r'^(?:chapter|CHAPTER)\s+\d+', stripped, re.IGNORECASE):
        return True
        
    # Pattern 3: Standalone Title Case short lines without ending periods (e.g. "What is Respiration?")
    if len(stripped.split()) <= 8 and len(stripped) <= 60 and not stripped.endswith('.'):
        words = [w for w in stripped.split() if w.isalpha()]
        if words:
            title_case_words = sum(1 for w in words if w[0].isupper() or w.lower() in {'in', 'of', 'and', 'the', 'for', 'a', 'an', 'to', 'by', 'is'})
            if title_case_words / len(words) >= 0.8:
                return True
                
    return False

def chunk_pdf(pdf_path, subject_name="", chapter_name=""):
    """
    Extracts text page by page, cleans it, and splits it into logical chunks.
    Groups content under subsection headings. Merges tiny sections, and splits long sections.
    """
    print(f"[INFO] Opening PDF: {pdf_path}")
    
    all_pages_data = []
    failed_pages = []
    total_reversed_corrected = 0
    total_callouts_removed = 0
    total_headers_footers_removed = 0
    
    with pdfplumber.open(pdf_path) as pdf:
        for idx, page in enumerate(pdf.pages):
            page_num = idx + 1
            try:
                raw_text = page.extract_text()
                if not raw_text:
                    failed_pages.append(page_num)
                    continue
                
                # 1. Callout Box Removal
                cleaned_callouts, callout_count = strip_callout_boxes(raw_text)
                total_callouts_removed += callout_count
                
                # 2. Running Header/Footer Stripping
                cleaned_headers, hf_count = strip_headers_footers(cleaned_callouts, page_num, subject_name, chapter_name)
                total_headers_footers_removed += hf_count
                
                # 3. Collapse character repetitions
                cleaned_rep = collapse_character_repetitions(cleaned_headers)
                
                # 4. OCR Clean up (reversing backward lines if any remain)
                cleaned_ocr, rev_count = clean_ocr_artifacts(cleaned_rep)
                total_reversed_corrected += rev_count
                
                # 5. Boilerplate Clean up
                cleaned = clean_text(cleaned_ocr, page_num)
                if cleaned.strip():
                    all_pages_data.append((cleaned, page_num))
            except Exception as e:
                print(f"[WARNING] Failed to extract page {page_num}: {e}")
                failed_pages.append(page_num)
                
    if not all_pages_data:
        raise ValueError("Could not extract any clean text from the PDF file.")
        
    # Group text into logical sections based on headings
    sections = []
    current_section = {
        'heading': 'Introduction',
        'lines': [],
        'page_number': all_pages_data[0][1],
        'is_fallback': True
    }
    
    for text, page_num in all_pages_data:
        lines = text.split('\n')
        for line in lines:
            if detect_headings(line):
                print(f"[HEADING DETECTED] Page {page_num}: '{line.strip()}'")
                if current_section['lines']:
                    sections.append(current_section)
                current_section = {
                    'heading': line.strip(),
                    'lines': [],
                    'page_number': page_num,
                    'is_fallback': False
                }
            else:
                if line.strip():
                    current_section['lines'].append(line)
                    
    # Add final section
    if current_section['lines']:
        sections.append(current_section)
        
    # Merge tiny sections (under 110 words / ~150 tokens) to preserve context
    merged_sections = []
    i = 0
    while i < len(sections):
        curr = sections[i]
        curr_text = "\n".join(curr['lines']).strip()
        curr_word_count = len(curr_text.split())
        
        if curr_word_count < 110:
            if i + 1 < len(sections):
                next_sec = sections[i + 1]
                heading_prefix = [f"=== {curr['heading']} ==="] if not curr['is_fallback'] else []
                next_sec['lines'] = heading_prefix + curr['lines'] + ["\n"] + next_sec['lines']
                next_sec['page_number'] = min(curr['page_number'], next_sec['page_number'])
                print(f"[MERGE] Section '{curr['heading']}' ({curr_word_count} words) was too small. Merged into next section '{next_sec['heading']}'.")
            elif merged_sections:
                prev_sec = merged_sections[-1]
                heading_prefix = [f"=== {curr['heading']} ==="] if not curr['is_fallback'] else []
                prev_sec['lines'] = prev_sec['lines'] + ["\n"] + heading_prefix + curr['lines']
                print(f"[MERGE] Last section '{curr['heading']}' ({curr_word_count} words) was too small. Merged into previous section '{prev_sec['heading']}'.")
            else:
                merged_sections.append(curr)
        else:
            merged_sections.append(curr)
        i += 1
        
    # Chunk long sections and prepend headings
    final_chunks = []
    heading_chunks_count = 0
    fallback_chunks_count = 0
    
    for sec in merged_sections:
        sec_text = "\n".join(sec['lines']).strip()
        words = sec_text.split()
        
        if sec['is_fallback']:
            # Fallback sliding window: max 300 words (~400 tokens), 40 words (~50 tokens) overlap
            max_w, overlap = 300, 40
            i = 0
            while i < len(words):
                chunk_words = words[i:i + max_w]
                chunk_text = ' '.join(chunk_words)
                final_chunks.append((chunk_text, sec['page_number'], True))
                fallback_chunks_count += 1
                i += (max_w - overlap)
        else:
            # Heading-based window: max 500 words (~650 tokens), 75 words (~100 tokens) overlap
            max_w, overlap = 500, 75
            i = 0
            sub_idx = 0
            while i < len(words):
                chunk_words = words[i:i + max_w]
                chunk_body = ' '.join(chunk_words)
                
                # Prepend heading context
                heading_ctx = f"[{sec['heading']}] (Continued)\n\n" if sub_idx > 0 else f"[{sec['heading']}]\n\n"
                chunk_text = heading_ctx + chunk_body
                
                final_chunks.append((chunk_text, sec['page_number'], False))
                heading_chunks_count += 1
                sub_idx += 1
                i += (max_w - overlap)
                
    return final_chunks, failed_pages, total_reversed_corrected, heading_chunks_count, fallback_chunks_count, total_callouts_removed, total_headers_footers_removed

def embed_text_with_retry(text, model="models/text-embedding-004", task_type="retrieval_document"):
    """
    Calls the Gemini Embedding API with fallback to models/gemini-embedding-001 (768-dim) 
    if models/text-embedding-004 is not found or not supported.
    """
    max_retries = 5
    base_delay = 2
    current_model = model
    
    for attempt in range(max_retries):
        try:
            kwargs = {
                "model": current_model,
                "content": text,
                "task_type": task_type
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
                        task_type=task_type,
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
    raise RuntimeError("Failed to obtain Gemini embedding due to persistent errors.")

def main():
    parser = argparse.ArgumentParser(description="Ingest NCERT PDF chapters into PostgreSQL RAG database.")
    parser.add_argument("--pdf_path", required=True, help="Path to the NCERT chapter PDF file")
    parser.add_argument("--subject", required=True, help="Subject (e.g. Science, Biology, History)")
    parser.add_argument("--chapter", required=True, help="Chapter Name or number (e.g. Photosynthesis, Chapter 4)")
    parser.add_argument("--grade", type=int, required=True, help="Target grade level (e.g. 7, 10)")
    
    args = parser.parse_args()
    
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise ValueError("DATABASE_URL environment variable is not set in .env file.")
        
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable is not set in .env file.")
    genai.configure(api_key=api_key)
        
    # 1. Extraction and Chunking
    try:
        chunks, failed_pages, total_reversed_corrected, heading_chunks, fallback_chunks, total_callouts_removed, total_headers_footers_removed = chunk_pdf(
            args.pdf_path, args.subject, args.chapter
        )
    except Exception as e:
        print(f"[ERROR] Error extracting PDF: {e}")
        return
        
    # 2. Embedding Model Setup & Call
    print(f"[EMBED] Generating embeddings for {len(chunks)} chunks via Gemini API...")
    embeddings = []
    for idx, (chunk_text, page_num, is_fallback) in enumerate(chunks):
        print(f"[EMBED] Embedding chunk {idx+1}/{len(chunks)} (Page {page_num})...")
        emb = embed_text_with_retry(chunk_text, task_type="retrieval_document")
        embeddings.append(emb)
        time.sleep(1.5) # rate limit safety delay
    
    # 3. Database connection and storage
    print("[DB] Connecting to Postgres Database...")
    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        
        # Start transaction: Delete existing rows first to avoid duplicates on re-run
        print(f"[DB] Deleting existing entries for {args.subject} | {args.chapter} | Grade {args.grade}...")
        cur.execute(
            """
            DELETE FROM curriculum_chunks 
            WHERE subject = %s AND chapter = %s AND grade = %s
            """,
            (args.subject, args.chapter, args.grade)
        )
        
        # Insert new chunks
        print("[DB] Saving chunks to Postgres table 'curriculum_chunks'...")
        inserted_count = 0
        for idx, (chunk_text, page_num, is_fallback) in enumerate(chunks):
            emb = embeddings[idx]
            # Pass vector as a string format list to psycopg2
            vector_str = "[" + ",".join(map(str, emb)) + "]"
            
            cur.execute(
                """
                INSERT INTO curriculum_chunks (subject, chapter, grade, chunk_text, page_number, embedding)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (args.subject, args.chapter, args.grade, chunk_text, page_num, vector_str)
            )
            inserted_count += 1
            
        conn.commit()
        print("[SUCCESS] Database transaction committed successfully!")
        
    except Exception as db_err:
        print(f"[ERROR] Database error: {db_err}")
        if 'conn' in locals() and conn:
            try:
                conn.rollback()
            except:
                pass
        return
    finally:
        if 'cur' in locals() and cur:
            try:
                cur.close()
            except:
                pass
        if 'conn' in locals() and conn:
            try:
                conn.close()
            except:
                pass

    # Rebuild/reindex ivfflat index to recalculate centroids based on new data
    try:
        print("[INFO] Reindexing table 'curriculum_chunks' to update ivfflat centroids...")
        reindex_conn = psycopg2.connect(db_url)
        reindex_conn.autocommit = True
        reindex_cur = reindex_conn.cursor()
        reindex_cur.execute("REINDEX TABLE curriculum_chunks;")
        reindex_cur.close()
        reindex_conn.close()
        print("[SUCCESS] Reindexing complete!")
    except Exception as reindex_err:
        print(f"[WARNING] Reindexing warning: {reindex_err}")
            
    # Calculate stats for summary
    total_words = sum(len(c[0].split()) for c in chunks)
    avg_words = total_words / len(chunks) if chunks else 0
    
    print("\n================ INGESTION SUMMARY ================")
    print(f"[SUCCESS] Total chunks created: {len(chunks)}")
    print(f"[INFO] Chunks created via heading-detection: {heading_chunks}")
    print(f"[INFO] Chunks created via fallback token-splitting: {fallback_chunks}")
    print(f"[INFO] Average chunk size: {avg_words:.1f} words")
    print(f"[INFO] OCR reversed lines corrected: {total_reversed_corrected}")
    print(f"[INFO] Sidebar callout boxes removed: {total_callouts_removed}")
    print(f"[INFO] Running headers/footers stripped: {total_headers_footers_removed}")
    if failed_pages:
        print(f"[WARNING] Failed pages that could not be extracted: {failed_pages}")
    else:
        print("[SUCCESS] All pages extracted cleanly!")
    print(f"[DB] Successfully stored {inserted_count} records in PostgreSQL.")
    print("===================================================\n")


if __name__ == "__main__":
    main()
