import logging
import os

from flask import Flask, jsonify, request
from flask_cors import CORS

from database import check_db_health
from nlp_engine import get_response


# ── CONFIGURATION ──────────────────────────────────────────

APP_HOST = os.getenv(
    "FLASK_HOST",
    "0.0.0.0"
)

APP_PORT = int(
    os.getenv(
        "FLASK_PORT",
        "5000"
    )
)

DEBUG = os.getenv(
    "FLASK_DEBUG",
    "false"
).lower() in {
    "1",
    "true",
    "yes"
}

MAX_MESSAGE_LENGTH = int(
    os.getenv(
        "CHATBOT_MAX_MESSAGE_LENGTH",
        "500"
    )
)

MAX_REQUEST_SIZE = int(
    os.getenv(
        "CHATBOT_MAX_REQUEST_SIZE",
        "16384"
    )
)

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CHATBOT_ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if origin.strip()
]


# ── APP SETUP ───────────────────────────────────────────────

app = Flask(__name__)

app.config["MAX_CONTENT_LENGTH"] = MAX_REQUEST_SIZE

CORS(
    app,
    resources={
        r"/chat": {
            "origins": ALLOWED_ORIGINS
        },
        r"/health": {
            "origins": ALLOWED_ORIGINS
        }
    }
)


# ── LOGGING ─────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format=(
        "%(asctime)s | "
        "%(levelname)s | "
        "%(name)s | "
        "%(message)s"
    )
)

logger = logging.getLogger(
    "brewbot"
)


# ── CHAT API ────────────────────────────────────────────────

@app.route(
    "/chat",
    methods=["POST"]
)
def chat():
    """
    Receive a user message and return the chatbot response.
    """
    data = request.get_json(
        silent=True
    )

    if not isinstance(data, dict):
        return jsonify({
            "error": (
                "Request body must be "
                "a valid JSON object."
            )
        }), 400

    user_message = data.get(
        "message"
    )

    if not isinstance(
        user_message,
        str
    ):
        return jsonify({
            "error": (
                "'message' must be "
                "a string."
            )
        }), 400

    user_message = user_message.strip()

    if not user_message:
        return jsonify({
            "error": (
                "'message' field "
                "is required."
            )
        }), 400

    if len(user_message) > MAX_MESSAGE_LENGTH:
        return jsonify({
            "error": (
                f"Message too long. "
                f"Maximum length is "
                f"{MAX_MESSAGE_LENGTH} characters."
            )
        }), 400

    try:
        result = get_response(
            user_message
        )

        if not isinstance(
            result,
            dict
        ):
            logger.error(
                "NLP engine returned an invalid response."
            )

            return jsonify({
                "error": (
                    "Invalid response "
                    "from chatbot service."
                )
            }), 500

        reply = result.get(
            "reply"
        )

        if not isinstance(
            reply,
            str
        ) or not reply.strip():
            logger.error(
                "NLP engine returned an empty reply."
            )

            return jsonify({
                "error": (
                    "Chatbot returned "
                    "an empty response."
                )
            }), 500

        return jsonify(
            result
        ), 200

    except Exception:
        logger.exception(
            "BrewBot request processing failed."
        )

        return jsonify({
            "error": (
                "Unable to process "
                "your message right now."
            )
        }), 500


# ── HEALTH CHECK ────────────────────────────────────────────

@app.route(
    "/health",
    methods=["GET"]
)
def health():
    """
    Check the actual BrewBot service and database health.
    """
    database_ok = False
    nlp_ok = False

    try:
        database_ok = bool(
            check_db_health()
        )
    except Exception:
        logger.exception(
            "BrewBot database health check failed."
        )

    try:
        nlp_ok = callable(
            get_response
        )
    except Exception:
        logger.exception(
            "BrewBot NLP health check failed."
        )

    service_ok = (
        database_ok
        and nlp_ok
    )

    response = {
        "status": (
            "ok"
            if service_ok
            else "unavailable"
        ),
        "service": "CoffeeCape BrewBot",
        "mode": "NLP",
        "database": (
            "connected"
            if database_ok
            else "disconnected"
        ),
        "nlp": (
            "ready"
            if nlp_ok
            else "unavailable"
        )
    }

    return jsonify(
        response
    ), (
        200
        if service_ok
        else 503
    )


# ── ERROR HANDLERS ──────────────────────────────────────────

@app.errorhandler(413)
def request_too_large(error):
    return jsonify({
        "error": (
            "Request is too large."
        )
    }), 413


@app.errorhandler(404)
def not_found(error):
    return jsonify({
        "error": (
            "Endpoint not found."
        )
    }), 404


@app.errorhandler(405)
def method_not_allowed(error):
    return jsonify({
        "error": (
            "HTTP method not allowed."
        )
    }), 405


@app.errorhandler(500)
def internal_server_error(error):
    logger.exception(
        "Unhandled Flask server error."
    )

    return jsonify({
        "error": (
            "Internal server error."
        )
    }), 500


# ── APPLICATION START ──────────────────────────────────────

if __name__ == "__main__":
    logger.info(
        "CoffeeCape BrewBot starting..."
    )

    logger.info(
        "Host: %s",
        APP_HOST
    )

    logger.info(
        "Port: %s",
        APP_PORT
    )

    logger.info(
        "Debug: %s",
        DEBUG
    )

    app.run(
        host=APP_HOST,
        port=APP_PORT,
        debug=DEBUG
    )