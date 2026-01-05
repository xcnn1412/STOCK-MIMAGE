"""
Stock Manager for Event Stock Management System
"""
import json
from typing import Optional, List, Dict
from models import StockItem, Event


class StockManager:
    """Manages stock items and events"""
    
    def __init__(self):
        self.stock_items: Dict[str, StockItem] = {}
        self.events: Dict[str, Event] = {}
    
    # Stock Item Management
    def add_stock_item(self, item_id: str, name: str, quantity: int, 
                      category: str, unit: str = "pieces") -> StockItem:
        """Add a new stock item"""
        if item_id in self.stock_items:
            raise ValueError(f"Item with ID {item_id} already exists")
        
        item = StockItem(item_id, name, quantity, category, unit)
        self.stock_items[item_id] = item
        return item
    
    def get_stock_item(self, item_id: str) -> Optional[StockItem]:
        """Get a stock item by ID"""
        return self.stock_items.get(item_id)
    
    def update_stock_quantity(self, item_id: str, amount: int) -> bool:
        """Update stock quantity (positive to add, negative to remove)"""
        item = self.get_stock_item(item_id)
        if not item:
            return False
        
        if item.quantity + amount < 0:
            raise ValueError(f"Insufficient stock. Current: {item.quantity}, Requested: {-amount}")
        
        item.update_quantity(amount)
        return True
    
    def remove_stock_item(self, item_id: str) -> bool:
        """Remove a stock item"""
        if item_id in self.stock_items:
            del self.stock_items[item_id]
            return True
        return False
    
    def list_stock_items(self, category: Optional[str] = None) -> List[StockItem]:
        """List all stock items, optionally filtered by category"""
        items = list(self.stock_items.values())
        if category:
            items = [item for item in items if item.category == category]
        return items
    
    def get_low_stock_items(self, threshold: int = 10) -> List[StockItem]:
        """Get items with quantity below threshold"""
        return [item for item in self.stock_items.values() 
                if item.quantity < threshold]
    
    # Event Management
    def create_event(self, event_id: str, name: str, date: str, location: str) -> Event:
        """Create a new event"""
        if event_id in self.events:
            raise ValueError(f"Event with ID {event_id} already exists")
        
        event = Event(event_id, name, date, location)
        self.events[event_id] = event
        return event
    
    def get_event(self, event_id: str) -> Optional[Event]:
        """Get an event by ID"""
        return self.events.get(event_id)
    
    def list_events(self) -> List[Event]:
        """List all events"""
        return list(self.events.values())
    
    def allocate_stock_to_event(self, event_id: str, item_id: str, quantity: int) -> bool:
        """Allocate stock to an event"""
        event = self.get_event(event_id)
        item = self.get_stock_item(item_id)
        
        if not event or not item:
            return False
        
        if item.quantity < quantity:
            raise ValueError(f"Insufficient stock for {item.name}. Available: {item.quantity}")
        
        # Reduce from main stock and allocate to event
        item.update_quantity(-quantity)
        event.allocate_stock(item_id, quantity)
        return True
    
    def deallocate_stock_from_event(self, event_id: str, item_id: str, quantity: int) -> bool:
        """Deallocate stock from an event (return to main stock)"""
        event = self.get_event(event_id)
        item = self.get_stock_item(item_id)
        
        if not event or not item:
            return False
        
        # Return to main stock and deallocate from event
        # The event.deallocate_stock will handle validation and raise ValueError if needed
        item.update_quantity(quantity)
        event.deallocate_stock(item_id, quantity)
        return True
    
    def get_event_stock_summary(self, event_id: str) -> Dict:
        """Get stock summary for an event"""
        event = self.get_event(event_id)
        if not event:
            return {}
        
        summary = {
            'event': event.to_dict(),
            'allocated_items': []
        }
        
        for item_id, quantity in event.stock_allocations.items():
            item = self.get_stock_item(item_id)
            if item:
                summary['allocated_items'].append({
                    'item_id': item_id,
                    'name': item.name,
                    'quantity': quantity,
                    'unit': item.unit
                })
        
        return summary
    
    # Persistence
    def save_to_file(self, filename: str = "stock_data.json"):
        """Save stock data to JSON file"""
        data = {
            'stock_items': {item_id: item.to_dict() 
                           for item_id, item in self.stock_items.items()},
            'events': {event_id: event.to_dict() 
                      for event_id, event in self.events.items()}
        }
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    
    def load_from_file(self, filename: str = "stock_data.json"):
        """Load stock data from JSON file"""
        try:
            from datetime import datetime
            
            with open(filename, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Load stock items
            for item_id, item_data in data.get('stock_items', {}).items():
                item = self.add_stock_item(
                    item_id, 
                    item_data['name'],
                    item_data['quantity'],
                    item_data['category'],
                    item_data.get('unit', 'pieces')
                )
                # Restore timestamps if available
                if 'created_at' in item_data:
                    item.created_at = datetime.fromisoformat(item_data['created_at'])
                if 'updated_at' in item_data:
                    item.updated_at = datetime.fromisoformat(item_data['updated_at'])
            
            # Load events
            for event_id, event_data in data.get('events', {}).items():
                event = self.create_event(
                    event_id,
                    event_data['name'],
                    event_data['date'],
                    event_data['location']
                )
                event.stock_allocations = event_data.get('stock_allocations', {})
                # Restore timestamp if available
                if 'created_at' in event_data:
                    event.created_at = datetime.fromisoformat(event_data['created_at'])
            
            return True
        except FileNotFoundError:
            return False
