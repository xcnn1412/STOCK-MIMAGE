# STOCK-MIMAGE
ระบบจัดการคลังสินค้างานอีเวนต์ / Event Stock Management System

A comprehensive stock management system for events, allowing you to track inventory, manage stock items, and allocate resources to specific events.

## Features

- **Stock Item Management**: Add, update, remove, and view stock items
- **Inventory Tracking**: Track quantities, categories, and units
- **Event Management**: Create and manage events with dates and locations
- **Stock Allocation**: Allocate stock items to specific events
- **Low Stock Alerts**: Monitor items running low on quantity
- **Data Persistence**: Save and load data from JSON files
- **CLI Interface**: Easy-to-use command-line interface in Thai and English

## Installation

This system requires Python 3.7 or higher. No external dependencies are needed.

```bash
# Clone the repository
git clone https://github.com/xcnn1412/STOCK-MIMAGE.git
cd STOCK-MIMAGE

# Run the system
python cli.py
```

## Usage

### Command-Line Interface

Run the CLI to interact with the system:

```bash
python cli.py
```

The CLI provides the following options:

**Stock Management:**
1. Add stock item
2. View all stock items
3. Update stock quantity
4. View low stock items
5. Remove stock item

**Event Management:**
6. Create event
7. View all events
8. Allocate stock to event
9. Deallocate stock from event
10. View event stock summary

**Other:**
11. Save data
0. Exit

### Programmatic Usage

You can also use the system programmatically:

```python
from stock_manager import StockManager

# Initialize the manager
manager = StockManager()

# Add stock items
manager.add_stock_item("ITEM001", "Folding Chair", 100, "Furniture", "pieces")
manager.add_stock_item("ITEM002", "Round Table", 50, "Furniture", "pieces")
manager.add_stock_item("ITEM003", "Microphone", 20, "Audio Equipment", "pieces")

# Create an event
manager.create_event("EVENT001", "Annual Conference 2026", "2026-03-15", "Bangkok Convention Center")

# Allocate stock to event
manager.allocate_stock_to_event("EVENT001", "ITEM001", 50)
manager.allocate_stock_to_event("EVENT001", "ITEM002", 10)

# View event summary
summary = manager.get_event_stock_summary("EVENT001")
print(summary)

# Save data
manager.save_to_file("stock_data.json")
```

## File Structure

```
STOCK-MIMAGE/
├── models.py           # Data models (StockItem, Event)
├── stock_manager.py    # Core stock management logic
├── cli.py             # Command-line interface
├── requirements.txt   # Python dependencies
├── README.md         # This file
└── stock_data.json   # Data storage (created automatically)
```

## Data Models

### StockItem
- `item_id`: Unique identifier
- `name`: Item name
- `quantity`: Current quantity in stock
- `category`: Item category
- `unit`: Unit of measurement (pieces, boxes, etc.)
- `created_at`: Creation timestamp
- `updated_at`: Last update timestamp

### Event
- `event_id`: Unique identifier
- `name`: Event name
- `date`: Event date
- `location`: Event location
- `stock_allocations`: Dictionary of allocated items
- `created_at`: Creation timestamp

## Examples

### Example 1: Basic Inventory Management

```python
manager = StockManager()

# Add items
manager.add_stock_item("CHAIR001", "Plastic Chair", 200, "Furniture")
manager.add_stock_item("TABLE001", "Banquet Table", 80, "Furniture")

# Update quantities
manager.update_stock_quantity("CHAIR001", 50)  # Add 50 chairs
manager.update_stock_quantity("TABLE001", -10) # Remove 10 tables

# Check low stock
low_stock = manager.get_low_stock_items(threshold=20)
```

### Example 2: Event Stock Allocation

```python
# Create event
manager.create_event("CONF2026", "Tech Conference", "2026-06-01", "BITEC")

# Allocate stock
manager.allocate_stock_to_event("CONF2026", "CHAIR001", 100)
manager.allocate_stock_to_event("CONF2026", "TABLE001", 20)

# View summary
summary = manager.get_event_stock_summary("CONF2026")

# After event, return stock
manager.deallocate_stock_from_event("CONF2026", "CHAIR001", 100)
```

## License

MIT License

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
