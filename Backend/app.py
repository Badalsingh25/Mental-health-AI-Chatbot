import os
from flask import Flask, request, jsonify
from dotenv import load_dotenv  # type: ignore
import google.generativeai as genai
from flask_cors import CORS

# Load environment variables
load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")
MODEL_NAME = os.getenv("GEMINI_MODEL")

# Initialize Gemini AI (Ensure API key is set)
model = None
selected_model_name = None

def initialize_model():
    global model, selected_model_name
    model = None
    selected_model_name = None
    if not API_KEY:
        print("Error: GEMINI_API_KEY is missing. Please check your .env file.")
        return

    genai.configure(api_key=API_KEY)

    # 1) Try explicit env override if provided (with mapping for old names)
    if MODEL_NAME:
        normalized = MODEL_NAME.lower().replace("models/", "")
        legacy_map = {
            "gemini-pro": "gemini-1.5-flash",
            "gemini-pro-vision": "gemini-1.5-flash",
            "text-bison": "gemini-1.5-flash",
        }
        candidate_name = legacy_map.get(normalized, MODEL_NAME)
        try:
            model = genai.GenerativeModel(candidate_name)
            selected_model_name = candidate_name
            print(f"Using GEMINI_MODEL: {selected_model_name}")
            return
        except Exception as e:
            print(f"GEMINI_MODEL '{candidate_name}' failed: {e}")

    # 2) Try a set of known-good model names first (new API)
    preferred_names = [
        "gemini-1.5-flash",
        "gemini-1.5-flash-latest",
        "gemini-1.5-pro",
        "gemini-1.5-pro-latest",
    ]
    for name in preferred_names:
        try:
            model = genai.GenerativeModel(name)
            selected_model_name = name
            print(f"Selected preferred model: {selected_model_name}")
            return
        except Exception as e:
            print(f"Preferred model '{name}' failed: {e}")

    # 3) Discover available models and pick one that supports generateContent
    try:
        available = list(genai.list_models())
        # Prefer flash models
        preferred = [m for m in available if hasattr(m, 'supported_generation_methods') and 'generateContent' in getattr(m, 'supported_generation_methods', []) and 'flash' in m.name and '1.5' in m.name]
        fallback = [m for m in available if hasattr(m, 'supported_generation_methods') and 'generateContent' in getattr(m, 'supported_generation_methods', [])]
        for candidate in preferred + fallback:
            try:
                model = genai.GenerativeModel(candidate.name)
                selected_model_name = candidate.name
                print(f"Auto-selected Gemini model: {selected_model_name}")
                return
            except Exception as e:
                print(f"Failed to init model {candidate.name}: {e}")
    except Exception as e:
        print(f"Failed to list models: {e}")

initialize_model()

# Flask app setup
app = Flask(__name__)
CORS(app)  # Allow all domains to access the API

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    user_input = data.get("message", "")

    if not user_input:
        return jsonify({"error": "Message is required"}), 400
    
    def generate_with_retry() -> str:
        global model
        if model is None:
            initialize_model()
        if model is None:
            raise RuntimeError("Model not initialized. Check API key and model name.")
        try:
            response = model.generate_content(user_input)
            return getattr(response, "text", None) or "Sorry, I couldn't understand that."
        except Exception as e:
            message = str(e)
            # If the configured model is bad (404/not supported), reinitialize and try once more
            if any(s in message.lower() for s in ["404", "not found", "not supported", "unsupported"]):
                initialize_model()
                response = model.generate_content(user_input)
                return getattr(response, "text", None) or "Sorry, I couldn't understand that."
            raise

    try:
        ai_response = generate_with_retry()
    except Exception as e:
        ai_response = f"Error: {str(e)}"

    return jsonify({"response": ai_response})

if __name__ == "__main__":
    app.run(debug=True)
