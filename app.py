import os
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from google import genai
from dotenv import load_dotenv
from pypdf import PdfReader
import io

# Load environment variables
load_dotenv(override=True)

app = Flask(__name__, 
            static_folder='static',
            template_folder='templates')

CORS(app)

# Configuration
API_KEY = os.getenv("GOOGLE_API_KEY")

print(f"--- Backend Startup (Smart Discovery v3.1) ---")
print(f"API Key present: {bool(API_KEY)}")

client = None
MODEL_NAME = None 
current_pdf_context = "" 

if API_KEY:
    try:
        client = genai.Client(api_key=API_KEY)
        
        # DYNAMIC DISCOVERY WITH HEALTH CHECK
        print("Discovering available models and testing quotas...")
        all_models = [m.name for m in client.models.list()]
        
        # Define priorities
        priority_keywords = ["gemini-2.5-flash", "gemini-3.1-flash", "gemini-2.0-flash", "gemini-1.5-flash"]
        candidates = []
        for kw in priority_keywords:
            for m in all_models:
                if kw in m:
                    candidates.append(m)
        
        # Add any other flash models
        for m in all_models:
            if "flash" in m.lower() and m not in candidates:
                candidates.append(m)

        print(f"Candidate models: {candidates[:4]}...")

        # Test each candidate until one works
        for candidate in candidates:
            try:
                print(f"Testing {candidate}...")
                client.models.generate_content(model=candidate, contents="hi")
                MODEL_NAME = candidate
                print(f"Success! Selected ACTIVE model: {MODEL_NAME}")
                break
            except Exception as e:
                print(f"FAILED: {candidate} unavailable: {str(e)[:50]}...")
        
        if not MODEL_NAME:
            MODEL_NAME = "gemini-1.5-flash" # Absolute fallback
            print(f"WARNING: No active models found in discovery. Using static fallback: {MODEL_NAME}")
        else:
            print(f"SUCCESS: Selected ACTIVE model: {MODEL_NAME}")
            
    except Exception as e:
        print(f"Critical Startup Error: {e}")
else:
    print("CRITICAL: No API Key found in .env")

@app.route('/', methods=['GET'])
def index():
    return render_template('index.html')

@app.route('/api/upload', methods=['POST'])
def upload():
    global current_pdf_context
    if 'file' not in request.files: return jsonify({"error": "No file"}), 400
    file = request.files['file']
    if file and file.filename.lower().endswith('.pdf'):
        try:
            pdf_bytes = io.BytesIO(file.read())
            reader = PdfReader(pdf_bytes)
            text = "".join([p.extract_text() or "" for p in reader.pages])
            current_pdf_context = text.strip()
            return jsonify({"status": "success"})
        except Exception as e: return jsonify({"error": str(e)}), 500
    return jsonify({"error": "Invalid file"}), 400

@app.route('/api/clear-context', methods=['POST'])
def clear_context():
    global current_pdf_context
    current_pdf_context = ""
    return jsonify({"status": "success"})

@app.route('/api/chat', methods=['POST'])
def chat():
    global current_pdf_context
    if not client or not MODEL_NAME: return jsonify({"error": "Backend not ready"}), 500
    try:
        data = request.get_json()
        user_message = data.get('message')
        prompt = user_message
        if current_pdf_context: prompt = f"Context: {current_pdf_context}\n\nQuestion: {user_message}"

        # Generation
        try:
            response = client.models.generate_content(model=MODEL_NAME, contents=prompt)
        except Exception as e:
            # Final 404 retry logic (prefix stripping)
            if "404" in str(e).lower() and "/" in MODEL_NAME:
                short_name = MODEL_NAME.split("/")[-1]
                print(f"Chat 404 Catch: Retrying with {short_name}")
                response = client.models.generate_content(model=short_name, contents=prompt)
            else: raise e
        
        return jsonify({"response": response.text, "status": "success", "model": MODEL_NAME})
    except Exception as e:
        print(f"Chat Error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Force single-threaded for stability during discovery
    app.run(debug=True, host='0.0.0.0', port=5001, threaded=False)
