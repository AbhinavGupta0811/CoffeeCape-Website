import os
import mysql.connector
from mysql.connector import pooling
from dotenv import load_dotenv

load_dotenv()

def _make_pool():
    required = ("DB_HOST", "DB_USER", "DB_NAME")
    if any(not os.getenv(key) for key in required):
        raise RuntimeError("Set DB_HOST, DB_USER and DB_NAME to enable live data")
    return pooling.MySQLConnectionPool(
        pool_name="brewbot_pool", pool_size=5, pool_reset_session=True,
        host=os.getenv("DB_HOST"), user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASS", ""), database=os.getenv("DB_NAME"),
        charset="utf8mb4", connection_timeout=5
    )

_db_pool = None


def get_connection():
    global _db_pool
    if _db_pool is None:
        _db_pool = _make_pool()
    return _db_pool.get_connection()


def check_db_health():
    connection = None
    cursor = None

    try:
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        return True

    except Exception as error:
        print(f"BrewBot database health check failed: {error}")
        return False

    finally:
        if cursor:
            cursor.close()

        if connection:
            connection.close()


def get_products():
    connection = None
    cursor = None

    try:
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute("""
            SELECT
                id,
                product_id,
                category,
                subcategory,
                name,
                description,
                price,
                offer_price,
                stock_qty,
                availability,
                badge,
                prep_time,
                rating,
                is_featured
            FROM products
            WHERE is_active = TRUE
            ORDER BY id DESC
        """)

        return cursor.fetchall()

    finally:
        if cursor:
            cursor.close()

        if connection:
            connection.close()


def get_event_settings():
    """
    Return live audience-event settings together with their booking details.

    event_settings.booking_id is linked to bookings.booking_id.
    This allows BrewBot to receive both event configuration and
    the actual scheduled booking information.
    """
    connection = None
    cursor = None

    try:
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute("""
            SELECT
                es.booking_id,
                es.audience_booking_enabled,
                es.audience_ticket_price,
                es.audience_capacity,
                es.audience_booked,
                b.event_type,
                b.event_date,
                b.event_time,
                b.status,
                b.payment_status
            FROM event_settings AS es
            INNER JOIN bookings AS b
                ON b.booking_id = es.booking_id
            WHERE b.event_date >= CURRENT_DATE()
              AND LOWER(b.status) NOT IN ('cancelled', 'completed')
            ORDER BY b.event_date ASC, b.event_time ASC, es.booking_id DESC
        """)

        return cursor.fetchall()

    except Exception as error:
        print(f"BrewBot event settings read failed: {error}")
        return []

    finally:
        if cursor:
            cursor.close()

        if connection:
            connection.close()


def get_event_setting(booking_id):
    """
    Return one audience-event setting together with its booking details.
    """
    connection = None
    cursor = None

    try:
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute("""
            SELECT
                es.booking_id,
                es.audience_booking_enabled,
                es.audience_ticket_price,
                es.audience_capacity,
                es.audience_booked,
                b.event_type,
                b.event_date,
                b.event_time,
                b.status,
                b.payment_status
            FROM event_settings AS es
            INNER JOIN bookings AS b
                ON b.booking_id = es.booking_id
            WHERE es.booking_id = %s
            LIMIT 1
        """, (booking_id,))

        return cursor.fetchone()

    except Exception as error:
        print(
            f"BrewBot event setting lookup failed "
            f"for booking {booking_id}: {error}"
        )
        return None

    finally:
        if cursor:
            cursor.close()

        if connection:
            connection.close()