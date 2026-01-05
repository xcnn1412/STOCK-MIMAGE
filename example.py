#!/usr/bin/env python3
"""
Example usage of the Event Stock Management System
"""
from stock_manager import StockManager


def main():
    print("="*70)
    print("Event Stock Management System - Example")
    print("ระบบจัดการคลังสินค้างานอีเวนต์ - ตัวอย่าง")
    print("="*70)
    
    # Initialize manager
    manager = StockManager()
    
    # Add stock items
    print("\n1. Adding stock items...")
    manager.add_stock_item("CHAIR001", "เก้าอี้พับ / Folding Chair", 200, "Furniture", "pieces")
    manager.add_stock_item("TABLE001", "โต๊ะกลม / Round Table", 80, "Furniture", "pieces")
    manager.add_stock_item("MIC001", "ไมโครโฟน / Microphone", 25, "Audio Equipment", "pieces")
    manager.add_stock_item("PROJ001", "เครื่องฉาย / Projector", 15, "Visual Equipment", "pieces")
    manager.add_stock_item("SCREEN001", "จอภาพ / Screen", 15, "Visual Equipment", "pieces")
    print("✓ Added 5 stock items")
    
    # View all stock items
    print("\n2. Current Stock Inventory:")
    for item in manager.list_stock_items():
        print(f"   • {item}")
    
    # Create events
    print("\n3. Creating events...")
    manager.create_event("CONF2026", "งานประชุมเทคโนโลยี / Tech Conference 2026", 
                        "2026-03-15", "BITEC Bangkok")
    manager.create_event("WEDDING001", "งานแต่งงาน / Wedding Ceremony", 
                        "2026-04-20", "Grand Palace Hotel")
    print("✓ Created 2 events")
    
    # View all events
    print("\n4. Upcoming Events:")
    for event in manager.list_events():
        print(f"   • {event}")
    
    # Allocate stock to events
    print("\n5. Allocating stock to Tech Conference 2026...")
    manager.allocate_stock_to_event("CONF2026", "CHAIR001", 100)
    manager.allocate_stock_to_event("CONF2026", "TABLE001", 30)
    manager.allocate_stock_to_event("CONF2026", "MIC001", 10)
    manager.allocate_stock_to_event("CONF2026", "PROJ001", 5)
    manager.allocate_stock_to_event("CONF2026", "SCREEN001", 5)
    print("✓ Stock allocated to Tech Conference")
    
    print("\n6. Allocating stock to Wedding Ceremony...")
    manager.allocate_stock_to_event("WEDDING001", "CHAIR001", 50)
    manager.allocate_stock_to_event("WEDDING001", "TABLE001", 15)
    print("✓ Stock allocated to Wedding")
    
    # View event summaries
    print("\n7. Tech Conference Stock Summary:")
    summary = manager.get_event_stock_summary("CONF2026")
    print(f"   Event: {summary['event']['name']}")
    print(f"   Date: {summary['event']['date']}")
    print(f"   Location: {summary['event']['location']}")
    print(f"   Allocated Items:")
    for item in summary['allocated_items']:
        print(f"      • {item['name']}: {item['quantity']} {item['unit']}")
    
    # Check remaining stock
    print("\n8. Remaining Stock After Allocations:")
    for item in manager.list_stock_items():
        print(f"   • {item.name}: {item.quantity} {item.unit} remaining")
    
    # Check low stock
    print("\n9. Low Stock Alert (threshold: 20):")
    low_stock = manager.get_low_stock_items(threshold=20)
    if low_stock:
        for item in low_stock:
            print(f"   ⚠ {item}")
    else:
        print("   ✓ No low stock items")
    
    # Save data
    print("\n10. Saving data to file...")
    manager.save_to_file("example_stock_data.json")
    print("✓ Data saved to example_stock_data.json")
    
    print("\n" + "="*70)
    print("Example completed successfully!")
    print("Run 'python cli.py' to interact with the system")
    print("="*70)


if __name__ == "__main__":
    main()
