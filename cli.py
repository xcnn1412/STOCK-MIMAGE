#!/usr/bin/env python3
"""
CLI Interface for Event Stock Management System
ระบบจัดการคลังสินค้างานอีเวนต์
"""
import sys
from stock_manager import StockManager


class StockCLI:
    """Command-line interface for stock management"""
    
    def __init__(self):
        self.manager = StockManager()
        self.manager.load_from_file()
    
    def print_menu(self):
        """Display main menu"""
        print("\n" + "="*60)
        print("ระบบจัดการคลังสินค้างานอีเวนต์")
        print("Event Stock Management System")
        print("="*60)
        print("\nStock Management:")
        print("  1. Add stock item")
        print("  2. View all stock items")
        print("  3. Update stock quantity")
        print("  4. View low stock items")
        print("  5. Remove stock item")
        print("\nEvent Management:")
        print("  6. Create event")
        print("  7. View all events")
        print("  8. Allocate stock to event")
        print("  9. Deallocate stock from event")
        print("  10. View event stock summary")
        print("\nOther:")
        print("  11. Save data")
        print("  0. Exit")
        print("="*60)
    
    def add_stock_item(self):
        """Add a new stock item"""
        print("\n--- Add Stock Item ---")
        item_id = input("Item ID: ").strip()
        name = input("Item Name: ").strip()
        quantity = int(input("Quantity: ").strip())
        category = input("Category: ").strip()
        unit = input("Unit (default: pieces): ").strip() or "pieces"
        
        try:
            item = self.manager.add_stock_item(item_id, name, quantity, category, unit)
            print(f"✓ Added: {item}")
        except ValueError as e:
            print(f"✗ Error: {e}")
    
    def view_stock_items(self):
        """View all stock items"""
        print("\n--- Stock Items ---")
        items = self.manager.list_stock_items()
        
        if not items:
            print("No stock items found.")
            return
        
        for item in items:
            print(f"  • {item}")
    
    def update_stock_quantity(self):
        """Update stock quantity"""
        print("\n--- Update Stock Quantity ---")
        item_id = input("Item ID: ").strip()
        amount = int(input("Amount (positive to add, negative to remove): ").strip())
        
        try:
            if self.manager.update_stock_quantity(item_id, amount):
                item = self.manager.get_stock_item(item_id)
                print(f"✓ Updated: {item}")
            else:
                print("✗ Item not found")
        except ValueError as e:
            print(f"✗ Error: {e}")
    
    def view_low_stock(self):
        """View low stock items"""
        print("\n--- Low Stock Items ---")
        threshold = int(input("Threshold (default: 10): ").strip() or "10")
        items = self.manager.get_low_stock_items(threshold)
        
        if not items:
            print("No low stock items.")
            return
        
        for item in items:
            print(f"  ⚠ {item}")
    
    def remove_stock_item(self):
        """Remove a stock item"""
        print("\n--- Remove Stock Item ---")
        item_id = input("Item ID: ").strip()
        
        if self.manager.remove_stock_item(item_id):
            print(f"✓ Removed item {item_id}")
        else:
            print("✗ Item not found")
    
    def create_event(self):
        """Create a new event"""
        print("\n--- Create Event ---")
        event_id = input("Event ID: ").strip()
        name = input("Event Name: ").strip()
        date = input("Date (YYYY-MM-DD): ").strip()
        location = input("Location: ").strip()
        
        try:
            event = self.manager.create_event(event_id, name, date, location)
            print(f"✓ Created: {event}")
        except ValueError as e:
            print(f"✗ Error: {e}")
    
    def view_events(self):
        """View all events"""
        print("\n--- Events ---")
        events = self.manager.list_events()
        
        if not events:
            print("No events found.")
            return
        
        for event in events:
            print(f"  • {event}")
            if event.stock_allocations:
                print(f"    Allocated items: {len(event.stock_allocations)}")
    
    def allocate_stock(self):
        """Allocate stock to event"""
        print("\n--- Allocate Stock to Event ---")
        event_id = input("Event ID: ").strip()
        item_id = input("Item ID: ").strip()
        quantity = int(input("Quantity: ").strip())
        
        try:
            if self.manager.allocate_stock_to_event(event_id, item_id, quantity):
                print(f"✓ Allocated {quantity} units of {item_id} to event {event_id}")
            else:
                print("✗ Event or item not found")
        except ValueError as e:
            print(f"✗ Error: {e}")
    
    def deallocate_stock(self):
        """Deallocate stock from event"""
        print("\n--- Deallocate Stock from Event ---")
        event_id = input("Event ID: ").strip()
        item_id = input("Item ID: ").strip()
        quantity = int(input("Quantity: ").strip())
        
        try:
            if self.manager.deallocate_stock_from_event(event_id, item_id, quantity):
                print(f"✓ Deallocated {quantity} units of {item_id} from event {event_id}")
            else:
                print("✗ Event or item not found")
        except ValueError as e:
            print(f"✗ Error: {e}")
    
    def view_event_summary(self):
        """View event stock summary"""
        print("\n--- Event Stock Summary ---")
        event_id = input("Event ID: ").strip()
        
        summary = self.manager.get_event_stock_summary(event_id)
        
        if not summary:
            print("✗ Event not found")
            return
        
        event = summary['event']
        print(f"\nEvent: {event['name']}")
        print(f"Date: {event['date']}")
        print(f"Location: {event['location']}")
        print(f"\nAllocated Stock:")
        
        if not summary['allocated_items']:
            print("  No items allocated")
        else:
            for item in summary['allocated_items']:
                print(f"  • {item['name']} ({item['item_id']}): {item['quantity']} {item['unit']}")
    
    def save_data(self):
        """Save data to file"""
        self.manager.save_to_file()
        print("\n✓ Data saved successfully")
    
    def run(self):
        """Run the CLI"""
        print("\nWelcome to Event Stock Management System!")
        
        while True:
            self.print_menu()
            
            try:
                choice = input("\nEnter your choice: ").strip()
                
                if choice == "1":
                    self.add_stock_item()
                elif choice == "2":
                    self.view_stock_items()
                elif choice == "3":
                    self.update_stock_quantity()
                elif choice == "4":
                    self.view_low_stock()
                elif choice == "5":
                    self.remove_stock_item()
                elif choice == "6":
                    self.create_event()
                elif choice == "7":
                    self.view_events()
                elif choice == "8":
                    self.allocate_stock()
                elif choice == "9":
                    self.deallocate_stock()
                elif choice == "10":
                    self.view_event_summary()
                elif choice == "11":
                    self.save_data()
                elif choice == "0":
                    self.save_data()
                    print("\nGoodbye!")
                    break
                else:
                    print("\n✗ Invalid choice. Please try again.")
            
            except KeyboardInterrupt:
                print("\n\nInterrupted by user.")
                self.save_data()
                break
            except Exception as e:
                print(f"\n✗ An error occurred: {e}")


if __name__ == "__main__":
    cli = StockCLI()
    cli.run()
