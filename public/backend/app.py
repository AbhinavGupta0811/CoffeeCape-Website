"""
app.py — CoffeeCape BrewBot Flask Server
Pure NLP, zero external API calls, zero API keys.
Run: python app.py
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from nlp_engine import get_response

app = Flask(__name__)
CORS(app)

@app.route("/chat", methods=["POST"])
def chat():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400

    user_message = data.get("message", "").strip()
    if not user_message:
        return jsonify({"error": "'message' field is required"}), 400

    if len(user_message) > 500:
        return jsonify({"error": "Message too long (max 500 chars)"}), 400

    result = get_response(user_message)
    return jsonify(result)

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "CoffeeCape BrewBot (NLP)"})

if __name__ == "__main__":
    print("☕ CoffeeCape BrewBot starting (NLP mode — no API key needed)")
    app.run(host="0.0.0.0", port=5000, debug=True)