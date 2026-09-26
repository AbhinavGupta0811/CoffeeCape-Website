import unittest
from unittest.mock import patch
import nlp_engine as engine

PRODUCTS = [
    {"name": "Cappuccino", "price": 150, "stock_qty": 3, "availability": "in_stock", "category": "Hot Beverages"},
    {"name": "Iced Latte", "price": 200, "stock_qty": 0, "availability": "out_of_stock", "category": "Cold Beverages"},
    {"name": "Cold Brew Coffee", "price": 180, "offer_price": 160, "stock_qty": 2,
     "availability": "in_stock", "category": "Cold Beverages"},
]

class ChatTests(unittest.TestCase):
    def test_live_menu_and_stock(self):
        with patch.object(engine, "get_products", return_value=PRODUCTS):
            self.assertIn("₹150", engine.get_response("How much is cappuccino?")["reply"])
            self.assertIn("currently unavailable", engine.get_response("Is iced latte available?")["reply"])
            menu = engine.get_response("Show cold drinks")["reply"]
            self.assertIn("Cold Brew Coffee", menu)
            self.assertNotIn("Iced Latte", menu)
            self.assertIn("₹160", menu)
            self.assertNotIn("₹150", engine.get_response("Price of brownie?")["reply"])

    def test_unavailable_database_never_claims_sample_prices(self):
        with patch.object(engine, "get_products", return_value=[]), patch.dict("os.environ", {"CHATBOT_USE_SAMPLE_DATA": "0"}):
            self.assertNotIn("₹150", engine.get_response("How much is cappuccino?")["reply"])
            self.assertIn("can’t", engine.get_response("Show desserts")["reply"])

    def test_customer_support_and_reservation(self):
        self.assertEqual(engine.get_response("Can I get a refund?")["intent"], "support")
        self.assertEqual(engine.get_response("Can I book a table tonight?")["intent"], "booking")
        self.assertEqual(engine.get_response("Do you have wifi?")["intent"], "amenities")

    def test_event_schedule_filters_old_bookings(self):
        with patch.object(engine, "get_event_settings", return_value=[
            {"booking_id": 3, "event_type": "karaoke", "event_date": "2020-01-01", "status": "confirmed"}
        ]):
            reply = engine.get_response("Any karaoke events?")["reply"]
            self.assertNotIn("Booking #3", reply)
            self.assertNotIn("2020", reply)

if __name__ == "__main__":
    unittest.main()
